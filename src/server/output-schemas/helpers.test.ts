import { describe, expect, it } from "vitest";
import { anyValue, arrayOf, date, int, nullable, obj, str } from "./helpers.js";

describe("output schema helpers", () => {
  it("obj marks every key required unless listed as optional, and never closes the object", () => {
    const s = obj({ a: int(), b: str(), c: str() }, { optional: ["c"] });
    expect(s).toEqual({
      type: "object",
      properties: { a: { type: "integer" }, b: { type: "string" }, c: { type: "string" } },
      required: ["a", "b"],
    });
    expect(s).not.toHaveProperty("additionalProperties");
  });

  it("obj rejects an optional key that is not a property", () => {
    expect(() => obj({ a: int() }, { optional: ["b"] })).toThrow(/"b"/);
  });

  it("nullable turns a single type into a type pair with null and keeps the description", () => {
    expect(nullable(int("Run status code."))).toEqual({ type: ["integer", "null"], description: "Run status code." });
    expect(nullable(obj({}))).toEqual({ type: ["object", "null"], properties: {}, required: [] });
  });

  it("nullable refuses a schema without a single type", () => {
    expect(() => nullable(anyValue("anything"))).toThrow();
    expect(() => nullable(nullable(int()))).toThrow();
  });

  it("date is a plain string with no format", () => {
    expect(date()).toEqual({ type: "string" });
  });

  it("arrayOf wraps the item schema", () => {
    expect(arrayOf(int(), "ids")).toEqual({ type: "array", items: { type: "integer" }, description: "ids" });
  });

  it("anyValue accepts any JSON value: it has no type", () => {
    expect(anyValue("payload")).toEqual({ description: "payload" });
  });
});
