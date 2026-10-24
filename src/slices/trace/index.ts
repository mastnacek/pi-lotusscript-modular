/**
 * Trace slice — record the visible skill trace.
 *
 * Design constraints, in order of importance:
 * 1. **One surface.** A checkpoint updates the HUD (icon tail + `last:` line)
 *    and nothing else. It is never a toast: the same information in two places
 *    is noise, and a toast per checkpoint drowned the chat during long work.
 * 2. **Never in model context.** No `pi.sendMessage`, no tool-result text:
 *    the trace informs the operator, it must not cost tokens or steer the model.
 * 3. **Gentle.** One update per checkpoint per session (`traceEmitted`), and
 *    the whole thing is switchable with `showSkillTrace`.
 * 4. **Structural.** The last-checkpoint line is built from the fixed
 *    vocabulary in `vocab.ts`, so the same event always looks the same.
 */

import type { PluginState } from "../../shared/state.js";
import { traceKey, traceLabel, traceTag, type TraceEvent } from "./vocab.js";

export * from "./vocab.js";

/**
 * Record one checkpoint. No-op when disabled, already shown, or UI-less.
 * The HUD is the only destination; `state.lastTrace` carries the localized
 * label so the kernel never has to know the vocabulary.
 */
export function emitTrace(state: PluginState, event: TraceEvent): void {
  if (!state.config.showSkillTrace) return;

  const key = traceKey(event);
  if (state.traceEmitted.has(key)) return;
  state.traceEmitted.add(key);

  state.traceTags.push(traceTag(event));
  state.lastTrace = {
    label: traceLabel(event.kind, state.config.lang),
    detail: event.detail,
    ok: event.ok,
  };

  // Only the trace row changes: the HUD's run-state line keeps whatever the
  // last real check reported, so a checkpoint can never claim a clean check
  // that did not happen (or erase an LSP error the operator is looking at).
  state.renderHud();
}
