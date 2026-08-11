/**
 * HTTP Server for Sequentum MCP
 *
 * Implements the stateless Streamable HTTP transport for Claude Connectors.
 * Handles OAuth2 discovery, CORS, rate limiting, and graceful shutdown; the
 * protocol itself is served per-request by the handler in mcp-handler.ts, so
 * there is no session state on this server at all.
 */

import { toNodeHandler } from "@modelcontextprotocol/node";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { buildAuthChallenge, buildOAuthMetadata, SUPPORTED_SCOPES } from "../utils/oauth-metadata.js";
import { buildAllowedOrigins, isAllowedOrigin } from "./cors.js";
import { MCP_RATE_LIMIT_MAX, MCP_RATE_LIMIT_WINDOW_MS, RATE_LIMIT_ERROR_CODE } from "./constants.js";
import { createSequentumMcpHandler } from "./mcp-handler.js";

const DEBUG = process.env.DEBUG === '1';

/**
 * One instance per `startHttpServer` call still running in this process.
 * Backs the single, process-wide SIGTERM/SIGINT registration below so
 * repeated calls (every integration test's `beforeEach`) do not each add
 * their own `process.on(...)` listener with no way to remove it — that used
 * to leak one live listener per call and would eventually trip Node's
 * MaxListenersExceededWarning (default threshold: 10). Each entry removes
 * itself when its own `httpServer` closes, so the registry does not grow
 * across a test file's lifetime either.
 */
interface HttpServerInstance {
  httpServer: import("node:http").Server;
  mcpHandler: { close(): Promise<void> };
}
const activeInstances = new Set<HttpServerInstance>();
let signalHandlersInstalled = false;

/**
 * Register the process's SIGTERM/SIGINT handlers exactly once, no matter how
 * many times `startHttpServer` is called. On signal, gracefully shuts down
 * every instance currently tracked in {@link activeInstances} (in production
 * there is exactly one) and then exits — preserving the original
 * one-signal-one-shutdown behaviour while fixing the listener leak.
 */
