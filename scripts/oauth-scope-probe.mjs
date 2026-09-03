#!/usr/bin/env node
// oauth-scope-probe -- live probe of OAuth scope enforcement on the Sequentum external V1 API
// (SE4-3895) and of revoke-on-refresh (SE4-3896), run against a deployed environment.
//
// It performs the same authorization-code flow an MCP client performs (Dynamic Client
// Registration, browser consent with PKCE, loopback callback, token exchange), then exercises
// the V1 API directly and through this MCP server with tokens of three scope profiles, and
// checks the server's behaviour against the rollout mode you pass:
//
//   --mode log-only   every call succeeds; a "Scope check would deny (log-only)" line is
//                     written to CloudWatch for every scope mismatch
//   --mode enforce    scope mismatches return 403 insufficient_scope
//
// Everything that needs a session happens in the browser: login, each consent click, and the
// admin Revoke click. No credentials are ever typed into the terminal. The user never sees or
// copies a token.
//
// Node >= 20, no npm dependencies. CloudWatch is read through the `aws` CLI on PATH.
// See docs/oauth-scope-probe.md for prerequisites, run modes, and the residue a run leaves.

import http from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify, parseArgs } from "node:util";
import readline from "node:readline/promises";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);

// --------------------------------------------------------------------------------------
// Environments. Deliberately no "prod" entry: add one on purpose, never by default.
// --------------------------------------------------------------------------------------

const ENVS = {
  qa: {
    name: "qa",
    baseUrl: "https://dashboard-qa.sequentum.com", // authorization server + V1 API
    mcpOrigin: "https://mcp-qa.sequentum.com", // RFC 8707 resource; this server's canonical origin
    logGroup: "se-control-center-qa-logs", // CloudWatch group carrying ScopeEnforcementFilter lines
  },
};

const API_SCOPES = ["agents:read", "agents:write", "runs:read", "spaces:read", "spaces:write", "billing:read"];

// Profile -> scopes requested at /authorize. "all" runs first so the ids it discovers (agent,
// space) can be reused by profiles whose scope cannot list them.
const PROFILES = {
  all: [...API_SCOPES, "offline_access"],
  read: ["agents:read"],
  none: [],
};
const PROFILE_ORDER = ["all", "read", "none"];

const HTTP_TIMEOUT_MS = 60_000;
const CONSENT_TIMEOUT_MS = 300_000;
const CLOUDWATCH_WAIT_MS = 120_000;
const CLOUDWATCH_SETTLE_MS = 45_000;
const CLOUDWATCH_POLL_MS = 10_000;
const CLOUDWATCH_SKEW_MS = 30_000;

// --------------------------------------------------------------------------------------
// Small helpers.
// --------------------------------------------------------------------------------------

function log(msg) {
  const t = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${t}] ${msg}\n`);
}

function short(body, n = 120) {
  const s = String(body ?? "").replace(/\n/g, " ");
  return s.length <= n ? s : s.slice(0, n) + "…";
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pkcePair() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier, "ascii").digest());
  return { verifier, challenge };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTimed(url, init = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), HTTP_TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: ac.signal });
    const text = await r.text();
    return { status: r.status, headers: r.headers, text };
  } finally {
    clearTimeout(t);
  }
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

let rl;
async function pressEnter(prompt) {
  rl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(prompt);
}

class ProbeExit extends Error {}

// --------------------------------------------------------------------------------------
// Loopback listener. Bound once per run, before registration, so the registered redirect URI
// is exactly the one we listen on (DCR redirect URIs are matched byte-for-byte, port included).
// --------------------------------------------------------------------------------------

class CallbackListener {
  constructor() {
    this.expectedState = null;
    this.resolve = null;
    this.server = http.createServer((req, res) => this.handle(req, res));
    // A connection that never sends a request line must not hold the consent wait open.
    this.server.headersTimeout = 5_000;
    this.server.requestTimeout = 10_000;
  }

  listen(port) {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, "127.0.0.1", () => {
        this.port = this.server.address().port;
        this.redirectUri = `http://127.0.0.1:${this.port}/callback`;
        resolve();
      });
    });
  }

  handle(req, res) {
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const state = u.searchParams.get("state");
    if (!this.expectedState || state !== this.expectedState || !this.resolve) {
      res.writeHead(400).end("state mismatch -- ignored");
      return;
    }
    const result = Object.fromEntries(u.searchParams.entries());
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<html><body style='font-family:sans-serif'><h3>oauth-scope-probe</h3>" +
        "<p>Authorization received. You can close this tab and return to the terminal.</p></body></html>",
    );
    const resolve = this.resolve;
    this.resolve = null;
    this.expectedState = null;
    resolve(result);
  }

  waitFor(state, timeoutMs) {
    return new Promise((resolve) => {
      this.expectedState = state;
      this.resolve = resolve;
      setTimeout(() => {
        if (this.resolve) {
          this.resolve = null;
          this.expectedState = null;
          resolve(null);
        }
      }, timeoutMs).unref();
    });
  }

  close() {
    this.server.close();
  }
}

// --------------------------------------------------------------------------------------
// OAuth client: DCR, authorize URL, code exchange, refresh, credential-free status check.
// --------------------------------------------------------------------------------------

