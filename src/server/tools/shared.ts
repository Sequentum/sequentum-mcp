/**
 * Shared helpers used by the tool handler modules and by handlers.ts.
 *
 * Lives in its own module (rather than being imported from handlers.ts) to avoid
 * a circular import: handlers.ts imports `toolDispatch` from tools/index.ts, and
 * the tool handler modules (agents.ts, schedules.ts, ...) need these helpers. If
 * those modules imported them from handlers.ts directly, that would create a
 * cycle — see the smoke.test.ts comment for the production incident this class
 * of bug already caused.
 */
import type { AgentApiModel, PaginatedAgentsResponse } from "../../api/types.js";
import {
  validateBoolean,
  validateJsonString,
  validateNumber,
  validateStartTimeInFuture,
  validateString,
} from "../../utils/validation.js";

/**
 * Single source of truth for the DEBUG env read. Lives here (rather than in
 * handlers.ts or builds.ts) so both can import the same value without either
 * duplicating the read or creating a circular import — see the module header
 * above for why tool handler modules can't import from handlers.ts.
 */
export const DEBUG = process.env.DEBUG === "1";

/**
 * Map RunStatus numeric value to human-readable string
 */
function getRunStatusLabel(status: number | undefined): string {
  const statusMap: Record<number, string> = {
    0: "Invalid",
    1: "Running",
    2: "Exporting",
    3: "Starting",
    4: "Queuing",
    5: "Stopping",
    6: "Failure",
    7: "Failed",
    8: "Stopped",
    9: "Completed",
    10: "Success",
    11: "Skipped",
    12: "Waiting",
  };
  if (status === undefined || status === null) {
    return "Never Run";
  }
  return statusMap[status] ?? `Unknown (${status})`;
}

/**
 * Transform agent list to summary format for display
 */
export function summarizeAgents(agents: AgentApiModel[]) {
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    status: getRunStatusLabel(a.status),
    configType: a.configType,
    version: a.version,
    lastActivity: a.lastActivity,
  }));
}

/**
 * Type guard for paginated agent responses from the API.
 */
export function isPaginatedResponse(r: unknown): r is PaginatedAgentsResponse {
  return r !== null && typeof r === 'object' && 'agents' in r && Array.isArray((r as PaginatedAgentsResponse).agents);
}

export interface ScheduleParams {
  scheduleType: number | undefined;
  startTime: string | undefined;
  cronExpression: string | undefined;
  runEveryCount: number | undefined;
  runEveryPeriod: number | undefined;
  timezone: string | undefined;
  inputParameters: string | undefined;
  isEnabled: boolean | undefined;
  parallelism: number | undefined;
  parallelMaxConcurrency: number | undefined;
  parallelExport: string | undefined;
  logLevel: string | undefined;
  logMode: string | undefined;
  isExclusive: boolean | undefined;
  isWaitOnFailure: boolean | undefined;
}

export function parseScheduleParams(
  params: Record<string, unknown>
): ScheduleParams {
  return {
    scheduleType: validateNumber(params, "scheduleType", { required: false, min: 1, max: 3, integer: true }),
    startTime: validateString(params, "startTime", false),
    cronExpression: validateString(params, "cronExpression", false),
    runEveryCount: validateNumber(params, "runEveryCount", { required: false, min: 1, integer: true }),
    runEveryPeriod: validateNumber(params, "runEveryPeriod", { required: false, min: 1, max: 5, integer: true }),
    timezone: validateString(params, "timezone", false),
    inputParameters: validateJsonString(params, "inputParameters", false),
    isEnabled: validateBoolean(params, "isEnabled", false),
    parallelism: validateNumber(params, "parallelism", { required: false, min: 1, max: 50, integer: true }),
    parallelMaxConcurrency: validateNumber(params, "parallelMaxConcurrency", { required: false, min: 1, integer: true }),
    parallelExport: validateString(params, "parallelExport", false),
    logLevel: validateString(params, "logLevel", false),
    logMode: validateString(params, "logMode", false),
    isExclusive: validateBoolean(params, "isExclusive", false),
    isWaitOnFailure: validateBoolean(params, "isWaitOnFailure", false),
  };
}

export function validateScheduleStartTime(
  effectiveScheduleType: number | undefined,
  startTime: string | undefined
): void {
  if (effectiveScheduleType === 1 && startTime) {
    validateStartTimeInFuture(startTime, 1);
  }

  if (effectiveScheduleType === 2 && startTime) {
    validateStartTimeInFuture(startTime, 0);
  }
}
