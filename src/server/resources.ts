/**
 * MCP Resource Definitions
 *
 * Exposes read-only, URI-addressable data that AI clients can browse and
 * pull into context without calling a tool. Resources complement tools by
 * providing a "discovery" layer for static or default-parameter data.
 */

import { Resource, ResourceTemplate } from "@modelcontextprotocol/sdk/types.js";
import { SequentumApiClient } from "../api/api-client.js";

// ==========================================
// Static Resources (no parameters)
// ==========================================

export const resources: Resource[] = [
  {
    uri: "sequentum://agents",
    name: "Agent List",
    description:
      "Overview of all web scraping agents (first page, up to 50 agents). " +
      "Shows id, name, status, configType, version, and lastActivity for each agent.",
    mimeType: "application/json",
  },
  {
    uri: "sequentum://spaces",
    name: "Spaces",
    description:
      "List of all accessible spaces (folders for organizing agents). " +
      "Shows id, name, and description for each space.",
    mimeType: "application/json",
  },
  {
    uri: "sequentum://billing/balance",
    name: "Credits Balance",
    description:
      "Current available credits balance for the organization. " +
      "Shows availableCredits, organizationId, and retrievedAt timestamp.",
    mimeType: "application/json",
  },
  {
    uri: "sequentum://billing/spending",
    name: "Monthly Spending",
    description:
      "Spending summary for the current month. " +
      "Shows totalSpent, startDate, endDate, organizationId, and currentBalance.",
    mimeType: "application/json",
  },
  {
    uri: "sequentum://analytics/runs",
    name: "Recent Runs Summary",
    description:
      "Summary of all agent runs in the last 24 hours. " +
      "Shows totalRuns, completedRuns, failedRuns, runningRuns, queuedRuns, and stoppedRuns.",
    mimeType: "application/json",
  },
  {
    uri: "sequentum://analytics/upcoming-schedules",
    name: "Upcoming Schedules",
    description:
      "All scheduled runs for the next 7 days across all agents. " +
      "Shows scheduleId, agentId, agentName, scheduleName, nextRunTime, and isEnabled.",
    mimeType: "application/json",
  },
];

// ==========================================
// Resource Templates (parameterized URIs)
// ==========================================

export const resourceTemplates: ResourceTemplate[] = [
  {
    uriTemplate: "sequentum://agents/{agentId}",
    name: "Agent Detail",
    description:
      "Detailed information about a specific agent including configuration, " +
      "input parameters, and documentation.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "sequentum://agents/{agentId}/versions",
    name: "Agent Versions",
    description:
      "Version history of an agent's configuration. Shows version number, " +
      "who made the change, date, comments, and file size.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "sequentum://agents/{agentId}/schedules",
    name: "Agent Schedules",
    description:
      "Scheduled tasks configured for a specific agent. Shows schedule id, " +
      "name, cron expression, next run time, and enabled status.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "sequentum://spaces/{spaceId}",
    name: "Space Detail",
    description:
      "Details of a specific space including name, description, " +
      "organizationId, and created/updated dates.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "sequentum://spaces/{spaceId}/agents",
    name: "Space Agents",
    description:
      "List of agents belonging to a specific space. Shows id, name, " +
      "status, configType, and lastActivity for each agent.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "sequentum://agents/{agentId}/runs",
    name: "Agent Runs",
    description:
      "Recent run history for a specific agent (up to 50 most recent). " +
      "Shows run id, status, startTime, endTime, records extracted/exported, and errors.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "sequentum://agents/{agentId}/runs/{runId}",
    name: "Run Status",
    description:
      "Current status and details of a specific agent run. " +
      "Shows id, status, startTime, endTime, records, errors, and runtime.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "sequentum://agents/{agentId}/runs/{runId}/files",
    name: "Run Files",
    description:
      "Output files produced by a completed agent run. " +
      "Shows file id, name, fileType, fileSize, and created date.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "sequentum://agents/{agentId}/runs/{runId}/diagnostics",
    name: "Run Diagnostics",
    description:
      "Detailed diagnostics for a specific run including error messages, " +
      "statistics, possible failure causes, and suggested remediation actions.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "sequentum://agents/{agentId}/latest-failure",
    name: "Latest Failure",
    description:
      "Diagnostics for the most recent failed run of an agent. " +
      "Shows error message, possible causes, suggested actions, and run statistics.",
    mimeType: "application/json",
  },
];

// ==========================================
// Resource Reader
// ==========================================

/**
 * Read a resource by URI. Matches static resources and parameterized templates,
 * dispatches the appropriate API call, and returns the JSON content.
 *
 * @param uri - The resource URI to read (e.g. "sequentum://agents" or "sequentum://agents/42")
 * @param apiClient - The API client instance for this session
 * @returns Object with uri, mimeType, and text (JSON string)
 * @throws Error if the URI does not match any known resource
 */
