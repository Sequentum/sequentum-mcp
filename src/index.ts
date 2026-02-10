#!/usr/bin/env node

/**
 * Sequentum MCP Server
 * 
 * A Model Context Protocol (MCP) server that enables AI assistants to interact
 * with the Sequentum web scraping platform.
 * 
 * Supports two transport modes:
 * 
 * 1. STDIO MODE (default) - For Claude Code and local development
 *    Environment Variables:
 *      SEQUENTUM_API_URL - Base URL of the Sequentum API (default: https://dashboard.sequentum.com)
 *      SEQUENTUM_API_KEY - Your API key (required, format: sk-...)
 *      DEBUG - Set to '1' for debug logging
 * 
 * 2. HTTP MODE - For Claude Connectors (claude.ai, Claude Desktop)
 *    Environment Variables:
 *      TRANSPORT_MODE - Set to 'http' to enable HTTP mode
 *      PORT - HTTP server port (default: 3000)
 *      HOST - HTTP server host (default: 0.0.0.0)
 *      SEQUENTUM_API_URL - Base URL of the Sequentum API (default: https://dashboard.sequentum.com)
 *      DEBUG - Set to '1' for debug logging
 *      MCP_CLIENT_ID - Fallback OAuth client_id if backend metadata is unavailable
 *      REQUIRE_AUTH - Set to 'false' to bypass OAuth for testing (limited use: allows
 *                     connecting to MCP server but tools will fail without valid tokens)
 *    
 *    Authentication: OAuth2 tokens are provided by Claude's infrastructure
 *    via the Authorization header on each request.
 */

import { createRequire } from "module";
import { randomUUID } from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";
import { SequentumApiClient } from "./api-client.js";
import { AgentApiModel, AgentRunFileApiModel, AgentRunStatus, AuthMode, ConfigType, ListAgentsRequest } from "./types.js";
import { validateStartTimeInFuture } from "./validation.js";

// Import version from package.json
const require = createRequire(import.meta.url);
const { version } = require("../package.json");

// Configuration from environment variables
const DEFAULT_API_URL = "https://dashboard.sequentum.com";
const API_BASE_URL = process.env.SEQUENTUM_API_URL || DEFAULT_API_URL;
const API_KEY = process.env.SEQUENTUM_API_KEY;
const DEBUG = process.env.DEBUG === '1';

// Transport configuration
// - "stdio": For Claude Code and local development (default)
// - "http": For Claude Connectors (claude.ai, Claude Desktop)
const TRANSPORT_MODE = process.env.TRANSPORT_MODE || "stdio";
const HTTP_PORT = parseInt(process.env.PORT || "3000", 10);
const HTTP_HOST = process.env.HOST || "0.0.0.0";

// Determine authentication mode based on transport
// - stdio mode: Uses API Key (for local development and Claude Code)
// - HTTP mode: Uses OAuth2 via Claude's infrastructure (for Claude Connectors)
let authMode: AuthMode;

if (TRANSPORT_MODE === "http") {
  // HTTP mode: OAuth2 is required and handled by Claude's infrastructure
  // Tokens will be passed in Authorization header of each request
  authMode = "oauth2";
  if (DEBUG) {
    console.error(`[DEBUG] HTTP mode: OAuth2 tokens will be received via request headers`);
  }
} else {
  // stdio mode: API Key is required
  if (!API_KEY) {
    console.error("Error: API Key required for stdio mode");
    console.error('Set SEQUENTUM_API_KEY="sk-your-api-key-here"');
    console.error("\nFor Claude Connectors (OAuth2), use HTTP mode:");
    console.error('Set TRANSPORT_MODE="http"');
    process.exit(1);
  }
  authMode = "apikey";
  if (DEBUG) {
    console.error(`[DEBUG] Using API Key authentication`);
  }
}

// Debug: Log environment configuration (only when DEBUG=1)
if (DEBUG) {
  console.error(`[DEBUG] TRANSPORT_MODE = ${TRANSPORT_MODE}`);
  console.error(`[DEBUG] API_BASE_URL = ${API_BASE_URL}${!process.env.SEQUENTUM_API_URL ? ' (default)' : ''}`);
  console.error(`[DEBUG] Auth Mode = ${authMode}`);
  if (TRANSPORT_MODE === "http") {
    console.error(`[DEBUG] HTTP_PORT = ${HTTP_PORT}`);
    console.error(`[DEBUG] HTTP_HOST = ${HTTP_HOST}`);
  }
}

// Create API client
// - stdio mode: initialized with API key
// - HTTP mode: initialized without auth (tokens come via request headers)
const client = new SequentumApiClient(API_BASE_URL, authMode === "apikey" ? API_KEY : null);

// ==========================================
// Input Validation Helpers
// ==========================================

