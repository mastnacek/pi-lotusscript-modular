/**
 * Trace slice — emit the visible skill trace.
 *
 * Design constraints, in order of importance:
 * 1. **Never in model context.** Uses `ctx.ui.notify`, not `pi.sendMessage`:
 *    the trace informs the operator, it must not cost tokens or steer the model.
 * 2. **Gentle.** One line per checkpoint per session (`traceEmitted`), and the
 *    whole thing is switchable with `showSkillTrace`.
 * 3. **Structural.** Lines are built from the fixed vocabulary in `vocab.ts`,
 *    so the same event always looks the same.
 * 4. **Persistent tail.** Each emitted kind also lands in the statusline as an
 *    icon, so the last state is visible without scrolling.
 */

import type { PluginState } from "../../shared/state.js";
import { traceKey, traceLine, traceTag, type TraceEvent } from "./vocab.js";

export * from "./vocab.js";

export interface TraceSink {
  notify(text: string): void;
}

/** Emit one checkpoint. No-op when disabled, already shown, or UI-less. */
export function emitTrace(state: PluginState, sink: TraceSink, event: TraceEvent): void {
  if (!state.config.showSkillTrace) return;

  const key = traceKey(event);
  if (state.traceEmitted.has(key)) return;
  state.traceEmitted.add(key);

  state.traceTags.push(traceTag(event));
  sink.notify(traceLine(event, state.config.lang));
  state.renderStatusline("clean");
}
