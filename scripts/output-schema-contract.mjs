#!/usr/bin/env node
// output-schema-contract -- validates the tools' output schemas against real Control
// Center data, before merge and whenever the Control Center changes.
//
// It runs THIS BRANCH's built server (dist/) in process, with a real API client pointed at the
// QA Control Center and a token from the same browser OAuth flow the scope probe uses, then
// calls every schema'd read-only tool through an in-memory MCP client. The SDK validates each
// result against its outputSchema exactly as in production; a mismatch comes back as an
// "Output validation error" result, reported here as SCHEMA FAIL.
//
// Read tools only. The token is requested with read scopes, so a write call would be refused
// upstream even by mistake. The token stays in memory: it is never printed or written.
// QA only: fields production's Control Center lacks are handled when schemas are written.
//
// Usage: npm run contract:output-schemas [-- --reuse-client <client_id>] [--port <n>]
import { parseArgs } from "node:util";
import { randomBytes } from "node:crypto";
import process from "node:process";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ENVS, CallbackListener, OAuthClient, pkcePair, b64url, openBrowser, log, pressEnter } from "./oauth-scope-probe.mjs";

const READ_SCOPES = ["agents:read", "runs:read", "spaces:read", "billing:read"];
const CONSENT_TIMEOUT_MS = 300_000;

export const READ_TOOLS = [
  "list_agents", "get_agent", "search_agents", "get_agent_search_count", "get_personal_agent_count",
  "get_agent_runs", "get_agent_run_summary", "get_run_status", "get_run_files", "get_file_download_url",
  "get_agent_versions", "list_agent_schedules", "get_agent_schedule", "get_scheduled_runs",
  "list_spaces", "get_space", "search_space_by_name", "get_space_agents", "get_space_agent_count",
  "get_credits_balance", "get_spending_summary", "get_credit_history", "get_agents_usage",
  "get_agent_cost_breakdown", "get_agent_runs_cost", "get_runs_summary", "get_records_summary",
  "get_run_diagnostics", "get_latest_failure", "get_agent_build_status",
];
export const WRITE_TOOLS = [
  "create_agent_schedule", "update_agent_schedule", "run_space_agents", "start_agent",
  "start_agent_build", "stop_agent_build",
];

function textOf(result) {
  return (result?.content ?? []).find((c) => c.type === "text")?.text ?? "";
}

/**
 * Array-root structuredContent: the in-memory client negotiates the 2025-11-25 protocol era,
 * where the SDK wraps an array root as `{ result: [...] }`. Accept both shapes.
 */
export function listOf(structuredContent) {
  if (Array.isArray(structuredContent)) return structuredContent;
  if (structuredContent && typeof structuredContent === "object" && Array.isArray(structuredContent.result)) {
    return structuredContent.result;
  }
  return undefined;
}

/** One report row per call. `result` null means the call was not made (reason in `skipReason`). */
export function judgeCall(tool, result, skipReason = "no usable id") {
  if (!result) return { tool, verdict: "SKIPPED", detail: skipReason };
  const text = textOf(result);
  if (result.isError) {
    return text.includes("Output validation error")
      ? { tool, verdict: "SCHEMA FAIL", detail: text }
      : { tool, verdict: "UPSTREAM ERROR", detail: text.slice(0, 160) };
  }
  if (result.structuredContent === undefined) {
    return { tool, verdict: "SCHEMA FAIL", detail: "success result without structuredContent" };
  }
  return { tool, verdict: "PASS", detail: "" };
}

/** A callTool that rejected (transport or protocol failure) is reported, not allowed to abort the run. */
export function rejectedCall(tool, error) {
  return { tool, verdict: "UPSTREAM ERROR", detail: String(error?.message ?? error).slice(0, 160) };
}

/** Read tools main() produced no row for: a schema'd tool added later but never called here. */
export function uncalledReadTools(rows) {
  return READ_TOOLS.filter((tool) => !rows.some((r) => r.tool === tool));
}

export function exitCode(rows) {
  return rows.some((r) => r.verdict === "SCHEMA FAIL") ? 1 : 0;
}

async function login(env, opts) {
  const listener = new CallbackListener();
  await listener.listen(opts.port);
  const oauth = new OAuthClient(env, listener.redirectUri);
  if (opts.reuseClient) oauth.clientId = opts.reuseClient;
  else log(`registered DCR client ${await oauth.register()} (residue: one OAuth client per run; pass --reuse-client next time)`);
  const loginUrl = `${env.baseUrl}/login`;
  log("Opening the login page. Sign in, then come back here.");
  if (!openBrowser(loginUrl)) log(`Open this URL yourself: ${loginUrl}`);
  await pressEnter("Press Enter once you are logged in: ");
  const { verifier, challenge } = pkcePair();
  const state = b64url(randomBytes(24));
  const url = oauth.authorizeUrl(READ_SCOPES, state, challenge);
  log("Opening the consent page. Approve the read permissions.");
  if (!openBrowser(url)) log(`Open this URL yourself: ${url}`);
  const cb = await listener.waitFor(state, CONSENT_TIMEOUT_MS);
  listener.close();
  if (!cb || cb.error) throw new Error(`consent failed: ${cb?.error ?? "timeout"}`);
  const token = await oauth.exchange(cb.code, verifier);
  return token.accessToken;
}

