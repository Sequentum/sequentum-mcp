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
import { handleOpenAIChallenge, jsonRpcErrorMiddleware, parseTrustProxy } from "./http-server.js";

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

  it("includes the error message when NODE_ENV is not production", () => {
    process.env.NODE_ENV = "development";
    const res = mockResponse();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    jsonRpcErrorMiddleware(new Error("boom, detailed cause"), {} as Request, res, vi.fn() as NextFunction);

    expect((res.body as { error: { message: string } }).error.message).toBe("boom, detailed cause");
    spy.mockRestore();
  });

  it("suppresses the error message when NODE_ENV is production", () => {
    process.env.NODE_ENV = "production";
    const res = mockResponse();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    jsonRpcErrorMiddleware(new Error("boom, detailed cause"), {} as Request, res, vi.fn() as NextFunction);

    const message = (res.body as { error: { message: string } }).error.message;
    expect(message).not.toContain("boom, detailed cause");
    expect(message).toBe("Internal server error");
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
