// Shared agent-build constants.
//
// These live in a dependency-free leaf module (no imports) so they can be
// safely referenced at module-evaluation time by tools.ts, prompts.ts, and
// handlers.ts without creating an import cycle. Previously these were defined
// in handlers.ts, which imports tools.ts/prompts.ts — and those modules read
// the constants at top level. That circular import left the constants in their
// temporal dead zone during startup, crashing Node with
// "Cannot access 'AGENT_BUILD_MAX_WAIT_LABEL' before initialization".

export const AGENT_BUILD_MAX_WAIT_MS = 300_000;
export const AGENT_BUILD_MAX_WAIT_LABEL = "5 minutes";
export const AGENT_BUILD_MAX_WAIT_SHORT = "5m";
export const AGENT_BUILD_ERROR_MESSAGE = "Build failed. Please review your prompt and try again.";
