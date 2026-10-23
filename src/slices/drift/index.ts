/**
 * Drift slice — nudge when an *agent* re-implements what the project's script
 * library already provides.
 *
 * Fires only when all of these hold:
 *   1. `driftCheck` is on;
 *   2. the edited file is not itself a library (`lib_*`);
 *   3. its folder ships at least one `lib_*.lss` — otherwise there is nothing
 *      to reuse and the advice would be noise;
 *   4. a signal matches (HTTP COM, endpoint literal, local error report,
 *      hand-built notes:// URL);
 *   5. this file has not been nudged yet in the current run.
 *
 * The notice only points at the reference: the rule itself lives in the skill,
 * so it cannot drift away from the detection.
 */

import fs from "node:fs";
import path from "node:path";
import type { PluginState } from "../../shared/state.js";
import { findDrift, isLibraryFile, type DriftHit } from "./signals.js";

export * from "./signals.js";

/** True when the edited file's own folder ships a script library. */
function projectHasLibrary(dir: string): boolean {
  try {
    return fs.readdirSync(dir).some((f) => /^lib_.*\.lss$/i.test(f));
  } catch {
    return false;
  }
}

function notice(fileName: string, hits: DriftHit[]): string {
  const found = hits
    .map((h) => `- ${h.signal.label} (line ${h.lines.join(", ")}) → ${h.signal.reference}`)
    .join("\n");
  return [
    "",
    "",
    `🔖 [LotusScript: Library drift] **${fileName} contains code this project already keeps in a script library.**`,
    found,
    "",
    "Replace the local copy with a call into the library, and keep the library the single owner of that logic.",
    "If the library genuinely does not cover this case yet, extend the library first — then call it.",
  ].join("\n");
}

/** @returns markdown to append to the tool result, or null when nothing is owed. */
export function checkDrift(state: PluginState, filePath: string): string | null {
  if (!state.config.driftCheck) return null;
  if (isLibraryFile(filePath)) return null;
  if (!projectHasLibrary(path.dirname(filePath))) return null;
  if (state.driftNudged.has(filePath)) return null;

  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }

  const hits = findDrift(text);
  if (hits.length === 0) return null;

  state.driftNudged.add(filePath);
  return notice(path.basename(filePath), hits);
}
