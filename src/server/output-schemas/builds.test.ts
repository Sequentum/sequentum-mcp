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
    ["still building at the hold limit", { status: "processing", sessionId: "s", stage: "Looking at the page", done: false, elapsedSeconds: 45, nextCheckSeconds: 45, watchUrl: "https://cc/agent-builder?sessionId=s" }],
    ["status read failed", { status: "processing", sessionId: "s", stage: "Checking", done: false, elapsedSeconds: 3, nextCheckSeconds: 45 }],
    ["cancelled by the client", { status: "processing", sessionId: "s", stage: "Starting", done: false, elapsedSeconds: 0, nextCheckSeconds: 45, message: "The tool call was cancelled, but the build keeps running." }],
    ["completed with plan and report", { ...qaProcessing, status: "completed", report, sessionId: "s" }],
    ["partial", { status: "completed", agentId: 5, agentName: "A", partial: true, summary: "No prices.", plan: null, report: null, sessionId: "s", stage: "Partially completed", done: true, elapsedSeconds: 122, agentUrl: "https://cc/space/0/config/5/details/runs" }],
  ])("accepts the %s shape", (_name, value) => {
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
  });

  it("rejects a result without sessionId", () => {
    expect(validate({ status: "completed", agentId: 5, agentName: "A" })).toBe(false);
  });
});

const card = { sessionId: "s", stage: "Looking at the page", done: false, nextCheckSeconds: 45 };

describe("get_agent_build_status output schema", () => {
  const validate = ajv.compile(buildOutputSchemas.get_agent_build_status);

  it.each([
    ["QA processing with plan", { ...qaProcessing, ...card, stage: "Building the Agent", elapsedSeconds: 56 }],
    ["completed with report", { ...qaProcessing, status: "completed", report, ...card, stage: "Task completed", done: true }],
    ["processing before the plan", { status: "processing", agentId: null, agentName: null, partial: false, plan: null, report: null, ...card }],
    ["error", { status: "error", error: "Build failed.", ...card, stage: "Failed", done: true }],
    ["status read failed", { sessionId: "s", stage: "Checking", done: false, nextCheckSeconds: 45 }],
  ])("accepts the %s shape", (_name, value) => {
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
  });

  it("rejects a result without sessionId, stage or done", () => {
    for (const key of ["sessionId", "stage", "done"]) {
      const value: Record<string, unknown> = { status: "processing", ...card };
      delete value[key];
      expect(validate(value), key).toBe(false);
    }
  });
});
