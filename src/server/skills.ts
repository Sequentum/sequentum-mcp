/**
 * Workflow skills
 *
 * Loads the SKILL.md folders under `skills/` into an SDK skill catalog and
 * checks them against the workflow prompts, so a prompt and its skill can
 * never drift apart unnoticed at startup.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillCatalog } from "@modelcontextprotocol/server/ext/skills";
import { loadSkills } from "@modelcontextprotocol/server/ext/skills/node";
import { prompts } from "./prompts.js";

export const SKILLS_ROOT: string = fileURLToPath(new URL("../../skills/", import.meta.url));

/** Skills that are served but have no matching prompt. */
export const REFERENCE_SKILLS: readonly string[] = [
  "credit-usage",
  "run-inputs",
  "run-outcomes",
  "run-troubleshooting",
  "schedule-editing",
];

export interface WorkflowSkills {
  catalog: SkillCatalog;
  /** Skill name -> SKILL.md content without the frontmatter. */
  bodies: ReadonlyMap<string, string>;
}

/**
 * Removes a leading frontmatter block and the blank lines after it. A leading byte order
 * mark goes with it, as the SDK's own parser drops one before reading the frontmatter.
 */
export function skillBody(markdown: string): string {
  if (markdown.startsWith("\uFEFF")) markdown = markdown.slice(1);
  const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown);
  if (!match) return markdown;
  return markdown.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, "");
}

export async function loadWorkflowSkills(
  root: string = SKILLS_ROOT,
  promptNames: readonly string[] = prompts.map((p) => p.name),
  referenceSkills: readonly string[] = REFERENCE_SKILLS,
): Promise<WorkflowSkills> {
  const catalog = await loadSkills(root, { strict: true });
  const names = catalog.entries.map((entry) => entry.frontmatter.name);

  if (names.length === 0) {
    throw new Error(`No skills found under ${root}`);
  }

  const skillSet = new Set(names);
  const missing = promptNames.filter((name) => !skillSet.has(name));
  if (missing.length > 0) {
    throw new Error(`Prompts without a skill: ${missing.join(", ")}`);
  }

  const missingReference = referenceSkills.filter((name) => !skillSet.has(name));
  if (missingReference.length > 0) {
    throw new Error(`Reference skills without a skill: ${missingReference.join(", ")}`);
  }

  const promptSet = new Set(promptNames);
  const overlap = referenceSkills.filter((name) => promptSet.has(name));
  if (overlap.length > 0) {
    throw new Error(`Reference skills that are also prompt names: ${overlap.join(", ")}`);
  }

  const allowed = new Set([...promptNames, ...referenceSkills]);
  const unexpected = names.filter((name) => !allowed.has(name));
  if (unexpected.length > 0) {
    throw new Error(
      `Skills that are neither a prompt nor a reference skill: ${unexpected.join(", ")}`,
    );
  }

  const bodies = new Map<string, string>();
  for (const name of names) {
    bodies.set(name, skillBody(readFileSync(join(root, name, "SKILL.md"), "utf8")));
  }
  return { catalog, bodies };
}
