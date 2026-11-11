import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { judgeGrant, judgeMcp, judgeV1, expectedLogLine, linesForToken, judgeTokenError, tokenExchangeRow, GENERIC_INVALID_GRANT } from "../scripts/oauth-scope-probe.mjs";
import { judgeAuthMdRedirect, classifyClaimPoll, judgeRequestedScope, effectiveScope, jwtAudience, jwtScope, judgeAudience, pollClaim } from "../scripts/oauth-scope-probe.mjs";

// The MCP server answers a scope mismatch itself, before dispatch, in either mode.
describe("judgeMcp — pre-dispatch scope challenge", () => {
  const granted = new Set(["agents:read"]);
  const challenged = (www: string) => ({ required: "billing:read", httpStatus: 403, isError: null, text: "", wwwAuthenticate: www });

  it("passes on a 403 insufficient_scope challenge naming the required scope, in both modes", () => {
    const call = challenged('Bearer error="insufficient_scope", scope="agents:read billing:read", resource_metadata="https://x/.well-known/oauth-protected-resource"');
    expect(judgeMcp(call, granted, "enforce")).toMatchObject({ ok: true, note: "" });
    expect(judgeMcp(call, granted, "log-only")).toMatchObject({ ok: true, note: "" });
  });

  it("fails on a 403 whose challenge does not name the required scope", () => {
    expect(judgeMcp(challenged('Bearer error="insufficient_scope", scope="agents:read"'), granted, "enforce").ok).toBe(false);
  });

  it("fails on a 403 without an insufficient_scope challenge", () => {
    expect(judgeMcp(challenged(""), granted, "enforce").ok).toBe(false);
  });

  it("fails on a 403 for a call whose scope was granted", () => {
    const call = { ...challenged('Bearer error="insufficient_scope", scope="billing:read"'), required: "agents:read" };
    expect(judgeMcp(call, granted, "enforce").ok).toBe(false);
  });

  it("fails on a mismatched call answered with neither 200 nor 403, expecting the challenge", () => {
    const call = { required: "billing:read", httpStatus: 500, isError: null, text: "boom" };
    expect(judgeMcp(call, granted, "enforce")).toMatchObject({ ok: false, expected: "403 scope challenge", observed: "HTTP 500" });
  });

  it("still passes an older build that dispatched the mismatched call, flagged as such", () => {
    const call = { required: "billing:read", httpStatus: 200, isError: false, text: "" };
    const result = judgeMcp(call, granted, "log-only");
    expect(result.ok).toBe(true);
    expect(result.note).toContain("no pre-dispatch scope challenge");
  });
});

// judgeMcp: an older MCP build without the pre-dispatch check, which dispatched the call, in
// enforce mode, granted scopes missing the one this call requires (a mismatch).
describe("judgeMcp — older build without the pre-dispatch check, enforce mode, scope mismatch (SE4-3929)", () => {
  const granted = new Set(["agents:read"]);

  it("passes on the Insufficient Scope text that names the required scope, flagged as an older build", () => {
    const call = {
      required: "billing:read",
      httpStatus: 200,
      isError: true,
      text: 'Insufficient Scope: This action requires the "billing:read" scope, which this Sequentum MCP connection was not granted. Disconnect and reconnect the Sequentum MCP server, then approve the requested permissions, to re-authorize.',
    };
    const result = judgeMcp(call, granted, "enforce");
    expect(result.ok).toBe(true);
    expect(result.note).toContain("no pre-dispatch scope challenge");
  });

  it("fails when the Insufficient Scope text names a different scope than required", () => {
    const call = {
      required: "billing:read",
      httpStatus: 200,
      isError: true,
      text: 'Insufficient Scope: This action requires the "spaces:write" scope, which this Sequentum MCP connection was not granted. Disconnect and reconnect the Sequentum MCP server, then approve the requested permissions, to re-authorize.',
    };
    const result = judgeMcp(call, granted, "enforce");
    expect(result.ok).toBe(false);
  });

  it("still passes on the old fixed Access Denied text, with a note that the scope name was not surfaced", () => {
    const call = {
      required: "billing:read",
      httpStatus: 200,
      isError: true,
      text: "Access Denied: You don't have permission to perform this action. Check your API key permissions.",
    };
    const result = judgeMcp(call, granted, "enforce");
    expect(result.ok).toBe(true);
    expect(result.note.toLowerCase()).toContain("scope name not surfaced");
  });

  it("fails when the mismatched call unexpectedly succeeds", () => {
    const call = { required: "billing:read", httpStatus: 200, isError: false, text: "" };
    const result = judgeMcp(call, granted, "enforce");
    expect(result.ok).toBe(false);
  });

  it("fails on an unrelated error message (neither Insufficient Scope nor Access Denied)", () => {
    const call = { required: "billing:read", httpStatus: 200, isError: true, text: "Not Found: Agent 42 not found" };
    const result = judgeMcp(call, granted, "enforce");
    expect(result.ok).toBe(false);
  });
});

