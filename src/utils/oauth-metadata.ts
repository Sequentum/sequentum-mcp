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

export function buildOAuthMetadata(apiBaseUrl: string): Record<string, unknown> {
  return {
    issuer: apiBaseUrl,
    authorization_endpoint: `${apiBaseUrl}/api/oauth/authorize`,
    token_endpoint: `${apiBaseUrl}/api/oauth/token`,
    registration_endpoint: `${apiBaseUrl}/api/oauth/register`, // RFC 7591 DCR (fallback)
    token_endpoint_auth_methods_supported: ["none"], // Public client (PKCE)
    grant_types_supported: ["authorization_code", "refresh_token"],
    response_types_supported: ["code"],
    scopes_supported: [...SUPPORTED_SCOPES],
    code_challenge_methods_supported: ["S256"], // PKCE support
    service_documentation: "https://docs.sequentum.com/api",
    resource_indicators_supported: true,
    client_id_metadata_document_supported: true, // CIMD (draft-ietf-oauth-client-id-metadata-document)
  };
}
