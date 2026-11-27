/**
 * User confirmation for destructive tools, through elicitation.
 *
 * The tools marked `destructiveHint: true` ask the user to confirm before they run, when the
 * client can show a form. On protocol 2026-07-28 the server is stateless, so the confirmation is a
 * multi-round-trip: the first call returns `input_required` with a yes/no form, and the client
 * retries the same call carrying the answer in `inputResponses`. The question is rebuilt from the
 * call's own arguments, so no `requestState` is needed.
 *
 * Only the 2026-07-28 era is gated. The 2025-era path is served by a stateless per-request
 * fallback, where a push-style elicitation answer arrives in a separate POST that the waiting
 * instance never sees. Returning `input_required` there would make the SDK's legacy shim try
 * exactly that, so legacy calls, and clients that declare no form elicitation, run directly as
 * they always have.
 */

import {
  CLIENT_CAPABILITIES_META_KEY,
  PROTOCOL_VERSION_META_KEY,
  inputRequired,
  inputResponse,
  type CallToolResult,
  type InputRequiredResult,
} from "@modelcontextprotocol/server";
import { tools } from "./tools.js";

type Args = Record<string, unknown>;

/** Key of the confirmation entry in `inputRequests` / `inputResponses`. */
export const CONFIRM_KEY = "confirm";

/** The same rule the handlers apply through `validateNumber(..., { min: 1, integer: true })`. */
function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/**
 * The question shown to the user for each destructive tool. A builder returns `undefined` when the
 * ids are invalid: the call then skips the question and validation (the SDK's schema check or the
 * handler's) reports the error, so nobody is asked to confirm a call that would fail anyway.
 */
export const TOOL_CONFIRMATIONS: Readonly<Record<string, (args: Args) => string | undefined>> = {
  kill_agent: ({ agentId, runId }) =>
    isId(agentId) && isId(runId) ? `Force-terminate run ${runId} of agent ${agentId}?` : undefined,
  delete_run: ({ agentId, runId, removeMethod }) => {
    if (!isId(agentId) || !isId(runId)) return undefined;
    const target = `run ${runId} of agent ${agentId}`;
    switch (removeMethod) {
      case "RemoveAllFiles":
        return `Delete all files of ${target}? The run record is kept. This cannot be undone.`;
      case "RemoveAllFilesAndAgentInput":
        return `Delete all files and the agent input of ${target}? The run record is kept. This cannot be undone.`;
      default:
        return `Delete ${target} and all its files? This cannot be undone.`;
    }
  },
  delete_agent_schedule: ({ agentId, scheduleId }) =>
    isId(agentId) && isId(scheduleId)
      ? `Delete schedule ${scheduleId} of agent ${agentId}? The agent will no longer run on it.`
      : undefined,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a request is on the 2026-07-28 era and its client declared form elicitation. A bare
 * `elicitation: {}` counts as form support (the rule from before elicitation had modes); a client
 * that declares only `url` does not support forms.
 */
export function clientSupportsFormElicitation(envelope: Record<string, unknown> | undefined): boolean {
  if (!envelope || typeof envelope[PROTOCOL_VERSION_META_KEY] !== "string") return false;
  const capabilities = envelope[CLIENT_CAPABILITIES_META_KEY];
  if (!isObject(capabilities) || !isObject(capabilities.elicitation)) return false;
  const elicitation = capabilities.elicitation;
  return "form" in elicitation || !("url" in elicitation);
}

export type ConfirmationOutcome =
  | { kind: "run" }
  | { kind: "respond"; result: CallToolResult | InputRequiredResult };

const RUN: ConfirmationOutcome = { kind: "run" };

const confirmationSchema = {
  type: "object" as const,
  properties: { [CONFIRM_KEY]: { type: "boolean" as const, title: "Yes, go ahead" } },
  required: [CONFIRM_KEY],
};

/**
 * The non-error result for a call that does not run. `declined` is a real user answer; `unreadable`
 * is an answer the server could not read, which must not be reported to the model as the user's
 * choice.
 */
function cancelled(toolName: string, reason: "declined" | "unreadable"): ConfirmationOutcome {
  const title = tools.find((t) => t.name === toolName)?.annotations?.title ?? toolName;
  const text =
    reason === "declined"
      ? `Cancelled: the user did not confirm ${title}. Nothing was changed.`
      : `Cancelled: the confirmation answer for ${title} could not be read, so it did not run. ` +
        "Retrying from this client will give the same result. Nothing was changed.";
  return { kind: "respond", result: { content: [{ type: "text" as const, text }] } };
}

/**
 * Decide what a tool call does before dispatch: run it, ask for confirmation, or answer that the
 * user declined. `mcpReq` is the handler context's `ctx.mcpReq`.
 *
 * Any answer under the confirm key is final, whatever the retry declares, and is never asked again:
 * without `requestState` the server cannot count rounds, so re-asking could loop. Only an accepted
 * `confirm: true` runs the tool. A decline, a cancel, or an accept whose `confirm` is `false` or
 * absent (from absent or object `content`) is the user's choice. Anything else (an accept whose
 * `content` is present but not an object, or whose `confirm` is not a boolean, an unknown action,
 * a non-object, or an entry the SDK dropped) is unreadable and cancels without saying the user
 * declined.
 */
export function confirmationGate(
  toolName: string,
  args: Args,
  mcpReq: {
    envelope?: unknown;
    inputResponses?: Record<string, unknown>;
    droppedInputResponseKeys?: string[];
  }
): ConfirmationOutcome {
  const build = TOOL_CONFIRMATIONS[toolName];
  if (!build) return RUN;

  const answered =
    (isObject(mcpReq.inputResponses) && CONFIRM_KEY in mcpReq.inputResponses) ||
    (mcpReq.droppedInputResponseKeys?.includes(CONFIRM_KEY) ?? false);
  if (answered) {
    const response = inputResponse(mcpReq.inputResponses, CONFIRM_KEY);
    if (response.kind !== "elicit") return cancelled(toolName, "unreadable");
    if (response.action !== "accept") return cancelled(toolName, "declined");
    // The SDK drops `content` that is not a plain object, so read the raw entry to tell a malformed
    // payload (a string, null, an array) from an absent one.
    const rawContent = (mcpReq.inputResponses?.[CONFIRM_KEY] as Record<string, unknown>).content;
    if (rawContent !== undefined && !isObject(rawContent)) return cancelled(toolName, "unreadable");
    const confirm = response.content?.[CONFIRM_KEY];
    if (confirm === true) return RUN;
    // An accept without `confirm` is a form submitted with the box unticked: the client SDK does not
    // enforce `required`, so that is the user not confirming, not an unreadable answer.
    return cancelled(toolName, confirm === false || confirm === undefined ? "declined" : "unreadable");
  }

  if (!clientSupportsFormElicitation(mcpReq.envelope as Record<string, unknown> | undefined)) {
    return RUN;
  }
  const message = build(args);
  if (message === undefined) return RUN;

  return {
    kind: "respond",
    result: inputRequired({
      inputRequests: {
        [CONFIRM_KEY]: inputRequired.elicit({ message, requestedSchema: confirmationSchema }),
      },
    }),
  };
}
