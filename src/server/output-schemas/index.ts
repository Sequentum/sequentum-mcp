/**
 * Output schemas for the tools, keyed by tool name. tools.ts attaches them through
 * outputSchemaFor(); handlers.ts registers them with the SDK, which validates every non-error
 * result against them. Field lists and the strictness rule are in the header comment of helpers.ts:
 * build schemas from the Control Center's C# DTOs and live payloads, not from src/api/types.ts.
 */
import type { JsonSchema } from "./helpers.js";
import { agentOutputSchemas } from "./agents.js";
import { billingOutputSchemas } from "./billing.js";
import { buildOutputSchemas } from "./builds.js";
import { runOutputSchemas } from "./runs.js";
import { spaceOutputSchemas } from "./spaces.js";
import { scheduleOutputSchemas } from "./schedules.js";

export const outputSchemas: Record<string, JsonSchema> = {
  ...agentOutputSchemas,
  ...billingOutputSchemas,
  ...buildOutputSchemas,
  ...runOutputSchemas,
  ...spaceOutputSchemas,
  ...scheduleOutputSchemas,
};

/** Tools that intentionally declare no output schema, with the reason. rules.test.ts enforces the split. */
export const OUTPUT_SCHEMA_EXEMPT: Record<string, string> = {
  stop_agent: "Acknowledgement only: the text confirms the stop; no data beyond the ids sent.",
  kill_agent: "Acknowledgement only: the text confirms the kill command; no data beyond the ids sent.",
  delete_run: "Acknowledgement only: the API answers 204 No Content.",
  restore_agent_version: "Acknowledgement only: the API answers with an empty body.",
  delete_agent_schedule: "Acknowledgement only: the API answers 204 No Content.",
  enable_agent_schedule: "Acknowledgement only: the API answers with an empty body.",
  disable_agent_schedule: "Acknowledgement only: the API answers with an empty body.",
};

export function outputSchemaFor(tool: string): JsonSchema {
  const schema = outputSchemas[tool];
  if (!schema) throw new Error(`No output schema defined for tool "${tool}"`);
  return schema;
}
