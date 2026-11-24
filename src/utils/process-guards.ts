import type { EventEmitter } from "node:events";

/**
 * Last-resort guard: log a promise rejection nothing handled, and keep serving.
 *
 * Node 24 exits on an unhandled rejection by default, so a single request reaching an
 * async path without a `catch` (Express 4 drops the promise an async handler returns)
 * took the whole task down with every in-flight request on it. The routes
 * handle their own errors; this only stops a future slip from becoming a denial of
 * service. Registering any listener is what disables Node's default crash.
 *
 * Only rejections: a synchronous `uncaughtException` leaves the process in an undefined
 * state, so that still crashes and the orchestrator restarts the task.
 *
 * Installed from the entry point, never from `startHttpServer`, so the test runner's own
 * unhandled-rejection reporting stays intact. `proc` is injectable for tests.
 */
export function installUnhandledRejectionLogger(proc: EventEmitter = process): void {
  proc.on("unhandledRejection", (reason: unknown) => {
    console.error("[MCP] Unhandled promise rejection (process kept alive):", reason);
  });
}
