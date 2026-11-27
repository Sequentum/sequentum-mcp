import {
  CLIENT_CAPABILITIES_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  ProtocolError,
  fromJsonSchema,
  type McpServer,
} from "@modelcontextprotocol/server";
import type { SequentumApiClient } from "../api/api-client.js";
import { ApiRequestError, AuthenticationError, type ExternalAgentBuildTaskResponse } from "../api/types.js";
import { AGENT_BUILD_ERROR_MESSAGE } from "./constants.js";
import { DEBUG } from "./tools/shared.js";
import { structuredResult, type CallToolResult } from "./tools/types.js";

/** Extension id a client declares to receive MCP Tasks. */
export const TASKS_EXTENSION_ID = "io.modelcontextprotocol/tasks";
/** `_meta` key that marks a tool result as the start of a task. */
export const TASK_MARKER_META_KEY = "com.sequentum/task";
export const TASK_POLL_INTERVAL_MS = 5000;
/** How long a finished task's result stays retrievable. */
export const TASK_RESULT_RETENTION_MS = 3_600_000;

const TASKS_PROTOCOL_VERSION = "2026-07-28";

/**
 * True only for a 2026-07-28 request envelope whose client capabilities
 * (`io.modelcontextprotocol/clientCapabilities`) list the tasks extension under `extensions`.
 */
export function clientDeclaresTasks(envelope: Record<string, unknown> | undefined): boolean {
  if (envelope?.[PROTOCOL_VERSION_META_KEY] !== TASKS_PROTOCOL_VERSION) {
    return false;
  }
  const capabilities = envelope[CLIENT_CAPABILITIES_META_KEY];
  if (typeof capabilities !== "object" || capabilities === null) return false;
  const extensions = (capabilities as Record<string, unknown>).extensions;
  return typeof extensions === "object" && extensions !== null && TASKS_EXTENSION_ID in extensions;
}

export interface TaskMarker {
  taskId: string;
  createdAt: string;
}

export interface CreateTaskResult {
  resultType: "task";
  taskId: string;
  status: "working";
  statusMessage: "Build started";
  createdAt: string;
  lastUpdatedAt: string;
  ttlMs: number;
  pollIntervalMs: number;
}

export interface TaskGetResult {
  resultType: "complete";
  taskId: string;
  status: "working" | "completed" | "cancelled";
  statusMessage?: string;
  createdAt: string;
  lastUpdatedAt: string;
  ttlMs: number;
  pollIntervalMs: number;
  result?: CallToolResult;
}

function elapsedMs(from: string, to: Date | string): number {
  return Math.max(0, new Date(to).getTime() - new Date(from).getTime());
}

export function toCreateTaskResult(marker: TaskMarker, now: Date): CreateTaskResult {
  return {
    resultType: "task",
    taskId: marker.taskId,
    status: "working",
    statusMessage: "Build started",
    createdAt: marker.createdAt,
    lastUpdatedAt: now.toISOString(),
    ttlMs: elapsedMs(marker.createdAt, now) + TASK_RESULT_RETENTION_MS,
    pollIntervalMs: TASK_POLL_INTERVAL_MS,
  };
}

