/**
 * Telemetry panel — in-TUI tracking of hook usage, file reads, KB-gated tool
 * usage and code length. Sibling of state-insights / state-procedure-limits:
 * kernel-side UI owned by PluginState, same pattern as renderStatusline.
 *
 * Rendered via ctx.ui.setWidget with a Component factory (not a baked
 * string[]) so the panel follows the real render width; every line is
 * clipped with visibleWidth/truncateToWidth — TUI.doRender hard-crashes on
 * lines wider than the terminal.
 */

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { HookName, HookTelemetry, ModularConfig } from "./types.js";
import { stringsFor } from "./i18n.js";

export const TELEMETRY_WIDGET_KEY = "lotusscript-telemetry";

/** Fresh zeroed telemetry; one per session. */
export function createTelemetry(): HookTelemetry {
  return {
    hookCalls: {
      session_start: 0,
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
    protectedBlocks: 0,
    recompiles: 0,
    lastProcCount: null,
    lastLongestProc: null,
    lastLspOk: null,
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
 * Pure line builder for the panel — testable without a TUI. The panel is
 * rendered for the user, never read by the model, so the text resolves
 * through the i18n string table using `config.lang` (pi-plugin-dev §10).
 */
export function telemetryLines(t: HookTelemetry, config: ModularConfig): string[] {
  const s = stringsFor(config.lang).telemetry;
  const code =
    t.lastProcCount === null
      ? s.codeNone
      : s.code(t.lastProcCount, t.lastLongestProc, config.maxProcedureLines);
  const lsp = t.lastLspOk === null ? "?" : t.lastLspOk ? "✓" : "⚠";
  return [
    s.hooks(totalHookCalls(t), t.hookCalls.tool_call, t.hookCalls.tool_result, t.hookCalls.agent_settled),
    s.reads(t.kbSearches),
    s.gates(t.kbGateBlocks, t.protectedBlocks, t.recompiles, t.kbSettleNudges),
    s.suffix(code, lsp),
  ];
}

/** Panel component: reads live getters so every frame shows fresh counters. */
export class TelemetryPanelComponent implements Component {
  constructor(
    private readonly theme: Theme,
    private readonly getTelemetry: () => HookTelemetry,
    private readonly getConfig: () => ModularConfig
  ) {}

  render(width: number): string[] {
    return telemetryLines(this.getTelemetry(), this.getConfig()).map((line) =>
      this.theme.fg("dim", fitLineToWidth(line, width))
    );
  }

  /** Component contract: drop cached state on theme changes. */
  invalidate(): void {
    // No cached rendering state — lines are rebuilt from getters on each render.
  }
}

/**
 * (Re)sets the telemetry widget, or removes it when the setting is off.
 * Guarded for headless modes: hasUI is true in RPC, so ctx.mode must be tui.
 */
export function renderTelemetryPanel(
  ctx: ExtensionContext | null,
  getTelemetry: () => HookTelemetry,
  getConfig: () => ModularConfig
): void {
  if (!ctx || !ctx.hasUI || (ctx.mode && ctx.mode !== "tui")) return;
  // Defensive: older engines / test doubles may not expose setWidget — the
  // panel is a UI enrichment, never worth crashing the pipeline over.
  if (typeof ctx.ui?.setWidget !== "function") return;
  if (!getConfig().showTelemetryPanel) {
    ctx.ui.setWidget(TELEMETRY_WIDGET_KEY, undefined);
    return;
  }
  ctx.ui.setWidget(
    TELEMETRY_WIDGET_KEY,
    (_tui: unknown, theme: Theme) =>
      new TelemetryPanelComponent(theme, getTelemetry, getConfig),
    { placement: "aboveEditor" }
  );
}

/** Removes the widget (config toggled off / shutdown path). */
export function clearTelemetryPanel(ctx: ExtensionContext | null): void {
  if (!ctx || !ctx.hasUI || typeof ctx.ui?.setWidget !== "function") return;
  ctx.ui.setWidget(TELEMETRY_WIDGET_KEY, undefined);
}

/** Type re-export so callers (and tests) can name hook keys. */
export type { HookName };
