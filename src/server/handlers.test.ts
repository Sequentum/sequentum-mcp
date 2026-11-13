import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMcpServer,
  formatToolError,
  isPaginatedResponse,
  parseScheduleParams,
  validateScheduleStartTime,
  AGENT_BUILD_ERROR_MESSAGE,
} from "./handlers.js";
import { MAX_TOOL_INPUT_ELEMENTS } from "./constants.js";
import { tools } from "./tools.js";
import { resources, resourceTemplates } from "./resources.js";
import { getPromptMessages, prompts } from "./prompts.js";
import {
  PRE_CALL_CHECK,
  PROMPT_HANDLING_POLICY,
  SERVER_CAPABILITY_SUMMARY,
  SERVER_INSTRUCTIONS,
  SUFFICIENCY_POLICY,
  SUFFICIENCY_REQUIREMENTS,
} from "./policies.js";
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
      "Authentication Failed: Your OAuth token is invalid or has expired. Disconnect and reconnect the Sequentum MCP server to sign in again."
    );
  });

  it("formats forbidden API errors", () => {
    const result = formatToolError(
      new ApiRequestError(403, "Forbidden", "Not allowed", "/agents")
    );
    expect(result.content[0].text).toBe(
      "Access Denied: You don't have permission to perform this action. Check your Sequentum account's permissions."
    );
  });

  it("names the missing scope for an insufficient_scope 403 (SE4-3929)", () => {
    const result = formatToolError(
      new ApiRequestError(403, "Forbidden", "Insufficient scope", "/agents", {
        errorCode: "insufficient_scope",
        wwwAuthenticate: 'Bearer error="insufficient_scope", scope="billing:read"',
      })
    );
    expect(result.content[0].text).toBe(
      'Insufficient Scope: This action requires the "billing:read" scope, which this Sequentum MCP connection was not granted. Disconnect and reconnect the Sequentum MCP server, then approve the requested permissions, to re-authorize.'
    );
    expect(result.isError).toBe(true);
  });

  it("still names the problem for an insufficient_scope 403 with no scope in the header", () => {
    const result = formatToolError(
      new ApiRequestError(403, "Forbidden", "Insufficient scope", "/agents", {
        errorCode: "insufficient_scope",
      })
    );
    expect(result.content[0].text).toBe(
      "Insufficient Scope: This action requires an OAuth scope that this Sequentum MCP connection was not granted. Disconnect and reconnect the Sequentum MCP server, then approve the requested permissions, to re-authorize."
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

  it("every tool has idempotentHint defined (SE4-3959)", () => {
    for (const tool of tools) {
      expect(
        typeof tool.annotations?.idempotentHint,
        `Tool "${tool.name}" is missing annotations.idempotentHint`
      ).toBe("boolean");
    }
  });

  it("every read-only tool has idempotentHint: true", () => {
    const readOnlyTools = tools.filter((t) => t.annotations?.readOnlyHint === true);
    expect(readOnlyTools.length).toBe(30);
    for (const tool of readOnlyTools) {
      expect(
        tool.annotations?.idempotentHint,
        `Read-only tool "${tool.name}" should be idempotentHint: true`
      ).toBe(true);
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

  // idempotentHint: true  → calling again with the same arguments reaches the same end
  //                         state, so a client may retry a timed-out call without asking
  // idempotentHint: false → a repeat call has a different effect (creates another run,
  //                         schedule, build or version; or escalates, as kill_agent does)
  const expectedIdempotentHint: Record<string, boolean> = {
    // Converge on one end state.
    stop_agent:             true,  // second stop on a stopping/stopped run is a no-op
    delete_run:             true,  // second delete finds nothing
    delete_agent_schedule:  true,  // second delete finds nothing
    update_agent_schedule:  true,  // same fields applied twice leave the same state
    enable_agent_schedule:  true,  // enabling an enabled schedule changes nothing
    disable_agent_schedule: true,  // disabling a disabled schedule changes nothing
    stop_agent_build:       true,  // description: no effect once the session is terminal
    // Each call creates something new, or escalates.
    start_agent:            false, // creates a new run per call
    kill_agent:             false, // description: 1st call graceful stop, 2nd forces termination
    restore_agent_version:  false, // each restore creates a new version record
    create_agent_schedule:  false, // creates a new schedule per call
    run_space_agents:       false, // starts a new batch of runs per call
    start_agent_build:      false, // starts a new build session per call
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

  it("every write tool has the correct idempotentHint value", () => {
    assertPerToolAnnotation(
      "IdempotentHint",
      expectedIdempotentHint,
      (t) => t.annotations?.idempotentHint,
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

type BuildStatus = Awaited<ReturnType<SequentumApiClient["getAgentBuildStatus"]>>;
const status = (value: Record<string, unknown>) => value as unknown as BuildStatus;
const textOf = (result: { content?: unknown }) => ((result.content as Array<{ text: string }>)[0]).text;

/** A server and client over the given API mock; `controlCenterUrl` turns on the links. */
async function connectWith(api: SequentumApiClient, controlCenterUrl?: string) {
  const server = createMcpServer(api, "test", controlCenterUrl);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0" });
  await client.connect(clientTransport);
  return { client, api: api as unknown as Record<string, ReturnType<typeof vi.fn>> };
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

    it("returns at once with the finished card when the build completes", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-sync-1" });
        vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValueOnce(
          status({ status: "completed", agentId: 42, agentName: "Test Agent" })
        );

        const resultPromise = client.callTool({
          name: "start_agent_build",
          arguments: { prompt: "scrape product names from https://example.com/shop" },
        });
        await vi.advanceTimersByTimeAsync(1_000);
        const result = await resultPromise;

        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({
          status: "completed", agentId: 42, agentName: "Test Agent", sessionId: "sess-sync-1", stage: "Task completed", done: true,
        });
        expect(textOf(result)).toMatch(/^\*\*Agent ready: Test Agent \(agent 42\)\*\*/);
        expect(textOf(result)).toContain('sessionId: "sess-sync-1"');
        expect(vi.mocked(mockApiClient.getAgentBuildStatus)).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns the plan, report, partial flag and questions with the agent", async () => {
      vi.useFakeTimers();
      try {
        const plan = {
          item: { text: "a book", provenance: "user" },
          target: { url: "https://books.toscrape.com", provenance: "user" },
          scope: { text: "all listing pages", provenance: "default" },
          fields: [{ name: "title", provenance: "user" }, { name: "rating", provenance: "assumption" }],
        };
        const report = {
          met: 1, partial: 1, unmet: 0, total: 2,
          lines: { "field:title": { status: "met" }, "field:rating": { status: "partial", evidence: "empty on 3 of 20 rows" } },
          questions: [{ text: "Every page?", replies: ["Every page", "First page only"] }],
        };
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-plan-1" });
        vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValueOnce(
          status({ status: "completed", agentId: 9, agentName: "Plan Agent", partial: true, summary: "No prices.", plan, report })
        );

        const resultPromise = client.callTool({
          name: "start_agent_build",
          arguments: { prompt: "scrape book titles from https://books.toscrape.com" },
        });
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({ status: "completed", agentId: 9, sessionId: "sess-plan-1", partial: true, summary: "No prices.", plan, report, stage: "Partially completed" });
        const text = textOf(result);
        expect(text).toContain("What is missing: No prices.");
        expect(text).toContain("Plan: each row is a book, from https://books.toscrape.com, all listing pages. Fields: title, rating.");
        expect(text).toContain('Guessed without asking: "all listing pages" (default), "rating field" (assumption).');
        expect(text).toContain("Plan check: 1 met, 1 partial, 0 unmet.");
        expect(text).toContain("- field:rating: partial (empty on 3 of 20 rows)");
        expect(text).toContain('1. Every page? "Every page" / "First page only"');
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns as soon as the plan appears, with done false, the stage and a watch link", async () => {
      vi.useFakeTimers();
      try {
        const cc = await connectWith(
          makeMinimalMockClient({
            startAgentBuild: vi.fn().mockResolvedValue({ sessionId: "ab_1" }),
            getAgentBuildStatus: vi.fn()
              .mockResolvedValueOnce(status({ status: "processing" }))
              .mockResolvedValueOnce(status({ status: "processing", plan: { item: { text: "a shoe", provenance: "user" } } })),
          }),
          "https://cc.example.test/"
        );
        const resultPromise = cc.client.callTool({
          name: "start_agent_build",
          arguments: { prompt: "scrape shoe prices from https://example.com/shoes", spaceId: 7 },
        });
        await vi.advanceTimersByTimeAsync(2_500);
        const result = await resultPromise;

        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({
          sessionId: "ab_1", status: "processing", stage: "Building the Agent", done: false, nextCheckSeconds: 45,
          watchUrl: "https://cc.example.test/agent-builder?sessionId=ab_1",
        });
        const text = textOf(result);
        expect(text).toMatch(/^\*\*Building your Agent: Building the Agent\*\* · \d+ s so far/);
        expect(text).toContain("Watch it live: https://cc.example.test/agent-builder?sessionId=ab_1");
        expect(text).toContain("call get_agent_build_status with this sessionId and waitSeconds 45");
        expect(cc.api.getAgentBuildStatus).toHaveBeenCalledTimes(2);
        await cc.client.close();
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns at 45 s with done false while the build is still running, and never stops it", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-hold-1" });
        vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValue(status({ status: "processing" }));

        let settled = false;
        const resultPromise = client.callTool({
          name: "start_agent_build",
          arguments: { prompt: "scrape product names from https://example.com/shop" },
        }).finally(() => { settled = true; });

        await vi.advanceTimersByTimeAsync(44_000);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1_500);
        expect(settled).toBe(true);
        const result = await resultPromise;

        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({ sessionId: "sess-hold-1", status: "processing", stage: "Looking at the page", done: false, elapsedSeconds: 45 });
        expect(vi.mocked(mockApiClient.stopAgentBuild)).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      ["cancelled", "Stopped", "Build stopped"],
      ["error", "Failed", "Build failed"],
    ] as const)("returns at once on %s as an error result that keeps the sessionId", async (state, stage, headline) => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-end-1" });
        vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValueOnce(
          status({ status: state, error: "NullReferenceException at AgentBuilder.cs:99", agentId: 3, agentName: "Draft" })
        );
        const resultPromise = client.callTool({
          name: "start_agent_build",
          arguments: { prompt: "scrape product names from https://example.com/shop" },
        });
        await vi.advanceTimersByTimeAsync(1_000);
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const text = textOf(result);
        expect(text).toContain(`**${headline}**`);
        expect(text).toContain('sessionId: "sess-end-1"');
        expect(text).toContain("Draft (agent 3)");
        expect(text).not.toContain("NullReferenceException");
        if (state === "error") expect(text).toContain(AGENT_BUILD_ERROR_MESSAGE);
        expect(result.structuredContent).toMatchObject({ sessionId: "sess-end-1", status: state, stage, done: true, agentId: 3 });
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
      const parsed = JSON.parse(textOf(result));
      expect(parsed.sessionId).toBe("sess-async-1");
      expect(vi.mocked(mockApiClient.getAgentBuildStatus)).not.toHaveBeenCalled();
    });

    it("a 503 on the status read returns a Checking card that keeps the sessionId, not an error", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-503" });
        vi.mocked(mockApiClient.getAgentBuildStatus).mockRejectedValueOnce(
          new ApiRequestError(503, "Service Unavailable", "Editor server temporarily unavailable", "/status")
        );
        const resultPromise = client.callTool({
          name: "start_agent_build",
          arguments: { prompt: "scrape product names from https://example.com/shop" },
        });
        await vi.advanceTimersByTimeAsync(1_000);
        const result = await resultPromise;

        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({ sessionId: "sess-503", status: "processing", stage: "Checking", done: false });
        expect(textOf(result)).toContain("Could not read the build status this time (HTTP 503). That does not stop the build.");
        expect(textOf(result)).toContain('sessionId: "sess-503"');
        expect(vi.mocked(mockApiClient.stopAgentBuild)).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("a status read that never answers is abandoned at the hold limit", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-slow" });
        vi.mocked(mockApiClient.getAgentBuildStatus)
          .mockResolvedValueOnce(status({ status: "processing" }))
          .mockReturnValue(new Promise(() => {}));
        let settled = false;
        const resultPromise = client.callTool({
          name: "start_agent_build",
          arguments: { prompt: "scrape product names from https://example.com/shop" },
        }).finally(() => { settled = true; });

        await vi.advanceTimersByTimeAsync(48_000);
        expect(settled).toBe(true);
        const result = await resultPromise;
        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({ sessionId: "sess-slow", stage: "Checking", done: false });
      } finally {
        vi.useRealTimers();
      }
    });

    it("a 404 on the status read is an error that still names the sessionId", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-404" });
        vi.mocked(mockApiClient.getAgentBuildStatus).mockRejectedValueOnce(
          new ApiRequestError(404, "Not Found", "Session not found", "/status")
        );
        const resultPromise = client.callTool({
          name: "start_agent_build",
          arguments: { prompt: "scrape product names from https://example.com/shop" },
        });
        await vi.advanceTimersByTimeAsync(1_000);
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        expect(textOf(result)).toMatch(/^Not Found: Session not found\n/);
        expect(textOf(result)).toContain('Build sessionId: "sess-404". This error did not stop the build.');
      } finally {
        vi.useRealTimers();
      }
    });

    it("a client cancel does NOT stop the build", async () => {
      vi.useFakeTimers();
      try {
        const abortApiClient = makeMinimalMockClient({
          startAgentBuild: vi.fn().mockResolvedValue({ sessionId: "sess-abort-1" }),
          getAgentBuildStatus: vi.fn().mockResolvedValue({ status: "processing" }),
          stopAgentBuild: vi.fn().mockResolvedValue(undefined),
        });
        const { client: abortMcpClient } = await connectWith(abortApiClient);

        // The SDK client times out after 50 ms and sends notifications/cancelled, which aborts the
        // handler's signal. The handler must stop waiting without stopping the build.
        const resultPromise = abortMcpClient
          .callTool(
            { name: "start_agent_build", arguments: { prompt: "scrape product names from https://example.com/shop" } },
            { timeout: 50 }
          )
          .catch(() => null);
        await vi.advanceTimersByTimeAsync(60_000);
        await resultPromise;

        expect(vi.mocked(abortApiClient.stopAgentBuild)).not.toHaveBeenCalled();
        // The abort ended the hold at once: no reads after the cancel at 50 ms.
        expect(vi.mocked(abortApiClient.getAgentBuildStatus)).not.toHaveBeenCalled();
        await abortMcpClient.close();
      } finally {
        vi.useRealTimers();
      }
    });

    it("on abort, the handler returns a card that keeps the sessionId and says the build continues", async () => {
      const controller = new AbortController();
      const apiClient = makeMinimalMockClient({
        startAgentBuild: vi.fn().mockResolvedValue({ sessionId: "sess-abort-2" }),
        getAgentBuildStatus: vi.fn().mockResolvedValue({ status: "processing" }),
        stopAgentBuild: vi.fn(),
      });
      const pending = toolDispatch.start_agent_build(
        { prompt: "scrape product names from https://example.com/shop" },
        { apiClient, sendProgress: async () => {}, signal: controller.signal }
      );
      controller.abort();
      const result = await pending;

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({ sessionId: "sess-abort-2", done: false });
      expect(result.content[0].text).toContain("The tool call was cancelled, but the build keeps running. Only stop_agent_build stops it.");
      expect(apiClient.stopAgentBuild).not.toHaveBeenCalled();
    });

    it("sends progress with increasing elapsed seconds and the card's stage line", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-progress-1" });
        vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValue(status({ status: "processing" }));

        const updates: Array<{ progress: number; total?: number; message?: string }> = [];
        const resultPromise = client.callTool(
          { name: "start_agent_build", arguments: { prompt: "scrape product names from https://example.com/shop" } },
          { onprogress: (p) => updates.push(p) }
        );
        await vi.advanceTimersByTimeAsync(46_000);
        await resultPromise;

        // The first notification names the sessionId, so the caller has it at once.
        expect(updates[0].message).toContain("sess-progress-1");
        expect(updates.length).toBeGreaterThan(3);
        for (let i = 1; i < updates.length; i++) {
          expect(updates[i].progress).toBeGreaterThan(updates[i - 1].progress);
          expect(updates[i].total).toBeUndefined();
          expect(updates[i].message).toMatch(/^Building your Agent: (Starting|Looking at the page) · \d+ (min \d+ )?s so far$/);
        }
        expect(updates.at(-1)!.message).toContain("Looking at the page");
      } finally {
        vi.useRealTimers();
      }
    });

    it("a progress notification failure does not crash the hold", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.startAgentBuild).mockResolvedValueOnce({ sessionId: "sess-notif-err" });
        vi.mocked(mockApiClient.getAgentBuildStatus)
          .mockResolvedValueOnce(status({ status: "processing" }))
          .mockResolvedValueOnce(status({ status: "completed", agentId: 55, agentName: "Resilient Agent" }));

        let notifCallCount = 0;
        const resultPromise = client.callTool(
          { name: "start_agent_build", arguments: { prompt: "scrape product names from https://example.com/shop" } },
          {
            onprogress: () => {
              notifCallCount++;
              if (notifCallCount === 1) throw new Error("transport closed");
            },
          }
        );
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({ agentId: 55 });
      } finally {
        vi.useRealTimers();
      }
    });

    it("links a finished agent in its space, or space 0 when none was given", async () => {
      vi.useFakeTimers();
      try {
        for (const [spaceId, path] of [[7, "/space/7/config/24737/details/runs"], [undefined, "/space/0/config/24737/details/runs"]] as const) {
          const cc = await connectWith(
            makeMinimalMockClient({
              startAgentBuild: vi.fn().mockResolvedValue({ sessionId: "ab_2" }),
              getAgentBuildStatus: vi.fn().mockResolvedValue(status({ status: "completed", agentId: 24737, agentName: "Shoes" })),
            }),
            "https://cc.example.test"
          );
          const resultPromise = cc.client.callTool({
            name: "start_agent_build",
            arguments: { prompt: "scrape shoe prices from https://example.com/shoes", ...(spaceId ? { spaceId } : {}) },
          });
          await vi.advanceTimersByTimeAsync(1_000);
          const result = await resultPromise;
          expect(result.structuredContent).toMatchObject({ agentUrl: `https://cc.example.test${path}` });
          expect((result.structuredContent as { watchUrl?: string }).watchUrl).toBeUndefined();
          expect(textOf(result)).toContain(`Open in Sequentum: https://cc.example.test${path}`);
          await cc.client.close();
        }
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("get_agent_build_status", () => {
    it("replaces a raw backend error with a generic user-facing message and keeps the sessionId", async () => {
      vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValueOnce(
        status({ status: "error", error: "NullReferenceException at BuildOrchestrator.cs:42", agentId: null, agentName: null })
      );

      const result = await client.callTool({
        name: "get_agent_build_status",
        arguments: { sessionId: "sess-test-123" },
      });

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({ error: AGENT_BUILD_ERROR_MESSAGE, sessionId: "sess-test-123", stage: "Failed", done: true });
      expect(textOf(result)).not.toContain("NullReferenceException");
      expect(textOf(result)).toContain(AGENT_BUILD_ERROR_MESSAGE);
    });

    it("without waitSeconds makes exactly one API call", async () => {
      vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValue(status({ status: "processing" }));
      const result = await client.callTool({ name: "get_agent_build_status", arguments: { sessionId: "sess-1" } });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({ sessionId: "sess-1", status: "processing", done: false });
      expect(vi.mocked(mockApiClient.getAgentBuildStatus)).toHaveBeenCalledTimes(1);
    });

    it("a 503 without waitSeconds keeps the sessionId and asks to check again", async () => {
      vi.mocked(mockApiClient.getAgentBuildStatus).mockRejectedValueOnce(
        new ApiRequestError(503, "Service Unavailable", "Editor server temporarily unavailable", "/status")
      );
      const result = await client.callTool({ name: "get_agent_build_status", arguments: { sessionId: "sess-503b" } });

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({ sessionId: "sess-503b", stage: "Checking", done: false, nextCheckSeconds: 45 });
      expect(textOf(result)).toContain("**Checking on the build**");
      expect(textOf(result)).toContain("(HTTP 503)");
      expect(textOf(result)).toContain('sessionId: "sess-503b"');
    });

    it("a 401 is an error that still names the sessionId", async () => {
      vi.mocked(mockApiClient.getAgentBuildStatus).mockRejectedValueOnce(
        new ApiRequestError(401, "Unauthorized", "expired", "/status")
      );
      const result = await client.callTool({ name: "get_agent_build_status", arguments: { sessionId: "sess-401" } });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/^Authentication Failed: /);
      expect(textOf(result)).toContain('Build sessionId: "sess-401"');
    });

    it("with waitSeconds returns as soon as the status changes", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.getAgentBuildStatus)
          .mockResolvedValueOnce(status({ status: "processing", plan: { item: { text: "a book" } } }))
          .mockResolvedValueOnce(status({ status: "processing", plan: { item: { text: "a book" } } }))
          .mockResolvedValueOnce(status({ status: "completed", agentId: 5, agentName: "Books" }));
        let settled = false;
        const resultPromise = client.callTool({
          name: "get_agent_build_status",
          arguments: { sessionId: "sess-w1", waitSeconds: 30 },
        }).finally(() => { settled = true; });

        await vi.advanceTimersByTimeAsync(2_600);
        expect(settled).toBe(true);
        const result = await resultPromise;
        expect(result.structuredContent).toMatchObject({ status: "completed", done: true, agentId: 5, sessionId: "sess-w1" });
        expect(vi.mocked(mockApiClient.getAgentBuildStatus)).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it("with waitSeconds returns when the plan appears", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.getAgentBuildStatus)
          .mockResolvedValueOnce(status({ status: "processing" }))
          .mockResolvedValueOnce(status({ status: "processing", plan: { item: { text: "a book" } } }));
        const resultPromise = client.callTool({ name: "get_agent_build_status", arguments: { sessionId: "sess-w2", waitSeconds: 45 } });
        await vi.advanceTimersByTimeAsync(1_000);
        const result = await resultPromise;
        expect(result.structuredContent).toMatchObject({ stage: "Building the Agent", done: false });
      } finally {
        vi.useRealTimers();
      }
    });

    it("with waitSeconds holds while nothing changes, sends progress, and returns at the deadline", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValue(
          status({ status: "processing", agentElapsedSeconds: 70, browserIoSeconds: 4 })
        );
        const updates: Array<{ progress: number; message?: string }> = [];
        let settled = false;
        const resultPromise = client.callTool(
          { name: "get_agent_build_status", arguments: { sessionId: "sess-w3", waitSeconds: 30 } },
          { onprogress: (p) => updates.push(p) }
        ).finally(() => { settled = true; });

        await vi.advanceTimersByTimeAsync(29_000);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1_500);
        expect(settled).toBe(true);
        const result = await resultPromise;

        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({ status: "processing", done: false, elapsedSeconds: 74, stage: "Looking at the page" });
        expect(updates.length).toBeGreaterThan(3);
        for (let i = 1; i < updates.length; i++) expect(updates[i].progress).toBeGreaterThan(updates[i - 1].progress);
        expect(updates[0].message).toBe("Building your Agent: Looking at the page · 1 min 14 s so far");
      } finally {
        vi.useRealTimers();
      }
    });

    it("clamps waitSeconds to 50", async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValue(status({ status: "processing" }));
        let settled = false;
        const resultPromise = client.callTool({
          name: "get_agent_build_status",
          arguments: { sessionId: "sess-w4", waitSeconds: 500 },
        }).finally(() => { settled = true; });

        await vi.advanceTimersByTimeAsync(49_000);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1_500);
        expect(settled).toBe(true);
        expect((await resultPromise).isError).toBeFalsy();
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns at once when the first read is already terminal", async () => {
      vi.mocked(mockApiClient.getAgentBuildStatus).mockResolvedValue(status({ status: "cancelled" }));
      const result = await client.callTool({ name: "get_agent_build_status", arguments: { sessionId: "sess-w5", waitSeconds: 45 } });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({ status: "cancelled", stage: "Stopped", done: true });
      expect(vi.mocked(mockApiClient.getAgentBuildStatus)).toHaveBeenCalledTimes(1);
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
      "list_agents", "get_agent", "search_agents", "get_agent_search_count", "get_personal_agent_count",
      "get_agent_runs", "get_agent_run_summary", "get_run_status",
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

  it("list_agents accepts status 13 (UpdatingDataSet) and rejects 14", async () => {
    const getAllAgents = vi.fn().mockResolvedValue([]);
    const apiClient = { getAllAgents } as unknown as SequentumApiClient;
    const ctx = { apiClient, sendProgress: async () => {}, signal: new AbortController().signal };

    await toolDispatch.list_agents({ status: 13 }, ctx);
    expect(getAllAgents).toHaveBeenCalledWith({ pageIndex: 1, recordsPerPage: 50, status: 13 });

    await expect(toolDispatch.list_agents({ status: 14 }, ctx)).rejects.toThrow(/must be <= 13/);
  });

  it("exposes a handler for every schedule, billing, and space tool", () => {
    const expected = [
      "list_agent_schedules", "create_agent_schedule", "delete_agent_schedule",
      "get_agent_schedule", "update_agent_schedule", "enable_agent_schedule",
      "disable_agent_schedule", "get_scheduled_runs",
      "get_credits_balance", "get_spending_summary", "get_credit_history",
      "get_agents_usage", "get_agent_cost_breakdown", "get_agent_runs_cost",
      "list_spaces", "get_space", "get_space_agents", "search_space_by_name",
      "run_space_agents", "get_space_agent_count",
    ];
    for (const name of expected) {
      expect(typeof toolDispatch[name]).toBe("function");
    }
  });

  it("get_space_agent_count returns the server-provided total", async () => {
    const getSpaceAgentCount = vi.fn().mockResolvedValue({ totalCount: 73 });
    const apiClient = { getSpaceAgentCount } as unknown as SequentumApiClient;
    const result = await toolDispatch.get_space_agent_count(
      { spaceId: 42 },
      { apiClient, sendProgress: async () => {}, signal: new AbortController().signal }
    );

    expect(getSpaceAgentCount).toHaveBeenCalledWith(42);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({ totalCount: 73 });
  });

  it("search_agents always sends an explicit limit and flags a capped result", async () => {
    const searchAgents = vi.fn().mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `checkout ${i}` }))
    );
    const apiClient = { searchAgents } as unknown as SequentumApiClient;
    const result = await toolDispatch.search_agents(
      { query: "checkout" },
      { apiClient, sendProgress: async () => {}, signal: new AbortController().signal }
    );

    expect(searchAgents).toHaveBeenCalledWith("checkout", 50);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.returned).toBe(50);
    expect(parsed.truncated).toBe(true);
    expect(parsed.note).toContain("get_agent_search_count");
  });

  it("get_agent_search_count returns the server-provided total", async () => {
    const getAgentSearchCount = vi.fn().mockResolvedValue({ totalCount: 214 });
    const apiClient = { getAgentSearchCount } as unknown as SequentumApiClient;
    const result = await toolDispatch.get_agent_search_count(
      { query: "checkout" },
      { apiClient, sendProgress: async () => {}, signal: new AbortController().signal }
    );

    expect(getAgentSearchCount).toHaveBeenCalledWith("checkout", undefined);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({ totalCount: 214 });
  });

  it("get_personal_agent_count returns the server-provided total", async () => {
    const getPersonalAgentCount = vi.fn().mockResolvedValue({ totalCount: 238 });
    const apiClient = { getPersonalAgentCount } as unknown as SequentumApiClient;
    const result = await toolDispatch.get_personal_agent_count(
      {},
      { apiClient, sendProgress: async () => {}, signal: new AbortController().signal }
    );

    expect(getPersonalAgentCount).toHaveBeenCalledWith();
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({ totalCount: 238 });
  });

  it("get_agent_run_summary returns the server-provided totals", async () => {
    const summary = {
      totalCount: 395,
      statusCounts: [{ status: 9, statusName: "Completed", count: 272 }],
    };
    const getAgentRunSummary = vi.fn().mockResolvedValue(summary);
    const apiClient = { getAgentRunSummary } as unknown as SequentumApiClient;
    const result = await toolDispatch.get_agent_run_summary(
      { agentId: 289 },
      { apiClient, sendProgress: async () => {}, signal: new AbortController().signal }
    );

    expect(getAgentRunSummary).toHaveBeenCalledWith(289);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(summary);
  });

  it("get_agent_runs always sends an explicit limit and flags a capped result", async () => {
    const getAgentRuns = vi.fn().mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }))
    );
    const apiClient = { getAgentRuns } as unknown as SequentumApiClient;
    const result = await toolDispatch.get_agent_runs(
      { agentId: 289 },
      { apiClient, sendProgress: async () => {}, signal: new AbortController().signal }
    );

    expect(getAgentRuns).toHaveBeenCalledWith(289, 50);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.returned).toBe(50);
    expect(parsed.limit).toBe(50);
    expect(parsed.truncated).toBe(true);
    expect(parsed.note).toContain("get_agent_run_summary");
  });

  it("get_agent_runs does not flag a result below the limit", async () => {
    const getAgentRuns = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const apiClient = { getAgentRuns } as unknown as SequentumApiClient;
    const result = await toolDispatch.get_agent_runs(
      { agentId: 289, maxRecords: 100 },
      { apiClient, sendProgress: async () => {}, signal: new AbortController().signal }
    );

    expect(getAgentRuns).toHaveBeenCalledWith(289, 100);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.returned).toBe(2);
    expect(parsed.truncated).toBe(false);
    expect(parsed.note).toBeUndefined();
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

  // SE4-4389: a sync start holds the tool call open for up to `timeout` seconds.
  it("tells clients that a synchronous start_agent waits up to its timeout", () => {
    const startAgent = tools.find((t) => t.name === "start_agent");
    const timeout = startAgent?.inputSchema.properties?.timeout as { description?: string } | undefined;
    expect(timeout?.description).toMatch(/can stay open for this many seconds plus about 30 s/);
  });
});

