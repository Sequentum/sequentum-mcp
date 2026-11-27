---
name: schedule-agent
description: Use when the user wants to schedule a Sequentum agent or review its schedules. Checks the agent's existing schedules and sets up a new CRON, run-every or one-time schedule.
---

# Schedule an agent

Set up a schedule for the agent the user named. Follow these steps:

1. Use search_agents to find the agent by the name (or partial name) the user gave.
2. Use get_agent to retrieve its full details and input parameters.
3. Use list_agent_schedules to check whether the agent already has any schedules.
4. If schedules exist, summarize them (name, type, timing, enabled status). If the user only wanted to review schedules, stop here. If the user wants to change an existing schedule rather than add another, do not create a new one: update that schedule with update_agent_schedule, following the schedule-editing skill (`skill://schedule-editing/SKILL.md`, readable with resources/read), and stop here.
5. Determine the schedule type and its timing: CRON (3) for recurring cron-based runs, RunEvery (2) for interval-based runs, or RunOnce (1) for a single execution. If the user described the schedule they want, translate it; otherwise ask which schedule they want (CRON, run-every interval, or one-time).
6. Use create_agent_schedule to create the new schedule with the correct parameters.

For input parameters and secrets on the schedule, see the run-inputs skill (`skill://run-inputs/SKILL.md`, readable with resources/read).
