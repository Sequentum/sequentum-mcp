import { describe, it, expect } from "vitest";
import {
  runWithUpstreamAuth,
  currentUpstreamAuth,
  isHoldable,
  beginUpstreamMutation,
  mayAnswerUnauthorized,
  noteUpstreamUnauthorized,
  type UpstreamAuthContext,
} from "./upstream-auth.js";
import { ApiRequestError } from "./types.js";

const CHALLENGE = 'Bearer resource_metadata="https://cc.example.com/.well-known/oauth-protected-resource"';

function makeCtx(tokenType?: string): UpstreamAuthContext {
  return { tokenType, origin: "http://localhost:3000", onRevoked: () => {} };
}

function err(status: number, wwwAuthenticate: string | null): ApiRequestError {
  return new ApiRequestError(status, "x", "msg", "/api/test", { wwwAuthenticate });
}

describe("upstream-auth context", () => {
  it("records a middleware 401 for an authorization_code token", () => {
    const ctx = makeCtx("authorization_code");
    runWithUpstreamAuth(ctx, () => noteUpstreamUnauthorized(err(401, CHALLENGE)));
    expect(ctx.revoked).toEqual({ description: null });

    const described = makeCtx("authorization_code");
    runWithUpstreamAuth(described, () =>
      noteUpstreamUnauthorized(err(401, `${CHALLENGE}, error="invalid_token", error_description="Token revoked"`))
    );
    expect(described.revoked).toEqual({ description: "Token revoked" });
  });

  it("ignores client_credentials, agent and missing token types", () => {
    for (const type of ["client_credentials", "agent", undefined]) {
      const ctx = makeCtx(type);
      runWithUpstreamAuth(ctx, () => noteUpstreamUnauthorized(err(401, CHALLENGE)));
      expect(ctx.revoked).toBeUndefined();
      expect(isHoldable(ctx)).toBe(false);
    }
    expect(isHoldable(makeCtx("authorization_code"))).toBe(true);
    expect(isHoldable(undefined)).toBe(false);
  });

  it("ignores a 401 without the middleware challenge", () => {
    const ctx = makeCtx("authorization_code");
    runWithUpstreamAuth(ctx, () => noteUpstreamUnauthorized(err(401, null)));
    expect(ctx.revoked).toBeUndefined();
  });

  it("ignores 403", () => {
    const ctx = makeCtx("authorization_code");
    runWithUpstreamAuth(ctx, () =>
      noteUpstreamUnauthorized(err(403, `${CHALLENGE}, error="insufficient_scope"`))
    );
    expect(ctx.revoked).toBeUndefined();
  });

  it("is a no-op outside any context", () => {
    expect(currentUpstreamAuth()).toBeUndefined();
    expect(() => noteUpstreamUnauthorized(err(401, CHALLENGE))).not.toThrow();
  });

  it("ignores a 401 once a state-changing call may have changed something", () => {
    const ctx = makeCtx("authorization_code");
    runWithUpstreamAuth(ctx, () => {
      beginUpstreamMutation()(true);
      noteUpstreamUnauthorized(err(401, CHALLENGE));
    });
    expect(ctx.mutated).toBe(true);
    expect(ctx.revoked).toBeUndefined();
  });

  it("does not answer 401 while a state-changing call is in flight", () => {
    const ctx = makeCtx("authorization_code");
    runWithUpstreamAuth(ctx, () => {
      const end = beginUpstreamMutation();
      noteUpstreamUnauthorized(err(401, CHALLENGE));
      // The POST may still complete upstream, and a replay after re-authorizing would repeat it.
      expect(mayAnswerUnauthorized(ctx)).toBe(false);
      end(false);
      end(true);
    });
    // It failed without changing anything, so the recorded revocation stands.
    expect(ctx.pendingMutations).toBe(0);
    expect(mayAnswerUnauthorized(ctx)).toBe(true);

    const changed = makeCtx("authorization_code");
    runWithUpstreamAuth(changed, () => {
      noteUpstreamUnauthorized(err(401, CHALLENGE));
      beginUpstreamMutation()(true);
    });
    expect(mayAnswerUnauthorized(changed)).toBe(false);
    expect(mayAnswerUnauthorized(makeCtx("authorization_code"))).toBe(false);
  });

  it("keeps the first revocation", () => {
    const ctx = makeCtx("authorization_code");
    runWithUpstreamAuth(ctx, () => {
      noteUpstreamUnauthorized(err(401, `${CHALLENGE}, error_description="first"`));
      noteUpstreamUnauthorized(err(401, `${CHALLENGE}, error_description="second"`));
    });
    expect(ctx.revoked).toEqual({ description: "first" });
  });
});
