# Resources Reference

The Sequentum MCP Server exposes 18 resources -- read-only, URI-addressable data that AI clients can browse and pull into context without calling a tool. Resources provide a "discovery" layer for browsing your Sequentum account data alongside the server's [tools](./tool-reference.md).

> **How resources work:** Resources are accessed by URI. Static resources return data with default parameters (e.g., first page of agents, current month's spending). Resource templates accept parameters in the URI (e.g., `sequentum://agents/123`) to retrieve specific items. All resources return `application/json`.

## Quick Reference

| Resource | URI | Description |
|----------|-----|-------------|
| **Static Resources** | | |
| [Agent List](#agent-list) | `sequentum://agents` | First page of all agents (up to 50) |
| [Spaces](#spaces) | `sequentum://spaces` | All accessible spaces |
| [Credits Balance](#credits-balance) | `sequentum://billing/balance` | Current credits balance |
| [Monthly Spending](#monthly-spending) | `sequentum://billing/spending` | Spending summary for current month |
| [Agent Costs](#agent-costs-current-month) | `sequentum://billing/agents-usage` | Top agents by cost for current month |
| [Recent Runs Summary](#recent-runs-summary) | `sequentum://analytics/runs` | All agent runs in the last 24 hours |
| [Upcoming Schedules](#upcoming-schedules) | `sequentum://analytics/upcoming-schedules` | Scheduled runs for next 7 days |
| **Resource Templates** | | |
| [Agent Detail](#agent-detail) | `sequentum://agents/{agentId}` | Full agent details with configuration |
| [Agent Versions](#agent-versions) | `sequentum://agents/{agentId}/versions` | Version history of an agent |
| [Agent Schedules](#agent-schedules) | `sequentum://agents/{agentId}/schedules` | Scheduled tasks for an agent |
| [Agent Cost Breakdown](#agent-cost-breakdown) | `sequentum://agents/{agentId}/cost-breakdown` | Cost by usage type for an agent |
| [Agent Runs](#agent-runs) | `sequentum://agents/{agentId}/runs` | Recent run history for an agent |
| [Run Status](#run-status) | `sequentum://agents/{agentId}/runs/{runId}` | Status of a specific run |
| [Run Files](#run-files) | `sequentum://agents/{agentId}/runs/{runId}/files` | Output files from a run |
| [Run Diagnostics](#run-diagnostics) | `sequentum://agents/{agentId}/runs/{runId}/diagnostics` | Error details for a run |
| [Latest Failure](#latest-failure) | `sequentum://agents/{agentId}/latest-failure` | Most recent failed run diagnostics |
| [Space Detail](#space-detail) | `sequentum://spaces/{spaceId}` | Details of a specific space |
| [Space Agents](#space-agents) | `sequentum://spaces/{spaceId}/agents` | Agents belonging to a space |

---

## Static Resources

Static resources require no parameters and return data with sensible defaults.

### Agent List

| | |
|---|---|
| **URI** | `sequentum://agents` |
| **MIME Type** | `application/json` |

Overview of all web scraping agents (first page, up to 50 agents). Shows `id`, `name`, `status`, `configType`, `version`, and `lastActivity` for each agent.

> **See also:** [`list_agents`](./tool-reference.md#list_agents) tool for filtering, sorting, and pagination control.

---

### Spaces

| | |
|---|---|
| **URI** | `sequentum://spaces` |
| **MIME Type** | `application/json` |

List of all accessible spaces (folders for organizing agents). Shows `id`, `name`, and `description` for each space.

> **See also:** [`list_spaces`](./tool-reference.md#list_spaces) tool for the equivalent tool-based access.

---

### Credits Balance

| | |
|---|---|
| **URI** | `sequentum://billing/balance` |
| **MIME Type** | `application/json` |

Current available credits balance for the organization. Shows `availableCredits`, `organizationId`, and `retrievedAt` timestamp.

> **See also:** [`get_credits_balance`](./tool-reference.md#get_credits_balance) tool for the equivalent tool-based access.

---

### Monthly Spending

| | |
|---|---|
| **URI** | `sequentum://billing/spending` |
| **MIME Type** | `application/json` |

Spending summary for the current month. Shows `totalSpent`, `startDate`, `endDate`, `organizationId`, and `currentBalance`.

> **See also:** [`get_spending_summary`](./tool-reference.md#get_spending_summary) tool for custom date ranges.

---

### Agent Costs (Current Month)

| | |
|---|---|
| **URI** | `sequentum://billing/agents-usage` |
| **MIME Type** | `application/json` |

Agent cost totals for the current month (top agents by cost, first page). Shows agents with `agentId`, `agentName`, `cost`, plus totals for the period.

> **See also:** [`get_agents_usage`](./tool-reference.md#get_agents_usage) tool for filtering, sorting, and pagination control.

---

### Recent Runs Summary

| | |
|---|---|
| **URI** | `sequentum://analytics/runs` |
| **MIME Type** | `application/json` |

Summary of all agent runs in the last 24 hours. Shows `totalRuns`, `completedRuns`, `failedRuns`, `runningRuns`, `queuedRuns`, and `stoppedRuns`.

> **See also:** [`get_runs_summary`](./tool-reference.md#get_runs_summary) tool for custom date ranges and status filtering.

---

### Upcoming Schedules

| | |
|---|---|
| **URI** | `sequentum://analytics/upcoming-schedules` |
| **MIME Type** | `application/json` |

All scheduled runs for the next 7 days across all agents. Shows `scheduleId`, `agentId`, `agentName`, `scheduleName`, `nextRunTime`, and `isEnabled`.

> **See also:** [`get_scheduled_runs`](./tool-reference.md#get_scheduled_runs) tool for custom date ranges.

---

## Resource Templates

Resource templates accept parameters in the URI to retrieve specific items. Replace `{agentId}`, `{runId}`, or `{spaceId}` with actual numeric IDs.

### Agent Detail

| | |
|---|---|
| **URI Template** | `sequentum://agents/{agentId}` |
| **MIME Type** | `application/json` |

Detailed information about a specific agent including configuration, input parameters, and documentation.

**Example:** `sequentum://agents/123`

> **See also:** [`get_agent`](./tool-reference.md#get_agent) tool for the equivalent tool-based access.

---

### Agent Versions

| | |
|---|---|
| **URI Template** | `sequentum://agents/{agentId}/versions` |
| **MIME Type** | `application/json` |

Version history of an agent's configuration. Shows version number, who made the change, date, comments, and file size.

**Example:** `sequentum://agents/123/versions`

> **See also:** [`get_agent_versions`](./tool-reference.md#get_agent_versions) tool for the equivalent tool-based access.

---

### Agent Schedules

| | |
|---|---|
| **URI Template** | `sequentum://agents/{agentId}/schedules` |
| **MIME Type** | `application/json` |

Scheduled tasks configured for a specific agent. Shows schedule id, name, cron expression, next run time, and enabled status.

**Example:** `sequentum://agents/123/schedules`

> **See also:** [`list_agent_schedules`](./tool-reference.md#list_agent_schedules) tool for the equivalent tool-based access.

---

### Agent Cost Breakdown

| | |
|---|---|
| **URI Template** | `sequentum://agents/{agentId}/cost-breakdown` |
| **MIME Type** | `application/json` |

Cost breakdown by usage type for a specific agent (default: current month, daily granularity). Useful for understanding what is driving costs (server time vs export vs proxy, etc.).

**Example:** `sequentum://agents/123/cost-breakdown`

> **See also:** [`get_agent_cost_breakdown`](./tool-reference.md#get_agent_cost_breakdown) tool for custom date ranges and time units.

---

### Agent Runs

| | |
|---|---|
| **URI Template** | `sequentum://agents/{agentId}/runs` |
| **MIME Type** | `application/json` |

Recent run history for a specific agent (up to 50 most recent). Shows run id, status, startTime, endTime, records extracted/exported, and errors.

**Example:** `sequentum://agents/123/runs`

> **See also:** [`get_agent_runs`](./tool-reference.md#get_agent_runs) tool for controlling the number of results.

---

### Run Status

| | |
|---|---|
| **URI Template** | `sequentum://agents/{agentId}/runs/{runId}` |
| **MIME Type** | `application/json` |

Current status and details of a specific agent run. Shows id, status, startTime, endTime, records, errors, and runtime.

**Example:** `sequentum://agents/123/runs/456`

> **See also:** [`get_run_status`](./tool-reference.md#get_run_status) tool for the equivalent tool-based access.

---

### Run Files

| | |
|---|---|
| **URI Template** | `sequentum://agents/{agentId}/runs/{runId}/files` |
| **MIME Type** | `application/json` |

Output files produced by a completed agent run. Shows file id, name, fileType, fileSize, and created date.

**Example:** `sequentum://agents/123/runs/456/files`

> **See also:** [`get_run_files`](./tool-reference.md#get_run_files) tool for the equivalent tool-based access, [`get_file_download_url`](./tool-reference.md#get_file_download_url) to download a file.

---

### Run Diagnostics

| | |
|---|---|
| **URI Template** | `sequentum://agents/{agentId}/runs/{runId}/diagnostics` |
| **MIME Type** | `application/json` |

Detailed diagnostics for a specific run including error messages, statistics, possible failure causes, and suggested remediation actions.

**Example:** `sequentum://agents/123/runs/456/diagnostics`

> **See also:** [`get_run_diagnostics`](./tool-reference.md#get_run_diagnostics) tool for the equivalent tool-based access.

---

### Latest Failure

| | |
|---|---|
| **URI Template** | `sequentum://agents/{agentId}/latest-failure` |
| **MIME Type** | `application/json` |

Diagnostics for the most recent failed run of an agent. Shows error message, possible causes, suggested actions, and run statistics.

**Example:** `sequentum://agents/123/latest-failure`

> **See also:** [`get_latest_failure`](./tool-reference.md#get_latest_failure) tool for the equivalent tool-based access.

---

### Space Detail

| | |
|---|---|
| **URI Template** | `sequentum://spaces/{spaceId}` |
| **MIME Type** | `application/json` |

Details of a specific space including name, description, organizationId, and created/updated dates.

**Example:** `sequentum://spaces/42`

> **See also:** [`get_space`](./tool-reference.md#get_space) tool for the equivalent tool-based access.

---

### Space Agents

| | |
|---|---|
| **URI Template** | `sequentum://spaces/{spaceId}/agents` |
| **MIME Type** | `application/json` |

List of agents belonging to a specific space. Shows id, name, status, configType, and lastActivity for each agent.

**Example:** `sequentum://spaces/42/agents`

> **See also:** [`get_space_agents`](./tool-reference.md#get_space_agents) tool for the equivalent tool-based access.
