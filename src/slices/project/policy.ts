/**
 * Skill-prompt policy — pure decisions, no UI and no filesystem.
 *
 * The operator decides once per project (mirroring the PowerShell profile's
 * `y / n / never` prompt for uv environments): the choice is persisted as the
 * `skillPrompt` setting, so a project that answered "never" is never asked
 * again until the setting is changed back to `ask`.
 *
 * Keeping this pure is what makes the modal testable: the component renders,
 * this decides, the composition root wires the two.
 */

import type { ModularConfig, ProjectFingerprint, SkillPromptChoice, SkillPromptMode } from "../../shared/types.js";

/** What the session should do before the first run. */
export type SkillPromptDecision = "ask" | "load" | "skip";

/**
 * Evidence + setting → decision. `ask` is returned only when the setting is
 * `ask` AND there is something to offer; a non-Domino workspace is always
 * silent, even with `always`, because there is no relevant skill.
 */
export function skillPromptDecision(
  fingerprint: ProjectFingerprint,
  config: Pick<ModularConfig, "skillPrompt">
): SkillPromptDecision {
  if (!fingerprint.hasLotusScript) return "skip";
  if (config.skillPrompt === "always") return "load";
  if (config.skillPrompt === "never") return "skip";
  return "ask";
}

/** Outcome of one modal answer: load now, and whether the answer is remembered. */
export interface SkillChoiceOutcome {
  load: boolean;
  /** Setting to persist in the project config; undefined = keep asking. */
  persist?: SkillPromptMode;
}

export function skillChoiceOutcome(choice: SkillPromptChoice): SkillChoiceOutcome {
  if (choice === "load") return { load: true };
  if (choice === "never") return { load: false, persist: "never" };
  return { load: false };
}

/**
 * Wrap the skill body as a context message. The model has to know that this is
 * the operating manual and where its references live: `SKILL.md` points at
 * sibling files by relative path, so the absolute directory is stated up front.
 */
export function wrapSkillMessage(skillBody: string, skillPath: string): string {
  const dir = skillPath.replace(/[\\/][^\\/]+$/, "");
  return [
    "ENTRY SKILL LOADED BY THE OPERATOR — lotusscript-modular (whole-file workflow).",
    `Skill directory for relative references: ${dir}`,
    "Follow it as instructions for this session. Do not re-derive its rules from guesswork.",
    "",
    skillBody.trim(),
  ].join("\n");
}
