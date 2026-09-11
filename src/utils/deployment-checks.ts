/**
 * Pure assertions over a deployed MCP server's public surface.
 *
 * Deliberately IO-free: the caller fetches, this module judges. That split is
 * what makes every assertion unit-testable without mocking the network.
 *
 * Every check here is satisfiable WITHOUT a token, which is the whole point —
 * the conformance CLI cannot authenticate, so the deployed surface is verified
 * by plain HTTP assertions instead.
 */

/** One fetched response, reduced to what the assertions need. */
export interface ProbeResponse {
  status: number;
  /** Header names MUST be lowercased by the caller. */
  headers: Record<string, string>;
  body: string;
}

export interface DeploymentProbes {
  /** GET / */
  root: ProbeResponse;
  /** GET /health */
  health: ProbeResponse;
  /** GET /.well-known/oauth-protected-resource */
  protectedResource: ProbeResponse;
  /** GET /.well-known/oauth-authorization-server, captured WITHOUT following redirects. */
  authServer: ProbeResponse;
  /** GET /mcp with no Authorization header. */
  mcpGet: ProbeResponse;
  /** POST /mcp with no Authorization header. */
  mcpPost: ProbeResponse;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Minimum scopes a deployment must advertise; the live list is the Control Center's
 * with offline_access filtered out (see resource-scopes.ts).
 */
export const EXPECTED_SCOPES = ["agents:read", "runs:read", "spaces:read", "agents:write"] as const;

/**
 * Scopes a deployment must NOT advertise. MCP 2026-07-28 "Refresh Tokens" says a
 * resource server SHOULD NOT list offline_access: clients obtain refresh tokens
 * without requesting it, so advertising it here only invites clients to ask for
 * an OpenID Connect scope the resource does not enforce.
 */
export const FORBIDDEN_SCOPES = ["offline_access"] as const;

function parseJson(body: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body);
    return value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function checkDeployment(
  baseUrl: string,
  probes: DeploymentProbes
): CheckResult[] {
  const results: CheckResult[] = [];

  // 1 — the bare origin serves the landing page rather than a 404.
  {
    const contentType = probes.root.headers["content-type"] ?? "";
    const ok = probes.root.status === 200 && contentType.includes("text/html");
    results.push({
      name: "landing-page",
      ok,
      detail: `GET / → ${probes.root.status} ${contentType || "(no content-type)"}`,
    });
  }

  // 2 — health endpoint reports ok.
  {
    const body = parseJson(probes.health.body);
    const ok = probes.health.status === 200 && body?.status === "ok";
    results.push({
      name: "health",
      ok,
      detail: ok
        ? `GET /health → 200 status=ok version=${String(body?.version)}`
        : `GET /health → ${probes.health.status} body=${probes.health.body.slice(0, 120)}`,
    });
  }

  // 3 — RFC 9728 protected-resource metadata is correct for this origin.
  {
    const body = parseJson(probes.protectedResource.body);
    const servers = Array.isArray(body?.authorization_servers)
      ? (body.authorization_servers as unknown[])
      : [];
    const scopes = Array.isArray(body?.scopes_supported)
      ? (body.scopes_supported as unknown[])
      : [];
    const missingScopes = EXPECTED_SCOPES.filter((s) => !scopes.includes(s));
    const forbiddenScopes = FORBIDDEN_SCOPES.filter((s) => scopes.includes(s));
    const problems: string[] = [];

    if (probes.protectedResource.status !== 200) {
      problems.push(`status ${probes.protectedResource.status}`);
    }
    if (body?.resource !== baseUrl) {
      problems.push(`resource=${String(body?.resource)} expected ${baseUrl}`);
    }
    if (servers.length === 0) {
      problems.push("authorization_servers is empty");
    }
    if (missingScopes.length > 0) {
      problems.push(`missing scopes: ${missingScopes.join(", ")}`);
    }
    if (forbiddenScopes.length > 0) {
      problems.push(`advertises forbidden scopes: ${forbiddenScopes.join(", ")}`);
    }

    results.push({
      name: "protected-resource",
      ok: problems.length === 0,
      detail:
        problems.length === 0
          ? `authorization_servers=${servers.join(", ")}, all ${EXPECTED_SCOPES.length} scopes present, ${FORBIDDEN_SCOPES.join(", ")} absent`
          : problems.join("; "),
    });
  }

  // 4 — the AS metadata path redirects to the authorization server's own
  // document. RFC 8414 §3.3 requires `issuer` to equal the origin the document
  // was fetched from, which a copy served here could never satisfy — so a body
  // served at this path is a defect, and a redirect back to this host is too.
  {
    const location = probes.authServer.headers["location"] ?? "";
    const target = hostOf(location);
    const self = hostOf(baseUrl);
    const isRedirect = probes.authServer.status >= 300 && probes.authServer.status < 400;
    const pointsElsewhere = target !== null && self !== null && target !== self;
    const ok = isRedirect && pointsElsewhere;
    results.push({
      name: "as-metadata-redirect",
      ok,
      detail: ok
        ? `${probes.authServer.status} → ${location}`
        : `expected 3xx to a different host, got ${probes.authServer.status} location=${location || "(none)"}`,
    });
  }

  // 5 — GET /mcp answers 401 before 405. Auth precedes method rejection so
  // directory crawlers can discover the authorization server.
  {
    const ok = probes.mcpGet.status === 401;
    results.push({
      name: "mcp-get-401",
      ok,
      detail: `GET /mcp (no auth) → ${probes.mcpGet.status}`,
    });
  }

  // 6 — POST /mcp answers 401 carrying the RFC 9728 challenge, including the
  // resource_metadata pointer clients need to start OAuth.
  {
    const challenge = probes.mcpPost.headers["www-authenticate"] ?? "";
    const ok =
      probes.mcpPost.status === 401 &&
      challenge.includes("Bearer") &&
      challenge.includes("resource_metadata=");
    results.push({
      name: "mcp-post-challenge",
      ok,
      detail: ok
        ? "401 with Bearer challenge and resource_metadata"
        : `status=${probes.mcpPost.status} www-authenticate=${challenge || "(none)"}`,
    });
  }

  return results;
}
