/**
 * Protocol seam for the Sequentum MCP server.
 *
 * Owns createMcpHandler and the per-request McpServer factory. Deliberately free
 * of Express so the protocol surface can be tested via handler.fetch() without
 * binding a socket.
 */
import {
  createMcpHandler,
  BAGGAGE_META_KEY,
  TRACEPARENT_META_KEY,
  TRACESTATE_META_KEY,
  type McpHttpHandler,
  type McpHandlerRequestOptions,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
import { SequentumApiClient } from "../api/api-client.js";
import { createMcpServer } from "./handlers.js";
import { AsyncLocalStorage } from "node:async_hooks";

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
export function loggable(value: string): string {
  return JSON.stringify(value.slice(0, MAX_LOGGED_FIELD_LENGTH));
}

/**
 * The three W3C trace keys SEP-414 carries in `params._meta`, written unprefixed.
 * The same names are the HTTP header names, so one key list serves both sources.
 */
const TRACE_KEYS = [TRACEPARENT_META_KEY, TRACESTATE_META_KEY, BAGGAGE_META_KEY] as const;
type TraceKey = (typeof TRACE_KEYS)[number];

/** W3C trace context resolved for one request; absent keys are omitted, not empty. */
export type TraceContext = Partial<Record<TraceKey, string>>;

/**
 * Pull the SEP-414 trace keys out of a parsed JSON-RPC request body. Anything that is not
 * a single request object with an object `params._meta` yields `{}` (batches, notifications
 * without params, parse failures). Only non-empty strings are kept: `_meta` is
 * attacker-controlled, so a number or object there is dropped, never coerced.
 */
export function traceContextFromMeta(body: unknown): TraceContext {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return {};
  const params = (body as { params?: unknown }).params;
  if (typeof params !== "object" || params === null || Array.isArray(params)) return {};
  const meta = (params as { _meta?: unknown })._meta;
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return {};
  const out: TraceContext = {};
  for (const key of TRACE_KEYS) {
    const value = (meta as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
}

/**
 * Per key: the `_meta` value if the client sent one, else the HTTP header of the same
 * name. SEP-414 makes `_meta` the spec carrier; headers stay supported for clients that
 * predate it. Keys absent from both are omitted so the era line can skip them.
 */
export function resolveTraceContext(meta: TraceContext, headers: Headers | undefined): TraceContext {
  const out: TraceContext = {};
  for (const key of TRACE_KEYS) {
    const value = meta[key] ?? headers?.get(key) ?? undefined;
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Carries the resolved trace context from the fetch wrapper (which can see the body) to
 * the server factory (which cannot: `McpRequestContext` exposes only era, authInfo and
 * the raw Request, and the SDK has already consumed the body by then). Async-local rather
 * than a WeakMap keyed by Request because the SDK may clone the request during legacy
 * classification, so object identity is not reliable across that boundary.
 */
const traceContextStore = new AsyncLocalStorage<TraceContext>();

/**
 * Log one compact line per request to stderr: negotiated era, the requested
 * method/name, client identity, auth presence, and OTel trace context when
 * the caller sent it.
 *
 * Format (bracketed segments are omitted, not emitted empty, when the
 * source header is absent):
 *
 *   [MCP] era=<legacy|modern>[ method=<q>][ name=<q>] client=<q> auth=<present|absent>[ traceparent=<q>][ tracestate=<q>][ baggage=<q>]
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
 * Trace context is the one exception: SEP-414 carries traceparent,
 * tracestate and baggage in params._meta, so createSequentumMcpHandler's
 * fetch wrapper parses the body once, resolves _meta-over-header per key,
 * and hands the result here through an AsyncLocalStorage. Richer client
 * identity (io.modelcontextprotocol/clientInfo) is reachable inside tool
 * handlers via ctx.mcpReq.envelope, but not here.
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
function logEraLine(ctx: McpRequestContext, trace: TraceContext): void {
  const headers = ctx.requestInfo?.headers;
  const method = headers?.get("Mcp-Method");
  const name = headers?.get("Mcp-Name");
  const agent = headers?.get("user-agent") ?? "unknown";
  const hasAuth = headers?.has("authorization") ?? false;
  console.error(
    `[MCP] era=${ctx.era}` +
      (method ? ` method=${loggable(method)}` : "") +
      (name ? ` name=${loggable(name)}` : "") +
      ` client=${loggable(agent)}` +
      ` auth=${hasAuth ? "present" : "absent"}` +
      (trace.traceparent ? ` traceparent=${loggable(trace.traceparent)}` : "") +
      (trace.tracestate ? ` tracestate=${loggable(trace.tracestate)}` : "") +
      (trace.baggage ? ` baggage=${loggable(trace.baggage)}` : "")
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
 * The returned handler wraps the SDK's fetch to parse the body once (see the wrapper
 * below) and the factory emits one observability line per request before doing
 * anything else — see {@link logEraLine}.
 */
export function createSequentumMcpHandler(apiBaseUrl: string, version: string): McpHttpHandler {
  const inner = createMcpHandler((ctx) => {
    // Set by the fetch wrapper below. The header-only fallback covers any path that
    // reaches the factory without passing through it (none today; defensive).
    const trace = traceContextStore.getStore() ?? resolveTraceContext({}, ctx.requestInfo?.headers);
    logEraLine(ctx, trace);

    // One API client per request — this is what makes the server stateless.
    const apiClient = new SequentumApiClient(apiBaseUrl, null);
    const token = bearerFrom(ctx.requestInfo);
    if (token) {
      apiClient.setAccessToken(token);
    }
    return createMcpServer(apiClient, version);
  });

  /**
   * Parse a POST body once so the trace context can be read from params._meta, then
   * hand the parsed value to the SDK via `parsedBody` so it does not read the stream
   * again. The clone leaves the original stream intact for the SDK's own error path:
   * when the body is not JSON we pass no `parsedBody`, the SDK reads the original and
   * returns its usual 400 / -32700, unchanged from before this wrapper existed.
   */
  const fetch: McpHttpHandler["fetch"] = async (request, options) => {
    let parsedBody = options?.parsedBody;
    if (parsedBody === undefined && request.method.toUpperCase() === "POST") {
      try {
        parsedBody = await request.clone().json();
      } catch {
        parsedBody = undefined;
      }
    }
    const trace = resolveTraceContext(traceContextFromMeta(parsedBody), request.headers);
    const forwarded: McpHandlerRequestOptions | undefined =
      parsedBody === undefined ? options : { ...options, parsedBody };
    return traceContextStore.run(trace, () => inner.fetch(request, forwarded));
  };

  return {
    fetch,
    close: () => inner.close(),
    notify: inner.notify,
    bus: inner.bus,
  };
}
