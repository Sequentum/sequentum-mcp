import { arrayOf, type JsonSchema } from "./helpers.js";
import { AgentSchedule, UpcomingSchedule } from "./fragments.js";

export const scheduleOutputSchemas: Record<string, JsonSchema> = {
  list_agent_schedules: arrayOf(AgentSchedule),
  get_agent_schedule: AgentSchedule,
  create_agent_schedule: AgentSchedule,
  update_agent_schedule: AgentSchedule,
  get_scheduled_runs: arrayOf(UpcomingSchedule),
};