// A log-only scope mismatch on an older build is covered by "still passes an older build that
// dispatched the mismatched call" above.
describe("judgeMcp — granted scope", () => {
  it("expects ok on a granted scope regardless of mode", () => {
    const granted = new Set(["billing:read"]);
    const call = { required: "billing:read", httpStatus: 200, isError: false, text: "" };
    expect(judgeMcp(call, granted, "enforce").ok).toBe(true);
    expect(judgeMcp(call, granted, "log-only").ok).toBe(true);
  });
});

describe("judgeV1 smoke (unchanged by this ticket)", () => {
  it("expects 2xx for a matching scope in enforce mode", () => {
    const granted = new Set(["agents:read"]);
    const call = { required: "agents:read", status: 200, ok2xx: true, body: "", headers: new Map() };
    expect(judgeV1(call, granted, "enforce").ok).toBe(true);
  });

  it("expects 403 insufficient_scope for a mismatched scope in enforce mode", () => {
    const granted = new Set(["agents:read"]);
    const headers = new Map([["www-authenticate", 'Bearer error="insufficient_scope", scope="billing:read"']]);
    const call = {
      required: "billing:read",
      status: 403,
      ok2xx: false,
      body: JSON.stringify({ errorCode: "insufficient_scope" }),
      headers,
    };
    expect(judgeV1(call, granted, "enforce").ok).toBe(true);
  });
});

describe("judgeTokenError (SE4-3922)", () => {
  const r = (status: number, body: unknown) => ({ status, text: JSON.stringify(body) });

  it("passes when status, error and error_description all match", () => {
    const result = judgeTokenError(r(400, { error: "invalid_request", error_description: "client_id is required" }), 400, "invalid_request", "client_id is required");
    expect(result.ok).toBe(true);
  });

  it("fails on a status mismatch even if the body matches", () => {
    const result = judgeTokenError(r(200, { error: "invalid_request", error_description: "client_id is required" }), 400, "invalid_request", "client_id is required");
    expect(result.ok).toBe(false);
  });

  it("fails when the wrong error code is returned", () => {
    const result = judgeTokenError(r(400, { error: "invalid_grant", error_description: "client_id is required" }), 400, "invalid_request", "client_id is required");
    expect(result.ok).toBe(false);
  });

  it("fails when the wording differs, even for the same error code (wrong-client_id must read exactly like an unknown token)", () => {
    const result = judgeTokenError(r(400, { error: "invalid_grant", error_description: "client_id does not match" }), 400, "invalid_grant", GENERIC_INVALID_GRANT);
    expect(result.ok).toBe(false);
  });

  it("passes for the generic invalid_grant body shared by an unknown token and a client_id mismatch", () => {
    const result = judgeTokenError(r(400, { error: "invalid_grant", error_description: GENERIC_INVALID_GRANT }), 400, "invalid_grant", GENERIC_INVALID_GRANT);
    expect(result.ok).toBe(true);
  });
});

describe("expectedLogLine smoke (unchanged by this ticket)", () => {
  it("formats the enforce-mode denied line", () => {
    expect(expectedLogLine("enforce", "POST", "/api/v1/agent/1/start", "agents:write", "agents:read", "mcp-abc")).toBe(
      "Scope check denied for POST /api/v1/agent/1/start: required=agents:write granted=agents:read clientId=mcp-abc"
    );
  });

  it("formats the log-only would-deny line", () => {
    expect(expectedLogLine("log-only", "GET", "/api/v1/spaces", "spaces:read", "", "mcp-abc")).toBe(
      "Scope check would deny (log-only) for GET /api/v1/spaces: required=spaces:read granted= clientId=mcp-abc"
    );
  });
});

