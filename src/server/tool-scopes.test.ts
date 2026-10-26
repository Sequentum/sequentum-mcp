import { describe, expect, it } from "vitest";
import type { AuthInfo, JSONRPCRequest } from "@modelcontextprotocol/server";
import { tools } from "./tools.js";
import { resources, resourceTemplates } from "./resources.js";
import { API_SCOPES, OFFLINE_ACCESS_SCOPE } from "../utils/oauth-metadata.js";
import { RESOURCE_SCOPES, TOOL_SCOPES, scopeChallengeFor } from "./tool-scopes.js";

/**
 * The expected scope of every tool, written out by scope rather than derived, so it is an
 * independent second reading of Control Center's golden table
 * (SeControlCenter.Tests/OAuth/TestExternalV1ScopeMap.cs). tool-scopes.ts derives its
 * values from the controller actions each tool calls; if the two readings disagree, one
 * of them misread the Control Center.
 */
const EXPECTED_TOOL_SCOPES: Record<string, readonly string[]> = {
  ...forEach("agents:read", [
    "list_agents",
    "get_agent",
    "search_agents",
    "get_agent_search_count",
    "get_personal_agent_count",
    "get_agent_versions",
    "list_agent_schedules",
    "get_agent_schedule",
    "get_agent_build_status",
  ]),
  ...forEach("agents:write", [
    "start_agent",
    "stop_agent",
    "kill_agent",
    "delete_run",
    "restore_agent_version",
    "create_agent_schedule",
    "update_agent_schedule",
    "delete_agent_schedule",
    "enable_agent_schedule",
    "disable_agent_schedule",
    "stop_agent_build",
  ]),
  ...forEach("runs:read", [
    "get_agent_runs",
    "get_agent_run_summary",
    "get_run_status",
    "get_run_files",
    "get_file_download_url",
    "get_scheduled_runs",
    "get_runs_summary",
    "get_records_summary",
    "get_run_diagnostics",
    "get_latest_failure",
  ]),
  ...forEach("spaces:read", [
    "list_spaces",
    "get_space",
    "get_space_agents",
    "get_space_agent_count",
    "search_space_by_name",
  ]),
  ...forEach("spaces:write", ["run_space_agents"]),
  ...forEach("billing:read", [
    "get_credits_balance",
    "get_spending_summary",
    "get_credit_history",
    "get_agents_usage",
    "get_agent_cost_breakdown",
    "get_agent_runs_cost",
  ]),
  // Starts the session (agents:write), polls its status (agents:read), and stops it on
  // cancel (agents:write): the one tool that needs two scopes.
  start_agent_build: ["agents:read", "agents:write"],
};

const EXPECTED_RESOURCE_SCOPES: Record<string, readonly string[]> = {
  "sequentum://agents": ["agents:read"],
  "sequentum://spaces": ["spaces:read"],
  "sequentum://billing/balance": ["billing:read"],
  "sequentum://billing/spending": ["billing:read"],
  "sequentum://billing/agents-usage": ["billing:read"],
  "sequentum://analytics/runs": ["runs:read"],
  "sequentum://analytics/upcoming-schedules": ["runs:read"],
  "sequentum://agents/{agentId}": ["agents:read"],
  "sequentum://agents/{agentId}/versions": ["agents:read"],
  "sequentum://agents/{agentId}/schedules": ["agents:read"],
  "sequentum://agents/{agentId}/cost-breakdown": ["billing:read"],
  "sequentum://spaces/{spaceId}": ["spaces:read"],
  "sequentum://spaces/{spaceId}/agents": ["spaces:read"],
  "sequentum://agents/{agentId}/runs": ["runs:read"],
  "sequentum://agents/{agentId}/runs/{runId}": ["runs:read"],
  "sequentum://agents/{agentId}/runs/{runId}/files": ["runs:read"],
  "sequentum://agents/{agentId}/runs/{runId}/diagnostics": ["runs:read"],
  "sequentum://agents/{agentId}/latest-failure": ["runs:read"],
};

function forEach(scope: string, names: string[]): Record<string, readonly string[]> {
  return Object.fromEntries(names.map((name) => [name, [scope]]));
}

function authInfo(scopes: string[]): AuthInfo {
  return { token: "t", clientId: "c", scopes };
}

const REQUEST: JSONRPCRequest = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "x" } };

describe("TOOL_SCOPES", () => {
  it("declares scopes for exactly the tools in tools.ts", () => {
    expect(Object.keys(TOOL_SCOPES).sort()).toEqual(tools.map((t) => t.name).sort());
  });

  it("matches the Control Center's golden scope table for every tool", () => {
    for (const tool of tools) {
      expect({ tool: tool.name, scopes: [...TOOL_SCOPES[tool.name]!].sort() }).toEqual({
        tool: tool.name,
        scopes: [...EXPECTED_TOOL_SCOPES[tool.name]!].sort(),
      });
    }
  });

  it("uses only the advertised API scopes", () => {
    const advertised = new Set<string>(API_SCOPES);
    for (const scopes of Object.values(TOOL_SCOPES)) {
      for (const scope of scopes) expect(advertised.has(scope)).toBe(true);
    }
  });
});

describe("RESOURCE_SCOPES", () => {
  it("declares scopes for exactly the resources and templates in resources.ts", () => {
    const declared = [...resources.map((r) => r.uri), ...resourceTemplates.map((t) => t.uriTemplate)].sort();
    expect(Object.keys(RESOURCE_SCOPES).sort()).toEqual(declared);
  });

  it("matches the scope of the endpoint each resource reads", () => {
    for (const [uri, scopes] of Object.entries(RESOURCE_SCOPES)) {
      expect({ uri, scopes: [...scopes].sort() }).toEqual({ uri, scopes: [...EXPECTED_RESOURCE_SCOPES[uri]!].sort() });
    }
  });
});

describe("scopeChallengeFor", () => {
  const challenge = scopeChallengeFor(["agents:read", "agents:write"]);

  it("leaves a request without verified auth info to the auth gate", async () => {
    expect(await challenge({ request: REQUEST })).toBeUndefined();
  });

  it("lets a token through when it holds every required scope", async () => {
    expect(await challenge({ request: REQUEST, authInfo: authInfo(["agents:write", "runs:read", "agents:read"]) }))
      .toBeUndefined();
  });

  it("asks for the scopes already granted plus the missing ones, so a re-consent does not narrow the grant", async () => {
    const result = await challenge({
      request: REQUEST,
      authInfo: authInfo(["runs:read", "agents:read", OFFLINE_ACCESS_SCOPE]),
    });

    // offline_access is dropped: MCP 2026-07-28 says a server SHOULD NOT put it in the
    // WWW-Authenticate scope parameter (see OFFLINE_ACCESS_SCOPE).
    expect(result?.scopes).toEqual(["runs:read", "agents:read", "agents:write"]);
    expect(result?.errorDescription).toContain("agents:write");
  });

  it("asks for just the required scopes when the token was granted none", async () => {
    // Control Center mints `scope: ""` when none was requested, and denies such a token on
    // every V1 action; the challenge must not pass it through either.
    const result = await challenge({ request: REQUEST, authInfo: authInfo([]) });
    expect(result?.scopes).toEqual(["agents:read", "agents:write"]);
  });

  it("matches scopes exactly and case-sensitively, as the Control Center does", async () => {
    const result = await challenge({ request: REQUEST, authInfo: authInfo(["AGENTS:READ", "agents:readonly", "agents:write"]) });
    expect(result?.scopes).toEqual(["AGENTS:READ", "agents:readonly", "agents:write", "agents:read"]);
  });
});