function installSignalHandlersOnce(): void {
  if (signalHandlersInstalled) return;
  signalHandlersInstalled = true;

  let isShuttingDown = false;
  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return; // Prevent double-shutdown
    isShuttingDown = true;

    console.error(`\n[MCP] ${signal} received, shutting down gracefully...`);

    // Force exit after 10 seconds if cleanup hangs
    const forceExitTimer = setTimeout(() => {
      console.error("[MCP] Graceful shutdown timed out after 10s, forcing exit");
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    await Promise.all(
      Array.from(activeInstances).map(async ({ httpServer, mcpHandler }) => {
        // Stop accepting new connections.
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
        console.error("[MCP] HTTP server closed, no longer accepting connections");

        // Abort in-flight MCP exchanges and close their per-request instances.
        // There is no session table to drain — this single call replaces the old
        // per-session close loop.
        try {
          await mcpHandler.close();
        } catch (err) {
          console.error("[MCP] Error closing the MCP handler:", err);
        }
      })
    );

    console.error("[MCP] MCP handler closed. Shutdown complete.");
    process.exit(0);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

/**
 * Extract Bearer token from the Authorization header, or return null.
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
}

/**
 * Return the MCP server's own canonical origin as observed for this request.
 * Honors X-Forwarded-Proto via Express's `trust proxy` setting.
 */
function getMcpServerOrigin(req: Request): string {
  return new URL(`${req.protocol}://${req.get("host")}`).origin;
}

/**
 * Send a spec-compliant 401 with the RFC 9728 WWW-Authenticate challenge.
 * Centralizes the header + body pair so a third 401 callsite cannot drift.
 */
function sendAuthChallenge(req: Request, res: Response): void {
  const challenge = buildAuthChallenge(getMcpServerOrigin(req));
  res.setHeader("WWW-Authenticate", challenge.wwwAuthenticate);
  res.status(401).json(challenge.body);
}

/**
 * Express error-handling middleware (4-arg signature) for the /mcp routes.
 * Returns a sanitized JSON-RPC error object (code -32603) instead of letting
 * the error fall through to Express's default HTML error page.
 *
 * Without this, a thrown/rejected error from `nodeHandler(req, res)` falls
 * through to Express's default handler, which answers with an HTML error
 * page instead of JSON-RPC. In practice this is rarely reached — the SDK's
 * own fetch face already catches nearly everything internally and answers
 * with a JSON-RPC 500 itself, and the Dockerfile hardcodes
 * NODE_ENV=production so stack traces are suppressed there regardless — but
 * a non-Docker run (plain `node dist/index.js`) has neither protection, so
 * this is the fallback for whatever gets past both. Never leaks the error
 * message when NODE_ENV=production.
 *
 * Exported so tests can invoke it directly with a mock Response rather than
 * needing to force a real rejection through the full HTTP stack.
 */
export function jsonRpcErrorMiddleware(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    // A partial response (e.g. mid-stream) cannot be redone as a fresh JSON
    // body; hand off to Express's default handler, which just ends the
    // connection in that case rather than attempting a second, malformed write.
    next(err);
    return;
  }
  console.error("[MCP] Unhandled error on /mcp:", err);
  const isProduction = process.env.NODE_ENV === "production";
  const message = !isProduction && err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({
    jsonrpc: "2.0",
    error: { code: -32603, message },
    id: null,
  });
}

/**
 * Parse TRUST_PROXY into the value Express's `app.set("trust proxy", ...)`
 * expects: a boolean, a hop count, or a comma-separated CIDR/IP allowlist
 * (which Express accepts as a plain string). Defaults to `true` — identical
 * behaviour to the previous boolean-only `!== "false"` check when the env
 * var is unset.
 *
 * KNOWN WEAKNESS at the default: `trust proxy: true` trusts every hop, so
 * Express resolves `req.ip` to the client-supplied leftmost X-Forwarded-For
 * entry. Because the rate limiter keys on `req.ip`, a client that simply
 * rotates that header can evade it entirely. The remediation is to set
 * TRUST_PROXY to the exact number of trusted reverse-proxy hops (e.g. "1")
 * or to a comma-separated CIDR/IP list of the trusted proxies — but the
 * correct value depends on deployment topology this repository does not
 * know, so it is deliberately NOT the default here.
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (raw === undefined || raw === "true") return true;
  if (raw === "false") return false;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return raw;
}

/**
 * Handler for GET /.well-known/openai-apps-challenge (ChatGPT App domain verification).
 * Returns the token from OPENAI_APPS_CHALLENGE_TOKEN as text/plain (200), or 404 if unset.
 * Exported so tests can import the real handler rather than duplicating it.
 */
export function handleOpenAIChallenge(_req: Request, res: Response): void {
  const token = process.env.OPENAI_APPS_CHALLENGE_TOKEN;
  if (!token) {
    res.status(404).end();
    return;
  }
  res.type("text/plain").send(token);
}

/**
 * Start the MCP server in HTTP mode (for Claude Connectors).
 *
 * Uses the stateless Streamable HTTP transport: a fresh McpServer and API
 * client are built for every request, so the process holds no per-client state
 * and any instance can serve any request.
 *
 * Returns the listening http.Server so callers (and tests) can bind port 0 and
 * close it deterministically.
 */
export async function startHttpServer(
  apiBaseUrl: string,
  version: string,
  httpPort: number,
  httpHost: string
): Promise<import("node:http").Server> {
  const app = express();

  // Trust X-Forwarded-Proto from reverse proxies (cloudflared, ngrok, etc.)
  // This ensures req.protocol returns 'https' when behind a TLS-terminating proxy.
  // See parseTrustProxy's doc comment for the req.ip / rate-limiter evasion risk
  // at the default and how to remediate it (hop count or CIDR/IP allowlist).
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

  // Deliberately NO express.json(). toNodeHandler reads the raw request stream;
  // a body parser drains it first and every /mcp request fails with -32700
  // Parse error. /mcp was this app's only body-carrying route — /health and all
  // three /.well-known/* routes are GETs — so the parser is removed outright
  // rather than reordered.

  const ALLOWED_ORIGINS = buildAllowedOrigins(process.env, DEBUG);

  // CORS middleware - required for browser-based clients like MCP Inspector.
  // Reflects allowlisted origins; blocks /mcp requests from non-allowlisted browser origins.
  app.use((req: Request, res: Response, next) => {
    // We consult the Origin header on every request to decide what CORS headers
    // to set, so every response varies by Origin.  Setting Vary unconditionally
    // prevents intermediate caches (CDN, proxy) from serving a response cached
    // for one origin to a different origin.  res.vary() appends and dedupes, so
    // it is safe even if another middleware also sets Vary.
    res.vary("Origin");

    const origin = req.headers.origin;

    if (origin) {
      if (isAllowedOrigin(origin, ALLOWED_ORIGINS)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      } else if ((req.path === "/mcp" || req.path.startsWith("/mcp/")) && req.method !== "OPTIONS") {
        // Reject MCP requests from non-allowlisted browser origins.
        // OPTIONS preflights are handled below (browser will block the actual request).
        res.status(403).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Forbidden: origin not allowed" },
          id: null,
        });
        return;
      }
    }

    // Mcp-Method and Mcp-Name are mandatory on name-carrying 2026-07-28 requests
    // (tools/call, prompts/get, resources/read). A browser client that cannot
    // send them fails -32020 before any handler runs, so they must be
    // allowlisted here. There is no session id to allow or expose any more.
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Authorization, Mcp-Method, Mcp-Name, Mcp-Protocol-Version"
    );

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Rate limiting middleware — protects the MCP server from being flooded.
  // Applied to /mcp endpoints only (health, well-known are not rate-limited).
  //
  // Per-process, per-IP. With no session affinity a client's requests spread
  // across pods, so the cluster-wide ceiling is (pod count x max). Divide
  // MCP_RATE_LIMIT_MAX by the replica count to hold a given global rate.
  // Intentionally not backed by a shared store: that would restore the
  // cross-request state this migration removed.
  const mcpRateLimiter = rateLimit({
    windowMs: MCP_RATE_LIMIT_WINDOW_MS,
    max: MCP_RATE_LIMIT_MAX,
    standardHeaders: true,       // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,
    message: {
      jsonrpc: "2.0",
      error: { code: RATE_LIMIT_ERROR_CODE, message: "Too many requests. Please slow down." },
      id: null,
    },
  });
  app.use("/mcp", mcpRateLimiter);

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", version, transport: "streamable-http" });
  });

  // OAuth2 Authorization Server Metadata (RFC 8414)
  // This enables MCP clients to discover OAuth2 endpoints automatically
  // OAuth URLs are derived from the API base URL (same server hosts both API and OAuth)
  
  // RFC 8414 standard path - Authorization Server Metadata
  app.get("/.well-known/oauth-authorization-server", (_req: Request, res: Response) => {
    const metadata = buildOAuthMetadata(apiBaseUrl);
    res.json(metadata);
  });

  // RFC 9728 - Protected Resource Metadata (required by MCP spec 2025-06-18)
  // This tells MCP clients which authorization server to use for this resource.
  // Per MCP spec, the resource MUST be the MCP server's own canonical URL,
  // as MCP clients compute the expected resource from the URL they connect to.
  app.get("/.well-known/oauth-protected-resource", async (req: Request, res: Response) => {
    // The resource is this MCP server's own URL (origin)
    // MCP clients (e.g., Cursor) validate this matches the URL they connected to
    const resourceUrl = getMcpServerOrigin(req);

    const protectedResourceMetadata = {
      // The canonical URI of this MCP server (the protected resource)
      resource: resourceUrl,
      // Authorization servers that can issue tokens for this resource
      authorization_servers: [apiBaseUrl],
      // Scopes supported by this resource
      scopes_supported: [...SUPPORTED_SCOPES],
      // Bearer token is required
      bearer_methods_supported: ["header"],
    };

    res.json(protectedResourceMetadata);
  });

  // OpenAI domain verification endpoint (ChatGPT Apps submission)
  // No auth required — must be publicly reachable by OpenAI's verifier.
  // Set OPENAI_APPS_CHALLENGE_TOKEN before clicking "Verify Domain" on the submission form.
  app.get("/.well-known/openai-apps-challenge", handleOpenAIChallenge);

  // Log incoming requests for debugging (only when DEBUG is enabled)
  if (DEBUG) {
    app.use("/mcp", (req: Request, _res: Response, next) => {
      console.error(`[MCP] ${req.method} ${req.url}`);
      
      // Redact sensitive headers before logging
      const safeHeaders = { ...req.headers };
      const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
      for (const header of sensitiveHeaders) {
        if (safeHeaders[header]) {
          safeHeaders[header] = '[REDACTED]';
        }
      }
      console.error(`[MCP] Headers: ${JSON.stringify(safeHeaders)}`);

      // No body line: there is no body parser, so req.body does not exist and
      // reading the stream here would starve the MCP handler.
      next();
    });
  }

  // The stateless protocol handler: one McpServer and one API client per
  // request. Any `Mcp-Session-Id` a mid-flight client still sends is ignored by
  // construction, so a rolling deploy does not break in-progress clients.
  const mcpHandler = createSequentumMcpHandler(apiBaseUrl, version);
  const nodeHandler = toNodeHandler(mcpHandler);

  // Handle POST requests for client-to-server messages
  app.post("/mcp", (req: Request, res: Response, next) => {
    // Require authentication (unless REQUIRE_AUTH=false for testing). The 401 +
    // RFC 9728 WWW-Authenticate challenge is how directory probers and
    // spec-conformant clients discover this resource's authorization server.
    const requireAuth = process.env.REQUIRE_AUTH !== "false";
    const token = extractBearerToken(req);
    if (DEBUG && token) {
      console.error("[DEBUG] Bearer token received");
    }
    if (requireAuth && !token) {
      sendAuthChallenge(req, res);
      console.error("[MCP] 401 - Authentication required, no Bearer token provided");
      return;
    }
    void nodeHandler(req, res).catch(next);
  });

  // Kept as a no-op 200: clients send DELETE on disconnect and the SDK would
  // answer 405. There is no session to terminate on a stateless server, and a
  // 200 keeps client logs clean.
  app.delete("/mcp", (_req: Request, res: Response) => {
    res.status(200).json({ message: "No session to terminate (stateless server)" });
  });

  // GET keeps the same auth gate as POST so an unauthenticated probe still gets
  // the RFC 9728 401 + WWW-Authenticate challenge — that is how directory
  // probers (Glama, MCP Inspector) and spec-conformant clients discover this
  // resource's authorization server, and answering 405 first would silently
  // remove that discovery signal. An authenticated GET is delegated to the
  // handler, which answers 405 Method not allowed: the standalone SSE stream
  // was a session construct and no longer exists.
  app.get("/mcp", (req: Request, res: Response, next) => {
    const requireAuth = process.env.REQUIRE_AUTH !== "false";
    if (requireAuth && !extractBearerToken(req)) {
      sendAuthChallenge(req, res);
      return;
    }
    void nodeHandler(req, res).catch(next);
  });

  // Error middleware — catches whatever the /mcp routes' `.catch(next)` forwards
  // (a rejected nodeHandler(...) call). Must be mounted after every route
  // (Express matches error middleware by position, not path).
  app.use(jsonRpcErrorMiddleware);

  // Start the HTTP server
  const httpServer = app.listen(httpPort, httpHost, () => {
    const { port } = (httpServer.address() as { port: number } | null) ?? { port: httpPort };
    console.error(
      `Sequentum MCP Server running on HTTP at http://${httpHost}:${port}/mcp ` +
      `(transport=streamable-http, stateless, health=http://${httpHost}:${port}/health)`
    );
    if (DEBUG) {
      console.error(`Connected to: ${apiBaseUrl}`);
    }
  });

  // Graceful shutdown — tears down in-flight MCP exchanges and stops accepting
  // connections for a clean process exit on SIGTERM/SIGINT (important for
  // Docker/K8s deployments). The actual process.on(...) registration happens
  // at most once per process (see installSignalHandlersOnce); this instance
  // just registers itself so that single handler knows to shut it down too.
  const instance: HttpServerInstance = { httpServer, mcpHandler };
  activeInstances.add(instance);
  httpServer.on("close", () => activeInstances.delete(instance));
  installSignalHandlersOnce();

  // Resolve only once the socket is actually bound, so callers can read
  // server.address() (port 0 in tests) immediately after awaiting.
  await new Promise<void>((resolve, reject) => {
    if (httpServer.listening) {
      resolve();
      return;
    }
    const onListening = () => {
      httpServer.off("error", onError);
      resolve();
    };
    const onError = (err: Error) => {
      httpServer.off("listening", onListening);
      reject(err);
    };
    httpServer.once("listening", onListening);
    httpServer.once("error", onError);
  });

  return httpServer;
}
