/**
 * OAuth Authorization Server Metadata (RFC 8414)
 *
 * Builds the metadata document that MCP clients use to discover OAuth2
 * endpoints.  Extracted into its own module so it can be unit-tested
 * independently of the HTTP server.
 *
 * Client registration priority (per MCP spec 2025-11-25):
 *   1. Pre-registration (static client credentials)
 *   2. CIMD - Client ID Metadata Documents (preferred dynamic method)
 *   3. DCR  - Dynamic Client Registration (fallback)
 */

/**
 * The six scopes with API meaning that the Control Center enforces (SE4-3895), i.e. its
 * `OAuthScopes.ResourceScopes`. Exported so `SUPPORTED_SCOPES` below and the tests that
 * pin the list share one definition of "the six" instead of retyping it.
 */
export const API_SCOPES = [
  "agents:read",
  "agents:write",
  "runs:read",
  "spaces:read",
  "spaces:write",
  "billing:read",
] as const;

/**
 * The authorization server's own refresh-token grant scope. Not an API scope -- it grants no
 * access to any resource -- so it lives outside {@link API_SCOPES}, but MCP clients must
 * request it to be issued a refresh token. `resource-scopes.ts` appends it to whatever list
 * the Control Center returns, which is why it is exported rather than written out twice.
 */
export const OFFLINE_ACCESS_SCOPE = "offline_access";

/**
 * Fallback `scopes_supported` list, served only until `resource-scopes.ts` has successfully
 * fetched the Control Center's own `/api/oauth/resource-metadata` document (SE4-3929); a
 * later failed refresh keeps the last list fetched rather than reverting to this one.
 *
 * Derived from {@link API_SCOPES} so the two cannot disagree, but note what that does and
 * does not buy: it guarantees the fallback covers every scope listed *here*, not every scope
 * the Control Center enforces. `API_SCOPES` is still a hand-maintained mirror and will lag a
 * scope newly added upstream -- closing that gap is the live fetch's job, not this list's.
 */
export const SUPPORTED_SCOPES = [...API_SCOPES, OFFLINE_ACCESS_SCOPE] as const;

/**
 * RFC 9728 §5.1 — WWW-Authenticate challenge for unauthenticated MCP requests.
 *
 * Returned whenever the MCP endpoint receives a request without a Bearer token.
 * The `resource_metadata` parameter tells spec-conformant clients (MCP Inspector,
 * Glama, Cursor, Claude, ChatGPT) where to find the Protected Resource Metadata
 * document so they can auto-discover the authorization server and complete OAuth.
 *
 * References:
 *   RFC 9728 §5.1  — resource_metadata parameter in WWW-Authenticate
 *   RFC 6750 §3.1  — realm and error parameters for Bearer challenges
 */
export interface AuthChallenge {
  wwwAuthenticate: string;
  body: {
    jsonrpc: "2.0";
    error: {
      code: -32001;
      message: "Authentication required";
      data: { protectedResourceMetadata: string };
    };
    id: null;
  };
}

export function buildAuthChallenge(mcpServerOrigin: string): AuthChallenge {
  const prmUrl = `${mcpServerOrigin}/.well-known/oauth-protected-resource`;
  const realm = new URL(mcpServerOrigin).host;
  return {
    wwwAuthenticate: `Bearer realm="${realm}", error="invalid_token", resource_metadata="${prmUrl}"`,
    body: {
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Authentication required",
        data: { protectedResourceMetadata: prmUrl },
      },
      id: null,
    },
  };
}
