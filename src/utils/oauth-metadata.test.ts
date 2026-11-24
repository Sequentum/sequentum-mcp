import { describe, it, expect } from "vitest";
import { buildAuthChallenge, sanitizeErrorDescription, SUPPORTED_SCOPES, API_SCOPES } from "./oauth-metadata.js";

describe("buildAuthChallenge", () => {
  it("uses RFC 9728 resource_metadata parameter (not the wrong `resource=` form)", () => {
    const { wwwAuthenticate } = buildAuthChallenge("https://mcp.sequentum.com");
    expect(wwwAuthenticate).toContain(
      'resource_metadata="https://mcp.sequentum.com/.well-known/oauth-protected-resource"'
    );
    expect(wwwAuthenticate).toMatch(/^Bearer /);
    // Regression guard: the buggy `resource=` form must never come back.
    expect(wwwAuthenticate).not.toMatch(/\bresource="https/);
  });

  it("includes realm and error per RFC 6750 §3.1", () => {
    const { wwwAuthenticate } = buildAuthChallenge("https://mcp.sequentum.com");
    expect(wwwAuthenticate).toContain('realm="mcp.sequentum.com"');
    expect(wwwAuthenticate).toContain('error="invalid_token"');
  });

  it("carries no scope parameter and never mentions offline_access (MCP 2026-07-28 SHOULD NOT)", () => {
    const { wwwAuthenticate } = buildAuthChallenge("https://mcp.sequentum.com");
    expect(wwwAuthenticate).not.toMatch(/\bscope=/);
    expect(wwwAuthenticate).not.toContain("offline_access");
  });

  it("returns a JSON-RPC body with protectedResourceMetadata", () => {
    const { body } = buildAuthChallenge("https://mcp.sequentum.com");
    expect(body.error.code).toBe(-32001);
    expect(body.error.data.protectedResourceMetadata).toBe(
      "https://mcp.sequentum.com/.well-known/oauth-protected-resource"
    );
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBeNull();
  });

  it("preserves non-default ports in realm and PRM URL (local dev)", () => {
    const { wwwAuthenticate, body } = buildAuthChallenge("http://localhost:3000");
    expect(wwwAuthenticate).toContain('realm="localhost:3000"');
    expect(body.error.data.protectedResourceMetadata).toBe(
      "http://localhost:3000/.well-known/oauth-protected-resource"
    );
  });

  it("strips quotes and commas from realm so a hostile Host cannot break the header", () => {
    // `new URL` accepts both as host code points, so a Host-derived origin can carry
    // them here when MCP_CANONICAL_ORIGIN is unset.
    const { wwwAuthenticate } = buildAuthChallenge('http://a"b,c');
    expect(wwwAuthenticate).toContain('realm="abc"');
    expect(wwwAuthenticate).toMatch(/^Bearer realm="[^",]*", error="invalid_token", resource_metadata="/);
  });

  it("works with an arbitrary hostname", () => {
    // Use the IANA-reserved documentation domain (RFC 2606) rather than any real
    // Sequentum subdomain, since this repo is public and tests are visible.
    const { wwwAuthenticate, body } = buildAuthChallenge("https://example.com");
    expect(wwwAuthenticate).toContain('realm="example.com"');
    expect(wwwAuthenticate).toContain(
      'resource_metadata="https://example.com/.well-known/oauth-protected-resource"'
    );
    expect(body.error.data.protectedResourceMetadata).toBe(
      "https://example.com/.well-known/oauth-protected-resource"
    );
  });
});

describe("buildAuthChallenge error description", () => {
  const origin = "https://example.com";
  const text = "Multi-factor authentication is now required for this account. Sign in again to reconnect.";

  it("is unchanged without a description", () => {
    const base = buildAuthChallenge(origin);
    expect(JSON.stringify(base)).toBe(JSON.stringify(buildAuthChallenge(origin, null)));
    expect(base.wwwAuthenticate).toBe(
      'Bearer realm="example.com", error="invalid_token", resource_metadata="https://example.com/.well-known/oauth-protected-resource"'
    );
    expect(base.wwwAuthenticate).not.toContain("error_description");
    expect(base.body.error.data).not.toHaveProperty("error_description");
  });

  it("appends error_description to the header and body", () => {
    const { wwwAuthenticate, body } = buildAuthChallenge(origin, text);
    expect(wwwAuthenticate.endsWith(`, error_description="${text}"`)).toBe(true);
    expect(body.error.data.error_description).toBe(text);
    expect(body.error.message).toBe("Authentication required");
  });

  it("strips characters RFC 6750 forbids", () => {
    const { wwwAuthenticate, body } = buildAuthChallenge(origin, 'a"b\\c\r\ndée');
    expect(wwwAuthenticate.endsWith(', error_description="abcde"')).toBe(true);
    expect(wwwAuthenticate.match(/error_description=/g)).toHaveLength(1);
    expect(body.error.data.error_description).toBe("abcde");
  });

  it("caps the description at 300 characters", () => {
    const { wwwAuthenticate, body } = buildAuthChallenge(origin, "x".repeat(400));
    expect(body.error.data.error_description).toBe("x".repeat(300));
    expect(wwwAuthenticate.endsWith(`error_description="${"x".repeat(300)}"`)).toBe(true);
  });

  it("omits a description that sanitizes to empty", () => {
    expect(JSON.stringify(buildAuthChallenge(origin, '"""'))).toBe(JSON.stringify(buildAuthChallenge(origin)));
    expect(sanitizeErrorDescription('"""')).toBeNull();
  });
});

describe("SUPPORTED_SCOPES (fallback list)", () => {
  // Listed literally, not via API_SCOPES, so a future deletion in the source fails this test.
  const ENFORCED_API_SCOPES = [
    "agents:read",
    "agents:write",
    "runs:read",
    "spaces:read",
    "spaces:write",
    "billing:read",
  ];

  it("is exactly the six scopes the Control Center enforces", () => {
    expect([...SUPPORTED_SCOPES].sort()).toEqual([...ENFORCED_API_SCOPES].sort());
  });

  it("does not include offline_access (MCP 2026-07-28 authorization: SHOULD NOT advertise it)", () => {
    expect(SUPPORTED_SCOPES).not.toContain("offline_access");
  });

  it("has no duplicate entries", () => {
    expect(new Set(SUPPORTED_SCOPES).size).toBe(SUPPORTED_SCOPES.length);
  });

  it("API_SCOPES is exactly the six API scopes, without offline_access", () => {
    expect([...API_SCOPES].sort()).toEqual([...ENFORCED_API_SCOPES].sort());
    expect(API_SCOPES).not.toContain("offline_access");
  });
});
