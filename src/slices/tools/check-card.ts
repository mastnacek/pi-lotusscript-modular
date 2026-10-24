/**
 * Bordered check card — the transcript rendering of a `lotusscript_check`
 * result. Two layers, mirroring the HUD pattern:
 *
 *  - `checkCardRows()` is PURE: builds colour-tagged content rows from the
 *    check data + i18n strings, testable without a theme or terminal.
 *  - `CheckCardComponent` paints the rows with the live `Theme`, draws the
 *    rounded border and clips every line to the terminal width — TUI.doRender
 *    hard-crashes on an over-wide line, so clipping is not optional.
 *
 * Rendering is presentation only: the model keeps reading the plain text
 * `content`, this component only redraws what the operator sees.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Strings } from "../../shared/i18n.js";
import { LOTUS } from "../../shared/lotus-icons.js";

/** Theme roles the card is allowed to paint with — no raw ANSI anywhere. */
export type CardColor = "accent" | "success" | "error" | "warning" | "muted" | "dim" | "text";

/** One painted fragment of a content row. */
export interface CardSeg {
  text: string;
  color?: CardColor;
}

/** Everything the card needs; comes from tool `details` + parsed content. */
export interface CheckCardData {
  ok: boolean;
  skipped: boolean;
  path: string;
  errorCount: number;
  /** Diagnostic lines, already split and trimmed of empties. */
  diagnostics: string[];
}

/** Diagnostic lines shown inside the card before the "+N" overflow row. */
const MAX_DIAG_LINES = 8;

/**
 * Pure content-row builder — no borders, no width math, no theme.
 * Row 1: verdict, row 2: checked path, rows 3+: diagnostics (capped).
 */
export function checkCardRows(d: CheckCardData, s: Strings): CardSeg[] {
  const verdict: CardSeg = d.skipped
    ? { text: `${LOTUS.skipped} ${s.card.skipped}`, color: "muted" }
    : d.ok
      ? { text: `${LOTUS.clean} ${s.card.clean}`, color: "success" }
      : { text: `${LOTUS.error} ${s.card.errors(d.errorCount)}`, color: "error" };

  const rows: CardSeg[] = [verdict, { text: d.path, color: "muted" }];

  if (d.diagnostics.length > 0) {
    for (const line of d.diagnostics.slice(0, MAX_DIAG_LINES)) {
      rows.push({ text: line, color: "text" });
    }
    const rest = d.diagnostics.length - MAX_DIAG_LINES;
    if (rest > 0) rows.push({ text: `… (+${rest})`, color: "dim" });
  }

  return rows;
}

/**
 * Card component: rounded border around the pure rows, theme-painted and
 * width-clipped. Stateless — everything is rebuilt per render, so a theme
 * change cannot leave stale ANSI in a cache.
 */
export class CheckCardComponent implements Component {
  constructor(
    private readonly data: CheckCardData,
    private readonly theme: Theme,
    private readonly strings: Strings
  ) {}

  render(width: number): string[] {
    // Too narrow for even `╭─╮` + one padded cell: draw nothing rather than
    // crash. The plain tool text remains in the transcript for the model.
    if (width < 10) return [];

    const inner = width - 4; // "│ " + content + " │"
    const paint = (seg: CardSeg): string => (seg.color ? this.theme.fg(seg.color, seg.text) : seg.text);
    const row = (segs: CardSeg[]): string => {
      // Pad against the PAINTED string: ANSI escapes change the raw length but
      // not the visible width, so visibleWidth stays the correct measure.
      // Over-wide content is truncated FIRST — the border must never break.
      const painted = truncateToWidth(segs.map(paint).join(""), inner, "…");
      const filled = painted + " ".repeat(Math.max(0, inner - visibleWidth(painted)));
      return `│ ${filled} │`;
    };

    const border = "─".repeat(width - 2);
    const lines: string[] = [`╭${border}╮`];

    lines.push(row([{ text: `${LOTUS.plugin} ${this.strings.card.title}`, color: "accent" }]));
    for (const seg of checkCardRows(this.data, this.strings)) {
      lines.push(row([seg]));
    }
    lines.push(`╰${border}╯`);

    // Final safety net: truncate anything that still overflows.
    return lines.map((l) => (visibleWidth(l) <= width ? l : truncateToWidth(l, width)));
  }

  /** Component contract: nothing cached, nothing to drop. */
  invalidate(): void {}
}

/**
 * Rebuild card data from a stored tool result: `details` carries the verdict,
 * the diagnostics lines are parsed back out of the plain content text (the
 * model-facing report stays the single stored artifact).
 */
export function parseCheckCardData(
  text: string,
  details: { ok?: boolean; checkedPath?: string; skipped?: boolean; errorCount?: number } | undefined
): CheckCardData {
  const lines = text.split("\n");
  const checkedLine = lines.find((l) => /^Checked: /.test(l));
  const path = details?.checkedPath ?? checkedLine?.slice("Checked: ".length) ?? "";
  const diagIdx = lines.findIndex((l) => /^LSP Diagnostics/.test(l));
  const diagnostics = (diagIdx >= 0 ? lines.slice(diagIdx + 1) : [])
    .join("\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  const ok = details?.ok ?? text.includes("0 errors (clean)");
  return {
    ok,
    skipped: details?.skipped === true,
    path,
    errorCount: details?.errorCount ?? (ok ? 0 : 1),
    diagnostics,
  };
}
