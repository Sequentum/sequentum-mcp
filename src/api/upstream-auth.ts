/**
 * Request-scoped record of an upstream (Control Center) token revocation.
 *
 * The HTTP server enters a context for each MCP request; the API client records a
 * revocation into it when the upstream answers 401 with the auth-middleware challenge,
 * and the MCP handler reads it to turn the response into an HTTP 401.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { ApiRequestError } from "./types.js";

export interface UpstreamAuthContext {
  readonly tokenType?: string;
  /** Origin used to build the challenge (getMcpServerOrigin(req)). */
  readonly origin: string;
  /** Called once when the 401 is actually sent. */
  readonly onRevoked: (described: boolean) => void;
  /** Set by noteUpstreamUnauthorized. */
  revoked?: { description: string | null };
  /** Set when a state-changing call may have changed something; see beginUpstreamMutation. */
  mutated?: boolean;
  /** Non-idempotent calls sent and not yet answered; see beginUpstreamMutation. */
  pendingMutations?: number;
}

const storage = new AsyncLocalStorage<UpstreamAuthContext>();

export function runWithUpstreamAuth<T>(ctx: UpstreamAuthContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentUpstreamAuth(): UpstreamAuthContext | undefined {
  return storage.getStore();
}

/** True when this context can ever turn into a 401 (tokenType === "authorization_code"). */
export function isHoldable(ctx: UpstreamAuthContext | undefined): ctx is UpstreamAuthContext {
  return ctx?.tokenType === "authorization_code";
}

/**
 * Count an upstream call that may change something (anything but a read) as in flight
 * until the returned function is called (calling it again does nothing). A client
 * replays the request after it re-authorizes, so a request that may have changed
 * something upstream keeps its tool result instead of a 401, whichever came first, the
 * revocation or the call. While the call is in flight it may already have done so. Pass
 * `mayHaveChanged: false` only when the upstream refused the call outright (a 4xx); a
 * success, a 5xx or a network error may have changed something.
 */
export function beginUpstreamMutation(): (mayHaveChanged: boolean) => void {
  const ctx = currentUpstreamAuth();
  if (!isHoldable(ctx)) return () => {};
  ctx.pendingMutations = (ctx.pendingMutations ?? 0) + 1;
  let ended = false;
  return (mayHaveChanged) => {
    if (ended) return;
    ended = true;
    if (mayHaveChanged) ctx.mutated = true;
    ctx.pendingMutations = (ctx.pendingMutations ?? 1) - 1;
  };
}

/**
 * True when the request should be answered with a 401: a revocation was recorded and no
 * state-changing call may have changed something or is still in flight, so the client's
 * replay after re-authorizing cannot repeat a side effect.
 */
export function mayAnswerUnauthorized(ctx: UpstreamAuthContext): boolean {
  return ctx.revoked !== undefined && !ctx.mutated && !ctx.pendingMutations;
}

/**
 * Record a revocation iff a holdable context is active, no state-changing call in it
 * may have changed something, and the error is a middleware-challenge 401. First call wins.
 */
export function noteUpstreamUnauthorized(error: ApiRequestError): void {
  const ctx = currentUpstreamAuth();
  if (!isHoldable(ctx) || ctx.revoked || ctx.mutated) return;
  if (!error.isUnauthorized || !error.isAuthMiddlewareChallenge) return;
  ctx.revoked = { description: error.errorDescription };
}
