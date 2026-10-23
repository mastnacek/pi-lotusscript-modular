/**
 * Resource discovery — the ONLY place the entry skill is advertised.
 *
 * pi asks every extension once per session which extra resources to load
 * (`resources_discover`, fired after `session_start` and again on `/reload`)
 * and then rebuilds the system prompt, so the answer decides whether
 * `lotusscript-modular` appears in this project's skill list at all.
 *
 * Why it lives here and not in `settings.json`: a package-level
 * `packages[].skills` entry is unconditional — it offers a LotusScript manual
 * in every repository. Discovery lets the bounded scan decide, which is what
 * SPAI-009 asked for. Declaring the skill in BOTH places is a bug: pi keeps
 * the first discovery and reports a `name "lotusscript-modular" collision`.
 *
 * Pure on purpose (path and fingerprint are given), so the policy is testable
 * without a filesystem, a session or a TUI.
 */

import type { ModularConfig, ProjectFingerprint } from "../../shared/types.js";

/** Structural mirror of the engine's `ResourcesDiscoverResult`. */
export interface SkillResources {
  skillPaths?: string[];
}

/**
 * Skill paths this session may advertise.
 *
 * - no mounted skill (trimmed package) → nothing, never a dead path
 * - operator opted out (`skillPrompt: never`) → nothing; the opt-out also
 *   stops the advertising, not just the dialog
 * - no Domino evidence → nothing (this is the whole point of SPAI-009)
 * - otherwise → the bundled `SKILL.md`, so `/skill:lotusscript-modular`
 *   exists and the model can route to it
 */
export function discoverSkillResources(
  fingerprint: ProjectFingerprint,
  skillPath: string | null,
  config: Pick<ModularConfig, "skillPrompt">
): SkillResources {
  if (!skillPath) return {};
  if (config.skillPrompt === "never") return {};
  if (!fingerprint.hasLotusScript) return {};
  return { skillPaths: [skillPath] };
}
