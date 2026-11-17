import { describe, it, expect } from "vitest";
import {
  runWithUpstreamAuth,
  currentUpstreamAuth,
  isHoldable,
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

  it("keeps the first revocation", () => {
    const ctx = makeCtx("authorization_code");
    runWithUpstreamAuth(ctx, () => {
      noteUpstreamUnauthorized(err(401, `${CHALLENGE}, error_description="first"`));
      noteUpstreamUnauthorized(err(401, `${CHALLENGE}, error_description="second"`));
    });
    expect(ctx.revoked).toEqual({ description: "first" });
  });
});