export async function readResource(
  uri: string,
  apiClient: SequentumApiClient
): Promise<{ uri: string; mimeType: string; text: string }> {
  // Static resources
  if (uri === "sequentum://agents") {
    const response = await apiClient.getAllAgents({ pageIndex: 1, recordsPerPage: 50 });
    const agents = Array.isArray(response) ? response : response.agents;
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(agents, null, 2),
    };
  }

  if (uri === "sequentum://spaces") {
    const spaces = await apiClient.getAllSpaces();
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(spaces, null, 2),
    };
  }

  if (uri === "sequentum://billing/balance") {
    const balance = await apiClient.getCreditsBalance();
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(balance, null, 2),
    };
  }

  if (uri === "sequentum://billing/spending") {
    const spending = await apiClient.getSpendingSummary();
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(spending, null, 2),
    };
  }

  if (uri === "sequentum://analytics/runs") {
    const runs = await apiClient.getRunsSummary();
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(runs, null, 2),
    };
  }

  if (uri === "sequentum://analytics/upcoming-schedules") {
    const schedules = await apiClient.getUpcomingSchedules();
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(schedules, null, 2),
    };
  }

  // Templated resources — match patterns and extract IDs
  let match: RegExpExecArray | null;

  // sequentum://agents/{agentId}/runs/{runId}/diagnostics
  match = /^sequentum:\/\/agents\/(\d+)\/runs\/(\d+)\/diagnostics$/.exec(uri);
  if (match) {
    const agentId = parseInt(match[1], 10);
    const runId = parseInt(match[2], 10);
    const diagnostics = await apiClient.getRunDiagnostics(agentId, runId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(diagnostics, null, 2),
    };
  }

  // sequentum://agents/{agentId}/runs/{runId}/files
  match = /^sequentum:\/\/agents\/(\d+)\/runs\/(\d+)\/files$/.exec(uri);
  if (match) {
    const agentId = parseInt(match[1], 10);
    const runId = parseInt(match[2], 10);
    const files = await apiClient.getRunFiles(agentId, runId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(files, null, 2),
    };
  }

  // sequentum://agents/{agentId}/runs/{runId}  (must come after /diagnostics and /files)
  match = /^sequentum:\/\/agents\/(\d+)\/runs\/(\d+)$/.exec(uri);
  if (match) {
    const agentId = parseInt(match[1], 10);
    const runId = parseInt(match[2], 10);
    const status = await apiClient.getRunStatus(agentId, runId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(status, null, 2),
    };
  }

  // sequentum://agents/{agentId}/runs  (must come after specific run patterns)
  match = /^sequentum:\/\/agents\/(\d+)\/runs$/.exec(uri);
  if (match) {
    const agentId = parseInt(match[1], 10);
    const runs = await apiClient.getAgentRuns(agentId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(runs, null, 2),
    };
  }

  // sequentum://agents/{agentId}/latest-failure
  match = /^sequentum:\/\/agents\/(\d+)\/latest-failure$/.exec(uri);
  if (match) {
    const agentId = parseInt(match[1], 10);
    const diagnostics = await apiClient.getLatestFailure(agentId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(diagnostics, null, 2),
    };
  }

  // sequentum://agents/{agentId}/versions
  match = /^sequentum:\/\/agents\/(\d+)\/versions$/.exec(uri);
  if (match) {
    const agentId = parseInt(match[1], 10);
    const versions = await apiClient.getAgentVersions(agentId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(versions, null, 2),
    };
  }

  // sequentum://agents/{agentId}/schedules
  match = /^sequentum:\/\/agents\/(\d+)\/schedules$/.exec(uri);
  if (match) {
    const agentId = parseInt(match[1], 10);
    const schedules = await apiClient.getAgentSchedules(agentId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(schedules, null, 2),
    };
  }

  // sequentum://agents/{agentId}  (must come after /versions and /schedules)
  match = /^sequentum:\/\/agents\/(\d+)$/.exec(uri);
  if (match) {
    const agentId = parseInt(match[1], 10);
    const agent = await apiClient.getAgent(agentId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(agent, null, 2),
    };
  }

  // sequentum://spaces/{spaceId}/agents
  match = /^sequentum:\/\/spaces\/(\d+)\/agents$/.exec(uri);
  if (match) {
    const spaceId = parseInt(match[1], 10);
    const agents = await apiClient.getSpaceAgents(spaceId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(agents, null, 2),
    };
  }

  // sequentum://spaces/{spaceId}  (must come after /agents)
  match = /^sequentum:\/\/spaces\/(\d+)$/.exec(uri);
  if (match) {
    const spaceId = parseInt(match[1], 10);
    const space = await apiClient.getSpace(spaceId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(space, null, 2),
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}
