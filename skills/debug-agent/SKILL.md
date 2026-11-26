---
name: debug-agent
description: Use when a Sequentum agent is failing or erroring and the user wants to know why. Finds the agent, checks recent runs, reads failure diagnostics and recommends fixes.
---

# Debug a failing agent

Diagnose why the agent the user named is failing. Follow these steps:

1. Use search_agents to find the agent by the name (or partial name) the user gave.
2. Use get_agent_runs to check its recent execution history.
3. Use get_latest_failure to retrieve the failure diagnostics: the error message, run timing and stats, possible causes and suggested actions. Treat `possibleCauses` as hints from a keyword match on the error text, not as a diagnosis. Reason from `errorMessage`, the run status, the records extracted and exported, the error count and the runtime.
4. If needed, use get_run_diagnostics on specific failed runs for additional detail.
5. Summarize the root cause and provide actionable recommendations to fix the issue.

For what a run message means, and why a blocked site often shows as a Completed run with no rows, see the run-troubleshooting skill (`skill://run-troubleshooting/SKILL.md`, readable with resources/read).
