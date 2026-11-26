import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadWorkflowSkills,
  REFERENCE_SKILLS,
  SKILLS_ROOT,
  skillBody,
  type WorkflowSkills,
} from "./skills.js";
import { AGENT_BUILD_STATUS_BRANCHES, prompts } from "./prompts.js";
import { tools } from "./tools.js";
import {
  ENCRYPTED_INPUT_PARAMETER_NOTE,
  PROMPT_HANDLING_POLICY,
  SCHEDULE_UPDATE_REPLACES_WARNING,
} from "./policies.js";
import { AGENT_BUILD_MAX_WAIT_LABEL } from "./constants.js";

const made: string[] = [];

function skillMd(name: string): string {
  return `---\nname: ${name}\ndescription: Use when testing ${name} with Sequentum\n---\n\n# ${name}\nbody of ${name}\n`;
}

function fixture(skills: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "skills-test-"));
  made.push(dir);
  for (const [folder, md] of Object.entries(skills)) {
    mkdirSync(join(dir, folder));
    writeFileSync(join(dir, folder, "SKILL.md"), md);
  }
  return dir;
}

afterEach(() => {
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});

describe("skillBody", () => {
  it("strips the frontmatter block and leading blank lines", () => {
    expect(skillBody("---\nname: a\ndescription: d\n---\n\n# T\nbody\n")).toBe("# T\nbody\n");
  });

  it("returns text without frontmatter unchanged", () => {
    expect(skillBody("# T\nbody\n")).toBe("# T\nbody\n");
  });
});

describe("loadWorkflowSkills", () => {
  it("loads a folder whose skills match the prompt names", async () => {
    const dir = fixture({ a: skillMd("a"), b: skillMd("b") });
    const { catalog, bodies } = await loadWorkflowSkills(dir, ["a", "b"], []);
    expect(catalog.entries.length).toBe(2);
    expect(bodies.get("a")).toBe("# a\nbody of a\n");
  });

  it("rejects an empty folder", async () => {
    const dir = fixture({});
    await expect(loadWorkflowSkills(dir, ["a"], [])).rejects.toThrow(/no skills/i);
  });

  it("rejects a prompt without a skill", async () => {
    const dir = fixture({ a: skillMd("a") });
    await expect(loadWorkflowSkills(dir, ["a", "b"], [])).rejects.toThrow(/\bb\b/);
  });

  it("rejects a skill that is neither a prompt nor a reference skill", async () => {
    const dir = fixture({ a: skillMd("a"), c: skillMd("c") });
    await expect(loadWorkflowSkills(dir, ["a"], [])).rejects.toThrow(/\bc\b/);
    const { catalog } = await loadWorkflowSkills(dir, ["a"], ["c"]);
    expect(catalog.entries.length).toBe(2);
  });

  it("rejects a reference skill that is also a prompt name", async () => {
    const dir = fixture({ a: skillMd("a") });
    await expect(loadWorkflowSkills(dir, ["a"], ["a"])).rejects.toThrow(/\ba\b/);
  });

  it("rejects an invalid SKILL.md under strict mode", async () => {
    const dir = fixture({ x: skillMd("y") });
    await expect(loadWorkflowSkills(dir, ["x"], [])).rejects.toThrow();
  });
});

