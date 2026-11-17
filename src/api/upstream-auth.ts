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

/** Record a revocation iff a holdable context is active and the error is a middleware-challenge 401. First call wins. */
export function noteUpstreamUnauthorized(error: ApiRequestError): void {
  const ctx = currentUpstreamAuth();
  if (!isHoldable(ctx) || ctx.revoked) return;
  if (!error.isUnauthorized || !error.isAuthMiddlewareChallenge) return;
  ctx.revoked = { description: error.errorDescription };
}