// ==========================================
// SDK v2 Registration Round-Trip
// ==========================================

describe("createMcpServer via SDK v2", () => {
  it("advertises all 43 tools in declaration order, with annotations intact", async () => {
    const apiClient = {} as unknown as SequentumApiClient;
    const server = createMcpServer(apiClient, "9.9.9");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const result = await client.listTools();
      expect(result.tools).toHaveLength(43);
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

  it("rejects a tools/call whose arguments exceed MAX_TOOL_INPUT_ELEMENTS", async () => {
    const apiClient = {} as unknown as SequentumApiClient;
    const server = createMcpServer(apiClient, "9.9.9");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const result = await client.callTool({
        name: tools[0]!.name,
        arguments: { pad: new Array(MAX_TOOL_INPUT_ELEMENTS + 1).fill(0) },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toMatch(
        new RegExp(`more than the maximum of ${MAX_TOOL_INPUT_ELEMENTS} elements`)
      );
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
      expect(result.tools).toHaveLength(43);
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
  it("SERVER_INSTRUCTIONS is the capability summary, a blank line, then SUFFICIENCY_POLICY verbatim", () => {
    expect(SERVER_INSTRUCTIONS).toBe(`${SERVER_CAPABILITY_SUMMARY}\n\n${SUFFICIENCY_POLICY}`);
    expect(SERVER_INSTRUCTIONS.startsWith(SERVER_CAPABILITY_SUMMARY)).toBe(true);
    expect(SERVER_INSTRUCTIONS).toContain(SUFFICIENCY_POLICY);
  });

  it("the capability summary names every domain the server covers and gives no behavioural direction", () => {
    for (const domain of ["agents", "runs", "schedules", "spaces", "credits", "files", "Agent Builder"]) {
      expect(SERVER_CAPABILITY_SUMMARY).toContain(domain);
    }
    // Connectors Directory review criterion: describe what the server does, do not tell
    // the model how to behave. These phrases are the usual tells.
    expect(SERVER_CAPABILITY_SUMMARY).not.toMatch(/\b(you must|you should|always|never|before calling)\b/i);
  });

  it("server instructions are SERVER_INSTRUCTIONS: summary first, sufficiency policy verbatim after", async () => {
    const mockApiClient = makeMinimalMockClient();
    const server = createMcpServer(mockApiClient, "test");
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const connectedClient = new Client({ name: "policy-test-client", version: "1.0" });
    await connectedClient.connect(clientTransport);
    try {
      const instructions = connectedClient.getInstructions();
      expect(instructions).toBe(SERVER_INSTRUCTIONS);
      expect(instructions?.startsWith(SERVER_CAPABILITY_SUMMARY)).toBe(true);
      expect(instructions).toContain(SUFFICIENCY_POLICY);
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
