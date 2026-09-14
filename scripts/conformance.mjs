#!/usr/bin/env node
/**
 * Runs the official MCP conformance suite against a locally booted server.
 *
 * Coverage spans both protocol eras this server speaks: the legacy 2025-11-25
 * path that existing connectors use, and the 2026-07-28 stateless path. Every
 * run passes an explicit --spec-version, so the era is never left to CLI
 * defaults.
 *
 * Verdicts come from checks.json (written with `-o`), judged at check level by
 * dist/utils/conformance-checks.js, not from the CLI's exit code. The CLI's
 * --expected-failures baseline is scenario-level and would silence every
 * check in a scenario; judging per check keeps each passing check a guard.
 *
 * Imports the built judge, so run `npm run build` first.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Fixture-free scenarios only, each with the spec versions it runs under.
 *
 * Excluded, and why:
 * - json-schema-2020-12: needs the fixture tool `json_schema_2020_12_tool`.
 * - http-custom-header-server-validation: needs a tool annotated with
 *   `x-mcp-header`; revisit if that schema extension is adopted.
 * - tasks-* (10): Tasks extension not implemented.
 * - input-required-result-* (14): Multi Round-Trip Requests not implemented.
 * - Everything that calls a named fixture (tools-call-*, resources-read-*,
 *   prompts-get-*, completion-complete, resources-subscribe, ...) or a feature
 *   deliberately unimplemented (logging/setLevel, elicitation, sampling).
 *
 * Do NOT add a scenario here without first confirming it passes against this
 * server with no fixtures registered. A scenario that cannot pass belongs
 * nowhere near this list.
 */
const SCENARIOS = [
  { scenario: "server-initialize",           eras: ["2025-11-25"] },
  { scenario: "ping",                        eras: ["2025-11-25"] },
  { scenario: "tools-list",                  eras: ["2025-11-25", "2026-07-28"] },
  { scenario: "resources-list",              eras: ["2025-11-25", "2026-07-28"] },
  { scenario: "prompts-list",                eras: ["2025-11-25", "2026-07-28"] },
  { scenario: "dns-rebinding-protection",    eras: ["2025-11-25", "2026-07-28"] },
  { scenario: "server-stateless",            eras: ["2026-07-28"] },
  { scenario: "http-header-validation",      eras: ["2026-07-28"] },
  { scenario: "caching",                     eras: ["2026-07-28"] },
  { scenario: "sep-2164-resource-not-found", eras: ["2026-07-28"] },
];

/**
 * Check ids tolerated per scenario. Each entry needs a reason. The judge fails
 * the run if an entry stops failing, so this list cannot rot silently.
 *
 * "Not testable:" failures (the CLI could not find a diagnostic fixture tool)
 * are skipped automatically and never need an entry here.
 */
const ALLOWLIST = {
  caching: [
    // resources/read needs an upstream Control Center credential. The CI server
    // has none, so the read fails with -32603 before a result (and its cache
    // hints) exists. Every list endpoint's cache hints are still checked.
    "sep-2549-resources-read-caching-hints",
  ],
};

const HEALTH_TIMEOUT_MS = 20_000;

/** Module-scope so the signal handlers below can always reach them. */
let serverProcess = null;
let currentOutDir = null;

/**
 * The booted server's stderr, accumulated so a boot failure (a malformed
 * SEQUENTUM_OAUTH_ISSUER, a port collision, ...) is diagnosable instead of just
 * showing up as a 20s health-check timeout. Capped so a chatty server (DEBUG=1
 * logs an [MCP] line per request) can't blow up memory.
 */
let serverStderr = "";
const SERVER_STDERR_CAP = 64 * 1024;

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

function removeOutDir() {
  if (currentOutDir) {
    rmSync(currentOutDir, { recursive: true, force: true });
    currentOutDir = null;
  }
}

function cleanup() {
  stopServer();
  removeOutDir();
}

// A conformance run that is interrupted must not leave a listener or a temp
// directory behind on a CI runner or a developer's machine.
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

/** Ask the OS for a free port, so we never collide with a dev's running server. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function pollHealth(healthUrl) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) return;
    } catch {
      // Not listening yet — keep waiting.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `Server never became healthy at ${healthUrl} within ${HEALTH_TIMEOUT_MS}ms`
  );
}

/**
 * Races health polling against the server process dying early, so a boot
 * failure (e.g. a startup validation throwing before the HTTP listener ever
 * opens) surfaces immediately instead of after the full 20s timeout.
 */
async function waitForHealth(healthUrl) {
  const exited = new Promise((_resolve, reject) => {
    serverProcess.once("exit", (code) => {
      reject(new Error(`Server exited with code ${code} before becoming healthy`));
    });
  });
  await Promise.race([pollHealth(healthUrl), exited]);
}

/**
 * Spawns the CLI for one scenario and era. stdio is inherited so every check
 * line is readable in CI logs. Resolves with the CLI exit code (or a
 * descriptive string if the CLI could not even be spawned), which is only
 * used for diagnostics: the verdict comes from checks.json.
 */
function runCli(scenario, era, mcpUrl, outDir) {
  return new Promise((resolve) => {
    const child = spawn(
      join(ROOT, "node_modules", ".bin", "conformance"),
      [
        "server",
        "--url", mcpUrl,
        "--scenario", scenario,
        "--spec-version", era,
        "-o", outDir,
      ],
      { stdio: "inherit" }
    );
    // Without this, a missing node_modules/.bin/conformance raises an
    // unhandled 'error' event instead of resolving; Promise semantics ignore
    // any second resolve, so a stray 'close' after 'error' is harmless.
    child.once("error", (err) => resolve(`spawn failed: ${err.message}`));
    child.on("close", (code) => resolve(code));
  });
}

