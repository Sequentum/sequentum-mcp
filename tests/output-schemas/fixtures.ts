/**
 * Sanitised Control Center payloads for the output-schema tests.
 *
 * Shapes come from live QA responses captured on 2026-10-02 and from the C# DTOs; every value
 * is invented. This repository is public: never paste real names, hosts, ids or messages here.
 */
const T0 = "2026-09-30T14:03:11.123456Z";
const T1 = "2026-09-30T14:05:42.654321Z";
const T_NO_OFFSET = "2026-09-01T00:00:00"; // query-string dates come back without an offset

type Row = Record<string, unknown>;

export function withoutKeys(row: Row, keys: readonly string[]): Row {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));
}

export function agentApi(o: Row = {}): Row {
  return {
    agentTemplates: null, configType: 1, description: "Collects product prices",
    documentation: null, icon: null, image: null,
    inputParameters: { url: "https://shop.example.com" }, id: 101, isActive: false,
    lastActivity: T1, name: "Shop prices", proxyPoolId: null, spaceId: 945,
    startUrl: "https://shop.example.com", status: 10, userId: 8, validationStatus: 3,
    version: 4, created: T0, updated: T1, ...o,
  };
}

export function agentRun(o: Row = {}): Row {
  return {
    tag: "", id: 9001, configId: 101, configName: null, spaceId: 0, organizationId: 1,
    organizationName: null, sequence: 6, parallelism: 1, parallelMaxConcurrency: null,
    parallelExport: null, parallelSet: 0, startTime: T0, endTime: T1, created: T0, status: 7,
    message: "Navigation timed out", configVersion: null, actionCount: 0, pageCount: 3,
    dynamicPageCount: 0, requestCount: 12, dataCount: 3, inputCount: null, errorCount: 1,
    exportCount: null, traffic: null, runTimeSec: null, serverName: "runner-01",
    tableType: "history", ...o,
  };
}

export const SCHEDULE_QA_ONLY = ["startedBy", "serverId", "httpVersion", "saveContentCache", "configName"] as const;
export function schedule(o: Row = {}): Row {
  return {
    tag: "", id: 3001, configId: 101, name: "Nightly", schedule: "0 2 * * *",
    localSchedule: "0 2 * * *", timezone: "UTC", nextRunTime: T1, startTime: null,
    scheduleType: 3, isEnabled: true, runEveryCount: null, runEveryPeriod: null,
    inputParameters: null, parallelism: 1, parallelMaxConcurrency: null, parallelExport: null,
    proxyPoolId: null, serverGroupId: null, logLevel: "Info", logMode: "Text",
    isExclusive: false, isWaitOnFailure: false, startedBy: "builder", serverId: null,
    httpVersion: null, saveContentCache: false, configName: "Shop prices", created: T0, ...o,
  };
}

export const UPCOMING_QA_ONLY = [
  "schedule", "scheduleType", "runEveryCount", "runEveryPeriod", "spaceId", "spaceName",
  "approvalStatus", "lastRunId", "lastRunTime", "lastRunStatus", "lastRunMessage",
] as const;
export function upcoming(o: Row = {}): Row {
  return {
    scheduleId: 3001, agentId: 101, agentName: "Shop prices", scheduleName: "Nightly",
    schedule: "0 2 * * *", scheduleType: 3, runEveryCount: null, runEveryPeriod: null,
    nextRunTime: T1, timezone: null, isEnabled: true, spaceId: 0, spaceName: null,
    approvalStatus: null, lastRunId: -42, lastRunTime: T0, lastRunStatus: 10,
    lastRunMessage: null, ...o,
  };
}

export const SPACE_QA_ONLY = ["scope", "runRetentionHours", "initiatedBy", "access"] as const;
export function space(o: Row = {}): Row {
  return {
    id: 945, name: "Production", organizationId: 1, created: T0, isDefaultAccess: false,
    scope: "Private", runRetentionHours: null, initiatedBy: null, access: ["Admins"], ...o,
  };
}

export const SPACE_AGENT_QA_ONLY = ["created", "updated", "version", "isArchived", "approvalStatus", "labels"] as const;
export function spaceAgent(o: Row = {}): Row {
  return {
    id: 101, name: "Shop prices", description: null, configType: 1, status: 10,
    validationStatus: 3, lastActivity: T1, created: T0, updated: T1, version: 4,
    isArchived: false, approvalStatus: null, labels: [{ id: 7, name: "pricing" }], ...o,
  };
}

export function diagnostics(o: Row = {}): Row {
  return {
    runId: 9001, agentId: 101, agentName: "", status: 7, errorMessage: "Navigation timed out",
    startTime: T0, endTime: T1, runtimeSeconds: null,
    stats: { dataCount: 3, inputCount: null, errorCount: 1, pageCount: 3, exportCount: null, traffic: null },
    possibleCauses: ["Network connectivity issues"],
    suggestedActions: ["Check network connectivity", "Verify target URL is accessible"], ...o,
  };
}

export { T0, T1, T_NO_OFFSET };
