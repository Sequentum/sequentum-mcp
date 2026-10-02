/**
 * One case per in-scope tool and per success branch. `api` maps SequentumApiClient
 * method names to the value the mocked method resolves with. `expectedStructured` is set only
 * where structuredContent is not simply the parsed text block.
 */
import {
  agentApi, agentRun, diagnostics, schedule, space, spaceAgent, upcoming, withoutKeys,
  SCHEDULE_QA_ONLY, SPACE_AGENT_QA_ONLY, SPACE_QA_ONLY, UPCOMING_QA_ONLY, T0, T1, T_NO_OFFSET,
} from "./fixtures.js";

export interface ToolCase {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  api: Record<string, unknown>;
  expectedStructured?: unknown;
}

const PAGED_AGENTS = {
  totalRecordCount: 2,
  agents: [agentApi(), agentApi({ id: 102, name: "News", status: null, description: null, lastActivity: null, configType: 2 })],
};
const SPACE_RUN_RESULT = {
  spaceId: 945, spaceName: "Production", totalAgents: 2, agentsStarted: 1, agentsFailed: 1,
  results: [
    { agentId: 101, agentName: "Shop prices", success: true, runId: 9001, errorMessage: null },
    { agentId: 102, agentName: "News", success: false, runId: null, errorMessage: "Agent is already running" },
  ],
};
const SYNC_ROWS = [{ title: "Widget", price: 9.99 }, { title: "Gadget", price: 19.5 }];

