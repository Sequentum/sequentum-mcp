/**
 * OAuth issuer identifier resolution.
 *
 * The issuer is this deployment's advertised OAuth identity: the value clients key
 * persisted credentials on, and the value they compare against the authorization
 * server's own metadata document. It is deliberately distinct from SEQUENTUM_API_URL
 * (where REST calls go) because a deployment can reach the API on an internal URL
 * while its public issuer stays https — se4-main's Docker stack runs
 * SE_AUTHORITY=http://control-center for exactly this reason.
 *
 * Mirrors OAuthIssuerProvider in se4-main (SE4-3725): same precedence, same validity
 * rule, same trailing-slash normalisation. The two must agree byte-for-byte, because
 * RFC 8414 Section 3.3 lets a client reject a metadata document whose issuer differs
 * from the one it expected.
 */

export type IssuerSource = "explicit" | "apiUrl" | "default";

export interface ResolvedIssuer {
  /** Normalised issuer identifier. Never has a trailing slash. */
  issuer: string;
  /** Which input supplied the value. Reported under DEBUG. */
  source: IssuerSource;
  /**
   * Set when the resolved value is not a conformant issuer identifier. The caller
   * logs it; this is not fatal, because the fallback variable exists for the REST
   * client and is legitimately http in local development.
   */
  warning?: string;
}

/**
 * The shape an issuer identifier must have, per RFC 9207 Section 2 and RFC 8414:
 * an absolute https URL with no query, fragment or userinfo component.
 */
export function isValidIssuer(value: string | undefined): boolean {
  if (!value || !value.trim()) return false;

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return false;
  }

  return (
    parsed.protocol === "https:" &&
    parsed.search === "" &&
    parsed.hash === "" &&
    parsed.username === "" &&
    parsed.password === ""
  );
}

/** Trim whitespace and every trailing slash, matching se4-main's TrimEnd('/'). */
function normalize(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * Resolves this deployment's OAuth issuer identifier.
 *
 * Precedence: SEQUENTUM_OAUTH_ISSUER, then SEQUENTUM_API_URL, then defaultApiUrl.
 *
 * @throws Error when SEQUENTUM_OAUTH_ISSUER is set but is not a conformant issuer.
 *   Fatal by design: the value is concatenated into the Location header and the
 *   protected-resource document, so a bad one poisons every response rather than
 *   failing a single request. se4-main uses ValidateOnStart for the same reason.
 */
export function resolveIssuer(
  env: Record<string, string | undefined>,
  defaultApiUrl: string
): ResolvedIssuer {
  const explicit = env.SEQUENTUM_OAUTH_ISSUER?.trim();
  if (explicit) {
    const normalized = normalize(explicit);
    if (!isValidIssuer(normalized)) {
      throw new Error(
        `SEQUENTUM_OAUTH_ISSUER must be an absolute https URL with no query, fragment or ` +
          `userinfo component. Got: ${explicit}`
      );
    }
    return { issuer: normalized, source: "explicit" };
  }

  const apiUrl = env.SEQUENTUM_API_URL?.trim();
  const source: IssuerSource = apiUrl ? "apiUrl" : "default";
  const issuer = normalize(apiUrl || defaultApiUrl);

  if (!isValidIssuer(issuer)) {
    return {
      issuer,
      source,
      warning:
        `OAuth issuer "${issuer}" is not a conformant issuer identifier — it must be an absolute ` +
        `https URL with no query, fragment or userinfo component. Strict clients will reject the ` +
        `metadata document. Set SEQUENTUM_OAUTH_ISSUER to this deployment's canonical https URL.`,
    };
  }

  return { issuer, source };
}
