/**
 * MCP Server Factory and Tool Handlers
 *
 * Contains input validation helpers, response helpers, and the
 * createMcpServer factory that wires tool definitions to their handlers.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SequentumApiClient } from "../api/api-client.js";
import { AgentApiModel, AgentRunFileApiModel, AgentRunStatus, ConfigType, ListAgentsRequest, PaginatedAgentsResponse, ApiRequestError, RateLimitError, AuthenticationError } from "../api/types.js";
import { validateStartTimeInFuture } from "../utils/validation.js";
import { tools } from "./tools.js";
import { resources, resourceTemplates, readResource } from "./resources.js";
import { prompts, getPromptMessages } from "./prompts.js";

// ==========================================
// Input Validation Helpers
// ==========================================

interface NumberValidationOptions {
  required?: boolean;
  /** Minimum allowed value (inclusive) */
  min?: number;
  /** Maximum allowed value (inclusive) */
  max?: number;
  /** If true, value must be an integer (no decimals) */
  integer?: boolean;
}

function validateNumber(
  args: Record<string, unknown>,
  field: string,
  requiredOrOptions: boolean | NumberValidationOptions = true
): number | undefined {
  // Support both old signature (boolean) and new options object
  const opts: NumberValidationOptions = typeof requiredOrOptions === "boolean"
    ? { required: requiredOrOptions }
    : requiredOrOptions;
  const required = opts.required ?? true;

  const value = args[field];
  if (value === undefined || value === null) {
    if (required) {
      throw new Error(`Missing required parameter: ${field}`);
    }
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Invalid parameter '${field}': expected a number, got ${typeof value}`
    );
  }
  if (opts.integer && !Number.isInteger(value)) {
    throw new Error(
      `Invalid parameter '${field}': expected an integer, got ${value}`
    );
  }
  if (opts.min !== undefined && value < opts.min) {
    throw new Error(
      `Invalid parameter '${field}': must be >= ${opts.min}, got ${value}`
    );
  }
  if (opts.max !== undefined && value > opts.max) {
    throw new Error(
      `Invalid parameter '${field}': must be <= ${opts.max}, got ${value}`
    );
  }
  return value;
}

function validateString(
  args: Record<string, unknown>,
  field: string,
  required: boolean = true
): string | undefined {
  const value = args[field];
  if (value === undefined || value === null) {
    if (required) {
      throw new Error(`Missing required parameter: ${field}`);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(
      `Invalid parameter '${field}': expected a string, got ${typeof value}`
    );
  }
  return value;
}

/**
 * Validate that a string is valid JSON. Returns the string as-is if valid.
 * Used for inputParameters fields to catch malformed JSON before sending to the API.
 */
function validateJsonString(
  args: Record<string, unknown>,
  field: string,
  required: boolean = false
): string | undefined {
  const value = validateString(args, field, required);
  if (value === undefined) return undefined;

  try {
    JSON.parse(value);
  } catch {
    throw new Error(
      `Invalid parameter '${field}': must be a valid JSON string. Got: ${value.length > 100 ? value.substring(0, 100) + "..." : value}`
    );
  }
  return value;
}

function validateBoolean(
  args: Record<string, unknown>,
  field: string,
  required: boolean = true
): boolean | undefined {
  const value = args[field];
  if (value === undefined || value === null) {
    if (required) {
      throw new Error(`Missing required parameter: ${field}`);
    }
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(
      `Invalid parameter '${field}': expected a boolean, got ${typeof value}`
    );
  }
  return value;
}

// ==========================================
// Response Helpers
// ==========================================

/**
 * Map RunStatus numeric value to human-readable string
 */
function getRunStatusLabel(status: number | undefined): string {
  const statusMap: Record<number, string> = {
    0: "Invalid",
    1: "Running",
    2: "Exporting",
    3: "Starting",
    4: "Queuing",
    5: "Stopping",
    6: "Failure",
    7: "Failed",
    8: "Stopped",
    9: "Completed",
    10: "Success",
    11: "Skipped",
    12: "Waiting",
  };
  if (status === undefined || status === null) {
    return "Never Run";
  }
  return statusMap[status] ?? `Unknown (${status})`;
}

/**
 * Transform agent list to summary format for display
 */
function summarizeAgents(agents: AgentApiModel[]) {
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    status: getRunStatusLabel(a.status),
    configType: a.configType,
    version: a.version,
    lastActivity: a.lastActivity,
  }));
}

/**
 * Type guard for paginated agent responses from the API.
 */
function isPaginatedResponse(r: unknown): r is PaginatedAgentsResponse {
  return r !== null && typeof r === 'object' && 'agents' in r && Array.isArray((r as PaginatedAgentsResponse).agents);
}

// ==========================================
// Server Factory
// ==========================================

const DEBUG = process.env.DEBUG === '1';

/**
 * Create a new MCP Server instance with all handlers registered.
 * Each session in HTTP mode needs its own Server instance.
 * 
 * @param apiClient - The API client to use for this server instance
 * @param version - The server version string from package.json
 * @returns Configured MCP Server instance
 */
export function createMcpServer(apiClient: SequentumApiClient, version: string): Server {
  const server = new Server(
    {
      name: "sequentum-mcp-server",
      version,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (DEBUG) {
      console.error(`[DEBUG] Tool called: ${name}`);
      console.error(`[DEBUG] Args: ${JSON.stringify(args)}`);
    }

    try {
      switch (name) {
        // Agent Tools
        case "list_agents": {
          const params = args as Record<string, unknown>;
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

          if (DEBUG) {
            console.error(`[DEBUG] Calling getAllAgents with filters: ${JSON.stringify(filters)}`);
          }
          const response = await apiClient.getAllAgents(filters);

          if (DEBUG) {
            console.error(`[DEBUG] Response type: ${typeof response}, isArray: ${Array.isArray(response)}`);
          }

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

          if (DEBUG) {
            console.error(`[DEBUG] getAllAgents returned ${agents.length} agents`);
          }
          const summary = summarizeAgents(agents);

          // Include pagination info if available
          const result = paginationInfo ? {
            agents: summary,
            pagination: paginationInfo,
          } : summary;

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "get_agent": {
          const params = args as Record<string, unknown>;
          const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
          const agent = await apiClient.getAgent(agentId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(agent, null, 2),
              },
            ],
          };
        }

        case "search_agents": {
          const params = args as Record<string, unknown>;
          const query = validateString(params, "query")!;
          if (!query.trim()) {
            throw new Error("Search query cannot be empty");
          }
          const maxRecords = validateNumber(params, "maxRecords", { required: false, min: 1, max: 1000, integer: true });
          const agents = await apiClient.searchAgents(query, maxRecords);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(summarizeAgents(agents), null, 2),
              },
            ],
          };
        }

        // Run Tools
        case "get_agent_runs": {
          const params = args as Record<string, unknown>;
          const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
          const maxRecords = validateNumber(params, "maxRecords", { required: false, min: 1, max: 1000, integer: true });
          const runs = await apiClient.getAgentRuns(agentId, maxRecords);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(runs, null, 2),
              },
            ],
          };
        }

        case "get_run_status": {
          const params = args as Record<string, unknown>;
          const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
          const runId = validateNumber(params, "runId", { min: 1, integer: true })!;
          const status = await apiClient.getRunStatus(agentId, runId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(status, null, 2),
              },
            ],
          };
        }

        case "start_agent": {
          const params = args as Record<string, unknown>;
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
        }

        case "stop_agent": {
          const params = args as Record<string, unknown>;
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
        }

        case "kill_agent": {
          const params = args as Record<string, unknown>;
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
        }

        // File Tools
        case "get_run_files": {
          const params = args as Record<string, unknown>;
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

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(summary, null, 2),
              },
            ],
          };
        }

        case "get_file_download_url": {
          const params = args as Record<string, unknown>;
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
        }

        // Version Tools
        case "get_agent_versions": {
          const params = args as Record<string, unknown>;
          const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
          const versions = await apiClient.getAgentVersions(agentId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(versions, null, 2),
              },
            ],
          };
        }

        case "restore_agent_version": {
          const params = args as Record<string, unknown>;
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
        }

        // Schedule Tools
        case "list_agent_schedules": {
          const params = args as Record<string, unknown>;
          const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
          const schedules = await apiClient.getAgentSchedules(agentId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(schedules, null, 2),
              },
            ],
          };
        }

        case "create_agent_schedule": {
          const params = args as Record<string, unknown>;
          const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
          const name = validateString(params, "name")!;
          const scheduleType = validateNumber(params, "scheduleType", { required: false, min: 1, max: 3, integer: true });
          const startTime = validateString(params, "startTime", false);
          const cronExpression = validateString(params, "cronExpression", false);
          const runEveryCount = validateNumber(params, "runEveryCount", { required: false, min: 1, integer: true });
          const runEveryPeriod = validateNumber(params, "runEveryPeriod", { required: false, min: 1, max: 5, integer: true });
          const timezone = validateString(params, "timezone", false);
          const inputParameters = validateJsonString(params, "inputParameters", false);
          const isEnabled = validateBoolean(params, "isEnabled", false);
          const parallelism = validateNumber(params, "parallelism", { required: false, min: 1, max: 50, integer: true });
          const parallelMaxConcurrency = validateNumber(params, "parallelMaxConcurrency", { required: false, min: 1, integer: true });
          const parallelExport = validateString(params, "parallelExport", false);
          const logLevel = validateString(params, "logLevel", false);
          const logMode = validateString(params, "logMode", false);
          const isExclusive = validateBoolean(params, "isExclusive", false);
          const isWaitOnFailure = validateBoolean(params, "isWaitOnFailure", false);

          // Validate schedule type specific parameters
          const effectiveScheduleType = scheduleType ?? 3; // Default to CRON

          // RunOnce (1): startTime is required and must be at least 1 minute in the future
          if (effectiveScheduleType === 1) {
            if (!startTime) {
              throw new Error("startTime is required when scheduleType is 1 (RunOnce)");
            }
            validateStartTimeInFuture(startTime, 1);
          }

          // RunEvery (2): runEveryCount and runEveryPeriod are required, startTime is optional but must be in the future if provided
          if (effectiveScheduleType === 2) {
            if (runEveryCount === undefined || runEveryPeriod === undefined) {
              throw new Error("runEveryCount and runEveryPeriod are required when scheduleType is 2 (RunEvery)");
            }
            if (startTime) {
              validateStartTimeInFuture(startTime, 0);
            }
          }

          // CRON (3): cronExpression is required, startTime is not used
          if (effectiveScheduleType === 3 && !cronExpression) {
            throw new Error("cronExpression is required when scheduleType is 3 (CRON)");
          }

          const schedule = await apiClient.createAgentSchedule(agentId, {
            name,
            scheduleType: effectiveScheduleType,
            startTime,
            cronExpression,
            runEveryCount,
            runEveryPeriod,
            timezone,
            inputParameters,
            isEnabled: isEnabled ?? true,
            parallelism: parallelism ?? 1,
            parallelMaxConcurrency,
            parallelExport,
            logLevel,
            logMode,
            isExclusive,
            isWaitOnFailure,
          });
          return {
            content: [
              {
                type: "text",
                text: `Schedule created successfully.\n\n${JSON.stringify(schedule, null, 2)}`,
              },
            ],
          };
        }

        case "delete_agent_schedule": {
          const params = args as Record<string, unknown>;
          const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
          const scheduleId = validateNumber(params, "scheduleId", { min: 1, integer: true })!;
          await apiClient.deleteAgentSchedule(agentId, scheduleId);
          return {
            content: [
              {
                type: "text",
                text: `Successfully deleted schedule ${scheduleId} from agent ${agentId}`,
              },
            ],
          };
        }

        case "get_agent_schedule": {
          const params = args as Record<string, unknown>;
          const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
          const scheduleId = validateNumber(params, "scheduleId", { min: 1, integer: true })!;
          const schedule = await apiClient.getAgentSchedule(agentId, scheduleId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(schedule, null, 2),
              },
            ],
          };
        }

        case "update_agent_schedule": {
          const params = args as Record<string, unknown>;
          const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
          const scheduleId = validateNumber(params, "scheduleId", { min: 1, integer: true })!;
          const name = validateString(params, "name")!;
          const scheduleType = validateNumber(params, "scheduleType", { required: false, min: 1, max: 3, integer: true });
          const startTime = validateString(params, "startTime", false);
          const cronExpression = validateString(params, "cronExpression", false);
          const runEveryCount = validateNumber(params, "runEveryCount", { required: false, min: 1, integer: true });
          const runEveryPeriod = validateNumber(params, "runEveryPeriod", { required: false, min: 1, max: 5, integer: true });
          const timezone = validateString(params, "timezone", false);
          const inputParameters = validateJsonString(params, "inputParameters", false);
          const isEnabled = validateBoolean(params, "isEnabled", false);
          const parallelism = validateNumber(params, "parallelism", { required: false, min: 1, max: 50, integer: true });
          const parallelMaxConcurrency = validateNumber(params, "parallelMaxConcurrency", { required: false, min: 1, integer: true });
          const parallelExport = validateString(params, "parallelExport", false);
          const logLevel = validateString(params, "logLevel", false);
          const logMode = validateString(params, "logMode", false);
          const isExclusive = validateBoolean(params, "isExclusive", false);
          const isWaitOnFailure = validateBoolean(params, "isWaitOnFailure", false);

          const hasCronFields = cronExpression !== undefined;
          const hasRunEveryFields = runEveryCount !== undefined || runEveryPeriod !== undefined;

          if (hasCronFields && hasRunEveryFields && scheduleType === undefined) {
            throw new Error(
              "Conflicting schedule fields: both cronExpression and runEveryCount/runEveryPeriod were provided without an explicit scheduleType. " +
              "Specify scheduleType to clarify intent (2=RunEvery, 3=CRON)."
            );
          }

          // Infer scheduleType from provided fields when not explicitly set,
          // so the user doesn't have to redundantly specify it on every update.
          let effectiveScheduleType = scheduleType;
          if (effectiveScheduleType === undefined) {
            if (hasCronFields) effectiveScheduleType = 3;
            else if (hasRunEveryFields) effectiveScheduleType = 2;
          }

          if (effectiveScheduleType === 1 && startTime) {
            validateStartTimeInFuture(startTime, 1);
          }
          if (effectiveScheduleType === 2 && startTime) {
            validateStartTimeInFuture(startTime, 0);
          }

          const updated = await apiClient.updateAgentSchedule(agentId, scheduleId, {
            name,
            scheduleType: effectiveScheduleType,
            startTime,
            cronExpression,
            runEveryCount,
            runEveryPeriod,
            timezone,
            inputParameters,
            isEnabled,
            parallelism,
            parallelMaxConcurrency,
            parallelExport,
            logLevel,
            logMode,
            isExclusive,
            isWaitOnFailure,
          });
          return {
            content: [
              {
                type: "text",
                text: `Schedule updated successfully.\n\n${JSON.stringify(updated, null, 2)}`,
              },
            ],
          };
        }

        case "enable_agent_schedule": {
          const params = args as Record<string, unknown>;
          const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
          const scheduleId = validateNumber(params, "scheduleId", { min: 1, integer: true })!;
          await apiClient.enableAgentSchedule(agentId, scheduleId);
          return {
            content: [
              {
                type: "text",
                text: `Successfully enabled schedule ${scheduleId} for agent ${agentId}. The schedule will now run according to its configuration.`,
              },
            ],
          };
        }

        case "disable_agent_schedule": {
          const params = args as Record<string, unknown>;
          const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
          const scheduleId = validateNumber(params, "scheduleId", { min: 1, integer: true })!;
          await apiClient.disableAgentSchedule(agentId, scheduleId);
          return {
            content: [
              {
                type: "text",
                text: `Successfully disabled schedule ${scheduleId} for agent ${agentId}. The schedule will not run until re-enabled.`,
              },
            ],
          };
        }

        case "get_scheduled_runs": {
          const params = args as Record<string, unknown>;
          const startDate = validateString(params, "startDate", false);
          const endDate = validateString(params, "endDate", false);
          const schedules = await apiClient.getUpcomingSchedules(startDate, endDate);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(schedules, null, 2),
              },
            ],
          };
        }

        // Billing/Credits Tools
        case "get_credits_balance": {
          const balance = await apiClient.getCreditsBalance();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(balance, null, 2),
              },
            ],
          };
        }

        case "get_spending_summary": {
          const params = args as Record<string, unknown>;
          const startDate = validateString(params, "startDate", false);
          const endDate = validateString(params, "endDate", false);
          const spending = await apiClient.getSpendingSummary(startDate, endDate);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(spending, null, 2),
              },
            ],
          };
        }

        case "get_credit_history": {
          const params = args as Record<string, unknown>;
          const pageIndex = validateNumber(params, "pageIndex", { required: false, min: 1, integer: true });
          const recordsPerPage = validateNumber(params, "recordsPerPage", { required: false, min: 1, max: 100, integer: true });
          const history = await apiClient.getCreditHistory(pageIndex, recordsPerPage);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(history, null, 2),
              },
            ],
          };
        }

        // Space Tools
        case "list_spaces": {
          const spaces = await apiClient.getAllSpaces();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(spaces, null, 2),
              },
            ],
          };
        }

        case "get_space": {
          const params = args as Record<string, unknown>;
          const spaceId = validateNumber(params, "spaceId", { min: 1, integer: true })!;
          const space = await apiClient.getSpace(spaceId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(space, null, 2),
              },
            ],
          };
        }

        case "get_space_agents": {
          const params = args as Record<string, unknown>;
          const spaceId = validateNumber(params, "spaceId", { min: 1, integer: true })!;
          const agents = await apiClient.getSpaceAgents(spaceId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(agents, null, 2),
              },
            ],
          };
        }

        case "search_space_by_name": {
          const params = args as Record<string, unknown>;
          const name = validateString(params, "name")!;
          const space = await apiClient.searchSpaceByName(name);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(space, null, 2),
              },
            ],
          };
        }

        case "run_space_agents": {
          const params = args as Record<string, unknown>;
          const spaceId = validateNumber(params, "spaceId", { min: 1, integer: true })!;
          const inputParameters = validateJsonString(params, "inputParameters", false);
          const result = await apiClient.runSpaceAgents(spaceId, inputParameters);
          return {
            content: [
              {
                type: "text",
                text: `Started agents in space.\n\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        }

        // Analytics Tools
        case "get_runs_summary": {
          const params = args as Record<string, unknown>;
          const startDate = validateString(params, "startDate", false);
          const endDate = validateString(params, "endDate", false);
          const status = validateString(params, "status", false);
          const includeDetails = validateBoolean(params, "includeDetails", false);
          const summary = await apiClient.getRunsSummary(startDate, endDate, status, includeDetails);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(summary, null, 2),
              },
            ],
          };
        }

        case "get_records_summary": {
          const params = args as Record<string, unknown>;
          const startDate = validateString(params, "startDate", false);
          const endDate = validateString(params, "endDate", false);
          const agentId = validateNumber(params, "agentId", { required: false, min: 1, integer: true });
          const summary = await apiClient.getRecordsSummary(startDate, endDate, agentId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(summary, null, 2),
              },
            ],
          };
        }

        case "get_run_diagnostics": {
          const params = args as Record<string, unknown>;
          const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
          const runId = validateNumber(params, "runId", { min: 1, integer: true })!;
          const diagnostics = await apiClient.getRunDiagnostics(agentId, runId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(diagnostics, null, 2),
              },
            ],
          };
        }

        case "get_latest_failure": {
          const params = args as Record<string, unknown>;
          const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
          const diagnostics = await apiClient.getLatestFailure(agentId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(diagnostics, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      // Build a user-friendly error message based on the error type
      let errorMessage: string;
      let errorPrefix = "Error";

      if (error instanceof RateLimitError) {
        // 429 Too Many Requests — tell the AI to wait and retry
        errorPrefix = "Rate Limited";
        const retryHint = error.retryAfterSeconds
          ? ` Try again in ${error.retryAfterSeconds} seconds.`
          : " Please wait a moment before retrying.";
        errorMessage = `The Sequentum API rate limit has been reached.${retryHint}`;
      } else if (error instanceof AuthenticationError) {
        // No credentials configured at all
        errorPrefix = "Authentication Error";
        errorMessage = error.message;
      } else if (error instanceof ApiRequestError) {
        // Typed HTTP error — provide context based on status code
        if (error.isUnauthorized) {
          errorPrefix = "Authentication Failed";
          errorMessage = "Your API key or OAuth token is invalid or has expired. Please check your credentials.";
        } else if (error.isForbidden) {
          errorPrefix = "Access Denied";
          errorMessage = "You don't have permission to perform this action. Check your API key permissions.";
        } else if (error.isNotFound) {
          errorPrefix = "Not Found";
          errorMessage = error.message;
        } else if (error.isServerError) {
          errorPrefix = "Server Error";
          errorMessage = `The Sequentum API encountered an internal error (${error.statusCode}). This is a server-side issue — please try again later.`;
        } else {
          errorPrefix = `API Error (${error.statusCode})`;
          errorMessage = error.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = "An unknown error occurred";
      }

      return {
        content: [
          {
            type: "text",
            text: `${errorPrefix}: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // ==========================================
  // Resource Handlers
  // ==========================================

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources,
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates,
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (DEBUG) {
      console.error(`[DEBUG] Resource read: ${uri}`);
    }

    try {
      const content = await readResource(uri, apiClient);
      return {
        contents: [content],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      throw new Error(`Failed to read resource ${uri}: ${errorMessage}`);
    }
  });

  // ==========================================
  // Prompt Handlers
  // ==========================================

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts,
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (DEBUG) {
      console.error(`[DEBUG] Prompt requested: ${name}`);
      console.error(`[DEBUG] Args: ${JSON.stringify(args)}`);
    }

    const messages = getPromptMessages(name, args);
    return { messages };
  });

  return server;
}
