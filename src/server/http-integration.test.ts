import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { startHttpServer } from "./http-server.js";
import { RATE_LIMIT_ERROR_CODE } from "./constants.js";
import { connect } from "node:net";

const ENVELOPE = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "integration-test", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

/**
 * Send a hand-written request and return the raw response text.
 *
 * `fetch` validates and rewrites Host, so it cannot express the cases that matter
 * here: a Host with HTML metacharacters, or HTTP/1.0 with no Host at all.
 */
function rawRequest(base: string, raw: string): Promise<string> {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const socket = connect({ host: hostname, port: Number(port) }, () => socket.write(raw));
    let out = "";
    socket.setTimeout(5000, () => socket.destroy(new Error("raw request timed out")));
    socket.on("data", (chunk) => (out += chunk.toString("utf8")));
    socket.on("end", () => resolve(out));
    socket.on("error", reject);
  });
}

describe("POST /mcp through the real Express app", () => {
  let server: HttpServer;
  let base: string;

  beforeEach(async () => {
    process.env.REQUIRE_AUTH = "false";
    server = await startHttpServer("https://api.example.test", "https://api.example.test", "9.9.9", 0, "127.0.0.1");
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
  /** Signs tokens for the "valid token" case below; also backs the stub JWKS document. */
  let pair: CryptoKeyPair;

  const KID = "auth-test-key";

  function segment(obj: unknown): string {
    return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  }

  async function mint(payload: Record<string, unknown>): Promise<string> {
    const input = `${segment({ alg: "RS256", kid: KID })}.${segment(payload)}`;
    const sig = await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      pair.privateKey,
      new TextEncoder().encode(input)
    );
    return `${input}.${Buffer.from(sig).toString("base64url")}`;
  }

  beforeEach(async () => {
    process.env.REQUIRE_AUTH = "true";

    pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);

    // A throwaway stand-in for the Sequentum API, so we can observe what the
    // per-request SequentumApiClient actually sends upstream. list_agents hits
    // GET /api/v1/agent/all, whose success shape is a plain array. It also serves
    // this describe's own JWKS document, since apiBaseUrl and the JWKS source are
    // the same origin (SE4-3856 pre-dispatch validation now fetches it).
    upstreamAuthHeaders = [];
    upstream = createServer((req, res) => {
      if (req.url === "/api/oauth/certs") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ keys: [{ kty: "RSA", use: "sig", alg: "RS256", kid: KID, n: jwk.n, e: jwk.e }] }));
        return;
      }
      upstreamAuthHeaders.push(req.headers.authorization);
      res.writeHead(200, { "content-type": "application/json" });
      res.end("[]");
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
    const upstreamAddr = upstream.address();
    if (!upstreamAddr || typeof upstreamAddr === "string") throw new Error("expected a TCP address");

    server = await startHttpServer(`http://127.0.0.1:${upstreamAddr.port}`, "https://api.example.test", "9.9.9", 0, "127.0.0.1");
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
    // A well-formed, validly-signed token: SE4-3856 rejects an opaque bearer value
    // pre-dispatch, so the pass-through this test cares about can only be observed
    // with a token that clears validation. MCP_CANONICAL_ORIGIN is unset in this
    // describe, so the audience check falls back to the caller-observed origin.
    const token = await mint({
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: base,
    });

    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
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
    expect(upstreamAuthHeaders).toContain(`Bearer ${token}`);
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
      Array.from({ length: 5 }, () => startHttpServer("https://api.example.test", "https://api.example.test", "9.9.9", 0, "127.0.0.1"))
    );

    // At most one SIGTERM listener is ever installed for the whole process,
    // no matter how many times startHttpServer is called.
    expect(process.listenerCount("SIGTERM")).toBe(Math.max(before, 1));
    expect(process.listenerCount("SIGINT")).toBeGreaterThan(0);

    await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  });
});

describe("/.well-known/oauth-protected-resource", () => {
  let server: HttpServer;
  let base: string;

  beforeEach(async () => {
    // The issuer is deliberately DIFFERENT from apiBaseUrl. If the two are ever
    // transposed, or authorization_servers reverts to apiBaseUrl, this fails.
    server = await startHttpServer(
      "https://api.example.test",
      "https://issuer.example.test",
      "9.9.9",
      0,
      "127.0.0.1"
    );
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected a TCP address");
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("advertises the issuer, not the API base URL, in authorization_servers", async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { authorization_servers: string[]; resource: string };
    expect(body.authorization_servers).toEqual(["https://issuer.example.test"]);
    expect(body.authorization_servers).not.toContain("https://api.example.test");
  });

  it("still reports this server's own origin as the resource", async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
    const body = (await res.json()) as { resource: string };
    expect(body.resource).toBe(base);
  });

  it("redirects authorization-server metadata to the issuer's own document", async () => {
    const res = await fetch(`${base}/.well-known/oauth-authorization-server`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://issuer.example.test/.well-known/oauth-authorization-server"
    );
  });

  it("serves no authorization-server metadata body of its own", async () => {
    // RFC 8414 Section 3.3 requires the returned issuer to equal the identifier the
    // well-known URI was built from. This server is a protected resource, not an
    // authorization server, so any document it served here would be non-conformant —
    // and one missing authorization_response_iss_parameter_supported makes clients
    // DISCARD authorization responses carrying iss (RFC 9207 Section 2.4).
    const res = await fetch(`${base}/.well-known/oauth-authorization-server`, { redirect: "manual" });
    const text = await res.text();
    expect(text).not.toContain("token_endpoint");
    expect(text).not.toContain("registration_endpoint");
  });
});

