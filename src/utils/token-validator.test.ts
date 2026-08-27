import { describe, it, expect, vi } from "vitest";
import {
  parseJwt,
  validateToken,
  CLOCK_SKEW_SECONDS,
  LEGACY_AUDIENCE,
} from "./token-validator.js";
import type { JwksKeySource, KeyLookup } from "./jwks-cache.js";

function seg(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

describe("parseJwt", () => {
  it("parses a well-formed token into header, payload, signing input and signature", () => {
    const header = { alg: "RS256", kid: "abc" };
    const payload = { exp: 1234, aud: "https://mcp.example.test" };
    const sig = Buffer.from([1, 2, 3]).toString("base64url");
    const parsed = parseJwt(`${seg(header)}.${seg(payload)}.${sig}`);

    expect(parsed).not.toBeNull();
    expect(parsed!.header).toEqual(header);
    expect(parsed!.payload).toEqual(payload);
    expect(parsed!.signingInput).toBe(`${seg(header)}.${seg(payload)}`);
    expect(Array.from(parsed!.signature)).toEqual([1, 2, 3]);
  });

  it("tolerates an empty signature so alg:none reaches the alg check", () => {
    const parsed = parseJwt(`${seg({ alg: "none" })}.${seg({ exp: 1 })}.`);
    expect(parsed).not.toBeNull();
    expect(parsed!.header.alg).toBe("none");
    expect(parsed!.signature.length).toBe(0);
  });

  it("returns null for a value that is not a JWT", () => {
    expect(parseJwt("sk-abc123")).toBeNull();
  });

  it("returns null for the wrong number of segments", () => {
    expect(parseJwt(`${seg({ alg: "RS256" })}.${seg({})}`)).toBeNull();
    expect(parseJwt(`a.b.c.d`)).toBeNull();
  });

  it("returns null when a segment is not valid JSON", () => {
    expect(parseJwt(`${Buffer.from("not json").toString("base64url")}.${seg({})}.x`)).toBeNull();
  });

  it("returns null when header or payload is a JSON non-object", () => {
    expect(parseJwt(`${seg("string")}.${seg({})}.x`)).toBeNull();
    expect(parseJwt(`${seg({ alg: "RS256" })}.${seg([1, 2])}.x`)).toBeNull();
  });

  it("returns null for an empty header or payload segment", () => {
    expect(parseJwt(`.${seg({})}.x`)).toBeNull();
    expect(parseJwt(`${seg({})}..x`)).toBeNull();
  });

  it("exposes the constants the spec fixes", () => {
    expect(CLOCK_SKEW_SECONDS).toBe(60);
    expect(LEGACY_AUDIENCE).toBe("Sequentum Enterprise");
  });
});

const ORIGIN = "https://mcp.example.test";

async function generatePair() {
  return crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
}

async function signJwt(
  priv: CryptoKey,
  header: Record<string, unknown>,
  payload: Record<string, unknown>
): Promise<string> {
  const input = `${seg(header)}.${seg(payload)}`;
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    priv,
    new TextEncoder().encode(input)
  );
  return `${input}.${Buffer.from(sig).toString("base64url")}`;
}

function keySource(entries: Record<string, CryptoKey>, override?: KeyLookup): JwksKeySource {
  return {
    async getKey(kid: string): Promise<KeyLookup> {
      if (override) return override;
      const key = entries[kid];
      return key ? { kind: "key", key } : { kind: "unknown" };
    },
  };
}

const future = () => Math.floor(Date.now() / 1000) + 3600;
const past = (secondsAgo: number) => Math.floor(Date.now() / 1000) - secondsAgo;

