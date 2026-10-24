/**
 * The HUD — the single surface where every live plugin fact is displayed.
 *
 * One widget above the editor (`setWidget`), four colour-coded lines, width-
 * clipped. The status line keeps only a glyph badge, so no number is rendered
 * twice:
 *
 *   🪷 LS ▰▰▱▱ 2/4 · ⠹ kontroluji… · LSP 🌸 · 🌿 KB ▰▰▱ 2/3
 *   🔧 haky 47: volání 12 · výsledky 9 · dokončení 2
 *   ⚡ brány: 0 blokováno · 1 settle-nudge
 *   🧩📄📝🔍🔖 naposled: versioning · ag_x.lss ⚠
 *
 * Two layers, on purpose:
 *  - `hudSegments()` is PURE and owns layout + wording order. It returns
 *    colour-TAGGED fragments, so the same composition is testable without a
 *    theme and translatable through the i18n string table.
 *  - `LotusHudComponent` paints those tags with the live `Theme` and clips every
 *    line with visibleWidth/truncateToWidth — TUI.doRender hard-crashes on a
 *    line wider than the terminal.
 *
 * The LSP mark spins while a check runs: a render timer advances braille frames
 * and asks the TUI to repaint, so the panel proves the lane is working instead
 * of showing a frozen glyph.
 */

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { HookTelemetry, LspLaneStatus, ModularConfig } from "./types.js";
import { stringsFor } from "./i18n.js";
import { LOTUS } from "./lotus-icons.js";

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

/** Theme roles the HUD is allowed to paint with — no raw ANSI anywhere. */
export type HudColor = "accent" | "success" | "error" | "warning" | "muted" | "dim" | "text";

/** One painted fragment. `color` undefined means the terminal default. */
export interface HudSeg {
  text: string;
  color?: HudColor;
}

/** One rendered row, built from fragments. */
export type HudLine = HudSeg[];

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

/** Braille spinner — the classic small-progress animation. */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

/** Repaint cadence while a check runs. */
const SPINNER_INTERVAL_MS = 90;

/**
 * A cell bar: `▰▰▱▱`. Rounds DOWN, so a half-finished requirement never reads
 * as met, and caps the cell count so a large `minKbSearchesPerRun` cannot make
 * the line unreadable on a narrow terminal.
 */
export function bar(filled: number, total: number, cells = 5): string {
  // Nothing to require means nothing to draw — no row of empty cells.
  if (total <= 0) return "";
  const width = Math.max(1, Math.min(cells, total, 8));
  const on = filled >= total ? width : Math.floor((Math.max(0, filled) / total) * width);
  return "▰".repeat(on) + "▱".repeat(width - on);
}

/**
 * Botanical verdict for the LSP cell: 🌸 clean (or the lane answered the
 * session probe), 🥀 a failed check or unreachable lane, 🌱 while nothing is
 * known yet. A real check verdict always wins over the probe.
 */
function lspMark(lastLspOk: boolean | null, lane: LspLaneStatus = "unknown"): string {
  if (lastLspOk !== null) return lastLspOk ? LOTUS.clean : LOTUS.error;
  if (lane === "ready") return LOTUS.clean;
  if (lane === "unreachable") return LOTUS.error;
  return LOTUS.checking;
}

/** Colour of the LSP verdict, matching the glyph. */
function lspColor(lastLspOk: boolean | null, lane: LspLaneStatus): HudColor {
  const mark = lspMark(lastLspOk, lane);
  if (mark === LOTUS.clean) return "success";
  if (mark === LOTUS.error) return "error";
  return "muted";
}

/**
 * Pure, colour-tagged line builder — testable without a TUI and without a theme.
 * Wording resolves through the i18n string table (`config.lang`); glyphs, bars
 * and segment order are presentation and stay here.
 */
