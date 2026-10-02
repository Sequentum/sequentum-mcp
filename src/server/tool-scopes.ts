/**
 * Per-tool and per-resource OAuth scope requirements.
 *
 * The Control Center enforces one scope per external V1 action and answers a
 * missing one with a 403 that the tool handlers translate into an "Insufficient Scope"
 * tool result. That result arrives on an HTTP 200, after an upstream round trip, and a
 * client cannot act on it. Declaring the same requirement here lets the SDK answer
 * before dispatch with HTTP 403 and `WWW-Authenticate: Bearer error="insufficient_scope"`,
 * which is the challenge MCP clients use to step the user up to the missing scope. The
 * upstream translation stays as the fallback.
 *
 * The source of truth is the Control Center's golden table,
 * `SeControlCenter.Tests/OAuth/TestExternalV1ScopeMap.cs` in se4-main. The table below copies
 * the rows for the actions this server calls, keyed the same way, so the two can be compared
 * line by line. Each tool and resource then names the actions it calls, and its scopes are
 * derived from them rather than restated. When a tool starts calling another endpoint, or the
 * Control Center moves an action to a different scope, update the rows here.
 */

import type { ScopeChallengeHandler } from "@modelcontextprotocol/server";
import { OFFLINE_ACCESS_SCOPE } from "../utils/oauth-metadata.js";

/** Control Center V1 action (`Controller.Method`) → the scope its `ScopeRequirement` demands. */
const CONTROL_CENTER_ACTION_SCOPES = {
  // ApiAgentController -- class default agents:read
  "ApiAgentController.GetAllAgents": "agents:read",
  "ApiAgentController.SearchAgents": "agents:read",
  "ApiAgentController.GetAgentSearchCount": "agents:read",
  "ApiAgentController.GetPersonalAgentCount": "agents:read",
  "ApiAgentController.GetAgentRuns": "runs:read",
  "ApiAgentController.GetAgentRunSummary": "runs:read",
  "ApiAgentController.GetRunStatus": "runs:read",
  "ApiAgentController.GetRunFiles": "runs:read",
  "ApiAgentController.GetRunFile": "runs:read",
  "ApiAgentController.GetAgent": "agents:read",
  "ApiAgentController.StartAgent": "agents:write",
  "ApiAgentController.StopAgent": "agents:write",
  "ApiAgentController.KillAgent": "agents:write",
  "ApiAgentController.DeleteRun": "agents:write",
  "ApiAgentController.RestoreVersion": "agents:write",
  "ApiAgentController.GetAgentVersions": "agents:read",
  "ApiAgentController.GetAgentSchedules": "agents:read",
  "ApiAgentController.CreateSchedule": "agents:write",
  "ApiAgentController.DeleteSchedule": "agents:write",
  "ApiAgentController.GetScheduleById": "agents:read",
  "ApiAgentController.UpdateSchedule": "agents:write",
  "ApiAgentController.EnableSchedule": "agents:write",
  "ApiAgentController.DisableSchedule": "agents:write",

  // ApiAgentBuilderController -- class default agents:write
  "ApiAgentBuilderController.StartSession": "agents:write",
  "ApiAgentBuilderController.GetStatus": "agents:read",
  "ApiAgentBuilderController.StopSession": "agents:write",

  // ApiSpaceController -- class default spaces:read
  "ApiSpaceController.GetAllSpaces": "spaces:read",
  "ApiSpaceController.GetSpace": "spaces:read",
  "ApiSpaceController.GetSpaceAgents": "spaces:read",
  "ApiSpaceController.GetSpaceAgentCount": "spaces:read",
  "ApiSpaceController.RunAllAgentsInSpace": "spaces:write",
  "ApiSpaceController.SearchSpaceByName": "spaces:read",

  // ApiAnalyticsController -- class default runs:read, no overrides
  "ApiAnalyticsController.GetRunsSummary": "runs:read",
  "ApiAnalyticsController.GetRecordsSummary": "runs:read",
  "ApiAnalyticsController.GetUpcomingSchedules": "runs:read",
  "ApiAnalyticsController.GetRunDiagnostics": "runs:read",
  "ApiAnalyticsController.GetLatestFailure": "runs:read",

  // ApiBillingController -- class default billing:read, no overrides
  "ApiBillingController.GetCreditsBalance": "billing:read",
  "ApiBillingController.GetSpendingSummary": "billing:read",
  "ApiBillingController.GetCreditHistory": "billing:read",
  "ApiBillingController.GetAgentsUsage": "billing:read",
  "ApiBillingController.GetAgentCostBreakdown": "billing:read",
  "ApiBillingController.GetAgentRuns": "billing:read",
} as const;

