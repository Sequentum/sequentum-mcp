import { arrayOf, date, int, nullable, num, obj, str, type JsonSchema } from "./helpers.js";

export const billingOutputSchemas: Record<string, JsonSchema> = {
  get_credits_balance: obj({ availableCredits: num(), organizationId: int(), retrievedAt: date() }),
  get_spending_summary: obj({
    totalSpent: num(),
    startDate: date(),
    endDate: date(),
    organizationId: int(),
    currentBalance: num(),
  }),
  get_credit_history: obj({
    transactions: arrayOf(
      obj({
        id: int(),
        transactionType: str("e.g. Initial, Credit, Debit, Refund, Expiration, Adjustment, WriteOff."),
        amount: num(),
        balance: num(),
        created: date(),
        expiresAt: nullable(date()),
        message: nullable(str()),
      })
    ),
    totalCount: int(),
    pageIndex: int(),
    recordsPerPage: int(),
  }),
  get_agents_usage: obj({
    agents: arrayOf(obj({ agentId: int(), agentName: nullable(str()), cost: num(), spaceId: nullable(int()) })),
    totalRecordCount: int(),
    totalCost: num(),
    startDate: date(),
    endDate: date(),
  }),
  get_agent_cost_breakdown: obj({
    agentId: int(),
    agentName: str(),
    labels: arrayOf(str("YYYY-MM-DD")),
    usageTypes: arrayOf(
      obj({
        type: str("e.g. RunUsage, ExportDataBandwidth, ExportDataCpm, InputCount, ProxyUsage, AgentBuilder."),
        data: arrayOf(num(), "Cost per label; empty when the type had no usage."),
        totalCost: num(),
      })
    ),
    totalCost: num(),
    startDate: date(),
    endDate: date(),
  }),
  get_agent_runs_cost: obj({
    runs: arrayOf(
      obj({
        runId: int(),
        date: date(),
        startTime: nullable(date()),
        endTime: nullable(date()),
        cost: num(),
        billingType: nullable(str()),
      })
    ),
    totalRecordCount: int(),
    totalCost: num("Total for this page only."),
    agentId: int(),
    agentName: str(),
  }),
};