describe("GET / landing page", () => {
  let server: HttpServer;
  let base: string;

  beforeEach(async () => {
    process.env.REQUIRE_AUTH = "false";
    server = await startHttpServer(
      "https://api.example.test",
      "https://issuer.example.test",
      "9.9.9",
      0,
      "127.0.0.1"
    );
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected a TCP address");
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    delete process.env.REQUIRE_AUTH;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("serves an HTML document at the bare origin instead of 404", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain("<title>Sequentum MCP Server</title>");
  });

  it("advertises the requested origin's own endpoint, not a hardcoded one", async () => {
    // A page served from QA or localhost that told the reader to connect to production
    // would be worse than the 404 it replaces.
    const body = await (await fetch(`${base}/`)).text();
    expect(body).toContain(`${base}/mcp`);
    expect(body).not.toContain("mcp.sequentum.com");
  });

  it("does not shadow the protocol routes", async () => {
    // The whole safety argument for adding a root route is that Express matches `/`
    // exactly. If this ever regresses — or the same redirect is re-expressed as a
    // proxy catch-all — these are the routes that would silently start serving HTML.
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect((await health.json()) as { status: string }).toMatchObject({ status: "ok" });

    const prm = await fetch(`${base}/.well-known/oauth-protected-resource`);
    expect(prm.status).toBe(200);
    expect((await prm.json()) as { resource: string }).toMatchObject({ resource: base });

    const asMeta = await fetch(`${base}/.well-known/oauth-authorization-server`, {
      redirect: "manual",
    });
    expect(asMeta.status).toBe(302);

    const post = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "Mcp-Method": "tools/list",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: ENVELOPE } }),
    });
    expect(post.status).toBe(200);
    expect(post.headers.get("content-type")).not.toMatch(/text\/html/);

    expect((await fetch(`${base}/mcp`)).status).toBe(405);
  });

  it("is cacheable privately but never by a shared cache", async () => {
    // The body varies by Host (which a shared cache keys on) AND by the leftmost
    // X-Forwarded-Proto (which it does not, and which is client-supplied under the
    // default trust proxy: true). `public` would let one anonymous request pin an
    // hour of "connect over http://" onto the canonical page; `private` keeps the
    // browser cache without exposing a shared one. The absence of `public` is the
    // security property here — assert it directly, not just the happy string.
    const res = await fetch(`${base}/`);
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(res.headers.get("cache-control")).not.toMatch(/\bpublic\b/);
  });

  it("reflects a forwarded scheme into the body — the reason it must not be cached", async () => {
    // Documents the reflection rather than asserting it is desirable. The page shows
    // the same origin the PRM document advertises, so pinning the scheme here alone
    // would make the two disagree; the no-store above is what makes it harmless.
    const body = await (await fetch(`${base}/`, {
      headers: { "x-forwarded-proto": "http" },
    })).text();
    expect(body).toContain("<code>http://127.0.0.1");
  });

  it("escapes a Host carrying characters URL.origin lets through", async () => {
    // `"` is a legal host code point, so it reaches the template intact — undici
    // will not send a Host like this, hence the raw socket. See landing-page.test.ts
    // for the unit-level guarantee; this proves the live route is wired to it.
    const res = await rawRequest(base, 'GET / HTTP/1.1\r\nHost: a"b\r\nConnection: close\r\n\r\n');
    expect(res).toContain("200 OK");
    expect(res).toContain("<code>http://a&quot;b/mcp</code>");
    expect(res).not.toContain('<code>http://a"b/mcp</code>');
  });

  it("rejects a Host the URL parser refuses, without a mislabelled body", async () => {
    // Resolving the origin after res.type("html") shipped a JSON-RPC error body
    // labelled text/html — and, when this route was publicly cacheable, an hour of it.
    const res = await rawRequest(base, "GET / HTTP/1.1\r\nHost: a<b\r\nConnection: close\r\n\r\n");
    expect(res).toContain("400 Bad Request");
    expect(res).toMatch(/content-type: text\/plain/i);
    expect(res).toMatch(/cache-control: no-store/i);
    expect(res).not.toMatch(/cache-control:[^\r\n]*(public|private|max-age)/i);
    expect(res).not.toContain("jsonrpc");
  });

  it("rejects a request with no Host rather than rendering http://undefined", async () => {
    const res = await rawRequest(base, "GET / HTTP/1.0\r\n\r\n");
    expect(res).toContain("400 Bad Request");
    expect(res).not.toContain("undefined");
  });
});