export const CASES: ToolCase[] = [
  // Agents
  { id: "list_agents", tool: "list_agents", args: {}, api: { getAllAgents: PAGED_AGENTS } },
  { id: "get_agent", tool: "get_agent", args: { agentId: 101 }, api: { getAgent: agentApi() } },
  { id: "get_agent_nulls", tool: "get_agent", args: { agentId: 101 }, api: { getAgent: agentApi({ id: null, name: null, inputParameters: null, spaceId: null, status: null, validationStatus: null, lastActivity: null }) } },
  { id: "search_agents", tool: "search_agents", args: { query: "shop" }, api: { searchAgents: [agentApi()] } },
  { id: "search_agents_truncated", tool: "search_agents", args: { query: "shop", maxRecords: 1 }, api: { searchAgents: [agentApi()] } },
  { id: "get_agent_search_count", tool: "get_agent_search_count", args: { query: "shop" }, api: { getAgentSearchCount: { totalCount: 7 } } },
  { id: "get_personal_agent_count", tool: "get_personal_agent_count", args: {}, api: { getPersonalAgentCount: { totalCount: 3 } } },
  { id: "get_agent_runs", tool: "get_agent_runs", args: { agentId: 101 }, api: { getAgentRuns: [agentRun(), agentRun({ id: 9002, tableType: "run", status: 1, endTime: null, message: null })] } },
  { id: "get_agent_runs_truncated", tool: "get_agent_runs", args: { agentId: 101, maxRecords: 1 }, api: { getAgentRuns: [agentRun()] } },
  { id: "get_agent_run_summary", tool: "get_agent_run_summary", args: { agentId: 101 }, api: { getAgentRunSummary: { totalCount: 12, statusCounts: [{ status: 7, statusName: "Failed", count: 2 }, { status: 10, statusName: "Success", count: 10 }] } } },
  { id: "get_run_status", tool: "get_run_status", args: { agentId: 101, runId: 9001 }, api: { getRunStatus: agentRun() } },
  { id: "start_agent_async", tool: "start_agent", args: { agentId: 101 }, api: { startAgent: agentRun({ tableType: null, status: 3, endTime: null }) }, expectedStructured: { run: agentRun({ tableType: null, status: 3, endTime: null }) } },
  { id: "start_agent_sync_object", tool: "start_agent", args: { agentId: 101, isRunSynchronously: true }, api: { startAgent: SYNC_ROWS }, expectedStructured: { data: SYNC_ROWS } },
  { id: "start_agent_sync_text", tool: "start_agent", args: { agentId: 101, isRunSynchronously: true }, api: { startAgent: "title,price\nWidget,9.99" }, expectedStructured: { data: "title,price\nWidget,9.99" } },
  { id: "get_run_files", tool: "get_run_files", args: { agentId: 101, runId: 9001 }, api: { getRunFiles: [{ id: 5001, regionId: null, fileType: 1, name: "output.csv", fileSize: 12634, created: T1 }, { id: 5002, regionId: 2, fileType: null, name: null, fileSize: 0, created: T1 }] } },
  { id: "get_run_files_empty", tool: "get_run_files", args: { agentId: 101, runId: 9001 }, api: { getRunFiles: [] }, expectedStructured: [] },
  { id: "get_file_download_url", tool: "get_file_download_url", args: { agentId: 101, runId: 9001, fileId: 5001 }, api: { downloadRunFile: { redirectUrl: "https://files.example.com/output.csv?sig=abc" } }, expectedStructured: { downloadUrl: "https://files.example.com/output.csv?sig=abc" } },
  { id: "get_agent_versions", tool: "get_agent_versions", args: { agentId: 101 }, api: { getAgentVersions: [{ userName: "builder", version: 4, created: T1, comments: "Fix selector", fileSize: 2048 }, { userName: null, version: 3, created: T0, comments: null, fileSize: 0 }] } },

  // Schedules
  { id: "list_agent_schedules", tool: "list_agent_schedules", args: { agentId: 101 }, api: { getAgentSchedules: [schedule()] } },
  { id: "list_agent_schedules_prod", tool: "list_agent_schedules", args: { agentId: 101 }, api: { getAgentSchedules: [withoutKeys(schedule(), SCHEDULE_QA_ONLY)] } },
  { id: "list_agent_schedules_empty", tool: "list_agent_schedules", args: { agentId: 101 }, api: { getAgentSchedules: [] } },
  { id: "get_agent_schedule", tool: "get_agent_schedule", args: { agentId: 101, scheduleId: 3001 }, api: { getAgentSchedule: schedule() } },
  { id: "create_agent_schedule", tool: "create_agent_schedule", args: { agentId: 101, name: "Nightly", cronExpression: "0 2 * * *" }, api: { createAgentSchedule: schedule() }, expectedStructured: schedule() },
  { id: "update_agent_schedule", tool: "update_agent_schedule", args: { agentId: 101, scheduleId: 3001, name: "Nightly", cronExpression: "0 3 * * *" }, api: { updateAgentSchedule: schedule({ schedule: "0 3 * * *", localSchedule: "0 3 * * *" }) }, expectedStructured: schedule({ schedule: "0 3 * * *", localSchedule: "0 3 * * *" }) },
  { id: "get_scheduled_runs", tool: "get_scheduled_runs", args: {}, api: { getUpcomingSchedules: [upcoming()] } },
  { id: "get_scheduled_runs_prod", tool: "get_scheduled_runs", args: {}, api: { getUpcomingSchedules: [withoutKeys(upcoming(), UPCOMING_QA_ONLY)] } },

  // Spaces
  { id: "list_spaces", tool: "list_spaces", args: {}, api: { getAllSpaces: [space(), space({ id: 1, name: "Shared", scope: null, access: [] })] } },
  { id: "list_spaces_prod", tool: "list_spaces", args: {}, api: { getAllSpaces: [withoutKeys(space(), SPACE_QA_ONLY)] } },
  { id: "get_space", tool: "get_space", args: { spaceId: 945 }, api: { getSpace: space() } },
  { id: "search_space_by_name", tool: "search_space_by_name", args: { name: "Production" }, api: { searchSpaceByName: space() } },
  { id: "get_space_agents", tool: "get_space_agents", args: { spaceId: 945 }, api: { getSpaceAgents: [spaceAgent()] } },
  { id: "get_space_agents_prod", tool: "get_space_agents", args: { spaceId: 945 }, api: { getSpaceAgents: [withoutKeys(spaceAgent(), SPACE_AGENT_QA_ONLY)] } },
  { id: "get_space_agent_count", tool: "get_space_agent_count", args: { spaceId: 945 }, api: { getSpaceAgentCount: { totalCount: 4 } } },
  { id: "run_space_agents", tool: "run_space_agents", args: { spaceId: 945 }, api: { runSpaceAgents: SPACE_RUN_RESULT }, expectedStructured: SPACE_RUN_RESULT },

  // Billing
  { id: "get_credits_balance", tool: "get_credits_balance", args: {}, api: { getCreditsBalance: { availableCredits: 214.78, organizationId: 1, retrievedAt: T1 } } },
  { id: "get_spending_summary", tool: "get_spending_summary", args: {}, api: { getSpendingSummary: { totalSpent: 12.5, startDate: T_NO_OFFSET, endDate: "2026-09-30T23:59:59.9999999", organizationId: 1, currentBalance: 214.78 } } },
  { id: "get_credit_history", tool: "get_credit_history", args: {}, api: { getCreditHistory: { transactions: [{ id: 77, transactionType: "Debit", amount: -1.25, balance: 214.78, created: T1, expiresAt: null, message: null }], totalCount: 1, pageIndex: 1, recordsPerPage: 50 } } },
  { id: "get_agents_usage", tool: "get_agents_usage", args: {}, api: { getAgentsUsage: { agents: [{ agentId: 101, agentName: "Shop prices", cost: 3.5, spaceId: null }], totalRecordCount: 1, totalCost: 3.5, startDate: T0, endDate: T1 } } },
  { id: "get_agents_usage_empty", tool: "get_agents_usage", args: {}, api: { getAgentsUsage: { agents: [], totalRecordCount: 0, totalCost: 0, startDate: T0, endDate: T1 } } },
  { id: "get_agent_cost_breakdown", tool: "get_agent_cost_breakdown", args: { agentId: 101 }, api: { getAgentCostBreakdown: { agentId: 101, agentName: "Shop prices", labels: ["2026-09-29", "2026-09-30"], usageTypes: [{ type: "RunUsage", data: [1.5, 2], totalCost: 3.5 }, { type: "ProxyUsage", data: [], totalCost: 0 }], totalCost: 3.5, startDate: T0, endDate: T1 } } },
  { id: "get_agent_runs_cost", tool: "get_agent_runs_cost", args: { agentId: 101 }, api: { getAgentRunsCost: { runs: [{ runId: 9001, date: "2026-09-30T00:00:00Z", startTime: T0, endTime: null, cost: 1.25, billingType: "Server Time" }], totalRecordCount: 1, totalCost: 1.25, agentId: 101, agentName: "Shop prices" } } },

  // Runs and analytics
  { id: "get_runs_summary", tool: "get_runs_summary", args: {}, api: { getRunsSummary: { startDate: T0, endDate: T1, totalRuns: 3, completedRuns: 2, failedRuns: 0, completedWithErrorsRuns: 0, runningRuns: 1, queuedRuns: 0, stoppedRuns: 0, failedRunDetails: null } } },
  { id: "get_runs_summary_details", tool: "get_runs_summary", args: { includeDetails: true }, api: { getRunsSummary: { startDate: T0, endDate: T1, totalRuns: 3, completedRuns: 2, failedRuns: 1, completedWithErrorsRuns: 0, runningRuns: 0, queuedRuns: 0, stoppedRuns: 0, failedRunDetails: [{ runId: 9001, agentId: 101, agentName: "Shop prices", startTime: T0, endTime: T1, status: 7, errorMessage: "Navigation timed out", spaceId: null, spaceName: null }] } } },
  { id: "get_records_summary", tool: "get_records_summary", args: {}, api: { getRecordsSummary: { startDate: T0, endDate: T1, totalRecordsExtracted: 1200, totalRecordsExported: 1100, totalErrors: 4, totalPageLoads: 300, runCount: 12, agentId: null } } },
  { id: "get_run_diagnostics", tool: "get_run_diagnostics", args: { agentId: 101, runId: 9001 }, api: { getRunDiagnostics: diagnostics() } },
  { id: "get_latest_failure", tool: "get_latest_failure", args: { agentId: 101 }, api: { getLatestFailure: diagnostics({ possibleCauses: [], suggestedActions: [] }) } },

  // Agent Builder
  { id: "start_agent_build_nowait", tool: "start_agent_build", args: { prompt: "Build an agent that collects product prices", waitForCompletion: false }, api: { startAgentBuild: { sessionId: "sess-0001" } } },
  { id: "start_agent_build_completed", tool: "start_agent_build", args: { prompt: "Build an agent that collects product prices" }, api: { startAgentBuild: { sessionId: "sess-0001" }, getAgentBuildStatus: { status: "completed", agentId: 555, agentName: "Prices", error: null, agentElapsedSeconds: 41.2, browserIoSeconds: 3.5 }, stopAgentBuild: undefined } },
  { id: "get_agent_build_status_processing", tool: "get_agent_build_status", args: { sessionId: "sess-0001" }, api: { getAgentBuildStatus: { status: "processing", agentId: null, agentName: null, error: null, agentElapsedSeconds: null, browserIoSeconds: null } } },
  { id: "get_agent_build_status_error", tool: "get_agent_build_status", args: { sessionId: "sess-0001" }, api: { getAgentBuildStatus: { status: "error", agentId: null, agentName: null, error: "raw backend failure", agentElapsedSeconds: 12, browserIoSeconds: null } } },
  { id: "stop_agent_build", tool: "stop_agent_build", args: { sessionId: "sess-0001" }, api: { stopAgentBuild: undefined } },
];