// SE4-3895: a client that sends no scope now gets the six API scopes (the server default). The
// token-exchange row must check what was granted, or the `none` profile passes with or without it.
describe("judgeGrant (SE4-3895 default scope)", () => {
  const SIX = "agents:read agents:write runs:read spaces:read spaces:write billing:read";

  it("fails the none profile on an empty grant, and says the default was not applied", () => {
    const result = judgeGrant("none", "");
    expect(result.ok).toBe(false);
    expect(result.note).toContain("default scope");
  });

  it("passes the none profile on the six API scopes, in any order", () => {
    expect(judgeGrant("none", SIX).ok).toBe(true);
    expect(judgeGrant("none", "billing:read spaces:write spaces:read runs:read agents:write agents:read").ok).toBe(true);
  });

  it("fails the none profile when the default adds offline_access", () => {
    expect(judgeGrant("none", `${SIX} offline_access`).ok).toBe(false);
  });

  it("passes the read profile on exactly agents:read", () => {
    expect(judgeGrant("read", "agents:read").ok).toBe(true);
  });

  it("fails the read profile when the server widens it", () => {
    const result = judgeGrant("read", SIX);
    expect(result.ok).toBe(false);
    expect(result.note).toContain("billing:read");
  });

  it("passes the all profile on the six API scopes plus offline_access, ignoring identity scopes", () => {
    expect(judgeGrant("all", `openid ${SIX} offline_access`).ok).toBe(true);
  });

  it("fails the all profile when an API scope is missing, and names it", () => {
    const result = judgeGrant("all", "agents:read agents:write runs:read spaces:read spaces:write offline_access");
    expect(result.ok).toBe(false);
    expect(result.note).toContain("billing:read");
  });
});

describe("tokenExchangeRow (SE4-3895)", () => {
  const SIX = "agents:read agents:write runs:read spaces:read spaces:write billing:read";

  it("fails the none profile when the server granted no scope", () => {
    const r = tokenExchangeRow("none", { scope: "", refreshToken: null });
    expect(r.ok).toBe(false);
  });

  it("passes the none profile on the default, shows the scope, and keeps the refresh-token note", () => {
    const r = tokenExchangeRow("none", { scope: SIX, refreshToken: null });
    expect(r.ok).toBe(true);
    expect(r.observed).toContain(SIX);
    expect(r.note).toContain("no refresh_token");
  });

  it("keeps the refresh_token issued note on a passing all profile", () => {
    const r = tokenExchangeRow("all", { scope: `${SIX} offline_access`, refreshToken: "rt" });
    expect(r.ok).toBe(true);
    expect(r.note).toContain("refresh_token issued");
  });
});

// linesForToken: the "none" profile's no-lines check counted the "read" profile's denied lines,
// logged seconds earlier for the same client (QA run, 29 Sep 2026).
describe("linesForToken — only this profile's lines", () => {
  const SIX = "agents:read agents:write runs:read spaces:read spaces:write billing:read";
  const ALL = SIX + " offline_access";
  const line = (granted: string, clientId = "mcp-abc") =>
    `2026-09-29 19:46:12.607 [WRN] Scope check denied for GET /api/v1/spaces: required=spaces:read granted=${granted} clientId=${clientId}`;

  it("drops the previous profile's lines for the same client", () => {
    expect(linesForToken([line("agents:read"), line("agents:read")], SIX, "mcp-abc")).toEqual([]);
  });

  it("keeps a line logged for this token's scope", () => {
    expect(linesForToken([line("agents:read"), line(SIX)], SIX, "mcp-abc")).toEqual([line(SIX)]);
  });

  it("does not mistake the six-scope default for the six scopes plus offline_access", () => {
    expect(linesForToken([line(ALL)], SIX, "mcp-abc")).toEqual([]);
    expect(linesForToken([line(SIX)], ALL, "mcp-abc")).toEqual([]);
  });

  it("keeps an empty-scope line for an empty-scope token", () => {
    expect(linesForToken([line(""), line("agents:read")], "", "mcp-abc")).toEqual([line("")]);
  });

  it("treats a missing scope as empty, never as the text 'undefined'", () => {
    expect(linesForToken([line("")], undefined as unknown as string, "mcp-abc")).toEqual([line("")]);
  });

  it("ignores another client's line", () => {
    expect(linesForToken([line(SIX, "mcp-other")], SIX, "mcp-abc")).toEqual([]);
  });

  it("matches a line whose values the logger quoted", () => {
    const quoted = `Scope check denied for GET /api/v1/spaces: required="spaces:read" granted="${SIX}" clientId="mcp-abc"`;
    expect(linesForToken([quoted], SIX, "mcp-abc")).toEqual([quoted]);
  });
});

