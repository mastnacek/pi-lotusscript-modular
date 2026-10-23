/**
 * Lotus consent modal — "this looks like a Domino project, load the skill?"
 *
 * The animation is the plugin's only piece of theatre: a lotus that blooms in
 * six stages, then keeps a slow shimmer so the window reads as "alive" while
 * the operator decides. 8 fps, one `setInterval`, cleared in `dispose()` —
 * the same pattern the engine's overlay example uses, because the TUI only
 * repaints on `tui.requestRender()`.
 *
 * Width safety: every line goes through the shared `padRow`, which clamps with
 * `truncateToWidth`, so a narrow terminal can never crash the renderer.
 */

import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type TUI,
} from "@earendil-works/pi-tui";
import type { ProjectFingerprint, SkillPromptChoice } from "../../shared/types.js";
import type { Strings } from "../../shared/i18n.js";

/** Inner width of the box (clamped to the terminal at render time). */
const BOX_WIDTH = 62;
const FRAME_MS = 125;

/**
 * Bloom stages, narrow characters only (no emoji: they are double-width and
 * would fight `truncateToWidth`). Each frame is centred inside the box.
 */
const BLOOM: string[][] = [
  [
    "        ╱╲",
    "        ╲╱",
    "   ~~~~~~~~~~~~~",
  ],
  [
    "       ╱╲╱╲",
    "      ╱  ╲",
    "      ╲  ╱",
    "       ╲╱╲╱",
    "   ~~~~~~~~~~~~~",
  ],
  [
    "     ╱╲ ╱╲ ╱╲",
    "    ╱  ╲╱  ╲",
    "    ╲  ✦  ╱",
    "     ╲╱ ╲╱",
    "   ~~~~~~~~~~~~~",
  ],
  [
    "   ╱╲ ╱╲╱╲ ╱╲",
    "  ╱  ╲  ✦  ╱  ╲",
    "  ╲  ╱  ✦  ╲  ╱",
    "   ╲╱ ╲╱╲╱ ╲╱",
    "   ~~~~~~~~~~~~~",
  ],
  [
    "  ╱╲ ╱╲╱╲ ╱╲ ╱╲",
    " ╱  ╲  ✷  ╱  ╲",
    " ╲  ╱  ✦  ╲  ╱",
    "  ╲╱ ╲╱╲╱ ╲╱ ╲╱",
    "   ~~~~~~~~~~~~~",
  ],
  [
    "  ╱╲ ╱╲╱╲ ╱╲ ╱╲",
    " ╱  ╲  ✦  ╱  ╲",
    " ╲  ╱  ✷  ╲  ╱",
    "  ╲╱ ╲╱╲╱ ╲╱ ╲╱",
    "   ~~~~~~~~~~~~~",
  ],
];

const ACTIONS: SkillPromptChoice[] = ["load", "skip", "never"];

