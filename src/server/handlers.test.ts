import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMcpServer,
  formatToolError,
  isPaginatedResponse,
  parseScheduleParams,
  validateScheduleStartTime,
  AGENT_BUILD_ERROR_MESSAGE,
} from "./handlers.js";
import { tools } from "./tools.js";
import { resources, resourceTemplates } from "./resources.js";
import { getPromptMessages, prompts } from "./prompts.js";
import { PRE_CALL_CHECK, PROMPT_HANDLING_POLICY, SUFFICIENCY_POLICY, SUFFICIENCY_REQUIREMENTS } from "./policies.js";
import {
  ApiRequestError,
  AuthenticationError,
  RateLimitError,
} from "../api/types.js";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { SequentumApiClient } from "../api/api-client.js";
import { toolDispatch } from "./tools/index.js";

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

// ==========================================
// Tool Annotation Regression Tests
// ==========================================

describe("tool annotations", () => {
  it("every tool has a non-empty title", () => {
    for (const tool of tools) {
      expect(
        tool.annotations?.title,
        `Tool "${tool.name}" is missing annotations.title`
      ).toBeTruthy();
    }
  });

  it("every tool has readOnlyHint defined", () => {
    for (const tool of tools) {
      expect(
        tool.annotations?.readOnlyHint,
        `Tool "${tool.name}" is missing annotations.readOnlyHint`
      ).toBeDefined();
    }
  });

  it("every read-only tool has destructiveHint: false and openWorldHint: false", () => {
    const readOnlyTools = tools.filter((t) => t.annotations?.readOnlyHint === true);
    for (const tool of readOnlyTools) {
      expect(
        tool.annotations?.destructiveHint,
        `Read-only tool "${tool.name}" is missing annotations.destructiveHint`
      ).toBe(false);
      expect(
        tool.annotations?.openWorldHint,
        `Read-only tool "${tool.name}" is missing annotations.openWorldHint`
      ).toBe(false);
    }
  });

  // Per-tool expectation tables.  Each entry documents intent and acts as a
  // regression guard — changing a value here requires a deliberate edit.
  //
  // openWorldHint: true  → tool can write to arbitrary URLs/files/resources
  //                        (open-world: scrapes the external web)
  // openWorldHint: false → tool only mutates Sequentum's own account state
  //                        (closed-world: bounded to our API)
  //
  // See MCP Apps SDK guidance (search "openWorldHint"):
  // https://developers.openai.com/apps-sdk/build/mcp-server
  const expectedOpenWorldHint: Record<string, boolean> = {
    // Open-world: run/build agents that scrape arbitrary user-supplied URLs.
    start_agent:       true,
    start_agent_build: true,
    run_space_agents:  true,
    // Closed-world: mutate Sequentum's internal state only.
    stop_agent:             false,
    kill_agent:             false,
    delete_run:             false,
    restore_agent_version:  false,
    create_agent_schedule:  false,
    update_agent_schedule:  false,
    enable_agent_schedule:  false,
    disable_agent_schedule: false,
    delete_agent_schedule:  false,
    stop_agent_build:       false,
  };

  // destructiveHint: true  → can delete, overwrite, or have irreversible side effects
  // destructiveHint: false → reversible / additive action
  const expectedDestructiveHint: Record<string, boolean> = {
    kill_agent:             true,
    delete_run:             true,
    delete_agent_schedule:  true,
    start_agent:            false,
    stop_agent:             false,
    restore_agent_version:  false,
    create_agent_schedule:  false,
    update_agent_schedule:  false,
    enable_agent_schedule:  false,
    disable_agent_schedule: false,
    run_space_agents:       false,
    start_agent_build:      false,
    stop_agent_build:       false,
  };

  function assertPerToolAnnotation(
    annotationName: string,
    expected: Record<string, boolean>,
    getValue: (tool: (typeof tools)[number]) => boolean | undefined,
  ) {
    const writeTools = tools.filter((t) => t.annotations?.readOnlyHint === false);

    // Every write tool must appear in the table (catches new tools that were
    // added without a classification decision).
    for (const tool of writeTools) {
      expect(
        Object.prototype.hasOwnProperty.call(expected, tool.name),
        `Write tool "${tool.name}" is not in expected${annotationName} — add it ` +
          `with the correct value and a comment explaining the choice.`,
      ).toBe(true);

      expect(
        getValue(tool),
        `Write tool "${tool.name}": ${annotationName} should be ` +
          `${expected[tool.name]} but got ${getValue(tool)}.`,
      ).toBe(expected[tool.name]);
    }

    // The table must not reference tools that no longer exist (catches renames
    // or deletions that left stale entries).
    for (const name of Object.keys(expected)) {
      expect(
        writeTools.some((t) => t.name === name),
        `expected${annotationName} references "${name}" but no write tool ` +
          `by that name exists — remove the stale entry.`,
      ).toBe(true);
    }
  }

  it("every write tool has the correct openWorldHint value", () => {
    assertPerToolAnnotation(
      "OpenWorldHint",
      expectedOpenWorldHint,
      (t) => t.annotations?.openWorldHint,
    );
  });

  it("every write tool has the correct destructiveHint value", () => {
    assertPerToolAnnotation(
      "DestructiveHint",
      expectedDestructiveHint,
      (t) => t.annotations?.destructiveHint,
    );
  });
});

