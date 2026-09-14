import { describe, expect, it } from "vitest";
import { parseListCacheTtlMs, parseRateLimitMax, parseRateLimitWindowMs } from "./constants.js";

describe("parseListCacheTtlMs", () => {
  it("defaults to 3600000 when unset", () => {
    expect(parseListCacheTtlMs(undefined)).toBe(3_600_000);
  });

  it("honours a valid non-negative integer override", () => {
    expect(parseListCacheTtlMs("60000")).toBe(60_000);
    expect(parseListCacheTtlMs("0")).toBe(0);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseListCacheTtlMs("  60000  ")).toBe(60_000);
  });

  // Number.parseInt would silently truncate these to 1 and 3 respectively —
  // both non-negative safe integers the SDK would accept without complaint.
  it("rejects exponential notation instead of truncating it", () => {
    expect(() => parseListCacheTtlMs("1e6")).toThrow(/LIST_CACHE_TTL_MS/);
    expect(() => parseListCacheTtlMs("1e6")).toThrow(RangeError);
  });

  it("rejects comma-grouped numbers instead of truncating them", () => {
    expect(() => parseListCacheTtlMs("3,600,000")).toThrow(/LIST_CACHE_TTL_MS/);
    expect(() => parseListCacheTtlMs("3,600,000")).toThrow(RangeError);
  });

  it("rejects fully non-numeric values", () => {
    expect(() => parseListCacheTtlMs("abc")).toThrow(RangeError);
  });

  it("rejects negative values", () => {
    expect(() => parseListCacheTtlMs("-1")).toThrow(RangeError);
  });

  it("rejects decimal values", () => {
    expect(() => parseListCacheTtlMs("60000.5")).toThrow(RangeError);
  });
});

describe("parseRateLimitWindowMs", () => {
  it("defaults to 60000 when unset", () => {
    expect(parseRateLimitWindowMs(undefined)).toBe(60_000);
  });

  it("honours a valid non-negative integer override", () => {
    expect(parseRateLimitWindowMs("30000")).toBe(30_000);
  });

  // Number.parseInt would silently truncate this to 1 — a non-negative safe
  // integer a weaker parser would accept without complaint, quietly turning
  // the rate-limit window into 1ms.
  it("rejects exponential notation instead of truncating it", () => {
    expect(() => parseRateLimitWindowMs("1e6")).toThrow(/MCP_RATE_LIMIT_WINDOW_MS/);
    expect(() => parseRateLimitWindowMs("1e6")).toThrow(RangeError);
  });

  it("rejects fully non-numeric values", () => {
    expect(() => parseRateLimitWindowMs("abc")).toThrow(RangeError);
  });
});

describe("parseRateLimitMax", () => {
  it("defaults to 100 when unset", () => {
    expect(parseRateLimitMax(undefined)).toBe(100);
  });

  it("honours a valid non-negative integer override", () => {
    expect(parseRateLimitMax("25")).toBe(25);
  });

  // Same silent-truncation hazard as MCP_RATE_LIMIT_WINDOW_MS: a weaker
  // parser would turn "1e6" into a ceiling of 1 request per window.
  it("rejects exponential notation instead of truncating it", () => {
    expect(() => parseRateLimitMax("1e6")).toThrow(/MCP_RATE_LIMIT_MAX/);
    expect(() => parseRateLimitMax("1e6")).toThrow(RangeError);
  });

  it("rejects fully non-numeric values", () => {
    expect(() => parseRateLimitMax("abc")).toThrow(RangeError);
  });
});
