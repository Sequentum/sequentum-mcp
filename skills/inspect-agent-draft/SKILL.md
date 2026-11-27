---
name: inspect-agent-draft
description: Use when the user has a Sequentum Agent Builder session ID and wants to know how that build is going. Checks the build status, keeps polling while it runs, and shows the finished agent.
---

# Inspect an agent build session

Inspect the Agent Builder session whose sessionId the user gave. Follow these steps:

1. Use get_agent_build_status with that sessionId to get the current status.
   - status="processing": report that the AI is still building, then call get_agent_build_status again — at the cadence the user asked for if they gave one, otherwise a moderate cadence with backoff, never more than ~30s between calls.
   - status="completed": the agent was saved successfully. Report agentId and agentName to the user. Done — stop polling.
   - status="ready": the agent exists but may not be fully saved yet. Report agentId and agentName. Stop polling — no further action required.
   - On completed or ready: if partial is true, give the user the summary. Name the plan lines whose provenance is "assumption" or "default", and put any report.questions to the user in one message with their suggested replies (the first reply is what the build already did). If the user picks another reply, call start_agent_build again with the original request plus that answer.
   - status="error": report the error field to the user. The session is over. If an agent was partially created, advise the user to delete it via the agents API.
   - status="cancelled": report that the build was aborted early.
2. If status is "completed" or "ready" and agentId is populated, use get_agent with that agentId to fetch the full agent details (name, description, configType, input parameters).
3. Present the agent details to the user and remind them it is accessible via list_agents and all other agent tools.
