/**
 * Space tool handlers: list/inspect spaces, list agents in a space, search
 * spaces by name, and run all agents in a space.
 *
 * Moved verbatim out of the `tools/call` switch in handlers.ts as part of the
 * dispatch-map refactor (see agents.ts for the original TODO reference).
 */
import type { ToolHandler } from "./types.js";
import { jsonResult } from "./types.js";
import { validateJsonString, validateNumber, validateString } from "../../utils/validation.js";

const list_spaces: ToolHandler = async (_args, { apiClient }) => {
  const spaces = await apiClient.getAllSpaces();
  return jsonResult(spaces);
};

const get_space: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const spaceId = validateNumber(params, "spaceId", { min: 1, integer: true })!;
  const space = await apiClient.getSpace(spaceId);
  return jsonResult(space);
};

const get_space_agents: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const spaceId = validateNumber(params, "spaceId", { min: 1, integer: true })!;
  const agents = await apiClient.getSpaceAgents(spaceId);
  return jsonResult(agents);
};

/**
 * Returns the number of agents in a space as a single total, so callers never
 * have to count a list. See SE4-3921.
 */
const get_space_agent_count: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const spaceId = validateNumber(params, "spaceId", { min: 1, integer: true })!;
  const count = await apiClient.getSpaceAgentCount(spaceId);
  return jsonResult(count);
};

const search_space_by_name: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const name = validateString(params, "name")!;
  const space = await apiClient.searchSpaceByName(name);
  return jsonResult(space);
};

const run_space_agents: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const spaceId = validateNumber(params, "spaceId", { min: 1, integer: true })!;
  const inputParameters = validateJsonString(params, "inputParameters", false);
  const result = await apiClient.runSpaceAgents(spaceId, inputParameters);
  return {
    content: [
      {
        type: "text",
        text: `Started agents in space.\n\n${JSON.stringify(result, null, 2)}`,
      },
    ],
  };
};

export const spaceToolHandlers: Record<string, ToolHandler> = {
  list_spaces,
  get_space,
  get_space_agents,
  get_space_agent_count,
  search_space_by_name,
  run_space_agents,
};
