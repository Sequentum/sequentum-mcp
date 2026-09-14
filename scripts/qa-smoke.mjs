#!/usr/bin/env node
/**
 * Asserts the deployed MCP surface at a base URL. No token, no secrets.
 *
 * This exists because the conformance CLI cannot authenticate, so it can say
 * nothing about a deployed server. What a token-free caller CAN verify is the
 * public contract: the landing page, health, the two well-known documents, and
 * the shape of the 401 challenge. That is exactly what this checks.
 *
 * Imports the built module, so run `npm run build` first.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASE = "https://mcp-qa.sequentum.com";

const built = join(ROOT, "dist", "utils", "deployment-checks.js");
if (!existsSync(built)) {
  console.error("dist/utils/deployment-checks.js not found — run `npm run build` first.");
  process.exit(1);
}
const { checkDeployment } = await import(built);

/**
 * `redirect: "manual"` is essential: the AS-metadata check asserts on the 302
 * itself, and following it would hide exactly what we are testing.
 */
async function probe(url, init = {}) {
  const res = await fetch(url, { redirect: "manual", ...init });
  const headers = {};
  res.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return { status: res.status, headers, body: await res.text() };
}

async function main() {
  const baseUrl = (process.argv[2] ?? DEFAULT_BASE).replace(/\/$/, "");
  console.log(`Checking deployed surface at ${baseUrl}\n`);

  const probes = {
    root: await probe(`${baseUrl}/`),
    health: await probe(`${baseUrl}/health`),
    protectedResource: await probe(`${baseUrl}/.well-known/oauth-protected-resource`),
    authServer: await probe(`${baseUrl}/.well-known/oauth-authorization-server`),
    mcpGet: await probe(`${baseUrl}/mcp`),
    mcpPost: await probe(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  };

  const results = checkDeployment(baseUrl, probes);

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}: ${result.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\nDeployment check FAILED: ${failed.map((r) => r.name).join(", ")}`);
    process.exit(1);
  }

  console.log(`\nDeployment check passed: ${results.length}/${results.length}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
