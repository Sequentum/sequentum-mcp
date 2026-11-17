/**
 * Hold an MCP HTTP response until it is safe to decide whether the request's
 * upstream credential was revoked, then either drop it (so the caller can
 * answer 401) or replay it untouched.
 *
 * For older-protocol clients the SDK returns a `text/event-stream` Response
 * before the tool has run, so the decision has to wait for the first event that
 * carries data. Everything read while holding is kept as the original byte
 * chunks and replayed verbatim; decoding is only used to find event boundaries.
 */

export type HoldOutcome = { kind: "revoked" } | { kind: "commit"; response: Response };

type ReadResult = ReadableStreamReadResult<Uint8Array>;

const noop = (): void => {};

/** Blank line ending one SSE event: LF LF or CRLF CRLF. */
const EVENT_DELIMITER = /\r?\n\r?\n/;
const LINE_DELIMITER = /\r?\n/;
const DATA_LINE = /^data:\s*\S/;

function isEventStream(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.split(";")[0].trim().toLowerCase() === "text/event-stream";
}

/** True when the SSE event has at least one `data:` line with content. */
function eventCarriesData(event: string): boolean {
  return event.split(LINE_DELIMITER).some((line) => DATA_LINE.test(line));
}

export interface HoldOptions {
  /**
   * Hold past the first event, until end of stream or the cap. Used for a batched
   * POST, whose first result may need no upstream call and so arrive before a later
   * request in the batch learns that the token was revoked.
   */
  untilEnd?: boolean;
}

/**
 * Resolve once it is safe to decide: immediately for a non-SSE response; for
 * text/event-stream, at the first event with non-empty `data:` (unless
 * `untilEnd`), at end of stream, or after capMs. Returns "revoked" iff
 * isRevoked() is true at that moment (the source body is then cancelled).
 * Otherwise returns a Response with the original status/headers whose body
 * replays every byte read so far, then pipes the rest.
 */
export async function holdUntilFirstFrame(
  response: Response,
  isRevoked: () => boolean,
  capMs: number,
  options: HoldOptions = {},
): Promise<HoldOutcome> {
  if (!isEventStream(response) || response.body === null) {
    if (!isRevoked()) return { kind: "commit", response };
    response.body?.cancel().catch(noop);
    return { kind: "revoked" };
  }

  const reader = response.body.getReader();
  const buffered: Uint8Array[] = [];
  const decoder = new TextDecoder();
  // Decoded text after the last complete event; only incomplete events stay here.
  let partial = "";
  let ended = false;
  let failure: { error: unknown } | undefined;
  // A read started while holding that had not settled when the cap expired.
  // The committed body must consume it first so no chunk is lost or reordered.
  let inflight: Promise<ReadResult> | undefined;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const capExpired = new Promise<"cap">((resolve) => {
    timer = setTimeout(() => resolve("cap"), capMs);
  });

  try {
    for (;;) {
      inflight ??= reader.read();
      const result = await Promise.race([inflight, capExpired]);
      if (result === "cap") {
        // Keep the read for the committed body; never let it reject unhandled.
        inflight.catch(noop);
        break;
      }
      inflight = undefined;
      if (result.done) {
        ended = true;
        break;
      }
      buffered.push(result.value);
      const events = (partial + decoder.decode(result.value, { stream: true })).split(EVENT_DELIMITER);
      partial = events.pop() ?? "";
      if (!options.untilEnd && events.some(eventCarriesData)) break;
    }
  } catch (error) {
    inflight = undefined;
    failure = { error };
  } finally {
    clearTimeout(timer);
  }

  if (isRevoked()) {
    reader.cancel().catch(noop);
    return { kind: "revoked" };
  }

  const body = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const chunk = buffered.shift();
        if (chunk !== undefined) {
          controller.enqueue(chunk);
          return;
        }
        if (ended) {
          controller.close();
          return;
        }
        if (failure !== undefined) {
          controller.error(failure.error);
          return;
        }
        const read = inflight ?? reader.read();
        inflight = undefined;
        try {
          const result = await read;
          if (result.done) controller.close();
          else controller.enqueue(result.value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    },
    // Pull only when the consumer asks, so the client's pace reaches the source.
    { highWaterMark: 0 },
  );

  return {
    kind: "commit",
    response: new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
  };
}
