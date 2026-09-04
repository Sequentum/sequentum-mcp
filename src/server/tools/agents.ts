/**
 * Agent tool handlers: list/search/inspect agents, manage runs, download run
 * files, and manage agent versions.
 *
 * Moved verbatim out of the `tools/call` switch in handlers.ts as part of the
 * dispatch-map refactor (see the TODO that used to live at handlers.ts:285).
 */
import type { ToolHandler } from "./types.js";
import { jsonResult } from "./types.js";
import { isPaginatedResponse, summarizeAgents } from "./shared.js";
import {
  AgentApiModel,
  AgentRunFileApiModel,
  AgentRunStatus,
  ConfigType,
  ListAgentsRequest,
  RunRemoveMethod,
} from "../../api/types.js";
import {
  validateBoolean,
  validateEnum,
  validateJsonString,
  validateNumber,
  validateString,
} from "../../utils/validation.js";

const list_agents: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const statusNum = validateNumber(params, "status", { required: false, min: 0, max: 12, integer: true });
  const spaceId = validateNumber(params, "spaceId", { required: false, min: 1, integer: true });
  const search = validateString(params, "search", false);
  const configTypeStr = validateString(params, "configType", false);
  const sortColumn = validateString(params, "sortColumn", false);
  const sortOrderStr = validateString(params, "sortOrder", false);
  const pageIndex = validateNumber(params, "pageIndex", { required: false, min: 1, integer: true });
  const recordsPerPage = validateNumber(params, "recordsPerPage", { required: false, min: 1, max: 100, integer: true });

  // Build filters object - ALWAYS include pagination to ensure resource-efficient API calls
  const filters: ListAgentsRequest = {
    // Always enforce pagination with defaults (pageIndex is 1-based per API spec)
    pageIndex: pageIndex ?? 1,
    recordsPerPage: recordsPerPage ?? 50,
  };

  // Add other optional filters
  // Status is now the RunStatus enum value (1=Running, 7=Failed, 9=Completed, etc.)
  if (statusNum !== undefined) {
    filters.status = statusNum as AgentRunStatus;
  }
  if (spaceId !== undefined) {
    filters.spaceId = spaceId;
  }
  if (search) {
    filters.search = search;
  }
  if (configTypeStr) {
    filters.configType = configTypeStr as ConfigType;
  }
  if (sortColumn) {
    filters.sortColumn = sortColumn;
  }
  if (sortOrderStr) {
    if (sortOrderStr !== "asc" && sortOrderStr !== "desc") {
      throw new Error(`Invalid parameter 'sortOrder': must be "asc" or "desc", got "${sortOrderStr}"`);
    }
    // Convert "asc"/"desc" to 0/1 as the API expects
    filters.sortOrder = sortOrderStr === "desc" ? 1 : 0;
  }

  const response = await apiClient.getAllAgents(filters);

  // Parse response — either a plain array (no pagination) or a PaginatedAgentsResponse
  let agents: AgentApiModel[];
  let paginationInfo: { totalRecordCount: number; pageIndex: number; recordsPerPage: number } | null = null;

  if (Array.isArray(response)) {
    agents = response;
  } else if (isPaginatedResponse(response)) {
    agents = response.agents;
    paginationInfo = {
      totalRecordCount: response.totalRecordCount,
      pageIndex: filters.pageIndex ?? 1,
      recordsPerPage: filters.recordsPerPage ?? 50,
    };
  } else {
    throw new Error(`Unexpected response type: ${typeof response}`);
  }

  const summary = summarizeAgents(agents);

  // Include pagination info if available
  const result = paginationInfo ? {
    agents: summary,
    pagination: paginationInfo,
  } : summary;

  return jsonResult(result);
};

const get_agent: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const agent = await apiClient.getAgent(agentId);
  return jsonResult(agent);
};

/**
 * The API's own default when maxRecords is omitted on /agent/search. Mirrored here so the
 * handler always sends an explicit limit and can tell whether the result was capped.
 */
