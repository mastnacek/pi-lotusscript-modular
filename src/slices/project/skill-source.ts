/**
 * Location of the bundled entry skill.
 *
 * The skill ships INSIDE the package (`skills/lotusscript-modular/SKILL.md`), so
 * `pi update` delivers it together with the code that points at it — the path
 * can never drift from the installed version. Same rule as the scaffold
 * template: edit in the development repo, never in the installed checkout.
 *
 * `hasEntrySkill()` is checked before advertising the path, so a package that
 * was trimmed (or a checkout missing the skill) degrades to no hint instead of
 * handing the model a dead path.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENTRY_SKILL_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "skills",
  "lotusscript-modular",
  "SKILL.md"
);

/** Absolute path of the entry skill shipped with the installed plugin. */
export function getEntrySkillPath(): string {
  return ENTRY_SKILL_PATH;
}

/** True when the entry skill is actually on disk (never advertise a dead path). */
export function hasEntrySkill(): boolean {
  try {
    return fs.existsSync(ENTRY_SKILL_PATH);
  } catch {
    return false;
  }
}

/**
 * The skill body, or null when it cannot be read.
 * Consent has already been given when this is called; a broken package must
 * degrade to "nothing loaded", never to a thrown error at startup.
 */
export function readEntrySkillBody(): string | null {
  try {
    return fs.readFileSync(ENTRY_SKILL_PATH, "utf-8");
  } catch {
    return null;
  }
}
