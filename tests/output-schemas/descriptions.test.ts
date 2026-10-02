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
