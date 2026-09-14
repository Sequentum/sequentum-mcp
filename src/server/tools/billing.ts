/**
 * Billing/credits tool handlers: credits balance, spending summary, credit
 * history, agent usage, and per-agent cost breakdowns.
 *
 * Moved verbatim out of the `tools/call` switch in handlers.ts as part of the
 * dispatch-map refactor (see agents.ts for the original TODO reference).
 */
import type { ToolHandler } from "./types.js";
import { jsonResult } from "./types.js";
import {
  getDefaultDateRange,
  validateDateRange,
  validateEnum,
  validateISODate,
  validateNumber,
  validateString,
} from "../../utils/validation.js";

const get_credits_balance: ToolHandler = async (_args, { apiClient }) => {
  const balance = await apiClient.getCreditsBalance();
  return jsonResult(balance);
};

const get_spending_summary: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const startDate = validateString(params, "startDate", false);
  const endDate = validateString(params, "endDate", false);
  const spending = await apiClient.getSpendingSummary(startDate, endDate);
  return jsonResult(spending);
};

const get_credit_history: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const pageIndex = validateNumber(params, "pageIndex", { required: false, min: 1, integer: true });
  const recordsPerPage = validateNumber(params, "recordsPerPage", { required: false, min: 1, max: 100, integer: true });
  const history = await apiClient.getCreditHistory(pageIndex, recordsPerPage);
  return jsonResult(history);
};

const get_agents_usage: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const defaults = getDefaultDateRange();
  const startDate = validateString(params, "startDate", false) ?? defaults.startDate;
  const endDate = validateString(params, "endDate", false) ?? defaults.endDate;
  validateISODate(startDate, "startDate");
  validateISODate(endDate, "endDate");
  validateDateRange(startDate, endDate);

  const pageIndex = validateNumber(params, "pageIndex", { required: false, min: 1, integer: true });
  const recordsPerPage = validateNumber(params, "recordsPerPage", { required: false, min: 1, max: 1000, integer: true });
  const sortColumn = validateString(params, "sortColumn", false);
  const sortOrder = validateNumber(params, "sortOrder", { required: false, min: 0, max: 1, integer: true });
  const name = validateString(params, "name", false);
  const usageTypes = validateString(params, "usageTypes", false);

  const result = await apiClient.getAgentsUsage(
    startDate,
    endDate,
    pageIndex,
    recordsPerPage,
    sortColumn,
    sortOrder,
    name,
    usageTypes
  );
  return jsonResult(result);
};

const get_agent_cost_breakdown: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;

  const defaults = getDefaultDateRange();
  const startDate = validateString(params, "startDate", false) ?? defaults.startDate;
  const endDate = validateString(params, "endDate", false) ?? defaults.endDate;
  validateISODate(startDate, "startDate");
  validateISODate(endDate, "endDate");
  validateDateRange(startDate, endDate);

  const timeUnit = validateEnum(params, "timeUnit", ["day", "month"] as const, false);
  const usageTypes = validateString(params, "usageTypes", false);

  const result = await apiClient.getAgentCostBreakdown(
    agentId,
    startDate,
    endDate,
    timeUnit,
    usageTypes
  );
  return jsonResult(result);
};

const get_agent_runs_cost: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  const agentId = validateNumber(params, "agentId", { min: 1, integer: true })!;

  const defaults = getDefaultDateRange();
  const startDate = validateString(params, "startDate", false) ?? defaults.startDate;
  const endDate = validateString(params, "endDate", false) ?? defaults.endDate;
  validateISODate(startDate, "startDate");
  validateISODate(endDate, "endDate");
  validateDateRange(startDate, endDate);

  const pageIndex = validateNumber(params, "pageIndex", { required: false, min: 1, integer: true });
  const recordsPerPage = validateNumber(params, "recordsPerPage", { required: false, min: 1, max: 1000, integer: true });
  const sortColumn = validateEnum(params, "sortColumn", ["date", "cost", "duration"] as const, false);
  const sortOrder = validateNumber(params, "sortOrder", { required: false, min: 0, max: 1, integer: true });
  const usageTypes = validateString(params, "usageTypes", false);

  const result = await apiClient.getAgentRunsCost(
    agentId,
    startDate,
    endDate,
    pageIndex,
    recordsPerPage,
    sortColumn,
    sortOrder,
    usageTypes
  );
  return jsonResult(result);
};

export const billingToolHandlers: Record<string, ToolHandler> = {
  get_credits_balance,
  get_spending_summary,
  get_credit_history,
  get_agents_usage,
  get_agent_cost_breakdown,
  get_agent_runs_cost,
};