const SEARCH_DEFAULT_LIMIT = 50;

const search_agents: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const query = validateString(params, "query")!;
  if (!query.trim()) {
    throw new Error("Search query cannot be empty");
  }
  const maxRecords = validateNumber(params, "maxRecords", { required: false, min: 1, max: 1000, integer: true });
  const limit = maxRecords ?? SEARCH_DEFAULT_LIMIT;
  const agents = await apiClient.searchAgents(query, limit);
  const returned = Array.isArray(agents) ? agents.length : 0;
  const truncated = returned >= limit;

  return jsonResult({
    agents: summarizeAgents(agents),
    returned,
    limit,
    truncated,
    ...(truncated
      ? {
          note:
            "This result was capped at the limit, so more agents may match than are listed. " +
            "Do NOT count these to answer 'how many agents match' - call get_agent_search_count " +
            "for the exact number, or raise maxRecords (max 1000).",
        }
      : {}),
  });
};

/**
 * Returns the exact number of agents matching a search term, computed server-side, so no
 * counting of a capped list is required. See SE4-3921.
 */
const get_agent_search_count: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const query = validateString(params, "query")!;
  if (!query.trim()) {
    throw new Error("Search query cannot be empty");
  }
  const includeArchived = validateBoolean(params, "includeArchived", false);
  const count = await apiClient.getAgentSearchCount(query, includeArchived);
  return jsonResult(count);
};

/**
 * Returns the number of agents in the caller's personal space as a single total.
 * "Personal" is not a space, so get_space_agent_count cannot serve it. See SE4-3921.
 */
const get_personal_agent_count: ToolHandler = async (_args, { apiClient }) => {
  const count = await apiClient.getPersonalAgentCount();
  return jsonResult(count);
};

// Run Tools
/**
 * The API's own default when maxRecords is omitted. Mirrored here so the handler always
 * sends an explicit limit and can therefore tell whether the result was capped - a bare
 * array gives the caller no way to distinguish "50 runs" from "the first 50 of many".
 */
const RUNS_DEFAULT_LIMIT = 50;

const get_agent_runs: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const maxRecords = validateNumber(params, "maxRecords", { required: false, min: 1, max: 1000, integer: true });
  const limit = maxRecords ?? RUNS_DEFAULT_LIMIT;
  const runs = await apiClient.getAgentRuns(agentId, limit);
  const returned = Array.isArray(runs) ? runs.length : 0;
  const truncated = returned >= limit;

  return jsonResult({
    runs,
    returned,
    limit,
    truncated,
    ...(truncated
      ? {
          note:
            "This list was capped at the limit, so more runs may exist and these rows are " +
            "only the most recent ones. Do NOT count them to answer 'how many runs' - call " +
            "get_agent_run_summary for exact totals, or raise maxRecords (max 1000).",
        }
      : {}),
  });
};

/**
 * Returns exact run totals for an agent - overall and per status - computed by the server
 * across both run tables, so no counting or paging is required. See SE4-3921.
 */
const get_agent_run_summary: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const summary = await apiClient.getAgentRunSummary(agentId);
  return jsonResult(summary);
};

const get_run_status: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const runId = validateNumber(params, "runId", { min: 1, integer: true })!;
  const status = await apiClient.getRunStatus(agentId, runId);
  return jsonResult(status);
};