describe("token validation on /mcp (SE4-3856)", () => {
  let server: HttpServer;
  let jwks: HttpServer;
  let base: string;
  let pair: CryptoKeyPair;

  const KID = "test-key";
  const ORIGIN_ENV = "http://127.0.0.1";

  function segment(obj: unknown): string {
    return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  }

  async function mint(payload: Record<string, unknown>): Promise<string> {
    const input = `${segment({ alg: "RS256", kid: KID })}.${segment(payload)}`;
    const sig = await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      pair.privateKey,
      new TextEncoder().encode(input)
    );
    return `${input}.${Buffer.from(sig).toString("base64url")}`;
  }

  function post(token: string) {
    return fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: ENVELOPE } }),
    });
  }

  beforeEach(async () => {
    delete process.env.REQUIRE_AUTH;

    pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);

    // A local stand-in for Control Center that serves only the JWKS document.
    jwks = createServer((req, res) => {
      if (req.url === "/api/oauth/certs") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ keys: [{ kty: "RSA", use: "sig", alg: "RS256", kid: KID, n: jwk.n, e: jwk.e }] }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => jwks.listen(0, "127.0.0.1", () => resolve()));
    const jwksAddr = jwks.address();
    if (!jwksAddr || typeof jwksAddr === "string") throw new Error("expected a TCP address");
    const apiBase = `http://127.0.0.1:${jwksAddr.port}`;

    server = await startHttpServer(apiBase, apiBase, "9.9.9", 0, "127.0.0.1");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected a TCP address");
    base = `http://127.0.0.1:${addr.port}`;
    process.env.MCP_CANONICAL_ORIGIN = `${ORIGIN_ENV}:${addr.port}`;
  });

  afterEach(async () => {
    delete process.env.MCP_CANONICAL_ORIGIN;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => jwks.close(() => resolve()));
  });

  it("answers an expired token with 401 and a WWW-Authenticate challenge", async () => {
    // THE regression guard for SE4-3856. Before this change the response was
    // 200 with the failure buried in a tool result, so no client ever refreshed.
    const token = await mint({
      exp: Math.floor(Date.now() / 1000) - 3600,
      aud: process.env.MCP_CANONICAL_ORIGIN,
    });

    const res = await post(token);

    expect(res.status).toBe(401);
    const challenge = res.headers.get("www-authenticate");
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain("resource_metadata=");
  });

  it("answers a token signed by an unknown key with 401", async () => {
    const attacker = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    const input = `${segment({ alg: "RS256", kid: KID })}.${segment({
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: process.env.MCP_CANONICAL_ORIGIN,
    })}`;
    const sig = await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      attacker.privateKey,
      new TextEncoder().encode(input)
    );

    const res = await post(`${input}.${Buffer.from(sig).toString("base64url")}`);

    expect(res.status).toBe(401);
  });

  it("answers a non-JWT bearer value with 401", async () => {
    const res = await post("sk-not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("answers an expired token on GET /mcp with 401", async () => {
    const token = await mint({
      exp: Math.floor(Date.now() / 1000) - 3600,
      aud: process.env.MCP_CANONICAL_ORIGIN,
    });

    const res = await fetch(`${base}/mcp`, {
      method: "GET",
      headers: { accept: "text/event-stream", authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
  });

  it("lets a valid token through to the handler", async () => {
    const token = await mint({
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: process.env.MCP_CANONICAL_ORIGIN,
    });

    const res = await post(token);

    expect(res.status).not.toBe(401);
  });

  it("fails open when the JWKS cannot be reached", async () => {
    // Degraded, not broken: the request reaches the handler and the API remains
    // the authority, exactly as before this change.
    await new Promise<void>((resolve) => jwks.close(() => resolve()));
    const token = await mint({
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: process.env.MCP_CANONICAL_ORIGIN,
    });

    const res = await post(token);

    expect(res.status).not.toBe(401);
  });

  it("skips validation entirely when REQUIRE_AUTH=false", async () => {
    process.env.REQUIRE_AUTH = "false";
    try {
      const res = await post("sk-not-a-jwt");
      expect(res.status).not.toBe(401);
    } finally {
      delete process.env.REQUIRE_AUTH;
    }
  });
});
