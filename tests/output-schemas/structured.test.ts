import { describe, expect, it } from "vitest";
import { outputSchemas } from "../../src/server/output-schemas/index.js";
import { CASES } from "./cases.js";
import { connect, textOf } from "./harness.js";
import { loosen } from "./mutate.js";

const withSchema = CASES.filter((c) => c.tool in outputSchemas).map((c) => [c.id, c] as const);

describe("structuredContent matches the text and passes the SDK's validation", () => {
  it.each(withSchema)("%s", async (_id, c) => {
    const client = await connect(c.api);
    const result = await client.callTool({ name: c.tool, arguments: c.args });
    expect(result.isError, textOf(result)).toBeFalsy();
    const expected = "expectedStructured" in c ? c.expectedStructured : JSON.parse(textOf(result));
    // The in-memory client negotiates 2025-11-25, where the SDK wraps non-object structuredContent
    // (array-root tools) as { result }. The 2026 era sends the bare array.
    expect(result.structuredContent).toEqual(Array.isArray(expected) ? { result: expected } : expected);
    await client.close();
  });
});

describe("schemas tolerate additive Control Center changes", () => {
  it.each(withSchema)("%s", async (_id, c) => {
    const api = Object.fromEntries(Object.entries(c.api).map(([method, value]) => [method, loosen(value)]));
    const client = await connect(api);
    const result = await client.callTool({ name: c.tool, arguments: c.args });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
    await client.close();
  });
});

describe("list_agents without pagination info", () => {
  it("still returns an object root", async () => {
    const client = await connect({ getAllAgents: [{ id: 1, name: "A", description: null, status: 10, configType: 1, version: 1, lastActivity: null }] });
    const result = await client.callTool({ name: "list_agents", arguments: {} });
    expect(result.isError, textOf(result)).toBeFalsy();
    expect(result.structuredContent).toEqual({
      agents: [{ id: 1, name: "A", description: null, status: "Success", configType: 1, version: 1, lastActivity: null }],
    });
    await client.close();
  });
});