class OAuthClient {
  constructor(env, redirectUri) {
    this.env = env;
    this.redirectUri = redirectUri;
    this.clientId = "";
    this.clientName = "";
    this.revoked = false;
  }

  async register() {
    const name = `oauth-scope-probe ${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}`;
    const r = await fetchTimed(`${this.env.baseUrl}/api/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_name: name,
        redirect_uris: [this.redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        application_type: "native",
      }),
    });
    if (r.status !== 201) throw new ProbeExit(`DCR failed: HTTP ${r.status} ${short(r.text)}`);
    this.clientId = tryJson(r.text)?.client_id;
    if (!this.clientId) throw new ProbeExit("DCR returned 201 without a client_id");
    this.clientName = name;
    return this.clientId;
  }

  authorizeUrl(scopes, state, challenge) {
    const p = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: this.env.mcpOrigin,
    });
    if (scopes.length) p.set("scope", scopes.join(" "));
    return `${this.env.baseUrl}/api/oauth/authorize?${p}`;
  }

  // Credential-free check of the client's status: the authorize endpoint resolves the client
  // before anything else and answers 302 (to the consent page) for an Active client and a JSON
  // 400 for a revoked or unknown one. No code is minted by this request.
  async isActive() {
    const { challenge } = pkcePair();
    const r = await fetchTimed(this.authorizeUrl([], "status-check", challenge), { redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(r.status)) return true;
    if (r.status === 400) return false;
    return null;
  }

  tokenRequest(form) {
    return fetchTimed(`${this.env.baseUrl}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString(),
    });
  }

  async exchange(code, verifier) {
    const r = await this.tokenRequest({
      grant_type: "authorization_code",
      code,
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code_verifier: verifier,
      resource: this.env.mcpOrigin,
    });
    if (r.status !== 200) throw new Error(`token exchange failed: HTTP ${r.status} ${short(r.text)}`);
    const j = tryJson(r.text);
    // Do not quote the body: a 200 body may carry a token even when malformed.
    if (!j?.access_token) throw new Error("token exchange returned 200 without a parseable access_token");
    return { accessToken: j.access_token, scope: j.scope ?? "", refreshToken: j.refresh_token ?? null };
  }

  refresh(refreshToken) {
    return this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId,
      resource: this.env.mcpOrigin,
    });
  }
}

// --------------------------------------------------------------------------------------
// V1 API calls. One representative action per scope.
// --------------------------------------------------------------------------------------

class V1 {
  constructor(env, accessToken) {
    this.env = env;
    this.headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  }

  // `path` must stay free of any query string: ScopeEnforcementFilter logs Request.Path without
  // the query, and the expected CloudWatch line is built from this value. Pass a query via `query`.
  async call(name, required, method, path, init = {}) {
    const { query, ...rest } = init;
    const url = `${this.env.baseUrl}${path}${query ? "?" + new URLSearchParams(query) : ""}`;
    const r = await fetchTimed(url, { method, ...rest, headers: { ...this.headers, ...(rest.headers ?? {}) } });
    return { name, required, method, path, status: r.status, body: r.text, headers: r.headers, ok2xx: r.status >= 200 && r.status < 300 };
  }

