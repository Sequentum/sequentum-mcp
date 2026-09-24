import { describe, it, expect } from "vitest";
import { judgeGrant, judgeMcp, judgeV1, expectedLogLine, judgeTokenError, tokenExchangeRow, GENERIC_INVALID_GRANT } from "../scripts/oauth-scope-probe.mjs";

// judgeMcp: enforce mode, granted scopes missing the one this call requires (a mismatch).
describe("judgeMcp — enforce mode, scope mismatch (SE4-3929)", () => {
  const granted = new Set(["agents:read"]);

  it("passes on the new Insufficient Scope text that names the required scope", () => {
    const call = {
      required: "billing:read",
      httpStatus: 200,
      isError: true,
      text: 'Insufficient Scope: This action requires the "billing:read" scope, which this Sequentum MCP connection was not granted. Disconnect and reconnect the Sequentum MCP server, then approve the requested permissions, to re-authorize.',
    };
    const result = judgeMcp(call, granted, "enforce");
    expect(result.ok).toBe(true);
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

describe("judgeMcp — log-only mode is unaffected by the SE4-3929 change", () => {
  it("still expects a plain tool-ok result for a scope mismatch under log-only", () => {
    const granted = new Set(["agents:read"]);
    const call = { required: "billing:read", httpStatus: 200, isError: false, text: "" };
    const result = judgeMcp(call, granted, "log-only");
    expect(result.ok).toBe(true);
  });

  it("still expects ok on a granted scope regardless of mode", () => {
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