// ==========================================
// Agent Builder Handler Dispatch Tests
// ==========================================

function makeMinimalMockClient(overrides: Partial<SequentumApiClient> = {}): SequentumApiClient {
  return {
    startAgentBuild: vi.fn(),
    getAgentBuildStatus: vi.fn(),
    stopAgentBuild: vi.fn(),
    ...overrides,
  } as unknown as SequentumApiClient;
}

describe("agent builder handler dispatch", () => {
  let client: Client;
  let mockApiClient: SequentumApiClient;

  beforeEach(async () => {
    mockApiClient = makeMinimalMockClient();
    const server = createMcpServer(mockApiClient, "test");
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "1.0" });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
  });

  describe("start_agent_build", () => {
    it("rejects a prompt shorter than 10 characters", async () => {
      const result = await client.callTool({
        name: "start_agent_build",
        arguments: { prompt: "short" },
      });
      expect(result.isError).toBe(true);
      // SDK v2 validates arguments against the tool's inputSchema before the
      // handler runs, so a too-short prompt is rejected by the schema's
      // minLength rather than by the handler's own guard. The handler guard
      // still stands as defence in depth for callers that bypass the schema.
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Input validation error");
      expect(text).toMatch(/fewer than 10 characters/i);
    });

    it("waitForCompletion=true (default): polls internally and returns agentId on success", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-sync-1" });
        vi.mocked(mockApiClient.getAgentBuildStatus)
          .mockResolvedValueOnce({ status: "processing" } as Awaited<ReturnType<SequentumApiClient["getAgentBuildStatus"]>>)
          .mockResolvedValueOnce({ status: "completed", agentId: 42, agentName: "Test Agent" } as Awaited<ReturnType<SequentumApiClient["getAgentBuildStatus"]>>);

        const resultPromise = client.callTool({
          name: "start_agent_build",
          arguments: { prompt: "scrape product names from https://example.com/shop" },
        });

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.agentId).toBe(42);
        expect(parsed.agentName).toBe("Test Agent");
        expect(parsed.status).toBe("completed");
        expect(parsed.sessionId).toBe("sess-sync-1");
        expect(vi.mocked(mockApiClient.getAgentBuildStatus)).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("waitForCompletion=true: sanitizes raw backend error and returns isError", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-sync-err" });
        vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValueOnce({
          status: "error",
          error: "NullReferenceException at AgentBuilder.cs:99",
          agentId: null,
          agentName: null,
        } as unknown as Awaited<ReturnType<SequentumApiClient["getAgentBuildStatus"]>>);

        const resultPromise = client.callTool({
          name: "start_agent_build",
          arguments: { prompt: "scrape product names from https://example.com/shop" },
        });

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toBe(AGENT_BUILD_ERROR_MESSAGE);
        expect(text).not.toContain("NullReferenceException");
      } finally {
        vi.useRealTimers();
      }
    });

    it("waitForCompletion=false: returns sessionId immediately without polling", async () => {
      vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-async-1" });

      const result = await client.callTool({
        name: "start_agent_build",
        arguments: {
          prompt: "scrape product names from https://example.com/shop",
          waitForCompletion: false,
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.sessionId).toBe("sess-async-1");
      expect(vi.mocked(mockApiClient.getAgentBuildStatus)).not.toHaveBeenCalled();
    });

    it("waitForCompletion=true: returns isError with sessionId on cancelled status", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-cancel-1" });
        vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValueOnce({
          status: "cancelled",
        } as Awaited<ReturnType<SequentumApiClient["getAgentBuildStatus"]>>);

        const resultPromise = client.callTool({
          name: "start_agent_build",
          arguments: { prompt: "scrape product names from https://example.com/shop" },
        });

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.status).toBe("cancelled");
        expect(parsed.sessionId).toBe("sess-cancel-1");
      } finally {
        vi.useRealTimers();
      }
    });

    it("emits a progress notification with sessionId immediately after build starts", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-progress-1" });
        vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValueOnce({
          status: "completed",
          agentId: 7,
          agentName: "Progress Agent",
        } as Awaited<ReturnType<SequentumApiClient["getAgentBuildStatus"]>>);

        const progressMessages: string[] = [];

        const resultPromise = client.callTool(
          {
            name: "start_agent_build",
            arguments: { prompt: "scrape product names from https://example.com/shop" },
          },
          {
            onprogress: (p) => {
              if (p.message) progressMessages.push(p.message);
            },
          }
        );

        await vi.runAllTimersAsync();
        await resultPromise;

        // The first notification should include the sessionId so the caller knows it immediately.
        expect(progressMessages.length).toBeGreaterThanOrEqual(1);
        expect(progressMessages[0]).toContain("sess-progress-1");
      } finally {
        vi.useRealTimers();
      }
    });

    it("waitForCompletion=true: timeout does NOT set isError (build still running)", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-timeout-1" });
        // Always return "processing" so the loop never exits via a terminal status.
        vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValue({
          status: "processing",
        } as Awaited<ReturnType<SequentumApiClient["getAgentBuildStatus"]>>);

        // Extend the SDK client timeout past the server's 5-minute max-wait so it doesn't
        // fire before the server exits the loop. resetTimeoutOnProgress keeps it alive while
        // progress notifications are flowing.
        const resultPromise = client.callTool(
          {
            name: "start_agent_build",
            arguments: { prompt: "scrape product names from https://example.com/shop" },
          },
          { timeout: 310_000, resetTimeoutOnProgress: true }
        );

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // The build is left running — isError must be falsy (not a failure, just stopped waiting).
        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.status).toBe("timeout");
        expect(parsed.sessionId).toBe("sess-timeout-1");
        expect(parsed.message).toContain("get_agent_build_status");
        expect(parsed.message).toContain("still running");
      } finally {
        vi.useRealTimers();
      }
    });

    it("waitForCompletion=true: returns completed shape when status is 'ready'", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-ready-1" });
        vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValueOnce({
          status: "ready",
          agentId: 99,
          agentName: "Ready Agent",
        } as Awaited<ReturnType<SequentumApiClient["getAgentBuildStatus"]>>);

        const resultPromise = client.callTool({
          name: "start_agent_build",
          arguments: { prompt: "scrape product names from https://example.com/shop" },
        });

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.status).toBe("ready");
        expect(parsed.agentId).toBe(99);
        expect(parsed.agentName).toBe("Ready Agent");
        expect(parsed.sessionId).toBe("sess-ready-1");
      } finally {
        vi.useRealTimers();
      }
    });

    it("waitForCompletion=true: calls stopAgentBuild when MCP client cancels (signal aborted)", async () => {
      vi.useFakeTimers();
      try {
        // Use a separate server/client pair to avoid polluting the shared test fixtures.
        const abortApiClient = makeMinimalMockClient({
          startAgentBuild: vi.fn().mockResolvedValue({ sessionId: "sess-abort-1" }),
          getAgentBuildStatus: vi.fn().mockResolvedValue({ status: "processing" }),
          stopAgentBuild: vi.fn().mockResolvedValue(undefined),
        });
        const abortServer = createMcpServer(abortApiClient, "test");
        const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
        await abortServer.connect(serverTransport);
        const abortMcpClient = new Client({ name: "abort-client", version: "1.0" });
        await abortMcpClient.connect(clientTransport);

        // Use a very short SDK timeout (50ms fake time). When it fires the SDK sends a
        // cancellation notification to the server, which aborts extra.signal.
        // The handler's 1s initial sleep is still pending; when it fires the abort check
        // at the top of the next loop iteration calls stopAgentBuild.
        const resultPromise = abortMcpClient
          .callTool(
            { name: "start_agent_build", arguments: { prompt: "scrape product names from https://example.com/shop" } },
            { timeout: 50 }
          )
          .catch(() => null); // client timeout is expected

        // Let the 50ms SDK timeout fire (cancels request on server → signal aborted),
        // then advance past the initial 1s sleep so the loop body runs and checks the signal.
        await vi.advanceTimersByTimeAsync(1_200);
        // Flush any queued microtasks so the cancellation notification is fully processed.
        await Promise.resolve();
        await Promise.resolve();
        await resultPromise;

        expect(vi.mocked(abortApiClient.stopAgentBuild)).toHaveBeenCalledWith("sess-abort-1");
      } finally {
        vi.useRealTimers();
      }
    });

    it("waitForCompletion=true: sendNotification failure does not crash the polling loop", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-notif-err" });
        // Return processing once then complete — we want to survive a notification failure
        // and still return the success result.
        vi.mocked(mockApiClient.getAgentBuildStatus)
          .mockResolvedValueOnce({ status: "processing" } as Awaited<ReturnType<SequentumApiClient["getAgentBuildStatus"]>>)
          .mockResolvedValueOnce({
            status: "completed",
            agentId: 55,
            agentName: "Resilient Agent",
          } as Awaited<ReturnType<SequentumApiClient["getAgentBuildStatus"]>>);

        // Track progress and force the notification to throw on the first call.
        let notifCallCount = 0;
        const resultPromise = client.callTool(
          {
            name: "start_agent_build",
            arguments: { prompt: "scrape product names from https://example.com/shop" },
          },
          {
            onprogress: () => {
              notifCallCount++;
              if (notifCallCount === 1) throw new Error("transport closed");
            },
          }
        );

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        // Despite the notification failure on the first progress, the tool should succeed.
        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse((result.content[0] as { text: string }).text);
        expect(parsed.agentId).toBe(55);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("get_agent_build_status", () => {
    it("replaces a raw backend error with a generic user-facing message", async () => {
      vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValueOnce({
        status: "error",
        error: "NullReferenceException at BuildOrchestrator.cs:42",
        agentId: null,
        agentName: null,
      } as unknown as Awaited<ReturnType<SequentumApiClient["getAgentBuildStatus"]>>);

      const result = await client.callTool({
        name: "get_agent_build_status",
        arguments: { sessionId: "sess-test-123" },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe(AGENT_BUILD_ERROR_MESSAGE);
      expect(parsed.error).not.toContain("NullReferenceException");
    });
  });

  describe("stop_agent_build", () => {
    it("returns parseable JSON with stopped:true and the correct sessionId", async () => {
      vi.mocked(mockApiClient.stopAgentBuild).mockResolvedValueOnce(
        undefined as unknown as Awaited<ReturnType<SequentumApiClient["stopAgentBuild"]>>
      );

      const result = await client.callTool({
        name: "stop_agent_build",
        arguments: { sessionId: "sess-stop-456" },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed).toEqual({ stopped: true, sessionId: "sess-stop-456" });
    });
  });
});

// ==========================================
// Tool Dispatch Map Tests
// ==========================================

describe("toolDispatch", () => {
  it("exposes a handler for every agent tool", () => {
    const expected = [
      "list_agents", "get_agent", "search_agents", "get_agent_runs", "get_run_status",
      "start_agent", "stop_agent", "kill_agent", "delete_run", "get_run_files",
      "get_file_download_url", "get_agent_versions", "restore_agent_version",
    ];
    for (const name of expected) {
      expect(typeof toolDispatch[name]).toBe("function");
    }
  });

  it("routes list_agents through the dispatch map with pagination defaults", async () => {
    const getAllAgents = vi.fn().mockResolvedValue([]);
    const apiClient = { getAllAgents } as unknown as SequentumApiClient;
    await toolDispatch.list_agents(
      {},
      { apiClient, sendProgress: async () => {}, signal: new AbortController().signal }
    );
    expect(getAllAgents).toHaveBeenCalledWith({ pageIndex: 1, recordsPerPage: 50 });
  });

  it("exposes a handler for every schedule, billing, and space tool", () => {
    const expected = [
      "list_agent_schedules", "create_agent_schedule", "delete_agent_schedule",
      "get_agent_schedule", "update_agent_schedule", "enable_agent_schedule",
      "disable_agent_schedule", "get_scheduled_runs",
      "get_credits_balance", "get_spending_summary", "get_credit_history",
      "get_agents_usage", "get_agent_cost_breakdown", "get_agent_runs_cost",
      "list_spaces", "get_space", "get_space_agents", "search_space_by_name",
      "run_space_agents",
    ];
    for (const name of expected) {
      expect(typeof toolDispatch[name]).toBe("function");
    }
  });
});

// ==========================================
// Tool Registration Invariants
// ==========================================

describe("tool registration invariants", () => {
  it("has a dispatch handler for every declared tool", () => {
    const missing = tools.filter((t) => typeof toolDispatch[t.name] !== "function").map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it("has no dispatch handler without a declared tool", () => {
    const declared = new Set(tools.map((t) => t.name));
    const orphans = Object.keys(toolDispatch).filter((n) => !declared.has(n));
    expect(orphans).toEqual([]);
  });

  it("declares a title and a read/destructive hint on every tool", () => {
    for (const t of tools) {
      expect(t.annotations?.title, `${t.name} is missing annotations.title`).toBeTruthy();
      const hasHint =
        t.annotations?.readOnlyHint === true || t.annotations?.destructiveHint !== undefined;
      expect(hasHint, `${t.name} declares neither readOnlyHint nor destructiveHint`).toBe(true);
    }
  });

  it("wires every tool to the handler function of the same name", () => {
    for (const t of tools) {
      const handler = toolDispatch[t.name];
      expect(
        handler?.name,
        `${t.name} is wired to a handler named "${handler?.name}" — check the barrel exports`
      ).toBe(t.name);
    }
  });
});

// ==========================================
// SDK v2 Registration Round-Trip
// ==========================================

describe("createMcpServer via SDK v2", () => {
  it("advertises all 39 tools in declaration order, with annotations intact", async () => {
    const apiClient = {} as unknown as SequentumApiClient;
    const server = createMcpServer(apiClient, "9.9.9");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const result = await client.listTools();
      expect(result.tools).toHaveLength(39);
      expect(result.tools.map((t) => t.name)).toEqual(tools.map((t) => t.name));

      // Annotations must survive registration — a hard directory review requirement.
      // Assert the whole set round-trips, not just one sample tool.
      for (const declared of tools) {
        const listed = result.tools.find((t) => t.name === declared.name)!;
        expect(listed.annotations, `${declared.name} lost its annotations`).toEqual(
          declared.annotations
        );
        expect(listed.description).toBe(declared.description);
        expect(listed.inputSchema).toEqual(declared.inputSchema);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("advertises a non-empty top-level title for every tool, alongside annotations.title", async () => {
    // 2026-07-28 reads the top-level `title`; legacy-era clients still read only
    // `annotations.title`. Both must be present so neither era loses the display name.
    const apiClient = {} as unknown as SequentumApiClient;
    const server = createMcpServer(apiClient, "9.9.9");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const result = await client.listTools();
      expect(result.tools).toHaveLength(39);
      for (const listed of result.tools) {
        expect(listed.title, `${listed.name} is missing a top-level title`).toBeTruthy();
        expect(
          listed.annotations?.title,
          `${listed.name} is missing annotations.title`
        ).toBeTruthy();
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("advertises every prompt with its declared arguments", async () => {
    const apiClient = {} as unknown as SequentumApiClient;
    const server = createMcpServer(apiClient, "9.9.9");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const listed = await client.listPrompts();
      expect(listed.prompts.map((p) => p.name).sort()).toEqual(
        prompts.map((p) => p.name).sort()
      );

      // debug-agent's argsSchema is built from its declared `arguments`, so the
      // required string argument must survive the fromJsonSchema round trip.
      const debugAgent = listed.prompts.find((p) => p.name === "debug-agent")!;
      expect(debugAgent.arguments).toEqual([
        expect.objectContaining({ name: "agentName", required: true }),
      ]);

      const rendered = await client.getPrompt({
        name: "debug-agent",
        arguments: { agentName: "Nightly Scraper" },
      });
      expect((rendered.messages[0].content as { text: string }).text).toContain(
        "Nightly Scraper"
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("lists and reads static resources and templated resources", async () => {
    const apiClient = {
      getAllSpaces: vi.fn().mockResolvedValue([{ id: 1, name: "Default" }]),
      getAgent: vi.fn().mockResolvedValue({ id: 7, name: "Agent Seven" }),
    } as unknown as SequentumApiClient;
    const server = createMcpServer(apiClient, "9.9.9");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      // Registration must not drop the descriptive fields — the whole
      // resources/list payload has to match what resources.ts declares.
      const byUri = <T extends { uri?: string; uriTemplate?: string }>(list: T[]) =>
        [...list].sort((a, b) =>
          (a.uri ?? a.uriTemplate!).localeCompare(b.uri ?? b.uriTemplate!)
        );
      const pick = (o: Record<string, unknown>, keys: string[]) =>
        Object.fromEntries(keys.map((k) => [k, o[k]]));
      const resourceKeys = ["uri", "name", "description", "mimeType"];
      const templateKeys = ["uriTemplate", "name", "description", "mimeType"];

      const listed = await client.listResources();
      expect(byUri(listed.resources).map((r) => pick(r, resourceKeys))).toEqual(
        byUri(resources).map((r) => pick(r, resourceKeys))
      );

      const listedTemplates = await client.listResourceTemplates();
      expect(
        byUri(listedTemplates.resourceTemplates).map((t) => pick(t, templateKeys))
      ).toEqual(byUri(resourceTemplates).map((t) => pick(t, templateKeys)));

      const spaces = await client.readResource({ uri: "sequentum://spaces" });
      expect(JSON.parse(spaces.contents[0].text as string)).toEqual([
        { id: 1, name: "Default" },
      ]);

      const agent = await client.readResource({ uri: "sequentum://agents/7" });
      expect(JSON.parse(agent.contents[0].text as string)).toEqual({
        id: 7,
        name: "Agent Seven",
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});

// ==========================================
// Policy Wiring Regression Tests
// ==========================================

describe("policy wiring", () => {
  it("server instructions equal SUFFICIENCY_POLICY", async () => {
    const mockApiClient = makeMinimalMockClient();
    const server = createMcpServer(mockApiClient, "test");
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const connectedClient = new Client({ name: "policy-test-client", version: "1.0" });
    await connectedClient.connect(clientTransport);
    try {
      expect(connectedClient.getInstructions()).toBe(SUFFICIENCY_POLICY);
    } finally {
      await connectedClient.close();
    }
  });

  it("start_agent_build description contains PROMPT_HANDLING_POLICY", () => {
    const tool = tools.find((t) => t.name === "start_agent_build");
    expect(tool, "start_agent_build tool not found").toBeDefined();
    expect(tool!.description).toContain(PROMPT_HANDLING_POLICY);
  });

  it("build-agent-from-prompt template embeds PROMPT_HANDLING_POLICY under a GUARDRAIL preamble before the numbered steps", () => {
    const messages = getPromptMessages("build-agent-from-prompt", {
      prompt: "scrape https://example.com/products for product names",
    });
    expect(messages.length).toBeGreaterThan(0);
    const text = (messages[0].content as { text: string }).text;

    const guardrailLine = `**GUARDRAIL:** ${PROMPT_HANDLING_POLICY}`;
    expect(text).toContain(guardrailLine);

    const guardrailIdx = text.indexOf(guardrailLine);
    const stepsIdx = text.indexOf("Follow these steps:");
    expect(guardrailIdx).toBeGreaterThanOrEqual(0);
    expect(stepsIdx).toBeGreaterThanOrEqual(0);
    expect(
      guardrailIdx,
      "GUARDRAIL preamble must appear before the numbered steps so the model treats it as a constraint, not trailing context"
    ).toBeLessThan(stepsIdx);
  });

  it("inspect-agent-draft template does NOT inject PROMPT_HANDLING_POLICY", () => {
    const messages = getPromptMessages("inspect-agent-draft", {
      sessionId: "sess-test-policy-leak",
    });
    expect(messages.length).toBeGreaterThan(0);
    const text = (messages[0].content as { text: string }).text;
    expect(
      text,
      "inspect-agent-draft does not call start_agent_build, so it should not carry the prompt-handling guardrail"
    ).not.toContain(PROMPT_HANDLING_POLICY);
  });
});

describe("PRE_CALL_CHECK", () => {
  it("derives both surfaces from the single SUFFICIENCY_REQUIREMENTS source", () => {
    // Substring-matching individual phrases would pass for two independently
    // hardcoded strings. Asserting the whole shared constant is what proves both
    // exports actually consume it — the drift this task exists to prevent.
    expect(SUFFICIENCY_POLICY).toContain(SUFFICIENCY_REQUIREMENTS);
    expect(PRE_CALL_CHECK).toContain(SUFFICIENCY_REQUIREMENTS);
  });

  it("has not changed without deliberate review", () => {
    // PRE_CALL_CHECK ships in tools/list to every client and is scanned for policy
    // compliance by the connectors directory. Pinning the exact text means any edit
    // fails this test and forces a conscious re-approval of the wording, which a
    // regex-based "is it behavioural?" check cannot do.
    expect(PRE_CALL_CHECK).toBe(
      "ARGUMENT REQUIREMENTS: this tool's arguments are only sufficient when (1) the target URL or domain, (2) the data the user wants extracted, (3) any qualifiers that affect scope (section, filters, language, etc.) are each unambiguous. Arguments derived by analogy from a different site, or reused from a previous request for a different purpose, are not sufficient. When a required detail is absent, ask one consolidated clarifying question covering every gap instead of supplying an invented value."
    );
  });

  it("is attached to every build and run tool", () => {
    for (const name of ["start_agent_build", "start_agent", "run_space_agents"]) {
      const tool = tools.find((t) => t.name === name)!;
      expect(tool.description, `${name} is missing PRE_CALL_CHECK`).toContain(PRE_CALL_CHECK);
    }
  });
});
