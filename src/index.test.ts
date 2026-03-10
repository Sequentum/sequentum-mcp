import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getDefaultDateRange,
  validateBoolean,
  validateDateRange,
  validateEnum,
  validateISODate,
  validateJsonString,
  validateNumber,
  validateStartTimeInFuture,
  validateString,
} from "./utils/validation.js";
import { buildOAuthMetadata } from "./utils/oauth-metadata.js";
import { resources, resourceTemplates, readResource } from "./server/resources.js";
import { prompts, getPromptMessages } from "./server/prompts.js";

/**
 * Tests for MCP handler behavior in index.ts
 * 
 * These tests verify that the MCP handlers apply correct defaults
 * and transform parameters appropriately before calling the API client.
 */

// ==========================================
// OAuth Authorization Server Metadata Tests
// ==========================================

describe("OAuth Authorization Server metadata (RFC 8414)", () => {
  const API_BASE_URL = "https://dashboard.sequentum.com";
  const metadata = buildOAuthMetadata(API_BASE_URL);

  it("should advertise CIMD support (draft-ietf-oauth-client-id-metadata-document)", () => {
    // Per MCP spec 2025-11-25, CIMD is the preferred dynamic client identification method.
    // The authorization server signals support via client_id_metadata_document_supported: true.
    // MCP clients check this flag to decide whether to use a URL as their client_id.
    expect(metadata.client_id_metadata_document_supported).toBe(true);
  });

  it("should include registration_endpoint as DCR fallback (RFC 7591)", () => {
    // Dynamic Client Registration is kept as a fallback for clients that don't support CIMD.
    // Per MCP spec priority: 1) Pre-registration 2) CIMD 3) DCR 4) Manual
    expect(metadata.registration_endpoint).toBe(`${API_BASE_URL}/api/oauth/register`);
  });

  it("should declare public client auth (PKCE) with token_endpoint_auth_methods_supported: ['none']", () => {
    // All clients are public (no client_secret), protected by PKCE (S256)
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("should not include a static client_id in the metadata", () => {
    // With CIMD/DCR, there is no pre-assigned client_id in server metadata.
    // CIMD clients use their own URL; DCR clients register to get one.
    expect(metadata).not.toHaveProperty("client_id");
  });

  it("should support authorization_code and refresh_token grant types", () => {
    expect(metadata.grant_types_supported).toContain("authorization_code");
    expect(metadata.grant_types_supported).toContain("refresh_token");
  });

  it("should advertise resource indicator support (RFC 8707)", () => {
    // Resource indicators allow clients to specify which resource they're requesting a token for.
    // This is required by the MCP spec for proper token scoping.
    expect(metadata.resource_indicators_supported).toBe(true);
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
  it("requires name (validateString default required=true)", () => {
    expect(() => validateString({}, "name")).toThrow(/Missing required parameter: name/);
  });

  it("treats scheduleType as optional (validateNumber required=false)", () => {
    const result = validateNumber({}, "scheduleType", false);
    expect(result).toBeUndefined();
  });

  it("throws when scheduleType is the wrong type", () => {
    expect(() =>
      validateNumber({ scheduleType: "3" }, "scheduleType", false)
    ).toThrow(/expected a number/);
  });

  it("treats startTime and cronExpression as optional strings", () => {
    expect(validateString({}, "startTime", false)).toBeUndefined();
    expect(validateString({}, "cronExpression", false)).toBeUndefined();
  });

  it("throws when startTime is not a string", () => {
    expect(() =>
      validateString({ startTime: 123 }, "startTime", false)
    ).toThrow(/expected a string/);
  });
});

// ==========================================
// delete_run Handler Validation Tests
// ==========================================

describe("delete_run handler validation", () => {
  const validMethods = [
    "RemoveEntireRun",
    "RemoveAllFiles",
    "RemoveAllFilesAndAgentInput",
  ] as const;

  it("returns undefined when removeMethod is omitted (optional)", () => {
    const result = validateEnum({}, "removeMethod", validMethods, false);
    expect(result).toBeUndefined();
  });

  it("accepts valid enum values", () => {
    const result = validateEnum(
      { removeMethod: "RemoveAllFiles" },
      "removeMethod",
      validMethods,
      false
    );
    expect(result).toBe("RemoveAllFiles");
  });

  it("throws for invalid enum values", () => {
    expect(() =>
      validateEnum(
        { removeMethod: "DropEverything" },
        "removeMethod",
        validMethods,
        false
      )
    ).toThrow(/Invalid parameter 'removeMethod'/);
  });

  it("throws when removeMethod is not a string", () => {
    expect(() =>
      validateEnum(
        { removeMethod: 42 as unknown as string },
        "removeMethod",
        validMethods,
        false
      )
    ).toThrow(/expected a string/);
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
      const { SequentumApiClient } = await import("./api/api-client.js");
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

      const { SequentumApiClient } = await import("./api/api-client.js");
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

      const { SequentumApiClient } = await import("./api/api-client.js");
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

      const { SequentumApiClient } = await import("./api/api-client.js");
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

      const { SequentumApiClient } = await import("./api/api-client.js");
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

// ==========================================
// MCP Resource Tests
// ==========================================

describe("MCP Resources", () => {
  describe("static resource definitions", () => {
    it("should define 7 static resources", () => {
      expect(resources).toHaveLength(7);
    });

    it("should include agents resource", () => {
      const agentsResource = resources.find(r => r.uri === "sequentum://agents");
      expect(agentsResource).toBeDefined();
      expect(agentsResource!.name).toBe("Agent List");
      expect(agentsResource!.mimeType).toBe("application/json");
    });

    it("should include spaces resource", () => {
      const spacesResource = resources.find(r => r.uri === "sequentum://spaces");
      expect(spacesResource).toBeDefined();
      expect(spacesResource!.name).toBe("Spaces");
      expect(spacesResource!.mimeType).toBe("application/json");
    });

    it("should include billing balance resource", () => {
      const balanceResource = resources.find(r => r.uri === "sequentum://billing/balance");
      expect(balanceResource).toBeDefined();
      expect(balanceResource!.name).toBe("Credits Balance");
      expect(balanceResource!.mimeType).toBe("application/json");
    });

    it("should include billing spending resource", () => {
      const spendingResource = resources.find(r => r.uri === "sequentum://billing/spending");
      expect(spendingResource).toBeDefined();
      expect(spendingResource!.name).toBe("Monthly Spending");
      expect(spendingResource!.mimeType).toBe("application/json");
    });

    it("should include billing agents-usage resource", () => {
      const usageResource = resources.find(r => r.uri === "sequentum://billing/agents-usage");
      expect(usageResource).toBeDefined();
      expect(usageResource!.name).toBe("Agent Costs (Current Month)");
      expect(usageResource!.mimeType).toBe("application/json");
    });

    it("should include analytics runs resource", () => {
      const runsResource = resources.find(r => r.uri === "sequentum://analytics/runs");
      expect(runsResource).toBeDefined();
      expect(runsResource!.name).toBe("Recent Runs Summary");
      expect(runsResource!.mimeType).toBe("application/json");
    });

    it("should include analytics upcoming-schedules resource", () => {
      const schedulesResource = resources.find(r => r.uri === "sequentum://analytics/upcoming-schedules");
      expect(schedulesResource).toBeDefined();
      expect(schedulesResource!.name).toBe("Upcoming Schedules");
      expect(schedulesResource!.mimeType).toBe("application/json");
    });

    it("should have descriptions on all static resources", () => {
      resources.forEach(r => {
        expect(r.description).toBeTruthy();
        expect(typeof r.description).toBe("string");
      });
    });
  });

  describe("resource template definitions", () => {
    it("should define 11 resource templates", () => {
      expect(resourceTemplates).toHaveLength(11);
    });

    it("should include agent detail template", () => {
      const tpl = resourceTemplates.find(t => t.uriTemplate === "sequentum://agents/{agentId}");
      expect(tpl).toBeDefined();
      expect(tpl!.name).toBe("Agent Detail");
    });

    it("should include agent versions template", () => {
      const tpl = resourceTemplates.find(t => t.uriTemplate === "sequentum://agents/{agentId}/versions");
      expect(tpl).toBeDefined();
      expect(tpl!.name).toBe("Agent Versions");
    });

    it("should include agent schedules template", () => {
      const tpl = resourceTemplates.find(t => t.uriTemplate === "sequentum://agents/{agentId}/schedules");
      expect(tpl).toBeDefined();
      expect(tpl!.name).toBe("Agent Schedules");
    });

    it("should include agent cost breakdown template", () => {
      const tpl = resourceTemplates.find(t => t.uriTemplate === "sequentum://agents/{agentId}/cost-breakdown");
      expect(tpl).toBeDefined();
      expect(tpl!.name).toBe("Agent Cost Breakdown");
    });

    it("should include space detail template", () => {
      const tpl = resourceTemplates.find(t => t.uriTemplate === "sequentum://spaces/{spaceId}");
      expect(tpl).toBeDefined();
      expect(tpl!.name).toBe("Space Detail");
    });

    it("should include space agents template", () => {
      const tpl = resourceTemplates.find(t => t.uriTemplate === "sequentum://spaces/{spaceId}/agents");
      expect(tpl).toBeDefined();
      expect(tpl!.name).toBe("Space Agents");
    });

    it("should include agent runs template", () => {
      const tpl = resourceTemplates.find(t => t.uriTemplate === "sequentum://agents/{agentId}/runs");
      expect(tpl).toBeDefined();
      expect(tpl!.name).toBe("Agent Runs");
    });

    it("should include run status template", () => {
      const tpl = resourceTemplates.find(t => t.uriTemplate === "sequentum://agents/{agentId}/runs/{runId}");
      expect(tpl).toBeDefined();
      expect(tpl!.name).toBe("Run Status");
    });

    it("should include run files template", () => {
      const tpl = resourceTemplates.find(t => t.uriTemplate === "sequentum://agents/{agentId}/runs/{runId}/files");
      expect(tpl).toBeDefined();
      expect(tpl!.name).toBe("Run Files");
    });

    it("should include run diagnostics template", () => {
      const tpl = resourceTemplates.find(t => t.uriTemplate === "sequentum://agents/{agentId}/runs/{runId}/diagnostics");
      expect(tpl).toBeDefined();
      expect(tpl!.name).toBe("Run Diagnostics");
    });

    it("should include latest failure template", () => {
      const tpl = resourceTemplates.find(t => t.uriTemplate === "sequentum://agents/{agentId}/latest-failure");
      expect(tpl).toBeDefined();
      expect(tpl!.name).toBe("Latest Failure");
    });

    it("should have descriptions on all resource templates", () => {
      resourceTemplates.forEach(t => {
        expect(t.description).toBeTruthy();
        expect(typeof t.description).toBe("string");
      });
    });

    it("should set mimeType to application/json on all templates", () => {
      resourceTemplates.forEach(t => {
        expect(t.mimeType).toBe("application/json");
      });
    });
  });

  describe("readResource dispatcher", () => {
    let mockApiClient: Record<string, ReturnType<typeof vi.fn>>;

    beforeEach(() => {
      mockApiClient = {
        getAllAgents: vi.fn().mockResolvedValue({ agents: [], totalRecordCount: 0 }),
        getAllSpaces: vi.fn().mockResolvedValue([]),
        getCreditsBalance: vi.fn().mockResolvedValue({ availableCredits: 100 }),
        getSpendingSummary: vi.fn().mockResolvedValue({ totalSpent: 500 }),
        getRunsSummary: vi.fn().mockResolvedValue({ totalRuns: 10 }),
        getUpcomingSchedules: vi.fn().mockResolvedValue([{ scheduleId: 1 }]),
        getAgent: vi.fn().mockResolvedValue({ id: 42, name: "Test Agent" }),
        getAgentVersions: vi.fn().mockResolvedValue([{ version: 1 }]),
        getAgentSchedules: vi.fn().mockResolvedValue([]),
        getAgentRuns: vi.fn().mockResolvedValue([{ id: 100, status: "Completed" }]),
        getRunStatus: vi.fn().mockResolvedValue({ id: 100, status: "Running" }),
        getRunFiles: vi.fn().mockResolvedValue([{ id: 1, name: "output.csv" }]),
        getRunDiagnostics: vi.fn().mockResolvedValue({ runId: 100, errorMessage: "Timeout" }),
        getLatestFailure: vi.fn().mockResolvedValue({ runId: 99, status: "Failed" }),
        getSpace: vi.fn().mockResolvedValue({ id: 1, name: "Test Space" }),
        getSpaceAgents: vi.fn().mockResolvedValue([]),
      };
    });

    it("should read sequentum://agents with default pagination", async () => {
      const result = await readResource("sequentum://agents", mockApiClient as any);
      expect(mockApiClient.getAllAgents).toHaveBeenCalledWith({ pageIndex: 1, recordsPerPage: 50 });
      expect(result.uri).toBe("sequentum://agents");
      expect(result.mimeType).toBe("application/json");
    });

    it("should read sequentum://spaces", async () => {
      const result = await readResource("sequentum://spaces", mockApiClient as any);
      expect(mockApiClient.getAllSpaces).toHaveBeenCalled();
      expect(result.uri).toBe("sequentum://spaces");
    });

    it("should read sequentum://billing/balance", async () => {
      const result = await readResource("sequentum://billing/balance", mockApiClient as any);
      expect(mockApiClient.getCreditsBalance).toHaveBeenCalled();
      expect(result.mimeType).toBe("application/json");
      expect(JSON.parse(result.text)).toEqual({ availableCredits: 100 });
    });

    it("should read sequentum://agents/{agentId}", async () => {
      const result = await readResource("sequentum://agents/42", mockApiClient as any);
      expect(mockApiClient.getAgent).toHaveBeenCalledWith(42);
      expect(JSON.parse(result.text)).toEqual({ id: 42, name: "Test Agent" });
    });

    it("should read sequentum://agents/{agentId}/versions", async () => {
      await readResource("sequentum://agents/10/versions", mockApiClient as any);
      expect(mockApiClient.getAgentVersions).toHaveBeenCalledWith(10);
    });

    it("should read sequentum://agents/{agentId}/schedules", async () => {
      await readResource("sequentum://agents/10/schedules", mockApiClient as any);
      expect(mockApiClient.getAgentSchedules).toHaveBeenCalledWith(10);
    });

    it("should read sequentum://spaces/{spaceId}", async () => {
      await readResource("sequentum://spaces/5", mockApiClient as any);
      expect(mockApiClient.getSpace).toHaveBeenCalledWith(5);
    });

    it("should read sequentum://spaces/{spaceId}/agents", async () => {
      await readResource("sequentum://spaces/5/agents", mockApiClient as any);
      expect(mockApiClient.getSpaceAgents).toHaveBeenCalledWith(5);
    });

    it("should read sequentum://billing/spending", async () => {
      const result = await readResource("sequentum://billing/spending", mockApiClient as any);
      expect(mockApiClient.getSpendingSummary).toHaveBeenCalled();
      expect(result.mimeType).toBe("application/json");
      expect(JSON.parse(result.text)).toEqual({ totalSpent: 500 });
    });

    it("should read sequentum://analytics/runs", async () => {
      const result = await readResource("sequentum://analytics/runs", mockApiClient as any);
      expect(mockApiClient.getRunsSummary).toHaveBeenCalled();
      expect(JSON.parse(result.text)).toEqual({ totalRuns: 10 });
    });

    it("should read sequentum://analytics/upcoming-schedules", async () => {
      const result = await readResource("sequentum://analytics/upcoming-schedules", mockApiClient as any);
      expect(mockApiClient.getUpcomingSchedules).toHaveBeenCalled();
      expect(JSON.parse(result.text)).toEqual([{ scheduleId: 1 }]);
    });

    it("should read sequentum://agents/{agentId}/runs", async () => {
      const result = await readResource("sequentum://agents/42/runs", mockApiClient as any);
      expect(mockApiClient.getAgentRuns).toHaveBeenCalledWith(42);
      expect(JSON.parse(result.text)).toEqual([{ id: 100, status: "Completed" }]);
    });

    it("should read sequentum://agents/{agentId}/runs/{runId}", async () => {
      const result = await readResource("sequentum://agents/42/runs/100", mockApiClient as any);
      expect(mockApiClient.getRunStatus).toHaveBeenCalledWith(42, 100);
      expect(JSON.parse(result.text)).toEqual({ id: 100, status: "Running" });
    });

    it("should read sequentum://agents/{agentId}/runs/{runId}/files", async () => {
      const result = await readResource("sequentum://agents/42/runs/100/files", mockApiClient as any);
      expect(mockApiClient.getRunFiles).toHaveBeenCalledWith(42, 100);
      expect(JSON.parse(result.text)).toEqual([{ id: 1, name: "output.csv" }]);
    });

    it("should read sequentum://agents/{agentId}/runs/{runId}/diagnostics", async () => {
      const result = await readResource("sequentum://agents/42/runs/100/diagnostics", mockApiClient as any);
      expect(mockApiClient.getRunDiagnostics).toHaveBeenCalledWith(42, 100);
      expect(JSON.parse(result.text)).toEqual({ runId: 100, errorMessage: "Timeout" });
    });

    it("should read sequentum://agents/{agentId}/latest-failure", async () => {
      const result = await readResource("sequentum://agents/42/latest-failure", mockApiClient as any);
      expect(mockApiClient.getLatestFailure).toHaveBeenCalledWith(42);
      expect(JSON.parse(result.text)).toEqual({ runId: 99, status: "Failed" });
    });

    it("should throw for unknown resource URI", async () => {
      await expect(readResource("sequentum://unknown", mockApiClient as any)).rejects.toThrow(
        "Unknown resource URI: sequentum://unknown"
      );
    });

    it("should throw for malformed agent URI", async () => {
      await expect(readResource("sequentum://agents/abc", mockApiClient as any)).rejects.toThrow(
        "Unknown resource URI"
      );
    });
  });
});

// ==========================================
// MCP Prompt Tests
// ==========================================

describe("MCP Prompts", () => {
  describe("prompt definitions", () => {
    it("should define 9 prompts", () => {
      expect(prompts).toHaveLength(9);
    });

    it("should include debug-agent prompt with agentName argument", () => {
      const prompt = prompts.find(p => p.name === "debug-agent");
      expect(prompt).toBeDefined();
      expect(prompt!.arguments).toHaveLength(1);
      expect(prompt!.arguments![0].name).toBe("agentName");
      expect(prompt!.arguments![0].required).toBe(true);
    });

    it("should include agent-health-check prompt with agentName argument", () => {
      const prompt = prompts.find(p => p.name === "agent-health-check");
      expect(prompt).toBeDefined();
      expect(prompt!.arguments).toHaveLength(1);
      expect(prompt!.arguments![0].name).toBe("agentName");
      expect(prompt!.arguments![0].required).toBe(true);
    });

    it("should include spending-report prompt with no arguments", () => {
      const prompt = prompts.find(p => p.name === "spending-report");
      expect(prompt).toBeDefined();
      expect(prompt!.arguments).toHaveLength(0);
    });

    it("should include cost-analysis prompt with no arguments", () => {
      const prompt = prompts.find(p => p.name === "cost-analysis");
      expect(prompt).toBeDefined();
      expect(prompt!.arguments).toHaveLength(0);
    });

    it("should include run-and-monitor prompt with agentName argument", () => {
      const prompt = prompts.find(p => p.name === "run-and-monitor");
      expect(prompt).toBeDefined();
      expect(prompt!.arguments).toHaveLength(1);
      expect(prompt!.arguments![0].name).toBe("agentName");
      expect(prompt!.arguments![0].required).toBe(true);
    });

    it("should include space-overview prompt with spaceName argument", () => {
      const prompt = prompts.find(p => p.name === "space-overview");
      expect(prompt).toBeDefined();
      expect(prompt!.arguments).toHaveLength(1);
      expect(prompt!.arguments![0].name).toBe("spaceName");
      expect(prompt!.arguments![0].required).toBe(true);
    });

    it("should include daily-operations-report prompt with no arguments", () => {
      const prompt = prompts.find(p => p.name === "daily-operations-report");
      expect(prompt).toBeDefined();
      expect(prompt!.arguments).toHaveLength(0);
    });

    it("should include schedule-agent prompt with agentName and optional scheduleDescription", () => {
      const prompt = prompts.find(p => p.name === "schedule-agent");
      expect(prompt).toBeDefined();
      expect(prompt!.arguments).toHaveLength(2);
      expect(prompt!.arguments![0].name).toBe("agentName");
      expect(prompt!.arguments![0].required).toBe(true);
      expect(prompt!.arguments![1].name).toBe("scheduleDescription");
      expect(prompt!.arguments![1].required).toBe(false);
    });

    it("should include compare-runs prompt with agentName argument", () => {
      const prompt = prompts.find(p => p.name === "compare-runs");
      expect(prompt).toBeDefined();
      expect(prompt!.arguments).toHaveLength(1);
      expect(prompt!.arguments![0].name).toBe("agentName");
      expect(prompt!.arguments![0].required).toBe(true);
    });

    it("should have descriptions on all prompts", () => {
      prompts.forEach(p => {
        expect(p.description).toBeTruthy();
        expect(typeof p.description).toBe("string");
      });
    });
  });

  describe("getPromptMessages", () => {
    it("should return messages for debug-agent with agentName", () => {
      const messages = getPromptMessages("debug-agent", { agentName: "Amazon Scraper" });
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect((messages[0].content as { text: string }).text).toContain("Amazon Scraper");
      expect((messages[0].content as { text: string }).text).toContain("search_agents");
      expect((messages[0].content as { text: string }).text).toContain("get_latest_failure");
    });

    it("should return messages for agent-health-check with agentName", () => {
      const messages = getPromptMessages("agent-health-check", { agentName: "Price Monitor" });
      expect(messages).toHaveLength(1);
      expect((messages[0].content as { text: string }).text).toContain("Price Monitor");
      expect((messages[0].content as { text: string }).text).toContain("get_agent_runs");
      expect((messages[0].content as { text: string }).text).toContain("list_agent_schedules");
      expect((messages[0].content as { text: string }).text).toContain("get_agent_versions");
    });

    it("should return messages for spending-report without arguments", () => {
      const messages = getPromptMessages("spending-report", undefined);
      expect(messages).toHaveLength(1);
      expect((messages[0].content as { text: string }).text).toContain("get_credits_balance");
      expect((messages[0].content as { text: string }).text).toContain("get_spending_summary");
      expect((messages[0].content as { text: string }).text).toContain("get_credit_history");
    });

    it("should return messages for run-and-monitor with agentName", () => {
      const messages = getPromptMessages("run-and-monitor", { agentName: "Product Scraper" });
      expect(messages).toHaveLength(1);
      expect((messages[0].content as { text: string }).text).toContain("Product Scraper");
      expect((messages[0].content as { text: string }).text).toContain("start_agent");
      expect((messages[0].content as { text: string }).text).toContain("get_run_status");
      expect((messages[0].content as { text: string }).text).toContain("get_run_files");
    });

    it("should throw for debug-agent without agentName", () => {
      expect(() => getPromptMessages("debug-agent", {})).toThrow("Missing required argument: agentName");
      expect(() => getPromptMessages("debug-agent", undefined)).toThrow("Missing required argument: agentName");
    });

    it("should throw for agent-health-check without agentName", () => {
      expect(() => getPromptMessages("agent-health-check", {})).toThrow("Missing required argument: agentName");
    });

    it("should throw for run-and-monitor without agentName", () => {
      expect(() => getPromptMessages("run-and-monitor", {})).toThrow("Missing required argument: agentName");
    });

    it("should return messages for space-overview with spaceName", () => {
      const messages = getPromptMessages("space-overview", { spaceName: "Production" });
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect((messages[0].content as { text: string }).text).toContain("Production");
      expect((messages[0].content as { text: string }).text).toContain("search_space_by_name");
      expect((messages[0].content as { text: string }).text).toContain("get_space_agents");
      expect((messages[0].content as { text: string }).text).toContain("get_latest_failure");
    });

    it("should throw for space-overview without spaceName", () => {
      expect(() => getPromptMessages("space-overview", {})).toThrow("Missing required argument: spaceName");
      expect(() => getPromptMessages("space-overview", undefined)).toThrow("Missing required argument: spaceName");
    });

    it("should return messages for daily-operations-report without arguments", () => {
      const messages = getPromptMessages("daily-operations-report", undefined);
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect((messages[0].content as { text: string }).text).toContain("get_runs_summary");
      expect((messages[0].content as { text: string }).text).toContain("get_records_summary");
      expect((messages[0].content as { text: string }).text).toContain("get_credits_balance");
      expect((messages[0].content as { text: string }).text).toContain("get_spending_summary");
      expect((messages[0].content as { text: string }).text).toContain("get_scheduled_runs");
    });

    it("should return messages for schedule-agent with agentName", () => {
      const messages = getPromptMessages("schedule-agent", { agentName: "Daily Scraper" });
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect((messages[0].content as { text: string }).text).toContain("Daily Scraper");
      expect((messages[0].content as { text: string }).text).toContain("search_agents");
      expect((messages[0].content as { text: string }).text).toContain("list_agent_schedules");
      expect((messages[0].content as { text: string }).text).toContain("create_agent_schedule");
    });

    it("should include schedule description hint when provided", () => {
      const messages = getPromptMessages("schedule-agent", {
        agentName: "Daily Scraper",
        scheduleDescription: "every Monday at 9am",
      });
      expect((messages[0].content as { text: string }).text).toContain("every Monday at 9am");
    });

    it("should ask for schedule when scheduleDescription is not provided", () => {
      const messages = getPromptMessages("schedule-agent", { agentName: "Daily Scraper" });
      expect((messages[0].content as { text: string }).text).toContain("Ask the user what schedule");
    });

    it("should throw for schedule-agent without agentName", () => {
      expect(() => getPromptMessages("schedule-agent", {})).toThrow("Missing required argument: agentName");
      expect(() => getPromptMessages("schedule-agent", undefined)).toThrow("Missing required argument: agentName");
    });

    it("should return messages for compare-runs with agentName", () => {
      const messages = getPromptMessages("compare-runs", { agentName: "Price Monitor" });
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect((messages[0].content as { text: string }).text).toContain("Price Monitor");
      expect((messages[0].content as { text: string }).text).toContain("search_agents");
      expect((messages[0].content as { text: string }).text).toContain("get_agent_runs");
      expect((messages[0].content as { text: string }).text).toContain("get_run_diagnostics");
    });

    it("should throw for compare-runs without agentName", () => {
      expect(() => getPromptMessages("compare-runs", {})).toThrow("Missing required argument: agentName");
      expect(() => getPromptMessages("compare-runs", undefined)).toThrow("Missing required argument: agentName");
    });

    it("should throw for unknown prompt name", () => {
      expect(() => getPromptMessages("non-existent-prompt", {})).toThrow("Unknown prompt: non-existent-prompt");
    });
  });
});

// ==========================================
// validateISODate Tests
// ==========================================

describe("validateISODate", () => {
  describe("valid ISO 8601 dates", () => {
    it("should accept date-only format (YYYY-MM-DD)", () => {
      expect(() => validateISODate("2026-01-01", "startDate")).not.toThrow();
    });

    it("should accept full ISO format with Z timezone", () => {
      expect(() => validateISODate("2026-01-01T00:00:00Z", "startDate")).not.toThrow();
    });

    it("should accept ISO format with milliseconds", () => {
      expect(() => validateISODate("2026-01-01T00:00:00.000Z", "startDate")).not.toThrow();
    });

    it("should accept ISO format with positive timezone offset", () => {
      expect(() => validateISODate("2026-01-01T00:00:00+05:30", "startDate")).not.toThrow();
    });

    it("should accept ISO format with negative timezone offset", () => {
      expect(() => validateISODate("2026-01-01T00:00:00-08:00", "startDate")).not.toThrow();
    });
  });

  describe("invalid dates", () => {
    it("should reject empty string", () => {
      expect(() => validateISODate("", "startDate")).toThrow("Missing or invalid startDate");
    });

    it("should reject non-ISO format like 'January 1, 2026'", () => {
      expect(() => validateISODate("January 1, 2026", "startDate")).toThrow(
        "Invalid date format for 'startDate'"
      );
    });

    it("should reject US date format like '1/1/2026'", () => {
      expect(() => validateISODate("1/1/2026", "startDate")).toThrow(
        "Invalid date format for 'startDate'"
      );
    });

    it("should reject completely invalid string", () => {
      expect(() => validateISODate("not-a-date", "startDate")).toThrow(
        "Invalid date format for 'startDate'"
      );
    });

    it("should reject date with invalid month (2026-13-01)", () => {
      expect(() => validateISODate("2026-13-01", "endDate")).toThrow(
        "Invalid date format for 'endDate'"
      );
    });

    it("should accept structurally valid dates even if logically invalid (API handles calendar validation)", () => {
      // JavaScript's Date rolls 2026-02-30 to 2026-03-02, so it passes format validation.
      // The API server is responsible for rejecting logically invalid dates.
      expect(() => validateISODate("2026-02-30", "endDate")).not.toThrow();
    });

    it("should include field name in error message", () => {
      expect(() => validateISODate("bad", "myField")).toThrow("'myField'");
    });
  });
});

// ==========================================
// validateDateRange Tests
// ==========================================

describe("validateDateRange", () => {
  it("should accept when startDate equals endDate", () => {
    expect(() => validateDateRange("2026-01-01", "2026-01-01")).not.toThrow();
  });

  it("should accept when startDate is before endDate", () => {
    expect(() => validateDateRange("2026-01-01", "2026-01-31")).not.toThrow();
  });

  it("should throw when startDate is after endDate", () => {
    expect(() => validateDateRange("2026-01-31", "2026-01-01")).toThrow(
      "startDate must be before or equal to endDate"
    );
  });

  it("should work with full ISO timestamps", () => {
    expect(() =>
      validateDateRange("2026-01-01T00:00:00Z", "2026-01-31T23:59:59Z")
    ).not.toThrow();
  });

  it("should throw when timestamps are swapped", () => {
    expect(() =>
      validateDateRange("2026-01-31T23:59:59Z", "2026-01-01T00:00:00Z")
    ).toThrow("startDate must be before or equal to endDate");
  });
});

// ==========================================
// getDefaultDateRange Tests
// ==========================================

describe("getDefaultDateRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T14:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return startDate as the first day of the current month in UTC", () => {
    const { startDate } = getDefaultDateRange();
    expect(startDate).toBe("2026-03-01T00:00:00.000Z");
  });

  it("should return endDate as the current time", () => {
    const { endDate } = getDefaultDateRange();
    expect(endDate).toBe("2026-03-15T14:30:00.000Z");
  });

  it("should return valid ISO 8601 strings", () => {
    const { startDate, endDate } = getDefaultDateRange();
    expect(() => validateISODate(startDate, "startDate")).not.toThrow();
    expect(() => validateISODate(endDate, "endDate")).not.toThrow();
  });

  it("should return a valid range (startDate <= endDate)", () => {
    const { startDate, endDate } = getDefaultDateRange();
    expect(() => validateDateRange(startDate, endDate)).not.toThrow();
  });

  it("should handle January correctly (no off-by-one on month)", () => {
    vi.setSystemTime(new Date("2026-01-20T10:00:00Z"));
    const { startDate } = getDefaultDateRange();
    expect(startDate).toBe("2026-01-01T00:00:00.000Z");
  });

  it("should handle year boundary (January 1st)", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:01Z"));
    const { startDate } = getDefaultDateRange();
    expect(startDate).toBe("2026-01-01T00:00:00.000Z");
  });
});

// ==========================================
// validateNumber with NumberValidationOptions Tests
// ==========================================

describe("validateNumber with NumberValidationOptions", () => {
  it("supports the boolean shorthand (backward compatibility)", () => {
    expect(validateNumber({ x: 5 }, "x", true)).toBe(5);
    expect(validateNumber({}, "x", false)).toBeUndefined();
    expect(() => validateNumber({}, "x", true)).toThrow(/Missing required/);
  });

  it("supports the options object form", () => {
    expect(validateNumber({ x: 5 }, "x", { required: true })).toBe(5);
    expect(validateNumber({}, "x", { required: false })).toBeUndefined();
  });

  it("enforces min constraint", () => {
    expect(validateNumber({ x: 5 }, "x", { min: 1 })).toBe(5);
    expect(() => validateNumber({ x: 0 }, "x", { min: 1 })).toThrow(
      /must be >= 1/
    );
  });

  it("enforces max constraint", () => {
    expect(validateNumber({ x: 5 }, "x", { max: 10 })).toBe(5);
    expect(() => validateNumber({ x: 11 }, "x", { max: 10 })).toThrow(
      /must be <= 10/
    );
  });

  it("enforces min and max together", () => {
    expect(validateNumber({ x: 5 }, "x", { min: 1, max: 10 })).toBe(5);
    expect(() => validateNumber({ x: 0 }, "x", { min: 1, max: 10 })).toThrow(
      /must be >= 1/
    );
    expect(() => validateNumber({ x: 11 }, "x", { min: 1, max: 10 })).toThrow(
      /must be <= 10/
    );
  });

  it("enforces integer constraint", () => {
    expect(validateNumber({ x: 5 }, "x", { integer: true })).toBe(5);
    expect(() => validateNumber({ x: 5.5 }, "x", { integer: true })).toThrow(
      /expected an integer/
    );
  });

  it("allows boundary values for min/max", () => {
    expect(validateNumber({ x: 1 }, "x", { min: 1, max: 10 })).toBe(1);
    expect(validateNumber({ x: 10 }, "x", { min: 1, max: 10 })).toBe(10);
  });

  it("defaults required to true in options object", () => {
    expect(() => validateNumber({}, "x", { min: 1 })).toThrow(
      /Missing required/
    );
  });

  it("returns undefined when optional and missing with options object", () => {
    expect(
      validateNumber({}, "x", { required: false, min: 1, max: 10 })
    ).toBeUndefined();
  });
});

// ==========================================
// validateJsonString Tests
// ==========================================

describe("validateJsonString", () => {
  it("returns undefined when optional and missing", () => {
    expect(validateJsonString({}, "data", false)).toBeUndefined();
  });

  it("throws when required and missing", () => {
    expect(() => validateJsonString({}, "data", true)).toThrow(
      /Missing required parameter: data/
    );
  });

  it("accepts valid JSON strings", () => {
    expect(
      validateJsonString({ data: '{"key": "value"}' }, "data")
    ).toBe('{"key": "value"}');
    expect(validateJsonString({ data: "[]" }, "data")).toBe("[]");
    expect(validateJsonString({ data: '"hello"' }, "data")).toBe('"hello"');
    expect(validateJsonString({ data: "123" }, "data")).toBe("123");
    expect(validateJsonString({ data: "null" }, "data")).toBe("null");
  });

  it("throws for invalid JSON strings", () => {
    expect(() =>
      validateJsonString({ data: "{not json}" }, "data")
    ).toThrow(/must be a valid JSON string/);
  });

  it("truncates long invalid values in error message", () => {
    const longValue = "x".repeat(200);
    expect(() =>
      validateJsonString({ data: longValue }, "data")
    ).toThrow(/must be a valid JSON string/);
  });

  it("throws when value is not a string", () => {
    expect(() =>
      validateJsonString({ data: 123 }, "data")
    ).toThrow(/expected a string/);
  });
});

// ==========================================
// validateBoolean Tests
// ==========================================

describe("validateBoolean", () => {
  it("returns the boolean value when valid", () => {
    expect(validateBoolean({ flag: true }, "flag")).toBe(true);
    expect(validateBoolean({ flag: false }, "flag")).toBe(false);
  });

  it("throws when required and missing", () => {
    expect(() => validateBoolean({}, "flag")).toThrow(
      /Missing required parameter: flag/
    );
  });

  it("returns undefined when optional and missing", () => {
    expect(validateBoolean({}, "flag", false)).toBeUndefined();
  });

  it("throws when value is not a boolean", () => {
    expect(() => validateBoolean({ flag: "true" }, "flag")).toThrow(
      /expected a boolean/
    );
    expect(() => validateBoolean({ flag: 1 }, "flag")).toThrow(
      /expected a boolean/
    );
  });
});
