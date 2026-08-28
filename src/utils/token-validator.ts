/**
 * Pre-dispatch OAuth access-token validation (SE4-3856).
 *
 * The MCP server used to forward any Bearer value upstream and translate the
 * resulting 401 into a tool result carried on an HTTP 200. Clients treat an
 * HTTP 401 as the only trigger to redeem a refresh token, so that 200 meant a
 * connector died at the one-hour access-token lifetime and never recovered.
 *
 * This module answers one question — is this token acceptable — and says so in
 * a three-way verdict. It performs no I/O of its own: keys arrive through a
 * `JwksKeySource`, which keeps the whole module synchronously testable apart
 * from the signature check itself.
 */

import type { JwksKeySource } from "./jwks-cache.js";

/** A definite negative verdict: the token cannot work and the client must re-authenticate. */
export type RejectReason =
  | "expired"
  | "bad-signature"
  | "malformed"
  | "bad-alg";

/**
 * We could not reach a verdict. Distinct from `RejectReason` — see {@link Verdict}.
 *
 * `wrong-audience` lives here, not in `RejectReason`, because it is the one check a
 * client's refresh cannot resolve: Control Center's refresh grant reuses the stored
 * `Resource` and mints a new token with the *same* `aud`, so rejecting on audience
 * would 401 → refresh → 401 forever — worse than the bug SE4-3856 fixes. The backend
 * itself sets `ValidateAudience = false` for the same reason, documenting that a
 * token's audience may legitimately be "any URI (localhost, tunnel URL, external
 * domain)". Treating a mismatch as unverifiable fails the request open instead.
 */
export type UnverifiableReason = "jwks-unreachable" | "unknown-kid" | "wrong-audience";

/** The claims a caller may act on, populated only for a `valid` verdict. */
export interface Claims {
  readonly aud: readonly string[];
  readonly exp: number;
  readonly kid: string;
}

/**
 * The three-way split is the core of the design.
 *
 * - `rejected` — a definite verdict. Send 401 + WWW-Authenticate.
 * - `unverifiable` — infrastructure failure (JWKS down, key rotated). Pass the
 *   request through to the API, behaving exactly as before this change. Failing
 *   closed here would 401 every user during a JWKS blip, and since their refresh
 *   would succeed but still not validate, it would escalate a brief outage into
 *   mass re-authentication.
 * - `valid` — proceed.
 */
export type Verdict =
  | { kind: "valid"; claims: Claims }
  | { kind: "rejected"; reason: RejectReason; kid?: string; exp?: number }
  | { kind: "unverifiable"; reason: UnverifiableReason; kid?: string };

/** Tolerance applied to `exp` so a small clock difference does not sign users out. */
export const CLOCK_SKEW_SECONDS = 60;

/**
 * Audience stamped on tokens minted without an RFC 8707 `resource` parameter
 * (`SeControlCenter/OAuth/OAuthService.GenerateUserToken`). Accepted alongside
 * the canonical origin so a client that omits `resource` keeps working.
 */
export const LEGACY_AUDIENCE = "Sequentum Enterprise";

export interface ParsedJwt {
  readonly header: Record<string, unknown> & { alg?: unknown; kid?: unknown };
  readonly payload: Record<string, unknown> & { exp?: unknown; aud?: unknown };
  /** The exact ASCII bytes that were signed: `${header}.${payload}`. */
  readonly signingInput: string;
  readonly signature: Uint8Array;
}

function decodeJsonSegment(segment: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Split and decode a JWT without verifying anything.
 *
 * Returns `null` for any value that is not a structurally valid JWT — the caller
 * turns that into `rejected: malformed`.
 *
 * An **empty signature segment is tolerated** on purpose: an `alg: "none"` token
 * has one, and it must be reported as `bad-alg` (an algorithm-confusion attempt)
 * rather than `malformed`.
 */
export function parseJwt(token: string): ParsedJwt | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];
  if (!headerSegment || !payloadSegment) return null;

  const header = decodeJsonSegment(headerSegment);
  const payload = decodeJsonSegment(payloadSegment);
  if (!header || !payload) return null;

  return {
    header,
    payload,
    signingInput: `${headerSegment}.${payloadSegment}`,
    signature: new Uint8Array(Buffer.from(signatureSegment, "base64url")),
  };
}

