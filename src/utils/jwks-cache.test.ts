import { describe, it, expect, vi } from "vitest";
import { createJwksCache, JWKS_TTL_MS, JWKS_REFETCH_COOLDOWN_MS } from "./jwks-cache.js";

const API = "https://api.example.test";

/** Generate an RSA keypair and the JWKS entry describing its public half. */
async function keyFixture(kid: string) {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { pair, jwk: { kty: "RSA", use: "sig", alg: "RS256", kid, n: jwk.n, e: jwk.e } };
}

function jwksResponse(keys: unknown[]) {
  return new Response(JSON.stringify({ keys }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("createJwksCache", () => {
  it("fetches the JWKS and returns a usable key for a known kid", async () => {
    const { jwk } = await keyFixture("k1");
    const fetchFn = vi.fn().mockResolvedValue(jwksResponse([jwk]));
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch });

    const result = await cache.getKey("k1");

    expect(result.kind).toBe("key");
    expect(fetchFn).toHaveBeenCalledWith(`${API}/api/oauth/certs`, expect.anything());
  });

  it("serves a second lookup from cache without refetching", async () => {
    const { jwk } = await keyFixture("k1");
    const fetchFn = vi.fn().mockResolvedValue(jwksResponse([jwk]));
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch });

    await cache.getKey("k1");
    await cache.getKey("k1");

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("refetches once the TTL has elapsed", async () => {
    const { jwk } = await keyFixture("k1");
    const fetchFn = vi.fn().mockResolvedValue(jwksResponse([jwk]));
    let clock = 1_000_000;
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch, now: () => clock });

    await cache.getKey("k1");
    clock += JWKS_TTL_MS + 1;
    await cache.getKey("k1");

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("reports an unknown kid after a refetch fails to produce it", async () => {
    const { jwk } = await keyFixture("k1");
    const fetchFn = vi.fn().mockResolvedValue(jwksResponse([jwk]));
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch });

    const result = await cache.getKey("nope");

    expect(result).toEqual({ kind: "unknown" });
  });

  it("rate-limits unknown-kid refetches per process, not per kid", async () => {
    const { jwk } = await keyFixture("k1");
    const fetchFn = vi.fn().mockResolvedValue(jwksResponse([jwk]));
    let clock = 1_000_000;
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch, now: () => clock });

    await cache.getKey("bogus-1");
    await cache.getKey("bogus-2");
    await cache.getKey("bogus-3");

    // One initial fetch only; the cooldown suppresses the rest.
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clock += JWKS_REFETCH_COOLDOWN_MS + 1;
    await cache.getKey("bogus-4");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("reports unreachable when the fetch rejects and nothing is cached", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch });

    expect(await cache.getKey("k1")).toEqual({ kind: "unreachable" });
  });

  it("reports unreachable on a non-2xx JWKS response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch });

    expect(await cache.getKey("k1")).toEqual({ kind: "unreachable" });
  });

  it("keeps serving a cached key when a later refetch fails", async () => {
    const { jwk } = await keyFixture("k1");
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jwksResponse([jwk]))
      .mockRejectedValue(new Error("ECONNREFUSED"));
    let clock = 1_000_000;
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch, now: () => clock });

    await cache.getKey("k1");
    clock += JWKS_TTL_MS + 1;

    expect((await cache.getKey("k1")).kind).toBe("key");
  });

  it("ignores non-RS256 and malformed JWKS entries", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jwksResponse([
        { kty: "oct", kid: "sym", k: "AAAA" },
        { kty: "RSA", kid: "no-modulus", alg: "RS256", e: "AQAB" },
        { kty: "RSA", kid: "wrong-alg", alg: "RS512", n: "AAAA", e: "AQAB" },
      ])
    );
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch });

    expect(await cache.getKey("sym")).toEqual({ kind: "unknown" });
    expect(await cache.getKey("no-modulus")).toEqual({ kind: "unknown" });
    expect(await cache.getKey("wrong-alg")).toEqual({ kind: "unknown" });
  });

  it("coalesces concurrent lookups into a single fetch", async () => {
    const { jwk } = await keyFixture("k1");
    const fetchFn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(jwksResponse([jwk])), 10))
    );
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch });

    const results = await Promise.all([cache.getKey("k1"), cache.getKey("k1"), cache.getKey("k1")]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.kind === "key")).toBe(true);
  });
});
