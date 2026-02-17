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
 *      DEBUG - Set to '1' for debug logging
 *      REQUIRE_AUTH - Set to 'false' to bypass OAuth for testing (limited use: allows
 *                     connecting to MCP server but tools will fail without valid tokens)
 *    
 *    Authentication: OAuth2 tokens are provided by Claude's infrastructure
 *    via the Authorization header on each request.
 */

import { createRequire } from "module";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SequentumApiClient } from "./api/api-client.js";
import { AuthMode } from "./api/types.js";
import { createMcpServer } from "./server/handlers.js";
import { startHttpServer } from "./server/http-server.js";

// Import version from package.json
const require = createRequire(import.meta.url);
const { version } = require("../package.json");

// Configuration from environment variables
const DEFAULT_API_URL = "https://dashboard.sequentum.com";
const API_BASE_URL = process.env.SEQUENTUM_API_URL || DEFAULT_API_URL;
const API_KEY = process.env.SEQUENTUM_API_KEY;
const DEBUG = process.env.DEBUG === '1';

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
  // HTTP mode: OAuth2 is required and handled by Claude's infrastructure
  // Tokens will be passed in Authorization header of each request
  authMode = "oauth2";
  if (DEBUG) {
    console.error(`[DEBUG] HTTP mode: OAuth2 tokens will be received via request headers`);
  }
} else {
  // stdio mode: API Key is required
  if (!API_KEY) {
    console.error("Error: API Key required for stdio mode");
    console.error('Set SEQUENTUM_API_KEY="sk-your-api-key-here"');
    console.error("\nFor Claude Connectors (OAuth2), use HTTP mode:");
    console.error('Set TRANSPORT_MODE="http"');
    process.exit(1);
  }
  authMode = "apikey";
  if (DEBUG) {
    console.error(`[DEBUG] Using API Key authentication`);
  }
}

// Debug: Log environment configuration (only when DEBUG=1)
if (DEBUG) {
  console.error(`[DEBUG] TRANSPORT_MODE = ${TRANSPORT_MODE}`);
  console.error(`[DEBUG] API_BASE_URL = ${API_BASE_URL}${!process.env.SEQUENTUM_API_URL ? ' (default)' : ''}`);
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
  console.error(`Authentication: API Key`);

  const client = new SequentumApiClient(API_BASE_URL, API_KEY!);
  const server = createMcpServer(client, version);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sequentum MCP Server running on stdio");
  console.error(`Connected to: ${API_BASE_URL}`);
}

async function main() {
  if (TRANSPORT_MODE === "http") {
    await startHttpServer(API_BASE_URL, version, HTTP_PORT, HTTP_HOST);
  } else {
    await startStdioServer();
  }
}

main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
