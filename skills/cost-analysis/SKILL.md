---
name: cost-analysis
description: Use when the user wants to understand or reduce Sequentum agent costs. Finds the most expensive agents, breaks their cost down by usage type, flags expensive runs and recommends savings.
---

# Cost analysis

Analyze costs across agents and identify the key drivers. Follow these steps:

1. Use get_credits_balance to record the current available credits.
2. Use get_agents_usage to find the most expensive agents for the current month (sorted by cost, highest first).
3. Pick the top 1-3 agents by cost and use get_agent_cost_breakdown for each to see which usage types drive the cost.
4. For the top-cost agent, use get_agent_runs_cost to identify the most expensive runs and their durations.
5. Summarize: top agents by cost, main cost drivers (usage types), any outlier expensive runs, and concrete cost-reduction recommendations.
