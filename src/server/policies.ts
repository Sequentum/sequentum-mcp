/**
 * Shared LLM Policy Strings
 *
 * Single source of truth for guidance text that is injected into multiple
 * surfaces (tool descriptions, prompt templates, server instructions).
 * Centralizing here prevents the surfaces from silently drifting apart.
 */

/**
 * Governs how the model should populate the `prompt` argument of
 * `start_agent_build`. Referenced by the tool description in tools.ts
 * and inlined into the build-agent-from-prompt template in prompts.ts.
 */
export const PROMPT_HANDLING_POLICY =
  "PROMPT-HANDLING POLICY: " +
  "(1) Pass the user's wording (and any clarification answers from earlier in the conversation) through verbatim. " +
  "(2) Trivial normalizations (adding 'https://', fixing an obvious URL typo) are fine. " +
  "(3) Do NOT invent details the user did not state — extra fields, output formats, price-handling rules, " +
  "lazy-load instructions, pagination strategies, etc. The upstream Sequentum Agent Builder pipeline will infer these on its own from the page; do not pre-empt it. " +
  "If a detail feels essential to include, that is a sufficiency gap — ask one clarifying question instead of inventing.";

/**
 * The three argument requirements shared by SUFFICIENCY_POLICY and PRE_CALL_CHECK.
 * Single source of truth — editing this updates both surfaces.
 *
 * Exported so tests can assert that both surfaces derive from this exact value
 * (rather than each independently containing similar-looking substrings).
 */
export const SUFFICIENCY_REQUIREMENTS =
  "(1) the target URL or domain, (2) the data the user wants extracted, " +
  "(3) any qualifiers that affect scope (section, filters, language, etc.)";

/**
 * Server-level instruction injected via the MCP `instructions` field in handlers.ts.
 * Governs when the model must ask for clarification before invoking any build/run tool.
 */
export const SUFFICIENCY_POLICY =
  "SUFFICIENCY POLICY — applies to all build and run requests:\n" +
  "Before invoking any tool that builds or runs an agent in response to a scrape or automation request, " +
  `you MUST ensure the following are unambiguous: ${SUFFICIENCY_REQUIREMENTS}.\n\n` +
  "You MAY resolve missing details from explicit conversational context when the context makes the answer clearly unambiguous.\n\n" +
  "You MUST NOT silently extrapolate by analogy. " +
  "This includes copying details from one site onto a different site, or reusing a prior request's data schema for a conceptually different request — even when prior inferences were accepted.\n\n" +
  "When the request is genuinely underspecified, you MUST ask one consolidated clarifying question covering all gaps before any tool call — ask everything you need in one round-trip, not sequentially. " +
  "When you would need to extrapolate by analogy, you MUST state your inference in one short line and ask the user to confirm before any tool call.";

/**
 * Argument-sufficiency requirement injected into every build/run tool description.
 *
 * Why this exists on tool descriptions and not only in `instructions`: under MCP
 * 2026-07-28 there is no `initialize`, so `instructions` ships only in the
 * `server/discover` result, which clients MAY skip. Tool descriptions always ship
 * in `tools/list`, so this is the only always-delivered surface.
 *
 * Deliberately phrased as a requirement on this tool's arguments rather than as
 * behavioural direction, per the Connectors Directory review criteria ("Describe
 * what the tool does. Do not tell Claude how to behave.").
 */
export const PRE_CALL_CHECK =
  "ARGUMENT REQUIREMENTS: this tool's arguments are only sufficient when " +
  `${SUFFICIENCY_REQUIREMENTS} are each unambiguous. ` +
  "Arguments derived by analogy from a different site, or reused from a previous " +
  "request for a different purpose, are not sufficient. When a required detail is " +
  "absent, ask one consolidated clarifying question covering every gap instead of " +
  "supplying an invented value.";
