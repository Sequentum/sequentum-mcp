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

/** Convert a base64url string (no padding) to standard base64 (`+`/`/`, `=`-padded). */
function toStandardBase64(base64url: string): string {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = base64.length % 4;
  const padding = remainder === 0 ? "" : "=".repeat(4 - remainder);
  return base64 + padding;
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

  it("keeps reporting an unknown kid inside the cooldown after a successful fetch", async () => {
    // the fetch that just completed is a definite negative for any kid it
    // lacked. If the cooldown downgraded this to "could not check", a caller could
    // spend one request on the fetch and pass the gate with the next.
    const { jwk } = await keyFixture("k1");
    const fetchFn = vi.fn().mockResolvedValue(jwksResponse([jwk]));
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch, now: () => 1_000_000 });

    await cache.getKey("bogus-1");
    const result = await cache.getKey("bogus-2");

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: "unknown" });
  });

  it("reports unreachable for an uncached kid when the latest refetch failed", async () => {
    // Stale keys are still cached, but the refetch that could have produced this kid
    // never landed, so its absence proves nothing.
    const { jwk } = await keyFixture("k1");
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jwksResponse([jwk]))
      .mockRejectedValue(new Error("ECONNREFUSED"));
    let clock = 1_000_000;
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch, now: () => clock });

    await cache.getKey("k1");
    clock += JWKS_TTL_MS + 1;

    expect(await cache.getKey("rotated")).toEqual({ kind: "unreachable" });
  });

  it("keeps reporting unreachable inside the cooldown after a failed refetch", async () => {
    const { jwk } = await keyFixture("k1");
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jwksResponse([jwk]))
      .mockResolvedValue(new Response("nope", { status: 503 }));
    let clock = 1_000_000;
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch, now: () => clock });

    await cache.getKey("k1");
    clock += JWKS_TTL_MS + 1;
    await cache.getKey("rotated");
    const result = await cache.getKey("rotated");

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ kind: "unreachable" });
  });

  it("treats a refetch that would empty a populated cache as failed", async () => {
    const { jwk } = await keyFixture("k1");
    const fetchFn = vi.fn().mockResolvedValueOnce(jwksResponse([jwk])).mockResolvedValue(jwksResponse([]));
    let clock = 1_000_000;
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch, now: () => clock });

    await cache.getKey("k1");
    clock += JWKS_TTL_MS + 1;

    expect(await cache.getKey("rotated")).toEqual({ kind: "unreachable" });
  });

  it("reports unknown again once a refetch succeeds after a failure", async () => {
    const { jwk } = await keyFixture("k1");
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jwksResponse([jwk]))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue(jwksResponse([jwk]));
    let clock = 1_000_000;
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch, now: () => clock });

    await cache.getKey("k1");
    clock += JWKS_TTL_MS + 1;
    await cache.getKey("rotated");
    clock += JWKS_REFETCH_COOLDOWN_MS + 1;

    expect(await cache.getKey("rotated")).toEqual({ kind: "unknown" });
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
    const { jwk } = await keyFixture("k1");
    const fetchFn = vi.fn().mockResolvedValue(
      jwksResponse([
        jwk,
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

  it("reports unreachable when the JWKS holds no usable key at all", async () => {
    // A document with nothing importable says nothing about any kid. Calling every kid
    // "unknown" here would reject every token if key import ever broke.
    const fetchFn = vi.fn().mockResolvedValue(jwksResponse([{ kty: "oct", kid: "sym", k: "AAAA" }]));
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch });

    expect(await cache.getKey("sym")).toEqual({ kind: "unreachable" });
  });

  it("imports a key whose n/e use the standard base64 alphabet, matching what Control Center actually serves", async () => {
    // Every other fixture in this file derives n/e from crypto.subtle.exportKey("jwk", ...),
    // which emits RFC 7518 base64url. Production does not: OAuthController.cs builds the
    // JWKS document with Convert.ToBase64String(parameters.Modulus) for n and
    // Convert.ToBase64String(parameters.Exponent) for e -- the *standard* base64
    // alphabet, with `+`, `/` and `=` padding -- and only base64url-converts kid. A
    // 2048-bit modulus reliably contains `+` or `/` and always ends in `==`, so none
    // of the other fixtures parse the bytes production actually serves.
    //
    // This currently works only because Node's crypto.subtle.importKey happens to
    // accept the standard alphabet for a JWK import too. Nothing pins that. If it
    // ever stops, every JWKS entry silently fails to import, the cache stays empty,
    // and every request degrades to unverifiable: jwks-unreachable -- with no test here
    // failing to say why.
    const { jwk } = await keyFixture("k1");
    const standardJwk = {
      kty: "RSA",
      use: "sig",
      alg: "RS256",
      kid: "k1",
      n: toStandardBase64(jwk.n as string),
      e: toStandardBase64(jwk.e as string),
    };
    const fetchFn = vi.fn().mockResolvedValue(jwksResponse([standardJwk]));
    const cache = createJwksCache(API, { fetchFn: fetchFn as unknown as typeof fetch });

    const result = await cache.getKey("k1");

    expect(result.kind).toBe("key");
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
