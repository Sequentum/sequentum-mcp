import { describe, expect, it, vi } from "vitest";

// Stub the API client for the whole file: the handler builds a real one per request.
vi.mock("../api/api-client.js", () => ({
  SequentumApiClient: class {
    setAccessToken(_token: string) {}
    async getAllAgents() { return []; }
    async getAllSpaces() { return []; }
    async getCreditsBalance() { return { balance: 0 }; }
    async getSpendingSummary() { return {}; }
    async getAgentsUsage() { return []; }
    async getRunsSummary() { return {}; }
    async getUpcomingSchedules() { return []; }
    async startAgentBuild() { return { sessionId: "unused" }; }
    async getAgentBuildStatus() { return { status: "completed" }; }
    async stopAgentBuild() {}
  },
}));

import { SequentumApiClient } from "../api/api-client.js";
import { createSequentumMcpHandler } from "./mcp-handler.js";

const ENVELOPE = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "cache-test", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

/**
 * Mcp-Name is REQUIRED on any request carrying a name-like identifier, and must
 * match it exactly (verified): tools/call -> params.name, prompts/get -> params.name,
 * resources/read -> params.uri (the URI, NOT the registered resource name).
 * List methods and server/discover must not need it. Omitting it yields -32020
 * before the handler runs, so a helper that forgets it tests nothing.
 */
function mcpNameFor(params: Record<string, unknown>): string | undefined {
  if (typeof params.uri === "string") return params.uri;
  if (typeof params.name === "string") return params.name;
  return undefined;
}

async function call(
  handler: ReturnType<typeof createSequentumMcpHandler>,
  method: string,
  params: Record<string, unknown> = {}
) {
  const mcpName = mcpNameFor(params);
  const res = await handler.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "Mcp-Method": method,
        ...(mcpName ? { "Mcp-Name": mcpName } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { _meta: ENVELOPE, ...params } }),
    })
  );
  return JSON.parse((await res.text()).replace(/^event: message\ndata: /, ""));
}

describe("cache hints", () => {
  // Asserts EMITTED values, not that the option was passed. Passing cacheHints to
  // createMcpHandler instead of the server constructor is silently ignored, and a
  // misspelled method key is silently accepted — only the response proves it worked.
  it.each([
    ["tools/list", 3_600_000, "public"],
    ["prompts/list", 3_600_000, "public"],
    ["resources/list", 3_600_000, "public"],
    ["resources/templates/list", 3_600_000, "public"],
    ["server/discover", 3_600_000, "public"],
  ])("%s emits ttlMs=%d cacheScope=%s", async (method, ttlMs, scope) => {
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const body = await call(handler, method as string);
    expect(body.result.ttlMs).toBe(ttlMs);
    expect(body.result.cacheScope).toBe(scope);
    await handler.close();
  });

  it("keeps resources/read private and uncached — every resource is per-user", async () => {
    // The API client must be stubbed so the read SUCCEEDS. Asserting cache fields on a
    // failed read with `?? "private"` fallbacks would pass no matter what the server
    // emitted — a vacuous test guarding the one hint that is a tenant isolation boundary.
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const body = await call(handler, "resources/read", { uri: "sequentum://agents" });

    expect(body.error, `resources/read failed: ${JSON.stringify(body.error)}`).toBeUndefined();
    expect(body.result.cacheScope).toBe("private");
    expect(body.result.ttlMs).toBe(0);
    await handler.close();
  });
});

