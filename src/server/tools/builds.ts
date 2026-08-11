/**
 * Agent Builder tool handlers: start a build (with an internal polling loop),
 * check build status, and stop an in-progress build.
 *
 * Moved verbatim out of the `tools/call` switch in handlers.ts as part of the
 * dispatch-map refactor (see agents.ts for the original TODO reference).
 */
import type { ToolHandler } from "./types.js";
import { jsonResult } from "./types.js";
import { DEBUG } from "./shared.js";
import {
  AGENT_BUILD_MAX_WAIT_MS,
  AGENT_BUILD_MAX_WAIT_LABEL,
  AGENT_BUILD_MAX_WAIT_SHORT,
  AGENT_BUILD_ERROR_MESSAGE,
} from "../constants.js";
import { validateBoolean, validateNumber, validateString } from "../../utils/validation.js";

const start_agent_build: ToolHandler = async (args, { apiClient, sendProgress, signal }) => {
  const params = args;
  const prompt = validateString(params, "prompt", {
    required: true,
    minLength: 10,
    maxLength: 5000,
    trim: true,
  })!;
  const spaceId = validateNumber(params, "spaceId", { required: false, min: 1, integer: true });
  const waitForCompletion = validateBoolean(params, "waitForCompletion", { required: false, default: true })!

  const startResponse = await apiClient.startAgentBuild({ prompt, spaceId });

  if (!waitForCompletion) {
    return jsonResult(startResponse);
  }

  // Internal polling loop — client sees a single tool call instead of 4-12 roundtrips.
  const { sessionId } = startResponse;
  const MAX_WAIT_MS = AGENT_BUILD_MAX_WAIT_MS;
  const startTime = Date.now();
  let delay = 1_000; // initial delay before first poll (reduced from 3s for fast builds)

  // sendProgress is a destructured dep (see the handler signature above); the
  // polling loop below just calls it.
  await sendProgress(0, 1, `Build started. sessionId: ${sessionId}`);

  while (Date.now() - startTime < MAX_WAIT_MS) {
    // Bail out early if the MCP client cancelled or disconnected.
    if (signal?.aborted) {
      apiClient.stopAgentBuild(sessionId).catch(() => {});
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: "cancelled", sessionId }, null, 2),
          },
        ],
        isError: true,
      };
    }

    await new Promise<void>((resolve) => setTimeout(resolve, delay));

    const status = await apiClient.getAgentBuildStatus(sessionId);

    if (status.status === "completed" || status.status === "ready") {
      return jsonResult({ status: status.status, agentId: status.agentId, agentName: status.agentName, sessionId });
    }

    if (status.status === "error") {
      if (DEBUG && status.error) {
        console.error(`[DEBUG] Agent build session ${sessionId} failed: ${status.error}`);
      }
      return {
        content: [
          {
            type: "text",
            text: AGENT_BUILD_ERROR_MESSAGE,
          },
        ],
        isError: true,
      };
    }

    if (status.status === "cancelled") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: "cancelled", sessionId }, null, 2),
          },
        ],
        isError: true,
      };
    }

    // status === "processing" — keep waiting with backoff (cap at 15s).
    // Progress uses raw seconds (e.g. 26 / 300) so the numerator/denominator are
    // obviously time units in Cursor's tool panel, not a completion percentage.
    // Tested: 0/0 renders as literal "0 / 0" in Cursor (confusing), so we use
    // elapsed seconds with "max 5m" in the message to keep the context clear.
    const elapsed = Date.now() - startTime;
    await sendProgress(
      Math.round(elapsed / 1000),
      MAX_WAIT_MS / 1000,
      `Build in progress... (${Math.round(elapsed / 1000)}s elapsed, max ${AGENT_BUILD_MAX_WAIT_SHORT})`
    );
    delay = Math.min(delay * 1.5, 15_000);
  }

  // Timed out — the build is still running on the backend. Return the sessionId
  // so the caller can check status manually via get_agent_build_status.
  // isError is intentionally omitted: the build has not failed, we just stopped waiting.
  return jsonResult({
    status: "timeout",
    sessionId,
    message: `Build did not complete within ${AGENT_BUILD_MAX_WAIT_LABEL}. The build is still running. Use get_agent_build_status with the sessionId to check.`,
  });
};

const get_agent_build_status: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  // maxLength:256 guards against oversized session IDs being forwarded to the API (#7)
  const sessionId = validateString(params, "sessionId", { required: true, maxLength: 256 })!;
  const status = await apiClient.getAgentBuildStatus(sessionId);

  // The backend's `error` field is a raw ex.Message passthrough that can contain
  // stack traces, internal endpoint paths, upstream LLM URLs, and similar. Replace
  // it with a fixed user-facing string; log the raw value at DEBUG only (#6).
  if (DEBUG && status.status === "error" && status.error) {
    console.error(`[DEBUG] Agent build session ${sessionId} failed: ${status.error}`);
  }
  const sanitized = {
    ...status,
    error: status.status === "error"
      ? AGENT_BUILD_ERROR_MESSAGE
      : undefined,
  };

  return jsonResult(sanitized);
};

const stop_agent_build: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  // maxLength:256 guards against oversized session IDs (#7)
  const sessionId = validateString(params, "sessionId", { required: true, maxLength: 256 })!;
  await apiClient.stopAgentBuild(sessionId);
  // Return structured JSON consistent with every other tool handler (#8)
  return jsonResult({ stopped: true, sessionId });
};

export const buildToolHandlers: Record<string, ToolHandler> = {
  start_agent_build,
  get_agent_build_status,
  stop_agent_build,
};
