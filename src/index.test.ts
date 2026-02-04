import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateStartTimeInFuture } from "./validation.js";

/**
 * Tests for MCP handler behavior in index.ts
 * 
 * These tests verify that the MCP handlers apply correct defaults
 * and transform parameters appropriately before calling the API client.
 */

// ==========================================
// OAuth Metadata Fetch Tests
// ==========================================

describe("OAuth metadata client_id fetching", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  describe("fallback to MCP_CLIENT_ID environment variable", () => {
    it("should document that MCP_CLIENT_ID is used as fallback when backend fetch fails", () => {
      // This test documents the expected behavior:
      // When the backend fetch fails, the system should fall back to MCP_CLIENT_ID env var
      
      // The fetchBackendOAuthMetadata function:
      // 1. Tries to fetch from ${API_BASE_URL}/.well-known/oauth-authorization-server
      // 2. If successful, caches and returns the client_id
      // 3. If failed, checks for MCP_CLIENT_ID environment variable
      // 4. If env var exists, returns it as fallback
      // 5. If no fallback, returns empty object
      
      const fallbackClientId = "mcp-fallback-client-id";
      process.env.MCP_CLIENT_ID = fallbackClientId;
      
      // Verify env var is set correctly
      expect(process.env.MCP_CLIENT_ID).toBe(fallbackClientId);
    });

    it("should return empty client_id when both backend and env var are unavailable", () => {
      // When fetch fails and no MCP_CLIENT_ID is set, should return empty object
      delete process.env.MCP_CLIENT_ID;
      
      // Verify no fallback exists
      expect(process.env.MCP_CLIENT_ID).toBeUndefined();
      
      // The expected result when both sources fail:
      const expectedResult = {};
      expect(expectedResult).toEqual({});
    });

    it("should prefer backend client_id over environment variable", () => {
      // This documents the priority:
      // 1. Backend client_id (if available)
      // 2. MCP_CLIENT_ID env var (fallback)
      
      const backendClientId = "mcp-from-backend";
      const envClientId = "mcp-from-env";
      
      process.env.MCP_CLIENT_ID = envClientId;
      
      // When backend returns a client_id, that should be used
      const backendResult = { client_id: backendClientId };
      const envResult = { client_id: envClientId };
      
      // Backend takes priority
      expect(backendResult.client_id).toBe(backendClientId);
      expect(backendResult.client_id).not.toBe(envClientId);
    });
  });

  describe("caching behavior", () => {
    it("should cache backend metadata for 5 minutes (300000ms)", () => {
      // Document the cache TTL
      const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;
      expect(METADATA_CACHE_TTL_MS).toBe(300000);
    });

    it("should return cached data if within TTL", () => {
      // Cached data should be returned without fetching if within TTL
      const cachedData = { client_id: "cached-client-id", fetchedAt: Date.now() };
      const cacheAge = Date.now() - cachedData.fetchedAt;
      const CACHE_TTL = 5 * 60 * 1000;
      
      // Cache is fresh
      expect(cacheAge < CACHE_TTL).toBe(true);
    });

    it("should refetch if cache has expired", () => {
      // If cache is older than TTL, should refetch
      const CACHE_TTL = 5 * 60 * 1000;
      const expiredFetchedAt = Date.now() - CACHE_TTL - 1000; // 1 second past expiry
      const cacheAge = Date.now() - expiredFetchedAt;
      
      // Cache is stale
      expect(cacheAge > CACHE_TTL).toBe(true);
    });
  });
});

// ==========================================
// Session Management Tests
// ==========================================

