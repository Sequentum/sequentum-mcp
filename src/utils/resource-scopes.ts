/**
 * Live source for the `scopes_supported` list in RFC 9728 Protected Resource Metadata (SE4-3929).
 *
 * `SUPPORTED_SCOPES` in `oauth-metadata.ts` used to be the whole story: a hardcoded array,
 * hand-kept in sync with the Control Center's own scope list. It drifted (missing
 * `spaces:write` and `billing:read`) and would drift again the next time the Control Center
 * added a scope, silently: nothing here would fail, MCP clients would just never request the
 * new scope, and every call needing it would 403 once SE4-3895 enforces.
 *
 * This fetches the Control Center's own protected-resource document,
 * `GET {apiBaseUrl}/api/oauth/resource-metadata`, and serves that instead -- so the two
 * documents describe the same scopes by construction. `SUPPORTED_SCOPES` remains as the
 * fallback, but only until the first successful fetch: a fetch that fails, times out or
 * returns a malformed document leaves the list already in hand untouched, so once a real
 * list has landed it is served indefinitely rather than reverting to the fallback.
 *
 * Modelled on `jwks-cache.ts`'s cache shape (TTL, refetch cooldown, in-flight de-dup, "a
 * populated result only replaces a populated cache"), with one deliberate difference:
 * `getKey` there is async and will await an in-flight fetch. `getScopes` here is synchronous
 * and never blocks -- the protected-resource document is read by clients *before* they hold a
 * token, during discovery, so a slow or unreachable Control Center must not make our own
 * metadata endpoint slow. A stale list is served immediately and a background refresh is
 * kicked off (and de-duplicated) instead.
 */

import { OFFLINE_ACCESS_SCOPE, SUPPORTED_SCOPES } from "./oauth-metadata.js";

/** TTL for a successfully fetched scope list. Same period as `JWKS_TTL_MS`. */
export const RESOURCE_SCOPES_TTL_MS = 600_000; // 10 minutes

/** Floor on the interval between fetch *attempts*, so a down Control Center cannot be hammered. */
export const RESOURCE_SCOPES_REFETCH_COOLDOWN_MS = 60_000;

const RESOURCE_SCOPES_FETCH_TIMEOUT_MS = 5_000;

export interface ResourceScopesSource {
  /**
   * The current `scopes_supported` list, synchronously. Returns the fallback until the first
   * successful fetch. If the list is stale (older than the TTL) and the refetch cooldown has
   * elapsed, starts one background refresh -- but never waits on it.
   */
  getScopes(): readonly string[];
  /**
   * Fetch now, unless an attempt is already in flight or the refetch cooldown has not yet
   * elapsed -- in which case this resolves immediately without fetching. Resolves once the
   * attempt it joined or started has finished, success or failure; never rejects.
   */
  refresh(): Promise<void>;
}

export interface ResourceScopesOptions {
  fetchFn?: typeof fetch;
  ttlMs?: number;
  refetchCooldownMs?: number;
  now?: () => number;
  /** Overrides `SUPPORTED_SCOPES` as the list served before any fetch has landed. */
  fallback?: readonly string[];
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string" && entry.length > 0);
}

export function createResourceScopesSource(
  apiBaseUrl: string,
  options: ResourceScopesOptions = {}
): ResourceScopesSource {
  const fetchFn = options.fetchFn ?? fetch;
  const ttlMs = options.ttlMs ?? RESOURCE_SCOPES_TTL_MS;
  const cooldownMs = options.refetchCooldownMs ?? RESOURCE_SCOPES_REFETCH_COOLDOWN_MS;
  const now = options.now ?? Date.now;
  const fallback = options.fallback ?? SUPPORTED_SCOPES;
  const url = `${apiBaseUrl}/api/oauth/resource-metadata`;

  let scopes: readonly string[] = fallback;
  let fetchedAt = 0;
  let lastAttemptAt = 0;
  let inFlight: Promise<void> | null = null;

  async function fetchScopes(): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RESOURCE_SCOPES_FETCH_TIMEOUT_MS);
    try {
      const response = await fetchFn(url, { signal: controller.signal });
      if (!response.ok) return;

      const body: unknown = await response.json();
      const upstream = (body as { scopes_supported?: unknown })?.scopes_supported;
      if (!isNonEmptyStringArray(upstream)) return;

      // The Control Center's resource document deliberately excludes offline_access (it
      // describes access to the resource, not the authorization server's own grants); our
      // clients need it to receive refresh tokens, so it is always appended, de-duplicated.
      scopes = [...new Set([...upstream, OFFLINE_ACCESS_SCOPE])];
      fetchedAt = now();
    } catch {
      // Swallowed: a failed fetch leaves the previous (possibly still-fallback) list in place.
    } finally {
      clearTimeout(timer);
    }
  }

  function maybeFetch(): Promise<void> {
    if (inFlight) return inFlight;

    const elapsed = now() - lastAttemptAt;
    if (lastAttemptAt !== 0 && elapsed < cooldownMs) return Promise.resolve();

    lastAttemptAt = now();
    inFlight = fetchScopes().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    getScopes(): readonly string[] {
      const fresh = fetchedAt !== 0 && now() - fetchedAt < ttlMs;
      if (!fresh) void maybeFetch();
      return scopes;
    },
    refresh(): Promise<void> {
      return maybeFetch();
    },
  };
}