describe("resource error codes", () => {
  // An unknown URI is a caller mistake, not a server fault. It must return
  // -32602 (Invalid Params), not -32603 Internal error.
  //
  // NOTE: this exact URI is NOT a good regression guard on its own. The SDK's
  // own resources/read dispatch (in @modelcontextprotocol/server) throws its
  // own ResourceNotFoundError -> -32602 for any URI that matches no
  // registered resource/template at all, WITHOUT ever calling into our
  // readResource() in resources.ts. So this case was already -32602 before
  // this task's fix, and passes unconditionally regardless of whether the fix
  // is present. Kept because it's the literal case the task's spec named.
  it("returns invalid-params, not internal error, for a URI matching no resource or template", async () => {
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const body = await call(handler, "resources/read", { uri: "sequentum://does-not-exist" });
    expect(body.error?.code).not.toBe(-32603);
    expect(body.error?.code).toBe(-32602);
    await handler.close();
  });

  // This is the case that actually exercises OUR fix: "sequentum://agents/abc"
  // structurally matches the registered "sequentum://agents/{agentId}"
  // template (so the SDK's own dispatch hands it to our readCallback), but
  // fails our internal numeric-id regex, hitting resources.ts's own fallback
  // throw. Before this fix that was a bare `throw new Error(...)`, rewrapped
  // by handlers.ts's readResourceResult wrapper into another generic Error ->
  // -32603 Internal error. Verified by temporarily reverting resources.ts and
  // handlers.ts and re-running an equivalent probe: it returned
  // {"code":-32603,"message":"Failed to read resource sequentum://agents/abc: Unknown resource URI: sequentum://agents/abc"}.
  // After the fix it returns -32602 with the ResourceNotFoundError's typed data.
  it("returns invalid-params, not internal error, for a URI that matches a template but fails id validation", async () => {
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const body = await call(handler, "resources/read", { uri: "sequentum://agents/abc" });
    expect(body.error?.code).not.toBe(-32603);
    expect(body.error?.code).toBe(-32602);
    await handler.close();
  });

  // Guards against the fix being too broad: a genuine upstream API failure
  // (as opposed to an unrecognized URI) must still surface as -32603 Internal
  // error, not get misclassified as a -32602 caller mistake.
  it("still returns an internal error for a genuine upstream API failure", async () => {
    const getAllAgents = vi
      .spyOn(SequentumApiClient.prototype, "getAllAgents")
      .mockRejectedValueOnce(new Error("upstream is on fire"));

    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const body = await call(handler, "resources/read", { uri: "sequentum://agents" });
    expect(body.error?.code).toBe(-32603);
    await handler.close();
    getAllAgents.mockRestore();
  });
});

/**
 * The ticket asks us to "validate horizontal scaling on a plain HTTP load
 * balancer." Load-balancer validation itself is infrastructure; the in-repo
 * stand-in is proving that two independently constructed handlers are
 * interchangeable — neither the McpServer, the API client, nor the caller's
 * token survives between requests or leaks between handler instances.
 */
describe("statelessness", () => {
  it("serves one client's sequence identically across two independent handlers", async () => {
    // Stand-in for a round-robin load balancer with no session affinity.
    const a = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const b = createSequentumMcpHandler("https://api.example.test", "9.9.9");

    const fromA = await call(a, "tools/list");
    const fromB = await call(b, "tools/list");

    expect(fromB.result.tools).toEqual(fromA.result.tools);
    expect(fromB.result.ttlMs).toBe(fromA.result.ttlMs);

    // No handshake was ever sent to b, yet it serves the request.
    expect(fromB.error).toBeUndefined();
    await a.close();
    await b.close();
  });

  // Content-equality alone (above) does not discriminate: tool lists are
  // static, so it passes identically whether a and b are truly independent
  // or are secretly the same object / share an API client. The actual
  // per-request state that must NOT leak is the caller's bearer token: the
  // factory in mcp-handler.ts builds a fresh SequentumApiClient per request
  // and calls setAccessToken only when THAT request carried a token. Spy on
  // the prototype method to prove request 2 (routed to the independent
  // handler b) gets its own client and its own token, not one carried over
  // from request 1's client on a.
  it("never lets one handler's caller token leak into another handler's client", async () => {
    const setAccessToken = vi.spyOn(SequentumApiClient.prototype, "setAccessToken");
    const a = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const b = createSequentumMcpHandler("https://api.example.test", "9.9.9");

    await a.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "Mcp-Method": "tools/list",
          authorization: "Bearer token-a",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: ENVELOPE } }),
      })
    );
    await b.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "Mcp-Method": "tools/list",
          authorization: "Bearer token-b",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: ENVELOPE } }),
      })
    );

    expect(setAccessToken.mock.calls).toEqual([["token-a"], ["token-b"]]);
    // Different SequentumApiClient instances: b's client never carries a's token.
    expect(setAccessToken.mock.contexts[0]).not.toBe(setAccessToken.mock.contexts[1]);
    setAccessToken.mockRestore();
    await a.close();
    await b.close();
  });

  // Under the v1 (2025-06-18) code, a request carrying a session id unknown
  // to the handling instance returned 400 "Server not initialized" — fatal.
  // The 2026-07-28 stateless handler must ignore a leftover/unknown
  // Mcp-Session-Id rather than fail the request, so a deploy (or a load
  // balancer routing decision) is never disrupted by session affinity.
  it("ignores a stale Mcp-Session-Id from a request routed to a handler that never issued it", async () => {
    const a = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const b = createSequentumMcpHandler("https://api.example.test", "9.9.9");

    // "Handshake" against a — b never sees this exchange.
    await call(a, "tools/list");

    const res = await b.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "Mcp-Method": "tools/call",
          "Mcp-Name": "list_agents",
          "Mcp-Session-Id": "stale-session-from-a-different-handler",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_agents", arguments: {}, _meta: ENVELOPE },
        }),
      })
    );
    expect(res.status).not.toBe(400);
    const body = JSON.parse((await res.text()).replace(/^event: message\ndata: /, ""));
    expect(body.error, `tools/call failed: ${JSON.stringify(body.error)}`).toBeUndefined();
    await a.close();
    await b.close();
  });
});

