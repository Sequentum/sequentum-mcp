import { arrayOf, date, int, nullable, obj, str, type JsonSchema } from "./helpers.js";
import { RUN_STATUS_CODES, RunDiagnostics } from "./fragments.js";

const FailedRun = obj({
  runId: int(),
  agentId: int(),
  agentName: str(),
  startTime: nullable(date()),
  endTime: nullable(date()),
  status: int(RUN_STATUS_CODES),
  errorMessage: nullable(str()),
  spaceId: nullable(int()),
  spaceName: nullable(str()),
});

export const runOutputSchemas: Record<string, JsonSchema> = {
  get_runs_summary: obj({
    startDate: date(),
    endDate: date(),
    totalRuns: int(),
    completedRuns: int(),
    failedRuns: int(),
    completedWithErrorsRuns: int(),
    runningRuns: int(),
    queuedRuns: int(),
    stoppedRuns: int(),
    failedRunDetails: nullable(arrayOf(FailedRun, "Null unless includeDetails is true and there are failures.")),
  }),
  get_records_summary: obj({
    startDate: date(),
    endDate: date(),
    totalRecordsExtracted: int(),
    totalRecordsExported: int(),
    totalErrors: int(),
    totalPageLoads: int(),
    runCount: int(),
    agentId: nullable(int("Null when no agentId was given.")),
  }),
  get_run_diagnostics: RunDiagnostics,
  get_latest_failure: RunDiagnostics,
};
