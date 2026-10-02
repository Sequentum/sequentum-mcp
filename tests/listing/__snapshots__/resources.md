# Resources

## Agent List

URI: `sequentum://agents`

MIME type: application/json

Overview of all web scraping agents (first page, up to 50 agents). Shows id, name, status, configType, version, and lastActivity for each agent.

## Spaces

URI: `sequentum://spaces`

MIME type: application/json

List of all accessible spaces (folders for organizing agents). Shows id, name, and description for each space.

## Credits Balance

URI: `sequentum://billing/balance`

MIME type: application/json

Current available credits balance for the organization. Shows availableCredits, organizationId, and retrievedAt timestamp.

## Monthly Spending

URI: `sequentum://billing/spending`

MIME type: application/json

Spending summary for the current month. Shows totalSpent, startDate, endDate, organizationId, and currentBalance.

## Agent Costs (Current Month)

URI: `sequentum://billing/agents-usage`

MIME type: application/json

Agent cost totals for the current month (top agents by cost, first page). Shows agents with agentId, agentName, cost, plus totals for the period.

## Recent Runs Summary

URI: `sequentum://analytics/runs`

MIME type: application/json

Summary of all agent runs in the last 24 hours. Shows totalRuns, completedRuns, failedRuns, runningRuns, queuedRuns, and stoppedRuns.

## Upcoming Schedules

URI: `sequentum://analytics/upcoming-schedules`

MIME type: application/json

All scheduled runs for the next 7 days across all agents. Shows scheduleId, agentId, agentName, scheduleName, nextRunTime, and isEnabled.

# Resource templates

## Agent Detail

URI: `sequentum://agents/{agentId}`

MIME type: application/json

Detailed information about a specific agent including configuration, input parameters, and documentation.

## Agent Versions

URI: `sequentum://agents/{agentId}/versions`

MIME type: application/json

Version history of an agent's configuration. Shows version number, who made the change, date, comments, and file size.

## Agent Schedules

URI: `sequentum://agents/{agentId}/schedules`

MIME type: application/json

Scheduled tasks configured for a specific agent. Shows schedule id, name, cron expression, next run time, and enabled status.

## Agent Cost Breakdown

URI: `sequentum://agents/{agentId}/cost-breakdown`

MIME type: application/json

Cost breakdown by usage type for a specific agent (default: current month, daily). Useful for understanding what is driving costs (server time vs export vs proxy, etc.).

## Space Detail

URI: `sequentum://spaces/{spaceId}`

MIME type: application/json

Details of a specific space including name, description, organizationId, and created/updated dates.

## Space Agents

URI: `sequentum://spaces/{spaceId}/agents`

MIME type: application/json

List of agents belonging to a specific space. Shows id, name, status, configType, and lastActivity for each agent.

## Agent Runs

URI: `sequentum://agents/{agentId}/runs`

MIME type: application/json

Recent run history for a specific agent (up to 50 most recent). Shows run id, status, startTime, endTime, records extracted/exported, and errors.

## Run Status

URI: `sequentum://agents/{agentId}/runs/{runId}`

MIME type: application/json

Current status and details of a specific agent run. Shows id, status, startTime, endTime, records, errors, and runtime.

## Run Files

URI: `sequentum://agents/{agentId}/runs/{runId}/files`

MIME type: application/json

Output files produced by a completed agent run. Shows file id, name, fileType, fileSize, and created date.

## Run Diagnostics

URI: `sequentum://agents/{agentId}/runs/{runId}/diagnostics`

MIME type: application/json

Detailed diagnostics for a specific run including error messages, statistics, possible failure causes, and suggested remediation actions.

## Latest Failure

URI: `sequentum://agents/{agentId}/latest-failure`

MIME type: application/json

Diagnostics for the most recent failed run of an agent. Shows error message, possible causes, suggested actions, and run statistics.
