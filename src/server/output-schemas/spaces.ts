import { arrayOf, bool, int, nullable, obj, str, type JsonSchema } from "./helpers.js";
import { Count, Space, SpaceAgent } from "./fragments.js";

export const spaceOutputSchemas: Record<string, JsonSchema> = {
  list_spaces: arrayOf(Space),
  get_space: Space,
  search_space_by_name: Space,
  get_space_agents: arrayOf(SpaceAgent),
  get_space_agent_count: Count,
  run_space_agents: obj({
    spaceId: int(),
    spaceName: str(),
    totalAgents: int(),
    agentsStarted: int(),
    agentsFailed: int(),
    results: arrayOf(
      obj({
        agentId: int(),
        agentName: str(),
        success: bool(),
        runId: nullable(int("Null when the agent failed to start.")),
        errorMessage: nullable(str()),
      })
    ),
  }),
};
