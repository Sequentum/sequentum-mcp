/**
 * MCP Tool Definitions
 *
 * Contains all tool schemas exposed by the Sequentum MCP server.
 * Each tool describes its name, description, inputSchema, and annotations.
 */

import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const tools: Tool[] = [
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
        parallelMaxConcurrency: { type: "number", description: "Maximum concurrent parallel instances. Only relevant when parallelism > 1." },
        parallelExport: {
          type: "string",
          enum: ["Combined", "Separated"],
          description: "How parallel run exports are handled. 'Combined' merges output, 'Separated' keeps per-instance files.",
        },
        logLevel: {
          type: "string",
          enum: ["Fatal", "Error", "Warning", "Info"],
          description: "Log verbosity for scheduled runs. Default: 'Info'.",
        },
        logMode: {
          type: "string",
          enum: ["Text", "TextAndHtml"],
          description: "Log format. 'Text' for plain text, 'TextAndHtml' for both. Default: 'Text'.",
        },
        isExclusive: { type: "boolean", description: "If true, prevents concurrent runs of this agent. Default: false." },
        isWaitOnFailure: { type: "boolean", description: "If true, waits before retrying after a failure. Default: false." },
        // NOTE: proxyPoolId and serverGroupId are intentionally omitted from the MCP tool.
        // The API supports them, but users have no way to discover valid IDs through the MCP
        // (no list-proxy-pools or list-server-groups endpoints exist). Users needing these
        // should configure them via the Sequentum dashboard.
        // localSchedule is also omitted — it's a human-readable string generated server-side.
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
    name: "get_agent_schedule",
    description:
      "Get details of a specific schedule for an agent. " +
      "Answers: 'Show me schedule X details', 'What are the settings for this schedule?'. " +
      "Returns: Full schedule details including name, cronExpression, nextRunTime, isEnabled, timezone, and run parameters.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
        scheduleId: { type: "number", description: "The schedule ID. Get this from list_agent_schedules." },
      },
      required: ["agentId", "scheduleId"],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  {
    name: "update_agent_schedule",
    description:
      "Update an existing schedule for an agent. Modify timing, parameters, or other settings. " +
      "Answers: 'Change the schedule to run at 10am', 'Update the cron expression', 'Modify the schedule timezone'. " +
      "Three schedule types: RunOnce (1), RunEvery (2), CRON (3). " +
      "TIP: Use get_agent_schedule or list_agent_schedules first to see current settings before updating.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
        scheduleId: { type: "number", description: "The schedule ID to update. Get this from list_agent_schedules." },
        name: { type: "string", description: "A descriptive name for the schedule." },
        scheduleType: {
          type: "number",
          enum: [1, 2, 3],
          description: "Schedule type: 1=RunOnce (single execution), 2=RunEvery (recurring interval), 3=CRON (cron expression)."
        },
        startTime: {
          type: "string",
          description: "Start time in ISO 8601 UTC format (e.g., '2026-01-20T14:30:00Z'). Required for RunOnce, optional for RunEvery."
        },
        cronExpression: {
          type: "string",
          description: "CRON expression for scheduleType=3. Format: 'minute hour day month weekday'. Examples: '0 9 * * *' (daily 9am), '0 9 * * 1,4' (Mon/Thu 9am)."
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
          description: "Timezone for schedule interpretation (e.g., 'America/New_York', 'Europe/London')."
        },
        inputParameters: { type: "string", description: "Optional JSON string of input parameters to pass to each scheduled run." },
        isEnabled: { type: "boolean", description: "Whether the schedule is active." },
        parallelism: { type: "number", description: "Number of parallel instances to run." },
        parallelMaxConcurrency: { type: "number", description: "Maximum concurrent parallel instances. Only relevant when parallelism > 1." },
        parallelExport: {
          type: "string",
          enum: ["Combined", "Separated"],
          description: "How parallel run exports are handled. 'Combined' merges output, 'Separated' keeps per-instance files.",
        },
        logLevel: {
          type: "string",
          enum: ["Fatal", "Error", "Warning", "Info"],
          description: "Log verbosity for scheduled runs. Default: 'Info'.",
        },
        logMode: {
          type: "string",
          enum: ["Text", "TextAndHtml"],
          description: "Log format. 'Text' for plain text, 'TextAndHtml' for both. Default: 'Text'.",
        },
        isExclusive: { type: "boolean", description: "If true, prevents concurrent runs of this agent." },
        isWaitOnFailure: { type: "boolean", description: "If true, waits before retrying after a failure." },
        // NOTE: proxyPoolId and serverGroupId are intentionally omitted from the MCP tool.
        // The API supports them, but users have no way to discover valid IDs through the MCP
        // (no list-proxy-pools or list-server-groups endpoints exist). Users needing these
        // should configure them via the Sequentum dashboard.
        // localSchedule is also omitted — it's a human-readable string generated server-side.
      },
      required: ["agentId", "scheduleId", "name"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "enable_agent_schedule",
    description:
      "Enable a previously disabled schedule so it will run according to its configuration. " +
      "Answers: 'Turn on the schedule', 'Re-enable the Monday schedule', 'Activate schedule X'. " +
      "TIP: Use list_agent_schedules to check current isEnabled status first.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
        scheduleId: { type: "number", description: "The schedule ID to enable. Get this from list_agent_schedules." },
      },
      required: ["agentId", "scheduleId"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "disable_agent_schedule",
    description:
      "Disable a schedule so it will not run until re-enabled. The schedule is preserved but inactive. " +
      "Answers: 'Pause the schedule', 'Turn off the daily run', 'Disable schedule X temporarily'. " +
      "TIP: Unlike delete, this preserves the schedule configuration. Use enable_agent_schedule to reactivate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "number", description: "The unique ID of the agent." },
        scheduleId: { type: "number", description: "The schedule ID to disable. Get this from list_agent_schedules." },
      },
      required: ["agentId", "scheduleId"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
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
