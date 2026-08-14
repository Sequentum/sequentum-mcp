/**
 * Analytics/diagnostics tool handlers: runs and records summaries, per-run
 * diagnostics, and the latest failure for an agent.
 *
 * Moved verbatim out of the `tools/call` switch in handlers.ts as part of the
 * dispatch-map refactor (see agents.ts for the original TODO reference).
 */
import type { ToolHandler } from "./types.js";
import { jsonResult } from "./types.js";
import { validateBoolean, validateNumber, validateString } from "../../utils/validation.js";

const get_runs_summary: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const startDate = validateString(params, "startDate", false);
  const endDate = validateString(params, "endDate", false);
  const status = validateString(params, "status", false);
  const includeDetails = validateBoolean(params, "includeDetails", false);
  const summary = await apiClient.getRunsSummary(startDate, endDate, status, includeDetails);
  return jsonResult(summary);
};

const get_records_summary: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const startDate = validateString(params, "startDate", false);
  const endDate = validateString(params, "endDate", false);
  const agentId = validateNumber(params, "agentId", { required: false, min: 1, integer: true });
  const summary = await apiClient.getRecordsSummary(startDate, endDate, agentId);
  return jsonResult(summary);
};

const get_run_diagnostics: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const runId = validateNumber(params, "runId", { min: 1, integer: true })!;
  const diagnostics = await apiClient.getRunDiagnostics(agentId, runId);
  return jsonResult(diagnostics);
};

const get_latest_failure: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;
  const diagnostics = await apiClient.getLatestFailure(agentId);
  return jsonResult(diagnostics);
};

export const runToolHandlers: Record<string, ToolHandler> = {
  get_runs_summary,
  get_records_summary,
  get_run_diagnostics,
  get_latest_failure,
};