describe("validateToken", () => {
  it("accepts a correctly signed token with the canonical audience", async () => {
    const pair = await generatePair();
    const token = await signJwt(pair.privateKey, { alg: "RS256", kid: "k1" }, { exp: future(), aud: ORIGIN });

    const verdict = await validateToken(token, ORIGIN, keySource({ k1: pair.publicKey }));

    expect(verdict.kind).toBe("valid");
    if (verdict.kind === "valid") {
      expect(verdict.claims.kid).toBe("k1");
      expect(verdict.claims.aud).toEqual([ORIGIN]);
    }
  });

  it("accepts the legacy audience used when no resource parameter was sent", async () => {
    const pair = await generatePair();
    const token = await signJwt(
      pair.privateKey,
      { alg: "RS256", kid: "k1" },
      { exp: future(), aud: LEGACY_AUDIENCE }
    );

    expect((await validateToken(token, ORIGIN, keySource({ k1: pair.publicKey }))).kind).toBe("valid");
  });

  it("accepts an array audience containing the canonical origin", async () => {
    const pair = await generatePair();
    const token = await signJwt(
      pair.privateKey,
      { alg: "RS256", kid: "k1" },
      { exp: future(), aud: ["https://other.test", ORIGIN] }
    );

    expect((await validateToken(token, ORIGIN, keySource({ k1: pair.publicKey }))).kind).toBe("valid");
  });

  it("rejects a token whose exp is outside the skew window", async () => {
    const pair = await generatePair();
    const token = await signJwt(
      pair.privateKey,
      { alg: "RS256", kid: "k1" },
      { exp: past(CLOCK_SKEW_SECONDS + 10), aud: ORIGIN }
    );

    const verdict = await validateToken(token, ORIGIN, keySource({ k1: pair.publicKey }));

    expect(verdict).toMatchObject({ kind: "rejected", reason: "expired" });
  });

  it("accepts a token whose exp is inside the skew window", async () => {
    const pair = await generatePair();
    const token = await signJwt(
      pair.privateKey,
      { alg: "RS256", kid: "k1" },
      { exp: past(CLOCK_SKEW_SECONDS - 30), aud: ORIGIN }
    );

    expect((await validateToken(token, ORIGIN, keySource({ k1: pair.publicKey }))).kind).toBe("valid");
  });

  it("rejects an expired token even when the kid is unknown", async () => {
    // Regression guard: with exp checked after the key lookup, a rotation
    // window would fail open and resurrect SE4-3856.
    const pair = await generatePair();
    const token = await signJwt(
      pair.privateKey,
      { alg: "RS256", kid: "rotated-away" },
      { exp: past(3600), aud: ORIGIN }
    );

    const verdict = await validateToken(token, ORIGIN, keySource({}));

    expect(verdict).toMatchObject({ kind: "rejected", reason: "expired" });
  });

  it("rejects a token signed by a different key", async () => {
    const real = await generatePair();
    const attacker = await generatePair();
    const token = await signJwt(attacker.privateKey, { alg: "RS256", kid: "k1" }, { exp: future(), aud: ORIGIN });

    const verdict = await validateToken(token, ORIGIN, keySource({ k1: real.publicKey }));

    expect(verdict).toMatchObject({ kind: "rejected", reason: "bad-signature" });
  });

  it("rejects alg:none", async () => {
    const token = `${seg({ alg: "none", kid: "k1" })}.${seg({ exp: future(), aud: ORIGIN })}.`;

    expect(await validateToken(token, ORIGIN, keySource({}))).toMatchObject({
      kind: "rejected",
      reason: "bad-alg",
    });
  });

  it("rejects alg:HS256 without consulting the key source", async () => {
    const token = `${seg({ alg: "HS256", kid: "k1" })}.${seg({ exp: future(), aud: ORIGIN })}.c2ln`;
    const source: JwksKeySource = {
      getKey: vi.fn(async () => ({ kind: "unknown" }) as KeyLookup),
    };

    expect(await validateToken(token, ORIGIN, source)).toMatchObject({
      kind: "rejected",
      reason: "bad-alg",
    });
    expect(source.getKey).not.toHaveBeenCalled();
  });

  it("rejects a token minted for a different resource", async () => {
    const pair = await generatePair();
    const token = await signJwt(
      pair.privateKey,
      { alg: "RS256", kid: "k1" },
      { exp: future(), aud: "https://someone-else.test" }
    );

    expect(await validateToken(token, ORIGIN, keySource({ k1: pair.publicKey }))).toMatchObject({
      kind: "rejected",
      reason: "wrong-audience",
    });
  });

  it("rejects a missing audience", async () => {
    const pair = await generatePair();
    const token = await signJwt(pair.privateKey, { alg: "RS256", kid: "k1" }, { exp: future() });

    expect(await validateToken(token, ORIGIN, keySource({ k1: pair.publicKey }))).toMatchObject({
      kind: "rejected",
      reason: "wrong-audience",
    });
  });

  it("rejects a missing or non-numeric exp", async () => {
    const pair = await generatePair();
    const token = await signJwt(pair.privateKey, { alg: "RS256", kid: "k1" }, { aud: ORIGIN });

    expect(await validateToken(token, ORIGIN, keySource({ k1: pair.publicKey }))).toMatchObject({
      kind: "rejected",
      reason: "expired",
    });
  });

  it("rejects a value that is not a JWT", async () => {
    expect(await validateToken("sk-abc123", ORIGIN, keySource({}))).toMatchObject({
      kind: "rejected",
      reason: "malformed",
    });
  });

  it("rejects a token with no kid", async () => {
    const pair = await generatePair();
    const token = await signJwt(pair.privateKey, { alg: "RS256" }, { exp: future(), aud: ORIGIN });

    expect(await validateToken(token, ORIGIN, keySource({ k1: pair.publicKey }))).toMatchObject({
      kind: "rejected",
      reason: "malformed",
    });
  });

  it("reports unknown-kid as unverifiable for an otherwise fresh token", async () => {
    const pair = await generatePair();
    const token = await signJwt(pair.privateKey, { alg: "RS256", kid: "rotated" }, { exp: future(), aud: ORIGIN });

    expect(await validateToken(token, ORIGIN, keySource({}))).toMatchObject({
      kind: "unverifiable",
      reason: "unknown-kid",
    });
  });

  it("reports jwks-unreachable as unverifiable", async () => {
    const pair = await generatePair();
    const token = await signJwt(pair.privateKey, { alg: "RS256", kid: "k1" }, { exp: future(), aud: ORIGIN });

    expect(
      await validateToken(token, ORIGIN, keySource({}, { kind: "unreachable" }))
    ).toMatchObject({ kind: "unverifiable", reason: "jwks-unreachable" });
  });
});