const start_agent: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const inputParameters = validateJsonString(params, "inputParameters", false);
  const isRunSynchronously = validateBoolean(params, "isRunSynchronously", false);
  const timeout = validateNumber(params, "timeout", { required: false, min: 1, max: 3600, integer: true });
  const parallelism = validateNumber(params, "parallelism", { required: false, min: 1, max: 50, integer: true });

  const result = await apiClient.startAgent(agentId, {
    inputParameters,
    isRunSynchronously: isRunSynchronously ?? false,
    timeout: timeout ?? 60,
    parallelism: parallelism ?? 1,
  });

  if (typeof result === "string") {
    // Synchronous run returned data directly
    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  } else {
    // Asynchronous run returned run info
    return {
      content: [
        {
          type: "text",
          text: `Agent started successfully.\n\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  }
};

const stop_agent: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const runId = validateNumber(params, "runId", { min: 1, integer: true })!;
  await apiClient.stopAgent(agentId, runId);
  return {
    content: [
      {
        type: "text",
        text: `Successfully stopped run ${runId} for agent ${agentId}`,
      },
    ],
  };
};

const kill_agent: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const runId = validateNumber(params, "runId", { min: 1, integer: true })!;
  await apiClient.killAgent(agentId, runId);
  return {
    content: [
      {
        type: "text",
        text: `Kill command sent for run ${runId} of agent ${agentId}. If the agent was running, it will initiate graceful stop. If already stopping, it will force immediate termination.`,
      },
    ],
  };
};

// Destructive Operations
const delete_run: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const runId = validateNumber(params, "runId", { min: 1, integer: true })!;
  const removeMethod = validateEnum(
    params,
    "removeMethod",
    ["RemoveEntireRun", "RemoveAllFiles", "RemoveAllFilesAndAgentInput"] as const,
    false
  ) as RunRemoveMethod | undefined;

  await apiClient.deleteRun(agentId, runId, removeMethod);

  const methodDescriptions: Record<RunRemoveMethod, string> = {
    RemoveEntireRun: `Successfully deleted run ${runId} and all associated files from agent ${agentId}.`,
    RemoveAllFiles: `Successfully removed all files for run ${runId} from agent ${agentId}. The run record has been preserved.`,
    RemoveAllFilesAndAgentInput: `Successfully removed all files and agent input for run ${runId} from agent ${agentId}. The run record has been preserved.`,
  };
  const description =
    (removeMethod ? methodDescriptions[removeMethod] : undefined) ??
    `Successfully deleted run ${runId} and all associated files from agent ${agentId}.`;

  return {
    content: [
      {
        type: "text",
        text: description,
      },
    ],
  };
};

// File Tools
const get_run_files: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const runId = validateNumber(params, "runId", { min: 1, integer: true })!;
  const files = await apiClient.getRunFiles(agentId, runId);

  if (files.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No files found for this run.",
        },
      ],
    };
  }

  const summary = files.map((f: AgentRunFileApiModel) => ({
    id: f.id,
    name: f.name,
    fileType: f.fileType,
    fileSize: `${((f.fileSize ?? 0) / 1024).toFixed(2)} KB`,
    created: f.created,
  }));

  return jsonResult(summary);
};

const get_file_download_url: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const runId = validateNumber(params, "runId", { min: 1, integer: true })!;
  const fileId = validateNumber(params, "fileId", { min: 1, integer: true })!;
  const result = await apiClient.downloadRunFile(agentId, runId, fileId);
  return {
    content: [
      {
        type: "text",
        text: `Download URL:\n${result.redirectUrl}\n\nNote: This URL is temporary and will expire.`,
      },
    ],
  };
};

// Version Tools
const get_agent_versions: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const versions = await apiClient.getAgentVersions(agentId);
  return jsonResult(versions);
};

const restore_agent_version: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const versionNumber = validateNumber(params, "versionNumber", { min: 1, integer: true })!;
  const comments = validateString(params, "comments")!;
  await apiClient.restoreAgentVersion(agentId, versionNumber, comments);
  return {
    content: [
      {
        type: "text",
        text: `Successfully restored agent ${agentId} to version ${versionNumber}.\n\nA new version has been created based on version ${versionNumber}.`,
      },
    ],
  };
};

export const agentToolHandlers: Record<string, ToolHandler> = {
  list_agents,
  get_agent,
  search_agents,
  get_agent_search_count,
  get_personal_agent_count,
  get_agent_runs,
  get_agent_run_summary,
  get_run_status,
  start_agent,
  stop_agent,
  kill_agent,
  delete_run,
  get_run_files,
  get_file_download_url,
  get_agent_versions,
  restore_agent_version,
};
