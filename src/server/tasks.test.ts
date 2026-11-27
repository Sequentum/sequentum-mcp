import { describe, expect, it } from "vitest";
import type { ExternalAgentBuildTaskResponse } from "../api/types.js";
import { AGENT_BUILD_ERROR_MESSAGE } from "./constants.js";
import {
  TASKS_EXTENSION_ID,
  clientDeclaresTasks,
  toCreateTaskResult,
  toTaskGetResult,
  unavailableTaskResult,
} from "./tasks.js";
import { structuredResult } from "./tools/types.js";

const now = new Date("2026-11-27T12:10:00Z");
const createdAt = "2026-11-27T12:00:00Z";
const finishedAt = "2026-11-27T12:05:00Z";
const taskId = "task-1";

describe("clientDeclaresTasks", () => {
  // Literal keys (not the SDK constants) so the tests pin the wire shape.
  const CAPS_KEY = "io.modelcontextprotocol/clientCapabilities";

  it("is true for a 2026-07-28 envelope that declares the extension", () => {
    expect(
      clientDeclaresTasks({
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        [CAPS_KEY]: { extensions: { [TASKS_EXTENSION_ID]: {} } },
      }),
    ).toBe(true);
  });

  it("is false when the extension is missing", () => {
    expect(
      clientDeclaresTasks({ "io.modelcontextprotocol/protocolVersion": "2026-07-28", [CAPS_KEY]: { extensions: {} } }),
    ).toBe(false);
  });

  it("is false when the client capabilities are missing", () => {
    expect(clientDeclaresTasks({ "io.modelcontextprotocol/protocolVersion": "2026-07-28" })).toBe(false);
  });

  it("is false for extensions placed at the top level of the envelope", () => {
    expect(
      clientDeclaresTasks({
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        extensions: { [TASKS_EXTENSION_ID]: {} },
      }),
    ).toBe(false);
  });

  it("is false for the 2025-11-25 protocol version", () => {
    expect(
      clientDeclaresTasks({
        "io.modelcontextprotocol/protocolVersion": "2025-11-25",
        [CAPS_KEY]: { extensions: { [TASKS_EXTENSION_ID]: {} } },
      }),
    ).toBe(false);
  });

  it("is false for an undefined envelope", () => {
    expect(clientDeclaresTasks(undefined)).toBe(false);
  });
});

describe("toCreateTaskResult", () => {
  it("reports a working task with the poll interval and ttl", () => {
    const result = toCreateTaskResult({ taskId, createdAt }, now);
    expect(result).toMatchObject({
      resultType: "task",
      taskId,
      status: "working",
      statusMessage: "Build started",
      createdAt,
      pollIntervalMs: 5000,
      ttlMs: 600_000 + 3_600_000,
    });
    expect(result.lastUpdatedAt).toBe(now.toISOString());
  });
});