/**
 * The CLI writes `<outDir>/server-<scenario>-<timestamp>/checks.json`. The
 * directory is fresh per run, so there must be exactly one such file.
 */
function loadChecks(outDir) {
  const candidates = readdirSync(outDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(outDir, entry.name, "checks.json"))
    .filter((path) => existsSync(path));
  if (candidates.length !== 1) {
    throw new Error(
      `expected exactly one checks.json under ${outDir}, found ${candidates.length}`
    );
  }
  const parsed = JSON.parse(readFileSync(candidates[0], "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`${candidates[0]} is not a JSON array of check records`);
  }
  return parsed;
}

function summarize(verdict) {
  const parts = [`${verdict.succeeded} passed`];
  if (verdict.notTestable.length) parts.push(`${verdict.notTestable.length} not testable`);
  if (verdict.allowed.length) parts.push(`${verdict.allowed.length} allowed`);
  if (verdict.warnings.length) {
    parts.push(`${verdict.warnings.length} warning${verdict.warnings.length === 1 ? "" : "s"}`);
  }
  if (verdict.failed.length) parts.push(`${verdict.failed.length} failed`);
  if (verdict.stale.length) parts.push(`${verdict.stale.length} stale`);
  return parts.join(", ");
}

async function runOne(judgeScenario, entry, era, mcpUrl) {
  const label = `${entry.scenario}@${era}`;
  const outDir = mkdtempSync(join(tmpdir(), "mcp-conformance-"));
  currentOutDir = outDir;
  try {
    const exitCode = await runCli(entry.scenario, era, mcpUrl, outDir);
    let verdict;
    try {
      verdict = judgeScenario(loadChecks(outDir), ALLOWLIST[entry.scenario] ?? []);
    } catch (error) {
      console.log(`FAIL  ${label}  (no verdict: ${error.message}; CLI exit code ${exitCode})`);
      return false;
    }
    console.log(`${verdict.passed ? "PASS" : "FAIL"}  ${label}  (${summarize(verdict)})`);
    for (const reason of verdict.reasons) console.log(`      ${reason}`);
    return verdict.passed;
  } finally {
    removeOutDir();
  }
}

async function main() {
  const judgePath = join(ROOT, "dist", "utils", "conformance-checks.js");
  if (!existsSync(judgePath)) {
    console.error("dist/utils/conformance-checks.js not found — run `npm run build` first.");
    process.exit(1);
  }
  const { judgeScenario } = await import(judgePath);

  const externalUrl = process.env.CONFORMANCE_URL;
  let mcpUrl = externalUrl;

  if (!externalUrl) {
    // This script runs the BUILT output, matching src/smoke.test.ts's habit of
    // validating what actually ships under real Node.
    if (!existsSync(join(ROOT, "dist", "index.js"))) {
      console.error("dist/index.js not found — run `npm run build` first.");
      process.exit(1);
    }

    let port;
    if (process.env.CONFORMANCE_PORT) {
      port = Number(process.env.CONFORMANCE_PORT);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        console.error(
          `CONFORMANCE_PORT must be an integer between 1 and 65535, got "${process.env.CONFORMANCE_PORT}"`
        );
        process.exit(1);
      }
    } else {
      port = await freePort();
    }
    mcpUrl = `http://127.0.0.1:${port}/mcp`;

    serverProcess = spawn("node", [join(ROOT, "dist", "index.js")], {
      env: {
        ...process.env,
        TRANSPORT_MODE: "http",
        // The conformance CLI has no --header/--token option, so it cannot
        // authenticate. Harmless here: this is an ephemeral localhost process.
        REQUIRE_AUTH: "false",
        // Load-bearing. cors.ts only allowlists loopback origins when DEBUG=1,
        // and dns-rebinding-protection needs that to score 2/2.
        DEBUG: "1",
        PORT: String(port),
      },
      // stderr is piped (not ignored) so a boot failure — a malformed
      // SEQUENTUM_OAUTH_ISSUER, a port collision, ... — is diagnosable instead of
      // showing up only as a 20s health-check timeout. Accumulated into
      // serverStderr and printed on failure only, so the happy-path CI log stays
      // quiet even though the server logs an [MCP] line per request under DEBUG=1.
      stdio: ["ignore", "ignore", "pipe"],
    });
    serverProcess.stderr.on("data", (chunk) => {
      serverStderr += chunk.toString("utf8");
      if (serverStderr.length > SERVER_STDERR_CAP) {
        serverStderr = serverStderr.slice(serverStderr.length - SERVER_STDERR_CAP);
      }
    });

    try {
      await waitForHealth(`http://127.0.0.1:${port}/health`);
    } catch (error) {
      console.error("--- server stderr ---");
      console.error(serverStderr);
      throw error;
    }
  }

  const failed = [];
  let total = 0;
  try {
    for (const entry of SCENARIOS) {
      for (const era of entry.eras) {
        total += 1;
        const ok = await runOne(judgeScenario, entry, era, mcpUrl);
        if (!ok) failed.push(`${entry.scenario}@${era}`);
      }
    }
  } finally {
    stopServer();
  }

  if (failed.length > 0) {
    // Opt-in: the server's stderr can be noisy (an [MCP] line per request under
    // DEBUG=1), and a run failure is usually diagnosable from the FAIL/reason
    // lines above without it.
    if (process.env.CONFORMANCE_VERBOSE === "1" && serverStderr) {
      console.error("--- server stderr ---");
      console.error(serverStderr);
    }
    console.error(`\nConformance FAILED: ${failed.join(", ")}`);
    process.exit(1);
  }

  console.log(`\nConformance passed: ${total}/${total} runs.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
