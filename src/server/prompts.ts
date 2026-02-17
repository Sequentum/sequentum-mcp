/**
 * MCP Prompt Definitions
 *
 * Reusable instruction templates that guide the AI through common
 * multi-step workflows. Prompts are explicitly invoked by the user
 * or client and reference the server's existing tools.
 */

import { Prompt, PromptMessage } from "@modelcontextprotocol/sdk/types.js";

// ==========================================
// Prompt Definitions
// ==========================================

export const prompts: Prompt[] = [
  {
    name: "debug-agent",
    description:
      "Diagnose why an agent is failing. Searches for the agent, checks recent runs, " +
      "retrieves failure diagnostics, and suggests fixes.",
    arguments: [
      {
        name: "agentName",
        description: "The name (or partial name) of the agent to debug.",
        required: true,
      },
    ],
  },
  {
    name: "agent-health-check",
    description:
      "Get a comprehensive health overview for an agent. Checks its status, " +
      "recent runs, schedules, and version history.",
    arguments: [
      {
        name: "agentName",
        description: "The name (or partial name) of the agent to check.",
        required: true,
      },
    ],
  },
  {
    name: "spending-report",
    description:
      "Generate a spending and credits report. Shows current balance, " +
      "this month's spending summary, and recent credit transactions.",
    arguments: [],
  },
  {
    name: "run-and-monitor",
    description:
      "Start an agent and monitor it until completion. Finds the agent, " +
      "reviews its input parameters, starts execution, polls for status, " +
      "and lists output files when done.",
    arguments: [
      {
        name: "agentName",
        description: "The name (or partial name) of the agent to run.",
        required: true,
      },
    ],
  },
];

// ==========================================
// Prompt Message Builder
// ==========================================

/**
 * Build the messages array for a given prompt invocation.
 *
 * @param name - The prompt name
 * @param args - The arguments provided by the caller
 * @returns Array of PromptMessage objects
 * @throws Error if the prompt name is unknown
 */
export function getPromptMessages(
  name: string,
  args: Record<string, string> | undefined
): PromptMessage[] {
  switch (name) {
    case "debug-agent": {
      const agentName = args?.agentName;
      if (!agentName) {
        throw new Error("Missing required argument: agentName");
      }
      return [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Diagnose why the agent "${agentName}" is failing. Follow these steps:\n\n` +
              `1. Use the search_agents tool to find the agent by name "${agentName}".\n` +
              `2. Use get_agent_runs to check its recent execution history.\n` +
              `3. Use get_latest_failure to retrieve detailed failure diagnostics including error messages, possible causes, and suggested fixes.\n` +
              `4. If needed, use get_run_diagnostics on specific failed runs for additional detail.\n` +
              `5. Summarize the root cause and provide actionable recommendations to fix the issue.`,
          },
        },
      ];
    }

    case "agent-health-check": {
      const agentName = args?.agentName;
      if (!agentName) {
        throw new Error("Missing required argument: agentName");
      }
      return [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Perform a comprehensive health check on the agent "${agentName}". Follow these steps:\n\n` +
              `1. Use search_agents to find the agent by name "${agentName}".\n` +
              `2. Use get_agent to retrieve its full configuration and details.\n` +
              `3. Use get_agent_runs to review recent execution history — note successes, failures, and timing.\n` +
              `4. Use list_agent_schedules to check if the agent has any active schedules.\n` +
              `5. Use get_agent_versions to review recent configuration changes.\n` +
              `6. Provide a health summary including: current status, success rate, any recent failures, schedule status, and recent version changes.`,
          },
        },
      ];
    }

    case "spending-report": {
      return [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Generate a comprehensive spending and credits report. Follow these steps:\n\n" +
              "1. Use get_credits_balance to check the current available credits.\n" +
              "2. Use get_spending_summary to get spending for the current month.\n" +
              "3. Use get_credit_history to retrieve recent credit transactions (additions and deductions).\n" +
              "4. Summarize the findings: current balance, total spent this month, and notable transactions.",
          },
        },
      ];
    }

    case "run-and-monitor": {
      const agentName = args?.agentName;
      if (!agentName) {
        throw new Error("Missing required argument: agentName");
      }
      return [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Start the agent "${agentName}" and monitor it until completion. Follow these steps:\n\n` +
              `1. Use search_agents to find the agent by name "${agentName}".\n` +
              `2. Use get_agent to check what input parameters the agent accepts.\n` +
              `3. Use start_agent to begin execution (async mode).\n` +
              `4. Use get_run_status to poll the run status periodically until it completes or fails.\n` +
              `5. Once completed, use get_run_files to list the output files produced.\n` +
              `6. If the run failed, use get_run_diagnostics to understand what went wrong.\n` +
              `7. Report the final outcome: status, records extracted, files produced, or error details.`,
          },
        },
      ];
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}
