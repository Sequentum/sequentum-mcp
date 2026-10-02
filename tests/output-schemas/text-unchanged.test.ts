import { describe, expect, it } from "vitest";
import { CASES } from "./cases.js";
import { connect, textOf } from "./harness.js";

// Structured output adds structuredContent next to the text block, never instead of it. These snapshots
// were recorded from the handlers before that change and must not be updated (-u) as part of
// it: a diff here means a client that reads only the text would see a change.
describe("tool text output is unchanged", () => {
  it.each(CASES.map((c) => [c.id, c] as const))("%s", async (id, c) => {
    const client = await connect(c.api);
    const result = await client.callTool({ name: c.tool, arguments: c.args });
    expect(result.isError, textOf(result)).toBeFalsy();
    await expect(textOf(result)).toMatchFileSnapshot(`./__snapshots__/text/${id}.txt`);
    await client.close();
  });
});
