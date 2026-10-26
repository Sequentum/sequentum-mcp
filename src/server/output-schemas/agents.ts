import { anyValue, arrayOf, bool, date, int, nullable, obj, str, type JsonSchema } from "./helpers.js";
import { Agent, AgentRun, AgentSummary, Count, RUN_STATUS_CODES } from "./fragments.js";

const TRUNCATION_NOTE = str("Present only when truncated is true.");
const FILE_TYPE_CODES =
  "1 DeliveredFile, 2 ExtractedFiles, 3 InternalExportFiles, 4 InternalRuntimeFiles, " +
  "5 InternalTrackingDb, 6 LogText, 7 LogHtml, 8 InternalContentCache.";

export const agentOutputSchemas: Record<string, JsonSchema> = {
  list_agents: obj(
    {
      agents: arrayOf(AgentSummary),
      pagination: obj({ totalRecordCount: int(), pageIndex: int(), recordsPerPage: int() }),
    },
    { optional: ["pagination"] }
  ),
  get_agent: Agent,
  search_agents: obj(
    { agents: arrayOf(AgentSummary), returned: int(), limit: int(), truncated: bool(), note: TRUNCATION_NOTE },
    { optional: ["note"] }
  ),
  get_agent_search_count: Count,
  get_personal_agent_count: Count,
  get_agent_runs: obj(
    { runs: arrayOf(AgentRun), returned: int(), limit: int(), truncated: bool(), note: TRUNCATION_NOTE },
    { optional: ["note"] }
  ),
  get_agent_run_summary: obj({
    totalCount: int(),
    statusCounts: arrayOf(obj({ status: int(RUN_STATUS_CODES), statusName: str(), count: int() })),
  }),
  get_run_status: AgentRun,
  start_agent: obj(
    {
      run: AgentRun,
      data: anyValue("The data the agent extracted, as the API returned it."),
    },
    { optional: ["run", "data"], description: "Async mode returns run; sync mode returns data." }
  ),
  get_run_files: arrayOf(
    obj({
      id: int("The fileId."),
      name: nullable(str()),
      fileType: nullable(int(FILE_TYPE_CODES)),
      fileSize: str("Human-readable size, e.g. 12.34 KB."),
      created: date(),
    })
  ),
  get_file_download_url: obj({ downloadUrl: str("Temporary signed URL; it expires.") }),
  get_agent_versions: arrayOf(
    obj({ userName: nullable(str()), version: int(), created: date(), comments: nullable(str()), fileSize: int() })
  ),
};