function validateNumber(
  args: Record<string, unknown>,
  field: string,
  required: boolean = true
): number | undefined {
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

// ==========================================
// Tool Definitions
// ==========================================

const tools: Tool[] = [
  // Agent Tools
  {
    name: "list_agents",
    description:
      "List web scraping agents with IDs, names, status, and configuration. " +
      "USE THIS FIRST to discover available agents before running or managing them. " +
      "Answers: 'What agents do I have?', 'Show me my scrapers', 'List all completed agents'. " +
      "Returns: Array of agent summaries with id, name, status (last run status), configType, version, lastActivity. " +
      "Pagination always applied (defaults: pageIndex=1, recordsPerPage=50). " +
      "TIP: Use 'search' param to find agents by name, or 'status' to filter by last run status (Completed, Failed, etc.).",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: {
          type: "number",
          enum: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          description: "Filter by last run status: 0=Invalid, 1=Running, 2=Exporting, 3=Starting, 4=Queuing, 5=Stopping, 6=Failure, 7=Failed, 8=Stopped, 9=Completed, 10=Success, 11=Skipped, 12=Waiting. Agents that never ran have null status.",
        },
        spaceId: {
          type: "number",
          description: "Filter by space ID. Use list_spaces first to find space IDs.",
        },
        search: {
          type: "string",
          description: "Search by agent name (case-insensitive partial match). Example: 'amazon' finds 'Amazon Product Scraper'.",
        },
        configType: {
          type: "string",
          enum: ["Agent", "Command", "Api", "Shared"],
          description: "Filter by type. 'Agent' = web scrapers, 'Command' = data inputs, 'Api' = API configs, 'Shared' = reusable components.",
        },
        sortColumn: {
          type: "string",
          enum: ["name", "lastActivity", "created", "updated", "status", "configType"],
          description: "Column to sort by. 'lastActivity' shows recently run agents first (with sortOrder=1).",
        },
        sortOrder: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort direction. 'desc' = newest/Z first (descending), 'asc' = oldest/A first (ascending, default).",
        },
        pageIndex: {
          type: "number",
          description: "Page number (1-based). Defaults to 1. Use with recordsPerPage to paginate large result sets.",
        },
        recordsPerPage: {
          type: "number",
          description: "Results per page. Defaults to 50. Max recommended: 100.",
        },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "get_agent",
    description:
      "Get detailed information about a specific agent including its configuration, input parameters, and documentation. " +
      "USE AFTER list_agents or search_agents when you need full details for a specific agent. " +
      "Answers: 'Tell me about agent X', 'What parameters does this agent need?', 'Show agent configuration'. " +
      "Returns: Full agent details including inputParameters (what inputs the agent accepts), description, documentation, startUrl. " +
      "REQUIRED: You must have the agentId first (get it from list_agents or search_agents).",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent. Get this from list_agents or search_agents." },
      },
      required: ["agentId"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "search_agents",
    description:
      "Search for agents by name or description (case-insensitive partial match). " +
      "FASTER than list_agents when user mentions a specific agent name. " +
      "Answers: 'Find the Amazon scraper', 'Which agent handles product data?', 'Search for pricing agents'. " +
      "Returns: Matching agents with id, name, status, configType. " +
      "TIP: Prefer this over list_agents when user mentions an agent by name.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search term to match against agent names and descriptions. Case-insensitive." },
        maxRecords: { type: "number", description: "Maximum results to return. Default: 50, Max: 1000." },
      },
      required: ["query"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },

  // Run Tools
  {
    name: "get_agent_runs",
    description:
      "Get execution history for an agent showing past runs with status, timing, and records extracted. " +
      "Answers: 'When did agent X last run?', 'Show run history', 'How many records were extracted?', 'Did the agent fail?'. " +
      "Returns: Array of runs with id, status (Running/Completed/Failed/etc), startTime, endTime, recordsExtracted, recordsExported, errorMessage. " +
      "TIP: Check the most recent run's status to see if agent is currently running or recently completed. " +
      "NEXT STEP: Use get_run_files to see output files from a completed run.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent. Get this from list_agents or search_agents." },
        maxRecords: { type: "number", description: "Maximum number of runs to return. Default: 50. Use smaller values for faster response." },
      },
      required: ["agentId"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "get_run_status",
    description:
      "Get the current status of a specific run. FASTER than get_agent_runs when you only need one run's status. " +
      "Answers: 'Is run 123 still running?', 'Did that run complete?', 'Check run status'. " +
      "Returns: Single run with status, timing, records extracted. " +
      "USE AFTER start_agent to monitor a run you just started. " +
      "Status values: Running, Completed, Failed, CompletedWithErrors, Stopped, Queued.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
        runId: { type: "number", description: "The run ID returned by start_agent or found in get_agent_runs." },
      },
      required: ["agentId", "runId"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "start_agent",
    description:
      "Start a web scraping agent execution. Two modes available: " +
      "(1) ASYNC (default): Returns immediately with runId - use get_run_status to monitor progress. " +
      "(2) SYNC: Set isRunSynchronously=true to wait and get scraped data directly (best for quick agents <60s). " +
      "Answers: 'Run agent X', 'Start the scraper', 'Execute the Amazon agent', 'Scrape this website'. " +
      "Returns: In async mode: {runId, status}. In sync mode: Scraped data directly as JSON/text. " +
      "REQUIRED: Get agentId first using list_agents or search_agents. " +
      "TIP: Use get_agent first to check what inputParameters the agent accepts before running.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent to run. Get this from list_agents or search_agents." },
        inputParameters: { type: "string", description: "JSON string of input parameters. Check agent's inputParameters with get_agent to see what's accepted. Example: '{\"url\": \"https://example.com\"}'" },
        isRunSynchronously: { type: "boolean", description: "If true, wait for completion and return scraped data. If false (default), return immediately with runId. Use true only for quick agents." },
        timeout: { type: "number", description: "Timeout in seconds for synchronous runs. Only used when isRunSynchronously=true. Default: 60." },
        parallelism: { type: "number", description: "Number of parallel instances. Default: 1. Cannot be >1 when isRunSynchronously=true." },
      },
      required: ["agentId"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "stop_agent",
    description:
      "Stop a running agent execution immediately. Use to cancel runs that are taking too long or no longer needed. " +
      "Answers: 'Stop that run', 'Cancel the scraper', 'Abort agent X', 'Kill the running job'. " +
      "REQUIRED: You need both agentId and runId. Get runId from start_agent response or get_agent_runs.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
        runId: { type: "number", description: "The run ID to stop. Get this from start_agent response or get_agent_runs." },
      },
      required: ["agentId", "runId"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "kill_agent",
    description:
      "Force-terminate an agent when stop_agent is not working. " +
      "BEHAVIOR: First call initiates graceful stop (same as stop_agent). Second call forces immediate process termination if still stopping. " +
      "USE WHEN: stop_agent was called but agent is still running/stopping and not responding. " +
      "Answers: 'Force kill stuck agent', 'Agent won't stop', 'Terminate unresponsive run'. " +
      "REQUIRED: agentId and runId. Get runId from start_agent or get_agent_runs. " +
      "WARNING: This is a destructive operation that can forcefully terminate server processes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
        runId: { type: "number", description: "The run ID to kill. Get from start_agent or get_agent_runs." },
      },
      required: ["agentId", "runId"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
  },

  // File Tools
  {
    name: "get_run_files",
    description:
      "List all output files generated by a completed run. Files contain scraped data in formats like CSV, JSON, Excel. " +
      "Answers: 'What files did the run produce?', 'Show output files', 'Where is the scraped data?', 'Download results'. " +
      "Returns: Array of files with id, name, fileType, fileSize, created. " +
      "USE AFTER a run completes (status=Completed) to see available downloads. " +
      "NEXT STEP: Use get_file_download_url with a fileId to get the actual download link.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
        runId: { type: "number", description: "The run ID. Get this from get_agent_runs or start_agent response." },
      },
      required: ["agentId", "runId"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "get_file_download_url",
    description:
      "Get a temporary download URL for a specific output file. The URL expires after a short time. " +
      "Answers: 'Download the CSV file', 'Get the output data', 'Give me the file link'. " +
      "Returns: Temporary URL that can be used to download the file directly. " +
      "REQUIRED: Get fileId first from get_run_files. " +
      "TIP: Share the URL with the user so they can download the file.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
        runId: { type: "number", description: "The run ID." },
        fileId: { type: "number", description: "The file ID from get_run_files response." },
      },
      required: ["agentId", "runId", "fileId"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },

  // Version Tools
  {
    name: "get_agent_versions",
    description:
      "List all saved versions of an agent's configuration. Use for reviewing change history or finding a version to restore. " +
      "Answers: 'Show agent version history', 'What changes were made?', 'List previous versions'. " +
      "Returns: Array of versions with version number, userName (who made the change), created date, comments, fileSize. " +
      "NEXT STEP: Use restore_agent_version to roll back to a previous version if needed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
      },
      required: ["agentId"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "restore_agent_version",
    description:
      "Restore an agent to a previous version. This creates a NEW version based on the restored configuration. " +
      "Answers: 'Roll back agent to version X', 'Undo agent changes', 'Restore previous configuration'. " +
      "WARNING: This modifies the agent. Use get_agent_versions first to find the correct version number. " +
      "REQUIRED: Provide a reason in 'comments' explaining why the restore is needed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
        versionNumber: { type: "number", description: "The version number to restore to. Get this from get_agent_versions." },
        comments: { type: "string", description: "Explanation for why this version is being restored. Will be recorded in version history." },
      },
      required: ["agentId", "versionNumber", "comments"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },

  // Schedule Tools
  {
    name: "list_agent_schedules",
    description:
      "List all scheduled tasks for a specific agent. Shows when the agent is configured to run automatically. " +
      "Answers: 'When does this agent run?', 'Show schedules for agent X', 'Is this agent scheduled?'. " +
      "Returns: Array of schedules with id, name, cronExpression/schedule, nextRunTime, isEnabled, timezone. " +
      "TIP: Check isEnabled to see if the schedule is active.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
      },
      required: ["agentId"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "create_agent_schedule",
    description:
      "Create a scheduled task to automatically run an agent. " +
      "Three schedule types available: " +
      "RunOnce (1): Runs once at startTime (required, must be >=1 min in future UTC). " +
      "RunEvery (2): Repeats every runEveryCount periods (runEveryPeriod: 1=min, 2=hr, 3=day, 4=wk, 5=mo). Optional startTime for first run (must be in future if provided). " +
      "CRON (3): Uses cronExpression for complex schedules (e.g., '0 9 * * 1,4' = Mon/Thu 9am). " +
      "Always specify timezone for local time interpretation. " +
      "Examples: CRON daily at 9am: {scheduleType:3, cronExpression:'0 9 * * *'}. " +
      "RunOnce: {scheduleType:1, startTime:'2026-01-20T14:30:00Z'}. " +
      "RunEvery 30min: {scheduleType:2, runEveryCount:30, runEveryPeriod:1}.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent to schedule. Get this from list_agents or search_agents." },
        name: { type: "string", description: "A descriptive name for the schedule (e.g., 'Daily Morning Run')." },
        scheduleType: { 
          type: "number", 
          enum: [1, 2, 3],
          description: "Schedule type: 1=RunOnce (single execution), 2=RunEvery (recurring interval), 3=CRON (cron expression). Default: 3 (CRON)." 
        },
        startTime: { 
          type: "string", 
          description: "ISO 8601 UTC datetime (e.g., '2026-01-20T14:30:00Z'). Required for RunOnce (must be >=1 min in future). Optional for RunEvery (sets first run time, must be in future). Not used for CRON." 
        },
        cronExpression: { 
          type: "string", 
          description: "CRON expression for scheduleType=3. Format: 'minute hour day month weekday'. Examples: '0 9 * * *' (daily 9am), '0 9 * * 1,4' (Mon/Thu 9am), '*/30 * * * *' (every 30 min)." 
        },
        runEveryCount: { 
          type: "number", 
          description: "For scheduleType=2 (RunEvery): The interval count. Example: 30 with runEveryPeriod=1 means every 30 minutes." 
        },
        runEveryPeriod: { 
          type: "number", 
          enum: [1, 2, 3, 4, 5],
          description: "For scheduleType=2 (RunEvery): The time unit. 1=minutes, 2=hours, 3=days, 4=weeks, 5=months." 
        },
        timezone: { 
          type: "string", 
          description: "Timezone for schedule interpretation (e.g., 'America/New_York', 'America/Denver', 'Europe/London'). Default: UTC." 
        },
        inputParameters: { type: "string", description: "Optional JSON string of input parameters to pass to each scheduled run." },
        isEnabled: { type: "boolean", description: "Whether the schedule is active. Default: true." },
        parallelism: { type: "number", description: "Number of parallel instances to run. Default: 1." },
      },
      required: ["agentId", "name"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "delete_agent_schedule",
    description:
      "Remove a schedule from an agent. The agent will no longer run automatically on this schedule. " +
      "Answers: 'Stop the scheduled runs', 'Remove the Monday schedule', 'Delete schedule X'. " +
      "WARNING: This permanently deletes the schedule. Use list_agent_schedules first to find the scheduleId.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
        scheduleId: { type: "number", description: "The schedule ID to delete. Get this from list_agent_schedules." },
      },
      required: ["agentId", "scheduleId"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
  },
  {
    name: "get_scheduled_runs",
    description:
      "Get all upcoming scheduled runs across all agents in a date range. Shows what will run and when. " +
      "Answers: 'What runs this week?', 'Show upcoming schedules', 'What agents are scheduled tomorrow?'. " +
      "Returns: Array of upcoming runs with scheduleId, agentId, agentName, scheduleName, nextRunTime, isEnabled. " +
      "TIP: If no dates provided, defaults to the next 7 days.",
    inputSchema: {
      type: "object" as const,
      properties: {
        startDate: { type: "string", description: "Start date in ISO 8601 format. Example: '2026-01-16'. Defaults to today." },
        endDate: { type: "string", description: "End date in ISO 8601 format. Example: '2026-01-23'. Defaults to 7 days from start." },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
    },
  },

  // Billing/Credits Tools
  {
    name: "get_credits_balance",
    description:
      "Get the current available credits balance for the organization. " +
      "Answers: 'How many credits do I have?', 'What's my balance?', 'Check credits'. " +
      "Returns: availableCredits, organizationId, retrievedAt timestamp.",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "get_spending_summary",
    description:
      "Get a summary of credits spent in a date range. " +
      "Answers: 'How much have I spent?', 'What's my usage this week?', 'Show spending for January'. " +
      "Returns: totalSpent, startDate, endDate, currentBalance. " +
      "TIP: If no dates provided, returns spending for the current period.",
    inputSchema: {
      type: "object" as const,
      properties: {
        startDate: { type: "string", description: "Start date in ISO 8601 format. Example: '2026-01-01'." },
        endDate: { type: "string", description: "End date in ISO 8601 format. Example: '2026-01-31'." },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "get_credit_history",
    description:
      "Get the transaction history of credits (additions from purchases, deductions from usage). " +
      "Answers: 'Show credit history', 'What were my credit transactions?', 'When were credits added?'. " +
      "Returns: Array of transactions with transactionType, amount, balance, created date, message.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pageIndex: { type: "number", description: "Page number (1-based). Default: 1." },
        recordsPerPage: { type: "number", description: "Records per page. Default: 50, Max: 100." },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
    },
  },

  // Space Tools
  {
    name: "list_spaces",
    description:
      "List all accessible spaces (folders for organizing agents into groups). " +
      "Answers: 'What spaces do I have?', 'Show my folders', 'List agent groups'. " +
      "Returns: Array of spaces with id, name, description. " +
      "USE THIS to find spaceId before using get_space_agents or filtering list_agents by space.",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "get_space",
    description:
      "Get details of a specific space including its description and settings. " +
      "Answers: 'Tell me about space X', 'Show space details'. " +
      "Returns: Space details with id, name, description, organizationId, created/updated dates.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: { type: "number", description: "The unique ID of the space. Get this from list_spaces." },
      },
      required: ["spaceId"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "get_space_agents",
    description:
      "List all agents that belong to a specific space. " +
      "Answers: 'What agents are in space X?', 'Show agents in the Production folder'. " +
      "Returns: Array of agents in the space with id, name, status, configType, lastActivity. " +
      "ALTERNATIVE: You can also use list_agents with spaceId filter.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: { type: "number", description: "The unique ID of the space. Get this from list_spaces or search_space_by_name." },
      },
      required: ["spaceId"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "search_space_by_name",
    description:
      "Find a space by its name. Use when user mentions a space by name instead of ID. " +
      "Answers: 'Find the Production space', 'Get the Bot Blocking folder'. " +
      "Returns: Matching space with id, name, description. " +
      "NEXT STEP: Use the returned spaceId with get_space_agents or run_space_agents.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "The space name to search for. Case-insensitive." },
      },
      required: ["name"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "run_space_agents",
    description:
      "Start ALL agents in a space at once (batch operation). Useful for running a group of related agents together. " +
      "Answers: 'Run all agents in space X', 'Execute the Production folder', 'Start all scrapers in Bot Blocking'. " +
      "Returns: Summary with totalAgents, agentsStarted, agentsFailed, and individual results. " +
      "WARNING: This starts multiple agents. Use get_space_agents first to see what will run.",
    inputSchema: {
      type: "object" as const,
      properties: {
        spaceId: { type: "number", description: "The unique ID of the space. Get this from list_spaces or search_space_by_name." },
        inputParameters: { type: "string", description: "Optional JSON string of input parameters to pass to ALL agents in the space." },
      },
      required: ["spaceId"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },

  // Analytics Tools
  {
    name: "get_runs_summary",
    description:
      "Get aggregate statistics about agent runs in a date range: counts of completed, failed, running, etc. " +
      "Answers: 'How many agents ran yesterday?', 'What failed last week?', 'Show run statistics', 'Give me a summary of runs'. " +
      "Returns: totalRuns, completedRuns, failedRuns, completedWithErrorsRuns, runningRuns, queuedRuns, stoppedRuns. " +
      "TIP: Set includeDetails=true to get details of which specific agents failed and why. " +
      "TIP: Use status filter to focus on specific outcomes (e.g., 'Failed' to see only failures).",
    inputSchema: {
      type: "object" as const,
      properties: {
        startDate: { type: "string", description: "Start date in ISO 8601 format. Example: '2026-01-15'. Defaults to today if not specified." },
        endDate: { type: "string", description: "End date in ISO 8601 format. Example: '2026-01-16'. Defaults to today if not specified." },
        status: { type: "string", description: "Filter by run status: 'Failed', 'Completed', 'CompletedWithErrors', 'Running'. Only shows runs with this status." },
        includeDetails: { type: "boolean", description: "If true, includes failedRunDetails array with specific agent names and error messages. Default: true." },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "get_records_summary",
    description:
      "Get a summary of how many records were extracted and exported by agents in a date range. " +
      "Answers: 'How many records were scraped?', 'What was the output yesterday?', 'Show extraction statistics'. " +
      "Returns: totalRecordsExtracted, totalRecordsExported, totalErrors, totalPageLoads, runCount. " +
      "TIP: Use agentId filter to see statistics for a specific agent only.",
    inputSchema: {
      type: "object" as const,
      properties: {
        startDate: { type: "string", description: "Start date in ISO 8601 format. Example: '2026-01-15'." },
        endDate: { type: "string", description: "End date in ISO 8601 format. Example: '2026-01-16'." },
        agentId: { type: "number", description: "Optional: Filter to show records for a specific agent only." },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "get_run_diagnostics",
    description:
      "Get detailed diagnostics for a specific run, including error messages, possible causes, and suggested fixes. " +
      "Answers: 'Why did run X fail?', 'Show error details for this run', 'Debug run 123'. " +
      "Returns: errorMessage, possibleCauses (array), suggestedActions (array), run timing and stats. " +
      "USE THIS when you have a specific runId. Use get_latest_failure if you just want the most recent failure.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
        runId: { type: "number", description: "The run ID to diagnose. Get this from get_agent_runs." },
      },
      required: ["agentId", "runId"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "get_latest_failure",
    description:
      "Get diagnostics for the most recent failed run of an agent. Includes error analysis and suggested fixes. " +
      "Answers: 'Why did my agent fail?', 'What went wrong?', 'Debug agent X', 'Show the last error'. " +
      "Returns: errorMessage, possibleCauses, suggestedActions, run timing and stats. " +
      "USE THIS instead of get_run_diagnostics when user asks about failure without specifying a run ID. " +
      "SHORTCUT: This is faster than calling get_agent_runs + filtering for Failed + get_run_diagnostics.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent. Get this from list_agents or search_agents." },
      },
      required: ["agentId"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
];

// ==========================================
// Server Factory
// ==========================================

/**
 * Create a new MCP Server instance with all handlers registered.
 * Each session in HTTP mode needs its own Server instance.
 * 
 * @param apiClient - The API client to use for this server instance
 * @returns Configured MCP Server instance
 */
function createMcpServer(apiClient: SequentumApiClient): Server {
  const server = new Server(
    {
      name: "sequentum-mcp-server",
      version,
    },
    {
      capabilities: {
        tools: {},
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
        const statusNum = validateNumber(params, "status", false);
        const spaceId = validateNumber(params, "spaceId", false);
        const search = validateString(params, "search", false);
        const configTypeStr = validateString(params, "configType", false);
        const sortColumn = validateString(params, "sortColumn", false);
        const sortOrderStr = validateString(params, "sortOrder", false);
        const pageIndex = validateNumber(params, "pageIndex", false);
        const recordsPerPage = validateNumber(params, "recordsPerPage", false);

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
        
        // Check if response is paginated (has 'data', 'items', 'records', or 'agents' property) or plain array
        let agents: AgentApiModel[];
        let paginationInfo: { totalCount?: number; pageIndex?: number; recordsPerPage?: number } | null = null;
        
        if (Array.isArray(response)) {
          agents = response;
        } else if (response && typeof response === 'object') {
          // Try common property names for paginated responses
          const possibleDataProps = ['data', 'items', 'records', 'agents', 'results'];
          const dataKey = possibleDataProps.find(key => key in response && Array.isArray((response as any)[key]));
          
          if (dataKey) {
            agents = (response as any)[dataKey];
            paginationInfo = {
              totalCount: (response as any).totalCount ?? (response as any).total ?? (response as any).count,
              pageIndex: (response as any).pageIndex ?? (response as any).page,
              recordsPerPage: (response as any).recordsPerPage ?? (response as any).pageSize ?? (response as any).limit,
            };
          } else {
            // Unknown structure - return raw response
            if (DEBUG) {
              console.error(`[DEBUG] Unknown response structure: ${JSON.stringify(response).substring(0, 500)}`);
            }
            return {
              content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
            };
          }
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
        const agentId = validateNumber(params, "agentId")!;
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
        const maxRecords = validateNumber(params, "maxRecords", false);
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
        const agentId = validateNumber(params, "agentId")!;
        const maxRecords = validateNumber(params, "maxRecords", false);
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
        const agentId = validateNumber(params, "agentId")!;
        const runId = validateNumber(params, "runId")!;
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
        const agentId = validateNumber(params, "agentId")!;
        const inputParameters = validateString(params, "inputParameters", false);
        const isRunSynchronously = validateBoolean(params, "isRunSynchronously", false);
        const timeout = validateNumber(params, "timeout", false);
        const parallelism = validateNumber(params, "parallelism", false);

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
        const agentId = validateNumber(params, "agentId")!;
        const runId = validateNumber(params, "runId")!;
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
        const agentId = validateNumber(params, "agentId")!;
        const runId = validateNumber(params, "runId")!;
        await client.killAgent(agentId, runId);
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
        const agentId = validateNumber(params, "agentId")!;
        const runId = validateNumber(params, "runId")!;
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
        const agentId = validateNumber(params, "agentId")!;
        const runId = validateNumber(params, "runId")!;
        const fileId = validateNumber(params, "fileId")!;
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
        const agentId = validateNumber(params, "agentId")!;
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
        const agentId = validateNumber(params, "agentId")!;
        const versionNumber = validateNumber(params, "versionNumber")!;
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
        const agentId = validateNumber(params, "agentId")!;
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
        const agentId = validateNumber(params, "agentId")!;
        const name = validateString(params, "name")!;
        const scheduleType = validateNumber(params, "scheduleType", false);
        const startTime = validateString(params, "startTime", false);
        const cronExpression = validateString(params, "cronExpression", false);
        const runEveryCount = validateNumber(params, "runEveryCount", false);
        const runEveryPeriod = validateNumber(params, "runEveryPeriod", false);
        const timezone = validateString(params, "timezone", false);
        const inputParameters = validateString(params, "inputParameters", false);
        const isEnabled = validateBoolean(params, "isEnabled", false);
        const parallelism = validateNumber(params, "parallelism", false);

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
        const agentId = validateNumber(params, "agentId")!;
        const scheduleId = validateNumber(params, "scheduleId")!;
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
        const pageIndex = validateNumber(params, "pageIndex", false);
        const recordsPerPage = validateNumber(params, "recordsPerPage", false);
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
        const spaceId = validateNumber(params, "spaceId")!;
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
        const spaceId = validateNumber(params, "spaceId")!;
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
        const spaceId = validateNumber(params, "spaceId")!;
        const inputParameters = validateString(params, "inputParameters", false);
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
        const agentId = validateNumber(params, "agentId", false);
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
        const agentId = validateNumber(params, "agentId")!;
        const runId = validateNumber(params, "runId")!;
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
        const agentId = validateNumber(params, "agentId")!;
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
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
  });

  return server;
}

// ==========================================
// Main Entry Point
// ==========================================

/**
 * Start the MCP server in stdio mode (for Claude Code and local development)
 */
async function startStdioServer() {
  console.error(`Authentication: API Key`);

  // Create server instance and connect to stdio transport
  const server = createMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sequentum MCP Server running on stdio");
  console.error(`Connected to: ${API_BASE_URL}`);
}

/**
 * Session data for HTTP mode - stores server and transport per session
 */
interface HttpSession {
  server: Server;
  transport: StreamableHTTPServerTransport;
  apiClient: SequentumApiClient;
  createdAt: number;
  lastActivityAt: number;
}

/**
 * Start the MCP server in HTTP mode (for Claude Connectors)
 * Uses Streamable HTTP transport as required by Claude Connectors Directory
 * Creates a new Server instance per session for proper isolation.
 */
async function startHttpServer() {
  const app = express();
  
  // Trust X-Forwarded-Proto from reverse proxies (cloudflared, ngrok, etc.)
  // This ensures req.protocol returns 'https' when behind a TLS-terminating proxy
  app.set('trust proxy', true);
  
  // Parse JSON bodies
  app.use(express.json());

  // CORS middleware - required for browser-based clients like MCP Inspector
  app.use((req: Request, res: Response, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, mcp-session-id");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
    
    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Store sessions by session ID - each session has its own server, transport, and API client
  const sessions = new Map<string, HttpSession>();

  // Clean up stale sessions every 15 minutes
  // Sessions are removed if they haven't had activity in over 1 hour
  const SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
  const SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  
  setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [sessionId, session] of sessions) {
      if (now - session.lastActivityAt > SESSION_MAX_AGE_MS) {
        sessions.delete(sessionId);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0 || DEBUG) {
      console.error(`[MCP] Session cleanup: removed ${cleanedCount} stale sessions, ${sessions.size} active`);
    }
  }, SESSION_CLEANUP_INTERVAL_MS);

  /**
   * Create a new HTTP session with MCP server, transport, and API client
   */
  async function createSession(token: string | null): Promise<HttpSession> {
    const sessionApiClient = new SequentumApiClient(API_BASE_URL, null);
    if (token) {
      sessionApiClient.setAccessToken(token);
    }
    
    const server = createMcpServer(sessionApiClient);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    
    await server.connect(transport);
    
    const now = Date.now();
    return { 
      server, 
      transport, 
      apiClient: sessionApiClient, 
      createdAt: now, 
      lastActivityAt: now 
    };
  }

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", version, transport: "streamable-http" });
  });

  // OAuth2 Authorization Server Metadata (RFC 8414)
  // This enables MCP clients to discover OAuth2 endpoints automatically
  // OAuth URLs are derived from the API base URL (same server hosts both API and OAuth)
  
  // Cache for backend OAuth metadata (specifically client_id)
  let cachedBackendMetadata: { client_id?: string; fetchedAt?: number } | null = null;
  const METADATA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetch OAuth metadata from the backend to get the client_id
   * Results are cached for 5 minutes to avoid repeated requests.
   * Falls back to MCP_CLIENT_ID environment variable if backend is unavailable.
   */
  async function fetchBackendOAuthMetadata(): Promise<{ client_id?: string }> {
    // Return cached data if still valid
    if (cachedBackendMetadata?.fetchedAt && 
        Date.now() - cachedBackendMetadata.fetchedAt < METADATA_CACHE_TTL_MS) {
      return cachedBackendMetadata;
    }

    try {
      const metadataUrl = `${API_BASE_URL}/.well-known/oauth-authorization-server`;
      if (DEBUG) {
        console.error(`[DEBUG] Fetching OAuth metadata from backend: ${metadataUrl}`);
      }
      
      const response = await fetch(metadataUrl);
      if (response.ok) {
        const metadata = await response.json();
        cachedBackendMetadata = {
          client_id: metadata.client_id,
          fetchedAt: Date.now(),
        };
        if (DEBUG) {
          console.error(`[DEBUG] Fetched client_id from backend: ${metadata.client_id}`);
        }
        return cachedBackendMetadata;
      } else {
        console.error(`[WARN] Backend OAuth metadata returned ${response.status}`);
      }
    } catch (error) {
      console.error(`[WARN] Failed to fetch OAuth metadata from backend:`, error);
    }

    // Fallback to environment variable if backend fetch failed
    const fallbackClientId = process.env.MCP_CLIENT_ID;
    if (fallbackClientId) {
      if (DEBUG) {
        console.error(`[DEBUG] Using fallback MCP_CLIENT_ID from environment: ${fallbackClientId}`);
      }
      return { client_id: fallbackClientId };
    }

    return {};
  }

  /**
   * Build OAuth metadata, fetching client_id from backend
   */
  async function buildOAuthMetadata(): Promise<Record<string, unknown>> {
    const backendMetadata = await fetchBackendOAuthMetadata();
    
    const metadata: Record<string, unknown> = {
      issuer: API_BASE_URL,
      authorization_endpoint: `${API_BASE_URL}/api/oauth/authorize`,
      token_endpoint: `${API_BASE_URL}/api/oauth/token`,
      token_endpoint_auth_methods_supported: ["none"], // Public client (PKCE)
      grant_types_supported: ["authorization_code", "refresh_token"],
      response_types_supported: ["code"],
      scopes_supported: ["agents:read", "runs:read", "spaces:read", "agents:write", "offline_access"],
      code_challenge_methods_supported: ["S256"], // PKCE support
      service_documentation: "https://docs.sequentum.com/api",
      resource_indicators_supported: true,
    };

    // Include client_id only if available from backend
    if (backendMetadata.client_id) {
      metadata.client_id = backendMetadata.client_id;
    }

    return metadata;
  }

  // RFC 8414 standard path - Authorization Server Metadata
  app.get("/.well-known/oauth-authorization-server", async (_req: Request, res: Response) => {
    const metadata = await buildOAuthMetadata();
    res.json(metadata);
  });

  // RFC 9728 - Protected Resource Metadata (required by MCP spec 2025-06-18)
  // This tells MCP clients which authorization server to use for this resource.
  // Per MCP spec, the resource MUST be the MCP server's own canonical URL,
  // as MCP clients compute the expected resource from the URL they connect to.
  app.get("/.well-known/oauth-protected-resource", async (req: Request, res: Response) => {
    const backendMetadata = await fetchBackendOAuthMetadata();
    
    // The resource is this MCP server's own URL (origin)
    // MCP clients (e.g., Cursor) validate this matches the URL they connected to
    const resourceUrl = `${req.protocol}://${req.get("host")}`;
    
    const protectedResourceMetadata = {
      // The canonical URI of this MCP server (the protected resource)
      resource: resourceUrl,
      // Authorization servers that can issue tokens for this resource
      authorization_servers: [API_BASE_URL],
      // Scopes supported by this resource
      scopes_supported: ["agents:read", "runs:read", "spaces:read", "agents:write", "offline_access"],
      // Bearer token is required
      bearer_methods_supported: ["header"],
      // Include client_id if available from backend
      ...(backendMetadata.client_id && { client_id: backendMetadata.client_id }),
    };

    res.json(protectedResourceMetadata);
  });

  // MCP-specific compatibility path
  app.get("/oauth/metadata", async (_req: Request, res: Response) => {
    const metadata = await buildOAuthMetadata();
    res.json(metadata);
  });

  // Log incoming requests for debugging (only when DEBUG is enabled)
  if (DEBUG) {
    app.use("/mcp", (req: Request, _res: Response, next) => {
      console.error(`[MCP] ${req.method} ${req.url}`);
      
      // Redact sensitive headers before logging
      const safeHeaders = { ...req.headers };
      const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
      for (const header of sensitiveHeaders) {
        if (safeHeaders[header]) {
          safeHeaders[header] = '[REDACTED]';
        }
      }
      console.error(`[MCP] Headers: ${JSON.stringify(safeHeaders)}`);
      
      if (req.body && Object.keys(req.body).length > 0) {
        console.error(`[MCP] Body: ${JSON.stringify(req.body)}`);
      }
      next();
    });
  }

  // Handle POST requests for client-to-server messages
  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      // Get session ID from header
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let session: HttpSession | undefined;

      if (sessionId) {
        session = sessions.get(sessionId);
      }

      // If no existing session, create a new one
      if (!session) {
        // Extract Bearer token from Authorization header
        const authHeader = req.headers.authorization;
        let token: string | null = null;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
          if (DEBUG) {
            console.error("[DEBUG] Bearer token received for new session");
          }
        }

        // Require authentication for new sessions (unless REQUIRE_AUTH=false for testing)
        const requireAuth = process.env.REQUIRE_AUTH !== "false";
        if (requireAuth && !token) {
          // Return 401 with WWW-Authenticate header per RFC 9728 Section 5.1
          // The resource is this MCP server's own URL (the protected resource)
          const mcpServerUrl = `${req.protocol}://${req.get("host")}`;
          const wwwAuth = `Bearer resource="${mcpServerUrl}"`;
          const prmUrl = `${mcpServerUrl}/.well-known/oauth-protected-resource`;
          res.setHeader("WWW-Authenticate", wwwAuth);
          const responseBody = {
            jsonrpc: "2.0",
            error: {
              code: -32001,
              message: "Authentication required",
              data: {
                // Point to Protected Resource Metadata on this MCP server
                protectedResourceMetadata: prmUrl,
              },
            },
            id: null,
          };
          res.status(401).json(responseBody);
          console.error("[MCP] 401 - Authentication required, no Bearer token provided");
          return;
        }

        // Create session with MCP server, transport, and API client
        session = await createSession(token);
        
        // We'll store the session after handleRequest sets the session ID
      }

      // Update last activity timestamp for session keep-alive
      session.lastActivityAt = Date.now();

      // Update token if provided (in case of token refresh)
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        session.apiClient.setAccessToken(token);
      }

      // Handle the request
      await session.transport.handleRequest(req, res, req.body);
      
      // Store session if it's new (get session ID from response header)
      if (!sessionId) {
        const newSessionId = res.getHeader("mcp-session-id") as string;
        if (newSessionId && !sessions.has(newSessionId)) {
          sessions.set(newSessionId, session);
        } else if (!newSessionId) {
          // Cleanup orphaned session to prevent memory leaks
          // This can happen if handleRequest fails to set a session ID
          console.error(`[MCP] Warning: No session ID returned, cleaning up orphaned session`);
          try {
            await session.server.close();
          } catch (closeError) {
            console.error(`[MCP] Error closing orphaned session:`, closeError);
          }
        }
      }

    } catch (error) {
      console.error("Error handling MCP POST request:", error);
      if (!res.headersSent) {
        // Sanitize error messages in production to avoid exposing internal details
        const errorMessage = DEBUG 
          ? (error instanceof Error ? error.message : "Internal server error")
          : "Internal server error";
        res.status(500).json({ 
          jsonrpc: "2.0",
          error: { 
            code: -32603, 
            message: errorMessage
          },
          id: null
        });
      }
    }
  });

  // Handle GET requests for SSE streams
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    
    if (!sessionId) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Missing session ID for SSE stream" },
        id: null
      });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or expired session" },
        id: null
      });
      return;
    }

    // Update last activity timestamp for session keep-alive
    session.lastActivityAt = Date.now();

    try {
      await session.transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP GET request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "SSE stream error" },
          id: null
        });
      }
    }
  });

  // Handle DELETE requests for session termination
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      sessions.delete(sessionId);
      try {
        await session?.server.close();
      } catch (e) {
        if (DEBUG) {
          console.error(`[DEBUG] Error closing session on DELETE:`, e);
        }
      }
      if (DEBUG) {
        console.error(`[DEBUG] Session terminated: ${sessionId}`);
      }
    }
    
    res.status(200).json({ message: "Session terminated" });
  });

  // Start the HTTP server
  app.listen(HTTP_PORT, HTTP_HOST, () => {
    console.error(`Sequentum MCP Server running on HTTP`);
    console.error(`  URL: http://${HTTP_HOST}:${HTTP_PORT}/mcp`);
    console.error(`  Transport: Streamable HTTP`);
    console.error(`  Connected to: ${API_BASE_URL}`);
    console.error(`  Health check: http://${HTTP_HOST}:${HTTP_PORT}/health`);
  });
}

async function main() {
  if (TRANSPORT_MODE === "http") {
    await startHttpServer();
  } else {
    await startStdioServer();
  }
}

main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});