/**
 * Verified fact: Mcp-Name is mandatory on every name-carrying request and
 * must match exactly — tools/call/prompts/get -> params.name,
 * resources/read -> params.uri. Enforcement lives entirely in the SDK
 * (validateStandardRequestHeaders, called before the factory ever runs), so
 * these guard the wiring (headers actually reach the SDK), not a
 * reimplementation of the check.
 */
describe("Mcp-Name enforcement", () => {
  it("accepts tools/call when Mcp-Name matches params.name", async () => {
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const body = await call(handler, "tools/call", { name: "list_agents", arguments: {} });
    expect(body.error, `tools/call failed: ${JSON.stringify(body.error)}`).toBeUndefined();
    await handler.close();
  });

  it("rejects tools/call without the Mcp-Name header", async () => {
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const res = await handler.fetch(new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "Mcp-Method": "tools/call",
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "list_agents", arguments: {}, _meta: ENVELOPE },
      }),
    }));
    const body = JSON.parse(await res.text());
    expect(body.error.code).toBe(-32020);
    await handler.close();
  });
});

describe("progress notifications", () => {
  // Regression guard for the internal build polling (SE4-3428): a tools/call
  // carrying a progressToken must emit notifications/progress on THIS
  // request's own response stream, not a separate channel. Drive the mock
  // through a genuine "processing" phase before "completed" so the loop's
  // own mid-poll sendProgress call is exercised, not just the one-shot
  // "Build started" notification sent before the loop begins.
  it("emits notifications/progress on the request's own response stream", async () => {
    vi.useFakeTimers();
    try {
      const startAgentBuild = vi
        .spyOn(SequentumApiClient.prototype, "startAgentBuild")
        .mockResolvedValueOnce({ sessionId: "s1" } as Awaited<ReturnType<SequentumApiClient["startAgentBuild"]>>);
      const getAgentBuildStatus = vi
        .spyOn(SequentumApiClient.prototype, "getAgentBuildStatus")
        .mockResolvedValueOnce({ status: "processing" } as Awaited<ReturnType<SequentumApiClient["getAgentBuildStatus"]>>)
        .mockResolvedValueOnce({
          status: "completed",
          agentId: 42,
          agentName: "Test Agent",
        } as Awaited<ReturnType<SequentumApiClient["getAgentBuildStatus"]>>);

      const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
      const resPromise = handler.fetch(new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "Mcp-Method": "tools/call",
          "Mcp-Name": "start_agent_build",
        },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "tools/call",
          params: {
            name: "start_agent_build",
            arguments: { prompt: "scrape example.test for product names" },
            _meta: { ...ENVELOPE, progressToken: "tok-1" },
          },
        }),
      }));

      await vi.runAllTimersAsync();
      const res = await resPromise;

      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const body = await res.text();
      expect(body).toContain("notifications/progress");
      // Confirm the loop genuinely polled (not a mock that short-circuited
      // to instant completion) and reached the terminal "completed" status.
      expect(getAgentBuildStatus).toHaveBeenCalledTimes(2);

      await handler.close();
      startAgentBuild.mockRestore();
      getAgentBuildStatus.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("era logging", () => {
  it("logs the negotiated era, requested method, and client identity for a modern request", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    await call(handler, "tools/list");
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("era=modern");
    expect(logged).toContain('method="tools/list"');
    expect(logged).toContain("client=");
    spy.mockRestore();
    await handler.close();
  });

  it("logs era=legacy for a handshake-era request with no _meta envelope", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    await handler.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      })
    );
    expect(spy.mock.calls.map((c) => String(c[0])).join("\n")).toContain("era=legacy");
    spy.mockRestore();
    await handler.close();
  });

  it("propagates a traceparent header into the log line when the client sends one", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    await handler.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "Mcp-Method": "tools/list",
          traceparent,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: { _meta: ENVELOPE },
        }),
      })
    );
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain(`traceparent=${JSON.stringify(traceparent)}`);
    spy.mockRestore();
    await handler.close();
  });

  // Parity with traceparent: same code path (loggable(headers.get(...))), so it
  // is exercised independently rather than assumed to work because its sibling does.
  it("propagates a tracestate header into the log line when the client sends one", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const tracestate = "congo=t61rcWkgMzE,rojo=00f067aa0ba902b7";
    await handler.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "Mcp-Method": "tools/list",
          tracestate,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: { _meta: ENVELOPE },
        }),
      })
    );
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain(`tracestate=${JSON.stringify(tracestate)}`);
    spy.mockRestore();
    await handler.close();
  });

  // Security regression guard: an earlier task established that this server must
  // never leak credentials into logs. Confirm the era line logs auth presence,
  // never the Authorization header's value.
  it("never logs the Authorization header's value, even when one is sent", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    await handler.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "Mcp-Method": "tools/list",
          authorization: "Bearer secret-token-xyz",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: { _meta: ENVELOPE },
        }),
      })
    );
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).not.toContain("secret-token-xyz");
    expect(logged).not.toContain("Bearer");
    expect(logged).toContain("auth=present");
    spy.mockRestore();
    await handler.close();
  });

  // This is the headline capability the routed-regression fix exists for: a
  // real tools/call (not tools/list) must show up with both method= and name=.
  it("logs method and name for a valid tools/call, not just tools/list", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const body = await call(handler, "tools/call", { name: "list_agents", arguments: {} });
    expect(body.error, `tools/call failed: ${JSON.stringify(body.error)}`).toBeUndefined();
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain('method="tools/call"');
    expect(logged).toContain('name="list_agents"');
    spy.mockRestore();
    await handler.close();
  });

  // The exact scenario the routed-regression fix exists for: under SDK v2 the
  // SDK rejects schema-invalid tool arguments before our registerTool wrapper
  // ever runs, so the old "[DEBUG] Tool called" line (logged from inside that
  // wrapper) never fires for this call. Confirm the era line — logged from the
  // factory, before the SDK validates anything — still records that this
  // malformed call arrived, with the offending method and name.
  it("still logs method and name for a tools/call the SDK rejects for schema-invalid arguments", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    // get_agent requires a numeric agentId; a string fails schema validation
    // before dispatch ever reaches our handler (or the mocked API client).
    const body = await call(handler, "tools/call", {
      name: "get_agent",
      arguments: { agentId: "not-a-number" },
    });
    // Confirm the call really was rejected, not silently accepted.
    expect(body.result?.isError, `expected a rejected call, got: ${JSON.stringify(body)}`).toBe(true);
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain('method="tools/call"');
    expect(logged).toContain('name="get_agent"');
    spy.mockRestore();
    await handler.close();
  });

  // Finding: an unescaped, unbounded user-agent in the middle of a
  // space-delimited log line lets a client forge extra key=value tokens (e.g.
  // fake out auth=present or a bogus traceparent) with nothing more exotic
  // than spaces and equals signs in its User-Agent header. Quoting via
  // loggable() must make the whole header value opaque to a naive parser.
  it("quotes the client field so a hostile User-Agent cannot forge extra key=value tokens", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const evilUserAgent = "evil client=fake auth=present traceparent=00-deadbeef";
    await handler.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "Mcp-Method": "tools/list",
          "user-agent": evilUserAgent,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: ENVELOPE } }),
      })
    );
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    // The forged tokens exist ONLY inside the quoted client value.
    expect(logged).toContain(`client=${JSON.stringify(evilUserAgent)}`);
    // Strip that quoted value, then confirm the only auth= token left in the
    // line is the one real field (auth=absent — no Authorization header was
    // sent), and no traceparent= token survives at all (none was sent).
    const withoutQuotedClient = logged.replace(JSON.stringify(evilUserAgent), "");
    expect(withoutQuotedClient.match(/\bauth=\S+/g)).toEqual(["auth=absent"]);
    expect(withoutQuotedClient).not.toContain("traceparent=");
    spy.mockRestore();
    await handler.close();
  });

  it("truncates an oversized header instead of emitting it whole", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createSequentumMcpHandler("https://api.example.test", "9.9.9");
    const hugeUserAgent = "A".repeat(5000);
    await handler.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "Mcp-Method": "tools/list",
          "user-agent": hugeUserAgent,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: ENVELOPE } }),
      })
    );
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).not.toContain(hugeUserAgent);
    expect(logged).toContain(`client=${JSON.stringify("A".repeat(200))}`);
    spy.mockRestore();
    await handler.close();
  });
});
