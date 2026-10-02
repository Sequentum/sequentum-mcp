/**
 * DTO fragments shared by several tools' output schemas. Built from the Control
 * Center's C# DTOs and checked against live QA payloads on 2026-10-02.
 *
 * *_QA_ONLY_KEYS: fields the QA Control Center sends but production's does not yet (swagger
 * comparison, 2026-10-02, prod CC 1.47.1). They stay optional until production catches up, and
 * may stay optional after: optional costs nothing, required on a missing field breaks the tool.
 */
import { arrayOf, bool, date, int, nullable, obj, str } from "./helpers.js";

export const RUN_STATUS_CODES =
  "Run status code: 0 Invalid, 1 Running, 2 Exporting, 3 Starting, 4 Queuing, 5 Stopping, " +
  "6 Failure, 7 Failed, 8 Stopped, 9 Completed, 10 Success, 11 Skipped, 12 Waiting, 13 UpdatingDataSet.";
export const CONFIG_TYPE_CODES = "1 Agent, 2 SharedFile, 3 Template, 4 Command.";
const VALIDATION_STATUS_CODES = "1 Unknown, 2 Invalid, 3 Valid.";
const APPROVAL_STATUS_CODES = "0 NotApproved, 1 PendingApproval, 2 Approved.";
const SCHEDULE_TYPE_CODES = "0 None, 1 RunOnce, 2 RunEvery, 3 CRON.";
const RUN_EVERY_PERIOD_CODES = "1 minute, 2 hour, 3 day, 4 week, 5 month.";

export const Count = obj({ totalCount: int() });

/** list_agents / search_agents items: the MCP-side summary, with status as a label. */
export const AgentSummary = obj({
  id: nullable(int()),
  name: nullable(str()),
  description: nullable(str()),
  status: str("Last run status label, e.g. Success, Failed, Never Run, or Unknown (<code>)."),
  configType: int(CONFIG_TYPE_CODES),
  version: int(),
  lastActivity: nullable(date()),
});

export const Agent = obj({
  agentTemplates: nullable(str()),
  configType: int(CONFIG_TYPE_CODES),
  description: nullable(str()),
  documentation: nullable(str()),
  icon: nullable(str()),
  image: nullable(str("Base64-encoded image.")),
  inputParameters: nullable(obj({}, { description: "Input parameter names mapped to their default values." })),
  id: nullable(int()),
  isActive: bool(),
  lastActivity: nullable(date()),
  name: nullable(str()),
  proxyPoolId: nullable(int()),
  spaceId: nullable(int("Null for the personal space.")),
  startUrl: nullable(str()),
  status: nullable(int(RUN_STATUS_CODES)),
  userId: nullable(int()),
  validationStatus: nullable(int(VALIDATION_STATUS_CODES)),
  version: int(),
  created: date(),
  updated: date(),
});

export const AgentRun = obj({
  tag: nullable(str()),
  id: int("The runId."),
  configId: int("The agentId."),
  configName: nullable(str()),
  spaceId: int(),
  organizationId: int(),
  organizationName: nullable(str()),
  sequence: int(),
  parallelism: nullable(int()),
  parallelMaxConcurrency: nullable(int()),
  parallelExport: nullable(str("Combined or Separated.")),
  parallelSet: nullable(int()),
  startTime: nullable(date()),
  endTime: nullable(date()),
  created: nullable(date()),
  status: int(RUN_STATUS_CODES),
  message: nullable(str("Error or status message.")),
  configVersion: nullable(int()),
  actionCount: int(),
  pageCount: int(),
  dynamicPageCount: int(),
  requestCount: int(),
  dataCount: int("Records extracted."),
  inputCount: nullable(int()),
  errorCount: int(),
  exportCount: nullable(int("Records exported.")),
  traffic: nullable(int()),
  runTimeSec: nullable(int()),
  serverName: nullable(str()),
  tableType: nullable(str("run for an active run, history for a finished one.")),
});