describe("the workflow skills under SKILLS_ROOT", () => {
  // Tokens that look like tool names (a known verb prefix plus snake_case) but are not tools.
  // Keep this empty unless a skill truly needs such a word; prefer rewording the skill.
  const NOT_TOOL_NAMES: readonly string[] = [];
  const TOOL_VERB = /^(?:get|list|search|start|stop|kill|delete|create|update|enable|disable|restore|run)_/;

  let skills: WorkflowSkills;
  beforeAll(async () => {
    skills = await loadWorkflowSkills();
  });

  const names = () => skills.catalog.entries.map((e) => e.frontmatter.name);

  it("serves one skill per prompt plus the reference skills", () => {
    expect([...names()].sort()).toEqual([...prompts.map((p) => p.name), ...REFERENCE_SKILLS].sort());
    expect(names()).toHaveLength(16);
  });

  /** Every skill folder's raw SKILL.md, frontmatter included: the description is served too. */
  const rawSkillFiles = (): [string, string][] =>
    readdirSync(SKILLS_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => [entry.name, readFileSync(join(SKILLS_ROOT, entry.name, "SKILL.md"), "utf8")]);

  it("no skill contains internal identifiers", () => {
    const patterns = [
      /\b(SE4|IT)-\d+\b/,
      /[a-z0-9-]+-qa\.sequentum\.com/,
      /\.internal\b/,
      /[$€£]\s?\d/,
      /\b\d+\s*requests?\s*(per|\/)\s*\d*\s*(s|sec|second|min|minute)\b/i,
    ];
    for (const [folder, raw] of rawSkillFiles()) {
      for (const pattern of patterns) expect(raw, `${folder}: ${pattern}`).not.toMatch(pattern);
    }
  });

  it("no skill names a price in credits", () => {
    const files = rawSkillFiles();
    expect(files.map(([folder]) => folder)).toContain("credit-usage");
    for (const [folder, raw] of files) expect(raw, folder).not.toMatch(/\d+(\.\d+)?\s*credits?\b/i);
  });

  it('every description starts with "Use when", names Sequentum, and is at most 1024 chars', () => {
    for (const entry of skills.catalog.entries) {
      const { name, description } = entry.frontmatter;
      expect(description, name).toMatch(/^Use when /);
      expect(description, name).toContain("Sequentum");
      expect(description.length, name).toBeLessThanOrEqual(1024);
    }
  });

  it("every skill is within SKILL_LIMITS", async () => {
    // loadWorkflowSkills loads with strict: true and the default limits, so an oversized
    // or malformed skill rejects here.
    await expect(loadWorkflowSkills()).resolves.toBeDefined();
    for (const folder of readdirSync(SKILLS_ROOT)) {
      expect(readdirSync(join(SKILLS_ROOT, folder)), folder).toEqual(["SKILL.md"]);
    }
  });

  it("every snake_case tool name a skill mentions is a registered tool", () => {
    const registered = new Set(tools.map((t) => t.name));
    for (const [name, body] of skills.bodies) {
      const mentioned = [...body.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)].map((m) => m[0]);
      const unknown = mentioned.filter(
        (token) => TOOL_VERB.test(token) && !registered.has(token) && !NOT_TOOL_NAMES.includes(token),
      );
      expect(unknown, name).toEqual([]);
    }
  });

  it("build-agent-from-prompt contains the prompt-handling policy, the wait label and the status branches verbatim", () => {
    const body = skills.bodies.get("build-agent-from-prompt")!;
    expect(body).toContain(`**GUARDRAIL:** ${PROMPT_HANDLING_POLICY}`);
    expect(body).toContain(`up to ~${AGENT_BUILD_MAX_WAIT_LABEL}`);
    expect(body).toContain(AGENT_BUILD_STATUS_BRANCHES);
  });

  it("inspect-agent-draft contains the status branches verbatim", () => {
    expect(skills.bodies.get("inspect-agent-draft")!).toContain(AGENT_BUILD_STATUS_BRANCHES);
  });

  it("debug-agent and compare-runs treat possibleCauses as hints", () => {
    for (const name of ["debug-agent", "compare-runs"]) {
      const body = skills.bodies.get(name)!;
      expect(body, name).toMatch(/`possibleCauses` as hints from a keyword match/);
      expect(body, name).toContain("`errorMessage`");
    }
  });
});

describe("tool-description safety warnings", () => {
  const description = (name: string) => tools.find((t) => t.name === name)!.description;
  const skillText = (name: string) => readFileSync(join(SKILLS_ROOT, name, "SKILL.md"), "utf8");

  it("update_agent_schedule carries SCHEDULE_UPDATE_REPLACES_WARNING", () => {
    expect(description("update_agent_schedule")).toContain(SCHEDULE_UPDATE_REPLACES_WARNING);
  });

  it.each(["start_agent", "create_agent_schedule", "update_agent_schedule", "run_space_agents"])(
    "%s carries ENCRYPTED_INPUT_PARAMETER_NOTE",
    (name) => {
      expect(description(name)).toContain(ENCRYPTED_INPUT_PARAMETER_NOTE);
    },
  );

  it("keeps PRE_CALL_CHECK last where a tool has it", () => {
    for (const name of ["start_agent", "run_space_agents"]) {
      expect(description(name).endsWith("supplying an invented value."), name).toBe(true);
    }
  });

  it("the skills carry the same rules, so neither home is the only one", () => {
    const inputs = skillText("run-inputs");
    expect(inputs).toContain("`?`");
    expect(inputs).toContain("clear text");
    const schedule = skillText("schedule-editing");
    expect(schedule).toContain("get_agent_schedule");
    expect(schedule).toContain("An update replaces the whole schedule");
  });
});
