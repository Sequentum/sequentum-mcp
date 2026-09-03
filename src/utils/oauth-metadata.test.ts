import { describe, it, expect } from "vitest";
import { buildAuthChallenge, SUPPORTED_SCOPES, API_SCOPES } from "./oauth-metadata.js";

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

  it("is a superset of every scope the Control Center enforces", () => {
    for (const scope of ENFORCED_API_SCOPES) {
      expect(SUPPORTED_SCOPES).toContain(scope);
    }
  });

  it("includes offline_access", () => {
    expect(SUPPORTED_SCOPES).toContain("offline_access");
  });

  it("has no duplicate entries", () => {
    expect(new Set(SUPPORTED_SCOPES).size).toBe(SUPPORTED_SCOPES.length);
  });

  it("API_SCOPES is exactly the six API scopes, without offline_access", () => {
    expect([...API_SCOPES].sort()).toEqual([...ENFORCED_API_SCOPES].sort());
    expect(API_SCOPES).not.toContain("offline_access");
  });
});
