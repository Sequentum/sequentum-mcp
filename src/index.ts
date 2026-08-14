#!/usr/bin/env node

/**
 * Sequentum MCP Server
 *
 * A Model Context Protocol (MCP) server that enables AI assistants to interact
 * with the Sequentum web scraping platform.
 *
 * Supports two transport modes:
 *
 * 1. STDIO MODE (default) - For Claude Code and local development
 *    Environment Variables:
 *      SEQUENTUM_API_URL - Base URL of the Sequentum API (default: https://dashboard.sequentum.com)
 *      SEQUENTUM_API_KEY - Your API key (required, format: sk-...)
 *      DEBUG - Set to '1' for debug logging
 *
 * 2. HTTP MODE - For Claude Connectors (claude.ai, Claude Desktop)
 *    Environment Variables:
 *      TRANSPORT_MODE - Set to 'http' to enable HTTP mode
 *      PORT - HTTP server port (default: 3000)
 *      HOST - HTTP server host (default: 0.0.0.0)
 *      SEQUENTUM_API_URL - Base URL of the Sequentum API (default: https://dashboard.sequentum.com)
 *      SEQUENTUM_OAUTH_ISSUER - This deployment's OAuth issuer identifier, advertised in
 *                     /.well-known/oauth-protected-resource and used as the redirect target
 *                     for /.well-known/oauth-authorization-server. Defaults to
 *                     SEQUENTUM_API_URL. Must be an absolute https URL with no query,
 *                     fragment or userinfo, and must match the authorization server's own
 *                     issuer exactly. A malformed value refuses to start.
 *      DEBUG - Set to '1' for debug logging
 *      REQUIRE_AUTH - Set to 'false' to bypass OAuth for testing (limited use: allows
 *                     connecting to MCP server but tools will fail without valid tokens)
 *      OPENAI_APPS_CHALLENGE_TOKEN - Token provided by OpenAI during ChatGPT App domain
 *                     verification. Served at /.well-known/openai-apps-challenge as
 *                     text/plain (200). Returns 404 when unset. Only needed during the
 *                     submission flow; safe to unset afterwards.
 *      LIST_CACHE_TTL_MS - Cache-hint freshness (ms) advertised on list-shaped results
 *                     (tools/list, prompts/list, resources/list,
 *                     resources/templates/list) and server/discover.
 *      MCP_RATE_LIMIT_WINDOW_MS - Rate-limit window (ms) for the /mcp endpoint.
 *      MCP_RATE_LIMIT_MAX - Max requests per window per IP for the /mcp endpoint.
 *      TRUST_PROXY - Express 'trust proxy' setting: 'true'/'false', a hop count, or a
 *                     comma-separated CIDR/IP allowlist of trusted reverse proxies.
 *      ALLOWED_ORIGINS - Comma-separated list of additional exact-match Origins to
 *                     allow via CORS, appended to the built-in defaults.
 *
 *    Authentication: OAuth2 tokens are provided by Claude's infrastructure
 *    via the Authorization header on each request.
 */

import { createRequire } from "module";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { SequentumApiClient } from "./api/api-client.js";
import type { AuthMode } from "./api/types.js";
import { createMcpServer } from "./server/handlers.js";
import { startHttpServer } from "./server/http-server.js";
import { resolveIssuer } from "./utils/issuer.js";

// Import version from package.json
const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

// Configuration from environment variables
const DEFAULT_API_URL = "https://dashboard.sequentum.com";
const API_BASE_URL = process.env.SEQUENTUM_API_URL || DEFAULT_API_URL;
const API_KEY = process.env.SEQUENTUM_API_KEY;
const DEBUG = process.env.DEBUG === "1";

// Transport configuration
// - "stdio": For Claude Code and local development (default)
// - "http": For Claude Connectors (claude.ai, Claude Desktop)
const TRANSPORT_MODE = process.env.TRANSPORT_MODE || "stdio";
const HTTP_PORT = parseInt(process.env.PORT || "3000", 10);
const HTTP_HOST = process.env.HOST || "0.0.0.0";

// Determine authentication mode based on transport
// - stdio mode: Uses API Key (for local development and Claude Code)
// - HTTP mode: Uses OAuth2 via Claude's infrastructure (for Claude Connectors)
let authMode: AuthMode;

if (TRANSPORT_MODE === "http") {
  authMode = "oauth2";
  if (DEBUG) {
    console.error("[DEBUG] HTTP mode: OAuth2 tokens will be received via request headers");
  }
} else {
  if (!API_KEY) {
    console.error("Error: API Key required for stdio mode");
    console.error('Set SEQUENTUM_API_KEY="sk-your-api-key-here"');
    console.error("\nFor Claude Connectors (OAuth2), use HTTP mode:");
    console.error('Set TRANSPORT_MODE="http"');
    process.exit(1);
  }
  authMode = "apikey";
  if (DEBUG) {
    console.error("[DEBUG] Using API Key authentication");
  }
}

// Debug: Log environment configuration (only when DEBUG=1)
if (DEBUG) {
  console.error(`[DEBUG] TRANSPORT_MODE = ${TRANSPORT_MODE}`);
  console.error(
    `[DEBUG] API_BASE_URL = ${API_BASE_URL}${!process.env.SEQUENTUM_API_URL ? " (default)" : ""}`
  );
  console.error(`[DEBUG] Auth Mode = ${authMode}`);
  if (TRANSPORT_MODE === "http") {
    console.error(`[DEBUG] HTTP_PORT = ${HTTP_PORT}`);
    console.error(`[DEBUG] HTTP_HOST = ${HTTP_HOST}`);
  }
}

// ==========================================
// Main Entry Point
// ==========================================

/**
 * Start the MCP server in stdio mode (for Claude Code and local development)
 */
async function startStdioServer() {
  console.error("Authentication: API Key");

  const client = new SequentumApiClient(API_BASE_URL, API_KEY!);
  const server = createMcpServer(client, version);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sequentum MCP Server running on stdio");
  console.error(`Connected to: ${API_BASE_URL}`);
}

/**
 * Resolves the OAuth issuer for HTTP mode, or exits.
 *
 * Kept out of main() so the "exit" branch is a `never` return and TypeScript can see
 * that the caller always receives a string.
 */
function resolveIssuerOrExit(): string {
  try {
    const resolved = resolveIssuer(process.env, DEFAULT_API_URL);
    if (resolved.warning) {
      console.error(`Warning: ${resolved.warning}`);
    }
    if (DEBUG) {
      console.error(`[DEBUG] OAuth issuer = ${resolved.issuer} (source: ${resolved.source})`);
    }
    return resolved.issuer;
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

async function main() {
  if (TRANSPORT_MODE === "http") {
    // Resolved here and not at module scope so stdio never reaches it: stdio publishes
    // no metadata, has no use for an issuer, and must not gain a new way to fail over a
    // malformed SEQUENTUM_OAUTH_ISSUER left in a shell profile.
    const issuer = resolveIssuerOrExit();
    await startHttpServer(API_BASE_URL, issuer, version, HTTP_PORT, HTTP_HOST);
  } else {
    await startStdioServer();
  }
}

main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});

