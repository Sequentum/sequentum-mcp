/** Integer code fields: a future Control Center may add codes, so 99 must still validate. */
const CODE_KEYS = new Set([
  "status", "configType", "validationStatus", "fileType", "scheduleType", "approvalStatus",
  "lastRunStatus", "runEveryPeriod",
]);
/** String fields with a known value set today that may grow tomorrow. */
const OPEN_STRING_KEYS = new Set([
  "transactionType", "type", "billingType", "statusName", "scope", "parallelExport", "logLevel",
  "logMode", "httpVersion", "tableType",
]);

/**
 * Simulates an additive Control Center change: every object gains an unknown property, every
 * integer code becomes 99, every open string becomes a value nobody has seen.
 */
export function loosen(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(loosen);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (CODE_KEYS.has(key) && typeof v === "number") out[key] = 99;
      else if (OPEN_STRING_KEYS.has(key) && typeof v === "string") out[key] = "SomethingNew";
      else out[key] = loosen(v);
    }
    out.unknownFieldAddedLater = "x";
    return out;
  }
  return value;
}
