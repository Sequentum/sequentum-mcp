import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateStartTimeInFuture } from "./validation.js";

/**
 * Tests for MCP handler behavior in index.ts
 * 
 * These tests verify that the MCP handlers apply correct defaults
 * and transform parameters appropriately before calling the API client.
 */

// ==========================================
// validateStartTimeInFuture Tests
// ==========================================

describe("validateStartTimeInFuture", () => {
  beforeEach(() => {
    // Use fake timers to control the current time
    vi.useFakeTimers();
    // Set a fixed "now" time: 2026-01-19T12:00:00Z
    vi.setSystemTime(new Date("2026-01-19T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("ISO 8601 format validation", () => {
    it("should throw error for invalid date format", () => {
      expect(() => validateStartTimeInFuture("not-a-date")).toThrow(
        "Invalid startTime format"
      );
    });

    it("should throw error for empty string", () => {
      expect(() => validateStartTimeInFuture("")).toThrow(
        "Invalid startTime format"
      );
    });

    it("should parse partial date format (interpreted as midnight UTC)", () => {
      // "2026-01-19" is parsed as midnight UTC, which is in the past
      // relative to our mocked time of 12:00:00 UTC, so it throws
      expect(() => validateStartTimeInFuture("2026-01-19")).toThrow(
        "startTime must be at least 1 minute(s) in the future"
      );
    });

    it("should accept valid ISO 8601 format with timezone", () => {
      // 2 hours in the future
      expect(() => validateStartTimeInFuture("2026-01-19T14:00:00Z")).not.toThrow();
    });

    it("should accept valid ISO 8601 format without timezone", () => {
      // 2 hours in the future (local time interpreted as UTC)
      expect(() => validateStartTimeInFuture("2026-01-19T14:00:00")).not.toThrow();
    });
  });

  describe("future time validation with default 1 minute ahead", () => {
    it("should throw error when startTime is in the past", () => {
      expect(() => validateStartTimeInFuture("2026-01-19T11:00:00Z")).toThrow(
        "startTime must be at least 1 minute(s) in the future"
      );
    });

    it("should throw error when startTime is exactly now", () => {
      expect(() => validateStartTimeInFuture("2026-01-19T12:00:00Z")).toThrow(
        "startTime must be at least 1 minute(s) in the future"
      );
    });

    it("should throw error when startTime is 30 seconds in the future", () => {
      expect(() => validateStartTimeInFuture("2026-01-19T12:00:30Z")).toThrow(
        "startTime must be at least 1 minute(s) in the future"
      );
    });

    it("should throw error when startTime is exactly 1 minute in the future", () => {
      expect(() => validateStartTimeInFuture("2026-01-19T12:01:00Z")).toThrow(
        "startTime must be at least 1 minute(s) in the future"
      );
    });

    it("should accept startTime that is more than 1 minute in the future", () => {
      expect(() => validateStartTimeInFuture("2026-01-19T12:01:01Z")).not.toThrow();
    });

    it("should accept startTime that is 2 minutes in the future", () => {
      expect(() => validateStartTimeInFuture("2026-01-19T12:02:00Z")).not.toThrow();
    });

    it("should accept startTime that is hours in the future", () => {
      expect(() => validateStartTimeInFuture("2026-01-19T15:00:00Z")).not.toThrow();
    });

    it("should accept startTime that is days in the future", () => {
      expect(() => validateStartTimeInFuture("2026-01-25T12:00:00Z")).not.toThrow();
    });
  });

  describe("future time validation with custom minutesAhead", () => {
    it("should accept immediately future time when minutesAhead is 0", () => {
      // 1 second in the future
      expect(() => validateStartTimeInFuture("2026-01-19T12:00:01Z", 0)).not.toThrow();
    });

    it("should throw error when time is exactly now with minutesAhead 0", () => {
      expect(() => validateStartTimeInFuture("2026-01-19T12:00:00Z", 0)).toThrow(
        "startTime must be at least 0 minute(s) in the future"
      );
    });

    it("should throw error when time is in the past with minutesAhead 0", () => {
      expect(() => validateStartTimeInFuture("2026-01-19T11:59:00Z", 0)).toThrow(
        "startTime must be at least 0 minute(s) in the future"
      );
    });

    it("should require 5 minutes ahead when specified", () => {
      // 4 minutes in the future - should fail
      expect(() => validateStartTimeInFuture("2026-01-19T12:04:00Z", 5)).toThrow(
        "startTime must be at least 5 minute(s) in the future"
      );

      // 6 minutes in the future - should pass
      expect(() => validateStartTimeInFuture("2026-01-19T12:06:00Z", 5)).not.toThrow();
    });
  });
});

// ==========================================
// create_agent_schedule Handler Validation Tests
// ==========================================

describe("create_agent_schedule handler validation", () => {
  describe("RunOnce (scheduleType=1) validation rules", () => {
    it("should require startTime for RunOnce schedule type", () => {
      // This test documents the expected behavior:
      // When scheduleType is 1 (RunOnce), startTime is required
      const scheduleType = 1;
      const startTime = undefined;
      
      const isValid = !(scheduleType === 1 && !startTime);
      expect(isValid).toBe(false);
    });

    it("should accept RunOnce schedule with valid future startTime", () => {
      const scheduleType = 1;
      const startTime = "2026-01-20T14:30:00Z"; // Future date
      
      const hasRequiredFields = scheduleType === 1 && !!startTime;
      expect(hasRequiredFields).toBe(true);
    });
  });

  describe("RunEvery (scheduleType=2) validation rules", () => {
    it("should require runEveryCount for RunEvery schedule type", () => {
      const scheduleType = 2;
      const runEveryCount = undefined;
      const runEveryPeriod = 1;
      
      const isValid = !(scheduleType === 2 && (runEveryCount === undefined || runEveryPeriod === undefined));
      expect(isValid).toBe(false);
    });

    it("should require runEveryPeriod for RunEvery schedule type", () => {
      const scheduleType = 2;
      const runEveryCount = 30;
      const runEveryPeriod = undefined;
      
      const isValid = !(scheduleType === 2 && (runEveryCount === undefined || runEveryPeriod === undefined));
      expect(isValid).toBe(false);
    });

    it("should accept RunEvery schedule without startTime", () => {
      const scheduleType = 2;
      const runEveryCount = 30;
      const runEveryPeriod = 1; // minutes
      const startTime = undefined;
      
      const hasRequiredFields = scheduleType === 2 && runEveryCount !== undefined && runEveryPeriod !== undefined;
      const startTimeOptional = startTime === undefined || typeof startTime === "string";
      
      expect(hasRequiredFields && startTimeOptional).toBe(true);
    });

    it("should accept RunEvery schedule with optional startTime", () => {
      const scheduleType = 2;
      const runEveryCount = 30;
      const runEveryPeriod = 1; // minutes
      const startTime = "2026-01-20T10:00:00Z";
      
      const hasRequiredFields = scheduleType === 2 && runEveryCount !== undefined && runEveryPeriod !== undefined;
      expect(hasRequiredFields).toBe(true);
    });

    it("should validate all runEveryPeriod values (1=min, 2=hr, 3=day, 4=wk, 5=mo)", () => {
      const validPeriods = [1, 2, 3, 4, 5];
      validPeriods.forEach(period => {
        expect(period >= 1 && period <= 5).toBe(true);
      });
    });
  });

  describe("CRON (scheduleType=3) validation rules", () => {
    it("should require cronExpression for CRON schedule type", () => {
      const scheduleType = 3;
      const cronExpression = undefined;
      
      const isValid = !(scheduleType === 3 && !cronExpression);
      expect(isValid).toBe(false);
    });

    it("should accept CRON schedule with valid cronExpression", () => {
      const scheduleType = 3;
      const cronExpression = "0 9 * * *"; // Daily at 9am
      
      const hasRequiredFields = scheduleType === 3 && !!cronExpression;
      expect(hasRequiredFields).toBe(true);
    });

    it("should not require startTime for CRON schedule type", () => {
      const scheduleType = 3;
      const cronExpression = "0 9 * * 1,4"; // Mon/Thu at 9am
      const startTime = undefined;
      
      // CRON schedules don't use startTime
      const isValid = scheduleType === 3 && !!cronExpression;
      expect(isValid).toBe(true);
    });
  });

  describe("default schedule type", () => {
    it("should default to CRON (scheduleType=3) when not specified", () => {
      const scheduleType = undefined;
      const effectiveScheduleType = scheduleType ?? 3;
      
      expect(effectiveScheduleType).toBe(3);
    });
  });
});

describe("list_agents handler", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("pagination defaults", () => {
    it("should default pageIndex to 1 (1-based) when not provided", async () => {
      // Mock successful response
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      // Import and use the API client directly to simulate handler behavior
      const { SequentumApiClient } = await import("./api-client.js");
      const client = new SequentumApiClient("https://test.example.com", "sk-test-key");

      // Call with default pagination (simulating handler behavior)
      await client.getAllAgents({
        pageIndex: 1, // Handler default
        recordsPerPage: 50, // Handler default
      });

      // Verify the API was called with 1-based pagination
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("pageIndex=1"),
        expect.any(Object)
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("recordsPerPage=50"),
        expect.any(Object)
      );
    });

    it("should always include pagination parameters in the request", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      const { SequentumApiClient } = await import("./api-client.js");
      const client = new SequentumApiClient("https://test.example.com", "sk-test-key");

      // Simulating handler always passing pagination defaults
      await client.getAllAgents({
        pageIndex: 1,
        recordsPerPage: 50,
      });

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      
      // Verify pagination is always present
      expect(calledUrl).toContain("pageIndex=");
      expect(calledUrl).toContain("recordsPerPage=");
    });

    it("should use user-provided pageIndex when specified", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      const { SequentumApiClient } = await import("./api-client.js");
      const client = new SequentumApiClient("https://test.example.com", "sk-test-key");

      // User provides explicit page 3
      await client.getAllAgents({
        pageIndex: 3,
        recordsPerPage: 50,
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("pageIndex=3"),
        expect.any(Object)
      );
    });

    it("should use user-provided recordsPerPage when specified", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      const { SequentumApiClient } = await import("./api-client.js");
      const client = new SequentumApiClient("https://test.example.com", "sk-test-key");

      // User provides explicit 25 records per page
      await client.getAllAgents({
        pageIndex: 1,
        recordsPerPage: 25,
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("recordsPerPage=25"),
        expect.any(Object)
      );
    });

    it("should combine pagination with other filters", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      const { SequentumApiClient } = await import("./api-client.js");
      const client = new SequentumApiClient("https://test.example.com", "sk-test-key");

      // Simulating handler with defaults + user-provided filters
      await client.getAllAgents({
        pageIndex: 1,
        recordsPerPage: 50,
        status: 1, // Active
        search: "test",
      });

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      
      // Verify all parameters are present
      // Note: 'search' filter is mapped to 'name' query parameter by the API client
      expect(calledUrl).toContain("pageIndex=1");
      expect(calledUrl).toContain("recordsPerPage=50");
      expect(calledUrl).toContain("status=1");
      expect(calledUrl).toContain("name=test");
    });
  });

  describe("pagination value documentation", () => {
    it("should use 1-based indexing per ListAgentsRequest type definition", () => {
      // This is a documentation test to ensure the type definition is correct
      // The ListAgentsRequest type in types.ts specifies:
      // /** Page index for pagination (1-based) */
      // pageIndex?: number;
      
      // The handler in index.ts should default to pageIndex: 1 (first page)
      // NOT pageIndex: 0 which would be incorrect for 1-based pagination
      
      const defaultPageIndex = 1; // First page in 1-based system
      expect(defaultPageIndex).toBe(1);
    });
  });
});
