/**
 * Lotus consent modal — "this looks like a Domino project, load the skill?"
 *
 * Static on purpose: one lotus glyph, no timers. The overlay host derives the
 * box geometry from the lines `render()` returns and centres it, so any frame
 * that changes its row count (or width) makes the whole window jump, grow and
 * shrink while the operator is still reading it. A fixed geometry is the point
 * of this file — do not reintroduce a per-frame animation here.
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

/**
 * The only decoration left: a single lotus glyph, measured by pi-tui as two
 * columns, so `padRow` keeps the right border aligned. Rendered once per
 * paint and never moved or recoloured between frames.
 */
const LOTUS = "🪷";

const ACTIONS: SkillPromptChoice[] = ["load", "skip", "never"];

export class LotusSkillPromptComponent implements Component {
  private selected = 0;
  private disposed = false;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly strings: Strings,
    private readonly fingerprint: ProjectFingerprint,
    private readonly done: (choice: SkillPromptChoice) => void
  ) {}

  private choose(choice: SkillPromptChoice): void {
    if (this.disposed) return;
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

  /** Exactly one row, always: the glyph centred in the box. */
  private renderLotus(innerW: number): string[] {
    const pad = Math.max(0, Math.floor((innerW - visibleWidth(LOTUS)) / 2));
    return [this.padRow(`${` `.repeat(pad)}${this.theme.fg("accent", LOTUS)}`, innerW)];
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

  /** No timer to clear any more; the flag only stops a double resolution. */
  dispose(): void {
    this.disposed = true;
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
