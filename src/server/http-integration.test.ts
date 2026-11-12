import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { startHttpServer } from "./http-server.js";
import glamaClaim from "./well-known/glama.json" with { type: "json" };
import { MCP_RATE_LIMIT_MAX, RATE_LIMIT_ERROR_CODE } from "./constants.js";
import { connect } from "node:net";
import { SUPPORTED_SCOPES } from "../utils/oauth-metadata.js";
import type { ResourceScopesSource } from "../utils/resource-scopes.js";
import { API_CONTENT_SECURITY_POLICY } from "./csp.js";
import { LANDING_PAGE_CSP } from "./landing-page.js";
import { createHash } from "node:crypto";

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

// MCP_CANONICAL_ORIGIN now decides the advertised resource, the challenges and the landing
// page, so a value left exported in the shell running the suite would fail every Host-mode
// test below. TRUST_PROXY decides whether a spoofed X-Forwarded-Proto reaches req.protocol,
// so a shell `TRUST_PROXY=false` would make the spoof tests pass vacuously. Suites that need
// either set it themselves; this restores the shell's values after.
const SCRUBBED_ENV = ["MCP_CANONICAL_ORIGIN", "TRUST_PROXY"] as const;
const savedEnv: Partial<Record<(typeof SCRUBBED_ENV)[number], string>> = {};
beforeEach(() => {
  for (const name of SCRUBBED_ENV) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
});
afterEach(() => {
  for (const name of SCRUBBED_ENV) {
    const saved = savedEnv[name];
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
});

describe("POST /mcp through the real Express app", () => {
  let server: HttpServer;
  let base: string;
  let savedTrustProxy: string | undefined;

  beforeEach(async () => {
    process.env.REQUIRE_AUTH = "false";
    // Unset so the X-Forwarded-For test below exercises the default, not
    // whatever TRUST_PROXY the shell running the suite happens to export.
    savedTrustProxy = process.env.TRUST_PROXY;
    delete process.env.TRUST_PROXY;
    server = await startHttpServer("https://api.example.test", "https://api.example.test", "9.9.9", 0, "127.0.0.1");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected a TCP address");
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    delete process.env.REQUIRE_AUTH;
    if (savedTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = savedTrustProxy;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns a real tools/list result, not a parse error", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "Mcp-Method": "tools/list",
        "Mcp-Protocol-Version": "2026-07-28",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: ENVELOPE } }),
    });

    expect(res.status).toBe(200);
    const body = JSON.parse((await res.text()).replace(/^event: message\ndata: /, ""));
    // A global express.json() consumes the stream and yields -32700 here.
    expect(body.error).toBeUndefined();
    expect(body.result.tools.length).toBe(43);
  });

  it("answers 413 to a request body over 4 MiB", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "Mcp-Method": "tools/list",
        "Mcp-Protocol-Version": "2026-07-28",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { _meta: { ...ENVELOPE, pad: "x".repeat(4 * 1024 * 1024) } },
      }),
    });

    expect(res.status).toBe(413);
    expect(JSON.parse(await res.text()).error.code).toBe(-32000);
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
    expect(body.result.instructions).toMatch(/^Sequentum MCP server: /);
    expect(body.result.instructions).toContain("Agent Builder");
    expect(body.result.instructions).toContain("SUFFICIENCY POLICY");
  });

  it("returns 405 for GET /mcp and 200 for DELETE /mcp", async () => {
    expect((await fetch(`${base}/mcp`, { method: "GET" })).status).toBe(405);
    expect((await fetch(`${base}/mcp`, { method: "DELETE" })).status).toBe(200);
  });

  it("allows the headers the revision requires, and no longer advertises sessions", async () => {
    // Without Mcp-Method, Mcp-Name and Mcp-Protocol-Version in the allowlist, tools/call
    // from any browser client fails -32020 before reaching a handler. The SDK has
    // required Mcp-Protocol-Version on every modern POST since 2.1.0.
    const res = await fetch(`${base}/mcp`, {
      method: "OPTIONS",
      headers: { origin: "https://claude.ai", "access-control-request-method": "POST" },
    });
    const allowed = res.headers.get("access-control-allow-headers") ?? "";
    expect(allowed).toMatch(/Mcp-Method/i);
    expect(allowed).toMatch(/Mcp-Name/i);
    expect(allowed).toMatch(/Mcp-Protocol-Version/i);
    expect(allowed).not.toMatch(/mcp-session-id/i);
    expect(res.headers.get("access-control-expose-headers") ?? "").not.toMatch(/mcp-session-id/i);
  });

  it("uses a rate-limit code inside the implementation-defined range", () => {
    // MCP 2026-07-28 reserves -32020..-32099 for the spec; -32000..-32019 stays ours.
    expect(RATE_LIMIT_ERROR_CODE).toBeGreaterThanOrEqual(-32019);
    expect(RATE_LIMIT_ERROR_CODE).toBeLessThanOrEqual(-32000);
  });

  it("keys the rate limit on the proxy-written X-Forwarded-For entry, not the client's", async () => {
    // A reverse proxy appends the address it saw to whatever X-Forwarded-For the
    // client sent, so only the rightmost entry is trustworthy. Here the test
    // client plays the proxy: the rightmost entry stays fixed while the leftmost,
    // client-chosen one rotates. If rotating it opened a fresh bucket, a client
    // could send unlimited requests per window.
    const post = (forwardedFor: string) =>
      fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "x-forwarded-for": forwardedFor,
        },
        body: "{}",
      });

    const first = await post("203.0.113.10, 192.0.2.1");
    const second = await post("198.51.100.77, 192.0.2.1");

    const remaining = (res: Response) => Number(res.headers.get("ratelimit-remaining"));
    expect(remaining(second)).toBe(remaining(first) - 1);
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

  it("sends the API Content-Security-Policy on the 401 challenge (IT-2272)", async () => {
    // With auth on, the 401 is what an anonymous scanner actually receives from /mcp.
    const res = await fetch(`${base}/mcp`, { method: "GET" });
    expect(res.status).toBe(401);
    expect(res.headers.get("content-security-policy")).toBe(API_CONTENT_SECURITY_POLICY);
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
        "Mcp-Protocol-Version": "2026-07-28",
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

  it.each(["/auth.md", "/.well-known/auth.md"])(
    "redirects %s to the issuer's own manifest",
    async (path) => {
      const res = await fetch(`${base}${path}`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("https://issuer.example.test/auth.md");
    }
  );

  it("serves no auth.md body of its own", async () => {
    // Registration, claims and tokens live on the Control Center; a local copy of the
    // manifest would drift, exactly as the authorization-server metadata copy did.
    const res = await fetch(`${base}/auth.md`, { redirect: "manual" });
    const text = await res.text();
    expect(text).not.toContain("registration");
    expect(res.headers.get("content-type") ?? "").not.toMatch(/markdown/);
  });

  it("serves the SUPPORTED_SCOPES fallback when no scope source is injected (default wiring)", async () => {
    // No mock apiBaseUrl in this suite ever resolves to a real Control Center, so this is the
    // server's real default behaviour, not a stub standing in for it.
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
    const body = (await res.json()) as { scopes_supported: string[] };
    expect(body.scopes_supported).toEqual([...SUPPORTED_SCOPES]);
  });

  it("serves scopes_supported from an injected ResourceScopesSource (SE4-3929)", async () => {
    const stub: ResourceScopesSource = {
      getScopes: () => ["agents:read", "billing:read"],
      refresh: async () => {},
    };
    const injected = await startHttpServer(
      "https://api.example.test",
      "https://issuer.example.test",
      "9.9.9",
      0,
      "127.0.0.1",
      { resourceScopes: stub }
    );
    try {
      const addr = injected.address();
      if (!addr || typeof addr === "string") throw new Error("expected a TCP address");
      const res = await fetch(`http://127.0.0.1:${addr.port}/.well-known/oauth-protected-resource`);
      const body = (await res.json()) as { scopes_supported: string[] };
      expect(body.scopes_supported).toEqual(["agents:read", "billing:read"]);
    } finally {
      await new Promise<void>((resolve) => injected.close(() => resolve()));
    }
  });

  it("never lists offline_access in the protected resource document (default wiring)", async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
    const body = (await res.json()) as { scopes_supported: string[] };
    expect(body.scopes_supported).not.toContain("offline_access");
  });

  it("primes the scope source once at startup rather than only on first request", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const stub: ResourceScopesSource = { getScopes: () => [...SUPPORTED_SCOPES], refresh };
    const primed = await startHttpServer(
      "https://api.example.test",
      "https://issuer.example.test",
      "9.9.9",
      0,
      "127.0.0.1",
      { resourceScopes: stub }
    );
    try {
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve) => primed.close(() => resolve()));
    }
  });
});