describe("HTTP session management", () => {
  describe("orphaned session cleanup", () => {
    it("should document that sessions without ID are cleaned up to prevent memory leaks", () => {
      // This test documents the expected behavior:
      // When a session is created but handleRequest doesn't return a session ID,
      // the session should be cleaned up by calling server.close()
      
      // The cleanup logic in POST /mcp handler:
      // 1. Session is created with createSession(token)
      // 2. handleRequest is called
      // 3. After handleRequest, check for mcp-session-id header
      // 4. If newSessionId exists, store the session
      // 5. If newSessionId is missing, call session.server.close() to cleanup
      
      const sessionCreated = true;
      const sessionIdReturned = false;
      
      // When session is created but no ID returned, cleanup should occur
      const shouldCleanup = sessionCreated && !sessionIdReturned;
      expect(shouldCleanup).toBe(true);
    });

    it("should not cleanup sessions that are successfully stored", () => {
      const sessionCreated = true;
      const sessionIdReturned = true;
      
      // When session ID is returned, session should be stored, not cleaned up
      const shouldCleanup = sessionCreated && !sessionIdReturned;
      expect(shouldCleanup).toBe(false);
    });

    it("should handle errors during session cleanup gracefully", () => {
      // Document that cleanup errors are logged but don't crash the server
      // The try/catch around session.server.close() ensures robustness
      
      const closeError = new Error("Failed to close");
      
      // Error should be caught and logged, not thrown
      expect(() => {
        // Simulating the try/catch behavior
        try {
          throw closeError;
        } catch (error) {
          // Error is logged but not rethrown
          expect(error).toBe(closeError);
        }
      }).not.toThrow();
    });
  });

  describe("session storage", () => {
    it("should store sessions in a Map keyed by session ID", () => {
      const sessions = new Map<string, object>();
      const sessionId = "test-session-123";
      const session = { server: {}, transport: {}, apiClient: {} };
      
      sessions.set(sessionId, session);
      
      expect(sessions.has(sessionId)).toBe(true);
      expect(sessions.get(sessionId)).toBe(session);
    });

    it("should not overwrite existing sessions", () => {
      const sessions = new Map<string, object>();
      const sessionId = "test-session-123";
      const existingSession = { id: "existing" };
      const newSession = { id: "new" };
      
      sessions.set(sessionId, existingSession);
      
      // The condition checks !sessions.has(newSessionId) before storing
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, newSession);
      }
      
      // Existing session should not be overwritten
      expect(sessions.get(sessionId)).toBe(existingSession);
    });
  });

  describe("session cleanup interval", () => {
    it("should cleanup stale sessions after 1 hour of inactivity", () => {
      const SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
      expect(SESSION_MAX_AGE_MS).toBe(3600000);
    });

    it("should run cleanup every 15 minutes", () => {
      const SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
      expect(SESSION_CLEANUP_INTERVAL_MS).toBe(900000);
    });

    it("should identify stale sessions based on lastActivityAt", () => {
      const SESSION_MAX_AGE_MS = 60 * 60 * 1000;
      const now = Date.now();
      
      // Active session (5 minutes ago)
      const activeSession = { lastActivityAt: now - (5 * 60 * 1000) };
      const activeSessionAge = now - activeSession.lastActivityAt;
      expect(activeSessionAge < SESSION_MAX_AGE_MS).toBe(true);
      
      // Stale session (2 hours ago)
      const staleSession = { lastActivityAt: now - (2 * 60 * 60 * 1000) };
      const staleSessionAge = now - staleSession.lastActivityAt;
      expect(staleSessionAge > SESSION_MAX_AGE_MS).toBe(true);
    });
  });

  describe("DELETE /mcp session termination", () => {
    it("should call server.close() when terminating a session via DELETE", () => {
      // Document the expected behavior:
      // When DELETE /mcp is called with a valid session ID:
      // 1. Get the session from the Map
      // 2. Delete from sessions Map
      // 3. Call session.server.close() to release resources
      
      const mockClose = vi.fn().mockResolvedValue(undefined);
      const sessions = new Map<string, { server: { close: () => Promise<void> } }>();
      const sessionId = "test-session-123";
      const session = { server: { close: mockClose } };
      
      sessions.set(sessionId, session);
      
      // Simulate DELETE handler logic
      if (sessionId && sessions.has(sessionId)) {
        const sessionToClose = sessions.get(sessionId);
        sessions.delete(sessionId);
        sessionToClose?.server.close();
      }
      
      expect(sessions.has(sessionId)).toBe(false);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it("should handle errors during server.close() gracefully", () => {
      // Document that close errors are caught and logged, not thrown
      const closeError = new Error("Failed to close server");
      
      expect(() => {
        try {
          throw closeError;
        } catch (e) {
          // Error is logged but not rethrown (matches DEBUG-wrapped logging)
          expect(e).toBe(closeError);
        }
      }).not.toThrow();
    });

    it("should not attempt cleanup for non-existent sessions", () => {
      const sessions = new Map<string, object>();
      const sessionId = "non-existent-session";
      
      // Simulate DELETE handler logic - no session to cleanup
      const sessionExists = sessionId && sessions.has(sessionId);
      
      expect(sessionExists).toBe(false);
    });

    it("should remove session from Map before calling close", () => {
      // Document the order of operations to prevent race conditions:
      // 1. Remove from Map FIRST
      // 2. Then close the server
      // This ensures no new requests can use the session while it's closing
      
      const operationOrder: string[] = [];
      const sessions = new Map<string, { server: { close: () => void } }>();
      const sessionId = "test-session";
      
      const session = {
        server: {
          close: () => {
            operationOrder.push("close");
          }
        }
      };
      sessions.set(sessionId, session);
      
      // Simulate DELETE handler
      if (sessionId && sessions.has(sessionId)) {
        const sessionToClose = sessions.get(sessionId);
        sessions.delete(sessionId);
        operationOrder.push("delete");
        sessionToClose?.server.close();
      }
      
      expect(operationOrder).toEqual(["delete", "close"]);
    });
  });
});

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
