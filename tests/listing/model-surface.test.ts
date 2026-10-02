import { readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/client";
import { connect } from "../output-schemas/harness.js";
import { tools as registered } from "../../src/server/tools.js";

// Everything a client puts in front of the model before any tool runs: tool, prompt and resource
// listings plus the server instructions. Descriptions are the main prompt-injection surface and
// the directory review rejects behavioural wording, so every change to this text must show up as
// a reviewable diff. Unlike tests/output-schemas/__snapshots__, these files ARE meant to be
// updated (`npx vitest run tests/listing -u`) whenever wording changes on purpose; the diff in
// the pull request is the review. Descriptions are written raw, not JSON-escaped, so a one-word
// edit shows as a one-word diff.

const json = (value: unknown) => "```json\n" + JSON.stringify(value, null, 2) + "\n```";

let client: Client;
let listed: Awaited<ReturnType<Client["listTools"]>>["tools"];
beforeAll(async () => {
  client = await connect({});
  ({ tools: listed } = await client.listTools());
});
afterAll(async () => {
  await client.close();
});

describe("model-facing listing", () => {
  // One test per tool, so a run reports every drifted tool rather than stopping at the first.
  it.each(registered.map((t) => t.name))("tools/list: %s", async (name) => {
    const tool = listed.find((t) => t.name === name);
    expect(tool, `${name} is registered but not listed`).toBeDefined();
    const sections = [
      `# ${tool!.name}`,
      `Title: ${tool!.title ?? "(none)"}`,
      `## Annotations\n\n${json(tool!.annotations ?? {})}`,
      `## Description\n\n${tool!.description ?? "(none)"}`,
      `## inputSchema\n\n${json(tool!.inputSchema)}`,
      `## outputSchema\n\n${tool!.outputSchema ? json(tool!.outputSchema) : "(none)"}`,
    ];
    await expect(sections.join("\n\n") + "\n").toMatchFileSnapshot(`./__snapshots__/tools/${name}.md`);
  });

  // toMatchFileSnapshot never reports, and -u never deletes, a file no test writes any more, so a
  // removed or renamed tool would leave its old snapshot behind. Delete such files by hand. Only
  // stray files are checked here: new snapshot files are written after the test file finishes, so a
  // -u run that adds a tool would not see its file yet, and in CI the tool's own case above already
  // fails when its file is missing.
  it("tools/list leaves no snapshot file for a tool it no longer lists", () => {
    const names = new Set(listed.map((t) => `${t.name}.md`));
    const files = readdirSync(new URL("./__snapshots__/tools/", import.meta.url)).filter((f) => f.endsWith(".md"));
    expect(files.filter((f) => !names.has(f))).toEqual([]);
  });

  it("prompts/list", async () => {
    const { prompts } = await client.listPrompts();
    const body = prompts.map((p) => {
      const args = (p.arguments ?? []).map(
        (a) => `- \`${a.name}\`${a.required ? " (required)" : ""}: ${a.description ?? "(none)"}`
      );
      return [`## ${p.name}`, p.description ?? "(none)", args.length ? args.join("\n") : "Arguments: (none)"].join("\n\n");
    });
    await expect(["# Prompts", ...body].join("\n\n") + "\n").toMatchFileSnapshot("./__snapshots__/prompts.md");
  });

  it("resources/list and resources/templates/list", async () => {
    const { resources } = await client.listResources();
    const { resourceTemplates } = await client.listResourceTemplates();
    const entry = (name: string, uri: string, mimeType: string | undefined, description: string | undefined) =>
      [`## ${name}`, `URI: \`${uri}\``, `MIME type: ${mimeType ?? "(none)"}`, description ?? "(none)"].join("\n\n");
    const body = [
      "# Resources",
      ...resources.map((r) => entry(r.name, r.uri, r.mimeType, r.description)),
      "# Resource templates",
      ...resourceTemplates.map((t) => entry(t.name, t.uriTemplate, t.mimeType, t.description)),
    ];
    await expect(body.join("\n\n") + "\n").toMatchFileSnapshot("./__snapshots__/resources.md");
  });

  it("server instructions", async () => {
    await expect(`${client.getInstructions() ?? "(none)"}\n`).toMatchFileSnapshot("./__snapshots__/instructions.md");
  });
});