export function hudSegments(view: HudView, config: ModularConfig, frame = 0): HudLine[] {
  const s = stringsFor(config.lang).hud;
  const t = view.telemetry;

  const stateWord = {
    idle: s.stateIdle,
    checking: s.stateChecking,
    clean: s.stateClean,
    error: s.stateError,
  }[view.state];

  const stateColor = ({
    idle: "muted",
    checking: "accent",
    clean: "success",
    error: "error",
  } as const)[view.state];

  // While a check runs the LSP cell spins; otherwise it shows the verdict.
  const checking = view.state === "checking";
  const spinner = SPINNER_FRAMES[Math.abs(frame) % SPINNER_FRAMES.length]!;

  const head: HudLine = [
    { text: "🪷 ", color: "accent" },
    { text: `${s.ls} `, color: "muted" },
  ];

  if (view.score) {
    const { score, max } = view.score;
    head.push(
      { text: `${bar(score, max)} `, color: score >= max ? "success" : "accent" },
      { text: `${score}/${max}`, color: "text" }
    );
  } else {
    head.push({ text: "–", color: "dim" });
  }

  head.push(
    { text: " · ", color: "dim" },
    { text: stateWord, color: stateColor },
    { text: " · ", color: "dim" },
    { text: `${s.lsp} `, color: "muted" },
    { text: checking ? spinner : lspMark(t.lastLspOk, t.lspLane), color: checking ? "accent" : lspColor(t.lastLspOk, t.lspLane) },
    { text: " · ", color: "dim" },
    { text: `${LOTUS.kb} `, color: "muted" },
    { text: `${s.kb} `, color: "muted" },
    ...(view.kbRequired > 0
      ? [
          {
            text: `${bar(view.kbQueries, view.kbRequired, 5)} `,
            color: (view.kbQueries >= view.kbRequired
              ? "success"
              : view.kbQueries > 0
                ? "accent"
                : "muted") as HudColor,
          },
        ]
      : []),
    { text: `${view.kbQueries}/${view.kbRequired}`, color: "text" }
  );

  const hooks: HudLine = [
    { text: "🔧 ", color: "accent" },
    { text: `${s.hooks} `, color: "muted" },
    { text: `${totalHookCalls(t)}`, color: "text" },
    { text: ": ", color: "dim" },
    { text: `${s.hookCalls} `, color: "muted" },
    { text: `${t.hookCalls.tool_call}`, color: "text" },
    { text: " · ", color: "dim" },
    { text: `${s.hookResults} `, color: "muted" },
    { text: `${t.hookCalls.tool_result}`, color: "text" },
    { text: " · ", color: "dim" },
    { text: `${s.hookSettled} `, color: "muted" },
    { text: `${t.hookCalls.agent_settled}`, color: "text" },
  ];

  // Gates are a health line: a green bolt means "nothing blocked the run".
  const gates: HudLine = [
    { text: "⚡ ", color: t.kbGateBlocks > 0 ? "error" : "success" },
    { text: `${s.gates}: `, color: "muted" },
    {
      text: `${t.kbGateBlocks} ${s.blocked}`,
      color: t.kbGateBlocks > 0 ? "error" : "success",
    },
    { text: " · ", color: "dim" },
    {
      text: `${t.kbSettleNudges} ${s.nudges}`,
      color: t.kbSettleNudges > 0 ? "warning" : "muted",
    },
  ];

  const lines: HudLine[] = [head, hooks, gates];

  if (view.lastTrace) {
    const tail: HudLine = [{ text: view.traceTail, color: "accent" }];
    tail.push(
      { text: ` ${s.lastLabel}: `, color: "muted" },
      { text: view.lastTrace.label, color: "text" }
    );
    if (view.lastTrace.detail) tail.push({ text: ` · ${view.lastTrace.detail}`, color: "muted" });
    if (view.lastTrace.ok === false) tail.push({ text: " ⚠", color: "error" });
    lines.push(tail);
  } else if (view.traceTail) {
    lines.push([{ text: view.traceTail, color: "accent" }]);
  }

  return lines;
}

/** Plain-text rendering of the same layout (tests, logs, RPC-safe paths). */
export function hudLines(view: HudView, config: ModularConfig, frame = 0): string[] {
  return hudSegments(view, config, frame).map((line) => line.map((seg) => seg.text).join(""));
}

/* ------------------------------------------------------------------ *
 * Animation driver
 *
 * The widget factory is re-invoked on every `setWidget`, and a state change
 * always re-invokes it, so the timer lives at module scope: a repaint must not
 * restart the animation (that would freeze the spinner on frame 0 while hooks
 * fire) and must not leak one interval per re-render.
 * ------------------------------------------------------------------ */

interface RenderableTui {
  requestRender?: () => void;
}

let spinnerFrame = 0;
let animationTimer: ReturnType<typeof setInterval> | null = null;
let animationTui: RenderableTui | null = null;

/** Stop the repaint timer. Idempotent; called from component disposal. */
export function stopHudAnimation(): void {
  if (animationTimer) clearInterval(animationTimer);
  animationTimer = null;
}

/** The frame the spinner is on (module-scoped so repaints stay in sync). */
export function currentSpinnerFrame(): number {
  return spinnerFrame;
}

/**
 * Run the repaint timer only while a check is in flight. A decorative timer
 * must never keep the process alive, so it is unref'd where Node allows it.
 */
function syncHudAnimation(active: boolean, tui: unknown): void {
  const candidate = tui as RenderableTui | null | undefined;
  animationTui = typeof candidate?.requestRender === "function" ? candidate : null;

  if (!active || !animationTui) {
    stopHudAnimation();
    return;
  }
  if (animationTimer) return;

  animationTimer = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
    try {
      animationTui?.requestRender?.();
    } catch {
      // A torn-down TUI must not throw out of a timer callback.
      stopHudAnimation();
    }
  }, SPINNER_INTERVAL_MS);
  animationTimer.unref?.();
}

/**
 * HUD component: reads a live snapshot so every frame shows fresh counters,
 * paints the tagged fragments with the active theme, and owns the spinner
 * lifecycle for as long as the widget lives.
 */
export class LotusHudComponent implements Component {
  constructor(
    private readonly theme: Theme,
    private readonly getView: () => HudView,
    private readonly getConfig: () => ModularConfig,
    tui?: unknown
  ) {
    syncHudAnimation(this.getView().state === "checking", tui);
  }

  render(width: number): string[] {
    return hudSegments(this.getView(), this.getConfig(), spinnerFrame).map((line) =>
      fitLineToWidth(
        line.map((seg) => (seg.color ? this.theme.fg(seg.color, seg.text) : seg.text)).join(""),
        width
      )
    );
  }

  /** Component contract: drop cached state on theme changes. */
  invalidate(): void {
    // No cached rendering state — segments are rebuilt from getters each render.
  }

  /** Engine calls this when the widget is replaced or removed. */
  dispose(): void {
    stopHudAnimation();
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
    stopHudAnimation();
    return;
  }
  ctx.ui.setWidget(
    HUD_WIDGET_KEY,
    (tui: unknown, theme: Theme) => new LotusHudComponent(theme, getView, getConfig, tui),
    { placement: "aboveEditor" }
  );
}
