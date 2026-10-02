# Prompts

## debug-agent

Diagnose why an agent is failing. Searches for the agent, checks recent runs, retrieves failure diagnostics, and suggests fixes.

- `agentName` (required): The name (or partial name) of the agent to debug.

## agent-health-check

Get a comprehensive health overview for an agent. Checks its status, recent runs, schedules, and version history.

- `agentName` (required): The name (or partial name) of the agent to check.

## spending-report

Generate a spending and credits report. Shows current balance, this month's spending summary, and recent credit transactions.

Arguments: (none)

## cost-analysis

Analyze costs across agents. Identifies the most expensive agents, breaks down costs by usage type, and highlights expensive runs.

Arguments: (none)

## run-and-monitor

Start an agent and monitor it until completion. Finds the agent, reviews its input parameters, starts execution, polls for status, and lists output files when done.

- `agentName` (required): The name (or partial name) of the agent to run.

## space-overview

Get a comprehensive overview of all agents in a space including their statuses, recent activity, and any failures.

- `spaceName` (required): The name of the space to review.

## daily-operations-report

Generate a daily operations report covering all runs, failures, records extracted, spending, and upcoming schedules.

Arguments: (none)

## schedule-agent

Walk through creating or reviewing schedules for an agent. Checks existing schedules and guides through setting up a new one.

- `agentName` (required): The name (or partial name) of the agent to schedule.
- `scheduleDescription`: Optional natural language description of the desired schedule (e.g., 'every Monday at 9am', 'every 30 minutes', 'once on Feb 20').

## compare-runs

Compare the last successful and last failed runs of an agent to identify what changed and why it might be failing.

- `agentName` (required): The name (or partial name) of the agent to compare runs for.

## build-agent-from-prompt

Build a new web scraping agent from a natural language description using the AI agent builder. Calls start_agent_build, which waits internally for the build to complete and returns the agentId directly. The agent is saved to the workspace automatically once the AI completes the build.

- `prompt` (required): What you want to scrape or automate, in your own words. Keep it as close to your natural phrasing as possible — the agent builder infers technical details (pagination, lazy-load, output format, etc.) server-side. Must be between 10 and 5000 characters.
- `spaceName`: Optional name of the space to save the agent to. If omitted, the default space is used.

## inspect-agent-draft

Inspect the current state of an in-progress agent build session. Shows the draft agent details once the AI has finished building, so the user can decide whether to save or discard it.

- `sessionId` (required): The session ID returned by start_agent_build.
- `pollingPreference`: Optional hint for how aggressively to poll get_agent_build_status if the session is still in progress. Examples: 'fast' (every 2–3s), 'normal' (start ~5s, back off to ~15s), 'slow' (every 30s), or a free-form instruction like 'poll every 5 seconds'. If omitted, a moderate cadence with backoff is used.