// Host is caller-controlled, so with MCP_CANONICAL_ORIGIN set every origin this
// server advertises comes from the env instead. `rawRequest` sends the spoofed Host,
// because fetch rewrites it.
describe("MCP_CANONICAL_ORIGIN pins the advertised origin", () => {
  const CANONICAL = "https://mcp.example.test";
  let server: HttpServer;
  let base: string;

  beforeEach(async () => {
    delete process.env.REQUIRE_AUTH;
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
    process.env.MCP_CANONICAL_ORIGIN = CANONICAL;
  });

  afterEach(async () => {
    delete process.env.MCP_CANONICAL_ORIGIN;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("advertises the canonical origin as the PRM resource whatever Host says", async () => {
    const res = await rawRequest(
      base,
      "GET /.well-known/oauth-protected-resource HTTP/1.1\r\nHost: attacker.example.test\r\nConnection: close\r\n\r\n"
    );
    expect(res).toContain("200 OK");
    expect(res).toContain(`"resource":"${CANONICAL}"`);
    expect(res).not.toContain("attacker.example.test");
  });

  it("ignores a spoofed X-Forwarded-Proto when the canonical origin is set", async () => {
    // The connection is plain http, so the spoof must claim https to change anything:
    // the default one-hop TRUST_PROXY trusts loopback, so req.protocol becomes "https"
    // and an origin that took its scheme from the request would advertise https.
    process.env.MCP_CANONICAL_ORIGIN = "http://mcp.example.test";
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`, {
      headers: { "x-forwarded-proto": "https" },
    });
    const body = (await res.json()) as { resource: string };
    expect(body.resource).toBe("http://mcp.example.test");
  });

  it("points the 401 challenge at the canonical origin whatever Host says", async () => {
    const payload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const res = await rawRequest(
      base,
      "POST /mcp HTTP/1.1\r\nHost: attacker.example.test\r\nContent-Type: application/json\r\n" +
        "Accept: application/json, text/event-stream\r\n" +
        `Content-Length: ${Buffer.byteLength(payload)}\r\nConnection: close\r\n\r\n${payload}`
    );
    expect(res).toContain("401");
    expect(res).toContain('realm="mcp.example.test"');
    expect(res).toContain(`resource_metadata="${CANONICAL}/.well-known/oauth-protected-resource"`);
    expect(res).not.toContain("attacker.example.test");
  });

  it("falls back to Host for the PRM resource when the value is unparseable", async () => {
    process.env.MCP_CANONICAL_ORIGIN = "mcp.example.test"; // no scheme, so `new URL` throws
    const body = (await (await fetch(`${base}/.well-known/oauth-protected-resource`)).json()) as {
      resource: string;
    };
    expect(body.resource).toBe(base);
  });

  it("falls back to Host for a scheme-less host:port, which new URL parses to the origin \"null\"", async () => {
    // `new URL("localhost:3000")` reads `localhost:` as a scheme and does not throw; its
    // origin is the string "null". Taken as configured, that broke every 401 (the
    // challenge builder cannot parse "null") and advertised "null" as the resource.
    process.env.MCP_CANONICAL_ORIGIN = "localhost:3000";
    const body = (await (await fetch(`${base}/.well-known/oauth-protected-resource`)).json()) as {
      resource: string;
    };
    expect(body.resource).toBe(base);

    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource"`);
  });
});

describe("/.well-known/glama.json on the real server", () => {
  // The handler has its own unit tests; this pins that startHttpServer actually
  // mounts the route, since Glama keeps re-fetching the file and a dropped route
  // would silently lose verified ownership.
  it("serves the claim file without authentication", async () => {
    const server = await startHttpServer("https://api.example.test", "https://api.example.test", "9.9.9", 0, "127.0.0.1");
    try {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("expected a TCP address");
      const res = await fetch(`http://127.0.0.1:${addr.port}/.well-known/glama.json`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(glamaClaim);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
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

  it("links the auth.md manifest and says agents can register through it", async () => {
    const body = await (await fetch(`${base}/`)).text();
    expect(body).toContain('href="/auth.md"');
    expect(body).toMatch(/agents can register/i);
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
        "Mcp-Protocol-Version": "2026-07-28",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: ENVELOPE } }),
    });
    expect(post.status).toBe(200);
    expect(post.headers.get("content-type")).not.toMatch(/text\/html/);

    expect((await fetch(`${base}/mcp`)).status).toBe(405);
  });

  it("is cacheable privately but never by a shared cache", async () => {
    // The body varies by Host (which a shared cache keys on) AND by the leftmost
    // X-Forwarded-Proto (which it does not, and which is client-supplied whenever
    // nothing in front of the server overwrites it). `public` would let one
    // anonymous request pin an hour of "connect over http://" onto the canonical
    // page; `private` keeps the browser cache without exposing a shared one. The absence of `public` is the
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

  it("still rejects a request with no Host when MCP_CANONICAL_ORIGIN is set but unparseable", async () => {
    // A set but unparseable value is Host mode, so the guard must test the parsed
    // origin, not whether the variable is present.
    process.env.MCP_CANONICAL_ORIGIN = "localhost:3000";
    const res = await rawRequest(base, "GET / HTTP/1.0\r\n\r\n");
    expect(res).toContain("400 Bad Request");
    expect(res).not.toContain("undefined");
  });

  describe("with MCP_CANONICAL_ORIGIN set", () => {
    // The configured origin is known, so the page neither echoes Host nor needs it.
    beforeEach(() => {
      process.env.MCP_CANONICAL_ORIGIN = "https://mcp.example.test";
    });

    afterEach(() => {
      delete process.env.MCP_CANONICAL_ORIGIN;
    });

    it("advertises the canonical endpoint whatever Host says", async () => {
      const res = await rawRequest(base, "GET / HTTP/1.1\r\nHost: attacker.example.test\r\nConnection: close\r\n\r\n");
      expect(res).toContain("200 OK");
      expect(res).toContain("<code>https://mcp.example.test/mcp</code>");
      expect(res).not.toContain("attacker.example.test");
      expect(res).toMatch(/cache-control: private, max-age=3600/i);
    });

    it("serves the page to a request with no Host", async () => {
      const res = await rawRequest(base, "GET / HTTP/1.0\r\n\r\n");
      expect(res).toContain("200 OK");
      expect(res).toContain("https://mcp.example.test/mcp");
      expect(res).not.toContain("undefined");
    });
  });
});

// IT-2272: Qualys QID 48001 flagged the missing header on GET / behind both NLBs.
// Every response must carry a policy — the scanner may probe any path.
describe("Content-Security-Policy on every response (IT-2272)", () => {
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

  it("gives the landing page a policy whose style hash matches the stylesheet actually served", async () => {
    // Hash recomputed from the bytes on the wire: this is the check a browser makes.
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy");
    expect(csp).toBe(LANDING_PAGE_CSP);

    const style = (await res.text()).match(/<style>([\s\S]*?)<\/style>/)?.[1];
    if (style === undefined) throw new Error("expected a <style> block on the landing page");
    const hash = createHash("sha256").update(style, "utf8").digest("base64");
    expect(csp).toContain(`style-src 'sha256-${hash}'`);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("sends the API policy on the landing page's 400 for an unparseable Host", async () => {
    // That body is text/plain with no stylesheet, so it gets the strict policy.
    const res = await rawRequest(base, "GET / HTTP/1.1\r\nHost: a<b\r\nConnection: close\r\n\r\n");
    expect(res).toContain("400 Bad Request");
    expect(res).toContain(`Content-Security-Policy: ${API_CONTENT_SECURITY_POLICY}\r\n`);
  });

  it("sends the API policy on every protocol and discovery route", async () => {
    const responses: [string, Response][] = [
      ["GET /health", await fetch(`${base}/health`)],
      ["GET /.well-known/oauth-protected-resource", await fetch(`${base}/.well-known/oauth-protected-resource`)],
      [
        "GET /.well-known/oauth-authorization-server",
        await fetch(`${base}/.well-known/oauth-authorization-server`, { redirect: "manual" }),
      ],
      ["GET /.well-known/glama.json", await fetch(`${base}/.well-known/glama.json`)],
      ["GET /auth.md", await fetch(`${base}/auth.md`, { redirect: "manual" })],
      ["GET /.well-known/auth.md", await fetch(`${base}/.well-known/auth.md`, { redirect: "manual" })],
      [
        "POST /mcp",
        await fetch(`${base}/mcp`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "Mcp-Method": "tools/list",
            "Mcp-Protocol-Version": "2026-07-28",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: ENVELOPE } }),
        }),
      ],
      ["GET /mcp", await fetch(`${base}/mcp`)],
      ["DELETE /mcp", await fetch(`${base}/mcp`, { method: "DELETE" })],
      ["OPTIONS /mcp", await fetch(`${base}/mcp`, { method: "OPTIONS" })],
    ];
    for (const [route, res] of responses) {
      expect({ route, csp: res.headers.get("content-security-policy") }).toEqual({
        route,
        csp: API_CONTENT_SECURITY_POLICY,
      });
    }
  });

  it("sends the API policy on the 403 for a non-allowlisted browser origin", async () => {
    // The CORS middleware answers this before any route runs, so the header must be
    // set ahead of it, not by the routes.
    const res = await rawRequest(
      base,
      "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: https://evil.example.test\r\n" +
        "Content-Length: 0\r\nConnection: close\r\n\r\n"
    );
    expect(res).toContain("403 Forbidden");
    expect(res).toContain(`Content-Security-Policy: ${API_CONTENT_SECURITY_POLICY}\r\n`);
  });

  it("sends the API policy on the 429 from the /mcp rate limiter", async () => {
    // The limiter answers before the route handler, so its response needs the header set ahead of it.
    let limited: Response | undefined;
    for (let i = 0; i < MCP_RATE_LIMIT_MAX + 5; i++) {
      const res = await fetch(`${base}/mcp`);
      if (res.status === 429) {
        limited = res;
        break;
      }
      await res.arrayBuffer();
    }
    if (!limited) throw new Error("expected the /mcp rate limiter to answer 429");
    expect(limited.headers.get("content-security-policy")).toBe(API_CONTENT_SECURITY_POLICY);
    // The SE4-4540 hardening headers ride the same first middleware; checked here rather than
    // in a second suite so the limiter is only exhausted once.
    expect(limited.headers.get("x-content-type-options")).toBe("nosniff");
    expect(limited.headers.get("referrer-policy")).toBe("no-referrer");
    expect(limited.headers.get("x-frame-options")).toBe("DENY");
    expect(limited.headers.get("x-powered-by")).toBeNull();
  });

  it("sends the API policy on a 400 for a malformed JSON body to /mcp", async () => {
    // The MCP handler rejects the body with a JSON-RPC parse error inside the route, so its 400
    // must still carry the header set by the first middleware.
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "Mcp-Method": "tools/list",
        "Mcp-Protocol-Version": "2026-07-28",
      },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-security-policy")).toBe(API_CONTENT_SECURITY_POLICY);
  });

  it("still sends a locked-down policy on an unknown path's 404", async () => {
    // Express's finalhandler replaces the header with its own `default-src 'none'` on
    // its 404 page — narrower than ours but still a policy, which is what QID 48001
    // checks for. Asserting the shared core, not our exact string.
    const res = await fetch(`${base}/no-such-route`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-security-policy")).toMatch(/^default-src 'none'/);
  });

  it("sends the API policy on the openai-apps-challenge route's own 404", async () => {
    // Unlike finalhandler's 404 above, this route's handler answers 404 itself with
    // res.status(404).end(), so the first middleware's full API policy must survive.
    const prior = process.env.OPENAI_APPS_CHALLENGE_TOKEN;
    delete process.env.OPENAI_APPS_CHALLENGE_TOKEN;
    try {
      const res = await fetch(`${base}/.well-known/openai-apps-challenge`);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-security-policy")).toBe(API_CONTENT_SECURITY_POLICY);
    } finally {
      if (prior === undefined) delete process.env.OPENAI_APPS_CHALLENGE_TOKEN;
      else process.env.OPENAI_APPS_CHALLENGE_TOKEN = prior;
    }
  });
});

