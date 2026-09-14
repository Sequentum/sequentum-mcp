import { describe, it, expect } from "vitest";
import {
  checkDeployment,
  EXPECTED_SCOPES,
  type DeploymentProbes,
  type ProbeResponse,
} from "./deployment-checks.js";

const BASE = "https://mcp-qa.sequentum.com";

function res(over: Partial<ProbeResponse> = {}): ProbeResponse {
  return { status: 200, headers: {}, body: "", ...over };
}

/** A probe set that mirrors a known-good QA deployment. */
function goodProbes(): DeploymentProbes {
  return {
    root: res({ headers: { "content-type": "text/html; charset=utf-8" } }),
    health: res({ body: JSON.stringify({ status: "ok", version: "2.0.0", transport: "streamable-http" }) }),
    protectedResource: res({
      body: JSON.stringify({
        resource: BASE,
        authorization_servers: ["https://dashboard-qa.sequentum.com"],
        scopes_supported: [...EXPECTED_SCOPES],
        bearer_methods_supported: ["header"],
      }),
    }),
    authServer: res({
      status: 302,
      headers: { location: "https://dashboard-qa.sequentum.com/.well-known/oauth-authorization-server" },
    }),
    mcpGet: res({ status: 401 }),
    mcpPost: res({
      status: 401,
      headers: {
        "www-authenticate":
          'Bearer realm="mcp-qa.sequentum.com", error="invalid_token", resource_metadata="https://mcp-qa.sequentum.com/.well-known/oauth-protected-resource"',
      },
    }),
  };
}

function byName(results: ReturnType<typeof checkDeployment>, name: string) {
  const found = results.find((r) => r.name === name);
  if (!found) throw new Error(`no check named ${name}`);
  return found;
}

describe("checkDeployment (healthy deployment)", () => {
  it("returns exactly six checks", () => {
    expect(checkDeployment(BASE, goodProbes())).toHaveLength(6);
  });

  it("passes every check", () => {
    const results = checkDeployment(BASE, goodProbes());
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });
});

describe("checkDeployment (landing page)", () => {
  it("fails when the root is not HTML", () => {
    const probes = goodProbes();
    probes.root = res({ headers: { "content-type": "application/json" } });
    expect(byName(checkDeployment(BASE, probes), "landing-page").ok).toBe(false);
  });

  it("fails when the root 404s", () => {
    const probes = goodProbes();
    probes.root = res({ status: 404, headers: { "content-type": "text/html" } });
    expect(byName(checkDeployment(BASE, probes), "landing-page").ok).toBe(false);
  });
});

describe("checkDeployment (health)", () => {
  it("fails when status is not ok", () => {
    const probes = goodProbes();
    probes.health = res({ body: JSON.stringify({ status: "degraded" }) });
    expect(byName(checkDeployment(BASE, probes), "health").ok).toBe(false);
  });

  it("fails when the body is not JSON", () => {
    const probes = goodProbes();
    probes.health = res({ body: "<html>oops</html>" });
    expect(byName(checkDeployment(BASE, probes), "health").ok).toBe(false);
  });
});

describe("checkDeployment (protected resource metadata)", () => {
  it("fails when resource does not match the base URL", () => {
    const probes = goodProbes();
    probes.protectedResource = res({
      body: JSON.stringify({
        resource: "https://mcp.sequentum.com",
        authorization_servers: ["https://dashboard-qa.sequentum.com"],
        scopes_supported: [...EXPECTED_SCOPES],
        bearer_methods_supported: ["header"],
      }),
    });
    expect(byName(checkDeployment(BASE, probes), "protected-resource").ok).toBe(false);
  });

  it("fails when a supported scope is missing", () => {
    const probes = goodProbes();
    probes.protectedResource = res({
      body: JSON.stringify({
        resource: BASE,
        authorization_servers: ["https://dashboard-qa.sequentum.com"],
        scopes_supported: ["agents:read"],
        bearer_methods_supported: ["header"],
      }),
    });
    expect(byName(checkDeployment(BASE, probes), "protected-resource").ok).toBe(false);
  });

  it("fails when offline_access is advertised", () => {
    // MCP 2026-07-28 "Refresh Tokens": a resource server SHOULD NOT advertise
    // offline_access; clients obtain refresh tokens without requesting it.
    const probes = goodProbes();
    probes.protectedResource = res({
      body: JSON.stringify({
        resource: BASE,
        authorization_servers: ["https://dashboard-qa.sequentum.com"],
        scopes_supported: [...EXPECTED_SCOPES, "offline_access"],
        bearer_methods_supported: ["header"],
      }),
    });
    const result = byName(checkDeployment(BASE, probes), "protected-resource");
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("offline_access");
  });

  it("fails when authorization_servers is empty", () => {
    const probes = goodProbes();
    probes.protectedResource = res({
      body: JSON.stringify({
        resource: BASE,
        authorization_servers: [],
        scopes_supported: [...EXPECTED_SCOPES],
        bearer_methods_supported: ["header"],
      }),
    });
    expect(byName(checkDeployment(BASE, probes), "protected-resource").ok).toBe(false);
  });
});

describe("checkDeployment (authorization server redirect)", () => {
  it("fails when the endpoint returns a body instead of a redirect", () => {
    const probes = goodProbes();
    probes.authServer = res({ status: 200, body: JSON.stringify({ issuer: BASE }) });
    expect(byName(checkDeployment(BASE, probes), "as-metadata-redirect").ok).toBe(false);
  });

  it("fails when the redirect points back at this host", () => {
    const probes = goodProbes();
    probes.authServer = res({
      status: 302,
      headers: { location: `${BASE}/.well-known/oauth-authorization-server` },
    });
    expect(byName(checkDeployment(BASE, probes), "as-metadata-redirect").ok).toBe(false);
  });
});

describe("checkDeployment (unauthenticated MCP endpoint)", () => {
  it("fails when GET /mcp does not 401", () => {
    const probes = goodProbes();
    probes.mcpGet = res({ status: 405 });
    expect(byName(checkDeployment(BASE, probes), "mcp-get-401").ok).toBe(false);
  });

  it("fails when POST /mcp 401s without a WWW-Authenticate challenge", () => {
    const probes = goodProbes();
    probes.mcpPost = res({ status: 401, headers: {} });
    expect(byName(checkDeployment(BASE, probes), "mcp-post-challenge").ok).toBe(false);
  });

  it("fails when the challenge omits resource_metadata", () => {
    const probes = goodProbes();
    probes.mcpPost = res({
      status: 401,
      headers: { "www-authenticate": 'Bearer realm="mcp-qa.sequentum.com"' },
    });
    expect(byName(checkDeployment(BASE, probes), "mcp-post-challenge").ok).toBe(false);
  });
});
