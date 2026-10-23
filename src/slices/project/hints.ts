/**
 * Model-facing hint text for the project slice — English by contract
 * (pi-plugin-dev §10: the model reads instructions, users read i18n copy).
 *
 * Two audiences, two shapes:
 * - `buildProjectSkillGuideline` → one paragraph in the system prompt
 *   (`before_agent_start`), only when the bounded scan found evidence.
 * - `buildReadSkillNotice` → a short block inside the `.lss` read banner, which
 *   fires at the exact moment the model is about to work on a script.
 *
 * Both are pure: existence of the skill file is resolved by the caller
 * (`hasEntrySkill`), so these functions can be unit-tested without a filesystem.
 */

import type { ProjectFingerprint } from "../../shared/types.js";

const KIND_LABEL: Record<NonNullable<ProjectFingerprint["kind"]>, string> = {
  lss: "LotusScript agent/library",
  dxl: "DXL design element",
  formula: "formula artifact",
  loose: "loose LotusScript dump",
};

/**
 * Entry-skill routing guideline for the system prompt.
 * Returns null outside Domino projects — the prompt must not carry a LotusScript
 * manual reference into an unrelated repository.
 */
export function buildProjectSkillGuideline(
  fingerprint: ProjectFingerprint,
  skillPath: string
): string | null {
  if (!fingerprint.hasLotusScript) return null;

  const kind = KIND_LABEL[fingerprint.kind ?? "lss"];
  const sample = fingerprint.sampleFile ?? "<project root>";

  return [
    `LOTUSSCRIPT PROJECT DETECTED (${kind}): this working directory contains Domino sources, e.g. \`${sample}\`.`,
    `The operating manual is the entry skill at \`${skillPath}\` — read it before writing or editing anything here.`,
    "It starts with context detection (reuse ladder: find the existing agent, view, form, formula or library that already does the job before writing a new one),",
    "then the whole-file workflow, coding conventions, the Notes object model and the gotcha index.",
    "Do not guess Domino 9.0.1 API members, view/formula semantics or project structure.",
  ].join(" ");
}

/**
 * Entry-skill pointer for the `.lss` read banner — the moment of highest
 * relevance, where the model has one script in front of it and a choice of
 * references to open.
 */
export function buildReadSkillNotice(skillPath: string): string {
  return [
    `🧩 ENTRY SKILL: ${skillPath}`,
    "  Read it before editing this file: whole-file workflow, coding conventions,",
    "  object model, and the reuse ladder (check whether the element already exists).",
  ].join("\n");
}
