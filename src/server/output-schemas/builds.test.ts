import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import { buildOutputSchemas } from "./builds.js";

// Same validator class and options the SDK uses at runtime (non-strict Ajv2020).
const ajv = new Ajv2020({ strict: false, allErrors: true });

describe("start_agent_build output schema", () => {
  const validate = ajv.compile(buildOutputSchemas.start_agent_build);

  it.each([
    ["no wait", { sessionId: "s" }],
    ["completed", { status: "completed", agentId: 5, agentName: "A", sessionId: "s" }],
    ["completed with null agent", { status: "ready", agentId: null, agentName: null, sessionId: "s" }],
    ["timeout", { status: "timeout", sessionId: "s", message: "Build did not complete within 5 minutes." }],
  ])("accepts the %s shape", (_name, value) => {
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
  });

  it("rejects a result without sessionId", () => {
    expect(validate({ status: "completed", agentId: 5, agentName: "A" })).toBe(false);
  });
});
