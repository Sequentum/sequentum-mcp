---
name: space-overview
description: Use when the user wants an overview of a Sequentum space (a folder of agents). Lists the space's agents with their status and recent activity, and explains any failures.
---

# Space overview

Provide a comprehensive overview of the space the user named. Follow these steps:

1. Use search_space_by_name to find the space by the name the user gave.
2. Use get_space to retrieve its details.
3. Use get_space_agent_count to get the total number of agents, and get_space_agents to list them.
4. For each agent, note its current status and last activity.
5. For any agents with a failed status, use get_latest_failure to retrieve the failure details.
6. Provide a summary including: total agents, agents by status (running, completed, failed, never run), recent failures with their causes, and overall space health.
