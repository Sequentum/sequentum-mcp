import { describe, it, expect } from "vitest";
import { buildAuthChallenge } from "./oauth-metadata.js";

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

  it("works with a QA hostname", () => {
    const { wwwAuthenticate, body } = buildAuthChallenge("https://mcp-qa.sequentum.com");
    expect(wwwAuthenticate).toContain('realm="mcp-qa.sequentum.com"');
    expect(wwwAuthenticate).toContain(
      'resource_metadata="https://mcp-qa.sequentum.com/.well-known/oauth-protected-resource"'
    );
    expect(body.error.data.protectedResourceMetadata).toBe(
      "https://mcp-qa.sequentum.com/.well-known/oauth-protected-resource"
    );
  });
});
