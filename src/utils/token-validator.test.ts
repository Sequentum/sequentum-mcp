import { describe, it, expect } from "vitest";
import { parseJwt, CLOCK_SKEW_SECONDS, LEGACY_AUDIENCE } from "./token-validator.js";

function seg(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

describe("parseJwt", () => {
  it("parses a well-formed token into header, payload, signing input and signature", () => {
    const header = { alg: "RS256", kid: "abc" };
    const payload = { exp: 1234, aud: "https://mcp.example.test" };
    const sig = Buffer.from([1, 2, 3]).toString("base64url");
    const parsed = parseJwt(`${seg(header)}.${seg(payload)}.${sig}`);

    expect(parsed).not.toBeNull();
    expect(parsed!.header).toEqual(header);
    expect(parsed!.payload).toEqual(payload);
    expect(parsed!.signingInput).toBe(`${seg(header)}.${seg(payload)}`);
    expect(Array.from(parsed!.signature)).toEqual([1, 2, 3]);
  });

  it("tolerates an empty signature so alg:none reaches the alg check", () => {
    const parsed = parseJwt(`${seg({ alg: "none" })}.${seg({ exp: 1 })}.`);
    expect(parsed).not.toBeNull();
    expect(parsed!.header.alg).toBe("none");
    expect(parsed!.signature.length).toBe(0);
  });

  it("returns null for a value that is not a JWT", () => {
    expect(parseJwt("sk-abc123")).toBeNull();
  });

  it("returns null for the wrong number of segments", () => {
    expect(parseJwt(`${seg({ alg: "RS256" })}.${seg({})}`)).toBeNull();
    expect(parseJwt(`a.b.c.d`)).toBeNull();
  });

  it("returns null when a segment is not valid JSON", () => {
    expect(parseJwt(`${Buffer.from("not json").toString("base64url")}.${seg({})}.x`)).toBeNull();
  });

  it("returns null when header or payload is a JSON non-object", () => {
    expect(parseJwt(`${seg("string")}.${seg({})}.x`)).toBeNull();
    expect(parseJwt(`${seg({ alg: "RS256" })}.${seg([1, 2])}.x`)).toBeNull();
  });

  it("returns null for an empty header or payload segment", () => {
    expect(parseJwt(`.${seg({})}.x`)).toBeNull();
    expect(parseJwt(`${seg({})}..x`)).toBeNull();
  });

  it("exposes the constants the spec fixes", () => {
    expect(CLOCK_SKEW_SECONDS).toBe(60);
    expect(LEGACY_AUDIENCE).toBe("Sequentum Enterprise");
  });
});
