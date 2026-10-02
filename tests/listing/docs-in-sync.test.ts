import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tools } from "../../src/server/tools.js";
import { prompts } from "../../src/server/prompts.js";

// The reference docs state a count in their opening line and give each entry its own `### <name>`
// section. Both drift silently when a tool or prompt is added, so pin them to the registered tables.
// Only single-word `###` headings count as entries: multi-word ones such as `### Run Status Values`
// in tool-reference.md are reference sections, not tools, so a new one-word `###` heading that is
// not a registered name fails this test.
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const headings = (doc: string) => [...doc.matchAll(/^### (\S+)\s*$/gm)].map((m) => m[1]);

describe.each([
  { doc: "docs/tool-reference.md", noun: "tools", names: tools.map((t) => t.name) },
  { doc: "docs/prompts-reference.md", noun: "prompts", names: prompts.map((p) => p.name) },
])("$doc", ({ doc, noun, names }) => {
  const text = read(doc);

  it(`states the registered number of ${noun}`, () => {
    const stated = text.match(new RegExp(`provides (\\d+) ${noun}\\b`))?.[1];
    expect(stated, `no "provides N ${noun}" line`).toBeDefined();
    expect(Number(stated)).toBe(names.length);
  });

  it(`has a section for every registered ${noun.slice(0, -1)}, and none for unregistered ones`, () => {
    expect(headings(text).sort()).toEqual([...names].sort());
  });
});
