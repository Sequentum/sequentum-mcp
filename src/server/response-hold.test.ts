import { afterEach, describe, expect, it, vi } from "vitest";
import { holdUntilFirstFrame } from "./response-hold.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

interface ControlledSource {
  stream: ReadableStream<Uint8Array>;
  push(text: string): void;
  close(): void;
  fail(error: unknown): void;
  cancel: ReturnType<typeof vi.fn>;
  /** How many times a reader found the queue empty and had to wait. */
  readonly waits: number;
}

/**
 * A source stream the test drives chunk by chunk. With a zero high-water mark
 * the stream calls `pull` only when a reader is waiting on an empty queue, so
 * `waits` turns "the hold has consumed everything and wants more" into a
 * signal a test can wait on instead of sleeping.
 */
function controlledSource(): ControlledSource {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let waits = 0;
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>(
    {
      start(c) {
        controller = c;
      },
      pull() {
        waits += 1;
      },
      cancel(reason) {
        cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
  return {
    stream,
    push: (text) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
    fail: (error) => controller.error(error),
    cancel,
    get waits() {
      return waits;
    },
  };
}

/** Resolve once the hold has drained the source's queue and is waiting for more. */
async function untilHoldWaits(source: ControlledSource): Promise<void> {
  await vi.waitFor(() => expect(source.waits).toBeGreaterThan(0));
}

/** Track whether a promise has settled, without awaiting it. */
function track<T>(promise: Promise<T>): { readonly settled: boolean } {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  return {
    get settled() {
      return settled;
    },
  };
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream", "x-test": "kept" },
  });
}

const RESULT_EVENT = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n';

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Non-SSE responses
// ---------------------------------------------------------------------------

describe("holdUntilFirstFrame (non-SSE)", () => {
  it("returns revoked for a flagged JSON response", async () => {
    const source = controlledSource();
    source.push('{"jsonrpc":"2.0","id":1,"result":{}}');
    const response = new Response(source.stream, {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    const outcome = await holdUntilFirstFrame(response, () => true, 5000);

    expect(outcome).toEqual({ kind: "revoked" });
    await vi.waitFor(() => expect(source.cancel).toHaveBeenCalled());
  });

  it("commits an unflagged JSON response untouched", async () => {
    const response = new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    const outcome = await holdUntilFirstFrame(response, () => false, 5000);

    expect(outcome.kind).toBe("commit");
    if (outcome.kind === "commit") expect(outcome.response).toBe(response);
  });
});

// ---------------------------------------------------------------------------
// SSE responses
// ---------------------------------------------------------------------------

describe("holdUntilFirstFrame (SSE)", () => {
  it("waits past a priming event and keep-alive comments", async () => {
    const source = controlledSource();
    let revoked = false;
    source.push("id: 1\ndata:\n\n");
    source.push(": keep-alive\n\n");

    const pending = holdUntilFirstFrame(sseResponse(source.stream), () => revoked, 5000);
    const status = track(pending);
    await untilHoldWaits(source);
    expect(status.settled).toBe(false);

    revoked = true;
    source.push(RESULT_EVENT);

    expect(await pending).toEqual({ kind: "revoked" });
    await vi.waitFor(() => expect(source.cancel).toHaveBeenCalled());
  });

  it.each([
    ["LF", 'data: {"a":1}\n', "\n"],
    ["CRLF", 'data: {"a":1}\r\n', "\r\n"],
  ])("waits for the blank line when an event is split before it (%s)", async (_name, head, blankLine) => {
    const source = controlledSource();
    let revoked = false;
    source.push(head);

    const pending = holdUntilFirstFrame(sseResponse(source.stream), () => revoked, 5000);
    const status = track(pending);
    await untilHoldWaits(source);
    expect(status.settled).toBe(false);

    // Deciding before the blank line would have committed; the flag is only set now.
    revoked = true;
    source.push(blankLine);

    expect(await pending).toEqual({ kind: "revoked" });
  });

  it("holds past the first frame until end of stream with untilEnd", async () => {
    const source = controlledSource();
    let revoked = false;
    source.push(RESULT_EVENT);

    const pending = holdUntilFirstFrame(sseResponse(source.stream), () => revoked, 5000, { untilEnd: true });
    const status = track(pending);
    await untilHoldWaits(source);
    expect(status.settled).toBe(false);

    // A later result in the same batch is the one that ran into the revocation.
    revoked = true;
    source.push(RESULT_EVENT);
    source.close();

    expect(await pending).toEqual({ kind: "revoked" });
  });

  it("replays split chunks verbatim", async () => {
    const source = controlledSource();
    const chunks = ["event: mess", 'age\ndata: {"a"', ":1}\n\n", "tail"];
    const response = sseResponse(source.stream);
    for (const chunk of chunks.slice(0, 3)) source.push(chunk);

    const outcome = await holdUntilFirstFrame(response, () => false, 5000);
    expect(outcome.kind).toBe("commit");
    if (outcome.kind !== "commit") return;

    source.push(chunks[3]);
    source.close();

    expect(outcome.response.status).toBe(200);
    expect([...outcome.response.headers]).toEqual([...response.headers]);
    expect(await outcome.response.text()).toBe(chunks.join(""));
  });

  it("stays committed when the flag is set after the first frame", async () => {
    const source = controlledSource();
    let revoked = false;
    source.push(RESULT_EVENT);

    const outcome = await holdUntilFirstFrame(sseResponse(source.stream), () => revoked, 5000);
    expect(outcome.kind).toBe("commit");
    if (outcome.kind !== "commit") return;

    // A revocation the request learns of later, e.g. while a tool streams progress.
    revoked = true;
    source.push("data: late\n\n");
    source.close();

    expect(await outcome.response.text()).toBe(`${RESULT_EVENT}data: late\n\n`);
    expect(source.cancel).not.toHaveBeenCalled();
  });

  it("detects a frame delimited by CRLF blank lines", async () => {
    const source = controlledSource();
    source.push('data: {"a":1}\r\n\r\n');

    const outcome = await holdUntilFirstFrame(sseResponse(source.stream), () => true, 5000);

    expect(outcome).toEqual({ kind: "revoked" });
  });

  it("commits at end of stream with no frame", async () => {
    const source = controlledSource();
    source.push(": keep-alive\n\n");
    source.close();

    const outcome = await holdUntilFirstFrame(sseResponse(source.stream), () => false, 5000);

    expect(outcome.kind).toBe("commit");
    if (outcome.kind !== "commit") return;
    expect(await outcome.response.text()).toBe(": keep-alive\n\n");
  });

  it("returns revoked at end of stream when flagged", async () => {
    const source = controlledSource();
    source.push(": keep-alive\n\n");
    source.close();

    const outcome = await holdUntilFirstFrame(sseResponse(source.stream), () => true, 5000);

    expect(outcome).toEqual({ kind: "revoked" });
  });

  it("surfaces a source error to the committed body after replaying buffered bytes", async () => {
    const source = controlledSource();
    source.push(": keep-alive\n\n");

    const pending = holdUntilFirstFrame(sseResponse(source.stream), () => false, 5000);
    // Erroring a stream drops its queued chunks, so fail only once the hold has
    // taken the keep-alive and is waiting for more.
    await untilHoldWaits(source);
    source.fail(new Error("upstream broke"));
    const outcome = await pending;

    expect(outcome.kind).toBe("commit");
    if (outcome.kind !== "commit") return;
    const reader = outcome.response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe(": keep-alive\n\n");
    await expect(reader.read()).rejects.toThrow("upstream broke");
  });

  it("returns revoked when the source errors while flagged", async () => {
    const source = controlledSource();
    source.fail(new Error("upstream broke"));

    const outcome = await holdUntilFirstFrame(sseResponse(source.stream), () => true, 5000);

    expect(outcome).toEqual({ kind: "revoked" });
  });

  it("returns revoked at the cap", async () => {
    vi.useFakeTimers();
    const source = controlledSource();

    const pending = holdUntilFirstFrame(sseResponse(source.stream), () => true, 5000);
    await vi.advanceTimersByTimeAsync(5000);

    expect(await pending).toEqual({ kind: "revoked" });
    expect(source.cancel).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("commits after the cap", async () => {
    vi.useFakeTimers();
    const source = controlledSource();

    const pending = holdUntilFirstFrame(sseResponse(source.stream), () => false, 5000);
    await vi.advanceTimersByTimeAsync(5000);
    const outcome = await pending;

    expect(outcome.kind).toBe("commit");
    if (outcome.kind !== "commit") return;
    expect(vi.getTimerCount()).toBe(0);

    source.push("data: late\n\n");
    source.push("data: later\n\n");
    source.close();
    expect(await outcome.response.text()).toBe("data: late\n\ndata: later\n\n");
  });

  it("propagates cancel to the source stream", async () => {
    const source = controlledSource();
    source.push(RESULT_EVENT);

    const outcome = await holdUntilFirstFrame(sseResponse(source.stream), () => false, 5000);
    expect(outcome.kind).toBe("commit");
    if (outcome.kind !== "commit") return;

    await outcome.response.body!.cancel("client went away");

    expect(source.cancel).toHaveBeenCalledWith("client went away");
  });

  it("clears the cap timer on an early decision", async () => {
    vi.useFakeTimers();
    const source = controlledSource();
    source.push(RESULT_EVENT);

    const outcome = await holdUntilFirstFrame(sseResponse(source.stream), () => false, 5000);

    expect(outcome.kind).toBe("commit");
    expect(vi.getTimerCount()).toBe(0);
  });
});
