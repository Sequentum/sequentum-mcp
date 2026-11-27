import { afterEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";
import { SequentumApiClient } from "../api/api-client.js";
import { ApiRequestError } from "../api/types.js";
import { runWithUpstreamAuth } from "../api/upstream-auth.js";
import { buildAuthChallenge } from "../utils/oauth-metadata.js";
import { createSequentumMcpHandler } from "./mcp-handler.js";
import { loadWorkflowSkills } from "./skills.js";
import { TASKS_EXTENSION_ID, TASK_MARKER_META_KEY, installTaskSupport } from "./tasks.js";

const skills = await loadWorkflowSkills();

const ENVELOPE = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "tasks-test", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

/** A 2026-07-28 envelope whose client capabilities declare the Tasks extension. */
const DECLARING_ENVELOPE = {
  ...ENVELOPE,
  "io.modelcontextprotocol/clientCapabilities": { extensions: { [TASKS_EXTENSION_ID]: {} } },
};

const PROMPT = "scrape example.test for product names";
const createdAt = "2026-11-27T12:00:00Z";

type Handler = ReturnType<typeof createSequentumMcpHandler>;

function handlerWith(tasksEnabled: boolean): Handler {
  return createSequentumMcpHandler("https://api.example.test", "9.9.9", skills, { tasksEnabled });
}

/** Mcp-Name must equal params.name (tools/call) or params.taskId (tasks/get, tasks/cancel). */
function mcpNameFor(params: Record<string, unknown>): string | undefined {
  if (typeof params.name === "string") return params.name;
  if (typeof params.taskId === "string") return params.taskId;
  return undefined;
}

async function call(
  handler: Handler,
  method: string,
  params: Record<string, unknown> = {},
  envelope: Record<string, unknown> = DECLARING_ENVELOPE
) {
  const mcpName = mcpNameFor(params);
  const res = await handler.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer test-token",
        "Mcp-Method": method,
        "Mcp-Protocol-Version": "2026-07-28",
        ...(mcpName !== undefined ? { "Mcp-Name": mcpName } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { _meta: envelope, ...params } }),
    })
  );
  return JSON.parse((await res.text()).replace(/^event: message\ndata: /, ""));
}

/** A 2025-era request: no envelope and no Mcp-Method/Mcp-Name, so the legacy path answers it. */
async function callLegacy(handler: Handler, method: string, params: Record<string, unknown>) {
  const res = await handler.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })
  );
  return JSON.parse((await res.text()).replace(/^event: message\ndata: /, ""));
}

/** Run a blocking start_agent_build call to completion under fake timers. */
async function callBlocking(handler: Handler, args: Record<string, unknown>, envelope = DECLARING_ENVELOPE) {
  vi.useFakeTimers();
  try {
    const pending = call(handler, "tools/call", { name: "start_agent_build", arguments: args }, envelope);
    await vi.runAllTimersAsync();
    return await pending;
  } finally {
    vi.useRealTimers();
  }
}

function spyBuildApi() {
  return {
    startAgentBuildTask: vi.spyOn(SequentumApiClient.prototype, "startAgentBuildTask").mockResolvedValue({
      taskId: "ab_1",
      status: "processing",
      createdAt,
      pollIntervalSeconds: 5,
      resultRetentionSeconds: 3600,
    }),
    startAgentBuild: vi
      .spyOn(SequentumApiClient.prototype, "startAgentBuild")
      .mockResolvedValue({ sessionId: "s1" } as Awaited<ReturnType<SequentumApiClient["startAgentBuild"]>>),
    getAgentBuildStatus: vi
      .spyOn(SequentumApiClient.prototype, "getAgentBuildStatus")
      .mockResolvedValue({ status: "completed", agentId: 42 } as Awaited<
        ReturnType<SequentumApiClient["getAgentBuildStatus"]>
      >),
  };
}

