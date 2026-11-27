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

## agent-health-check

URI: `skill://agent-health-check/SKILL.md`

MIME type: text/markdown

Use when the user wants a health overview of a Sequentum agent. Checks the agent's status, recent runs and success rate, schedules and recent version changes.

## build-agent-from-prompt

URI: `skill://build-agent-from-prompt/SKILL.md`

MIME type: text/markdown

Use when the user wants Sequentum to build a new web scraping or automation agent from a plain-language description. Runs the Agent Builder, waits for the build and shows the new agent.

## compare-runs

URI: `skill://compare-runs/SKILL.md`

MIME type: text/markdown

Use when a Sequentum agent used to work and now fails, and the user wants to know what changed. Compares the agent's last successful run with its last failed run and suggests likely causes.

## cost-analysis

URI: `skill://cost-analysis/SKILL.md`

MIME type: text/markdown

Use when the user wants to understand or reduce Sequentum agent costs. Finds the most expensive agents, breaks their cost down by usage type, flags expensive runs and recommends savings.

## credit-usage

URI: `skill://credit-usage/SKILL.md`

MIME type: text/markdown

Use when explaining Sequentum credit usage - what a cost-breakdown or usage category charges for, why a run cost credits, why a run was refused or stopped for credits, or how spending reports group costs.

## daily-operations-report

URI: `skill://daily-operations-report/SKILL.md`

MIME type: text/markdown

Use when the user wants a daily operations report for their Sequentum account. Covers the last 24 hours of runs and failures, records extracted, credit balance and spending, and the runs scheduled next.

## debug-agent

URI: `skill://debug-agent/SKILL.md`

MIME type: text/markdown

Use when a Sequentum agent is failing or erroring and the user wants to know why. Finds the agent, checks recent runs, reads failure diagnostics and recommends fixes.

## inspect-agent-draft

URI: `skill://inspect-agent-draft/SKILL.md`

MIME type: text/markdown

Use when the user has a Sequentum Agent Builder session ID and wants to know how that build is going. Checks the build status, keeps polling while it runs, and shows the finished agent.

## run-and-monitor

URI: `skill://run-and-monitor/SKILL.md`

MIME type: text/markdown

Use when the user wants to run a Sequentum agent and follow it to completion. Finds the agent, reviews its input parameters, starts it, polls its status and reports the output files or the failure.

## run-inputs

URI: `skill://run-inputs/SKILL.md`

MIME type: text/markdown

Use when starting a Sequentum agent run, running every agent in a space, or creating a schedule with input parameters, secrets, synchronous mode, parallelism, exclusive runs or wait-on-failure.

## run-outcomes

URI: `skill://run-outcomes/SKILL.md`

MIME type: text/markdown

Use when reading or reporting the status, counts or files of a Sequentum agent run - "did it work?", "why is there no data?", success-rate or failure reports, stopping, killing or deleting a run. Explains what each run status means, the run file types and the quirks of the runs summary.

## run-troubleshooting

URI: `skill://run-troubleshooting/SKILL.md`

MIME type: text/markdown

Use when explaining why a Sequentum agent run failed, stopped, would not start, or returned empty or partial data. Decodes run messages, explains how blocked sites show up, and says how far to trust the failure diagnostics.

## schedule-agent

URI: `skill://schedule-agent/SKILL.md`

MIME type: text/markdown

Use when the user wants to schedule a Sequentum agent or review its schedules. Checks the agent's existing schedules and sets up a new CRON, run-every or one-time schedule.

## schedule-editing

URI: `skill://schedule-editing/SKILL.md`

MIME type: text/markdown

Use when updating, auditing or explaining an existing Sequentum agent schedule - changing its timing or parameters, a schedule marked Skipped, a schedule that fires at an unexpected time, or one that was re-enabled or lost its settings after an edit.

## space-overview

URI: `skill://space-overview/SKILL.md`

MIME type: text/markdown

Use when the user wants an overview of a Sequentum space (a folder of agents). Lists the space's agents with their status and recent activity, and explains any failures.

## spending-report

URI: `skill://spending-report/SKILL.md`

MIME type: text/markdown

Use when the user wants a Sequentum spending or credits report. Shows the current credit balance, this month's spending, the agents costing the most and recent credit transactions.

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

## io.modelcontextprotocol/skills

URI: `skill://{+path}`

MIME type: (none)

(none)
