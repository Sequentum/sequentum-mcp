import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { startHttpServer } from "./http-server.js";
import { RATE_LIMIT_ERROR_CODE } from "./constants.js";

const ENVELOPE = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "integration-test", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

describe("POST /mcp through the real Express app", () => {
  let server: HttpServer;
  let base: string;

  beforeEach(async () => {
    process.env.REQUIRE_AUTH = "false";
    server = await startHttpServer("https://api.example.test", "9.9.9", 0, "127.0.0.1");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected a TCP address");
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    delete process.env.REQUIRE_AUTH;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns a real tools/list result, not a parse error", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "Mcp-Method": "tools/list",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: ENVELOPE } }),
    });

    expect(res.status).toBe(200);
    const body = JSON.parse((await res.text()).replace(/^event: message\ndata: /, ""));
    // A global express.json() consumes the stream and yields -32700 here.
    expect(body.error).toBeUndefined();
    expect(body.result.tools.length).toBe(39);
  });

  it("ignores a stale Mcp-Session-Id instead of failing", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": "a1b2c3d4-0000-0000-0000-000000000000",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(200);

    // Status alone is not enough: the v1 code's "Server not initialized" would
    // also have been an in-band JSON-RPC error at HTTP 200. Assert the request
    // actually succeeded, which is what "the stale session id is ignored" means.
    const body = JSON.parse((await res.text()).replace(/^event: message\ndata: /, ""));
    expect(body.error).toBeUndefined();
    expect(Array.isArray(body.result.tools)).toBe(true);
    expect(body.result.tools.length).toBeGreaterThan(0);
  });

  it("answers a legacy initialize handshake", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "old", version: "1" } },
      }),
    });
    expect(res.status).toBe(200);
    const body = JSON.parse((await res.text()).replace(/^event: message\ndata: /, ""));
    expect(body.result.protocolVersion).toBe("2025-06-18");
    expect(body.result.instructions).toContain("SUFFICIENCY POLICY");
  });

  it("returns 405 for GET /mcp and 200 for DELETE /mcp", async () => {
    expect((await fetch(`${base}/mcp`, { method: "GET" })).status).toBe(405);
    expect((await fetch(`${base}/mcp`, { method: "DELETE" })).status).toBe(200);
  });

  it("allows the headers the revision requires, and no longer advertises sessions", async () => {
    // Without Mcp-Method and Mcp-Name in the allowlist, tools/call from any browser
    // client fails -32020 before reaching a handler.
    const res = await fetch(`${base}/mcp`, {
      method: "OPTIONS",
      headers: { origin: "https://claude.ai", "access-control-request-method": "POST" },
    });
    const allowed = res.headers.get("access-control-allow-headers") ?? "";
    expect(allowed).toMatch(/Mcp-Method/i);
    expect(allowed).toMatch(/Mcp-Name/i);
    expect(allowed).not.toMatch(/mcp-session-id/i);
    expect(res.headers.get("access-control-expose-headers") ?? "").not.toMatch(/mcp-session-id/i);
  });

  it("uses a rate-limit code inside the implementation-defined range", () => {
    // MCP 2026-07-28 reserves -32020..-32099 for the spec; -32000..-32019 stays ours.
    expect(RATE_LIMIT_ERROR_CODE).toBeGreaterThanOrEqual(-32019);
    expect(RATE_LIMIT_ERROR_CODE).toBeLessThanOrEqual(-32000);
  });
});

// Auth is the one behaviour on this route whose regression would be both silent
// and security-relevant, so it gets its own block with authentication actually
// switched ON. REQUIRE_AUTH is set explicitly rather than left unset so the test
// states its own precondition, and deleted afterwards so the block above is
// unaffected by ordering.
describe("POST /mcp authentication", () => {
  let server: HttpServer;
  let base: string;
  let upstream: HttpServer;
  /** Every Authorization header the stub Sequentum API received. */
  let upstreamAuthHeaders: (string | undefined)[];

  beforeEach(async () => {
    process.env.REQUIRE_AUTH = "true";

    // A throwaway stand-in for the Sequentum API, so we can observe what the
    // per-request SequentumApiClient actually sends upstream. list_agents hits
    // GET /api/v1/agent/all, whose success shape is a plain array.
    upstreamAuthHeaders = [];
    upstream = createServer((req, res) => {
      upstreamAuthHeaders.push(req.headers.authorization);
      res.writeHead(200, { "content-type": "application/json" });
      res.end("[]");
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
    const upstreamAddr = upstream.address();
    if (!upstreamAddr || typeof upstreamAddr === "string") throw new Error("expected a TCP address");

    server = await startHttpServer(`http://127.0.0.1:${upstreamAddr.port}`, "9.9.9", 0, "127.0.0.1");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected a TCP address");
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    delete process.env.REQUIRE_AUTH;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  it("challenges an unauthenticated POST with an RFC 9728 WWW-Authenticate header", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    expect(res.status).toBe(401);
    // The resource_metadata parameter is the discovery signal: it is how a
    // directory prober finds this resource's authorization server. A bare 401
    // without it leaves the client with nowhere to go.
    const challenge = res.headers.get("www-authenticate") ?? "";
    expect(challenge).toContain("Bearer");
    expect(challenge).toContain("resource_metadata=");
    expect(challenge).toContain("/.well-known/oauth-protected-resource");
  });

  it("challenges an unauthenticated GET before answering 405", async () => {
    const res = await fetch(`${base}/mcp`, { method: "GET" });

    expect(res.status).toBe(401);
    const challenge = res.headers.get("www-authenticate") ?? "";
    expect(challenge).toContain("Bearer");
    expect(challenge).toContain("resource_metadata=");
  });

  it("passes the caller's bearer token through to the upstream API", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer test-token-abc123",
        "Mcp-Method": "tools/call",
        "Mcp-Name": "list_agents",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_agents", arguments: {}, _meta: ENVELOPE },
      }),
    });

    expect(res.status).toBe(200);
    const body = JSON.parse((await res.text()).replace(/^event: message\ndata: /, ""));
    expect(body.error).toBeUndefined();
    // Distinguish "auth wiring is broken" from "upstream unreachable for any
    // other reason" before checking what the upstream received: a failed
    // tool call would still be a 200 with a JSON-RPC result (isError: true),
    // and the toContain assertion below would then fail on an empty array
    // with no clue why.
    expect(body.result?.isError).not.toBe(true);

    // The whole point: the token travelled from the inbound HTTP header, through
    // the per-request factory, onto that request's SequentumApiClient, and out
    // to the upstream API.
    expect(upstreamAuthHeaders).toContain("Bearer test-token-abc123");
  });
});

describe("startHttpServer signal-handler registration", () => {
  // Before this fix, every call added its own un-removable process.on(...)
  // listener. http-integration.test.ts alone calls startHttpServer from two
  // `beforeEach` blocks, so a handful of test runs would trip Node's
  // MaxListenersExceededWarning (default threshold: 10) — and any handler
  // firing mid-run would call process.exit(0) on the vitest worker.
  it("does not accumulate SIGTERM/SIGINT listeners across repeated calls", async () => {
    const before = process.listenerCount("SIGTERM");

    const servers = await Promise.all(
      Array.from({ length: 5 }, () => startHttpServer("https://api.example.test", "9.9.9", 0, "127.0.0.1"))
    );

    // At most one SIGTERM listener is ever installed for the whole process,
    // no matter how many times startHttpServer is called.
    expect(process.listenerCount("SIGTERM")).toBe(Math.max(before, 1));
    expect(process.listenerCount("SIGINT")).toBeGreaterThan(0);

    await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  });
});