function notFound(): ApiRequestError {
  return new ApiRequestError(404, "Not Found", "Task not found", "/api/v1/agent-builder/tasks/ab_1");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Stub the global fetch the API client uses; each call gets a fresh Response. */
function upstream(reply: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async () => reply());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const UPSTREAM_SECRET = "secret upstream detail at /internal/path";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("start_agent_build as an MCP Task", () => {
  it("returns a task to a declaring client when enabled", async () => {
    const api = spyBuildApi();
    const handler = handlerWith(true);
    const body = await call(handler, "tools/call", { name: "start_agent_build", arguments: { prompt: PROMPT } });

    expect(body.error, JSON.stringify(body.error)).toBeUndefined();
    expect(body.result.resultType).toBe("task");
    expect(body.result.taskId).toBe("ab_1");
    expect(body.result.status).toBe("working");
    expect(body.result.pollIntervalMs).toBe(5000);
    expect(body.result).not.toHaveProperty("content");
    expect(body.result).not.toHaveProperty("structuredContent");
    expect(body.result._meta ?? {}).not.toHaveProperty(TASK_MARKER_META_KEY);
    expect(api.startAgentBuild).not.toHaveBeenCalled();
    expect(api.getAgentBuildStatus).not.toHaveBeenCalled();
    await handler.close();
  });

  it("keeps the blocking loop when the client does not declare Tasks", async () => {
    const api = spyBuildApi();
    const handler = handlerWith(true);
    const body = await callBlocking(handler, { prompt: PROMPT }, ENVELOPE);

    expect(body.result.resultType).not.toBe("task");
    expect(body.result.structuredContent).toMatchObject({ status: "completed", sessionId: "s1" });
    expect(api.startAgentBuild).toHaveBeenCalledTimes(1);
    expect(api.startAgentBuildTask).not.toHaveBeenCalled();
    await handler.close();
  });

  it("keeps the blocking loop when the flag is off", async () => {
    const api = spyBuildApi();
    const handler = handlerWith(false);
    const body = await callBlocking(handler, { prompt: PROMPT });

    expect(body.result.resultType).not.toBe("task");
    expect(api.startAgentBuild).toHaveBeenCalledTimes(1);
    expect(api.startAgentBuildTask).not.toHaveBeenCalled();

    const discover = await call(handler, "server/discover");
    expect(discover.result.capabilities.extensions ?? {}).not.toHaveProperty(TASKS_EXTENSION_ID);
    await handler.close();
  });

  it("advertises the extension in server/discover when enabled", async () => {
    const handler = handlerWith(true);
    const discover = await call(handler, "server/discover");
    expect(discover.result.capabilities.extensions).toHaveProperty(TASKS_EXTENSION_ID);
    await handler.close();
  });

  it("keeps waitForCompletion:false as the immediate sessionId reply", async () => {
    const api = spyBuildApi();
    const handler = handlerWith(true);
    const body = await call(handler, "tools/call", {
      name: "start_agent_build",
      arguments: { prompt: PROMPT, waitForCompletion: false },
    });

    expect(api.startAgentBuild).toHaveBeenCalledTimes(1);
    expect(api.startAgentBuildTask).not.toHaveBeenCalled();
    expect(body.result.structuredContent).toEqual({ sessionId: "s1" });
    expect(body.result.resultType).not.toBe("task");
    await handler.close();
  });

  it("ignores a Tasks declaration on the legacy era", async () => {
    const api = spyBuildApi();
    const handler = handlerWith(true);
    const init = await callLegacy(handler, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: { extensions: { [TASKS_EXTENSION_ID]: {} } },
      clientInfo: { name: "old", version: "1" },
    });
    expect(init.result.protocolVersion).toBe("2025-06-18");

    vi.useFakeTimers();
    let body;
    try {
      const pending = callLegacy(handler, "tools/call", { name: "start_agent_build", arguments: { prompt: PROMPT } });
      await vi.runAllTimersAsync();
      body = await pending;
    } finally {
      vi.useRealTimers();
    }

    expect(body.result.resultType).not.toBe("task");
    expect(api.startAgentBuild).toHaveBeenCalledTimes(1);
    expect(api.startAgentBuildTask).not.toHaveBeenCalled();
    await handler.close();
  });

  it("still validates arguments before creating a task", async () => {
    const api = spyBuildApi();
    const handler = handlerWith(true);
    const body = await call(handler, "tools/call", { name: "start_agent_build", arguments: { prompt: "short" } });

    expect(body.result.isError).toBe(true);
    expect(api.startAgentBuildTask).not.toHaveBeenCalled();
    await handler.close();
  });

  it("does not change tools/list", async () => {
    const on = handlerWith(true);
    const off = handlerWith(false);
    const onBody = await call(on, "tools/list");
    const offBody = await call(off, "tools/list");
    expect(onBody.result.tools).toEqual(offBody.result.tools);
    await on.close();
    await off.close();
  });

  it("passes an input_required confirmation through unchanged", async () => {
    const deleteRun = vi.spyOn(SequentumApiClient.prototype, "deleteRun").mockResolvedValue(undefined);
    const envelope = {
      ...ENVELOPE,
      "io.modelcontextprotocol/clientCapabilities": { elicitation: {}, extensions: { [TASKS_EXTENSION_ID]: {} } },
    };
    const params = { name: "delete_run", arguments: { agentId: 44, runId: 812 } };
    const on = handlerWith(true);
    const off = handlerWith(false);
    const onBody = await call(on, "tools/call", params, envelope);
    const offBody = await call(off, "tools/call", params, envelope);

    expect(onBody.result.resultType).toBe("input_required");
    expect(onBody.result).toEqual(offBody.result);
    expect(deleteRun).not.toHaveBeenCalled();
    await on.close();
    await off.close();
  });
});

