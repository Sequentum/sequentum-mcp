/**
 * Schedule tool handlers: list/create/update/delete agent schedules, toggle
 * enabled state, and inspect upcoming scheduled runs.
 *
 * Moved verbatim out of the `tools/call` switch in handlers.ts as part of the
 * dispatch-map refactor (see agents.ts for the original TODO reference).
 */
import type { ToolHandler } from "./types.js";
import { jsonResult } from "./types.js";
import { parseScheduleParams, validateScheduleStartTime } from "./shared.js";
import { validateNumber, validateString } from "../../utils/validation.js";

const list_agent_schedules: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const schedules = await apiClient.getAgentSchedules(agentId);
  return jsonResult(schedules);
};

const create_agent_schedule: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const name = validateString(params, "name")!;
  const {
    scheduleType,
    startTime,
    cronExpression,
    runEveryCount,
    runEveryPeriod,
    timezone,
    inputParameters,
    isEnabled,
    parallelism,
    parallelMaxConcurrency,
    parallelExport,
    logLevel,
    logMode,
    isExclusive,
    isWaitOnFailure,
  } = parseScheduleParams(params);

  // Validate schedule type specific parameters
  const effectiveScheduleType = scheduleType ?? 3; // Default to CRON

  // RunOnce (1): startTime is required and must be at least 1 minute in the future
  if (effectiveScheduleType === 1) {
    if (!startTime) {
      throw new Error("startTime is required when scheduleType is 1 (RunOnce)");
    }
  }

  // RunEvery (2): runEveryCount and runEveryPeriod are required, startTime is optional but must be in the future if provided
  if (effectiveScheduleType === 2) {
    if (runEveryCount === undefined || runEveryPeriod === undefined) {
      throw new Error("runEveryCount and runEveryPeriod are required when scheduleType is 2 (RunEvery)");
    }
  }

  // CRON (3): cronExpression is required, startTime is not used
  if (effectiveScheduleType === 3 && !cronExpression) {
    throw new Error("cronExpression is required when scheduleType is 3 (CRON)");
  }

  validateScheduleStartTime(effectiveScheduleType, startTime);

  const schedule = await apiClient.createAgentSchedule(agentId, {
    name,
    scheduleType: effectiveScheduleType,
    startTime,
    cronExpression,
    runEveryCount,
    runEveryPeriod,
    timezone,
    inputParameters,
    isEnabled: isEnabled ?? true,
    parallelism: parallelism ?? 1,
    parallelMaxConcurrency,
    parallelExport,
    logLevel,
    logMode,
    isExclusive,
    isWaitOnFailure,
  });
  return {
    content: [
      {
        type: "text",
        text: `Schedule created successfully.\n\n${JSON.stringify(schedule, null, 2)}`,
      },
    ],
  };
};

const delete_agent_schedule: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const scheduleId = validateNumber(params, "scheduleId", { min: 1, integer: true })!;
  await apiClient.deleteAgentSchedule(agentId, scheduleId);
  return {
    content: [
      {
        type: "text",
        text: `Successfully deleted schedule ${scheduleId} from agent ${agentId}`,
      },
    ],
  };
};

const get_agent_schedule: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const scheduleId = validateNumber(params, "scheduleId", { min: 1, integer: true })!;
  const schedule = await apiClient.getAgentSchedule(agentId, scheduleId);
  return jsonResult(schedule);
};

const update_agent_schedule: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const scheduleId = validateNumber(params, "scheduleId", { min: 1, integer: true })!;
  const name = validateString(params, "name")!;
  const {
    scheduleType,
    startTime,
    cronExpression,
    runEveryCount,
    runEveryPeriod,
    timezone,
    inputParameters,
    isEnabled,
    parallelism,
    parallelMaxConcurrency,
    parallelExport,
    logLevel,
    logMode,
    isExclusive,
    isWaitOnFailure,
  } = parseScheduleParams(params);

  const hasCronFields = cronExpression !== undefined;
  const hasRunEveryFields = runEveryCount !== undefined || runEveryPeriod !== undefined;

  if (hasCronFields && hasRunEveryFields && scheduleType === undefined) {
    throw new Error(
      "Conflicting schedule fields: both cronExpression and runEveryCount/runEveryPeriod were provided without an explicit scheduleType. " +
      "Specify scheduleType to clarify intent (2=RunEvery, 3=CRON)."
    );
  }

  // Infer scheduleType from provided fields when not explicitly set,
  // so the user doesn't have to redundantly specify it on every update.
  let effectiveScheduleType = scheduleType;
  if (effectiveScheduleType === undefined) {
    if (hasCronFields) effectiveScheduleType = 3;
    else if (hasRunEveryFields) effectiveScheduleType = 2;
  }

  validateScheduleStartTime(effectiveScheduleType, startTime);

  const updated = await apiClient.updateAgentSchedule(agentId, scheduleId, {
    name,
    scheduleType: effectiveScheduleType,
    startTime,
    cronExpression,
    runEveryCount,
    runEveryPeriod,
    timezone,
    inputParameters,
    isEnabled,
    parallelism,
    parallelMaxConcurrency,
    parallelExport,
    logLevel,
    logMode,
    isExclusive,
    isWaitOnFailure,
  });
  return {
    content: [
      {
        type: "text",
        text: `Schedule updated successfully.\n\n${JSON.stringify(updated, null, 2)}`,
      },
    ],
  };
};

const enable_agent_schedule: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const scheduleId = validateNumber(params, "scheduleId", { min: 1, integer: true })!;
  await apiClient.enableAgentSchedule(agentId, scheduleId);
  return {
    content: [
      {
        type: "text",
        text: `Successfully enabled schedule ${scheduleId} for agent ${agentId}. The schedule will now run according to its configuration.`,
      },
    ],
  };
};

const disable_agent_schedule: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const scheduleId = validateNumber(params, "scheduleId", { min: 1, integer: true })!;
  await apiClient.disableAgentSchedule(agentId, scheduleId);
  return {
    content: [
      {
        type: "text",
        text: `Successfully disabled schedule ${scheduleId} for agent ${agentId}. The schedule will not run until re-enabled.`,
      },
    ],
  };
};

const get_scheduled_runs: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const startDate = validateString(params, "startDate", false);
  const endDate = validateString(params, "endDate", false);
  const schedules = await apiClient.getUpcomingSchedules(startDate, endDate);
  return jsonResult(schedules);
};

export const scheduleToolHandlers: Record<string, ToolHandler> = {
  list_agent_schedules,
  create_agent_schedule,
  delete_agent_schedule,
  get_agent_schedule,
  update_agent_schedule,
  enable_agent_schedule,
  disable_agent_schedule,
  get_scheduled_runs,
};