type ControlCenterAction = keyof typeof CONTROL_CENTER_ACTION_SCOPES;

/** Tool name → the Control Center actions its handler calls (see src/api/api-client.ts). */
const TOOL_ACTIONS: Readonly<Record<string, readonly ControlCenterAction[]>> = {
  list_agents: ["ApiAgentController.GetAllAgents"],
  get_agent: ["ApiAgentController.GetAgent"],
  search_agents: ["ApiAgentController.SearchAgents"],
  get_agent_search_count: ["ApiAgentController.GetAgentSearchCount"],
  get_personal_agent_count: ["ApiAgentController.GetPersonalAgentCount"],
  get_agent_runs: ["ApiAgentController.GetAgentRuns"],
  get_agent_run_summary: ["ApiAgentController.GetAgentRunSummary"],
  get_run_status: ["ApiAgentController.GetRunStatus"],
  start_agent: ["ApiAgentController.StartAgent"],
  stop_agent: ["ApiAgentController.StopAgent"],
  kill_agent: ["ApiAgentController.KillAgent"],
  delete_run: ["ApiAgentController.DeleteRun"],
  get_run_files: ["ApiAgentController.GetRunFiles"],
  get_file_download_url: ["ApiAgentController.GetRunFile"],
  get_agent_versions: ["ApiAgentController.GetAgentVersions"],
  restore_agent_version: ["ApiAgentController.RestoreVersion"],
  list_agent_schedules: ["ApiAgentController.GetAgentSchedules"],
  create_agent_schedule: ["ApiAgentController.CreateSchedule"],
  delete_agent_schedule: ["ApiAgentController.DeleteSchedule"],
  get_agent_schedule: ["ApiAgentController.GetScheduleById"],
  update_agent_schedule: ["ApiAgentController.UpdateSchedule"],
  enable_agent_schedule: ["ApiAgentController.EnableSchedule"],
  disable_agent_schedule: ["ApiAgentController.DisableSchedule"],
  get_scheduled_runs: ["ApiAnalyticsController.GetUpcomingSchedules"],
  get_credits_balance: ["ApiBillingController.GetCreditsBalance"],
  get_spending_summary: ["ApiBillingController.GetSpendingSummary"],
  get_credit_history: ["ApiBillingController.GetCreditHistory"],
  get_agents_usage: ["ApiBillingController.GetAgentsUsage"],
  get_agent_cost_breakdown: ["ApiBillingController.GetAgentCostBreakdown"],
  get_agent_runs_cost: ["ApiBillingController.GetAgentRuns"],
  list_spaces: ["ApiSpaceController.GetAllSpaces"],
  get_space: ["ApiSpaceController.GetSpace"],
  get_space_agents: ["ApiSpaceController.GetSpaceAgents"],
  get_space_agent_count: ["ApiSpaceController.GetSpaceAgentCount"],
  search_space_by_name: ["ApiSpaceController.SearchSpaceByName"],
  run_space_agents: ["ApiSpaceController.RunAllAgentsInSpace"],
  get_runs_summary: ["ApiAnalyticsController.GetRunsSummary"],
  get_records_summary: ["ApiAnalyticsController.GetRecordsSummary"],
  get_run_diagnostics: ["ApiAnalyticsController.GetRunDiagnostics"],
  get_latest_failure: ["ApiAnalyticsController.GetLatestFailure"],
  // Starts the session, polls its status until done, and stops it if the client cancels.
  start_agent_build: [
    "ApiAgentBuilderController.StartSession",
    "ApiAgentBuilderController.GetStatus",
    "ApiAgentBuilderController.StopSession",
  ],
  get_agent_build_status: ["ApiAgentBuilderController.GetStatus"],
  stop_agent_build: ["ApiAgentBuilderController.StopSession"],
};