async function main() {
  const { values } = parseArgs({
    options: { "reuse-client": { type: "string" }, port: { type: "string", default: "0" } },
  });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dist = path.join(root, "dist");
  if (!existsSync(path.join(dist, "server", "handlers.js"))) throw new Error("dist/ is missing: run npm run build first");
  const env = ENVS.qa;

  const accessToken = await login(env, { port: Number(values.port), reuseClient: values["reuse-client"] });

  const { createMcpServer } = await import(pathToFileURL(path.join(dist, "server", "handlers.js")).href);
  const { SequentumApiClient } = await import(pathToFileURL(path.join(dist, "api", "api-client.js")).href);
  const { Client, InMemoryTransport } = await import("@modelcontextprotocol/client");

  const apiClient = new SequentumApiClient(env.baseUrl, null);
  apiClient.setAccessToken(accessToken);
  const server = createMcpServer(apiClient, "contract-check");
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "output-schema-contract", version: "1.0" });
  await client.connect(clientTransport);

  const rows = [];
  const call = async (tool, args) => {
    try {
      const result = await client.callTool({ name: tool, arguments: args });
      rows.push(judgeCall(tool, result));
      return result.isError ? undefined : result.structuredContent;
    } catch (error) {
      rows.push(rejectedCall(tool, error));
      return undefined;
    }
  };
  const skip = (tool, reason) => rows.push(judgeCall(tool, null, reason));

  // Discovery: an agent with runs, a failed agent, a run with files, a space, a schedule.
  let agent;
  for (const status of [10, 9, 7]) {
    const page = await call("list_agents", { status, recordsPerPage: 5 });
    agent = page?.agents?.find((a) => a.id);
    if (agent) break;
  }
  let failed;
  try {
    failed = (await client.callTool({ name: "list_agents", arguments: { status: 7, recordsPerPage: 1 } })).structuredContent?.agents?.[0];
  } catch (error) {
    rows.push(rejectedCall("list_agents", error));
  }

  if (agent) {
    await call("get_agent", { agentId: agent.id });
    await call("get_agent_run_summary", { agentId: agent.id });
    await call("get_agent_versions", { agentId: agent.id });
    await call("get_agent_cost_breakdown", { agentId: agent.id });
    await call("get_agent_runs_cost", { agentId: agent.id });
    const runs = (await call("get_agent_runs", { agentId: agent.id, maxRecords: 10 }))?.runs ?? [];
    if (runs[0]) {
      await call("get_run_status", { agentId: agent.id, runId: runs[0].id });
      await call("get_run_diagnostics", { agentId: agent.id, runId: runs[0].id });
    } else {
      skip("get_run_status", "agent has no runs");
      skip("get_run_diagnostics", "agent has no runs");
    }
    let file;
    for (const run of runs) {
      const files = listOf(await call("get_run_files", { agentId: agent.id, runId: run.id }));
      if (files?.[0]) { file = { runId: run.id, fileId: files[0].id }; break; }
    }
    if (!runs.length) skip("get_run_files", "agent has no runs");
    if (file) await call("get_file_download_url", { agentId: agent.id, ...file });
    else skip("get_file_download_url", "no run with files among the last 10");
  } else {
    for (const t of ["get_agent", "get_agent_run_summary", "get_agent_versions", "get_agent_cost_breakdown", "get_agent_runs_cost", "get_agent_runs", "get_run_status", "get_run_diagnostics", "get_run_files", "get_file_download_url"]) skip(t, "no agent found");
  }
  if (failed) await call("get_latest_failure", { agentId: failed.id });
  else skip("get_latest_failure", "no agent whose last run failed");

  await call("search_agents", { query: "test" });
  await call("get_agent_search_count", { query: "test" });
  await call("get_personal_agent_count", {});

  const upcoming = await call("get_scheduled_runs", {});
  const sched = listOf(upcoming)?.[0];
  if (sched) {
    await call("list_agent_schedules", { agentId: sched.agentId });
    await call("get_agent_schedule", { agentId: sched.agentId, scheduleId: sched.scheduleId });
  } else if (agent) {
    await call("list_agent_schedules", { agentId: agent.id });
    skip("get_agent_schedule", "no upcoming schedule found");
  } else {
    skip("list_agent_schedules", "no agent found");
    skip("get_agent_schedule", "no upcoming schedule found");
  }

  const spaces = await call("list_spaces", {});
  const list = listOf(spaces);
  const sp = list ? list.find((s) => s.id > 1) ?? list[0] : undefined;
  if (sp) {
    await call("get_space", { spaceId: sp.id });
    await call("get_space_agents", { spaceId: sp.id });
    await call("get_space_agent_count", { spaceId: sp.id });
    if (sp.name) await call("search_space_by_name", { name: sp.name });
    else skip("search_space_by_name", "space has no name");
  } else {
    for (const t of ["get_space", "get_space_agents", "get_space_agent_count", "search_space_by_name"]) skip(t, "no space found");
  }

  await call("get_credits_balance", {});
  await call("get_spending_summary", {});
  await call("get_credit_history", {});
  await call("get_agents_usage", {});
  await call("get_runs_summary", { includeDetails: false });
  await call("get_runs_summary", { includeDetails: true });
  await call("get_records_summary", {});
  skip("get_agent_build_status", "needs a build session; creating one is a write");
  for (const t of WRITE_TOOLS) skip(t, "not exercised (write)");
  for (const t of uncalledReadTools(rows)) skip(t, "not called by this script: add a call in main()");

  await client.close();

  const width = Math.max(...rows.map((r) => r.tool.length));
  for (const r of rows) log(`${r.verdict.padEnd(14)} ${r.tool.padEnd(width)} ${r.detail}`);
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.verdict]: (acc[r.verdict] ?? 0) + 1 }), {});
  log(`summary: ${JSON.stringify(counts)}`);
  return exitCode(rows);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => { log(`error: ${err?.message ?? err}`); process.exit(2); }
  );
}