describe("tasks/get", () => {
  it("tasks/get returns the inline result once completed", async () => {
    vi.spyOn(SequentumApiClient.prototype, "getAgentBuildTask").mockResolvedValue({
      status: "completed",
      agentId: 42,
      agentName: "Agent",
      createdAt,
      finishedAt: "2026-11-27T12:05:00Z",
    });
    const handler = handlerWith(true);
    const body = await call(handler, "tasks/get", { taskId: "ab_1" });

    expect(body.error, JSON.stringify(body.error)).toBeUndefined();
    expect(body.result.resultType).toBe("complete");
    expect(body.result.status).toBe("completed");
    expect(body.result.result.structuredContent.sessionId).toBe("ab_1");
    await handler.close();
  });

  it("tasks/get answers -32602 for an unknown task", async () => {
    vi.spyOn(SequentumApiClient.prototype, "getAgentBuildTask").mockRejectedValue(notFound());
    const handler = handlerWith(true);
    const body = await call(handler, "tasks/get", { taskId: "ab_1" });

    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toBe("Failed to retrieve task: Task not found");
    await handler.close();
  });

  it("tasks/get stays working on a Control Center 503", async () => {
    vi.spyOn(SequentumApiClient.prototype, "getAgentBuildTask").mockRejectedValue(
      new ApiRequestError(503, "Service Unavailable", "unavailable", "/api/v1/agent-builder/tasks/ab_1")
    );
    const handler = handlerWith(true);
    const body = await call(handler, "tasks/get", { taskId: "ab_1" });

    expect(body.error, JSON.stringify(body.error)).toBeUndefined();
    expect(body.result.status).toBe("working");
    await handler.close();
  });
});

