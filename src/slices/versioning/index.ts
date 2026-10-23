/**
 * Versioning slice — observe the `VERZE` / `CHANGELOG` header of every
 * LotusScript source the agent touches, and nudge it when a file is edited
 * without the header being written or bumped.
 *
 * Why a slice of its own: versioning is a *source-shape* concern, not a
 * compilation one. It must fire on files that compile perfectly and it must
 * survive a change of the LSP lane. The pipeline only calls in; it does not
 * know the rules.
 *
 * Triggers (wired in the composition root):
 * - on read  → `observeVersionHeader` caches the baseline;
 * - on edit/write → `checkVersioning` compares and returns a notice.
 *
 * The notice is emitted at most once per file per run, so a long refactor is
 * nudged once instead of on every edit.
 */

import fs from "node:fs";
import path from "node:path";
import type { PluginState } from "../../shared/state.js";
import { evaluateVersioning, extractVersionBlock } from "./header.js";
import { missingNotice, unchangedNotice } from "./messages.js";

export * from "./header.js";
export { missingNotice, unchangedNotice, VERSIONING_REFERENCE } from "./messages.js";

function readBlock(filePath: string) {
  try {
    return extractVersionBlock(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/** Remember the header seen on read, so a later edit has a baseline. */
export function observeVersionHeader(state: PluginState, filePath: string): void {
  const block = readBlock(filePath);
  if (block) state.versionHeaders.set(filePath, block.raw);
}

/**
 * Check the header of a just-edited file.
 * @returns markdown to append to the tool result, or null when nothing is owed.
 */
export function checkVersioning(state: PluginState, filePath: string): string | null {
  if (!state.config.versioningCheck) return null;

  const current = readBlock(filePath);
  if (!current) return null;

  const previousRaw = state.versionHeaders.get(filePath);
  state.versionHeaders.set(filePath, current.raw);

  const verdict = evaluateVersioning(current, previousRaw);
  if (verdict.kind === "ok") return null;
  if (state.versioningNudged.has(filePath)) return null;
  state.versioningNudged.add(filePath);

  const name = path.basename(filePath);
  return verdict.kind === "missing" ? missingNotice(name) : unchangedNotice(name, verdict.version);
}