export class LotusSkillPromptComponent implements Component {
  private selected = 0;
  private tick = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly strings: Strings,
    private readonly fingerprint: ProjectFingerprint,
    private readonly done: (choice: SkillPromptChoice) => void
  ) {
    this.interval = setInterval(() => {
      if (this.disposed) return;
      this.tick++;
      this.tui.requestRender();
    }, FRAME_MS);
  }

  private choose(choice: SkillPromptChoice): void {
    this.dispose();
    this.done(choice);
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.choose("skip");
      return;
    }
    if (matchesKey(data, "up") || matchesKey(data, "left")) {
      this.selected = (this.selected + ACTIONS.length - 1) % ACTIONS.length;
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "down") || matchesKey(data, "right") || matchesKey(data, "tab")) {
      this.selected = (this.selected + 1) % ACTIONS.length;
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "return")) {
      this.choose(ACTIONS[this.selected] ?? "skip");
      return;
    }
    const key = data.toLowerCase();
    if (key === "y" || key === "a") {
      this.choose("load");
      return;
    }
    if (key === "n" || key === "s") {
      this.choose("skip");
      return;
    }
    if (key === "v" || key === "d") {
      this.choose("never");
    }
  }

  private padRow(content: string, innerW: number): string {
    const clamped = visibleWidth(content) > innerW ? truncateToWidth(content, innerW) : content;
    const padding = " ".repeat(Math.max(0, innerW - visibleWidth(clamped)));
    return this.theme.fg("border", "│") + clamped + padding + this.theme.fg("border", "│");
  }

  /** One animated frame, coloured by tick parity so the bloom shimmers. */
  private renderLotus(innerW: number): string[] {
    const frame = BLOOM[this.tick % BLOOM.length]!;
    const sparkle = this.tick % 2 === 0;
    const th = this.theme;
    const widest = Math.max(...frame.map((line) => visibleWidth(line)));
    const blockPad = Math.max(0, Math.floor((innerW - widest) / 2));

    return frame.map((line) => {
      // Centre every row inside the frame: the art is symmetric, so unequal
      // row widths must not left-align or the flower skews.
      const rowPad = Math.max(0, Math.floor((widest - visibleWidth(line)) / 2));
      const isWater = line.includes("~");
      const colour = isWater ? "dim" : sparkle ? "accent" : "muted";
      return this.padRow(
        " ".repeat(blockPad + rowPad) + th.fg(colour, line.trimEnd()),
        innerW
      );
    });
  }

  private renderActions(innerW: number): string[] {
    const th = this.theme;
    const s = this.strings.skillModal;
    const labels = [s.actionLoad, s.actionSkip, s.actionNever];
    const hints = [s.actionLoadHint, s.actionSkipHint, s.actionNeverHint];

    const rows = labels.map((label, index) => {
      const active = index === this.selected;
      const marker = active ? th.fg("accent", "  ▶ ") : "    ";
      const text = active ? th.fg("accent", label) : th.fg("text", label);
      return this.padRow(`${marker}${text}`, innerW);
    });

    return [
      this.padRow(` ${th.fg("dim", s.choose)}`, innerW),
      this.padRow("", innerW),
      ...rows,
      this.padRow(`   ${th.fg("dim", hints[this.selected] ?? "")}`, innerW),
      this.padRow("", innerW),
    ];
  }

  render(width: number): string[] {
    const innerW = Math.max(20, Math.min(BOX_WIDTH, width - 2));
    const th = this.theme;
    const s = this.strings.skillModal;
    const sample = this.fingerprint.sampleFile ?? this.fingerprint.root;

    return [
      th.fg("border", `╭${"─".repeat(innerW)}╮`),
      this.padRow(
        ` ${th.fg("accent", s.badge)} ${th.fg("dim", "·")} ${th.fg("warning", s.question)}`,
        innerW
      ),
      th.fg("border", `├${"─".repeat(innerW)}┤`),
      this.padRow("", innerW),
      ...this.renderLotus(innerW),
      this.padRow("", innerW),
      this.padRow(` ${th.fg("dim", s.detectedLabel)}`, innerW),
      this.padRow(`   ${th.fg("success", sample)}`, innerW),
      this.padRow(`   ${th.fg("dim", truncateToWidth(this.fingerprint.root, innerW - 6))}`, innerW),
      this.padRow("", innerW),
      ...this.renderActions(innerW),
      this.padRow(` ${th.fg("dim", s.footer)}`, innerW),
      th.fg("border", `╰${"─".repeat(innerW)}╯`),
    ].map((line) => truncateToWidth(line, width));
  }

  invalidate(): void {}

  dispose(): void {
    this.disposed = true;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

/**
 * Ask the operator. Returns undefined outside the TUI (RPC, print/json) — the
 * caller then falls back to the configured `skillPrompt` behaviour instead of
 * silently assuming consent.
 */
export async function promptSkillConsent(
  ctx: ExtensionContext,
  strings: Strings,
  fingerprint: ProjectFingerprint
): Promise<SkillPromptChoice | undefined> {
  if (!ctx.hasUI || (ctx.mode && ctx.mode !== "tui")) return undefined;

  return await ctx.ui.custom<SkillPromptChoice | undefined>(
    (tui, theme, _keybindings, done) =>
      new LotusSkillPromptComponent(tui, theme, strings, fingerprint, done),
    { overlay: true }
  );
}
