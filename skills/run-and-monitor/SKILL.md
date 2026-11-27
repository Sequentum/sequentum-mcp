---
name: run-and-monitor
description: Use when the user wants to run a Sequentum agent and follow it to completion. Finds the agent, reviews its input parameters, starts it, polls its status and reports the output files or the failure.
---

# Run and monitor an agent

Start the agent the user named and monitor it until it finishes. Follow these steps:

1. Use search_agents to find the agent by the name (or partial name) the user gave.
2. Use get_agent to check which input parameters the agent accepts.
3. Use start_agent to begin execution (async mode).
4. Use get_run_status to poll the run status periodically until it completes or fails.
5. Once completed, use get_run_files to list the output files produced.
6. If the run failed, use get_run_diagnostics to understand what went wrong.
7. Report the final outcome: status, records extracted, files produced, or error details.