export function toTaskGetResult(task: ExternalAgentBuildTaskResponse, taskId: string, now: Date): TaskGetResult {
  const { createdAt, finishedAt, expiresAt: _expiresAt, ...body } = task;
  const base = { resultType: "complete" as const, taskId, createdAt, pollIntervalMs: TASK_POLL_INTERVAL_MS };

  if (body.status === "processing") {
    return {
      ...base,
      status: "working",
      statusMessage: `Build in progress (${Math.floor(elapsedMs(createdAt, now) / 1000)}s elapsed)`,
      lastUpdatedAt: now.toISOString(),
      ttlMs: elapsedMs(createdAt, now) + TASK_RESULT_RETENTION_MS,
    };
  }

  // A terminal status can arrive before the stored result exists; count it as finished now.
  const finished = finishedAt ?? now.toISOString();
  const finishedFields = {
    ...base,
    lastUpdatedAt: finished,
    ttlMs: elapsedMs(createdAt, finished) + TASK_RESULT_RETENTION_MS,
  };

  if (body.status === "completed" || body.status === "ready") {
    const { error: _unused, ...rest } = body;
    return { ...finishedFields, status: "completed", result: structuredResult({ ...rest, sessionId: taskId }) };
  }

  if (body.status === "error") {
    // Same generic message as the blocking path; the raw error text is never exposed.
    return {
      ...finishedFields,
      status: "completed",
      result: { content: [{ type: "text", text: AGENT_BUILD_ERROR_MESSAGE }], isError: true },
    };
  }

  if (body.status === "cancelled") {
    if (body.error) {
      // Built explicitly so no other field of the response body reaches the client.
      return {
        ...finishedFields,
        status: "completed",
        result: { ...structuredResult({ status: "cancelled", sessionId: taskId, error: body.error }), isError: true },
      };
    }
    return { ...finishedFields, status: "cancelled" };
  }

  // A status this server does not know yet: keep the client polling rather than guess an outcome.
  return {
    ...base,
    status: "working",
    statusMessage: "The build reported a status this server does not recognize; keep polling.",
    lastUpdatedAt: now.toISOString(),
    ttlMs: elapsedMs(createdAt, now) + TASK_RESULT_RETENTION_MS,
  };
}

/** A `working` result for an unreachable Control Center (5xx, 429, timeout, network), so the client keeps polling. */
export function unavailableTaskResult(taskId: string, createdAt: string | undefined, now: Date): TaskGetResult {
  // The server is stateless and the upstream did not answer, so the real createdAt is unknown here.
  const created = createdAt ?? now.toISOString();
  return {
    resultType: "complete",
    taskId,
    status: "working",
    statusMessage: "Build status is temporarily unavailable; keep polling.",
    createdAt: created,
    lastUpdatedAt: now.toISOString(),
    ttlMs: elapsedMs(created, now) + TASK_RESULT_RETENTION_MS,
    pollIntervalMs: TASK_POLL_INTERVAL_MS,
  };
}

const TASK_NOT_FOUND_MESSAGE = "Failed to retrieve task: Task not found";

const taskParamsSchema = fromJsonSchema<{ taskId: string }>({
  type: "object",
  properties: { taskId: { type: "string" } },
  required: ["taskId"],
});

type StoredRequestHandler = (request: unknown, ctx: unknown) => Promise<Record<string, unknown>>;

/** The marker `start_agent_build` puts in `_meta` when it started a task, or undefined. */
function taskMarkerOf(result: Record<string, unknown>): TaskMarker | undefined {
  const meta = result._meta;
  if (typeof meta !== "object" || meta === null) return undefined;
  const marker = (meta as Record<string, unknown>)[TASK_MARKER_META_KEY];
  if (typeof marker !== "object" || marker === null) return undefined;
  const { taskId, createdAt } = marker as Record<string, unknown>;
  return typeof taskId === "string" && typeof createdAt === "string" ? { taskId, createdAt } : undefined;
}

/** Ids the Control Center issues; anything else (`.`, `..`, `/`, oversized) is never forwarded. */
const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

/**
 * Rejects an id the Control Center could not have issued, as an unknown task. Checked here
 * rather than in the params schema, whose failure the SDK reports with its own message.
 */
function assertValidTaskId(taskId: string): void {
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw new ProtocolError(-32602, TASK_NOT_FOUND_MESSAGE);
  }
}

/**
 * The failures every task route shares: a 404 means the id is unknown (or expired) to the
 * caller, and an auth failure propagates unchanged so a revoked token still ends in an HTTP 401.
 */
function rethrowNotFoundOrAuth(error: unknown): void {
  if (error instanceof ApiRequestError && error.statusCode === 404) {
    throw new ProtocolError(-32602, TASK_NOT_FOUND_MESSAGE);
  }
  if ((error instanceof ApiRequestError && error.statusCode === 401) || error instanceof AuthenticationError) {
    throw error;
  }
}

