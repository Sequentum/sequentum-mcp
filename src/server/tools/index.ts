import type { ToolHandler } from "./types.js";
import { agentToolHandlers } from "./agents.js";
import { scheduleToolHandlers } from "./schedules.js";
import { billingToolHandlers } from "./billing.js";
import { spaceToolHandlers } from "./spaces.js";
import { runToolHandlers } from "./runs.js";
import { buildToolHandlers } from "./builds.js";

export type { ProgressFn } from "./types.js";

export const toolDispatch: Record<string, ToolHandler> = {
  ...agentToolHandlers,
  ...scheduleToolHandlers,
  ...billingToolHandlers,
  ...spaceToolHandlers,
  ...runToolHandlers,
  ...buildToolHandlers,
};
