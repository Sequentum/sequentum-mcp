/**
 * Tasks tests that need module mocks: DEBUG forced on, and an SDK whose request handler map
 * is gone when the task support is installed. Kept apart so the mocks touch no other test.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import type { SequentumApiClient } from "../api/api-client.js";
import { createSequentumMcpHandler } from "./mcp-handler.js";
import { loadWorkflowSkills } from "./skills.js";
import { TASKS_EXTENSION_ID } from "./tasks.js";

const probe = vi.hoisted(() => ({ breakHandlers: false }));

vi.mock("./tools/shared.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tools/shared.js")>()),
  DEBUG: true,
}));

vi.mock("./tasks.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tasks.js")>();
  return {
    ...actual,
    installTaskSupport: (server: McpServer, apiClient: SequentumApiClient) => {
      if (probe.breakHandlers) {
        (server.server as unknown as { _requestHandlers: unknown })._requestHandlers = undefined;
      }
      return actual.installTaskSupport(server, apiClient);
    },
  };
});

const skills = await loadWorkflowSkills();
const createdAt = "2026-11-27T12:00:00Z";
const UPSTREAM_SECRET = "secret upstream detail at /internal/path";

afterEach(() => {
  probe.breakHandlers = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function handlerWith(tasksEnabled: boolean) {
  return createSequentumMcpHandler("https://api.example.test", "9.9.9", skills, { tasksEnabled });
}

async function callTask(method: string, taskId: string) {
  const handler = handlerWith(true);
  const res = await handler.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer test-token",
        "Mcp-Method": method,
        "Mcp-Protocol-Version": "2026-07-28",
        "Mcp-Name": taskId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientInfo": { name: "tasks-test", version: "1.0.0" },
            "io.modelcontextprotocol/clientCapabilities": { extensions: { [TASKS_EXTENSION_ID]: {} } },
          },
          taskId,
        },
      }),
    })
  );
  const body = JSON.parse((await res.text()).replace(/^event: message\ndata: /, ""));
  await handler.close();
  return body;
}

describe("createSequentumMcpHandler with MCP Tasks enabled", () => {
  it("throws when the handler is built, not on the first request, if the SDK handler map is missing", () => {
    probe.breakHandlers = true;
    expect(() => handlerWith(true)).toThrow(
      "MCP Tasks: the SDK's tools/call handler was not found; check the SDK version"
    );
  });

  it("does not probe the SDK when the flag is off", () => {
    probe.breakHandlers = true;
    expect(() => handlerWith(false)).not.toThrow();
  });
});

describe("tasks/* DEBUG logging", () => {
  it("logs the raw build error the way the blocking path does", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "error", error: "raw boom", createdAt }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
      )
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = await callTask("tasks/get", "ab_1");

    expect(body.result.result.isError).toBe(true);
    expect(JSON.stringify(body)).not.toContain("raw boom");
    expect(log).toHaveBeenCalledWith("[DEBUG] Agent build session ab_1 failed: raw boom");
  });

  for (const method of ["tasks/get", "tasks/cancel"]) {
    it(`${method} logs the raw upstream text it keeps out of the error`, async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ message: UPSTREAM_SECRET }), {
              status: 403,
              headers: { "content-type": "application/json" },
            })
        )
      );
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const body = await callTask(method, "ab_1");

      expect(body.error.code).toBe(-32603);
      expect(JSON.stringify(body)).not.toContain("secret upstream detail");
      expect(log.mock.calls.some(([line]) => String(line).includes(UPSTREAM_SECRET))).toBe(true);
    });
  }
});
