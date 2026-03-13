# Prompts Reference

The Sequentum MCP Server provides 9 prompts -- reusable instruction templates that guide the AI through common multi-step workflows. Prompts are explicitly invoked by the user or client and orchestrate the server's existing [tools](./tool-reference.md) to complete complex tasks in a single request.

> **How prompts work:** Each prompt generates a sequence of step-by-step instructions for the AI. When invoked, the AI follows these instructions, calling the appropriate tools in order and synthesizing the results into a final response.

## Quick Reference

| Prompt | Description | Arguments |
|--------|-------------|-----------|
| **Debugging & Diagnostics** | | |
| [`debug-agent`](#debug-agent) | Diagnose why an agent is failing | `agentName` (required) |
| [`compare-runs`](#compare-runs) | Compare last successful vs failed run | `agentName` (required) |
| **Health & Monitoring** | | |
| [`agent-health-check`](#agent-health-check) | Comprehensive health overview for an agent | `agentName` (required) |
| [`daily-operations-report`](#daily-operations-report) | Daily ops report across all agents | *(none)* |
| [`space-overview`](#space-overview) | Overview of all agents in a space | `spaceName` (required) |
| **Execution** | | |
| [`run-and-monitor`](#run-and-monitor) | Start an agent and monitor until completion | `agentName` (required) |
| [`schedule-agent`](#schedule-agent) | Walk through creating a schedule | `agentName` (required), `scheduleDescription` (optional) |
| **Billing & Costs** | | |
| [`spending-report`](#spending-report) | Spending and credits report | *(none)* |
| [`cost-analysis`](#cost-analysis) | Analyze costs across agents | *(none)* |

---

## Debugging & Diagnostics

### debug-agent

Diagnose why an agent is failing. Searches for the agent, checks recent runs, retrieves failure diagnostics, and suggests fixes.

#### Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentName` | string | Yes | The name (or partial name) of the agent to debug. |

#### Workflow

1. Uses `search_agents` to find the agent by name.
2. Uses `get_agent_runs` to check recent execution history.
3. Uses `get_latest_failure` to retrieve detailed failure diagnostics including error messages, possible causes, and suggested fixes.
4. If needed, uses `get_run_diagnostics` on specific failed runs for additional detail.
5. Summarizes the root cause and provides actionable recommendations.

#### Example Invocations

```
Debug the Amazon scraper -- it keeps failing
Why is agent "Product Data" not working?
Diagnose failures for the price monitor agent
```

> **See also:** [`compare-runs`](#compare-runs) to identify what changed between a successful and failed run.

---

### compare-runs

Compare the last successful and last failed runs of an agent to identify what changed and why it might be failing.

#### Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentName` | string | Yes | The name (or partial name) of the agent to compare runs for. |

#### Workflow

1. Uses `search_agents` to find the agent by name.
2. Uses `get_agent_runs` to retrieve recent run history.
3. Identifies the most recent successful run and the most recent failed run.
4. Uses `get_run_diagnostics` on the failed run for detailed failure information.
5. Compares the two runs side-by-side: status, runtime duration, records extracted, records exported, error count, page loads, and error messages.
6. Summarizes differences and suggests likely causes for the failure.

#### Example Invocations

```
Compare runs for the Amazon scraper
What changed between the last good and bad runs of agent "Product Data"?
Why did the price monitor start failing?
```

> **See also:** [`debug-agent`](#debug-agent) for a broader failure diagnosis that doesn't require a previous successful run.

---

## Health & Monitoring

### agent-health-check

Get a comprehensive health overview for an agent. Checks its status, recent runs, schedules, and version history.

#### Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentName` | string | Yes | The name (or partial name) of the agent to check. |

#### Workflow

1. Uses `search_agents` to find the agent by name.
2. Uses `get_agent` to retrieve its full configuration and details.
3. Uses `get_agent_runs` to review recent execution history -- noting successes, failures, and timing.
4. Uses `list_agent_schedules` to check if the agent has any active schedules.
5. Uses `get_agent_versions` to review recent configuration changes.
6. Provides a health summary including: current status, success rate, recent failures, schedule status, and recent version changes.

#### Example Invocations

```
Health check on the Amazon scraper
Is agent "Product Data" healthy?
Give me a status report for the price monitor
```

---

### daily-operations-report

Generate a comprehensive daily operations report covering all runs, failures, records extracted, spending, and upcoming schedules.

#### Arguments

None.

#### Workflow

1. Uses `get_runs_summary` to get all runs from the last 24 hours, including failed run details.
2. Uses `get_records_summary` to get total records extracted and exported today.
3. Uses `get_credits_balance` to check the current credit balance.
4. Uses `get_spending_summary` to get today's spending.
5. Uses `get_scheduled_runs` to see what agents are scheduled to run in the next 24 hours.
6. Compiles a report covering: run statistics (total, succeeded, failed), records processed, failures with diagnostics, credit balance and spending, and upcoming scheduled runs.

#### Example Invocations

```
Give me today's operations report
Daily report
What happened with my agents today?
```

---

### space-overview

Get a comprehensive overview of all agents in a space including their statuses, recent activity, and any failures.

#### Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `spaceName` | string | Yes | The name of the space to review. |

#### Workflow

1. Uses `search_space_by_name` to find the space.
2. Uses `get_space` to retrieve its details.
3. Uses `get_space_agents` to list all agents in the space.
4. Notes each agent's current status and last activity.
5. For agents with failed status, uses `get_latest_failure` to retrieve failure details.
6. Provides a summary including: total agents, agents by status (running, completed, failed, never run), recent failures with causes, and overall space health.

#### Example Invocations

```
Overview of the Production space
How are the agents in "Bot Blocking" doing?
Space summary for E-Commerce
```

---

## Execution

### run-and-monitor

Start an agent and monitor it until completion. Finds the agent, reviews its input parameters, starts execution, polls for status, and lists output files when done.

#### Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentName` | string | Yes | The name (or partial name) of the agent to run. |

#### Workflow

1. Uses `search_agents` to find the agent by name.
2. Uses `get_agent` to check what input parameters the agent accepts.
3. Uses `start_agent` to begin execution (async mode).
4. Uses `get_run_status` to poll the run status periodically until it completes or fails.
5. Once completed, uses `get_run_files` to list the output files produced.
6. If the run failed, uses `get_run_diagnostics` to understand what went wrong.
7. Reports the final outcome: status, records extracted, files produced, or error details.

#### Example Invocations

```
Run the Amazon scraper and let me know when it's done
Start "Product Data" and monitor it
Execute the price monitor and show me the results
```

---

### schedule-agent

Walk through creating or reviewing schedules for an agent. Checks existing schedules and guides through setting up a new one.

#### Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentName` | string | Yes | The name (or partial name) of the agent to schedule. |
| `scheduleDescription` | string | No | Natural language description of the desired schedule (e.g., `'every Monday at 9am'`, `'every 30 minutes'`, `'once on Feb 20'`). |

#### Workflow

1. Uses `search_agents` to find the agent by name.
2. Uses `get_agent` to retrieve its full details and input parameters.
3. Uses `list_agent_schedules` to check if the agent already has any schedules.
4. If schedules exist, summarizes them (name, type, timing, enabled status).
5. Determines the appropriate schedule type: CRON (3) for recurring cron-based, RunEvery (2) for interval-based, or RunOnce (1) for a single execution.
6. Uses `create_agent_schedule` to create the new schedule with the correct parameters.
7. If `scheduleDescription` was provided, translates it into the appropriate schedule type and parameters. Otherwise, asks the user what schedule they'd like.

#### Example Invocations

```
Schedule the Amazon scraper to run every Monday at 9am
Set up a daily schedule for "Product Data"
Create a schedule for the price monitor -- every 30 minutes
```

---

## Billing & Costs

### spending-report

Generate a spending and credits report. Shows current balance, this month's spending summary, top-cost agents, and recent credit transactions.

#### Arguments

None.

#### Workflow

1. Uses `get_credits_balance` to check the current available credits.
2. Uses `get_spending_summary` to get spending for the current month.
3. Uses `get_agents_usage` to identify which agents are costing the most this month.
4. Uses `get_credit_history` to retrieve recent credit transactions (additions and deductions).
5. Summarizes the findings: current balance, total spent this month, top-cost agents, and notable transactions.

#### Example Invocations

```
Show me a spending report
How are my credits looking?
Give me a billing summary
```

> **See also:** [`cost-analysis`](#cost-analysis) for a deeper breakdown of what's driving costs.

---

### cost-analysis

Analyze costs across agents. Identifies the most expensive agents, breaks down costs by usage type, and highlights expensive runs.

#### Arguments

None.

#### Workflow

1. Uses `get_credits_balance` to record the current available credits.
2. Uses `get_agents_usage` to find the most expensive agents for the current month (sorted by cost descending).
3. Picks the top 1-3 agents by cost and uses `get_agent_cost_breakdown` for each to see what usage types drive cost.
4. For the top-cost agent, uses `get_agent_runs_cost` to identify the most expensive runs and their durations.
5. Summarizes: top agents by cost, main cost drivers (usage types), any outlier expensive runs, and concrete cost-reduction recommendations.

#### Example Invocations

```
Analyze my costs
Which agents are costing the most and why?
Give me a cost breakdown
```
