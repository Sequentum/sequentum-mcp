import { describe, it, expect } from "vitest";
import { isValidIssuer, resolveIssuer } from "./issuer.js";

const DEFAULT = "https://dashboard.sequentum.com";

describe("isValidIssuer", () => {
  it("accepts a bare https origin", () => {
    expect(isValidIssuer("https://example.com")).toBe(true);
  });

  it("accepts an https URL with a path", () => {
    expect(isValidIssuer("https://example.com/auth")).toBe(true);
  });

  it("rejects http (se4-main's Docker stack uses http://control-center)", () => {
    expect(isValidIssuer("http://example.com")).toBe(false);
  });

  it("rejects a query component", () => {
    // A query would string-concatenate into every advertised endpoint:
    // "https://example.com/?x=1/api/oauth/token".
    expect(isValidIssuer("https://example.com/?x=1")).toBe(false);
  });

  it("rejects a fragment component", () => {
    expect(isValidIssuer("https://example.com/#frag")).toBe(false);
  });

  it("rejects a userinfo component", () => {
    expect(isValidIssuer("https://user:pass@example.com")).toBe(false);
  });

  it("rejects a relative URL", () => {
    expect(isValidIssuer("/oauth")).toBe(false);
  });

  it("rejects empty and undefined", () => {
    expect(isValidIssuer("")).toBe(false);
    expect(isValidIssuer("   ")).toBe(false);
    expect(isValidIssuer(undefined)).toBe(false);
  });
});

describe("resolveIssuer precedence", () => {
  it("prefers SEQUENTUM_OAUTH_ISSUER over SEQUENTUM_API_URL", () => {
    const result = resolveIssuer(
      {
        SEQUENTUM_OAUTH_ISSUER: "https://issuer.example.com",
        SEQUENTUM_API_URL: "https://api.example.com",
      },
      DEFAULT
    );
    expect(result.issuer).toBe("https://issuer.example.com");
    expect(result.source).toBe("explicit");
  });

  it("falls back to SEQUENTUM_API_URL when the override is unset", () => {
    const result = resolveIssuer({ SEQUENTUM_API_URL: "https://api.example.com" }, DEFAULT);
    expect(result.issuer).toBe("https://api.example.com");
    expect(result.source).toBe("apiUrl");
  });

  it("falls back to the built-in default when neither is set", () => {
    const result = resolveIssuer({}, DEFAULT);
    expect(result.issuer).toBe(DEFAULT);
    expect(result.source).toBe("default");
  });

  it("treats a whitespace-only override as unset", () => {
    const result = resolveIssuer(
      { SEQUENTUM_OAUTH_ISSUER: "   ", SEQUENTUM_API_URL: "https://api.example.com" },
      DEFAULT
    );
    expect(result.issuer).toBe("https://api.example.com");
    expect(result.source).toBe("apiUrl");
  });
});

describe("resolveIssuer normalisation", () => {
  it("strips a single trailing slash", () => {
    expect(resolveIssuer({ SEQUENTUM_API_URL: "https://api.example.com/" }, DEFAULT).issuer).toBe(
      "https://api.example.com"
    );
  });

  it("strips repeated trailing slashes", () => {
    expect(resolveIssuer({ SEQUENTUM_API_URL: "https://api.example.com///" }, DEFAULT).issuer).toBe(
      "https://api.example.com"
    );
  });

  it("leaves a value with no trailing slash unchanged", () => {
    expect(resolveIssuer({ SEQUENTUM_API_URL: "https://api.example.com" }, DEFAULT).issuer).toBe(
      "https://api.example.com"
    );
  });

  it("normalises the explicit override too", () => {
    expect(
      resolveIssuer({ SEQUENTUM_OAUTH_ISSUER: "https://issuer.example.com/" }, DEFAULT).issuer
    ).toBe("https://issuer.example.com");
  });
});

describe("resolveIssuer failure modes", () => {
  it("throws when the explicit override is not https", () => {
    expect(() =>
      resolveIssuer({ SEQUENTUM_OAUTH_ISSUER: "http://issuer.example.com" }, DEFAULT)
    ).toThrow(/SEQUENTUM_OAUTH_ISSUER must be an absolute https URL/);
  });

  it("throws when the explicit override carries a query", () => {
    expect(() =>
      resolveIssuer({ SEQUENTUM_OAUTH_ISSUER: "https://issuer.example.com/?x=1" }, DEFAULT)
    ).toThrow(/SEQUENTUM_OAUTH_ISSUER must be an absolute https URL/);
  });

  it("warns but does NOT throw when the SEQUENTUM_API_URL fallback is not https", () => {
    // npm run dev:http against a local http backend must still boot.
    const result = resolveIssuer({ SEQUENTUM_API_URL: "http://localhost:5000" }, DEFAULT);
    expect(result.issuer).toBe("http://localhost:5000");
    expect(result.warning).toMatch(/SEQUENTUM_OAUTH_ISSUER/);
  });

  it("emits no warning when the fallback is a conformant issuer", () => {
    expect(
      resolveIssuer({ SEQUENTUM_API_URL: "https://api.example.com" }, DEFAULT).warning
    ).toBeUndefined();
  });
});