// the auth.md path.
const MANIFEST = "https://dashboard-qa.sequentum.com/auth.md";
const res = (status: number, text = "", headers: Record<string, string> = {}) => ({ status, text, headers: new Headers(headers) });

describe("judgeAuthMdRedirect", () => {
  it("passes a 302 to the issuer's manifest", () => {
    expect(judgeAuthMdRedirect(res(302, "", { location: MANIFEST }), MANIFEST)).toMatchObject({ ok: true, note: "" });
  });

  it("fails a redirect to the wrong place, naming both", () => {
    const j = judgeAuthMdRedirect(res(302, "", { location: "https://other.example/auth.md" }), MANIFEST);
    expect(j.ok).toBe(false);
    expect(j.note).toContain("other.example");
    expect(j.note).toContain(MANIFEST);
  });

  it("fails a permanent redirect: the target is environment-specific", () => {
    expect(judgeAuthMdRedirect(res(301, "", { location: MANIFEST }), MANIFEST).ok).toBe(false);
  });

  it("fails a 404, as an MCP build without the route answers", () => {
    expect(judgeAuthMdRedirect(res(404), MANIFEST)).toMatchObject({ ok: false, observed: "HTTP 404" });
  });
});

describe("classifyClaimPoll", () => {
  const success = { access_token: "a", identity_assertion: "b", scope: "agents:read" };

  it("recognises a completed claim", () => {
    expect(classifyClaimPoll(res(200, JSON.stringify(success)))).toMatchObject({ kind: "success", body: success });
  });

  it("does not treat a 200 without an identity_assertion as success", () => {
    expect(classifyClaimPoll(res(200, JSON.stringify({ access_token: "a" }))).kind).toBe("error");
  });

  it.each([
    ["authorization_pending", "pending"],
    ["slow_down", "slow_down"],
    ["expired_token", "expired"],
  ])("maps %s to %s", (error, kind) => {
    expect(classifyClaimPoll(res(400, JSON.stringify({ error }))).kind).toBe(kind);
  });

  it("treats HTTP 429 as slow_down and carries Retry-After", () => {
    expect(classifyClaimPoll(res(429, "", { "retry-after": "12" }))).toEqual({ kind: "slow_down", retryAfterSec: 12 });
  });

  it("reports an unknown error instead of polling forever", () => {
    const poll = classifyClaimPoll(res(400, JSON.stringify({ error: "invalid_grant" })));
    expect(poll.kind).toBe("error");
    expect(poll.note).toContain("invalid_grant");
  });

  it.each([500, 502, 503, 504])("keeps polling through a transient HTTP %i", (status) => {
    // A Control Center deploy during the claim wait must not waste the tester's claim.
    expect(classifyClaimPoll(res(status, "Bad Gateway"))).toMatchObject({ kind: "transient", note: expect.stringContaining(`HTTP ${status}`) });
  });
});

describe("judgeRequestedScope", () => {
  it("passes exactly the requested scopes, in any order", () => {
    expect(judgeRequestedScope(["agents:read", "runs:read"], "runs:read agents:read").ok).toBe(true);
  });

  it("fails a widened grant", () => {
    expect(judgeRequestedScope(["agents:read"], "agents:read billing:read")).toMatchObject({ ok: false, note: "extra: billing:read" });
  });

  it("fails a narrowed grant", () => {
    expect(judgeRequestedScope(["agents:read", "runs:read"], "agents:read")).toMatchObject({ ok: false, note: "missing: runs:read" });
  });

  it("treats an omitted scope as the requested one (RFC 6749 section 5.1)", () => {
    expect(judgeRequestedScope(["agents:read", "runs:read"], undefined).ok).toBe(true);
    expect(judgeRequestedScope(["agents:read", "runs:read"], null).ok).toBe(true);
  });
});

