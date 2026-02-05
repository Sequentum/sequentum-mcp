# Tool Reference

This document provides detailed documentation for all tools available in the Sequentum MCP server.

## Table of Contents

- [Agent Management](#agent-management)
  - [list_agents](#list_agents)
  - [get_agent](#get_agent)
  - [search_agents](#search_agents)
- [Run Management](#run-management)
  - [get_agent_runs](#get_agent_runs)
  - [get_run_status](#get_run_status)
  - [start_agent](#start_agent)
  - [stop_agent](#stop_agent)
  - [kill_agent](#kill_agent)
- [File Management](#file-management)
  - [get_run_files](#get_run_files)
  - [get_file_download_url](#get_file_download_url)
- [Version Management](#version-management)
  - [get_agent_versions](#get_agent_versions)
  - [restore_agent_version](#restore_agent_version)
- [Schedule Management](#schedule-management)
  - [list_agent_schedules](#list_agent_schedules)
  - [create_agent_schedule](#create_agent_schedule)
  - [delete_agent_schedule](#delete_agent_schedule)
  - [get_scheduled_runs](#get_scheduled_runs)
- [Billing & Credits](#billing--credits)
  - [get_credits_balance](#get_credits_balance)
  - [get_spending_summary](#get_spending_summary)
  - [get_credit_history](#get_credit_history)
  - [get_agents_usage](#get_agents_usage)
  - [get_agent_cost_breakdown](#get_agent_cost_breakdown)
  - [get_agent_runs_cost](#get_agent_runs_cost)
- [Space Management](#space-management)
  - [list_spaces](#list_spaces)
  - [get_space](#get_space)
  - [get_space_agents](#get_space_agents)
  - [search_space_by_name](#search_space_by_name)
  - [run_space_agents](#run_space_agents)
- [Analytics & Diagnostics](#analytics--diagnostics)
  - [get_runs_summary](#get_runs_summary)
  - [get_records_summary](#get_records_summary)
  - [get_run_diagnostics](#get_run_diagnostics)
  - [get_latest_failure](#get_latest_failure)

---

## Agent Management

### list_agents

List web scraping agents with IDs, names, status, and configuration.

**Use this first** to discover available agents before running or managing them.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `status` | number | No | Filter by last run status. See [Run Status Values](#run-status-values). |
| `spaceId` | number | No | Filter by space ID. Use `list_spaces` first to find space IDs. |
| `search` | string | No | Search by agent name (case-insensitive partial match). |
| `configType` | string | No | Filter by type: `Agent`, `Command`, `Api`, or `Shared`. |
| `sortColumn` | string | No | Column to sort by: `name`, `lastActivity`, `created`, `updated`, `status`, `configType`. |
| `sortOrder` | string | No | Sort direction: `asc` (ascending) or `desc` (descending). |
| `pageIndex` | number | No | Page number (1-based). Defaults to 1. |
| `recordsPerPage` | number | No | Results per page. Defaults to 50. Max recommended: 100. |

#### Returns

Array of agent summaries with `id`, `name`, `status`, `configType`, `version`, `lastActivity`.

#### Example Prompts

```
List all my web scraping agents
Show me agents that failed recently
Find agents with "amazon" in the name
```

---

### get_agent

Get detailed information about a specific agent including its configuration, input parameters, and documentation.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. Get this from `list_agents` or `search_agents`. |

#### Returns

Full agent details including `inputParameters`, `description`, `documentation`, `startUrl`.

#### Example Prompts

```
Tell me about agent 123
What parameters does agent 456 need?
Show agent configuration for ID 789
```

---

### search_agents

Search for agents by name or description (case-insensitive partial match). Faster than `list_agents` when you know part of the agent name.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Search term to match against agent names and descriptions. |
| `maxRecords` | number | No | Maximum results to return. Default: 50, Max: 1000. |

#### Returns

Matching agents with `id`, `name`, `status`, `configType`.

#### Example Prompts

```
Find the Amazon scraper
Which agent handles product data?
Search for pricing agents
```

---

## Run Management

### get_agent_runs

Get execution history for an agent showing past runs with status, timing, and records extracted.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |
| `maxRecords` | number | No | Maximum number of runs to return. Default: 50. |

#### Returns

Array of runs with `id`, `status`, `startTime`, `endTime`, `recordsExtracted`, `recordsExported`, `errorMessage`.

#### Example Prompts

```
When did agent 123 last run?
Show run history for agent 456
How many records were extracted by agent 789?
```

---

### get_run_status

Get the current status of a specific run. Faster than `get_agent_runs` when you only need one run's status.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |
| `runId` | number | Yes | The run ID returned by `start_agent` or found in `get_agent_runs`. |

#### Returns

Single run with `status`, timing, records extracted.

#### Example Prompts

```
Is run 123 still running?
Did that run complete?
Check status of run 456
```

---

### start_agent

Start a web scraping agent execution. Two modes available:

1. **Async (default)**: Returns immediately with `runId`. Use `get_run_status` to monitor progress.
2. **Sync**: Set `isRunSynchronously=true` to wait and get scraped data directly (best for quick agents under 60 seconds).

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent to run. |
| `inputParameters` | string | No | JSON string of input parameters. Check agent's `inputParameters` with `get_agent`. Example: `'{"url": "https://example.com"}'` |
| `isRunSynchronously` | boolean | No | If `true`, wait for completion and return scraped data. Default: `false`. |
| `timeout` | number | No | Timeout in seconds for synchronous runs. Default: 60. |
| `parallelism` | number | No | Number of parallel instances. Default: 1. |

#### Returns

- **Async mode**: `{runId, status}`
- **Sync mode**: Scraped data directly as JSON/text

#### Example Prompts

```
Run agent 123
Start the Amazon scraper with URL https://amazon.com/product/123
Execute agent 456 synchronously and show me the results
```

---

### stop_agent

Stop a running agent execution immediately. Use to cancel runs that are taking too long or no longer needed.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |
| `runId` | number | Yes | The run ID to stop. Get this from `start_agent` response or `get_agent_runs`. |

#### Returns

Confirmation message that the run was stopped.

#### Example Prompts

```
Stop run 123 for agent 456
Cancel the scraper
Abort that running job
```

---

### kill_agent

Force-terminate an agent when `stop_agent` is not working. **Only use this if you already called `stop_agent` but the agent is still running or stuck in "Stopping" state.**

This is a last-resort tool for unresponsive agents. In normal operation, use `stop_agent` instead.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |
| `runId` | number | Yes | The run ID to kill. Get this from `start_agent` response or `get_agent_runs`. |

#### Returns

Confirmation message that the kill command was sent.

#### Example Prompts

```
Force kill agent 123, stop_agent didn't work
The agent is stuck stopping, force terminate it
Kill the unresponsive run
```

---

## File Management

### get_run_files

List all output files generated by a completed run. Files contain scraped data in formats like CSV, JSON, Excel.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |
| `runId` | number | Yes | The run ID. Get this from `get_agent_runs` or `start_agent` response. |

#### Returns

Array of files with `id`, `name`, `fileType`, `fileSize`, `created`.

#### Example Prompts

```
What files did run 123 produce?
Show output files for agent 456 run 789
Where is the scraped data?
```

---

### get_file_download_url

Get a temporary download URL for a specific output file. The URL expires after a short time.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |
| `runId` | number | Yes | The run ID. |
| `fileId` | number | Yes | The file ID from `get_run_files` response. |

#### Returns

Temporary URL that can be used to download the file directly.

#### Example Prompts

```
Download the CSV file from run 123
Get me a download link for file 456
Give me the output data file
```

---

## Version Management

### get_agent_versions

List all saved versions of an agent's configuration. Use for reviewing change history or finding a version to restore.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |

#### Returns

Array of versions with `version` number, `userName` (who made the change), `created` date, `comments`, `fileSize`.

#### Example Prompts

```
Show agent version history for 123
What changes were made to agent 456?
List previous versions of the scraper
```

---

### restore_agent_version

Restore an agent to a previous version. This creates a new version based on the restored configuration.

**Warning**: This modifies the agent. Use `get_agent_versions` first to find the correct version number.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |
| `versionNumber` | number | Yes | The version number to restore to. Get this from `get_agent_versions`. |
| `comments` | string | Yes | Explanation for why this version is being restored. Will be recorded in version history. |

#### Returns

Confirmation that the agent was restored and a new version was created.

#### Example Prompts

```
Restore agent 123 to version 5
Roll back the Amazon scraper to yesterday's version
Undo agent changes - go back to version 3
```

---

## Schedule Management

### list_agent_schedules

List all scheduled tasks for a specific agent. Shows when the agent is configured to run automatically.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |

#### Returns

Array of schedules with `id`, `name`, `cronExpression`/`schedule`, `nextRunTime`, `isEnabled`, `timezone`.

#### Example Prompts

```
When does agent 123 run?
Show schedules for the Amazon scraper
Is this agent scheduled?
```

---

### create_agent_schedule

Create a schedule for an agent. Three schedule types are supported:

| Type | Value | Description |
|------|-------|-------------|
| RunOnce | 1 | Run once at a specific time. Requires `startTime`. |
| RunEvery | 2 | Run at regular intervals. Requires `runEveryCount` and `runEveryPeriod`. |
| CRON | 3 | Run based on cron expression. Requires `cronExpression`. |

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | Agent ID to schedule. |
| `name` | string | Yes | Schedule name. |
| `scheduleType` | number | No | 1=RunOnce, 2=RunEvery, 3=CRON. Default: 3. |
| `startTime` | string | Conditional | ISO 8601 UTC datetime. Required for RunOnce (must be ≥1min in future). Optional for RunEvery. |
| `cronExpression` | string | Conditional | For CRON: `'min hr day mo wkday'`. Example: `'0 9 * * 1,4'` = Mon/Thu 9am. |
| `runEveryCount` | number | Conditional | For RunEvery: interval count. |
| `runEveryPeriod` | number | Conditional | For RunEvery: 0=min, 1=hr, 2=day, 3=wk, 4=mo. |
| `timezone` | string | No | Timezone (e.g., `'America/New_York'`). Default: UTC. |
| `inputParameters` | string | No | JSON input parameters for runs. |
| `isEnabled` | boolean | No | Whether schedule is active. Default: `true`. |
| `parallelism` | number | No | Parallel instances. Default: 1. |

#### Returns

Created schedule details with `id`, `nextRunTime`, and configuration.

#### Example Prompts

```
Schedule agent 123 to run every Monday at 9am
Create a daily schedule for the price scraper
Run agent 456 every 6 hours
```

---

### delete_agent_schedule

Remove a schedule from an agent. The agent will no longer run automatically on this schedule.

**Warning**: This permanently deletes the schedule.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |
| `scheduleId` | number | Yes | The schedule ID to delete. Get this from `list_agent_schedules`. |

#### Returns

Confirmation that the schedule was deleted.

#### Example Prompts

```
Stop the scheduled runs for agent 123
Remove the Monday schedule
Delete schedule 456
```

---

### get_scheduled_runs

Get all upcoming scheduled runs across all agents in a date range. Shows what will run and when.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `startDate` | string | No | Start date in ISO 8601 format. Example: `'2026-01-16'`. Defaults to today. |
| `endDate` | string | No | End date in ISO 8601 format. Defaults to 7 days from start. |

#### Returns

Array of upcoming runs with `scheduleId`, `agentId`, `agentName`, `scheduleName`, `nextRunTime`, `isEnabled`.

#### Example Prompts

```
What runs this week?
Show upcoming schedules
What agents are scheduled tomorrow?
```

---

## Billing & Credits

### get_credits_balance

Get the current available credits balance for the organization.

#### Parameters

None.

#### Returns

`availableCredits`, `organizationId`, `retrievedAt` timestamp.

#### Example Prompts

```
How many credits do I have?
What's my balance?
Check credits
```

---

### get_spending_summary

Get a summary of credits spent in a date range.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `startDate` | string | No | Start date in ISO 8601 format. Example: `'2026-01-01'`. |
| `endDate` | string | No | End date in ISO 8601 format. Example: `'2026-01-31'`. |

#### Returns

`totalSpent`, `startDate`, `endDate`, `currentBalance`.

#### Example Prompts

```
How much have I spent?
What's my usage this week?
Show spending for January
```

---

### get_credit_history

Get the transaction history of credits (additions from purchases, deductions from usage).

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `pageIndex` | number | No | Page number (1-based). Default: 1. |
| `recordsPerPage` | number | No | Records per page. Default: 50, Max: 100. |

#### Returns

Array of transactions with `transactionType`, `amount`, `balance`, `created` date, `message`.

#### Example Prompts

```
Show credit history
What were my credit transactions?
When were credits added?
```

---

### get_agents_usage

Get all agents with their total costs for a date range, with filtering and sorting options.

**Use this** to analyze which agents are costing the most, compare agent costs, or track spending by agent.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `startDate` | string | No | Start date in ISO 8601 format. Defaults to start of current month. Example: `'2026-01-01'` or `'2026-01-01T00:00:00Z'`. |
| `endDate` | string | No | End date in ISO 8601 format. Defaults to now. Example: `'2026-01-31'` or `'2026-01-31T23:59:59Z'`. |
| `pageIndex` | number | No | Page number (1-based). Default: 1. |
| `recordsPerPage` | number | No | Records per page. Default: 50, Max: 1000. |
| `sortColumn` | string | No | Column to sort by: `'name'` or `'cost'`. Default: `'name'`. |
| `sortOrder` | number | No | Sort order: 0 = ascending, 1 = descending. Default: 0. |
| `name` | string | No | Filter by agent name (case-insensitive contains match). |
| `usageTypes` | string | No | Filter by usage types (comma-separated). Example: `'Server Time,Export GB'`. |

#### Returns

Paginated list of agents with `agentId`, `agentName`, `cost`, `spaceId`, plus `totalRecordCount` and `totalCost`.

**Usage types** available for filtering: `Server Time`, `Export GB`, `Agent Inputs`, `Proxy Data`, `Export CPM`.

#### Example Prompts

```
Which agents cost the most?
Show agent costs this month
What did agent X cost in January?
List agents by cost for last week
```

---

### get_agent_cost_breakdown

Get detailed cost breakdown by usage type for a specific agent over time, useful for visualizing costs in charts.

**Use this** to understand what's driving costs for an agent (server time vs exports vs proxies), or to chart agent costs over time.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |
| `startDate` | string | No | Start date in ISO 8601 format. Defaults to start of current month. Example: `'2026-01-01'` or `'2026-01-01T00:00:00Z'`. |
| `endDate` | string | No | End date in ISO 8601 format. Defaults to now. Example: `'2026-01-31'` or `'2026-01-31T23:59:59Z'`. |
| `timeUnit` | string | No | Time unit for grouping: `'day'` or `'month'`. Default: `'day'`. |
| `usageTypes` | string | No | Filter by usage types (comma-separated). Example: `'Server Time,Export GB'`. |

#### Returns

Cost data with `agentId`, `agentName`, date `labels` array, `usageTypes` array (each with type name, data points, totalCost), `totalCost`, `startDate`, `endDate`.

The `labels` array corresponds to data points in each `usageTypes.data` array, making it ideal for charting.

#### Example Prompts

```
What's causing agent X's costs?
Show me cost breakdown for agent 123
Chart agent costs by day
What usage types cost the most for agent X?
```

---

### get_agent_runs_cost

Get individual run costs for a specific agent with detailed run information and filtering options.

**Use this** to drill down into specific runs, identify expensive runs, or analyze run costs over time.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |
| `startDate` | string | No | Start date in ISO 8601 format. Defaults to start of current month. Example: `'2026-01-01'` or `'2026-01-01T00:00:00Z'`. |
| `endDate` | string | No | End date in ISO 8601 format. Defaults to now. Example: `'2026-01-31'` or `'2026-01-31T23:59:59Z'`. |
| `pageIndex` | number | No | Page number (1-based). Default: 1. |
| `recordsPerPage` | number | No | Records per page. Default: 50, Max: 1000. |
| `sortColumn` | string | No | Column to sort by: `'date'`, `'cost'`, or `'duration'`. Default: `'date'`. |
| `sortOrder` | number | No | Sort order: 0 = ascending, 1 = descending. Default: 0. |
| `usageTypes` | string | No | Filter by usage types (comma-separated). Example: `'Server Time,Proxy Data'`. |

#### Returns

Paginated list of runs with `runId`, `date`, `startTime`, `endTime`, `cost`, `billingType`, plus `agentId`, `agentName`, `totalRecordCount`, `totalCost`.

#### Example Prompts

```
Which runs were most expensive?
Show run costs for agent X
What did run Y cost?
List the 10 most expensive runs for agent X this month
```

---

## Space Management

### list_spaces

List all accessible spaces (folders for organizing agents into groups).

#### Parameters

None.

#### Returns

Array of spaces with `id`, `name`, `description`.

#### Example Prompts

```
What spaces do I have?
Show my folders
List agent groups
```

---

### get_space

Get details of a specific space including its description and settings.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `spaceId` | number | Yes | The unique ID of the space. Get this from `list_spaces`. |

#### Returns

Space details with `id`, `name`, `description`, `organizationId`, `created`/`updated` dates.

#### Example Prompts

```
Tell me about space 123
Show space details
```

---

### get_space_agents

List all agents that belong to a specific space.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `spaceId` | number | Yes | The unique ID of the space. Get this from `list_spaces` or `search_space_by_name`. |

#### Returns

Array of agents in the space with `id`, `name`, `status`, `configType`, `lastActivity`.

#### Example Prompts

```
What agents are in space 123?
Show agents in the Production folder
List scrapers in the Bot Blocking space
```

---

### search_space_by_name

Find a space by its name. Use when user mentions a space by name instead of ID.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | The space name to search for. Case-insensitive. |

#### Returns

Matching space with `id`, `name`, `description`.

#### Example Prompts

```
Find the Production space
Get the Bot Blocking folder
```

---

### run_space_agents

Start all agents in a space at once (batch operation). Useful for running a group of related agents together.

**Warning**: This starts multiple agents. Use `get_space_agents` first to see what will run.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `spaceId` | number | Yes | The unique ID of the space. Get this from `list_spaces` or `search_space_by_name`. |
| `inputParameters` | string | No | Optional JSON string of input parameters to pass to all agents in the space. |

#### Returns

Summary with `totalAgents`, `agentsStarted`, `agentsFailed`, and individual results.

#### Example Prompts

```
Run all agents in space 123
Execute the Production folder
Start all scrapers in Bot Blocking
```

---

## Analytics & Diagnostics

### get_runs_summary

Get aggregate statistics about agent runs in a date range: counts of completed, failed, running, etc.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `startDate` | string | No | Start date in ISO 8601 format. Defaults to today. |
| `endDate` | string | No | End date in ISO 8601 format. Defaults to today. |
| `status` | string | No | Filter by run status: `'Failed'`, `'Completed'`, `'CompletedWithErrors'`, `'Running'`. |
| `includeDetails` | boolean | No | If `true`, includes `failedRunDetails` array with agent names and error messages. Default: `true`. |

#### Returns

`totalRuns`, `completedRuns`, `failedRuns`, `completedWithErrorsRuns`, `runningRuns`, `queuedRuns`, `stoppedRuns`.

#### Example Prompts

```
How many agents ran yesterday?
What failed last week?
Show run statistics for this month
```

---

### get_records_summary

Get a summary of how many records were extracted and exported by agents in a date range.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `startDate` | string | No | Start date in ISO 8601 format. |
| `endDate` | string | No | End date in ISO 8601 format. |
| `agentId` | number | No | Filter to show records for a specific agent only. |

#### Returns

`totalRecordsExtracted`, `totalRecordsExported`, `totalErrors`, `totalPageLoads`, `runCount`.

#### Example Prompts

```
How many records were scraped?
What was the output yesterday?
Show extraction statistics for agent 123
```

---

### get_run_diagnostics

Get detailed diagnostics for a specific run, including error messages, possible causes, and suggested fixes.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |
| `runId` | number | Yes | The run ID to diagnose. Get this from `get_agent_runs`. |

#### Returns

`errorMessage`, `possibleCauses` (array), `suggestedActions` (array), run timing and stats.

#### Example Prompts

```
Why did run 123 fail?
Show error details for this run
Debug run 456 for agent 789
```

---

### get_latest_failure

Get diagnostics for the most recent failed run of an agent. Includes error analysis and suggested fixes.

This is a shortcut for calling `get_agent_runs`, filtering for failures, then calling `get_run_diagnostics`.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. Get this from `list_agents` or `search_agents`. |

#### Returns

`errorMessage`, `possibleCauses`, `suggestedActions`, run timing and stats.

#### Example Prompts

```
Why did my agent fail?
What went wrong with agent 123?
Show the last error for the Amazon scraper
```

---

## Appendix

### Run Status Values

| Value | Status | Description |
|-------|--------|-------------|
| 0 | Invalid | Invalid or unknown state |
| 1 | Running | Currently executing |
| 2 | Exporting | Exporting data |
| 3 | Starting | Starting up |
| 4 | Queuing | Waiting in queue |
| 5 | Stopping | Shutting down |
| 6 | Failure | Failed during execution |
| 7 | Failed | Completed with failure |
| 8 | Stopped | Manually stopped |
| 9 | Completed | Finished successfully |
| 10 | Success | Completed without errors |
| 11 | Skipped | Skipped execution |
| 12 | Waiting | Waiting for resources |
