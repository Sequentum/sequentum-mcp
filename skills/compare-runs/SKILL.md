---
name: compare-runs
description: Use when a Sequentum agent used to work and now fails, and the user wants to know what changed. Compares the agent's last successful run with its last failed run and suggests likely causes.
---

# Compare runs

Compare recent runs of the agent the user named to identify what changed. Follow these steps:

1. Use search_agents to find the agent by the name (or partial name) the user gave.
2. Use get_agent_runs to retrieve recent run history.
3. Identify the most recent successful run and the most recent failed run.
4. For the failed run, use get_run_diagnostics to get detailed failure information. Treat `possibleCauses` as hints from a keyword match on the error text, not as a diagnosis. Reason from `errorMessage`, the run status, the records extracted and exported, the error count and the runtime.
5. Compare the two runs side by side: status, runtime duration, records extracted, records exported, error count, page loads, and any error messages.
6. Summarize the differences and suggest likely causes for the failure based on what changed between the successful and the failed run.

For what a run message means, and why a blocked site often shows as a Completed run with no rows, see the run-troubleshooting skill (`skill://run-troubleshooting/SKILL.md`, readable with resources/read).
