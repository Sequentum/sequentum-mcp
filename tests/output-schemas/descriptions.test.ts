import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { tools } from "../../src/server/tools.js";

const description = (name: string) => tools.find((t) => t.name === name)?.description ?? "";

// Descriptions must not contradict the output schemas in the same tools/list entry.
describe("descriptions match the output schemas", () => {
  it.each([
    ["get_agent_runs", ["recordsExtracted", "recordsExported", "errorMessage"]],
    ["get_run_status", ["CompletedWithErrors", "Status values:"]],
    ["start_agent", ["{runId, status}"]],
    ["get_space", ["id, name, description", "created/updated", "its description"]],
    ["list_spaces", ["description"]],
    ["search_space_by_name", ["description"]],
    ["list_agent_schedules", ["cronExpression"]],
    ["get_agent_schedule", ["cronExpression"]],
    ["list_agents", ["Array of agent summaries"]],
    ["get_credit_history", ["Array of transactions"]],
    ["get_agent_cost_breakdown", ["server time vs exports vs proxies", "corresponds to data points"]],
  ] as const)("%s", (name, stale) => {
    for (const phrase of stale) expect(description(name)).not.toContain(phrase);
  });

  it("tool-reference.md no longer documents fields the API does not return", () => {
    const doc = readFileSync(new URL("../../docs/tool-reference.md", import.meta.url), "utf8");
    for (const phrase of ["recordsExtracted", "`cronExpression`/`schedule`", "Array of agent summaries", "Array of transactions", "server time vs exports vs proxies", "- **Async mode**: `runId`, `status`", "space including its description"]) {
      expect(doc).not.toContain(phrase);
    }
    expect(doc).not.toMatch(/(Array of spaces|Matching space|Space details) with `id`, `name`, `description`/);
  });
});

const param = (tool: string, name: string) => {
  const props = (tools.find((t) => t.name === tool)?.inputSchema.properties ?? {}) as Record<string, { description?: string; enum?: unknown[] }>;
  return props[name] ?? {};
};

// SE4-4000: parameter prose must match what the API accepts, or the model picks a wrong argument on the first call.
describe("parameters match the API", () => {
  it("get_runs_summary.status lists only real statuses and states the families", () => {
    const text = param("get_runs_summary", "status").description ?? "";
    expect(text).not.toContain("CompletedWithErrors");
    expect(text).toContain("`Failed`/`Failure` are one filter");
    expect(text).toContain("`Completed`/`Success`");
  });

  it("get_runs_summary dates describe the API defaults", () => {
    const start = param("get_runs_summary", "startDate").description ?? "";
    const end = param("get_runs_summary", "endDate").description ?? "";
    expect(start).not.toContain("Defaults to today");
    expect(start).toContain("Defaults to 24 hours before now");
    expect(start).toContain("datetime");
    expect(end).not.toContain("Defaults to today");
    expect(end).toContain("to the end of that day");
  });

  it("list_agents.status accepts 13 and states the families", () => {
    const status = param("list_agents", "status");
    expect(status.enum).toContain(13);
    expect(status.description).toContain("13=UpdatingDataSet");
    expect(status.description).toContain("6=Failure and 7=Failed are one filter");
  });
});
