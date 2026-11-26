---
name: credit-usage
description: Use when explaining Sequentum credit usage - what a cost-breakdown or usage category charges for, why a run cost credits, why a run was refused or stopped for credits, or how spending reports group costs.
---

# Sequentum credit usage

What this covers: what each usage type charges for, when the credit check happens, and what
happens when credit runs out. Rates can be set per organization and per agent, so this
skill gives no prices; use the cost tools (get_agent_cost_breakdown, get_agents_usage,
get_agent_runs_cost, get_spending_summary, get_credit_history) for actual amounts.

## Usage types

The cost tools name the same type either by display name or by label: the `usageTypes`
filter is documented with display names (for example `Server Time,Export GB`), and
get_agent_cost_breakdown returns labels.

| Display name | Label | Charged for |
|---|---|---|
| Server Time | RunUsage | How long the run ran on the run server. |
| Export GB | ExportDataBandwidth | The size of the data the run exported and delivered. |
| Export CPM | ExportDataCpm | The number of rows the run exported, charged per thousand rows. |
| Agent Inputs | InputCount | The number of input values passed to the run. |
| Proxy Data | ProxyUsage | Proxy traffic, when the run used a proxy pool that has a price. |
| Agent Builder | AgentBuilder | AI model usage of Agent Builder sessions (building an agent from a prompt). |
| AI Assistant | AiAssistant | AI model usage of the AI Assistant in the agent editor. |

Reading costs:

- One run can have several charges: Server Time for its runtime plus export, input and proxy
  charges for what it did.
- **A stopped run is still charged for its export.** For a run without parallel sets, a
  user stop still exports and delivers the rows collected so far, so Export CPM and Export GB
  apply.
- Server Time is charged for any runtime, whatever the run returned, so a run with no rows
  still costs Server Time (and Proxy Data if it sent traffic through a priced proxy pool). A blocked site often looks like that: see the run-troubleshooting skill.

## When credits are checked

- **At run creation.** Every new run (manual, API, space run-all or scheduled) is checked. If
  the balance is too low the run does not start: "Your account has insufficient credits to
  execute the agent. Please add credits to your account." A scheduled run refused this way is
  recorded as Failed (7) with that message.
- **While runs are active.** When a billable organization's credit runs out, its active runs
  are stopped ("Run stopped: no credits available. …") and its Agent Builder sessions are
  ended.
- **Not when editing schedules.** Creating runs is gated; editing a schedule is never refused
  for credits, so a user without credit can still disable or change schedules.

Use get_credits_balance to check the balance before suggesting a re-run.