describe("effectiveScope", () => {
  it("keeps a scope the response states, even an empty one", () => {
    expect(effectiveScope(["agents:read"], "agents:read billing:read")).toBe("agents:read billing:read");
    expect(effectiveScope(["agents:read"], "")).toBe("");
  });

  it("falls back to the requested scopes when the response omits scope", () => {
    expect(effectiveScope(["agents:read", "runs:read"], undefined)).toBe("agents:read runs:read");
  });

  it("prefers the token's own scope claim over the requested scopes when the response has none", () => {
    // The MCP server enforces the JWT claim, so an omitted or null response scope must not hide
    // a widened or empty token behind the requested scopes.
    expect(effectiveScope(["agents:read"], undefined, "agents:read billing:read")).toBe("agents:read billing:read");
    expect(effectiveScope(["agents:read"], null, "")).toBe("");
    expect(effectiveScope(["agents:read"], "agents:read", "agents:read billing:read")).toBe("agents:read");
  });
});

describe("jwtScope", () => {
  const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

  it("reads the scope claim of a readable JWT", () => {
    expect(jwtScope(jwt({ scope: "agents:read runs:read" }))).toBe("agents:read runs:read");
    expect(jwtScope(jwt({ scope: "" }))).toBe("");
  });

  it("returns null for a token that is not a readable JWT", () => {
    expect(jwtScope("opaque")).toBeNull();
  });

  it("returns an empty scope for a readable JWT with no string scope claim, as the validator grants nothing", () => {
    expect(jwtScope(jwt({ sub: "x" }))).toBe("");
    expect(jwtScope(jwt({ scope: ["agents:read"] }))).toBe("");
  });
});

