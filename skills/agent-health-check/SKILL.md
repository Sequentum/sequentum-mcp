---
name: agent-health-check
description: Use when the user wants a health overview of a Sequentum agent. Checks the agent's status, recent runs and success rate, schedules and recent version changes.
---

# Agent health check

Perform a comprehensive health check on the agent the user named. Follow these steps:

1. Use search_agents to find the agent by the name (or partial name) the user gave.
2. Use get_agent to retrieve its full configuration and details.
3. Use get_agent_runs to review recent execution history: note successes, failures and timing.
4. Use list_agent_schedules to check whether the agent has any active schedules.
5. Use get_agent_versions to review recent configuration changes.
6. Provide a health summary including: current status, success rate, any recent failures, schedule status and recent version changes.
