---
name: build-agent-from-prompt
description: Use when the user wants Sequentum to build a new web scraping or automation agent from a plain-language description. Runs the Agent Builder, waits for the build and shows the new agent.
---

# Build an agent from a prompt

Build a new agent with the Agent Builder from the description the user gave.

**GUARDRAIL:** PROMPT-HANDLING POLICY: (1) Pass the user's wording (and any clarification answers from earlier in the conversation) through verbatim. (2) Trivial normalizations (adding 'https://', fixing an obvious URL typo) are fine. (3) Do NOT invent details the user did not state — extra fields, output formats, price-handling rules, lazy-load instructions, pagination strategies, etc. The upstream Sequentum Agent Builder pipeline will infer these on its own from the page; do not pre-empt it. If a detail feels essential to include, that is a sufficiency gap — ask one clarifying question instead of inventing.

Follow these steps:

1. If the user named a space, first use search_space_by_name to find it and pass its spaceId to start_agent_build; otherwise omit spaceId and the default space is used.
2. Use start_agent_build with the user's description as the prompt. This will wait for the build to complete and return the agentId directly (up to ~5 minutes). If the build times out, the response will include a sessionId — use get_agent_build_status to check manually.
   - status="completed": the agent was saved successfully. Report agentId and agentName to the user. Done — stop polling.
   - status="ready": the agent exists but may not be fully saved yet. Report agentId and agentName. Stop polling — no further action required.
   - On completed or ready: if partial is true, give the user the summary. Name the plan lines whose provenance is "assumption" or "default", and put any report.questions to the user in one message with their suggested replies (the first reply is what the build already did). If the user picks another reply, call start_agent_build again with the original request plus that answer.
   - status="error": report the error field to the user. The session is over. If an agent was partially created, advise the user to delete it via the agents API.
   - status="cancelled": report that the build was aborted early.
3. If the build succeeded (completed or ready), use get_agent with the agentId to show the user their new agent's details.
4. Remind the user the agent is now accessible via list_agents and all other agent tools.
