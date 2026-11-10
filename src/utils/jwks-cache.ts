/**
 * JWKS cache for pre-dispatch token validation (SE4-3856).
 *
 * The only part of validation that touches the network. Kept separate from
 * `token-validator.ts` so the validator stays pure and the caching policy —
 * which is where the operational hazards live — can be tested on its own.
 */

/** TTL for a successfully fetched key set. */
export const JWKS_TTL_MS = 600_000; // 10 minutes

/**
 * Floor on the interval between fetch *attempts*, applied **per process rather
 * than per `kid`**. A per-`kid` cooldown would let a caller present a flood of
 * distinct bogus `kid` values and force one upstream fetch each.
 */
export const JWKS_REFETCH_COOLDOWN_MS = 60_000;

const JWKS_FETCH_TIMEOUT_MS = 5_000;

/**
 * - `key` — the kid's verification key, possibly stale if the latest refetch failed.
 * - `unknown` — the latest fetch attempt succeeded and its key set lacks the kid: a
 *   definite negative.
 * - `unreachable` — no usable key set yet, or the latest attempt failed, so the kid's
 *   absence proves nothing.
 */
export type KeyLookup =
  | { kind: "key"; key: CryptoKey }
  | { kind: "unknown" }
  | { kind: "unreachable" };

export interface JwksKeySource {
  getKey(kid: string): Promise<KeyLookup>;
}

export interface JwksCacheOptions {
  fetchFn?: typeof fetch;
  ttlMs?: number;
  refetchCooldownMs?: number;
  now?: () => number;
}

interface JwkEntry {
  kty?: unknown;
  alg?: unknown;
  kid?: unknown;
  n?: unknown;
  e?: unknown;
}

/**
 * Import one JWKS entry as an RS256 verification key, or `null` if it is not one.
 *
 * The JWK is **rebuilt** rather than passed through: Control Center's entries
 * carry `use` and `kid`, and forwarding those to `importKey` can fail on some
 * Node builds. Only the members webcrypto needs are supplied.
 */
async function importRs256Jwk(entry: JwkEntry): Promise<CryptoKey | null> {
  if (entry.kty !== "RSA") return null;
  if (typeof entry.n !== "string" || typeof entry.e !== "string") return null;
  if (entry.alg !== undefined && entry.alg !== "RS256") return null;

  try {
    return await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: entry.n, e: entry.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
  } catch {
    return null;
  }
}

export function createJwksCache(apiBaseUrl: string, options: JwksCacheOptions = {}): JwksKeySource {
  const fetchFn = options.fetchFn ?? fetch;
  const ttlMs = options.ttlMs ?? JWKS_TTL_MS;
  const cooldownMs = options.refetchCooldownMs ?? JWKS_REFETCH_COOLDOWN_MS;
  const now = options.now ?? Date.now;
  const url = `${apiBaseUrl}/api/oauth/certs`;

  let keys = new Map<string, CryptoKey>();
  let fetchedAt = 0;
  let lastAttemptAt = 0;
  /**
   * Whether the most recent fetch attempt produced a usable key set. Only
   * then is a missing kid a definite negative; after a failed attempt the cache may
   * simply be behind a key rotation it could not observe.
   */
  let lastFetchSucceeded = false;
  let inFlight: Promise<void> | null = null;

  /** One fetch attempt; `true` only when it replaced the cache with a usable key set. */
  async function fetchKeys(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JWKS_FETCH_TIMEOUT_MS);
    try {
      const response = await fetchFn(url, { signal: controller.signal });
      if (!response.ok) return false;

      const body: unknown = await response.json();
      const entries = (body as { keys?: unknown })?.keys;
      if (!Array.isArray(entries)) return false;

      const next = new Map<string, CryptoKey>();
      for (const entry of entries as JwkEntry[]) {
        if (typeof entry?.kid !== "string") continue;
        const key = await importRs256Jwk(entry);
        if (key) next.set(entry.kid, key);
      }

      // A document with no usable key is a failure, not an answer: it must neither
      // empty a working cache nor turn every kid into a definite "unknown", which
      // would reject every token if, say, the key import broke.
      if (next.size === 0) return false;

      keys = next;
      fetchedAt = now();
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Fetch at most once concurrently, and no more often than the cooldown allows. */
  async function maybeFetch(): Promise<void> {
    if (inFlight) return inFlight;

    const elapsed = now() - lastAttemptAt;
    if (lastAttemptAt !== 0 && elapsed < cooldownMs) return;

    lastAttemptAt = now();
    inFlight = fetchKeys()
      .then((succeeded) => {
        lastFetchSucceeded = succeeded;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return {
    async getKey(kid: string): Promise<KeyLookup> {
      const cached = keys.get(kid);
      const fresh = now() - fetchedAt < ttlMs;
      if (cached && fresh) return { kind: "key", key: cached };

      await maybeFetch();

      const afterFetch = keys.get(kid);
      // A stale-but-present key beats failing: a refetch that could not land is
      // no reason to reject a kid we have successfully verified before.
      if (afterFetch) return { kind: "key", key: afterFetch };
      // "unknown" is a definite negative, so it needs the latest attempt -- this
      // call's or one inside the cooldown -- to have succeeded. Answering "unknown"
      // only for a fetch made by this call would let a caller spend one request on
      // the fetch and get the next one through as "could not check".
      if (!lastFetchSucceeded) return { kind: "unreachable" };
      return { kind: "unknown" };
    },
  };
}