/** Normalize `aud` (string or array, per RFC 7519) to a list of strings. */
function audienceList(aud: unknown): string[] {
  if (typeof aud === "string") return [aud];
  if (Array.isArray(aud)) return aud.filter((entry): entry is string => typeof entry === "string");
  return [];
}

/**
 * Reduce a value to its URL origin, or return it unchanged if it does not parse
 * as a URL. Used defensively on the caller-supplied `canonicalOrigin` too: a
 * trailing slash or unusual casing must not make every comparison fail.
 */
function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

/**
 * Does this one `aud` entry authorize `canonicalOrigin`?
 *
 * Compared by ORIGIN, not by exact string: `ResourceUriHelper.NormalizeResourceUri`
 * normalizes with `GetLeftPart(UriPartial.Path)`, so a real audience keeps its path
 * (`https://mcp.sequentum.com/mcp`), and an exact match against the bare origin
 * would reject tokens that authenticate successfully in production today.
 *
 * An entry that does not parse as a URL cannot match by origin — it can only match
 * `LEGACY_AUDIENCE` literally — and must never throw.
 */
function audienceMatches(entry: string, normalizedCanonicalOrigin: string): boolean {
  if (entry === LEGACY_AUDIENCE) return true;
  try {
    return new URL(entry).origin === normalizedCanonicalOrigin;
  } catch {
    return false;
  }
}

/**
 * Decide whether a Bearer token may be dispatched.
 *
 * Checks run in the order fixed by the design (spec §3.1):
 * shape → `alg` → `exp` → `kid` → signature → `aud`.
 *
 * `exp` deliberately precedes the key lookup. An expiry check can only ever
 * produce a rejection, never an acceptance, so it needs no verified signature —
 * and running it first means an expired token is still rejected during a key
 * rotation, when the lookup returns `unverifiable` and the caller fails open.
 * A forged token claiming a future `exp` is still caught by the signature check.
 *
 * @param token - the raw Bearer value, with the `Bearer ` prefix already removed
 * @param canonicalOrigin - this server's resource identifier, for the `aud` check
 * @param keys - key source; the only component that performs I/O
 */
export async function validateToken(
  token: string,
  canonicalOrigin: string,
  keys: JwksKeySource
): Promise<Verdict> {
  const parsed = parseJwt(token);
  if (!parsed) return { kind: "rejected", reason: "malformed" };

  if (parsed.header.alg !== "RS256") return { kind: "rejected", reason: "bad-alg" };

  const kid = parsed.header.kid;
  if (typeof kid !== "string" || kid.length === 0) {
    return { kind: "rejected", reason: "malformed" };
  }

  const exp = parsed.payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) {
    // A token with no usable expiry is treated as expired rather than accepted.
    return { kind: "rejected", reason: "expired", kid };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (exp + CLOCK_SKEW_SECONDS <= nowSeconds) {
    return { kind: "rejected", reason: "expired", kid, exp };
  }

  const lookup = await keys.getKey(kid);
  if (lookup.kind === "unknown") return { kind: "unverifiable", reason: "unknown-kid", kid };
  if (lookup.kind === "unreachable") {
    return { kind: "unverifiable", reason: "jwks-unreachable", kid };
  }

  let verified = false;
  try {
    verified = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      lookup.key,
      parsed.signature.slice(),
      new TextEncoder().encode(parsed.signingInput)
    );
  } catch {
    verified = false;
  }
  if (!verified) return { kind: "rejected", reason: "bad-signature", kid };

  const aud = audienceList(parsed.payload.aud);
  const normalizedCanonicalOrigin = normalizeOrigin(canonicalOrigin);
  if (!aud.some((entry) => audienceMatches(entry, normalizedCanonicalOrigin))) {
    return { kind: "unverifiable", reason: "wrong-audience", kid };
  }

  return { kind: "valid", claims: { aud, exp, kid } };
}
