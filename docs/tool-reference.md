# Tool Reference

The Sequentum MCP Server provides tools across 8 categories for managing web scraping agents, runs, schedules, and more. These tools become available once you connect to the server -- either via the [remote OAuth setup](../README.md#getting-started) at `https://mcp.sequentum.com/mcp` or the [local API key setup](../README.md#alternative-local-setup-api-key).

> **Pagination:** Tools that return lists (`list_agents`, `get_agent_runs`, `get_credit_history`) support pagination via `pageIndex` (1-based) and `recordsPerPage`. When the result is paginated, the response includes the total count so you know if more pages are available.

## Quick Reference

| Tool | Description |
|------|-------------|
| **Agent Management** | |
| [`list_agents`](#list_agents) | List agents with IDs, names, status, and configuration |
| [`get_agent`](#get_agent) | Get detailed info about a specific agent |
| [`search_agents`](#search_agents) | Search agents by name or description |
| **Run Management** | |
| [`get_agent_runs`](#get_agent_runs) | Get execution history for an agent |
| [`get_run_status`](#get_run_status) | Get the current status of a specific run |
| [`start_agent`](#start_agent) | Start an agent execution (async or sync) |
| [`stop_agent`](#stop_agent) | Stop a running agent |
| [`kill_agent`](#kill_agent) | Force-terminate an unresponsive agent |
| **File Management** | |
| [`get_run_files`](#get_run_files) | List output files from a completed run |
| [`get_file_download_url`](#get_file_download_url) | Get a temporary download URL for a file |
| **Version Management** | |
| [`get_agent_versions`](#get_agent_versions) | List saved versions of an agent's configuration |
| [`restore_agent_version`](#restore_agent_version) | Restore an agent to a previous version |
| **Schedule Management** | |
| [`list_agent_schedules`](#list_agent_schedules) | List scheduled tasks for an agent |
| [`create_agent_schedule`](#create_agent_schedule) | Create a schedule (cron, interval, or one-time) |
| [`delete_agent_schedule`](#delete_agent_schedule) | Remove a schedule from an agent |
| [`get_scheduled_runs`](#get_scheduled_runs) | Get upcoming scheduled runs across all agents |
| **Billing & Credits** | |
| [`get_credits_balance`](#get_credits_balance) | Get current available credits balance |
| [`get_spending_summary`](#get_spending_summary) | Get credits spent in a date range |
| [`get_credit_history`](#get_credit_history) | Get credit transaction history |
| **Space Management** | |
| [`list_spaces`](#list_spaces) | List all accessible spaces |
| [`get_space`](#get_space) | Get details of a specific space |
| [`get_space_agents`](#get_space_agents) | List agents in a space |
| [`search_space_by_name`](#search_space_by_name) | Find a space by name |
| [`run_space_agents`](#run_space_agents) | Start all agents in a space (batch) |
| **Analytics & Diagnostics** | |
| [`get_runs_summary`](#get_runs_summary) | Get aggregate run statistics for a date range |
| [`get_records_summary`](#get_records_summary) | Get records extracted/exported in a date range |
| [`get_run_diagnostics`](#get_run_diagnostics) | Get error details and suggested fixes for a run |
| [`get_latest_failure`](#get_latest_failure) | Get diagnostics for the most recent failure |

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

> **See also:** [`search_agents`](#search_agents) for faster name-based search, [`get_agent`](#get_agent) for full details on a specific agent.

---

### get_agent

Get detailed information about a specific agent including its configuration, input parameters, and documentation.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. Get this from `list_agents` or `search_agents`. |

#### Returns

Full agent details with `id`, `name`, `status`, `configType`, `version`, `description`, `documentation`, `startUrl`, `inputParameters`, `lastActivity`, `created`, `updated`.

#### Example Prompts

```
Tell me about agent 123
What parameters does agent 456 need?
Show agent configuration for ID 789
```

> **See also:** [`start_agent`](#start_agent) to run the agent, [`get_agent_versions`](#get_agent_versions) to view its version history.

---

### search_agents

Search for agents by name or description (case-insensitive partial match). Faster than `list_agents` when you know part of the agent name.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Search term to match against agent names and descriptions. |
| `maxRecords` | number | No | Maximum results to return. Default: 50, Max: 1000. |

#### Returns

Array of matching agents with `id`, `name`, `status`, `configType`.

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

> **See also:** [`get_run_status`](#get_run_status) when you only need one run's status, [`get_run_diagnostics`](#get_run_diagnostics) to investigate a failed run.

---

### get_run_status

Get the current status of a specific run. Faster than `get_agent_runs` when you only need one run's status.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |
| `runId` | number | Yes | The run ID returned by `start_agent` or found in `get_agent_runs`. |

#### Returns

Single run details with `id`, `status`, `startTime`, `endTime`, `recordsExtracted`, `recordsExported`, `errorMessage`.

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
| `timeout` | number | No | Timeout in seconds for synchronous runs. Default: 60, Max: 3600. |
| `parallelism` | number | No | Number of parallel instances. Default: 1. |

#### Returns

- **Async mode**: `runId`, `status`
- **Sync mode**: Scraped data directly as JSON/text

#### Errors

| Condition | What happens |
|-----------|-------------|
| Agent is disabled or archived | Fails with an error message |
| Insufficient credits | Fails with an error. Check balance with `get_credits_balance`. |
| Invalid input parameters | Fails with a validation error. Check expected parameters with `get_agent`. |
| Sync timeout exceeded | Returns a timeout error. Increase `timeout` or use async mode. |

#### Example Prompts

```
Run agent 123
Start the Amazon scraper with URL https://amazon.com/product/123
Execute agent 456 synchronously and show me the results
```

> **See also:** [`get_run_status`](#get_run_status) to monitor async runs, [`stop_agent`](#stop_agent) to cancel a running agent.

---

### stop_agent

Stop a running agent execution immediately. Use to cancel runs that are taking too long or no longer needed.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. |
| `runId` | number | Yes | The run ID to stop. Get this from `start_agent` response or `get_agent_runs`. |

#### Returns

Confirmation message that the stop command was sent.

#### Example Prompts

```
Stop run 123 for agent 456
Cancel the scraper
Abort that running job
```

> **See also:** [`kill_agent`](#kill_agent) if the agent does not stop and remains stuck in "Stopping" state.

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

> **See also:** [`get_file_download_url`](#get_file_download_url) to download a specific file.

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

Temporary download URL (`url`) that can be used to download the file directly.

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

> **See also:** [`restore_agent_version`](#restore_agent_version) to roll back to a previous version.

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

#### Errors

| Condition | What happens |
|-----------|-------------|
| Invalid version number | Fails with a 404 error. Use `get_agent_versions` to find valid version numbers. |
| Agent is currently running | The restore may affect subsequent runs but will not interrupt an active run. |

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

> **See also:** [`create_agent_schedule`](#create_agent_schedule) to add a new schedule, [`delete_agent_schedule`](#delete_agent_schedule) to remove one.

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
| `startTime` | string | Conditional | ISO 8601 UTC datetime. Required for RunOnce (must be at least 1 minute in the future). Optional for RunEvery. |
| `cronExpression` | string | Conditional | For CRON: `'min hr day mo wkday'`. Example: `'0 9 * * 1,4'` = Mon/Thu 9am. |
| `runEveryCount` | number | Conditional | For RunEvery: interval count. |
| `runEveryPeriod` | number | Conditional | For RunEvery: 0=min, 1=hr, 2=day, 3=wk, 4=mo. |
| `timezone` | string | No | Timezone (e.g., `'America/New_York'`). Default: UTC. |
| `inputParameters` | string | No | JSON input parameters for runs. |
| `isEnabled` | boolean | No | Whether schedule is active. Default: `true`. |
| `parallelism` | number | No | Parallel instances. Default: 1. |

#### Returns

Created schedule details with `id`, `name`, `nextRunTime`, `cronExpression`/`schedule`, `timezone`, `isEnabled`.

#### Errors

| Condition | What happens |
|-----------|-------------|
| `startTime` is in the past | Fails with a validation error. RunOnce start time must be at least 1 minute in the future. |
| Missing required fields for schedule type | Fails with a validation error (e.g., CRON type without `cronExpression`). |
| Invalid cron expression | Fails with a validation error. Use standard 5-field cron format. |

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

> **See also:** [`get_spending_summary`](#get_spending_summary) for usage over time, [`get_credit_history`](#get_credit_history) for individual transactions.

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

> **See also:** [`get_space_agents`](#get_space_agents) to list agents in a space, [`search_space_by_name`](#search_space_by_name) to find a space by name.

---

### get_space

Get details of a specific space including its description and settings.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `spaceId` | number | Yes | The unique ID of the space. Get this from `list_spaces`. |

#### Returns

Space details with `id`, `name`, `description`, `organizationId`, `created`, `updated`.

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

> **See also:** [`run_space_agents`](#run_space_agents) to start all agents in the space at once.

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

Summary with `totalAgents`, `agentsStarted`, `agentsFailed`, and individual results per agent.

#### Errors

| Condition | What happens |
|-----------|-------------|
| Some agents fail to start | The operation continues and reports partial results. Check `agentsFailed` in the response. |
| Insufficient credits | Agents that cannot start due to credit limits are reported in the failed results. |

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

`totalRuns`, `completedRuns`, `failedRuns`, `completedWithErrorsRuns`, `runningRuns`, `queuedRuns`, `stoppedRuns`. When `includeDetails` is `true`, also includes `failedRunDetails` with `agentId`, `agentName`, `runId`, `errorMessage`.

#### Example Prompts

```
How many agents ran yesterday?
What failed last week?
Show run statistics for this month
```

> **See also:** [`get_records_summary`](#get_records_summary) for extraction statistics, [`get_latest_failure`](#get_latest_failure) to investigate a specific failure.

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

`errorMessage`, `possibleCauses` (array of strings), `suggestedActions` (array of strings), `status`, `startTime`, `endTime`, `recordsExtracted`, `recordsExported`.

#### Example Prompts

```
Why did run 123 fail?
Show error details for this run
Debug run 456 for agent 789
```

> **See also:** [`get_latest_failure`](#get_latest_failure) as a shortcut to diagnose the most recent failure without needing a run ID.

---

### get_latest_failure

Get diagnostics for the most recent failed run of an agent. Includes error analysis and suggested fixes.

This is a shortcut for calling `get_agent_runs`, filtering for failures, then calling `get_run_diagnostics`.

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentId` | number | Yes | The unique ID of the agent. Get this from `list_agents` or `search_agents`. |

#### Returns

`errorMessage`, `possibleCauses` (array of strings), `suggestedActions` (array of strings), `status`, `startTime`, `endTime`, `recordsExtracted`, `recordsExported`.

Returns an informational message if the agent has no recent failed runs.

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
