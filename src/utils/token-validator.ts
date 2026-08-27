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

/** A definite negative verdict: the token cannot work and the client must re-authenticate. */
export type RejectReason =
  | "expired"
  | "bad-signature"
  | "wrong-audience"
  | "malformed"
  | "bad-alg";

/** We could not reach a verdict. Distinct from `RejectReason` — see {@link Verdict}. */
export type UnverifiableReason = "jwks-unreachable" | "unknown-kid";

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
 * (`SeControlCenter/OAuth/OAuthService.cs:220`). Accepted alongside the canonical
 * origin so a client that omits `resource` keeps working.
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
