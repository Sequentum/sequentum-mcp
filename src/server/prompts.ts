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
  {
    name: "space-overview",
    description:
      "Get a comprehensive overview of all agents in a space including their " +
      "statuses, recent activity, and any failures.",
    arguments: [
      {
        name: "spaceName",
        description: "The name of the space to review.",
        required: true,
      },
    ],
  },
  {
    name: "daily-operations-report",
    description:
      "Generate a daily operations report covering all runs, failures, " +
      "records extracted, spending, and upcoming schedules.",
    arguments: [],
  },
  {
    name: "schedule-agent",
    description:
      "Walk through creating or reviewing schedules for an agent. " +
      "Checks existing schedules and guides through setting up a new one.",
    arguments: [
      {
        name: "agentName",
        description: "The name (or partial name) of the agent to schedule.",
        required: true,
      },
      {
        name: "scheduleDescription",
        description:
          "Optional natural language description of the desired schedule " +
          "(e.g., 'every Monday at 9am', 'every 30 minutes', 'once on Feb 20').",
        required: false,
      },
    ],
  },
  {
    name: "compare-runs",
    description:
      "Compare the last successful and last failed runs of an agent " +
      "to identify what changed and why it might be failing.",
    arguments: [
      {
        name: "agentName",
        description: "The name (or partial name) of the agent to compare runs for.",
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

    case "space-overview": {
      const spaceName = args?.spaceName;
      if (!spaceName) {
        throw new Error("Missing required argument: spaceName");
      }
      return [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Provide a comprehensive overview of the space "${spaceName}". Follow these steps:\n\n` +
              `1. Use search_space_by_name to find the space "${spaceName}".\n` +
              `2. Use get_space to retrieve its details.\n` +
              `3. Use get_space_agents to list all agents in the space.\n` +
              `4. For each agent, note its current status and last activity.\n` +
              `5. For any agents with failed status, use get_latest_failure to retrieve failure details.\n` +
              `6. Provide a summary including: total agents, agents by status (running, completed, failed, never run), recent failures with causes, and overall space health.`,
          },
        },
      ];
    }

    case "daily-operations-report": {
      return [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Generate a comprehensive daily operations report. Follow these steps:\n\n" +
              "1. Use get_runs_summary to get all runs from the last 24 hours, including failed run details.\n" +
              "2. Use get_records_summary to get the total records extracted and exported today.\n" +
              "3. Use get_credits_balance to check the current credit balance.\n" +
              "4. Use get_spending_summary to get today's spending.\n" +
              "5. Use get_scheduled_runs to see what agents are scheduled to run in the next 24 hours.\n" +
              "6. Compile a report covering: run statistics (total, succeeded, failed), records processed, " +
              "any failures with brief diagnostics, current credit balance and spending, and upcoming scheduled runs.",
          },
        },
      ];
    }

    case "schedule-agent": {
      const agentName = args?.agentName;
      if (!agentName) {
        throw new Error("Missing required argument: agentName");
      }
      const scheduleDescription = args?.scheduleDescription;
      const scheduleHint = scheduleDescription
        ? `\n7. The user wants the schedule to be: "${scheduleDescription}". Translate this into the appropriate schedule type and parameters.`
        : "\n7. Ask the user what schedule they would like (e.g., CRON expression, run-every interval, or one-time run).";
      return [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Set up a schedule for the agent "${agentName}". Follow these steps:\n\n` +
              `1. Use search_agents to find the agent by name "${agentName}".\n` +
              `2. Use get_agent to retrieve its full details and input parameters.\n` +
              `3. Use list_agent_schedules to check if the agent already has any schedules.\n` +
              `4. If schedules exist, summarize them (name, type, timing, enabled status).\n` +
              `5. Determine the appropriate schedule type: CRON (3) for recurring cron-based, RunEvery (2) for interval-based, or RunOnce (1) for a single execution.\n` +
              `6. Use create_agent_schedule to create the new schedule with the correct parameters.` +
              scheduleHint,
          },
        },
      ];
    }

    case "compare-runs": {
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
              `Compare recent runs of the agent "${agentName}" to identify what changed. Follow these steps:\n\n` +
              `1. Use search_agents to find the agent by name "${agentName}".\n` +
              `2. Use get_agent_runs to retrieve recent run history.\n` +
              `3. Identify the most recent successful run and the most recent failed run.\n` +
              `4. For the failed run, use get_run_diagnostics to get detailed failure information.\n` +
              `5. Compare the two runs side-by-side: status, runtime duration, records extracted, records exported, error count, page loads, and any error messages.\n` +
              `6. Summarize the differences and suggest likely causes for the failure based on what changed between the successful and failed runs.`,
          },
        },
      ];
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}
