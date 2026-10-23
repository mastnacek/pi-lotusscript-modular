/**
 * Versioning slice — model-facing notices (English, per the skill language
 * policy: tool-result content is read by the agent, not by the user).
 *
 * Every notice carries the two things the agent needs to act without a
 * follow-up question: a ready-to-paste template and the reference that
 * explains the bump policy.
 */

import { suggestNextVersion } from "./header.js";

/** Reference that owns the rules; keep in sync with the SKILL.md router row. */
export const VERSIONING_REFERENCE =
  "skills/lotusscript-modular/references/libraries-and-versioning.md (§3 Versioning in the file header)";

export function missingNotice(fileName: string): string {
  return [
    "",
    "",
    `🔖 [LotusScript: Versioning] **${fileName} has no version header.**`,
    "Add it in (Declarations), above the first procedure:",
    "",
    "```lotusscript",
    "' VERZE: 1.0",
    "' CHANGELOG:",
    "'   1.0 (YYYY-MM-DD) - first recorded version",
    "```",
    "",
    `Rules (bump kind, what a changelog line must say): ${VERSIONING_REFERENCE}`,
  ].join("\n");
}

export function unchangedNotice(fileName: string, version: string): string {
  const next = suggestNextVersion(version);
  return [
    "",
    "",
    `🔖 [LotusScript: Versioning] **${fileName} was edited but its header still says ${version}.**`,
    "Record the change for callers:",
    "",
    "```lotusscript",
    `' VERZE: ${next}`,
    "' CHANGELOG:",
    `'   ${next} (YYYY-MM-DD) - <what changed for callers>`,
    "```",
    "",
    `If this edit was comment/whitespace only, ignore this notice. Bump policy: ${VERSIONING_REFERENCE}`,
  ].join("\n");
}