describe("tasks/get against the Control Center", () => {
  const failures: Array<[string, () => Response | Promise<Response>]> = [
    ["a 500", () => new Response(UPSTREAM_SECRET, { status: 500 })],
    ["a 502", () => new Response(UPSTREAM_SECRET, { status: 502 })],
    ["a 503", () => new Response(UPSTREAM_SECRET, { status: 503 })],
    ["a 504", () => new Response(UPSTREAM_SECRET, { status: 504 })],
    ["a 429", () => new Response(UPSTREAM_SECRET, { status: 429, headers: { "retry-after": "30" } })],
    [
      "a timeout",
      () => {
        const abort = new Error("The operation was aborted");
        abort.name = "AbortError";
        return Promise.reject(abort);
      },
    ],
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
  ];

  for (const [label, reply] of failures) {
    it(`stays working after one upstream attempt on ${label}`, async () => {
      const fetchMock = upstream(reply);
      const handler = handlerWith(true);
      const body = await call(handler, "tasks/get", { taskId: "ab_1" });

      expect(body.error, JSON.stringify(body.error)).toBeUndefined();
      expect(body.result.status).toBe("working");
      expect(body.result.taskId).toBe("ab_1");
      expect(JSON.stringify(body)).not.toContain("secret upstream detail");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await handler.close();
    });
  }

  it("answers -32602 for a Control Center 404", async () => {
    upstream(() => jsonResponse(404, { message: "Task not found" }));
    const handler = handlerWith(true);
    const body = await call(handler, "tasks/get", { taskId: "ab_1" });

    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toBe("Failed to retrieve task: Task not found");
    await handler.close();
  });

  for (const status of [400, 403]) {
    it(`answers a fixed -32603 without the upstream text for a ${status}`, async () => {
      upstream(() => jsonResponse(status, { message: UPSTREAM_SECRET }));
      const handler = handlerWith(true);
      const body = await call(handler, "tasks/get", { taskId: "ab_1" });

      expect(body.error.code).toBe(-32603);
      expect(body.error.message).toBe("Build status is unavailable");
      expect(JSON.stringify(body)).not.toContain("secret upstream detail");
      await handler.close();
    });
  }

  it("ends in HTTP 401 with the challenge when the upstream revokes the token", async () => {
    const origin = "http://localhost";
    upstream(
      () =>
        new Response("", {
          status: 401,
          headers: {
            "www-authenticate":
              'Bearer realm="MCP Server", resource_metadata="http://cc/.well-known/oauth-protected-resource"',
          },
        })
    );
    const onRevoked = vi.fn();
    const handler = handlerWith(true);
    const res = await runWithUpstreamAuth({ tokenType: "authorization_code", origin, onRevoked }, () =>
      handler.fetch(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            authorization: "Bearer test-token",
            "Mcp-Method": "tasks/get",
            "Mcp-Protocol-Version": "2026-07-28",
            "Mcp-Name": "ab_1",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tasks/get",
            params: { _meta: DECLARING_ENVELOPE, taskId: "ab_1" },
          }),
        })
      )
    );

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(buildAuthChallenge(origin).wwwAuthenticate);
    expect(onRevoked).toHaveBeenCalledTimes(1);
    await handler.close();
  });
});

describe("task id validation", () => {
  const badIds: Array<[string, string]> = [
    ["..", ".."],
    [".", "."],
    ["an empty id", ""],
    ["a 257-character id", "a".repeat(257)],
    ["a/b", "a/b"],
  ];

  for (const method of ["tasks/get", "tasks/cancel"]) {
    for (const [label, taskId] of badIds) {
      it(`${method} answers -32602 for ${label} without calling the Control Center`, async () => {
        const fetchMock = upstream(() => jsonResponse(200, { status: "processing", createdAt }));
        const handler = handlerWith(true);
        const body = await call(handler, method, { taskId });

        expect(body.error?.code, JSON.stringify(body)).toBe(-32602);
        expect(body.error.message).toBe("Failed to retrieve task: Task not found");
        expect(fetchMock).not.toHaveBeenCalled();
        await handler.close();
      });
    }
  }

  it("accepts a 256-character id", async () => {
    const fetchMock = upstream(() => jsonResponse(200, { status: "processing", createdAt }));
    const handler = handlerWith(true);
    const body = await call(handler, "tasks/get", { taskId: "a".repeat(256) });

    expect(body.error, JSON.stringify(body.error)).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await handler.close();
  });
});

