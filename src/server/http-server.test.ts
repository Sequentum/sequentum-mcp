/**
 * HTTP server integration tests.
 *
 * These tests spin up a real Express server on an OS-assigned port and make
 * actual HTTP requests so we can verify the route registration and response
 * headers, not just the handler logic in isolation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "http";
import express, { type NextFunction, type Request, type Response } from "express";
import {
  GLAMA_CLAIM_TOKEN_PATTERN,
  applyTrustProxy,
  auditCanonicalOrigin,
  auditGlamaClaimToken,
  handleGlamaClaim,
  handleOpenAIChallenge,
  jsonRpcErrorMiddleware,
  parseTrustProxy,
  shutdownInstance,
} from "./http-server.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal Express app wired up with the real handleOpenAIChallenge
 * handler, bound to an OS-assigned port.  Returns the server and its base URL.
 */
function createChallengeServer(token: string | undefined): { server: http.Server; baseUrl: string } {
  // Set the env var before creating the server so the intent is explicit.
  if (token !== undefined) {
    process.env.OPENAI_APPS_CHALLENGE_TOKEN = token;
  } else {
    delete process.env.OPENAI_APPS_CHALLENGE_TOKEN;
  }

  const app = express();
  app.get("/.well-known/openai-apps-challenge", handleOpenAIChallenge);

  const server = http.createServer(app);
  server.listen(0); // OS assigns an available port

  const address = server.address() as { port: number };
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

// ---------------------------------------------------------------------------
// /.well-known/openai-apps-challenge
// ---------------------------------------------------------------------------

describe("/.well-known/openai-apps-challenge", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeEach(() => {
    delete process.env.OPENAI_APPS_CHALLENGE_TOKEN;
  });

  afterEach(() => {
    server?.close();
    delete process.env.OPENAI_APPS_CHALLENGE_TOKEN;
  });

  it("returns 200 with the token as text/plain when OPENAI_APPS_CHALLENGE_TOKEN is set", async () => {
    const token = "openai-challenge-abc123";
    ({ server, baseUrl } = createChallengeServer(token));

    const res = await fetch(`${baseUrl}/.well-known/openai-apps-challenge`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe(token);
  });

  it("returns 404 when OPENAI_APPS_CHALLENGE_TOKEN is not set", async () => {
    ({ server, baseUrl } = createChallengeServer(undefined));

    const res = await fetch(`${baseUrl}/.well-known/openai-apps-challenge`);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// /.well-known/glama.json
// ---------------------------------------------------------------------------

describe("/.well-known/glama.json", () => {
  // Glama's HTTP challenge fetches this file from the connector's own origin to
  // verify ownership, and keeps re-fetching it, so the body must match Glama's
  // connector schema exactly and a malformed token must never be served.
  const VALID = "glama_claim_" + "A".repeat(16) + "b-_9".repeat(4);
  let server: http.Server;
  let baseUrl: string;

  function startServer(token: string | undefined): void {
    if (token !== undefined) process.env.GLAMA_CLAIM_TOKEN = token;
    else delete process.env.GLAMA_CLAIM_TOKEN;

    const app = express();
    app.get("/.well-known/glama.json", handleGlamaClaim);
    server = http.createServer(app);
    server.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }

  afterEach(() => {
    server?.close();
    delete process.env.GLAMA_CLAIM_TOKEN;
  });

  it("returns 200 with exactly the connector claim document when the token is valid", async () => {
    startServer(VALID);

    const res = await fetch(`${baseUrl}/.well-known/glama.json`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({
      $schema: "https://glama.ai/mcp/schemas/connector.json",
      claim: VALID,
    });
  });

  it("answers HEAD with 200 and no body", async () => {
    startServer(VALID);

    const res = await fetch(`${baseUrl}/.well-known/glama.json`, { method: "HEAD" });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])("returns 404 when GLAMA_CLAIM_TOKEN is %s", async (_label, token) => {
    startServer(token);

    const res = await fetch(`${baseUrl}/.well-known/glama.json`);

    expect(res.status).toBe(404);
  });

  it.each([
    ["the wrong prefix", "glama_token_" + "A".repeat(32)],
    ["a 31-character suffix", "glama_claim_" + "A".repeat(31)],
    ["a 33-character suffix", "glama_claim_" + "A".repeat(33)],
    ["a disallowed character", "glama_claim_" + "A".repeat(31) + "."],
    ["a trailing newline", VALID + "\n"],
  ])("returns 404 for a token with %s", async (_label, token) => {
    startServer(token);

    const res = await fetch(`${baseUrl}/.well-known/glama.json`);

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseTrustProxy
// ---------------------------------------------------------------------------

describe("parseTrustProxy", () => {
  it("defaults to true (unset), identical to the previous boolean-only behaviour", () => {
    expect(parseTrustProxy(undefined)).toBe(true);
  });

  it("parses the literal strings 'true' and 'false'", () => {
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("false")).toBe(false);
  });

  it("parses a bare integer as a hop count", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("3")).toBe(3);
  });

  it("passes a comma-separated CIDR/IP list through as-is for Express to parse", () => {
    expect(parseTrustProxy("10.0.0.0/8,192.168.1.1")).toBe("10.0.0.0/8,192.168.1.1");
  });

  // Regression guard. Before SE4-3723 this setting was `TRUST_PROXY !== "false"`,
  // so every one of these meant `true` and the server booted. A parser that hands
  // them to Express as an IP allowlist makes `app.set` throw and the server never
  // starts -- turning a cosmetic env-var typo into a failed deploy.
  it("accepts boolean spellings that differ only by case or surrounding space", () => {
    expect(parseTrustProxy("True")).toBe(true);
    expect(parseTrustProxy("TRUE")).toBe(true);
    expect(parseTrustProxy(" true ")).toBe(true);
    expect(parseTrustProxy("False")).toBe(false);
    expect(parseTrustProxy(" false")).toBe(false);
  });

  it("treats an empty or whitespace-only value as unset rather than an allowlist", () => {
    expect(parseTrustProxy("")).toBe(true);
    expect(parseTrustProxy("   ")).toBe(true);
  });

  it("trims a hop count and an allowlist", () => {
    expect(parseTrustProxy(" 2 ")).toBe(2);
    expect(parseTrustProxy(" 10.0.0.0/8 ")).toBe("10.0.0.0/8");
  });
});

// ---------------------------------------------------------------------------
// applyTrustProxy
// ---------------------------------------------------------------------------

describe("applyTrustProxy", () => {
  it("applies a valid setting to the app", () => {
    const app = express();
    applyTrustProxy(app, "10.0.0.0/8");
    expect(app.get("trust proxy")).toBe("10.0.0.0/8");
  });

  // Express compiles the allowlist inside app.set and throws on anything
  // proxy-addr cannot parse. Left uncaught that is a boot failure, so an
  // unparseable value must degrade to the documented default instead.
  it("falls back to true and warns rather than throwing on an unparseable value", () => {
    const app = express();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => applyTrustProxy(app, "not-an-ip")).not.toThrow();
    expect(app.get("trust proxy")).toBe(true);
    expect(spy.mock.calls.flat().join(" ")).toMatch(/TRUST_PROXY/);
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// jsonRpcErrorMiddleware
// ---------------------------------------------------------------------------

describe("jsonRpcErrorMiddleware", () => {
  function mockResponse() {
    const res = {
      headersSent: false,
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
    };
    return res as unknown as Response & { statusCode: number; body: unknown };
  }

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.DEBUG;
  });

  it("returns a sanitized JSON-RPC -32603 error, not an HTML page", () => {
    const res = mockResponse();
    const next = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    jsonRpcErrorMiddleware(new Error("boom"), {} as Request, res, next as NextFunction);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ jsonrpc: "2.0", error: { code: -32603 }, id: null });
    spy.mockRestore();
  });

  it("includes the error message only when DEBUG=1", () => {
    process.env.DEBUG = "1";
    const res = mockResponse();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    jsonRpcErrorMiddleware(new Error("boom, detailed cause"), {} as Request, res, vi.fn() as NextFunction);

    expect((res.body as { error: { message: string } }).error.message).toBe("boom, detailed cause");
    spy.mockRestore();
  });

  // The case that matters: a plain `node dist/index.js` run, which is what this
  // middleware's doc comment names as its reason for existing. NODE_ENV is unset there
  // (only the Dockerfile sets it), so gating on NODE_ENV !== "production" leaked
  // internal messages in exactly the situation nobody asked for them.
  it("suppresses the error message by default, with neither DEBUG nor NODE_ENV set", () => {
    const res = mockResponse();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    jsonRpcErrorMiddleware(new Error("boom, detailed cause"), {} as Request, res, vi.fn() as NextFunction);

    const message = (res.body as { error: { message: string } }).error.message;
    expect(message).not.toContain("boom, detailed cause");
    expect(message).toBe("Internal server error");
    spy.mockRestore();
  });

  it("stays sanitized in a non-production NODE_ENV when DEBUG is unset", () => {
    process.env.NODE_ENV = "development";
    const res = mockResponse();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    jsonRpcErrorMiddleware(new Error("boom, detailed cause"), {} as Request, res, vi.fn() as NextFunction);

    expect((res.body as { error: { message: string } }).error.message).toBe("Internal server error");
    spy.mockRestore();
  });

  it("defers to next(err) instead of writing a second response when headers are already sent", () => {
    const res = mockResponse();
    res.headersSent = true;
    const next = vi.fn();
    const err = new Error("mid-stream failure");

    jsonRpcErrorMiddleware(err, {} as Request, res, next as NextFunction);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.body).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// shutdownInstance
// ---------------------------------------------------------------------------

describe("shutdownInstance", () => {
  it("aborts in-flight MCP exchanges even when the sockets never drain", async () => {
    // The regression this guards: awaiting httpServer.close() first deadlocks against
    // mcpHandler.close(), because close()'s callback only fires once the connections
    // that mcpHandler.close() would end have already ended. Here close() never calls
    // back until the handler has been closed -- exactly the SIGTERM-during-a-long-tool
    // -call shape -- so a re-ordered implementation hangs and this test times out.
    let drain: (() => void) | undefined;
    const httpServer = {
      close: vi.fn((cb: () => void) => {
        drain = cb;
      }),
      closeIdleConnections: vi.fn(),
    };
    const mcpHandler = {
      close: vi.fn(async () => {
        drain?.();
      }),
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await shutdownInstance({
      httpServer: httpServer as unknown as http.Server,
      mcpHandler,
    });

    expect(httpServer.close).toHaveBeenCalled();
    expect(mcpHandler.close).toHaveBeenCalled();
    spy.mockRestore();
  }, 5_000);

  it("closes idle keep-alive connections so an idle client cannot block the drain", async () => {
    const httpServer = {
      close: vi.fn((cb: () => void) => cb()),
      closeIdleConnections: vi.fn(),
    };
    const mcpHandler = { close: vi.fn(async () => {}) };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await shutdownInstance({
      httpServer: httpServer as unknown as http.Server,
      mcpHandler,
    });

    expect(httpServer.closeIdleConnections).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("still drains when the MCP handler throws", async () => {
    const httpServer = {
      close: vi.fn((cb: () => void) => cb()),
      closeIdleConnections: vi.fn(),
    };
    const mcpHandler = { close: vi.fn(async () => { throw new Error("handler blew up"); }) };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      shutdownInstance({ httpServer: httpServer as unknown as http.Server, mcpHandler })
    ).resolves.toBeUndefined();

    expect(spy.mock.calls.flat().join(" ")).toMatch(/Error closing the MCP handler/);
    spy.mockRestore();
  });
});

describe("auditCanonicalOrigin", () => {
  // The audience-comparison mode is reported once here rather than on every
  // request: MCP_CANONICAL_ORIGIN comes from the task definition and cannot
  // change while the process lives, so a per-request warning would repeat one
  // unchanging fact forever. That makes startup the only place an operator
  // learns the server fell back to the spoofable Host header -- and the only
  // moment the value can still be corrected -- so all three modes are pinned.
  const original = process.env.MCP_CANONICAL_ORIGIN;

  function captureWarnings(): string[] {
    const lines: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    return lines;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    if (original === undefined) delete process.env.MCP_CANONICAL_ORIGIN;
    else process.env.MCP_CANONICAL_ORIGIN = original;
  });

  it("warns when unset", () => {
    delete process.env.MCP_CANONICAL_ORIGIN;
    const lines = captureWarnings();

    auditCanonicalOrigin();

    expect(lines.join(" ")).toMatch(/MCP_CANONICAL_ORIGIN is unset/);
    expect(lines.join(" ")).toMatch(/Host header/);
  });

  it("warns when set to a value new URL cannot parse", () => {
    // A scheme-less host is the realistic typo: it looks like an origin to a
    // human editing a task definition, but `new URL` rejects it outright.
    process.env.MCP_CANONICAL_ORIGIN = "mcp.sequentum.com";
    const lines = captureWarnings();

    auditCanonicalOrigin();

    expect(lines.join(" ")).toMatch(/not a valid URL/);
    // The bad value is echoed so the operator can see the typo, not just that
    // one exists.
    expect(lines.join(" ")).toContain("mcp.sequentum.com");
  });

  it("stays silent on a valid origin, including one carrying a path", () => {
    // A path is harmless -- only `.origin` is used -- so it must not warn.
    process.env.MCP_CANONICAL_ORIGIN = "https://mcp.sequentum.com/mcp";
    const lines = captureWarnings();

    auditCanonicalOrigin();

    expect(lines).toEqual([]);
  });
});

describe("auditGlamaClaimToken", () => {
  // A malformed GLAMA_CLAIM_TOKEN makes /.well-known/glama.json 404, and so the
  // Glama ownership check silently fails. The startup log is the only place an
  // operator sees why. The value itself must not appear there: a near-miss is
  // probably the real token with a stray character.
  const VALID = "glama_claim_" + "A".repeat(32);

  function captureWarnings(): string[] {
    const lines: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    return lines;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GLAMA_CLAIM_TOKEN;
  });

  it.each([
    ["a wrong prefix", "glama_token_" + "Z".repeat(32)],
    ["a trailing newline", VALID + "\n"],
  ])("warns once, without the value, for a token with %s", (_label, token) => {
    process.env.GLAMA_CLAIM_TOKEN = token;
    const lines = captureWarnings();

    auditGlamaClaimToken();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/GLAMA_CLAIM_TOKEN/);
    expect(lines[0]).toMatch(/glama\.json/);
    expect(lines[0]).toContain(GLAMA_CLAIM_TOKEN_PATTERN.source);
    expect(lines[0]).not.toContain(token.trim());
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["valid", VALID],
  ])("is silent when the token is %s", (_label, token) => {
    if (token !== undefined) process.env.GLAMA_CLAIM_TOKEN = token;
    const lines = captureWarnings();

    auditGlamaClaimToken();

    expect(lines).toEqual([]);
  });
});
