/**
 * The HUD — the single surface where every live plugin fact is displayed.
 *
 * One widget above the editor (`setWidget`), four lines, width-clipped. The
 * status line keeps only a glyph badge, so no number is rendered twice:
 *
 *   🪷 LS 4/4 · clean · LSP ✓ · KB 3/3
 *   🔧 hooks 47: calls 12 · results 9 · settled 2
 *   ⚡ gates: 0 blocked · 1 settle-nudge
 *   🧩📄📝🔍🔖   last: versioning · ag_x.lss ⚠
 *
 * Rendered via a Component factory (not a baked `string[]`) so the panel
 * follows the real render width; every line is clipped with
 * visibleWidth/truncateToWidth — TUI.doRender hard-crashes on lines wider than
 * the terminal.
 */

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { HookTelemetry, LspLaneStatus, ModularConfig } from "./types.js";
import { stringsFor } from "./i18n.js";

export const HUD_WIDGET_KEY = "lotusscript-hud";

/** Run state mirrored from the status line. */
export type HudState = "idle" | "checking" | "clean" | "error";

/** The last trace checkpoint, already localized by the trace slice. */
export interface HudTrace {
  label: string;
  detail?: string;
  ok?: boolean;
}

/**
 * Everything the HUD needs. A plain snapshot rather than the PluginState so
 * the line builder stays pure and testable without a session.
 */
export interface HudView {
  telemetry: HookTelemetry;
  state: HudState;
  score: { score: number; max: number } | null;
  /** kb_search calls in the current run. */
  kbQueries: number;
  /** Required kb_search calls per run (`minKbSearchesPerRun`). */
  kbRequired: number;
  /** Icon sequence of checkpoints already shown (ordering owned by the slice). */
  traceTail: string;
  lastTrace: HudTrace | null;
}

/** Fresh zeroed telemetry; one per session. */
export function createTelemetry(): HookTelemetry {
  return {
    hookCalls: {
      session_start: 0,
      resources_discover: 0,
      turn_end: 0,
      agent_settled: 0,
      agent_before_settle: 0,
      before_agent_start: 0,
      tool_call: 0,
      tool_result: 0,
    },
    kbSearches: 0,
    kbGateBlocks: 0,
    kbSettleNudges: 0,
    checks: 0,
    lastLspOk: null,
    lspLane: "unknown",
  };
}

/** Sum of all hook invocations. */
export function totalHookCalls(t: HookTelemetry): number {
  return (Object.values(t.hookCalls) as number[]).reduce((a, b) => a + b, 0);
}

/** Canonical width-clip helper — never let a line exceed the viewport. */
function fitLineToWidth(line: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (visibleWidth(line) <= maxWidth) return line;
  return truncateToWidth(line, maxWidth, "…");
}

/**
 * ✓ when the last check was clean or the lane answered the session probe,
 * ⚠ when a check failed or the lane is unreachable, ? only while nothing is
 * known yet. A real check verdict always wins over the probe.
 */
function lspMark(lastLspOk: boolean | null, lane: LspLaneStatus = "unknown"): string {
  if (lastLspOk !== null) return lastLspOk ? "✓" : "⚠";
  if (lane === "ready") return "✓";
  if (lane === "unreachable") return "⚠";
  return "?";
}

/**
 * Pure line builder — testable without a TUI. The HUD is rendered for the
 * user, never read by the model, so the text resolves through the i18n string
 * table using `config.lang` (pi-plugin-dev §10).
 */
export function hudLines(view: HudView, config: ModularConfig): string[] {
  const s = stringsFor(config.lang).hud;
  const t = view.telemetry;

  const stateWord = {
    idle: s.stateIdle,
    checking: s.stateChecking,
    clean: s.stateClean,
    error: s.stateError,
  }[view.state];

  const score = view.score ? `${view.score.score}/${view.score.max}` : "–";
  const kb = `${view.kbQueries}/${view.kbRequired}`;

  const lines = [
    s.head(score, stateWord, lspMark(t.lastLspOk, t.lspLane), kb),
    s.hooks(
      totalHookCalls(t),
      t.hookCalls.tool_call,
      t.hookCalls.tool_result,
      t.hookCalls.agent_settled
    ),
    s.gates(t.kbGateBlocks, t.kbSettleNudges),
  ];

  if (view.lastTrace) {
    const detail = view.lastTrace.detail ? ` · ${view.lastTrace.detail}` : "";
    const warn = view.lastTrace.ok === false ? " ⚠" : "";
    lines.push(`${view.traceTail}${s.last(view.lastTrace.label, detail, warn)}`);
  } else if (view.traceTail) {
    lines.push(view.traceTail);
  }

  return lines;
}

/** HUD component: reads a live snapshot so every frame shows fresh counters. */
export class LotusHudComponent implements Component {
  constructor(
    private readonly theme: Theme,
    private readonly getView: () => HudView,
    private readonly getConfig: () => ModularConfig
  ) {}

  render(width: number): string[] {
    return hudLines(this.getView(), this.getConfig()).map((line) =>
      this.theme.fg("dim", fitLineToWidth(line, width))
    );
  }

  /** Component contract: drop cached state on theme changes. */
  invalidate(): void {
    // No cached rendering state — lines are rebuilt from getters on each render.
  }
}

/**
 * (Re)sets the HUD widget, or removes it when the setting is off.
 * Guarded for headless modes: hasUI is true in RPC, so ctx.mode must be tui.
 */
export function renderHud(
  ctx: ExtensionContext | null,
  getView: () => HudView,
  getConfig: () => ModularConfig
): void {
  if (!ctx || !ctx.hasUI || (ctx.mode && ctx.mode !== "tui")) return;
  // Defensive: older engines / test doubles may not expose setWidget — the
  // HUD is a UI enrichment, never worth crashing the pipeline over.
  if (typeof ctx.ui?.setWidget !== "function") return;
  if (!getConfig().showTelemetryPanel) {
    ctx.ui.setWidget(HUD_WIDGET_KEY, undefined);
    return;
  }
  ctx.ui.setWidget(
    HUD_WIDGET_KEY,
    (_tui: unknown, theme: Theme) => new LotusHudComponent(theme, getView, getConfig),
    { placement: "aboveEditor" }
  );
}