describe("the private task marker", () => {
  it("still returns a task when the Control Center omits createdAt", async () => {
    vi.spyOn(SequentumApiClient.prototype, "startAgentBuildTask").mockResolvedValue({
      taskId: "ab_1",
      status: "processing",
      pollIntervalSeconds: 5,
      resultRetentionSeconds: 3600,
    } as unknown as Awaited<ReturnType<SequentumApiClient["startAgentBuildTask"]>>);
    const handler = handlerWith(true);
    const body = await call(handler, "tools/call", { name: "start_agent_build", arguments: { prompt: PROMPT } });

    expect(body.error, JSON.stringify(body.error)).toBeUndefined();
    expect(body.result.resultType).toBe("task");
    expect(body.result.taskId).toBe("ab_1");
    expect(Number.isNaN(Date.parse(body.result.createdAt))).toBe(false);
    await handler.close();
  });

  it("never sends a malformed marker to the client", async () => {
    vi.spyOn(SequentumApiClient.prototype, "startAgentBuildTask").mockResolvedValue({
      taskId: "ab_1",
      status: "processing",
      createdAt: 12345,
      pollIntervalSeconds: 5,
      resultRetentionSeconds: 3600,
    } as unknown as Awaited<ReturnType<SequentumApiClient["startAgentBuildTask"]>>);
    const handler = handlerWith(true);
    const body = await call(handler, "tools/call", { name: "start_agent_build", arguments: { prompt: PROMPT } });

    expect(JSON.stringify(body)).not.toContain(TASK_MARKER_META_KEY);
    await handler.close();
  });
});

describe("tasks/cancel against the Control Center", () => {
  it("acknowledges a cancel of a finished task (204)", async () => {
    const fetchMock = upstream(() => new Response(null, { status: 204 }));
    const handler = handlerWith(true);
    const body = await call(handler, "tasks/cancel", { taskId: "ab_1" });

    expect(body.error, JSON.stringify(body.error)).toBeUndefined();
    const { _meta: _ignored, ...result } = body.result;
    expect(result).toEqual({ resultType: "complete" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await handler.close();
  });

  for (const status of [400, 403, 500, 503]) {
    it(`answers a fixed -32603 without the upstream text for a ${status}`, async () => {
      const fetchMock = upstream(() => jsonResponse(status, { message: UPSTREAM_SECRET }));
      const handler = handlerWith(true);
      const body = await call(handler, "tasks/cancel", { taskId: "ab_1" });

      expect(body.error.code).toBe(-32603);
      expect(body.error.message).toBe("Could not cancel the build");
      expect(JSON.stringify(body)).not.toContain("secret upstream detail");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await handler.close();
    });
  }
});

describe("tasks/cancel", () => {
  it("tasks/cancel calls the cancel route and acknowledges", async () => {
    const cancel = vi.spyOn(SequentumApiClient.prototype, "cancelAgentBuildTask").mockResolvedValue(undefined);
    const handler = handlerWith(true);
    const body = await call(handler, "tasks/cancel", { taskId: "ab_1" });

    expect(body.error, JSON.stringify(body.error)).toBeUndefined();
    expect(cancel).toHaveBeenCalledWith("ab_1");
    const { _meta: _ignored, ...result } = body.result;
    expect(result).toEqual({ resultType: "complete" });
    await handler.close();
  });

  it("tasks/cancel answers -32602 for an unknown task", async () => {
    vi.spyOn(SequentumApiClient.prototype, "cancelAgentBuildTask").mockRejectedValue(notFound());
    const handler = handlerWith(true);
    const body = await call(handler, "tasks/cancel", { taskId: "ab_1" });

    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toBe("Failed to retrieve task: Task not found");
    await handler.close();
  });
});

describe("installTaskSupport", () => {
  it("fails loudly when the SDK handler map is missing", () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    (server.server as unknown as { _requestHandlers: unknown })._requestHandlers = undefined;
    expect(() => installTaskSupport(server, new SequentumApiClient("https://api.example.test"))).toThrow(
      "MCP Tasks: the SDK's tools/call handler was not found; check the SDK version"
    );
  });
});
