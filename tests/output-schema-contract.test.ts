import { describe, expect, it } from "vitest";
import { READ_TOOLS, WRITE_TOOLS, exitCode, judgeCall, listOf, rejectedCall, uncalledReadTools } from "../scripts/output-schema-contract.mjs";
import { outputSchemas } from "../src/server/output-schemas/index.js";

describe("judgeCall", () => {
  it("passes a success result that carries structured content", () => {
    expect(judgeCall("get_space", { content: [{ type: "text", text: "{}" }], structuredContent: {} }).verdict).toBe("PASS");
  });

  it("flags the SDK's output validation error as a schema failure", () => {
    const r = judgeCall("get_space", { isError: true, content: [{ type: "text", text: "Output validation error: Invalid structured content for tool get_space: data/id must be integer" }] });
    expect(r.verdict).toBe("SCHEMA FAIL");
    expect(r.detail).toContain("data/id must be integer");
  });

  it("keeps other errors apart from schema failures", () => {
    const r = judgeCall("get_agent_schedule", { isError: true, content: [{ type: "text", text: "Authentication Failed: ..." }] });
    expect(r.verdict).toBe("UPSTREAM ERROR");
  });

  it("treats a success result without structured content as a schema failure", () => {
    expect(judgeCall("get_space", { content: [{ type: "text", text: "{}" }] }).verdict).toBe("SCHEMA FAIL");
  });

  it("marks a call that could not be made as skipped", () => {
    expect(judgeCall("get_file_download_url", null, "no run with files found").verdict).toBe("SKIPPED");
  });
});

describe("rejectedCall", () => {
  it("records a rejected call as an upstream error instead of throwing", () => {
    expect(rejectedCall("get_space", new Error("socket hang up"))).toEqual({ tool: "get_space", verdict: "UPSTREAM ERROR", detail: "socket hang up" });
  });
});

describe("exitCode", () => {
  it("fails only on schema failures", () => {
    expect(exitCode([{ verdict: "PASS" }, { verdict: "UPSTREAM ERROR" }, { verdict: "SKIPPED" }])).toBe(0);
    expect(exitCode([{ verdict: "PASS" }, { verdict: "SCHEMA FAIL" }])).toBe(1);
  });
});

describe("uncalledReadTools", () => {
  it("names the read tools that got no row, so a tool main() never calls is reported", () => {
    const rows = READ_TOOLS.filter((t) => t !== "get_space").map((tool) => ({ tool, verdict: "PASS" }));
    expect(uncalledReadTools(rows)).toEqual(["get_space"]);
  });

  it("is empty once every read tool has a row", () => {
    expect(uncalledReadTools(READ_TOOLS.map((tool) => ({ tool, verdict: "SKIPPED" })))).toEqual([]);
  });
});

describe("listOf", () => {
  it("returns an array root as is", () => {
    expect(listOf([1])).toEqual([1]);
  });

  it("unwraps the 2025-11-25 era { result: [...] } wrapper", () => {
    expect(listOf({ result: [2] })).toEqual([2]);
  });

  it("returns undefined for an object without a result array", () => {
    expect(listOf({ agents: [] })).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(listOf(undefined)).toBeUndefined();
  });
});

describe("tool lists", () => {
  it("cover every schema'd tool exactly once", () => {
    const all = [...READ_TOOLS, ...WRITE_TOOLS].sort();
    expect(all).toEqual(Object.keys(outputSchemas).sort());
    expect(READ_TOOLS).toHaveLength(30);
    expect(WRITE_TOOLS).toHaveLength(6);
  });
});
