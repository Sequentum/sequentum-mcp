/**
 * Protocol seam for the Sequentum MCP server.
 *
 * Owns createMcpHandler and the per-request McpServer factory. Deliberately free
 * of Express so the protocol surface can be tested via handler.fetch() without
 * binding a socket.
 */
import {
  createMcpHandler,
  TRACEPARENT_META_KEY,
  TRACESTATE_META_KEY,
  type McpHttpHandler,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
import { SequentumApiClient } from "../api/api-client.js";
import { createMcpServer } from "./handlers.js";

/** Extract a Bearer token from a Web-standard Request, or null. */
function bearerFrom(request: Request | undefined): string | null {
  const header = request?.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

/** Bound on any attacker-controlled field placed in the era log line — see {@link loggable}. */
const MAX_LOGGED_FIELD_LENGTH = 200;

/**
 * Truncate and JSON-quote an attacker-controlled header value before it goes
 * into the era log line (see {@link logEraLine}). `client=`, `method=`,
 * `name=`, `traceparent=`, and `tracestate=` are all raw request-header
 * values fully controlled by the caller. Interpolated unescaped in the
 * middle of a space-delimited line, a header like
 * `User-Agent: evil client=fake auth=present` would forge extra key=value
 * tokens for a naive `split(" ")` / `split("=")` parser — no CR/LF needed,
 * and this line is unconditional, so it is attacker-reachable on every
 * request. `JSON.stringify` escapes quotes, backslashes, and control
 * characters and wraps the result in `"..."`, so the value is unambiguously
 * delimited no matter what it contains; truncating first bounds how much of
 * an oversized header value ever reaches the log.
 *
 * `era=` and `auth=` are NOT passed through this: they are fixed,
 * server-chosen enums, not attacker input, so quoting them would only churn
 * the format for no gain.
 */
function loggable(value: string): string {
  return JSON.stringify(value.slice(0, MAX_LOGGED_FIELD_LENGTH));
}

/**
 * Log one compact line per request to stderr: negotiated era, the requested
 * method/name, client identity, auth presence, and OTel trace context when
 * the caller sent it.
 *
 * Format (bracketed segments are omitted, not emitted empty, when the
 * source header is absent):
 *
 *   [MCP] era=<legacy|modern>[ method=<q>][ name=<q>] client=<q> auth=<present|absent>[ traceparent=<q>][ tracestate=<q>]
 *
 * `<q>` denotes a value run through {@link loggable} (JSON-quoted,
 * length-bounded); `era`/`auth` are bare enums. Keep the field order and
 * quoting stable — this line is meant to be machine-parseable.
 *
 * Unconditional (not DEBUG-gated): the Connectors Directory dashboard never
 * reports negotiated protocol era, and its own tool-call/error/latency
 * metrics lag up to 24h and drop low-volume windows. This line is the only
 * way to answer "have clients started using 2026-07-28, and did anything
 * break for legacy ones?" Volume is bounded by the existing per-IP rate limit.
 *
 * The factory sees headers only, not the parsed JSON-RPC body, so client
 * identity comes from user-agent rather than the envelope's clientInfo.
 * Richer client identity (io.modelcontextprotocol/clientInfo) is reachable
 * inside tool handlers via ctx.mcpReq.envelope, but not here.
 *
 * method/name come from the Mcp-Method / Mcp-Name request headers rather
 * than the parsed body, and that is what makes this line useful: under SDK
 * v1, "[DEBUG] Tool called: <name>" logged before dispatch, so every inbound
 * tools/call appeared in the log. Under v2 the SDK rejects schema-invalid
 * calls before our registerTool wrapper ever runs, so malformed calls became
 * invisible. The factory runs before that validation, so logging the
 * headers here means a tools/call later rejected for a bad argument still
 * leaves a trace that it arrived. This is a PARTIAL fix by design: it
 * records that the call arrived, not why it was rejected — we still never
 * see the body, so malformed-call diagnostics are not fully restored. Note
 * also that Mcp-Method/Mcp-Name are decoupled from era classification (a
 * request carrying them can still be routed legacy) and, more importantly,
 * clients that predate this header convention send neither header in
 * EITHER era — for those this fix contributes zero visibility beyond
 * era=/client=/auth=.
 *
 * Never log the Authorization header, a bearer token, or any request body —
 * only whether auth was present. http-server.ts's own debug logging redacts
 * the same headers for the same reason.
 */
function logEraLine(ctx: McpRequestContext): void {
  const headers = ctx.requestInfo?.headers;
  const method = headers?.get("Mcp-Method");
  const name = headers?.get("Mcp-Name");
  const agent = headers?.get("user-agent") ?? "unknown";
  const hasAuth = headers?.has("authorization") ?? false;
  const traceparent = headers?.get(TRACEPARENT_META_KEY);
  const tracestate = headers?.get(TRACESTATE_META_KEY);
  console.error(
    `[MCP] era=${ctx.era}` +
      (method ? ` method=${loggable(method)}` : "") +
      (name ? ` name=${loggable(name)}` : "") +
      ` client=${loggable(agent)}` +
      ` auth=${hasAuth ? "present" : "absent"}` +
      (traceparent ? ` traceparent=${loggable(traceparent)}` : "") +
      (tracestate ? ` tracestate=${loggable(tracestate)}` : "")
  );
}

/**
 * Build the stateless MCP HTTP handler.
 *
 * The factory runs once per HTTP request, so nothing — not the McpServer, not
 * the API client, not the caller's token — survives between requests. The token
 * is read from the request's Authorization header: the SDK deliberately does not
 * populate `ctx.authInfo` from headers (it is strictly pass-through for
 * callers that have already validated a token), so `ctx.requestInfo` is the
 * correct source here.
 *
 * The factory also emits one observability line per request before doing
 * anything else — see {@link logEraLine}.
 */
export function createSequentumMcpHandler(apiBaseUrl: string, version: string): McpHttpHandler {
  return createMcpHandler((ctx) => {
    logEraLine(ctx);

    // One API client per request — this is what makes the server stateless.
    const apiClient = new SequentumApiClient(apiBaseUrl, null);
    const token = bearerFrom(ctx.requestInfo);
    if (token) {
      apiClient.setAccessToken(token);
    }
    return createMcpServer(apiClient, version);
  });
}