  listAgents() {
    return this.call("list agents", "agents:read", "GET", "/api/v1/agent/all");
  }
  startAgent(agentId) {
    return this.call("start agent", "agents:write", "POST", `/api/v1/agent/${agentId}/start`, {
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  }
  stopRun(agentId, runId) {
    return this.call("stop run", "agents:write", "POST", `/api/v1/agent/${agentId}/run/${runId}/stop`);
  }
  deleteRun(agentId, runId) {
    return this.call("delete run", "agents:write", "DELETE", `/api/v1/agent/${agentId}/run/${runId}`);
  }
  killRun(agentId, runId) {
    return this.call("kill run", "agents:write", "POST", `/api/v1/agent/${agentId}/run/${runId}/kill`);
  }
  runStatus(agentId, runId) {
    return this.call("run status", "runs:read", "GET", `/api/v1/agent/${agentId}/run/${runId}/status`);
  }
  listRuns(agentId) {
    return this.call("list runs", "runs:read", "GET", `/api/v1/agent/${agentId}/runs`, { query: { maxRecords: "5" } });
  }
  listSpaces() {
    return this.call("list spaces", "spaces:read", "GET", "/api/v1/spaces");
  }
  uploadSpaceFile(spaceId) {
    const fd = new FormData();
    fd.append("files", new Blob(["x"], { type: "text/plain" }), "oauth-scope-probe.txt");
    return this.call("upload space input file", "spaces:write", "POST", `/api/v1/input-files/space/${spaceId}`, { body: fd });
  }
  credits() {
    return this.call("billing credits", "billing:read", "GET", "/api/v1/billing/credits");
  }
}

// --------------------------------------------------------------------------------------
// MCP server. Stateless POST /mcp, JSON-RPC, SSE-framed responses.
// --------------------------------------------------------------------------------------

class Mcp {
  constructor(env, accessToken) {
    this.env = env;
    this.headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    this.id = 0;
  }

  static parse(r) {
    if ((r.headers.get("content-type") ?? "").includes("text/event-stream")) {
      for (const line of r.text.split(/\r?\n/)) {
        if (line.startsWith("data:")) {
          const j = tryJson(line.slice(5).trim());
          if (j !== undefined) return j;
        }
      }
      return undefined;
    }
    return tryJson(r.text);
  }

  // reachedUpstream is true only for a genuine tool result (even isError), i.e. the MCP server
  // called V1; false for transport failures and JSON-RPC-level errors where V1 was never hit.
  async callTool(tool, required, args) {
    this.id += 1;
    const payload = { jsonrpc: "2.0", id: this.id, method: "tools/call", params: { name: tool, arguments: args } };
    const r = await fetchTimed(`${this.env.mcpOrigin}/mcp`, { method: "POST", headers: this.headers, body: JSON.stringify(payload) });
    const msg = Mcp.parse(r);
    if (r.status !== 200 || msg === undefined) return { tool, required, httpStatus: r.status, isError: null, text: short(r.text), reachedUpstream: false };
    if (msg.error) return { tool, required, httpStatus: r.status, isError: true, text: short(JSON.stringify(msg.error)), reachedUpstream: false };
    const result = msg.result ?? {};
    const text = (result.content ?? []).map((c) => c?.text ?? "").join(" ");
    return { tool, required, httpStatus: r.status, isError: Boolean(result.isError), text: short(text), reachedUpstream: true };
  }
}

// --------------------------------------------------------------------------------------
// CloudWatch through the aws CLI: find the ScopeEnforcementFilter lines for our client.
// --------------------------------------------------------------------------------------

class CloudWatch {
  constructor(env) {
    this.env = env;
  }

  async aws(args) {
    try {
      const { stdout } = await execFileP("aws", [...args, "--output", "json"], { maxBuffer: 64 * 1024 * 1024 });
      return JSON.parse(stdout || "{}");
    } catch (e) {
      const err = String(e.stderr ?? e.message ?? e);
      if (e.code === "ENOENT") throw new ProbeExit("aws CLI not found on PATH. Install it, or pass --skip-cloudwatch.");
      if (/ExpiredToken|InvalidClientTokenId|UnrecognizedClientException|AccessDenied|Unable to locate credentials/.test(err)) {
        throw new ProbeExit(`AWS credentials rejected or missing (${short(err.trim(), 100)}). Refresh your AWS session and rerun, or pass --skip-cloudwatch.`);
      }
      throw new ProbeExit(`aws CLI failed: ${short(err.trim(), 160)}`);
    }
  }

  async preflight() {
    const out = await this.aws(["logs", "describe-log-groups", "--log-group-name-prefix", this.env.logGroup]);
    if (!(out.logGroups ?? []).some((g) => g.logGroupName === this.env.logGroup)) {
      throw new ProbeExit(`CloudWatch log group ${this.env.logGroup} not found or not readable`);
    }
  }

  async fetchLines(clientId, startMs) {
    // Log timestamps come from the server; startMs from this machine. Query a little earlier so
    // a few seconds of skew cannot hide the first line of a profile. Safe because the pattern
    // is pinned to this run's client_id. The CLI paginates filter-log-events by itself.
    const out = await this.aws([
      "logs", "filter-log-events",
      "--log-group-name", this.env.logGroup,
      "--start-time", String(startMs - CLOUDWATCH_SKEW_MS),
      "--filter-pattern", `"Scope check" "${clientId}"`,
    ]);
    return (out.events ?? []).map((e) => e.message);
  }

  // Poll until every expected substring appears. Returns { missing, lines }.
  async waitFor(clientId, startMs, expected, waitMs) {
    const deadline = Date.now() + waitMs;
    for (;;) {
      const lines = await this.fetchLines(clientId, startMs);
      const norm = lines.map((l) => l.replace(/"/g, ""));
      const missing = expected.filter((e) => !norm.some((l) => l.includes(e)));
      if (!missing.length || Date.now() >= deadline) return { missing, lines };
      await sleep(CLOUDWATCH_POLL_MS);
    }
  }

  // Poll for the settle window and return any lines that appeared. Ingestion lags by tens of
  // seconds, so a single immediate fetch would pass trivially.
  async waitForNone(clientId, startMs, waitMs) {
    const deadline = Date.now() + waitMs;
    for (;;) {
      const lines = await this.fetchLines(clientId, startMs);
      if (lines.length || Date.now() >= deadline) return lines;
      await sleep(CLOUDWATCH_POLL_MS);
    }
  }
}

// --------------------------------------------------------------------------------------
// Administrative actions happen in the browser, never with credentials typed into this tool.
// The tool opens the page, says what to click, waits for Enter, then verifies the outcome
// through the public authorize endpoint (OAuthClient.isActive).
// --------------------------------------------------------------------------------------

class BrowserAdmin {
  constructor(env) {
    this.adminUrl = `${env.baseUrl}/manage/admin/mcp-integrations`;
  }

  async revoke(oauth, attempts = 2) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      log(
        `Opening Admin > MCP Integrations. Find the row for client ${oauth.clientId}` +
          (oauth.clientName ? ` (name '${oauth.clientName}')` : "") +
          ", open its row menu, click Revoke, then come back here.",
      );
      if (!openBrowser(this.adminUrl)) log(`Could not open a browser automatically. Open this URL yourself:\n${this.adminUrl}`);
      await pressEnter("Press Enter once the client shows Status = Revoked: ");
      const active = await oauth.isActive();
      if (active === false) {
        oauth.revoked = true;
        return true;
      }
      if (active === null) log("  could not determine the client status (unexpected response from the authorize endpoint)");
      else if (attempt < attempts) log("  the authorize endpoint still accepts this client, so it is not revoked yet; try again");
    }
    return false;
  }
}

// --------------------------------------------------------------------------------------
// Expectations and reporting.
// --------------------------------------------------------------------------------------

class Report {
  constructor() {
    this.rows = [];
    this.notes = [];
  }

  add(row) {
    this.rows.push(row);
    const mark = row.ok ? "PASS" : "FAIL";
    log(
      `  ${mark}  ${row.call.padEnd(28)} required=${row.required.padEnd(13)} expected=${row.expected.padEnd(22)} observed=${row.observed}` +
        (row.note ? `  (${row.note})` : ""),
    );
  }

  failed() {
    return this.rows.some((r) => !r.ok);
  }

  printSummary() {
    console.log("\n=== SUMMARY ===");
    const w = Math.max(10, ...this.rows.map((r) => r.call.length));
    console.log(`${"profile".padEnd(8)} ${"call".padEnd(w)} ${"required".padEnd(14)} ${"expected".padEnd(24)} ${"observed".padEnd(30)} result`);
    for (const r of this.rows) {
      console.log(
        `${r.profile.padEnd(8)} ${r.call.padEnd(w)} ${r.required.padEnd(14)} ${r.expected.padEnd(24)} ${r.observed.padEnd(30)} ${r.ok ? "PASS" : "FAIL"}${r.note ? "  " + r.note : ""}`,
      );
    }
    for (const n of this.notes) console.log(`NOTE: ${n}`);
    const passed = this.rows.filter((r) => r.ok).length;
    console.log(`\n${passed} passed, ${this.rows.length - passed} failed`);
  }
}

const row = (profile, call, required, expected, observed, ok, note = "") => ({ profile, call, required, expected, observed, ok, note });

function grantedApiScopes(tokenScope) {
  return new Set(tokenScope.split(/\s+/).filter((s) => API_SCOPES.includes(s)));
}

// Returns { expected, observed, ok, note } for a direct V1 call.
function judgeV1(call, granted, mode) {
  const mismatch = !granted.has(call.required);
  const observed = `HTTP ${call.status}`;
  if (mode === "log-only" || !mismatch) {
    return { expected: "2xx", observed, ok: call.ok2xx, note: call.ok2xx ? "" : short(call.body, 80) };
  }
  if (call.status !== 403) return { expected: "403 insufficient_scope", observed, ok: false, note: short(call.body, 80) };
  const code = tryJson(call.body)?.errorCode;
  const www = call.headers.get("www-authenticate") ?? "";
  const ok = code === "insufficient_scope" && www.includes("insufficient_scope") && www.includes(call.required);
  return { expected: "403 insufficient_scope", observed, ok, note: ok ? "" : `errorCode=${JSON.stringify(code)} WWW-Authenticate=${JSON.stringify(www)}` };
}

// SE4-3929 made insufficient_scope 403s surface the required scope by name in the tool error
// ("Insufficient Scope: ... the \"<scope>\" scope ..."); the fixed "Access Denied" text is the
// pre-SE4-3929 behaviour and is still accepted so this probe keeps working against a build that
// has not picked up that fix yet -- but flagged, since the scope name is unavailable there.
function judgeMcp(call, granted, mode) {
  const mismatch = !granted.has(call.required);
  if (call.httpStatus !== 200 || call.isError === null) return { expected: "tool result", observed: `HTTP ${call.httpStatus}`, ok: false, note: call.text };
  const observed = call.isError ? "tool error" : "tool ok";
  if (mode === "log-only" || !mismatch) return { expected: "tool ok", observed, ok: !call.isError, note: call.isError ? call.text : "" };
  if (call.isError && call.text.startsWith("Insufficient Scope") && call.text.includes(`"${call.required}"`)) {
    return { expected: "tool error (Insufficient Scope)", observed, ok: true, note: "" };
  }
  if (call.isError && call.text.startsWith("Access Denied")) {
    return { expected: "tool error (Insufficient Scope)", observed, ok: true, note: "old build: scope name not surfaced (SE4-3929 not deployed here)" };
  }
  return { expected: "tool error (Insufficient Scope)", observed, ok: false, note: call.text };
}

function expectedLogLine(mode, method, path, required, grantedScope, clientId) {
  const decision = mode === "enforce" ? "denied" : "would deny (log-only)";
  return `Scope check ${decision} for ${method} ${path}: required=${required} granted=${grantedScope} clientId=${clientId}`;
}

// Both GET /api/v1/agent/all (unpaged) and GET /api/v1/spaces return a bare JSON array of
// models with an integer `id`.
function firstId(body) {
  const data = tryJson(body);
  if (!Array.isArray(data)) return null;
  const hit = data.find((x) => x && typeof x === "object" && x.id != null);
  return hit ? Number(hit.id) : null;
}

// MCP tool -> required scope, arguments, upstream V1 method and path. The MCP server forwards
// the caller's token, so ScopeEnforcementFilter logs the upstream path for each tool.
function mcpToolTable(agentId) {
  const table = [
    ["list_agents", "agents:read", {}, "GET", "/api/v1/agent/all"],
    ["list_spaces", "spaces:read", {}, "GET", "/api/v1/spaces"],
    ["get_credits_balance", "billing:read", {}, "GET", "/api/v1/billing/credits"],
  ];
  if (agentId != null) table.push(["get_agent_runs", "runs:read", { agentId }, "GET", `/api/v1/agent/${agentId}/runs`]);
  return table;
}

const isTransportError = (e) => e instanceof TypeError || e?.name === "AbortError";

// RunStatus values that still count as "in progress" for DELETE run: Running(1), Exporting(2),
// Starting(3), Queuing(4), Stopping(5), Waiting(12). Serialized as the int or as its name.
const IN_PROGRESS = new Set([1, 2, 3, 4, 5, 12, "Running", "Exporting", "Starting", "Queuing", "Stopping", "Waiting"]);
const runInProgress = (statusBody) => {
  const st = tryJson(statusBody)?.status;
  return st === undefined ? null : IN_PROGRESS.has(st);
};

// Stop is asynchronous server-side and DELETE refuses "a run in progress", so wait for a
// terminal status before deleting; escalate to kill if stop does not land in time.
async function stopAndDeleteRun(v1, agentId, runId) {
  const s = await v1.stopRun(agentId, runId);
  const settled = async (budgetMs) => {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      const st = await v1.runStatus(agentId, runId);
      const inProgress = st.ok2xx ? runInProgress(st.body) : null;
      if (inProgress === false) return true;
      if (inProgress === null) return null; // cannot observe status (e.g. 403 in enforce mode); fall through
      await sleep(3_000);
    }
    return false;
  };
  let state = await settled(45_000);
  let killed = false;
  if (state === false) {
    killed = true;
    await v1.killRun(agentId, runId);
    state = await settled(20_000);
  }
  if (state === null) await sleep(5_000);
  let d;
  for (let attempt = 1; attempt <= 3; attempt++) {
    d = await v1.deleteRun(agentId, runId);
    if (d.ok2xx || attempt === 3) break;
    await sleep(3_000);
  }
  return { stop: s, deleted: d, killed };
}

// --------------------------------------------------------------------------------------
// Main flow.
// --------------------------------------------------------------------------------------

async function runProfile(profile, opts, env, oauth, listener, cw, disc, report) {
  const scopes = PROFILES[profile];
  log(`--- profile '${profile}': requesting scope=${scopes.join(" ") || "(none)"}`);
  const { verifier, challenge } = pkcePair();
  const state = b64url(randomBytes(24));
  const url = oauth.authorizeUrl(scopes, state, challenge);
  log("Opening the browser for consent. Review the permissions and click Authorize.");
  log(`  consent URL (paste it into the logged-in browser if the tab does not load): ${url}`);
  log("  if the page sits on 'Loading Control Center...', reload the tab once");
  if (!openBrowser(url)) log("Could not open a browser automatically; use the URL above.");
  const cb = await listener.waitFor(state, CONSENT_TIMEOUT_MS);
  if (!cb) {
    report.add(row(profile, "consent", "-", "callback", "timeout", false, "no callback within timeout"));
    return null;
  }
  if (cb.error) {
    report.add(row(profile, "consent", "-", "code", cb.error, false, cb.error_description ?? ""));
    return null;
  }
  if (cb.iss && cb.iss.replace(/\/+$/, "") !== env.baseUrl) report.notes.push(`${profile}: callback iss=${cb.iss} does not match ${env.baseUrl}`);

  let token;
  try {
    token = await oauth.exchange(cb.code, verifier);
  } catch (e) {
    report.add(row(profile, "token exchange", "-", "200", "error", false, String(e.message ?? e)));
    return null;
  }
  const granted = grantedApiScopes(token.scope);
  report.add(row(profile, "token exchange", "-", "200", `scope='${token.scope}'`, true, token.refreshToken ? "refresh_token issued" : "no refresh_token"));

  const startedMs = Date.now();
  const v1 = new V1(env, token.accessToken);
  const expectedLines = [];
  let runToClean = null;

  const record = (call) => {
    const j = judgeV1(call, granted, opts.mode);
    report.add(row(profile, call.name, call.required, j.expected, j.observed, j.ok, j.note));
    if (!granted.has(call.required)) expectedLines.push(expectedLogLine(opts.mode, call.method, call.path, call.required, token.scope, oauth.clientId));
    return call;
  };

  try {
    // disc is seeded from --agent-id / --space-id, so discovery only fills gaps.
    let c = record(await v1.listAgents());
    if (c.ok2xx && disc.agentId == null) disc.agentId = firstId(c.body);

    c = record(await v1.listSpaces());
    if (c.ok2xx && disc.spaceId == null) disc.spaceId = firstId(c.body);

    record(await v1.credits());

    if (disc.agentId == null) {
      report.add(row(profile, "start agent", "agents:write", "-", "skipped", true, "no agent id known; pass --agent-id"));
      report.add(row(profile, "list runs", "runs:read", "-", "skipped", true, "no agent id known"));
    } else {
      c = record(await v1.startAgent(disc.agentId));
      if (c.ok2xx) {
        const runId = Number(tryJson(c.body)?.id);
        if (Number.isFinite(runId)) runToClean = [disc.agentId, runId];
        else report.notes.push(`${profile}: start returned 2xx but no run id could be parsed; check the environment for a stray run`);
      }
      record(await v1.listRuns(disc.agentId));
    }

    if (disc.spaceId == null) report.add(row(profile, "upload space input file", "spaces:write", "-", "skipped", true, "no space id known; pass --space-id"));
    else record(await v1.uploadSpaceFile(disc.spaceId));
  } catch (e) {
    if (!isTransportError(e)) throw e;
    // A transport failure mid-profile must not take the whole run (and its summary) down.
    report.add(row(profile, "v1 transport", "-", "response", "exception", false, short(String(e.message ?? e), 100)));
  } finally {
    if (runToClean) {
      const [agentId, runId] = runToClean;
      // Cleanup is a FAIL row, not a note: a stray run is residue the operator has to act on.
      try {
        const { stop: s, deleted: d, killed } = await stopAndDeleteRun(v1, agentId, runId);
        log(`  cleanup: stop run ${runId} -> HTTP ${s.status}${killed ? "; kill sent" : ""}; delete -> HTTP ${d.status}`);
        if (!d.ok2xx) report.add(row(profile, "cleanup: delete run", "-", "2xx", `HTTP ${d.status}`, false, `run ${runId} on agent ${agentId} not deleted (${short(d.body, 80)}); remove it manually`));
      } catch (e) {
        report.add(row(profile, "cleanup: delete run", "-", "2xx", "exception", false, `run ${runId} on agent ${agentId} may still exist: ${short(String(e.message ?? e), 80)}`));
      }
    }
  }

  if (!opts.skipMcp) {
    const mcp = new Mcp(env, token.accessToken);
    for (const [tool, required, args, upMethod, upPath] of mcpToolTable(disc.agentId)) {
      let mc;
      try {
        mc = await mcp.callTool(tool, required, args);
      } catch (e) {
        if (!isTransportError(e)) throw e;
        report.add(row(profile, `mcp ${tool}`, required, "tool result", "exception", false, short(String(e.message ?? e), 100)));
        continue;
      }
      const j = judgeMcp(mc, granted, opts.mode);
      report.add(row(profile, `mcp ${tool}`, required, j.expected, j.observed, j.ok, j.note));
      // Only a genuine tool result proves the MCP server called V1; a JSON-RPC-level error
      // (unknown tool, bad arguments) never reached the filter, so no line can be expected.
      if (!granted.has(required) && mc.reachedUpstream) expectedLines.push(expectedLogLine(opts.mode, upMethod, upPath, required, token.scope, oauth.clientId));
    }
  }

  if (cw) {
    const uniq = [...new Set(expectedLines)];
    if (!uniq.length) {
      log(`  waiting ${CLOUDWATCH_SETTLE_MS / 1000}s to confirm no scope line appears in ${env.logGroup} ...`);
      const lines = await cw.waitForNone(oauth.clientId, startedMs, CLOUDWATCH_SETTLE_MS);
      report.add(row(profile, "cloudwatch", "-", "no scope lines", `${lines.length} line(s)`, lines.length === 0, lines.length ? "unexpected lines: " + lines.slice(0, 3).map((l) => short(l, 100)).join(" | ") : ""));
    } else {
      log(`  waiting up to ${CLOUDWATCH_WAIT_MS / 1000}s for ${uniq.length} expected log line(s) in ${env.logGroup} ...`);
      const { missing } = await cw.waitFor(oauth.clientId, startedMs, uniq, CLOUDWATCH_WAIT_MS);
      report.add(row(profile, "cloudwatch", "-", `${uniq.length} scope line(s)`, `${uniq.length - missing.length} found`, !missing.length, missing.length ? "missing: " + missing.slice(0, 3).map((m) => short(m, 100)).join(" | ") : ""));
    }
  }
  return token;
}

async function check3896(oauth, token, report, admin) {
  log("--- SE4-3896: refresh, revoke in the browser, refresh again");
  if (!token.refreshToken) {
    // The 'all' profile requests offline_access, so a missing refresh token is a server
    // regression, not a reason to skip: nothing below can run, and the run must say so.
    report.add(row("3896", "refresh before revoke", "-", "refresh_token issued", "none issued", false, "the 'all' profile requested offline_access but the token exchange returned no refresh_token"));
    return;
  }
  const r1 = await oauth.refresh(token.refreshToken);
  const latest = r1.status === 200 ? tryJson(r1.text)?.refresh_token ?? null : null; // always present the newest token
  const ok1 = latest != null;
  // Never echo a 200 body: it carries a live access token. Only error bodies are quoted.
  const note1 = ok1 ? "" : r1.status === 200 ? "200 but no rotated refresh_token in body" : short(r1.text, 80);
  report.add(row("3896", "refresh before revoke", "-", "200 + rotated token", `HTTP ${r1.status}`, ok1, note1));
  if (!ok1) return;

  if (!(await admin.revoke(oauth))) {
    report.add(row("3896", "revoke client (browser)", "-", "client revoked", "still active", false, "the authorize endpoint still accepts the client; revoke it in Admin > MCP Integrations and rerun"));
    return;
  }
  report.add(row("3896", "revoke client (browser)", "-", "client revoked", "revoked", true));

  const r2 = await oauth.refresh(latest);
  if (r2.status === 200) {
    report.add(row("3896", "refresh after revoke", "-", "400 invalid_grant", "HTTP 200", false, "SE4-3896 NOT DEPLOYED HERE -- revoked client still refreshes"));
    report.notes.push("SE4-3896 is not on this build: a revoked client kept refreshing.");
    return;
  }
  const err = tryJson(r2.text)?.error;
  const ok2 = r2.status === 400 && err === "invalid_grant";
  report.add(row("3896", "refresh after revoke", "-", "400 invalid_grant", `HTTP ${r2.status} ${err ?? ""}`.trim(), ok2, ok2 ? "" : short(r2.text, 80)));
}

const USAGE = `Usage: node scripts/oauth-scope-probe.mjs --env qa --mode log-only|enforce [options]

Live probe of OAuth scope enforcement (SE4-3895) and revoke-on-refresh (SE4-3896).

  --env <name>           target environment (only qa is configured)          [required]
  --mode <mode>          log-only | enforce: what the server should do on a  [required]
                         scope mismatch; the tool never guesses
  --profile <p>          run one profile instead of all three: all | read | none
  --port <n>             loopback callback port (default: ephemeral)
  --reuse-client <id>    skip DCR and reuse a client from a --keep-client run; needs the
                         same --port and --skip-3896; implies --keep-client
  --agent-id <n>         agent to start for the agents:write probe when it cannot be discovered
  --space-id <n>         space for the spaces:write probe when it cannot be discovered
  --skip-mcp             do not call the MCP server
  --skip-3896            do not run the revoke-on-refresh check
  --skip-cloudwatch      do not read CloudWatch (no aws CLI needed)
  --keep-client          leave the DCR client Active at the end for inspection
  --no-login-prompt      do not open the login page and wait before the first consent
  --preflight-only       check metadata and CloudWatch access, register nothing, exit
  -h, --help             show this help
`;

function parseCli(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowNegative: false,
      options: {
        env: { type: "string" },
        mode: { type: "string" },
        profile: { type: "string" },
        port: { type: "string" },
        "reuse-client": { type: "string" },
        "agent-id": { type: "string" },
        "space-id": { type: "string" },
        "skip-mcp": { type: "boolean", default: false },
        "skip-3896": { type: "boolean", default: false },
        "skip-cloudwatch": { type: "boolean", default: false },
        "keep-client": { type: "boolean", default: false },
        "no-login-prompt": { type: "boolean", default: false },
        "preflight-only": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    throw new ProbeExit(`${e.message}\n\n${USAGE}`);
  }
  const v = parsed.values;
  if (v.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const fail = (m) => {
    throw new ProbeExit(`${m}\n\n${USAGE}`);
  };
  if (!v.env || !ENVS[v.env]) fail(`--env is required and must be one of: ${Object.keys(ENVS).join(", ")}`);
  if (!["log-only", "enforce"].includes(v.mode)) fail("--mode is required and must be log-only or enforce");
  if (v.profile && !PROFILE_ORDER.includes(v.profile)) fail(`--profile must be one of: ${PROFILE_ORDER.join(", ")}`);
  const int = (name) => {
    if (v[name] === undefined) return null;
    const n = Number(v[name]);
    if (!Number.isInteger(n)) fail(`--${name} must be an integer`);
    return n;
  };
  const opts = {
    env: v.env,
    mode: v.mode,
    profile: v.profile ?? null,
    port: int("port") ?? 0,
    reuseClient: v["reuse-client"] ?? null,
    agentId: int("agent-id"),
    spaceId: int("space-id"),
    skipMcp: v["skip-mcp"],
    skip3896: v["skip-3896"],
    skipCloudwatch: v["skip-cloudwatch"],
    keepClient: v["keep-client"],
    noLoginPrompt: v["no-login-prompt"],
    preflightOnly: v["preflight-only"],
  };
  if (opts.reuseClient && !opts.port) fail("--reuse-client requires --port so the redirect URI matches the registered one");
  // The 3896 step revokes the client, and revoked is terminal: reuse only makes sense without it,
  // and it implies keeping the client alive at the end of the run.
  if (opts.reuseClient && !opts.skip3896) fail("--reuse-client requires --skip-3896 (the SE4-3896 step revokes the client)");
  if (opts.reuseClient && !opts.keepClient) {
    opts.keepClient = true;
    log("--reuse-client implies --keep-client: the client will not be revoked at the end");
  }
  return opts;
}

async function fetchMetadata(url) {
  const r = await fetchTimed(url);
  if (r.status !== 200) throw new ProbeExit(`preflight: ${url} returned HTTP ${r.status} ${short(r.text, 80)}`);
  const j = tryJson(r.text);
  if (j === undefined) throw new ProbeExit(`preflight: ${url} did not return JSON: ${short(r.text, 80)}`);
  return j;
}

async function main() {
  const opts = parseCli(process.argv.slice(2));
  const env = ENVS[opts.env];
  log(`env=${env.name} base=${env.baseUrl} mcp=${env.mcpOrigin} mode=${opts.mode}`);

  // Preflight: metadata from both servers, and the scope-list drift between them.
  const meta = await fetchMetadata(`${env.baseUrl}/.well-known/oauth-authorization-server`);
  const prm = await fetchMetadata(`${env.mcpOrigin}/.well-known/oauth-protected-resource`);
  const asScopes = new Set(meta.scopes_supported ?? []);
  const mcpScopes = new Set(prm.scopes_supported ?? []);
  log(`authorization server advertises ${asScopes.size} scopes; MCP resource advertises ${mcpScopes.size}`);
  const missingOnMcp = API_SCOPES.filter((s) => asScopes.has(s) && !mcpScopes.has(s));
  if (missingOnMcp.length) log(`WARNING: MCP protected-resource metadata omits ${JSON.stringify(missingOnMcp)}; MCP clients that read it will never request them`);
  const advertisedAs = new Set((prm.authorization_servers ?? []).filter((u) => typeof u === "string").map((u) => u.replace(/\/+$/, "")));
  if (advertisedAs.size && !advertisedAs.has(env.baseUrl.replace(/\/+$/, ""))) {
    throw new ProbeExit(`MCP resource names authorization_servers=${JSON.stringify([...advertisedAs])}, not ${env.baseUrl}`);
  }
  if (!API_SCOPES.every((s) => asScopes.has(s))) {
    throw new ProbeExit(`authorization server does not advertise all API scopes; is SE4-3895 deployed here? got ${JSON.stringify([...asScopes].sort())}`);
  }

  let cw = null;
  if (!opts.skipCloudwatch) {
    cw = new CloudWatch(env);
    await cw.preflight();
    log(`cloudwatch: ${env.logGroup} readable`);
  }
  if (opts.preflightOnly) {
    log("preflight only: nothing registered, exiting");
    return 0;
  }

  const admin = new BrowserAdmin(env);
  if (!opts.noLoginPrompt) {
    // Log in where logins belong: in the browser. The consent page needs a session, and the
    // revoke/cleanup steps need a super-administrator session in the same browser.
    const loginUrl = `${env.baseUrl}/login`;
    log("Opening the login page. Sign in" + (opts.skip3896 && opts.keepClient ? "" : " as a super-administrator (the revoke step needs it)") + ", then come back here.");
    if (!openBrowser(loginUrl)) log(`Could not open a browser automatically. Open this URL yourself:\n${loginUrl}`);
    await pressEnter("Press Enter once you are logged in: ");
  }

  const listener = new CallbackListener();
  await listener.listen(opts.port);
  const oauth = new OAuthClient(env, listener.redirectUri);
  const report = new Report();
  if (opts.reuseClient) {
    oauth.clientId = opts.reuseClient;
    log(`reusing client ${oauth.clientId} with redirect ${listener.redirectUri}`);
  } else {
    log(`registering DCR client with redirect ${listener.redirectUri}`);
    log(`client_id = ${await oauth.register()}`);
  }

  const disc = { agentId: opts.agentId, spaceId: opts.spaceId };
  let allToken = null;
  try {
    for (const profile of opts.profile ? [opts.profile] : PROFILE_ORDER) {
      const t = await runProfile(profile, opts, env, oauth, listener, cw, disc, report);
      if (t && profile === "all") allToken = t;
    }
    if (!opts.skip3896) {
      if (allToken) await check3896(oauth, allToken, report, admin);
      else report.add(row("3896", "refresh/revoke", "-", "-", "skipped", true, "needs the 'all' profile token"));
    }
  } catch (e) {
    // Anything unexpected still gets a summary and a non-zero exit.
    report.add(row("run", "unhandled error", "-", "-", e?.constructor?.name ?? "Error", false, short(String(e?.message ?? e), 100)));
  } finally {
    listener.close();
    if (!opts.keepClient && !oauth.revoked && oauth.clientId) {
      // A client left Active with a live refresh token is residue the docs say does not
      // happen, so a client still Active at the end is a FAIL row (exit non-zero).
      log("cleanup: the probe client must be revoked before exit");
      try {
        if (await admin.revoke(oauth)) log(`cleanup: client ${oauth.clientId} revoked`);
        else report.add(row("run", "cleanup: revoke client", "-", "revoked", "still active", false, `${oauth.clientId} is still Active; revoke it in Admin > MCP Integrations`));
      } catch (e) {
        report.add(row("run", "cleanup: revoke client", "-", "revoked", "error", false, `${oauth.clientId} may still be Active: ${short(String(e?.message ?? e), 80)}`));
      }
    } else if (opts.keepClient) {
      report.notes.push(`client ${oauth.clientId} left Active (--keep-client); revoke it in Admin > MCP Integrations when done`);
      report.notes.push(`to iterate without spending a registration: --reuse-client ${oauth.clientId} --port ${listener.port} --skip-3896`);
    }
    // Always print what was collected, even after an unexpected exception: the consent clicks
    // and CloudWatch evidence gathered so far are the whole point of the run.
    report.printSummary();
    rl?.close();
  }
  return report.failed() ? 1 : 0;
}

// Only run main() when this file is the process's entry point, not when it is imported --
// e.g. by tests/oauth-scope-probe.test.ts, which imports the pure judge functions below and
// must not trigger a live CLI run (browser windows, AWS calls, exit codes) as a side effect
// of loading the module. `npm run probe` still runs exactly as before.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      if (e instanceof ProbeExit) {
        console.error(e.message);
        process.exit(2);
      }
      console.error(e);
      process.exit(1);
    },
  );
}

// Exported for tests/oauth-scope-probe.test.ts: pure functions, no I/O, no process access.
export { judgeMcp, judgeV1, expectedLogLine };
