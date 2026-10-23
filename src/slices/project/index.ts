/**
 * Project slice — decides whether this workspace looks like a Domino /
 * LotusScript project, and turns that evidence into (a) the entry-skill hint
 * and (b) the operator consent modal.
 *
 * Barrel module: implementations live in siblings (`detect.ts`, `hints.ts`,
 * `policy.ts`, `prompt-modal.ts`, `skill-source.ts`) so each stays small.
 * Slices never import each other; the composition root wires the detector, the
 * hint builders and the modal into the session lifecycle (VSA).
 */

export {
  detectLotusScriptProject,
  createProjectDetector,
  MAX_DEPTH,
  MAX_ENTRIES,
  BUDGET_MS,
  type DetectOptions,
  type ProjectDetector,
} from "./detect.js";
export { getEntrySkillPath, hasEntrySkill, readEntrySkillBody } from "./skill-source.js";
export { buildProjectSkillGuideline, buildReadSkillNotice } from "./hints.js";
export { discoverSkillResources, type SkillResources } from "./resources.js";
export {
  skillPromptDecision,
  skillChoiceOutcome,
  wrapSkillMessage,
  type SkillChoiceOutcome,
  type SkillPromptDecision,
} from "./policy.js";
export { LotusSkillPromptComponent, promptSkillConsent } from "./prompt-modal.js";
