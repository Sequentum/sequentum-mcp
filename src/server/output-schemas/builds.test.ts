import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import { buildOutputSchemas } from "./builds.js";

// Same validator class and options the SDK uses at runtime (non-strict Ajv2020).
const ajv = new Ajv2020({ strict: false, allErrors: true });

// Recorded from QA 1.53.0-snapshot.3, session ab_553abb2901ed4248a480aef155ab334b, while processing.
const qaProcessing = {
  status: "processing",
  agentId: 24737,
  agentName: "Books Title Price Book First Page - 2026-11-04",
  agentElapsedSeconds: 27.1786711,
  browserIoSeconds: 28.999,
  partial: false,
  plan: {
    version: 1,
    target: { url: "https://books.toscrape.com/", text: "books.toscrape.com", provenance: "user" },
    item: { text: "a book", provenance: "user" },
    fields: [
      { name: "title", required: true, source: "list", example: "A Light in the Attic", provenance: "user" },
      { name: "price", required: true, source: "list", example: "£51.77", provenance: "user" },
    ],
    scope: { count: null, text: "first page", provenance: "user" },
    exclusions: [],
    navigation: [],
    output: { text: "one table", provenance: "default" },
  },
  report: null,
};

const report = {
  lines: { "field:title": { status: "met", evidence: "20 of 20 rows" }, scope: { status: "met", evidence: null } },
  met: 2,
  partial: 0,
  unmet: 0,
  total: 2,
  questions: [{ text: "Do you want every page?", replies: ["First page only", "Every page"] }],
  reportedAt: "2026-11-04T20:00:00Z",
};

describe("start_agent_build output schema", () => {
  const validate = ajv.compile(buildOutputSchemas.start_agent_build);

  it.each([
    ["no wait", { sessionId: "s" }],
    ["completed", { status: "completed", agentId: 5, agentName: "A", sessionId: "s" }],
    ["completed with null agent", { status: "ready", agentId: null, agentName: null, sessionId: "s" }],
    ["timeout", { status: "timeout", sessionId: "s", message: "Build did not complete within 5 minutes." }],
    ["completed with plan and report", { ...qaProcessing, status: "completed", report, sessionId: "s" }],
    ["partial", { status: "completed", agentId: 5, agentName: "A", partial: true, summary: "No prices.", plan: null, report: null, sessionId: "s" }],
  ])("accepts the %s shape", (_name, value) => {
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
  });

  it("rejects a result without sessionId", () => {
    expect(validate({ status: "completed", agentId: 5, agentName: "A" })).toBe(false);
  });
});

describe("get_agent_build_status output schema", () => {
  const validate = ajv.compile(buildOutputSchemas.get_agent_build_status);

  it.each([
    ["QA processing with plan", qaProcessing],
    ["completed with report", { ...qaProcessing, status: "completed", report }],
    ["processing before the plan", { status: "processing", agentId: null, agentName: null, partial: false, plan: null, report: null }],
    ["error", { status: "error", error: "Build failed." }],
  ])("accepts the %s shape", (_name, value) => {
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
  });
});
