import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { installUnhandledRejectionLogger } from "./process-guards.js";

describe("installUnhandledRejectionLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs an unhandled rejection and does not exit", () => {
    const proc = new EventEmitter();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const reason = new TypeError("Invalid URL");

    installUnhandledRejectionLogger(proc);
    proc.emit("unhandledRejection", reason, Promise.resolve());

    expect(log).toHaveBeenCalledWith(expect.stringContaining("Unhandled promise rejection"), reason);
    expect(exit).not.toHaveBeenCalled();
  });

  it("registers a listener, which is what stops Node from exiting on the rejection", () => {
    // Node's default --unhandled-rejections=throw only crashes when no listener exists.
    const proc = new EventEmitter();
    installUnhandledRejectionLogger(proc);
    expect(proc.listenerCount("unhandledRejection")).toBe(1);
  });
});