describe("hardening headers on every response (SE4-4540)", () => {
  let server: HttpServer;
  let base: string;
  let savedRequireAuth: string | undefined;

  beforeEach(async () => {
    // The 401 rows below need the auth gate on, whatever REQUIRE_AUTH the shell exports.
    savedRequireAuth = process.env.REQUIRE_AUTH;
    delete process.env.REQUIRE_AUTH;
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
    if (savedRequireAuth === undefined) delete process.env.REQUIRE_AUTH;
    else process.env.REQUIRE_AUTH = savedRequireAuth;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("sends the static hardening headers and no X-Powered-By on every route", async () => {
    const responses: [string, Response][] = [
      ["GET /", await fetch(`${base}/`)],
      ["GET /health", await fetch(`${base}/health`)],
      ["GET /.well-known/oauth-protected-resource", await fetch(`${base}/.well-known/oauth-protected-resource`)],
      [
        "GET /.well-known/oauth-authorization-server",
        await fetch(`${base}/.well-known/oauth-authorization-server`, { redirect: "manual" }),
      ],
      ["GET /mcp (401)", await fetch(`${base}/mcp`)],
      ["OPTIONS /mcp", await fetch(`${base}/mcp`, { method: "OPTIONS" })],
    ];
    for (const [route, res] of responses) {
      expect({
        route,
        poweredBy: res.headers.get("x-powered-by"),
        nosniff: res.headers.get("x-content-type-options"),
        referrer: res.headers.get("referrer-policy"),
        frame: res.headers.get("x-frame-options"),
      }).toEqual({ route, poweredBy: null, nosniff: "nosniff", referrer: "no-referrer", frame: "DENY" });
    }
    // The auth gate answered that row, not the route handler.
    expect(responses.find(([route]) => route === "GET /mcp (401)")?.[1].status).toBe(401);
  });

  it("sends the hardening headers on the 403 for a non-allowlisted browser origin", async () => {
    const res = await rawRequest(
      base,
      "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: https://evil.example.test\r\n" +
        "Content-Length: 0\r\nConnection: close\r\n\r\n"
    );
    expect(res).toContain("403 Forbidden");
    expect(res).toMatch(/X-Content-Type-Options: nosniff\r\n/i);
    expect(res).toMatch(/Referrer-Policy: no-referrer\r\n/i);
    expect(res).toMatch(/X-Frame-Options: DENY\r\n/i);
    expect(res).not.toMatch(/X-Powered-By/i);
  });

  it("sends HSTS when the request arrived over https at the proxy", async () => {
    // TRUST_PROXY defaults to one hop, so X-Forwarded-Proto makes req.secure true —
    // the same path production takes behind its TLS-terminating proxy.
    const res = await fetch(`${base}/health`, { headers: { "X-Forwarded-Proto": "https" } });
    expect(res.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
  });

  it("omits HSTS on plain http, so local runs are unaffected", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });

  it("omits HSTS for a forwarded https claim when no proxy is trusted", async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.env.TRUST_PROXY = "false";
    server = await startHttpServer("https://api.example.test", "https://issuer.example.test", "9.9.9", 0, "127.0.0.1");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected a TCP address");
    const res = await fetch(`http://127.0.0.1:${addr.port}/health`, { headers: { "X-Forwarded-Proto": "https" } });
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });

  it("marks the protected-resource document no-store", async () => {
    // The body varies by Host in Host mode; a shared cache must never store it.
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("marks the 401 challenge no-store", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
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
        // Required on a modern-era (2026-07-28) request: the SDK 400s if the
        // header and body method disagree, which is a body-vs-header parity
        // check the pass-through tests below need to clear to reach 200 rather
        // than being masked by a loose `not.toBe(401)` assertion.
        "Mcp-Method": "tools/list",
        "Mcp-Protocol-Version": "2026-07-28",
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

  it("answers a forged token naming a kid the JWKS lacks with 401, including inside the refetch cooldown", async () => {
    // RS256, an invented kid, a future exp and a garbage signature used to
    // reach tools/list unauthenticated. The first request triggers the JWKS fetch;
    // the second lands inside the 60 s cooldown, which must not reopen the gate.
    const forged = `${segment({ alg: "RS256", kid: "attacker-chosen" })}.${segment({
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: process.env.MCP_CANONICAL_ORIGIN,
    })}.${Buffer.from("not-a-signature").toString("base64url")}`;

    for (const attempt of [1, 2]) {
      const res = await post(forged);

      expect(res.status, `attempt ${attempt}`).toBe(401);
      expect(res.headers.get("www-authenticate"), `attempt ${attempt}`).toContain('error="invalid_token"');
    }
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

    // Exact 200, not just "not 401": `not.toBe(401)` would also pass if the
    // gate crashed into the error middleware, which is not what this asserts.
    expect(res.status).toBe(200);
  });

  it("lets a valid token through when its audience keeps the /mcp path", async () => {
    // The regression guard for the audience-by-origin ruling: ResourceUriHelper.
    // NormalizeResourceUri keeps the path, so a real-world audience looks like
    // this, not like the bare origin.
    const token = await mint({
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: `${process.env.MCP_CANONICAL_ORIGIN}/mcp`,
    });

    const res = await post(token);

    expect(res.status).toBe(200);
  });

  it("fails open when the JWKS cannot be reached", async () => {
    // Degraded, not broken: the request reaches the handler and the API remains
    // the authority, exactly as before this change.
    //
    // Exact 200, not just "not 401": `not.toBe(401)` would also pass if the
    // gate crashed into the error middleware, which is not what this asserts.
    // This is the test that proves the fail-open design's whole point --
    // availability -- so it needs to be the strictest one here, not the loosest.
    await new Promise<void>((resolve) => jwks.close(() => resolve()));
    const token = await mint({
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: process.env.MCP_CANONICAL_ORIGIN,
    });

    const res = await post(token);

    expect(res.status).toBe(200);
  });

  it("skips validation entirely when REQUIRE_AUTH=false", async () => {
    process.env.REQUIRE_AUTH = "false";
    try {
      const res = await post("sk-not-a-jwt");
      // Exact 200, not just "not 401": `not.toBe(401)` would also pass if the
      // gate crashed into the error middleware, which is not what this asserts.
      expect(res.status).toBe(200);
    } finally {
      delete process.env.REQUIRE_AUTH;
    }
  });

  it("logs a wrong-audience rejection without the audience value", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });
    try {
      const token = await mint({
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: "https://someone-else.test/mcp",
      });

      const res = await post(token);

      expect(res.status).toBe(401);
      expect(errors.some((line) => line.includes("auth=rejected reason=wrong-audience"))).toBe(true);
      // The audience is client-chosen and unbounded, so it never reaches the log.
      expect(errors.some((line) => line.includes("someone-else.test"))).toBe(false);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("accepts a legacy-audience token when the origin is configured", async () => {
    // Tokens minted without a resource parameter (and client-credentials tokens)
    // carry this audience; enforcing the origin must not lock them out.
    const token = await mint({
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: "Sequentum Enterprise",
    });

    const res = await post(token);

    expect(res.status).toBe(200);
  });

  it("answers a wrong-audience token on GET /mcp with 401", async () => {
    const token = await mint({
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: "https://someone-else.test",
    });

    const res = await fetch(`${base}/mcp`, {
      method: "GET",
      headers: { accept: "text/event-stream", authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
  });

  describe("wrong-audience falls back to pass-through without a configured origin", () => {
    // Without a configured origin the comparison target is the caller's own Host,
    // so rejecting would add no security and could lock out every user behind a
    // proxy whose Host differs from the public origin.
    let errors: string[];

    beforeEach(() => {
      errors = [];
      vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    for (const [label, value] of [["unset", undefined], ["unparseable", "mcp.sequentum.com"]] as const) {
      it(`passes a wrong-audience token through when MCP_CANONICAL_ORIGIN is ${label}`, async () => {
        if (value === undefined) delete process.env.MCP_CANONICAL_ORIGIN;
        else process.env.MCP_CANONICAL_ORIGIN = value;
        const token = await mint({
          exp: Math.floor(Date.now() / 1000) + 3600,
          aud: "https://someone-else.test",
        });

        const res = await post(token);

        expect(res.status).toBe(200);
        expect(errors.some((line) => line.includes("auth=unverifiable reason=wrong-audience"))).toBe(true);
      });
    }
  });

  describe("MCP_CANONICAL_ORIGIN takes priority over the Host header", () => {
    // The outer beforeEach pins MCP_CANONICAL_ORIGIN to `${ORIGIN_ENV}:${addr.port}`,
    // which is byte-identical to what getMcpServerOrigin derives from the request's
    // Host header. That makes the env branch in configuredOrigin() untested: deleting
    // it entirely would not fail a single test above. Overriding it here to a
    // genuinely distinct origin, and then asserting on an audience equal to the
    // Host-derived value (now NOT the canonical one), is what actually proves the
    // env var wins over Host rather than merely coinciding with it. The outer
    // afterEach deletes MCP_CANONICAL_ORIGIN unconditionally, so no extra cleanup
    // is needed here.
    const CANONICAL = "https://mcp.example.test";

    beforeEach(() => {
      process.env.MCP_CANONICAL_ORIGIN = CANONICAL;
    });

    it("accepts a token whose audience is the pinned canonical origin", async () => {
      const token = await mint({
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: CANONICAL,
      });

      const res = await post(token);

      expect(res.status).toBe(200);
    });

    it("rejects (401) a token whose audience is the Host-derived origin instead of the pinned one", async () => {
      // This token's aud matches what Host would derive, but MCP_CANONICAL_ORIGIN
      // now points elsewhere, so it no longer matches. With the origin configured
      // that is a rejection: the challenge names the pinned origin, not Host.
      const token = await mint({
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: base,
      });

      const res = await post(token);

      expect(res.status).toBe(401);
      const challenge = res.headers.get("www-authenticate");
      expect(challenge).toContain('error="invalid_token"');
      expect(challenge).toContain(`resource_metadata="${CANONICAL}/.well-known/oauth-protected-resource"`);
    });
  });

  describe("an unparseable MCP_CANONICAL_ORIGIN falls back to the Host header", () => {
    // configuredOrigin()'s malformed-value path had no coverage: deleting it
    // would not fail a test. Status alone cannot pin it either, because
    // wrong-audience passes through whenever no origin is configured -- a fallback that resolved to the WRONG
    // origin also answers 200. The discriminating signal is the ABSENCE of a
    // wrong-audience log line, which only holds if the fallback really landed
    // on the Host-derived origin that this token's `aud` names.
    const MALFORMED = "mcp.sequentum.com";  // no scheme, so `new URL` throws

    let errors: string[];

    beforeEach(() => {
      process.env.MCP_CANONICAL_ORIGIN = MALFORMED;
      errors = [];
      vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("validates the token against the Host-derived origin, silently", async () => {
      const token = await mint({
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: base,
      });

      const res = await post(token);

      expect(res.status).toBe(200);
      expect(errors.some((line) => line.includes("wrong-audience"))).toBe(false);
      // The per-request path stays quiet; auditCanonicalOrigin owns the warning.
      // Without this, reinstating a per-request warn would go unnoticed.
      expect(errors.some((line) => line.includes("not a valid http(s) URL"))).toBe(false);
    });

    it("still rejects an expired token, so the fallback does not weaken the gate", async () => {
      // The fallback changes which origin is advertised and which `aud` is expected,
      // never whether the token is checked.
      // Expiry is checked before the audience, so a malformed env value must not
      // turn the SE4-3856 regression guard back into a 200.
      const token = await mint({
        exp: Math.floor(Date.now() / 1000) - 3600,
        aud: base,
      });

      const res = await post(token);

      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain("Bearer");
    });
  });
});

// A tool's required scopes are checked before dispatch, so a token that lacks
// one gets the RFC 6750 step-up challenge (HTTP 403) instead of a tool error carried on a
// 200 after a wasted round trip to the Control Center.
describe("per-tool scope challenge on /mcp", () => {
  let server: HttpServer;
  let controlCenter: HttpServer;
  let base: string;
  let pair: CryptoKeyPair;
  let apiCalls: string[];

  const KID = "scope-key";

  function segment(obj: unknown): string {
    return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  }

  async function mint(claims: Record<string, unknown>): Promise<string> {
    const payload = { exp: Math.floor(Date.now() / 1000) + 3600, aud: process.env.MCP_CANONICAL_ORIGIN, ...claims };
    const input = `${segment({ alg: "RS256", kid: KID })}.${segment(payload)}`;
    const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, pair.privateKey, new TextEncoder().encode(input));
    return `${input}.${Buffer.from(sig).toString("base64url")}`;
  }

  /** A user token as Control Center's OAuthService.GenerateUserToken mints it. */
  function userToken(scope: string): Promise<string> {
    return mint({ scope, clientId: "https://client.example.test/cimd.json", token_type: "authorization_code" });
  }

  /** An agent token as Control Center mints it for a claimed agent registration: no clientId. */
  function agentToken(scope: string): Promise<string> {
    return mint({ scope, token_type: "agent" });
  }

  function callTool(token: string, name: string, era: "modern" | "legacy") {
    const modern = era === "modern";
    return fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        ...(modern ? { "Mcp-Method": "tools/call", "Mcp-Name": name, "Mcp-Protocol-Version": "2026-07-28" } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: {}, ...(modern ? { _meta: ENVELOPE } : {}) },
      }),
    });
  }

  function readResource(token: string, uri: string) {
    return fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        "Mcp-Method": "resources/read",
        "Mcp-Name": uri,
        "Mcp-Protocol-Version": "2026-07-28",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri, _meta: ENVELOPE } }),
    });
  }

  beforeEach(async () => {
    delete process.env.REQUIRE_AUTH;
    apiCalls = [];

    pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);

    // A stand-in Control Center: serves the JWKS and records every V1 API call, so a test
    // can prove a challenged request never reached the upstream API.
    controlCenter = createServer((req, res) => {
      if (req.url === "/api/oauth/certs") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ keys: [{ kty: "RSA", use: "sig", alg: "RS256", kid: KID, n: jwk.n, e: jwk.e }] }));
        return;
      }
      if (req.url?.startsWith("/api/v1/")) {
        apiCalls.push(`${req.method} ${req.url.split("?")[0]}`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end("[]");
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => controlCenter.listen(0, "127.0.0.1", () => resolve()));
    const ccAddr = controlCenter.address();
    if (!ccAddr || typeof ccAddr === "string") throw new Error("expected a TCP address");
    const apiBase = `http://127.0.0.1:${ccAddr.port}`;

    server = await startHttpServer(apiBase, apiBase, "9.9.9", 0, "127.0.0.1");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected a TCP address");
    base = `http://127.0.0.1:${addr.port}`;
    process.env.MCP_CANONICAL_ORIGIN = base;
  });

  afterEach(async () => {
    delete process.env.MCP_CANONICAL_ORIGIN;
    delete process.env.REQUIRE_AUTH;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Already closed by the fail-open test; close() then reports an error, which is fine.
    await new Promise<void>((resolve) => controlCenter.close(() => resolve()));
  });

  for (const era of ["modern", "legacy"] as const) {
    it(`answers a ${era} tools/call missing the tool's scope with 403 and a step-up challenge`, async () => {
      const res = await callTool(await userToken("runs:read offline_access"), "list_agents", era);

      expect(res.status).toBe(403);
      const challenge = res.headers.get("www-authenticate") ?? "";
      expect(challenge).toContain('error="insufficient_scope"');
      // Granted scopes first, the missing one appended; offline_access never advertised.
      expect(challenge).toContain('scope="runs:read agents:read"');
      expect(challenge).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource"`);
      expect(apiCalls).toEqual([]);
    });
  }

  it("points the step-up challenge at the canonical origin, not Host", async () => {
    // beforeEach pins MCP_CANONICAL_ORIGIN to `base`, which is also what Host derives, so
    // the test above cannot tell the two apart. A distinct value can. `mint` reads the env
    // for `aud`, so the token still matches and `req.auth` is attached.
    process.env.MCP_CANONICAL_ORIGIN = "https://mcp.example.test";
    const res = await callTool(await userToken("runs:read offline_access"), "list_agents", "modern");

    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource"'
    );
  });

  it("never forwards a wrong-audience token to the Control Center", async () => {
    const token = await mint({
      scope: "agents:read",
      clientId: "https://client.example.test/cimd.json",
      token_type: "authorization_code",
      aud: "https://someone-else.test",
    });

    const res = await callTool(token, "list_agents", "modern");

    expect(res.status).toBe(401);
    expect(apiCalls).toEqual([]);
  });

  it("dispatches a tools/call whose token holds the tool's scope", async () => {
    const res = await callTool(await userToken("agents:read"), "list_agents", "modern");

    expect(res.status).toBe(200);
    expect(apiCalls).toEqual(["GET /api/v1/agent/all"]);
  });

  it("challenges a token granted no scopes at all, as the Control Center denies it", async () => {
    const res = await callTool(await userToken(""), "get_credits_balance", "modern");

    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toContain('scope="billing:read"');
    expect(apiCalls).toEqual([]);
  });

  it("challenges a resources/read missing the endpoint's scope", async () => {
    const res = await readResource(await userToken("agents:read"), "sequentum://billing/balance");

    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toContain('scope="agents:read billing:read"');
    expect(apiCalls).toEqual([]);
  });

  it("challenges a templated resources/read missing the endpoint's scope", async () => {
    const res = await readResource(await userToken("agents:read"), "sequentum://agents/1/runs");

    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toContain('scope="agents:read runs:read"');
  });

  it("challenges an agent token missing the tool's scope, as it does a user token", async () => {
    const token = await agentToken("runs:read");

    const res = await callTool(token, "list_agents", "modern");

    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
    expect(res.headers.get("www-authenticate")).toContain('scope="runs:read agents:read"');
    expect(apiCalls).toEqual([]);
  });

  it("dispatches an agent token that holds the tool's scope", async () => {
    const res = await callTool(await agentToken("agents:read"), "list_agents", "modern");

    expect(res.status).toBe(200);
    expect(apiCalls).toEqual(["GET /api/v1/agent/all"]);
  });

  it("does not challenge a client_credentials token, which the Control Center exempts", async () => {
    const token = await mint({ clientId: "server-key", token_type: "client_credentials" });

    const res = await callTool(token, "list_agents", "modern");

    expect(res.status).toBe(200);
    expect(apiCalls).toEqual(["GET /api/v1/agent/all"]);
  });

  it("does not challenge when the token cannot be verified, keeping the fail-open path", async () => {
    await new Promise<void>((resolve) => controlCenter.close(() => resolve()));

    const res = await callTool(await userToken(""), "list_agents", "modern");

    // Reaches the handler (whose upstream call then fails): neither challenged nor rejected.
    expect(res.status).toBe(200);
  });

  it("does not challenge when REQUIRE_AUTH=false", async () => {
    process.env.REQUIRE_AUTH = "false";

    const res = await callTool(await userToken(""), "list_agents", "modern");

    expect(res.status).toBe(200);
    expect(apiCalls).toEqual(["GET /api/v1/agent/all"]);
  });
});