export const SCHEDULE_QA_ONLY_KEYS = ["startedBy", "serverId", "httpVersion", "saveContentCache", "configName"] as const;
export const AgentSchedule = obj(
  {
    tag: nullable(str()),
    id: int("The scheduleId."),
    configId: int("The agentId."),
    name: nullable(str()),
    schedule: nullable(str("CRON expression, for CRON schedules.")),
    localSchedule: nullable(str()),
    timezone: nullable(str()),
    nextRunTime: nullable(date()),
    startTime: nullable(date()),
    scheduleType: nullable(int(SCHEDULE_TYPE_CODES)),
    isEnabled: bool(),
    runEveryCount: nullable(int()),
    runEveryPeriod: nullable(int(RUN_EVERY_PERIOD_CODES)),
    inputParameters: nullable(str("JSON string of input parameters.")),
    parallelism: nullable(int()),
    parallelMaxConcurrency: nullable(int()),
    parallelExport: nullable(str("Combined or Separated.")),
    proxyPoolId: nullable(int()),
    serverGroupId: nullable(int()),
    logLevel: nullable(str()),
    logMode: nullable(str()),
    isExclusive: bool(),
    isWaitOnFailure: bool(),
    startedBy: nullable(str()),
    serverId: nullable(int()),
    httpVersion: nullable(str()),
    saveContentCache: bool(),
    configName: nullable(str()),
    created: nullable(date()),
  },
  { optional: SCHEDULE_QA_ONLY_KEYS }
);

export const UPCOMING_QA_ONLY_KEYS = [
  "schedule", "scheduleType", "runEveryCount", "runEveryPeriod", "spaceId", "spaceName",
  "approvalStatus", "lastRunId", "lastRunTime", "lastRunStatus", "lastRunMessage",
] as const;
export const UpcomingSchedule = obj(
  {
    scheduleId: int(),
    agentId: int(),
    agentName: nullable(str()),
    scheduleName: nullable(str()),
    schedule: nullable(str()),
    scheduleType: nullable(int(SCHEDULE_TYPE_CODES)),
    runEveryCount: nullable(int()),
    runEveryPeriod: nullable(int(RUN_EVERY_PERIOD_CODES)),
    nextRunTime: nullable(date()),
    timezone: nullable(str()),
    isEnabled: bool(),
    spaceId: int("0 for the personal space."),
    spaceName: nullable(str()),
    approvalStatus: nullable(int(APPROVAL_STATUS_CODES)),
    lastRunId: nullable(int()),
    lastRunTime: nullable(date()),
    lastRunStatus: nullable(int(RUN_STATUS_CODES)),
    lastRunMessage: nullable(str()),
  },
  { optional: UPCOMING_QA_ONLY_KEYS }
);

export const SPACE_QA_ONLY_KEYS = ["scope", "runRetentionHours", "initiatedBy", "access"] as const;
export const Space = obj(
  {
    id: int(),
    name: str(),
    organizationId: int(),
    created: nullable(date()),
    isDefaultAccess: bool(),
    scope: nullable(str("Private, Public or Global.")),
    runRetentionHours: nullable(int()),
    initiatedBy: nullable(str()),
    access: arrayOf(str()),
  },
  { optional: SPACE_QA_ONLY_KEYS }
);

export const SPACE_AGENT_QA_ONLY_KEYS = ["created", "updated", "version", "isArchived", "approvalStatus", "labels"] as const;
export const SpaceAgent = obj(
  {
    id: int(),
    name: str(),
    description: nullable(str()),
    configType: int(CONFIG_TYPE_CODES),
    status: nullable(int(RUN_STATUS_CODES)),
    validationStatus: nullable(int(VALIDATION_STATUS_CODES)),
    lastActivity: nullable(date()),
    created: nullable(date()),
    updated: nullable(date()),
    version: int(),
    isArchived: bool(),
    approvalStatus: nullable(int(APPROVAL_STATUS_CODES)),
    labels: arrayOf(obj({ id: int(), name: str() })),
  },
  { optional: SPACE_AGENT_QA_ONLY_KEYS }
);

export const RunStats = obj({
  dataCount: int("Records extracted."),
  inputCount: nullable(int()),
  errorCount: int(),
  pageCount: int(),
  exportCount: nullable(int("Records exported.")),
  traffic: nullable(int()),
});

export const RunDiagnostics = obj({
  runId: int(),
  agentId: int(),
  agentName: str(),
  status: int(RUN_STATUS_CODES),
  errorMessage: nullable(str()),
  startTime: nullable(date()),
  endTime: nullable(date()),
  runtimeSeconds: nullable(int()),
  stats: RunStats,
  possibleCauses: arrayOf(str()),
  suggestedActions: arrayOf(str()),
});
