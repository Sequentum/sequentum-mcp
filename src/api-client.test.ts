import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SequentumApiClient } from "./api-client.js";

describe("SequentumApiClient", () => {
  let client: SequentumApiClient;
  const mockBaseUrl = "https://api.example.com";
  const mockApiKey = "sk-test-key-123";

  beforeEach(() => {
    client = new SequentumApiClient(mockBaseUrl, mockApiKey);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should remove trailing slash from baseUrl", () => {
      const clientWithSlash = new SequentumApiClient(
        "https://api.example.com/",
        mockApiKey
      );
      // Access private property for testing
      expect((clientWithSlash as any).baseUrl).toBe("https://api.example.com");
    });

    it("should store the API key", () => {
      expect((client as any).apiKey).toBe(mockApiKey);
    });

    it("should use default timeout of 30000ms", () => {
      expect((client as any).requestTimeoutMs).toBe(30000);
    });

    it("should accept custom timeout", () => {
      const customClient = new SequentumApiClient(mockBaseUrl, mockApiKey, 60000);
      expect((customClient as any).requestTimeoutMs).toBe(60000);
    });
  });

  describe("getAllAgents", () => {
    it("should fetch all agents with correct headers", async () => {
      const mockAgents = [
        { id: 1, name: "Agent 1" },
        { id: 2, name: "Agent 2" },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockAgents,
      } as Response);

      const result = await client.getAllAgents();

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/all",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "ApiKey sk-test-key-123",
            "Content-Type": "application/json",
          }),
        })
      );
      expect(result).toEqual(mockAgents);
    });

    it("should throw error on API failure", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => '{"message": "Invalid API key"}',
      } as Response);

      await expect(client.getAllAgents()).rejects.toThrow("Invalid API key");
    });

    it("should handle empty response", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      const result = await client.getAllAgents();
      expect(result).toEqual([]);
    });

    it("should include status filter in query params", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getAllAgents({ status: 1 }); // Active = 1

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/all?status=1",
        expect.any(Object)
      );
    });

    it("should include spaceId filter in query params", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getAllAgents({ spaceId: 42 });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/all?spaceId=42",
        expect.any(Object)
      );
    });

    it("should include search filter in query params (mapped to name)", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getAllAgents({ search: "test agent" });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/all?name=test+agent",
        expect.any(Object)
      );
    });

    it("should include configType filter in query params", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getAllAgents({ configType: "Agent" as any });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/all?configType=Agent",
        expect.any(Object)
      );
    });

    it("should include multiple filters in query params", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getAllAgents({ status: 1, spaceId: 10, search: "bot" });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/all?status=1&spaceId=10&name=bot",
        expect.any(Object)
      );
    });

    it("should include sortColumn in query params", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getAllAgents({ sortColumn: "name" });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/all?sortColumn=name",
        expect.any(Object)
      );
    });

    it("should include sortOrder in query params (numeric)", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getAllAgents({ sortOrder: 1 }); // 1 = descending

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/all?sortOrder=1",
        expect.any(Object)
      );
    });

    it("should include pageIndex in query params", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getAllAgents({ pageIndex: 2 });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/all?pageIndex=2",
        expect.any(Object)
      );
    });

    it("should include recordsPerPage in query params", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getAllAgents({ recordsPerPage: 25 });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/all?recordsPerPage=25",
        expect.any(Object)
      );
    });

    it("should include sorting and pagination together", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getAllAgents({ sortColumn: "lastActivity", sortOrder: 1, pageIndex: 1, recordsPerPage: 50 });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/all?sortColumn=lastActivity&sortOrder=1&pageIndex=1&recordsPerPage=50",
        expect.any(Object)
      );
    });

    it("should include all filters with sorting and pagination", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getAllAgents({
        status: 1,
        spaceId: 5,
        search: "test",
        configType: "Agent" as any,
        sortColumn: "name",
        sortOrder: 0, // 0 = ascending
        pageIndex: 1,
        recordsPerPage: 20
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/all?status=1&spaceId=5&name=test&configType=Agent&sortColumn=name&sortOrder=0&pageIndex=1&recordsPerPage=20",
        expect.any(Object)
      );
    });
  });

  describe("getAgent", () => {
    it("should fetch specific agent by ID", async () => {
      const mockAgent = { id: 42, name: "Test Agent", description: "Test" };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockAgent,
      } as Response);

      const result = await client.getAgent(42);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42",
        expect.any(Object)
      );
      expect(result).toEqual(mockAgent);
    });

    it("should handle 404 not found", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "",
      } as Response);

      await expect(client.getAgent(999)).rejects.toThrow(
        "API Error 404: Not Found"
      );
    });
  });

  describe("getAgentRuns", () => {
    it("should fetch runs without query params by default", async () => {
      const mockRuns = [{ id: 1, status: "Completed" }];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockRuns,
      } as Response);

      await client.getAgentRuns(42);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/runs",
        expect.any(Object)
      );
    });

    it("should include maxRecords query parameter when provided", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getAgentRuns(42, 100);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/runs?maxRecords=100",
        expect.any(Object)
      );
    });
  });

  describe("startAgent", () => {
    it("should start agent with default parameters", async () => {
      const mockRun = { id: 123, status: "Queuing" };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockRun,
      } as Response);

      const result = await client.startAgent(42, {});

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/start",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            Parallelism: 1,
            ParallelMaxConcurrency: 1,
            ParallelExport: "Combined",
            ProxyPoolId: undefined,
            InputParameters: undefined,
            Timeout: 60,
            IsExclusive: true,
            IsWaitOnFailure: false,
            IsRunSynchronously: false,
            LogLevel: "Info",
            LogMode: "Text",
          }),
        })
      );
      expect(result).toEqual(mockRun);
    });

    it("should start agent with custom parallelism", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ id: 123 }),
      } as Response);

      await client.startAgent(42, { parallelism: 5 });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"Parallelism":5'),
        })
      );
    });

    it("should start agent in synchronous mode with timeout", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => '{"data": "scraped results"}',
      } as Response);

      await client.startAgent(42, {
        isRunSynchronously: true,
        timeout: 120,
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"IsRunSynchronously":true'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"Timeout":120'),
        })
      );
    });

    it("should include input parameters when provided", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ id: 123 }),
      } as Response);

      const inputParams = '{"url": "https://example.com"}';
      await client.startAgent(42, { inputParameters: inputParams });

      // InputParameters is sent as a string value within JSON, so it gets escaped
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"InputParameters":"{\\"url\\": \\"https://example.com\\"}"'),
        })
      );
    });
  });

  describe("stopAgent", () => {
    it("should stop agent run with POST request", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await client.stopAgent(42, 123);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/run/123/stop",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("should handle unauthorized error when stopping", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => '{"message": "No run access"}',
      } as Response);

      await expect(client.stopAgent(42, 123)).rejects.toThrow("No run access");
    });
  });

  describe("getRunFiles", () => {
    it("should fetch run files", async () => {
      const mockFiles = [
        { id: 1, name: "output.csv", fileType: "csv", fileSize: 1024 },
        { id: 2, name: "output.json", fileType: "json", fileSize: 2048 },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockFiles,
      } as Response);

      const result = await client.getRunFiles(42, 123);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/run/123/files",
        expect.any(Object)
      );
      expect(result).toEqual(mockFiles);
    });
  });

  describe("downloadRunFile", () => {
    it("should return redirect URL for file download", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        redirected: true,
        url: "https://storage.example.com/file.csv?token=abc",
        headers: new Headers({ "content-type": "application/json" }),
      } as Response);

      const result = await client.downloadRunFile(42, 123, 456);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/run/123/file/456/download",
        expect.any(Object)
      );
      expect(result).toEqual({
        redirectUrl: "https://storage.example.com/file.csv?token=abc",
      });
    });
  });

  describe("getAgentVersions", () => {
    it("should fetch agent versions", async () => {
      const mockVersions = [
        { version: 3, userName: "user1", created: "2024-01-03" },
        { version: 2, userName: "user1", created: "2024-01-02" },
        { version: 1, userName: "user1", created: "2024-01-01" },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockVersions,
      } as Response);

      const result = await client.getAgentVersions(42);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/versions",
        expect.any(Object)
      );
      expect(result).toEqual(mockVersions);
    });
  });

  describe("restoreAgentVersion", () => {
    it("should restore agent to previous version", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await client.restoreAgentVersion(42, 2, "Restoring to stable version");

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/version/2/restore",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ content: "Restoring to stable version" }),
        })
      );
    });
  });

  describe("error handling", () => {
    it("should handle network errors", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

      await expect(client.getAllAgents()).rejects.toThrow("Network error");
    });

    it("should handle JSON parse errors in error response", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Not valid JSON",
      } as Response);

      await expect(client.getAllAgents()).rejects.toThrow("Not valid JSON");
    });

    it("should use default error message when error body is empty", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "",
      } as Response);

      await expect(client.getAllAgents()).rejects.toThrow(
        "API Error 500: Internal Server Error"
      );
    });

    it("should handle text response when content-type is not JSON", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/plain" }),
        text: async () => "Plain text response",
      } as Response);

      const result = await client.getAllAgents();
      expect(result).toBe("Plain text response");
    });
  });

  describe("timeout handling", () => {
    it("should throw timeout error when request is aborted", async () => {
      // Create client with very short timeout
      const quickClient = new SequentumApiClient(mockBaseUrl, mockApiKey, 10);

      // Mock fetch to simulate abort
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      vi.mocked(fetch).mockRejectedValueOnce(abortError);

      await expect(quickClient.getAllAgents()).rejects.toThrow(
        /Request timeout after 10ms/
      );
    });

    it("should include endpoint in timeout error message", async () => {
      const quickClient = new SequentumApiClient(mockBaseUrl, mockApiKey, 5);

      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      vi.mocked(fetch).mockRejectedValueOnce(abortError);

      await expect(quickClient.getAgent(42)).rejects.toThrow(
        "Request timeout after 5ms: /api/v1/agent/42"
      );
    });

    it("should pass AbortSignal to fetch", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getAllAgents();

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  // ==========================================
  // Schedule Operations Tests
  // ==========================================

  describe("getAgentSchedules", () => {
    it("should fetch schedules for an agent", async () => {
      const mockSchedules = [
        { id: 1, name: "Daily Run", cronExpression: "0 9 * * *", isEnabled: true },
        { id: 2, name: "Weekly Run", cronExpression: "0 9 * * 1", isEnabled: false },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSchedules,
      } as Response);

      const result = await client.getAgentSchedules(42);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/schedules",
        expect.any(Object)
      );
      expect(result).toEqual(mockSchedules);
    });
  });

  describe("createAgentSchedule", () => {
    it("should create a schedule with required parameters", async () => {
      const mockSchedule = { id: 1, name: "New Schedule", cronExpression: "0 9 * * *" };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSchedule,
      } as Response);

      const result = await client.createAgentSchedule(42, {
        name: "New Schedule",
        cronExpression: "0 9 * * *",
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/schedules",
        expect.objectContaining({
          method: "POST",
        })
      );
      // Verify required fields are in the body
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"Name":"New Schedule"'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"CronExpression":"0 9 * * *"'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"IsEnabled":true'),
        })
      );
      expect(result).toEqual(mockSchedule);
    });

    it("should create a schedule with all parameters", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ id: 1 }),
      } as Response);

      await client.createAgentSchedule(42, {
        name: "Full Schedule",
        cronExpression: "0 9 * * 1,4",
        timezone: "America/New_York",
        inputParameters: '{"key": "value"}',
        isEnabled: false,
        scheduleType: 3,
      });

      // Verify all provided fields are in the body
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"Name":"Full Schedule"'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"ScheduleType":3'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"CronExpression":"0 9 * * 1,4"'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"Timezone":"America/New_York"'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"IsEnabled":false'),
        })
      );
    });

    it("should create a RunOnce schedule (scheduleType=1)", async () => {
      const mockSchedule = { id: 1, name: "One Time Run", scheduleType: 1 };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSchedule,
      } as Response);

      const result = await client.createAgentSchedule(42, {
        name: "One Time Run",
        scheduleType: 1,
        startTime: "2026-01-20T14:30:00Z",
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/schedules",
        expect.objectContaining({
          method: "POST",
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"Name":"One Time Run"'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"ScheduleType":1'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"StartTime":"2026-01-20T14:30:00Z"'),
        })
      );
      expect(result).toEqual(mockSchedule);
    });

    it("should create a RunEvery schedule (scheduleType=2) with interval", async () => {
      const mockSchedule = { id: 1, name: "Every 6 Hours", scheduleType: 2, runEveryCount: 6, runEveryPeriod: 1 };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSchedule,
      } as Response);

      const result = await client.createAgentSchedule(42, {
        name: "Every 6 Hours",
        scheduleType: 2,
        runEveryCount: 6,
        runEveryPeriod: 1, // hours
        timezone: "America/Santiago",
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/schedules",
        expect.objectContaining({
          method: "POST",
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"Name":"Every 6 Hours"'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"ScheduleType":2'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"RunEveryCount":6'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"RunEveryPeriod":1'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"Timezone":"America/Santiago"'),
        })
      );
      expect(result).toEqual(mockSchedule);
    });

    it("should create a RunEvery schedule with different period units", async () => {
      // Test every 2 weeks
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ id: 1 }),
      } as Response);

      await client.createAgentSchedule(42, {
        name: "Every 2 Weeks",
        scheduleType: 2,
        runEveryCount: 2,
        runEveryPeriod: 3, // weeks
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"ScheduleType":2'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"RunEveryCount":2'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"RunEveryPeriod":3'),
        })
      );
    });

    it("should create a CRON schedule (scheduleType=3) with cron expression", async () => {
      const mockSchedule = { id: 1, name: "Daily at 9am", scheduleType: 3, cronExpression: "0 9 * * *" };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSchedule,
      } as Response);

      const result = await client.createAgentSchedule(42, {
        name: "Daily at 9am",
        scheduleType: 3,
        cronExpression: "0 9 * * *",
        timezone: "UTC",
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/schedules",
        expect.objectContaining({
          method: "POST",
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"Name":"Daily at 9am"'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"ScheduleType":3'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"CronExpression":"0 9 * * *"'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"Timezone":"UTC"'),
        })
      );
      expect(result).toEqual(mockSchedule);
    });

    it("should include startTime for RunOnce schedule", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ id: 1 }),
      } as Response);

      await client.createAgentSchedule(42, {
        name: "Scheduled Run",
        scheduleType: 1,
        startTime: "2026-02-15T10:00:00Z",
        timezone: "America/New_York",
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"StartTime":"2026-02-15T10:00:00Z"'),
        })
      );
    });

    it("should include optional startTime for RunEvery schedule", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ id: 1 }),
      } as Response);

      await client.createAgentSchedule(42, {
        name: "Every 30 Minutes",
        scheduleType: 2,
        runEveryCount: 30,
        runEveryPeriod: 0, // minutes
        startTime: "2026-01-17T10:00:00Z",
        timezone: "America/Denver",
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"StartTime":"2026-01-17T10:00:00Z"'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"RunEveryCount":30'),
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"RunEveryPeriod":0'),
        })
      );
    });
  });

  describe("deleteAgentSchedule", () => {
    it("should delete a schedule", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await client.deleteAgentSchedule(42, 123);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/agent/42/schedules/123",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("getUpcomingSchedules", () => {
    it("should fetch upcoming schedules without date filters", async () => {
      const mockSchedules = [
        { agentId: 1, nextRun: "2024-01-15T09:00:00Z" },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSchedules,
      } as Response);

      const result = await client.getUpcomingSchedules();

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/analytics/schedules/upcoming",
        expect.any(Object)
      );
      expect(result).toEqual(mockSchedules);
    });

    it("should include date filters when provided", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      } as Response);

      await client.getUpcomingSchedules("2024-01-01", "2024-01-31");

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/analytics/schedules/upcoming?startDate=2024-01-01&endDate=2024-01-31",
        expect.any(Object)
      );
    });
  });

  // ==========================================
  // Billing/Credits Operations Tests
  // ==========================================

  describe("getCreditsBalance", () => {
    it("should fetch credits balance", async () => {
      const mockBalance = { available: 10000, used: 2500, total: 12500 };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockBalance,
      } as Response);

      const result = await client.getCreditsBalance();

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/billing/credits",
        expect.any(Object)
      );
      expect(result).toEqual(mockBalance);
    });
  });

  describe("getSpendingSummary", () => {
    it("should fetch spending summary without date filters", async () => {
      const mockSummary = { totalSpent: 1500, periodStart: "2024-01-01" };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSummary,
      } as Response);

      const result = await client.getSpendingSummary();

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/billing/spending",
        expect.any(Object)
      );
      expect(result).toEqual(mockSummary);
    });

    it("should include date filters when provided", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ totalSpent: 500 }),
      } as Response);

      await client.getSpendingSummary("2024-01-01", "2024-01-07");

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/billing/spending?startDate=2024-01-01&endDate=2024-01-07",
        expect.any(Object)
      );
    });
  });

  // ==========================================
  // Space Operations Tests
  // ==========================================

  describe("getAllSpaces", () => {
    it("should fetch all spaces", async () => {
      const mockSpaces = [
        { id: 1, name: "Production" },
        { id: 2, name: "Development" },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSpaces,
      } as Response);

      const result = await client.getAllSpaces();

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/spaces",
        expect.any(Object)
      );
      expect(result).toEqual(mockSpaces);
    });
  });

  describe("getSpaceAgents", () => {
    it("should fetch agents in a space", async () => {
      const mockAgents = [
        { id: 1, name: "Agent 1", spaceId: 5 },
        { id: 2, name: "Agent 2", spaceId: 5 },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockAgents,
      } as Response);

      const result = await client.getSpaceAgents(5);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/spaces/5/agents",
        expect.any(Object)
      );
      expect(result).toEqual(mockAgents);
    });
  });

  describe("searchSpaceByName", () => {
    it("should search for a space by name", async () => {
      const mockSpace = { id: 3, name: "Bot Blocking" };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSpace,
      } as Response);

      const result = await client.searchSpaceByName("Bot Blocking");

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/spaces/search?name=Bot%20Blocking",
        expect.any(Object)
      );
      expect(result).toEqual(mockSpace);
    });

    it("should encode special characters in space name", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ id: 1 }),
      } as Response);

      await client.searchSpaceByName("Test & Demo");

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/spaces/search?name=Test%20%26%20Demo",
        expect.any(Object)
      );
    });
  });

  describe("runSpaceAgents", () => {
    it("should run all agents in a space", async () => {
      const mockResult = { startedAgents: 5, failedAgents: 0 };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockResult,
      } as Response);

      const result = await client.runSpaceAgents(5);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/spaces/5/run-all",
        expect.objectContaining({
          method: "POST",
        })
      );
      expect(result).toEqual(mockResult);
    });

    it("should pass input parameters when provided", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ startedAgents: 3 }),
      } as Response);

      await client.runSpaceAgents(5, '{"url": "https://example.com"}');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ InputParameters: '{"url": "https://example.com"}' }),
        })
      );
    });
  });

  // ==========================================
  // Analytics Operations Tests
  // ==========================================

  describe("getRunsSummary", () => {
    it("should fetch runs summary without filters", async () => {
      const mockSummary = { total: 100, completed: 95, failed: 5 };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSummary,
      } as Response);

      const result = await client.getRunsSummary();

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/analytics/runs/summary",
        expect.any(Object)
      );
      expect(result).toEqual(mockSummary);
    });

    it("should include all filters when provided", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ total: 10 }),
      } as Response);

      await client.getRunsSummary("2024-01-01", "2024-01-31", "Failed", true);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/analytics/runs/summary?startDate=2024-01-01&endDate=2024-01-31&status=Failed&includeDetails=true",
        expect.any(Object)
      );
    });
  });

  describe("getRecordsSummary", () => {
    it("should fetch records summary without filters", async () => {
      const mockSummary = { totalRecords: 50000, exported: 48000 };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockSummary,
      } as Response);

      const result = await client.getRecordsSummary();

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/analytics/records/summary",
        expect.any(Object)
      );
      expect(result).toEqual(mockSummary);
    });

    it("should include date and agent filters when provided", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ totalRecords: 1000 }),
      } as Response);

      await client.getRecordsSummary("2024-01-01", "2024-01-31", 42);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/analytics/records/summary?startDate=2024-01-01&endDate=2024-01-31&agentId=42",
        expect.any(Object)
      );
    });
  });

  describe("getRunDiagnostics", () => {
    it("should fetch run diagnostics", async () => {
      const mockDiagnostics = {
        runId: 123,
        agentId: 42,
        errorMessage: "Connection timeout",
        logs: ["Starting...", "Error occurred"],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockDiagnostics,
      } as Response);

      const result = await client.getRunDiagnostics(42, 123);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/analytics/agents/42/runs/123/diagnostics",
        expect.any(Object)
      );
      expect(result).toEqual(mockDiagnostics);
    });
  });

  describe("getLatestFailure", () => {
    it("should fetch latest failure for an agent", async () => {
      const mockFailure = {
        runId: 456,
        agentId: 42,
        status: "Failed",
        errorMessage: "Rate limited",
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockFailure,
      } as Response);

      const result = await client.getLatestFailure(42);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.example.com/api/v1/analytics/agents/42/latest-failure",
        expect.any(Object)
      );
      expect(result).toEqual(mockFailure);
    });

    it("should handle 404 when no failures exist", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => '{"message": "No failures found for this agent"}',
      } as Response);

      await expect(client.getLatestFailure(42)).rejects.toThrow(
        "No failures found for this agent"
      );
    });
  });
});
