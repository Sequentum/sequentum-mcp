import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMcpServer,
  formatToolError,
  isPaginatedResponse,
  parseScheduleParams,
  validateScheduleStartTime,
} from "./handlers.js";
import { tools } from "./tools.js";
import { getPromptMessages } from "./prompts.js";
import { PROMPT_HANDLING_POLICY, SUFFICIENCY_POLICY } from "./policies.js";
import {
  ApiRequestError,
  AuthenticationError,
  RateLimitError,
} from "../api/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { SequentumApiClient } from "../api/api-client.js";

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
      expect((result.content[0] as { text: string }).text).toMatch(/at least 10/i);
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
      expect(parsed.error).toBe("Build failed. Please review your prompt and try again.");
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

  it("build-agent-from-prompt template embeds PROMPT_HANDLING_POLICY", () => {
    const messages = getPromptMessages("build-agent-from-prompt", {
      prompt: "scrape https://example.com/products for product names",
    });
    expect(messages.length).toBeGreaterThan(0);
    const text = (messages[0].content as { text: string }).text;
    expect(text).toContain(PROMPT_HANDLING_POLICY);
  });
});
