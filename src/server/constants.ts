// Shared agent-build constants.
//
// These live in a dependency-free leaf module (no imports) so they can be
// safely referenced at module-evaluation time by tools.ts, prompts.ts, and
// handlers.ts without creating an import cycle. Previously these were defined
// in handlers.ts, which imports tools.ts/prompts.ts — and those modules read
// the constants at top level. That circular import left the constants in their
// temporal dead zone during startup, crashing Node with
// "Cannot access 'AGENT_BUILD_MAX_WAIT_LABEL' before initialization" (a constant since removed).

/**
 * How long one build tool call may hold before it returns a status card. Both stay under the
 * shortest client tool-call limit we know of (ChatGPT, reported ~60 s; claude.ai and Claude
 * Desktop cut at 240 s): a call the client gives up on shows the user nothing.
 */
export const BUILD_HOLD_DEFAULT_S = 45;
export const BUILD_HOLD_MAX_S = 50;
export const AGENT_BUILD_ERROR_MESSAGE = "Build failed. Please review your prompt and try again.";

/**
 * Largest combined count of array elements and object members one `tools/call`
 * `arguments` payload may carry (SDK `maxToolInputElements`). A second
 * cap beside the 4 MiB body limit: a small body can still hold a huge number of
 * tiny elements, and validating those is what exhausts memory. Our tools take a
 * handful of scalar fields and short id lists, so 1,000 is far above any
 * legitimate call.
 */
export const MAX_TOOL_INPUT_ELEMENTS = 1_000;

/**
 * Strictly parse a non-negative-integer env var override, or fall back to
 * the default.
 *
 * `Number.parseInt` stops at the first non-digit instead of rejecting the
 * string, so `"1e6"` silently becomes `1` and `"3,600,000"` silently becomes
 * `3` — both are non-negative safe integers, so a naive caller would accept
 * them without complaint, leaving the tunable value quietly wrong (e.g. every
 * list method publicly cached for 1ms, or a rate-limit window of 1ms) with no
 * warning anywhere. A malformed value must fail loudly at startup instead of
 * degrading behaviour invisibly.
 *
 * @param name - The env var's name, used only in error messages.
 * @param raw - The raw env var value (`process.env[name]`).
 * @param defaultValue - Returned when `raw` is `undefined`.
 *
 * Exported for testing: callers below evaluate this once at module load, so
 * tests exercise the function directly rather than re-importing the module
 * under a mutated `process.env`.
 */
export function parseStrictNonNegativeInt(name: string, raw: string | undefined, defaultValue: number): number {
  if (raw === undefined) return defaultValue;

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new RangeError(`${name} must be a non-negative integer, got "${raw}"`);
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(`${name} is out of safe integer range: "${raw}"`);
  }

  return parsed;
}

/**
 * Strictly parse the LIST_CACHE_TTL_MS override, or fall back to the default.
 * Thin, name-bound wrapper over {@link parseStrictNonNegativeInt}; kept as its
 * own export because existing tests call it directly.
 */
export function parseListCacheTtlMs(raw: string | undefined): number {
  return parseStrictNonNegativeInt("LIST_CACHE_TTL_MS", raw, 3_600_000);
}

/**
 * Freshness hint for cacheable list results (MCP 2026-07-28 `ttlMs`).
 *
 * One hour balances real client-side prompt-cache hits against a deploy
 * propagating without clients restarting. Override with LIST_CACHE_TTL_MS.
 */
export const LIST_CACHE_TTL_MS = parseListCacheTtlMs(process.env.LIST_CACHE_TTL_MS);

/**
 * Rate-limit rejection code. MCP 2026-07-28 reserves -32020..-32099 for the
 * specification (-32020 HeaderMismatch, -32021 MissingRequiredClientCapability,
 * -32022 UnsupportedProtocolVersion) and leaves -32000..-32019 implementation-defined.
 * The previous value -32029 fell inside the reserved range.
 */
export const RATE_LIMIT_ERROR_CODE = -32010;

/**
 * Strictly parse the MCP_RATE_LIMIT_WINDOW_MS override, or fall back to the
 * default. See {@link parseStrictNonNegativeInt} for why this rejects rather
 * than silently truncating malformed values like "1e6".
 */
export function parseRateLimitWindowMs(raw: string | undefined): number {
  return parseStrictNonNegativeInt("MCP_RATE_LIMIT_WINDOW_MS", raw, 60_000);
}

/**
 * Strictly parse the MCP_RATE_LIMIT_MAX override, or fall back to the default.
 * See {@link parseStrictNonNegativeInt} for why this rejects rather than
 * silently truncating malformed values like "1e6".
 */
export function parseRateLimitMax(raw: string | undefined): number {
  return parseStrictNonNegativeInt("MCP_RATE_LIMIT_MAX", raw, 100);
}

/**
 * Rate-limit window (ms) and max requests per window, per process, per IP.
 *
 * Without session affinity a client's requests scatter across pods and each
 * pod keeps its own in-process counter, so the cluster-wide ceiling becomes
 * (pod count x MCP_RATE_LIMIT_MAX). Ops needs to divide the desired global
 * rate by the replica count when setting MCP_RATE_LIMIT_MAX. Defaults match
 * the previous hardcoded values, so behaviour is unchanged unless set.
 *
 * Deliberately NOT backed by a shared store (e.g. Redis): that would
 * reintroduce the cross-request state this migration removed in favor of a
 * stateless server.
 */
export const MCP_RATE_LIMIT_WINDOW_MS = parseRateLimitWindowMs(process.env.MCP_RATE_LIMIT_WINDOW_MS);
export const MCP_RATE_LIMIT_MAX = parseRateLimitMax(process.env.MCP_RATE_LIMIT_MAX);
