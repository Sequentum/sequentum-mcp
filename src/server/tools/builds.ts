/**
 * Agent Builder tool handlers: start a build, check its status (optionally waiting for a change),
 * and stop it.
 *
 * Every build tool call returns within BUILD_HOLD_MAX_S plus a short grace, because claude.ai cuts a
 * tool call at 240 s and ChatGPT reportedly at ~60 s. The result text is a short status card the
 * model can relay; structuredContent carries the same facts. Only stop_agent_build stops a build: a
 * client that cancels, times out or disconnects leaves it running.
 */
import type { CallToolResult, ProgressFn, ToolHandler } from "./types.js";
import { structuredResult, withStructured } from "./types.js";
import { DEBUG } from "./shared.js";
import { AGENT_BUILD_ERROR_MESSAGE, BUILD_HOLD_DEFAULT_S, BUILD_HOLD_MAX_S } from "../constants.js";
import { validateBoolean, validateNumber, validateString } from "../../utils/validation.js";
import { ApiRequestError, AuthenticationError, type ExternalSessionStatusResponse } from "../../api/types.js";
import type { SequentumApiClient } from "../../api/api-client.js";

type BuildStatus = ExternalSessionStatusResponse;

const TERMINAL = new Set(["completed", "ready", "error", "cancelled"]);
/** Time a status read started at the end of a hold may still take before the hold gives up on it. */
const POLL_GRACE_MS = 3_000;
const POLL_MAX_DELAY_MS = 5_000;

/** Resolves after `ms`, or at once when the signal aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    if (signal.aborted) done();
  });
}

/** 5xx, 429, timeouts and network failures are worth asking again; 401, 403 and 404 are not. */
function isTransient(error: unknown): boolean {
  if (error instanceof AuthenticationError) return false;
  if (error instanceof ApiRequestError) return error.isServerError || error.isRateLimited;
  return true;
}

type Read = { status?: BuildStatus; error?: unknown };

/**
 * One status read. With `by`, a read still unanswered at that time is abandoned (the API client
 * retries a 503 for up to minutes, which would outlast the client's own limit).
 */
async function readStatus(apiClient: SequentumApiClient, sessionId: string, by?: number): Promise<Read> {
  const read = apiClient.getAgentBuildStatus(sessionId).then(
    (status): Read => ({ status }),
    (error: unknown): Read => ({ error })
  );
  if (by === undefined) return read;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Read>((resolve) => {
    timer = setTimeout(() => resolve({ error: new Error("no answer in time") }), Math.max(0, by - Date.now()));
  });
  try {
    return await Promise.race([read, late]);
  } finally {
    clearTimeout(timer);
  }
}

type Held = Read & { aborted?: boolean };

/**
 * Polls (1 s, then x1.5, capped at 5 s) until the build reaches a terminal status, its status or
 * the presence of its plan differs from `baseline`, a read fails, the deadline passes, or the
 * client goes away. It never stops the build.
 */
async function hold(
  apiClient: SequentumApiClient,
  sessionId: string,
  signal: AbortSignal,
  deadline: number,
  baseline: BuildStatus,
  onProgress: (status: BuildStatus) => Promise<void>
): Promise<Held> {
  let last = baseline;
  let delay = 1_000;
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) return { status: last };
    await pause(Math.min(delay, left), signal);
    if (signal.aborted) return { status: last, aborted: true };

    const read = await readStatus(apiClient, sessionId, deadline + POLL_GRACE_MS);
    if (!read.status) return { status: last, error: read.error };

    const status = read.status;
    if (TERMINAL.has(status.status) || status.status !== baseline.status || !status.plan !== !baseline.plan) {
      return { status };
    }
    last = status;
    await onProgress(status);
    delay = Math.min(delay * 1.5, POLL_MAX_DELAY_MS);
  }
}

/** The build's own clock from the API (model time plus browser I/O time), when it reports one. */
function apiElapsed(s?: BuildStatus): number | undefined {
  if (s?.agentElapsedSeconds == null && s?.browserIoSeconds == null) return undefined;
  return Math.round((s?.agentElapsedSeconds ?? 0) + (s?.browserIoSeconds ?? 0));
}

