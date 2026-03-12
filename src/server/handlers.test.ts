import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatToolError,
  isPaginatedResponse,
  parseScheduleParams,
  validateScheduleStartTime,
} from "./handlers.js";
import {
  ApiRequestError,
  AuthenticationError,
  RateLimitError,
} from "../api/types.js";

describe("isPaginatedResponse", () => {
  it("returns true for paginated agent responses", () => {
    expect(isPaginatedResponse({ agents: [] })).toBe(true);
    expect(isPaginatedResponse({ agents: [{ id: 1 }], totalRecordCount: 1 })).toBe(true);
  });

  it("returns false for non-paginated values", () => {
    expect(isPaginatedResponse([])).toBe(false);
    expect(isPaginatedResponse(null)).toBe(false);
    expect(isPaginatedResponse(undefined)).toBe(false);
    expect(isPaginatedResponse({})).toBe(false);
    expect(isPaginatedResponse({ agents: "nope" })).toBe(false);
  });
});

describe("formatToolError", () => {
  it("formats rate limit errors with retryAfter", () => {
    const result = formatToolError(new RateLimitError("Too many requests", "/agents", 30));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Rate Limited: The Sequentum API rate limit has been reached. Try again in 30 seconds."
    );
  });

  it("formats rate limit errors without retryAfter", () => {
    const result = formatToolError(new RateLimitError("Too many requests", "/agents"));
    expect(result.content[0].text).toBe(
      "Rate Limited: The Sequentum API rate limit has been reached. Please wait a moment before retrying."
    );
  });

  it("formats authentication errors", () => {
    const result = formatToolError(new AuthenticationError("Missing credentials"));
    expect(result.content[0].text).toBe("Authentication Error: Missing credentials");
  });

  it("formats unauthorized API errors", () => {
    const result = formatToolError(
      new ApiRequestError(401, "Unauthorized", "API said no", "/agents")
    );
    expect(result.content[0].text).toBe(
      "Authentication Failed: Your API key or OAuth token is invalid or has expired. Please check your credentials."
    );
  });

  it("formats forbidden API errors", () => {
    const result = formatToolError(
      new ApiRequestError(403, "Forbidden", "Not allowed", "/agents")
    );
    expect(result.content[0].text).toBe(
      "Access Denied: You don't have permission to perform this action. Check your API key permissions."
    );
  });

  it("formats not found API errors", () => {
    const result = formatToolError(
      new ApiRequestError(404, "Not Found", "Agent 42 not found", "/agents/42")
    );
    expect(result.content[0].text).toBe("Not Found: Agent 42 not found");
  });

  it("formats server API errors", () => {
    const result = formatToolError(
      new ApiRequestError(500, "Internal Server Error", "Boom", "/agents")
    );
    expect(result.content[0].text).toBe(
      "Server Error: The Sequentum API encountered an internal error (500). This is a server-side issue — please try again later."
    );
  });

  it("formats other API errors", () => {
    const result = formatToolError(
      new ApiRequestError(422, "Unprocessable Entity", "Bad request body", "/agents")
    );
    expect(result.content[0].text).toBe("API Error (422): Bad request body");
  });

  it("formats plain Error instances", () => {
    const result = formatToolError(new Error("Something broke"));
    expect(result.content[0].text).toBe("Error: Something broke");
  });

  it("formats unknown thrown values", () => {
    const result = formatToolError("boom");
    expect(result.content[0].text).toBe("Error: An unknown error occurred");
  });
});

describe("parseScheduleParams", () => {
  it("parses a full valid schedule payload", () => {
    const result = parseScheduleParams({
      scheduleType: 2,
      startTime: "2026-04-01T10:00:00Z",
      cronExpression: "0 0 * * *",
      runEveryCount: 5,
      runEveryPeriod: 2,
      timezone: "UTC",
      inputParameters: "{\"hello\":\"world\"}",
      isEnabled: true,
      parallelism: 4,
      parallelMaxConcurrency: 2,
      parallelExport: "csv",
      logLevel: "debug",
      logMode: "verbose",
      isExclusive: false,
      isWaitOnFailure: true,
    });

    expect(result).toEqual({
      scheduleType: 2,
      startTime: "2026-04-01T10:00:00Z",
      cronExpression: "0 0 * * *",
      runEveryCount: 5,
      runEveryPeriod: 2,
      timezone: "UTC",
      inputParameters: "{\"hello\":\"world\"}",
      isEnabled: true,
      parallelism: 4,
      parallelMaxConcurrency: 2,
      parallelExport: "csv",
      logLevel: "debug",
      logMode: "verbose",
      isExclusive: false,
      isWaitOnFailure: true,
    });
  });

  it("returns undefined for omitted optional params", () => {
    expect(parseScheduleParams({})).toEqual({
      scheduleType: undefined,
      startTime: undefined,
      cronExpression: undefined,
      runEveryCount: undefined,
      runEveryPeriod: undefined,
      timezone: undefined,
      inputParameters: undefined,
      isEnabled: undefined,
      parallelism: undefined,
      parallelMaxConcurrency: undefined,
      parallelExport: undefined,
      logLevel: undefined,
      logMode: undefined,
      isExclusive: undefined,
      isWaitOnFailure: undefined,
    });
  });

  it("throws for invalid field types or values", () => {
    expect(() => parseScheduleParams({ scheduleType: 4 })).toThrow(/must be <= 3/);
    expect(() => parseScheduleParams({ inputParameters: "{bad json}" })).toThrow(
      /must be a valid JSON string/
    );
    expect(() => parseScheduleParams({ parallelism: 0 })).toThrow(/must be >= 1/);
  });
});

describe("validateScheduleStartTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts valid future RunOnce start times", () => {
    expect(() =>
      validateScheduleStartTime(1, "2026-03-01T10:02:00Z")
    ).not.toThrow();
  });

  it("rejects past or too-soon RunOnce start times", () => {
    expect(() =>
      validateScheduleStartTime(1, "2026-03-01T10:00:30Z")
    ).toThrow(/at least 1 minute\(s\) in the future/);
  });

  it("accepts valid RunEvery start times", () => {
    expect(() =>
      validateScheduleStartTime(2, "2026-03-01T10:00:01Z")
    ).not.toThrow();
  });

  it("rejects past RunEvery start times", () => {
    expect(() =>
      validateScheduleStartTime(2, "2026-03-01T09:59:59Z")
    ).toThrow(/at least 0 minute\(s\) in the future/);
  });

  it("is a no-op when schedule type is undefined or startTime is omitted", () => {
    expect(() => validateScheduleStartTime(undefined, undefined)).not.toThrow();
    expect(() => validateScheduleStartTime(1, undefined)).not.toThrow();
    expect(() => validateScheduleStartTime(3, "2026-03-01T09:59:59Z")).not.toThrow();
  });
});
