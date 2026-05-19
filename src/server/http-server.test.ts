/**
 * HTTP server integration tests.
 *
 * These tests spin up a real Express server on an OS-assigned port and make
 * actual HTTP requests so we can verify the route registration and response
 * headers, not just the handler logic in isolation.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "http";
import express from "express";
import { handleOpenAIChallenge } from "./http-server.js";

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