describe("pollClaim", () => {
  const env = { baseUrl: "https://cc.example.test" };
  const endpoints = { token: "https://cc.example.test/token", claim: "https://cc.example.test/claim" };
  const done = { access_token: "a", identity_assertion: "b" };
  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    () => Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers }));
  const pending = reply(400, { error: "authorization_pending" });
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    fetchMock = vi.fn(pending);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const run = () => pollClaim(env, endpoints, "claim-token", { interval: 1 }, "you@example.com");

  it("polls through a 5xx and returns the completed claim", async () => {
    fetchMock.mockImplementationOnce(reply(502, "Bad Gateway")).mockImplementationOnce(reply(200, done));
    const p = run();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(p).resolves.toEqual(done);
  });

  it("polls through a transport failure and returns the completed claim", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("fetch failed"))).mockImplementationOnce(reply(200, done));
    const p = run();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(p).resolves.toEqual(done);
  });

  it("does not let a server Retry-After outlast the five-minute deadline", async () => {
    fetchMock.mockImplementationOnce(reply(429, "", { "retry-after": "3600" }));
    const p = run();
    const settled = expect(p).rejects.toThrow(/not completed within 300s/);
    await vi.advanceTimersByTimeAsync(301_000);
    await settled;
  });

  it("names the last server error when a persistent 5xx runs out the clock", async () => {
    fetchMock.mockImplementation(reply(500, "boom"));
    const p = run();
    const settled = expect(p).rejects.toThrow(/HTTP 500/);
    await vi.advanceTimersByTimeAsync(301_000);
    await settled;
  });

  it("names the earlier server error when a retried delivery then fails", async () => {
    fetchMock.mockImplementationOnce(reply(500, "mint failed")).mockImplementationOnce(reply(400, { error: "invalid_grant" }));
    const p = run();
    const settled = expect(p).rejects.toThrow(/invalid_grant[\s\S]*HTTP 500/);
    await vi.advanceTimersByTimeAsync(5_000);
    await settled;
  });

  it("keeps both causes inside the summary's 100-character row", async () => {
    // runAuthMdMain cuts the message at 100 characters; the earlier cause must survive that.
    const delivered = { error: "invalid_grant", error_description: "This registration has already been delivered to its agent." };
    fetchMock.mockImplementationOnce(reply(500, "mint failed")).mockImplementationOnce(reply(400, delivered));
    const caught = run().catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(5_000);
    const message = String((await caught as Error).message);
    expect(message.length).toBeLessThanOrEqual(100);
    expect(message).toContain("invalid_grant");
    expect(message).toContain("HTTP 500");
  });

  describe("when the code expires", () => {
    // Off env.baseUrl, so showClaim prints it and never launches a browser during the test.
    const fresh = { claim_attempt: { user_code: "NEW-CODE", verification_uri: "https://elsewhere.example.test/claim", interval: 1 } };
    const expired = reply(400, { error: "expired_token" });
    const claimCalls = () => fetchMock.mock.calls.filter(([url]) => url === endpoints.claim);

    it("asks the claim endpoint for a fresh code and keeps polling", async () => {
      fetchMock.mockImplementationOnce(expired).mockImplementationOnce(reply(200, fresh)).mockImplementationOnce(reply(200, done));
      const p = run();
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(p).resolves.toEqual(done);
      expect(claimCalls()).toHaveLength(1);
      expect(JSON.parse(String(claimCalls()[0][1].body))).toEqual({ claim_token: "claim-token", email: "you@example.com" });
    });

    it.each([
      ["a 5xx", reply(502, "Bad Gateway")],
      ["a transport failure", () => Promise.reject(new TypeError("fetch failed"))],
    ])("asks the claim endpoint again after %s, without waiting for another expired_token", async (_label, failure) => {
      // The failed request may already have replaced the attempt, after which every poll answers
      // authorization_pending; only asking again shows the tester a code that works.
      fetchMock
        .mockImplementationOnce(expired).mockImplementationOnce(failure)
        .mockImplementationOnce(reply(200, fresh))
        .mockImplementationOnce(reply(200, done));
      const p = run();
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(p).resolves.toEqual(done);
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([endpoints.token, endpoints.claim, endpoints.claim, endpoints.token]);
    });

    it("keeps the refusal and the earlier cause inside the summary's 100-character row", async () => {
      const refused = { error: "claimed_or_in_flight", error_description: "This registration has already been claimed." };
      fetchMock.mockImplementationOnce(expired).mockImplementationOnce(reply(502, "Bad Gateway")).mockImplementationOnce(reply(400, refused));
      const caught = run().catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(10_000);
      const message = String((await caught as Error).message);
      expect(message.length).toBeLessThanOrEqual(100);
      expect(message).toContain("claimed_or_in_flight");
      expect(message).toContain("HTTP 502");
    });
  });
});

describe("jwtAudience / judgeAudience", () => {
  const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
  const origin = "https://mcp-qa.sequentum.com";

  it("reads a string or array audience", () => {
    expect(jwtAudience(jwt({ aud: origin }))).toEqual([origin]);
    expect(jwtAudience(jwt({ aud: [origin, "x"] }))).toEqual([origin, "x"]);
  });

  it("returns null for a token that is not a readable JWT", () => {
    expect(jwtAudience("opaque")).toBeNull();
  });

  it("returns an empty audience for a readable JWT with no aud, so the row fails", () => {
    // The validator reads a missing aud as an empty list and rejects the token as
    // wrong-audience; reporting it as unreadable would pass the row instead.
    expect(jwtAudience(jwt({ sub: "no-aud" }))).toEqual([]);
    expect(judgeAudience([], origin).ok).toBe(false);
  });

  it("matches by origin, as the validator does", () => {
    expect(judgeAudience([origin], origin).ok).toBe(true);
    expect(judgeAudience([`${origin}/mcp`], origin).ok).toBe(true);
    expect(judgeAudience([`${origin}/`], origin).ok).toBe(true);
    expect(judgeAudience(["not a url"], origin).ok).toBe(false);
  });

  it("rejects an audience that is the Control Center, not the MCP origin", () => {
    expect(judgeAudience(["https://dashboard-qa.sequentum.com"], origin).ok).toBe(false);
  });

  it("does not fail an unreadable token: the /mcp calls are the real test", () => {
    expect(judgeAudience(null, origin).ok).toBe(true);
  });
});