/** Resource URI or URI template → the Control Center actions `readResource` calls for it. */
const RESOURCE_ACTIONS: Readonly<Record<string, readonly ControlCenterAction[]>> = {
  "sequentum://agents": ["ApiAgentController.GetAllAgents"],
  "sequentum://spaces": ["ApiSpaceController.GetAllSpaces"],
  "sequentum://billing/balance": ["ApiBillingController.GetCreditsBalance"],
  "sequentum://billing/spending": ["ApiBillingController.GetSpendingSummary"],
  "sequentum://billing/agents-usage": ["ApiBillingController.GetAgentsUsage"],
  "sequentum://analytics/runs": ["ApiAnalyticsController.GetRunsSummary"],
  "sequentum://analytics/upcoming-schedules": ["ApiAnalyticsController.GetUpcomingSchedules"],
  "sequentum://agents/{agentId}": ["ApiAgentController.GetAgent"],
  "sequentum://agents/{agentId}/versions": ["ApiAgentController.GetAgentVersions"],
  "sequentum://agents/{agentId}/schedules": ["ApiAgentController.GetAgentSchedules"],
  "sequentum://agents/{agentId}/cost-breakdown": ["ApiBillingController.GetAgentCostBreakdown"],
  "sequentum://spaces/{spaceId}": ["ApiSpaceController.GetSpace"],
  "sequentum://spaces/{spaceId}/agents": ["ApiSpaceController.GetSpaceAgents"],
  "sequentum://agents/{agentId}/runs": ["ApiAgentController.GetAgentRuns"],
  "sequentum://agents/{agentId}/runs/{runId}": ["ApiAgentController.GetRunStatus"],
  "sequentum://agents/{agentId}/runs/{runId}/files": ["ApiAgentController.GetRunFiles"],
  "sequentum://agents/{agentId}/runs/{runId}/diagnostics": ["ApiAnalyticsController.GetRunDiagnostics"],
  "sequentum://agents/{agentId}/latest-failure": ["ApiAnalyticsController.GetLatestFailure"],
};

function scopesOf(actionsByKey: Readonly<Record<string, readonly ControlCenterAction[]>>) {
  return Object.fromEntries(
    Object.entries(actionsByKey).map(([key, actions]) => [
      key,
      [...new Set(actions.map((action) => CONTROL_CENTER_ACTION_SCOPES[action]))],
    ])
  ) as Readonly<Record<string, readonly string[]>>;
}

/** Tool name → every scope the tool's calls need. */
export const TOOL_SCOPES = scopesOf(TOOL_ACTIONS);

/** Resource URI or URI template → every scope reading it needs. */
export const RESOURCE_SCOPES = scopesOf(RESOURCE_ACTIONS);

/**
 * A scope challenge that demands every scope in `required`, matched exactly and
 * case-sensitively as the Control Center matches them.
 *
 * Unlike the SDK's `requireScopes`, the challenge lists the scopes the token already holds
 * followed by the missing ones. A client re-authorizes with the scope set in the challenge,
 * so naming only the missing scope would trade the old grant for a narrower one and the
 * next call to a different tool would be challenged again. `offline_access` is left out:
 * MCP 2026-07-28 says a server SHOULD NOT put it in the `WWW-Authenticate` scope parameter.
 *
 * A request with no `authInfo` is not challenged. The HTTP auth gate leaves it unset where
 * the Control Center does not check scopes either (client-credentials tokens), and where the
 * request already passes through unverified (`REQUIRE_AUTH=false`, an unverifiable token).
 */
export function scopeChallengeFor(required: readonly string[]): ScopeChallengeHandler {
  return ({ authInfo }) => {
    if (authInfo === undefined) return undefined;
    const granted = authInfo.scopes.filter((scope) => scope !== OFFLINE_ACCESS_SCOPE);
    const missing = required.filter((scope) => !granted.includes(scope));
    const [first, ...rest] = [...granted, ...missing];
    if (missing.length === 0 || first === undefined) return undefined;
    return {
      scopes: [first, ...rest],
      errorDescription: `This operation requires the ${missing.join(", ")} scope`,
    };
  };
}
