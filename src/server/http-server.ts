/**
 * HTTP Server for Sequentum MCP
 *
 * Implements the Streamable HTTP transport for Claude Connectors.
 * Handles session management, OAuth2 discovery, rate limiting, and graceful shutdown.
 */

import { randomUUID } from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { SequentumApiClient } from "../api/api-client.js";
import { createMcpServer } from "./handlers.js";
import { buildOAuthMetadata, SUPPORTED_SCOPES } from "../utils/oauth-metadata.js";

const DEBUG = process.env.DEBUG === '1';

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
 * Session data for HTTP mode - stores server and transport per session
 */
interface HttpSession {
  server: Server;
  transport: StreamableHTTPServerTransport;
  apiClient: SequentumApiClient;
  createdAt: number;
  lastActivityAt: number;
}

/**
 * Start the MCP server in HTTP mode (for Claude Connectors)
 * Uses Streamable HTTP transport as required by Claude Connectors Directory
 * Creates a new Server instance per session for proper isolation.
 */
export async function startHttpServer(
  apiBaseUrl: string,
  version: string,
  httpPort: number,
  httpHost: string
): Promise<void> {
  const app = express();
  
  // Trust X-Forwarded-Proto from reverse proxies (cloudflared, ngrok, etc.)
  // This ensures req.protocol returns 'https' when behind a TLS-terminating proxy
  // WARNING: Only safe if direct access to this server is blocked at the network level
  app.set('trust proxy', process.env.TRUST_PROXY !== 'false');
  
  // Parse JSON bodies
  app.use(express.json());

  // CORS middleware - required for browser-based clients like MCP Inspector
  app.use((req: Request, res: Response, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, mcp-session-id");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
    
    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Rate limiting middleware — protects the MCP server from being flooded.
  // Applied to /mcp endpoints only (health, well-known are not rate-limited).
  const mcpRateLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1-minute window
    max: 100,                    // max 100 requests per window per IP
    standardHeaders: true,       // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,
    message: {
      jsonrpc: "2.0",
      error: { code: -32029, message: "Too many requests. Please slow down." },
      id: null,
    },
  });
  app.use("/mcp", mcpRateLimiter);

  // Store sessions by session ID - each session has its own server, transport, and API client
  const sessions = new Map<string, HttpSession>();

  // Maximum number of concurrent sessions to prevent memory exhaustion
  const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || "1000", 10);

  // Clean up stale sessions every 15 minutes
  // Sessions are removed if they haven't had activity in over 1 hour
  const SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
  const SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  
  const cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [sessionId, session] of sessions) {
      if (now - session.lastActivityAt > SESSION_MAX_AGE_MS) {
        sessions.delete(sessionId);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0 || DEBUG) {
      console.error(`[MCP] Session cleanup: removed ${cleanedCount} stale sessions, ${sessions.size} active`);
    }
  }, SESSION_CLEANUP_INTERVAL_MS);
  cleanupIntervalId.unref();

  /**
   * Create a new HTTP session with MCP server, transport, and API client
   */
  async function createSession(token: string | null): Promise<HttpSession> {
    const sessionApiClient = new SequentumApiClient(apiBaseUrl, null);
    if (token) {
      sessionApiClient.setAccessToken(token);
    }
    
    const server = createMcpServer(sessionApiClient, version);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    
    await server.connect(transport);
    
    const now = Date.now();
    return { 
      server, 
      transport, 
      apiClient: sessionApiClient, 
      createdAt: now, 
      lastActivityAt: now 
    };
  }

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
    const resourceUrl = new URL(`${req.protocol}://${req.get("host")}`).origin;
    
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
      
      if (req.body && Object.keys(req.body).length > 0) {
        console.error(`[MCP] Body: ${JSON.stringify(req.body)}`);
      }
      next();
    });
  }

  // Handle POST requests for client-to-server messages
  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      // Get session ID from header
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let session: HttpSession | undefined;

      if (sessionId) {
        session = sessions.get(sessionId);
      }

      // If no existing session, create a new one
      if (!session) {
        const token = extractBearerToken(req);
        if (DEBUG && token) {
          console.error("[DEBUG] Bearer token received for new session");
        }

        // Require authentication for new sessions (unless REQUIRE_AUTH=false for testing)
        const requireAuth = process.env.REQUIRE_AUTH !== "false";
        if (requireAuth && !token) {
          // Return 401 with WWW-Authenticate header per RFC 9728 Section 5.1
          // The resource is this MCP server's own URL (the protected resource)
          const mcpServerUrl = new URL(`${req.protocol}://${req.get("host")}`).origin;
          const wwwAuth = `Bearer resource="${mcpServerUrl}"`;
          const prmUrl = `${mcpServerUrl}/.well-known/oauth-protected-resource`;
          res.setHeader("WWW-Authenticate", wwwAuth);
          const responseBody = {
            jsonrpc: "2.0",
            error: {
              code: -32001,
              message: "Authentication required",
              data: {
                // Point to Protected Resource Metadata on this MCP server
                protectedResourceMetadata: prmUrl,
              },
            },
            id: null,
          };
          res.status(401).json(responseBody);
          console.error("[MCP] 401 - Authentication required, no Bearer token provided");
          return;
        }

        // Reject if at session capacity to prevent memory exhaustion
        if (sessions.size >= MAX_SESSIONS) {
          res.status(503).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Server at capacity. Please try again later." },
            id: null,
          });
          console.error(`[MCP] 503 - Session limit reached (${MAX_SESSIONS}), rejecting new session`);
          return;
        }

        // Create session with MCP server, transport, and API client
        session = await createSession(token);
        
        // We'll store the session after handleRequest sets the session ID
      }

      // Update last activity timestamp for session keep-alive
      session.lastActivityAt = Date.now();

      // Update token if provided (in case of token refresh)
      const refreshedToken = extractBearerToken(req);
      if (refreshedToken) {
        session.apiClient.setAccessToken(refreshedToken);
      }

      // Handle the request
      await session.transport.handleRequest(req, res, req.body);
      
      // Store session if it's new (get session ID from response header)
      if (!sessionId) {
        const newSessionId = res.getHeader("mcp-session-id") as string;
        if (newSessionId && !sessions.has(newSessionId)) {
          sessions.set(newSessionId, session);
        } else if (!newSessionId) {
          // Cleanup orphaned session to prevent memory leaks
          // This can happen if handleRequest fails to set a session ID
          console.error(`[MCP] Warning: No session ID returned, cleaning up orphaned session`);
          try {
            await session.server.close();
          } catch (closeError) {
            console.error(`[MCP] Error closing orphaned session:`, closeError);
          }
        }
      }

    } catch (error) {
      console.error("Error handling MCP POST request:", error);
      if (!res.headersSent) {
        // Sanitize error messages in production to avoid exposing internal details
        const errorMessage = DEBUG 
          ? (error instanceof Error ? error.message : "Internal server error")
          : "Internal server error";
        res.status(500).json({ 
          jsonrpc: "2.0",
          error: { 
            code: -32603, 
            message: errorMessage
          },
          id: null
        });
      }
    }
  });

  // Handle GET requests for SSE streams
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    
    if (!sessionId) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Missing session ID for SSE stream" },
        id: null
      });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or expired session" },
        id: null
      });
      return;
    }

    // Update last activity timestamp for session keep-alive
    session.lastActivityAt = Date.now();

    try {
      await session.transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP GET request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "SSE stream error" },
          id: null
        });
      }
    }
  });

  // Handle DELETE requests for session termination
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      sessions.delete(sessionId);
      try {
        await session?.server.close();
      } catch (e) {
        if (DEBUG) {
          console.error(`[DEBUG] Error closing session on DELETE:`, e);
        }
      }
      if (DEBUG) {
        console.error(`[DEBUG] Session terminated: ${sessionId}`);
      }
    }
    
    res.status(200).json({ message: "Session terminated" });
  });

  // Start the HTTP server
  const httpServer = app.listen(httpPort, httpHost, () => {
    console.error(`Sequentum MCP Server running on HTTP`);
    console.error(`  URL: http://${httpHost}:${httpPort}/mcp`);
    console.error(`  Transport: Streamable HTTP`);
    console.error(`  Connected to: ${apiBaseUrl}`);
    console.error(`  Health check: http://${httpHost}:${httpPort}/health`);
    console.error(`  Max sessions: ${MAX_SESSIONS}`);
  });

  // Graceful shutdown handler — closes all sessions, stops accepting
  // connections, and clears the cleanup interval for a clean process exit.
  // Important for Docker/K8s deployments where pods receive SIGTERM.
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

    // Stop accepting new connections
    httpServer.close(() => {
      console.error("[MCP] HTTP server closed, no longer accepting connections");
    });

    // Clear the session cleanup interval so it doesn't keep the process alive
    clearInterval(cleanupIntervalId);

    // Close all active MCP sessions
    const closePromises: Promise<void>[] = [];
    for (const [sessionId, session] of sessions) {
      closePromises.push(
        session.server.close().catch((err) =>
          console.error(`[MCP] Error closing session ${sessionId}:`, err)
        )
      );
    }
    await Promise.allSettled(closePromises);
    sessions.clear();

    console.error(`[MCP] All ${closePromises.length} sessions closed. Shutdown complete.`);
    process.exit(0);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}
