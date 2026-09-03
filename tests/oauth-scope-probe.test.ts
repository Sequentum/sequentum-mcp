import { describe, it, expect } from "vitest";
import { judgeMcp, judgeV1, expectedLogLine } from "../scripts/oauth-scope-probe.mjs";

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
