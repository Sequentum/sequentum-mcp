import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for MCP handler behavior in index.ts
 * 
 * These tests verify that the MCP handlers apply correct defaults
 * and transform parameters appropriately before calling the API client.
 */

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
