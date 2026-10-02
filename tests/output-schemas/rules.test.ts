import { describe, expect, it } from "vitest";
import { Ajv } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { tools } from "../../src/server/tools.js";
import { OUTPUT_SCHEMA_EXEMPT, outputSchemas } from "../../src/server/output-schemas/index.js";
import { agentRun, space } from "./fixtures.js";
import { CASES } from "./cases.js";
import { connect, textOf } from "./harness.js";

describe("every tool either declares an output schema or is exempt", () => {
  it.each(tools.map((t) => [t.name, t] as const))("%s", (name, tool) => {
    const exempt = name in OUTPUT_SCHEMA_EXEMPT;
    expect(Boolean(tool.outputSchema), `declares a schema xor is exempt`).toBe(!exempt);
    if (!exempt) expect(tool.outputSchema).toBe(outputSchemas[name]);
  });

  it("names only real tools as exempt, and every schema belongs to a real tool", () => {
    const names = new Set(tools.map((t) => t.name));
    for (const name of Object.keys(OUTPUT_SCHEMA_EXEMPT)) expect(names).toContain(name);
    for (const name of Object.keys(outputSchemas)) expect(names).toContain(name);
    expect(Object.keys(outputSchemas)).toHaveLength(36);
  });

  it("has at least one case per schema'd tool", () => {
    const covered = new Set(CASES.map((c) => c.tool));
    for (const name of Object.keys(outputSchemas)) expect(covered, name).toContain(name);
  });
});

/** Visits every subschema reachable through properties and items. */
function* subschemas(schema: Record<string, unknown>, path = "$"): Generator<[string, Record<string, unknown>]> {
  yield [path, schema];
  for (const [key, child] of Object.entries((schema.properties ?? {}) as Record<string, Record<string, unknown>>)) {
    yield* subschemas(child, `${path}.${key}`);
  }
  if (schema.items) yield* subschemas(schema.items as Record<string, unknown>, `${path}[]`);
}

describe("schemas are permissive and portable", () => {
  const draft07 = new Ajv({ strict: true });
  const draft2020 = new Ajv2020({ strict: true });

  it.each(Object.entries(outputSchemas))("%s", (_name, schema) => {
    expect(() => draft07.compile(schema)).not.toThrow();
    expect(() => draft2020.compile(schema)).not.toThrow();
    for (const [path, s] of subschemas(schema)) {
      expect(s.additionalProperties, `${path} must not close the object`).toBeUndefined();
      expect(s, `${path} must not use format`).not.toHaveProperty("format");
      expect(s, `${path} must not use $ref`).not.toHaveProperty("$ref");
      expect(s, `${path} must not use enum`).not.toHaveProperty("enum");
    }
  });
});

describe("schemas still reject what is actually wrong", () => {
  it.each([
    ["get_run_status with a string status", "get_run_status", { agentId: 1, runId: 1 }, { getRunStatus: agentRun({ status: "Failed" }) }],
    ["get_credits_balance without availableCredits", "get_credits_balance", {}, { getCreditsBalance: { organizationId: 1, retrievedAt: "x" } }],
    ["list_spaces with a null id", "list_spaces", {}, { getAllSpaces: [space({ id: null })] }],
  ] as const)("%s", async (_name, tool, args, api) => {
    const client = await connect(api as Record<string, unknown>);
    const result = await client.callTool({ name: tool, arguments: args });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Output validation error");
    await client.close();
  });
});

describe("exempt tools return no structured content", () => {
  it.each([
    ["stop_agent", { agentId: 1, runId: 1 }, { stopAgent: undefined }],
    ["kill_agent", { agentId: 1, runId: 1 }, { killAgent: undefined }],
    ["delete_run", { agentId: 1, runId: 1 }, { deleteRun: undefined }],
    ["restore_agent_version", { agentId: 1, versionNumber: 2, comments: "rollback" }, { restoreAgentVersion: undefined }],
    ["delete_agent_schedule", { agentId: 1, scheduleId: 1 }, { deleteAgentSchedule: undefined }],
    ["enable_agent_schedule", { agentId: 1, scheduleId: 1 }, { enableAgentSchedule: undefined }],
    ["disable_agent_schedule", { agentId: 1, scheduleId: 1 }, { disableAgentSchedule: undefined }],
  ] as const)("%s", async (tool, args, api) => {
    const client = await connect(api as Record<string, unknown>);
    const result = await client.callTool({ name: tool, arguments: args });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(result.structuredContent).toBeUndefined();
    await client.close();
  });
});

describe("2025-era clients (the in-memory default)", () => {
  it("see array roots wrapped as { result } in both tools/list and tools/call", async () => {
    const spaces = [space()];
    const client = await connect({ getAllSpaces: spaces });
    const { tools: listed } = await client.listTools();
    const schema = listed.find((t) => t.name === "list_spaces")?.outputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["result"]);
    const result = await client.callTool({ name: "list_spaces", arguments: {} });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(result.structuredContent).toEqual({ result: spaces });
    await client.close();
  });
});

describe("get_agent_build_status optional timing fields", () => {
  it("succeeds with only a status while processing, keeping absent keys absent", async () => {
    const client = await connect({ getAgentBuildStatus: { status: "processing" } });
    const result = await client.callTool({ name: "get_agent_build_status", arguments: { sessionId: "sess-0001" } });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(result.structuredContent).toEqual({ status: "processing" });
    await client.close();
  });
});