/** Progress must strictly increase; seconds that did not move are skipped. */
function progressIn(sendProgress: ProgressFn) {
  let last = 0;
  return async (seconds: number, message: string) => {
    if (seconds <= last) return;
    last = seconds;
    await sendProgress(seconds, undefined, message);
  };
}

// ==========================================
// Status card
// ==========================================

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const txt = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const count = (v: unknown): number => (typeof v === "number" ? v : 0);

function duration(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function stageOf(status: string | undefined, partial: unknown, hasPlan: boolean, elapsed: number | undefined, checkFailed: boolean): string {
  if (checkFailed) return "Checking";
  switch (status) {
    case "completed":
    case "ready":
      return partial === true ? "Partially completed" : "Task completed";
    case "error":
      return "Failed";
    case "cancelled":
      return "Stopped";
  }
  if (hasPlan) return "Building the Agent";
  return elapsed !== undefined && elapsed < 10 ? "Starting" : "Looking at the page";
}

/** "Plan: ..." and "Guessed without asking: ..." lines. The plan is loosely typed: read it defensively. */
function planText(plan: unknown): string[] {
  const p = rec(plan);
  if (!plan) return [];
  const item = txt(rec(p.item).text);
  const target = txt(rec(p.target).url) ?? txt(rec(p.target).text);
  const scope = txt(rec(p.scope).text);
  const fields = list(p.fields).map((f) => txt(rec(f).name)).filter((f): f is string => !!f);
  const lines: string[] = [];
  const what = [item && `each row is ${item}`, target && `from ${target}`, scope].filter(Boolean).join(", ");
  if (what || fields.length) {
    lines.push(`Plan: ${what || "see plan"}${fields.length ? `. Fields: ${fields.join(", ")}` : ""}.`);
  }

  const guesses: string[] = [];
  const guess = (label: string | undefined, provenance: unknown) => {
    if (label && (provenance === "assumption" || provenance === "default")) guesses.push(`"${label}" (${provenance})`);
  };
  for (const key of ["target", "item", "scope", "output"]) guess(txt(rec(p[key]).text), rec(p[key]).provenance);
  for (const key of ["exclusions", "navigation"]) for (const line of list(p[key])) guess(txt(rec(line).text), rec(line).provenance);
  for (const f of list(p.fields)) {
    const name = txt(rec(f).name);
    guess(name && `${name} field`, rec(f).provenance);
  }
  if (guesses.length) lines.push(`Guessed without asking: ${guesses.join(", ")}.`);
  return lines;
}

function reportText(report: unknown): string[] {
  if (!report) return [];
  const r = rec(report);
  const lines = [`Plan check: ${count(r.met)} met, ${count(r.partial)} partial, ${count(r.unmet)} unmet.`];
  for (const [key, value] of Object.entries(rec(r.lines))) {
    const status = txt(rec(value).status);
    if (status && status !== "met") {
      const evidence = txt(rec(value).evidence);
      lines.push(`- ${key}: ${status}${evidence ? ` (${evidence})` : ""}`);
    }
  }
  const questions = list(r.questions).filter((q) => txt(rec(q).text));
  if (questions.length) {
    lines.push("Questions the build answered with a default (the first reply is what it did):");
    questions.forEach((q, i) => {
      const replies = list(rec(q).replies).map(txt).filter(Boolean).map((reply) => `"${reply}"`);
      lines.push(`${i + 1}. ${txt(rec(q).text)}${replies.length ? ` ${replies.join(" / ")}` : ""}`);
    });
  }
  return lines;
}

interface CardInput {
  sessionId: string;
  /** Last known status. Undefined when no read has succeeded. */
  status?: BuildStatus;
  elapsedSeconds?: number;
  /** The last status read failed, but the build may still be running. */
  checkFailed?: string;
  /** One extra sentence for the card (why the call returned early). */
  message?: string;
  spaceId?: number;
  controlCenterUrl?: string;
}

/** The status card: `text` for the model to relay, `value` for structuredContent, `line` for progress. */
function card(input: CardInput): { text: string; value: Record<string, unknown>; line: string } {
  const { sessionId, elapsedSeconds, checkFailed, message, controlCenterUrl } = input;
  const { error: _raw, ...fields } = input.status ?? ({} as Partial<BuildStatus>);
  const status = input.status?.status;
  const done = status !== undefined && TERMINAL.has(status);
  const stage = stageOf(status, fields.partial, !!fields.plan, elapsedSeconds, !!checkFailed);
  const base = controlCenterUrl?.replace(/\/$/, "");
  const watchUrl = !done && base ? `${base}/agent-builder?sessionId=${encodeURIComponent(sessionId)}` : undefined;
  const agentUrl =
    fields.agentId && base ? `${base}/space/${input.spaceId ?? 0}/config/${fields.agentId}/details/runs` : undefined;

  const value = {
    ...fields,
    ...(status === "error" ? { error: AGENT_BUILD_ERROR_MESSAGE } : {}),
    sessionId,
    status,
    stage,
    done,
    elapsedSeconds,
    nextCheckSeconds: done ? undefined : BUILD_HOLD_DEFAULT_S,
    watchUrl,
    agentUrl,
    message,
  };

  const finished = status === "completed" || status === "ready";
  const time =
    elapsedSeconds === undefined
      ? ""
      : ` · ${finished ? "built in " : done ? "after " : ""}${duration(elapsedSeconds)}${done ? "" : " so far"}`;
  const agent = fields.agentId ? `${fields.agentName ?? "Agent"} (agent ${fields.agentId})` : undefined;
  let headline: string;
  const lines: string[] = [];
  switch (status) {
    case "completed":
    case "ready":
      headline = `${fields.partial === true ? "Agent partly ready" : "Agent ready"}: ${agent ?? "no agent id returned"}`;
      if (fields.partial === true && txt(fields.summary)) lines.push(`What is missing: ${txt(fields.summary)}`);
      lines.push(...planText(fields.plan), ...reportText(fields.report));
      if (agentUrl) lines.push(`Open in Sequentum: ${agentUrl}`);
      lines.push(
        `sessionId: "${sessionId}". The build is finished.` +
          (list(rec(fields.report).questions).length
            ? " A different answer to a question needs a new start_agent_build whose prompt includes it."
            : "")
      );
      break;
    case "error":
    case "cancelled":
      headline = status === "error" ? "Build failed" : "Build stopped";
      lines.push(status === "error" ? AGENT_BUILD_ERROR_MESSAGE : "The build was stopped before it finished.");
      if (agent) lines.push(`An Agent was already saved: ${agent}${agentUrl ? `, ${agentUrl}` : ""}.`);
      lines.push(`sessionId: "${sessionId}". Nothing is running now.`);
      break;
    default:
      headline = status ? `Building your Agent: ${stage}` : "Checking on the build";
      if (checkFailed) lines.push(`Could not read the build status this time (${checkFailed}). That does not stop the build.`);
      if (message) lines.push(message);
      lines.push(...planText(fields.plan));
      if (watchUrl) lines.push(`Watch it live: ${watchUrl}`);
      lines.push(
        `sessionId: "${sessionId}". The build keeps running on Sequentum's servers whether or not anyone checks. ` +
          `Next update: call get_agent_build_status with this sessionId and waitSeconds ${BUILD_HOLD_DEFAULT_S}.`
      );
  }

  return { text: [`**${headline}**${time}`, ...lines].join("\n"), value, line: `${headline}${time}` };
}

/** Turns a finished hold into a tool result. A non-transient read failure is thrown, tagged with the sessionId. */
function respond(held: Held, input: Omit<CardInput, "status" | "checkFailed" | "message">, failTerminal: boolean): CallToolResult {
  let checkFailed: string | undefined;
  if (held.error) {
    if (!isTransient(held.error)) {
      const error = held.error instanceof Error ? held.error : new Error(String(held.error));
      // handlers.ts appends this to the error text, so the caller keeps the build handle.
      Object.assign(error, {
        buildNote:
          `Build sessionId: "${input.sessionId}". This error did not stop the build. ` +
          "Fix the problem above, then check it with get_agent_build_status. A session that is not found has ended; " +
          "an Agent it saved is listed by list_agents.",
      });
      throw error;
    }
    checkFailed = held.error instanceof ApiRequestError ? `HTTP ${held.error.statusCode}` : "no answer in time";
  }
  const message = held.aborted
    ? "The tool call was cancelled, but the build keeps running. Only stop_agent_build stops it."
    : undefined;
  const { text, value } = card({ ...input, status: held.status, checkFailed, message });
  const status = held.status?.status;
  if (status === "error" && DEBUG && held.status?.error) {
    console.error(`[DEBUG] Agent build session ${input.sessionId} failed: ${held.status.error}`);
  }
  const result = withStructured({ content: [{ type: "text", text }] }, value);
  return failTerminal && (status === "error" || status === "cancelled") ? { ...result, isError: true } : result;
}

// ==========================================
// Handlers
// ==========================================

const start_agent_build: ToolHandler = async (args, { apiClient, sendProgress, signal, controlCenterUrl }) => {
  const params = args;
  const prompt = validateString(params, "prompt", {
    required: true,
    minLength: 10,
    maxLength: 5000,
    trim: true,
  })!;
  const spaceId = validateNumber(params, "spaceId", { required: false, min: 1, integer: true });
  const waitForCompletion = validateBoolean(params, "waitForCompletion", { required: false, default: true })!;

  const startedAt = Date.now();
  const startResponse = await apiClient.startAgentBuild({ prompt, spaceId });

  if (!waitForCompletion) {
    return structuredResult(startResponse);
  }

  // Hold at most BUILD_HOLD_DEFAULT_S: return as soon as the plan is written or the build ends.
  const { sessionId } = startResponse;
  const elapsed = () => Math.round((Date.now() - startedAt) / 1000);
  // The API's clock when it reports one (the same number get_agent_build_status shows), else ours.
  const cardInput = (status?: BuildStatus) => ({
    sessionId,
    elapsedSeconds: apiElapsed(status) ?? elapsed(),
    spaceId,
    controlCenterUrl,
  });
  const progress = progressIn(sendProgress);
  await sendProgress(0, undefined, `Build started. sessionId: ${sessionId}`);

  const held = await hold(
    apiClient,
    sessionId,
    signal,
    startedAt + BUILD_HOLD_DEFAULT_S * 1000,
    { status: "processing" },
    (status) => progress(elapsed(), card({ ...cardInput(status), status }).line)
  );
  return respond(held, cardInput(held.status), true);
};

const get_agent_build_status: ToolHandler = async (args, { apiClient, sendProgress, signal, controlCenterUrl }) => {
  const params = args;
  // maxLength:256 guards against oversized session IDs being forwarded to the API (#7)
  const sessionId = validateString(params, "sessionId", { required: true, maxLength: 256 })!;
  // Clamped rather than rejected: a model that asks for 60 gets 50, not an error.
  const waitSeconds = Math.min(validateNumber(params, "waitSeconds", { required: false, min: 0 }) ?? 0, BUILD_HOLD_MAX_S);

  const calledAt = Date.now();
  const deadline = calledAt + waitSeconds * 1000;
  // Without a wait this is one plain read, as before waitSeconds existed.
  let held: Held = await readStatus(apiClient, sessionId, waitSeconds > 0 ? deadline + POLL_GRACE_MS : undefined);

  if (held.status && !TERMINAL.has(held.status.status) && waitSeconds > 0) {
    const progress = progressIn(sendProgress);
    held = await hold(apiClient, sessionId, signal, deadline, held.status, (status) =>
      progress(
        Math.round((Date.now() - calledAt) / 1000),
        card({ sessionId, status, elapsedSeconds: apiElapsed(status), controlCenterUrl }).line
      )
    );
  }
  return respond(held, { sessionId, elapsedSeconds: apiElapsed(held.status), controlCenterUrl }, false);
};

const stop_agent_build: ToolHandler = async (args, { apiClient }) => {
  const params = args;
  // maxLength:256 guards against oversized session IDs (#7)
  const sessionId = validateString(params, "sessionId", { required: true, maxLength: 256 })!;
  await apiClient.stopAgentBuild(sessionId);
  // Return structured JSON consistent with every other tool handler (#8)
  return structuredResult({ stopped: true, sessionId });
};

export const buildToolHandlers: Record<string, ToolHandler> = {
  start_agent_build,
  get_agent_build_status,
  stop_agent_build,
};