describe("toTaskGetResult", () => {
  it("maps processing to working without a result", () => {
    const result = toTaskGetResult({ status: "processing", createdAt }, taskId, now);
    expect(result.status).toBe("working");
    expect(result.statusMessage).toBe("Build in progress (600s elapsed)");
    expect(result.result).toBeUndefined();
    expect(result.ttlMs).toBe(4_200_000);
    expect(result.lastUpdatedAt).toBe(now.toISOString());
    expect(result.pollIntervalMs).toBe(5000);
  });

  it("counts whole elapsed seconds in the processing status message", () => {
    const result = toTaskGetResult({ status: "processing", createdAt }, taskId, new Date("2026-11-27T12:00:05.900Z"));
    expect(result.statusMessage).toBe("Build in progress (5s elapsed)");
  });

  for (const status of ["completed", "ready"] as const) {
    it(`maps ${status} to a completed task with the blocking-path result`, () => {
      const body: ExternalAgentBuildTaskResponse = {
        status,
        agentId: 42,
        agentName: "Agent",
        plan: { lines: [] },
        createdAt,
        finishedAt,
        expiresAt: "2026-11-27T13:05:00Z",
      };
      const result = toTaskGetResult(body, taskId, now);
      expect(result.status).toBe("completed");
      expect(result.result).toEqual(
        structuredResult({ status, agentId: 42, agentName: "Agent", plan: { lines: [] }, sessionId: taskId }),
      );
      expect(result.ttlMs).toBe(300_000 + 3_600_000);
      expect(result.lastUpdatedAt).toBe(finishedAt);
    });
  }

  it("maps error to a generic error result without the raw error text", () => {
    const result = toTaskGetResult(
      { status: "error", error: "stack trace at secret.ts:1", createdAt, finishedAt },
      taskId,
      now,
    );
    expect(result.status).toBe("completed");
    expect(result.result?.isError).toBe(true);
    expect(result.result?.content[0].text).toBe(AGENT_BUILD_ERROR_MESSAGE);
    expect(JSON.stringify(result)).not.toContain("stack trace");
  });

  it("maps cancelled without an error to cancelled with no result", () => {
    const result = toTaskGetResult({ status: "cancelled", createdAt, finishedAt }, taskId, now);
    expect(result.status).toBe("cancelled");
    expect(result.result).toBeUndefined();
  });

  it("maps cancelled with an error to a completed error result carrying the message", () => {
    const message = "Your organization has run out of credits.";
    const result = toTaskGetResult({ status: "cancelled", error: message, createdAt, finishedAt }, taskId, now);
    expect(result.status).toBe("completed");
    expect(result.result?.isError).toBe(true);
    expect(result.result?.structuredContent).toEqual({ status: "cancelled", sessionId: taskId, error: message });
    expect(JSON.parse(result.result?.content[0].text ?? "")).toEqual({
      status: "cancelled",
      sessionId: taskId,
      error: message,
    });
  });

  it("builds the cancelled error result from status, sessionId and error only", () => {
    const message = "Your organization has run out of credits.";
    const body = {
      status: "cancelled",
      error: message,
      agentId: 42,
      plan: { lines: [] },
      createdAt,
      finishedAt,
    } as ExternalAgentBuildTaskResponse;
    const result = toTaskGetResult(body, taskId, now);
    expect(result.result?.structuredContent).toEqual({ status: "cancelled", sessionId: taskId, error: message });
  });

  it("maps an unknown status to working with a status message, never to cancelled", () => {
    const body = { status: "queued", createdAt } as unknown as ExternalAgentBuildTaskResponse;
    const result = toTaskGetResult(body, taskId, now);
    expect(result.status).toBe("working");
    expect(result.statusMessage).toBeTruthy();
    expect(result.result).toBeUndefined();
    expect(result.lastUpdatedAt).toBe(now.toISOString());
  });

  it("treats a terminal status without finishedAt as finished now", () => {
    const result = toTaskGetResult({ status: "completed", createdAt }, taskId, now);
    expect(result.status).toBe("completed");
    expect(result.lastUpdatedAt).toBe(now.toISOString());
    expect(result.ttlMs).toBe(600_000 + 3_600_000);
  });

  it("treats a terminal status with finishedAt null as finished now", () => {
    const result = toTaskGetResult({ status: "cancelled", createdAt, finishedAt: null }, taskId, now);
    expect(result.status).toBe("cancelled");
    expect(result.lastUpdatedAt).toBe(now.toISOString());
    expect(result.ttlMs).toBe(600_000 + 3_600_000);
  });
});

describe("unavailableTaskResult", () => {
  it("reports a working task with a temporary-unavailability message", () => {
    const result = unavailableTaskResult(taskId, createdAt, now);
    expect(result.status).toBe("working");
    expect(result.statusMessage).toContain("temporarily unavailable");
    expect(result.result).toBeUndefined();
  });

  it("falls back to now when the creation time is unknown", () => {
    const result = unavailableTaskResult(taskId, undefined, now);
    expect(result.createdAt).toBe(now.toISOString());
    expect(result.ttlMs).toBe(3_600_000);
  });
});