/** True when the Control Center could not answer now (429, 5xx, timeout, network error). */
function isUnavailable(error: unknown): boolean {
  if (error instanceof ApiRequestError) return error.statusCode === 429 || error.statusCode >= 500;
  return error instanceof Error;
}

/** A fixed -32603 for any other failure; the upstream text is logged at DEBUG only. */
function internalError(method: string, taskId: string, error: unknown, message: string): ProtocolError {
  if (DEBUG) {
    console.error(`[DEBUG] ${method} failed for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return new ProtocolError(-32603, message);
}

/** The result without the private task marker, so it never reaches the client. */
function withoutTaskMarker(result: Record<string, unknown>): Record<string, unknown> {
  const meta = result._meta;
  if (typeof meta !== "object" || meta === null || !(TASK_MARKER_META_KEY in meta)) return result;
  const { [TASK_MARKER_META_KEY]: _marker, ...rest } = meta as Record<string, unknown>;
  const { _meta: _old, ...body } = result;
  return Object.keys(rest).length > 0 ? { ...body, _meta: rest } : body;
}

/**
 * Serves MCP Tasks for `start_agent_build`: rewrites a `tools/call` result carrying the task
 * marker into a task, answers `tasks/get` and `tasks/cancel` from the Control Center, and
 * advertises the extension in `server/discover`.
 *
 * The `tools/call` rewrite wraps the SDK's stored handler rather than returning a task from
 * the tool itself, because the SDK validates a tool's result against its outputSchema and
 * would turn a task into an error. Argument validation still runs first, inside the stored
 * handler. Every result without a valid marker (including `input_required`) passes through,
 * minus any malformed marker.
 *
 * `tasks/get` answers an unreachable Control Center (429, 5xx, timeout, network error) with a
 * `working` result so the client keeps polling. On both task routes a 404 is an unknown task
 * (-32602), a 401 propagates so a revoked token still ends in an HTTP 401, and any other
 * failure is a fixed -32603 that never carries the upstream text.
 */
export function installTaskSupport(server: McpServer, apiClient: SequentumApiClient): void {
  const handlers = (server.server as unknown as { _requestHandlers?: unknown })._requestHandlers;
  if (!(handlers instanceof Map) || !handlers.has("tools/call")) {
    throw new Error("MCP Tasks: the SDK's tools/call handler was not found; check the SDK version");
  }
  const toolsCall = handlers.get("tools/call") as StoredRequestHandler;
  handlers.set("tools/call", async (request: unknown, ctx: unknown) => {
    const result = await toolsCall(request, ctx);
    const marker = taskMarkerOf(result);
    return marker ? toCreateTaskResult(marker, new Date()) : withoutTaskMarker(result);
  });

  server.server.setRequestHandler("tasks/get", { params: taskParamsSchema }, async ({ taskId }) => {
    assertValidTaskId(taskId);
    let task: ExternalAgentBuildTaskResponse;
    try {
      task = await apiClient.getAgentBuildTask(taskId);
    } catch (error) {
      rethrowNotFoundOrAuth(error);
      if (isUnavailable(error)) {
        return { ...unavailableTaskResult(taskId, undefined, new Date()) };
      }
      throw internalError("tasks/get", taskId, error, "Build status is unavailable");
    }
    if (DEBUG && task.status === "error" && task.error) {
      console.error(`[DEBUG] Agent build session ${taskId} failed: ${task.error}`);
    }
    return { ...toTaskGetResult(task, taskId, new Date()) };
  });

  server.server.setRequestHandler("tasks/cancel", { params: taskParamsSchema }, async ({ taskId }) => {
    assertValidTaskId(taskId);
    try {
      await apiClient.cancelAgentBuildTask(taskId);
    } catch (error) {
      rethrowNotFoundOrAuth(error);
      throw internalError("tasks/cancel", taskId, error, "Could not cancel the build");
    }
    return { resultType: "complete" };
  });

  server.server.registerCapabilities({ extensions: { [TASKS_EXTENSION_ID]: {} } });
}
