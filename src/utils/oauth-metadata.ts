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

/** Scopes shared by Authorization Server Metadata and Protected Resource Metadata. */
export const SUPPORTED_SCOPES = [
  "agents:read",
  "runs:read",
  "spaces:read",
  "agents:write",
  "offline_access",
] as const;

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
