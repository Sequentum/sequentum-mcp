import { describe, expect, it } from "vitest";
import { jsonResult, structuredResult, withStructured } from "./types.js";

describe("structuredResult", () => {
  it("writes exactly the text jsonResult writes", () => {
    const value = { a: 1, b: [true, null], c: "x" };
    expect(structuredResult(value).content).toEqual(jsonResult(value).content);
  });

  it("derives structuredContent from that text, so undefined keys never reach it", () => {
    const result = structuredResult({ status: "processing", error: undefined });
    expect(result.structuredContent).toEqual({ status: "processing" });
    expect(Object.keys(result.structuredContent as object)).toEqual(["status"]);
  });

  it("keeps array roots as arrays", () => {
    expect(structuredResult([1, 2]).structuredContent).toEqual([1, 2]);
  });
});

describe("withStructured", () => {
  it("leaves the text untouched and normalises the structured value through JSON", () => {
    const base = { content: [{ type: "text" as const, text: "Schedule created successfully.\n\n{}" }] };
    const result = withStructured(base, { id: 1, skip: undefined });
    expect(result.content).toBe(base.content);
    expect(result.structuredContent).toEqual({ id: 1 });
  });
});
