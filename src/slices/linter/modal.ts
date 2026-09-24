/**
 * Procedure-limit review modal — the TUI overlay component only. The text
 * input state machine lives in instructions-input.ts, the high-level prompt
 * helper in line-review-prompt.ts (per-file line limit split).
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type Focusable,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { ProcedureLintItem } from "../../shared/types.js";
import { InstructionsInput } from "./instructions-input.js";

export type ProcedureReviewResult =
  | { action: "approve" }
  | { action: "reject" }
  | { action: "split_instructions"; instructions: string };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * TUI Overlay modal component for reviewing procedure line limit excess.
 *
 * Sizes itself to the real terminal (via `termCols` / `termRows`), word-wraps
 * all content instead of truncating, and scrolls when the content is taller
 * than the available viewport so the full text is always readable.
 */
export class ProcedureLimitComponent implements Focusable {
  /** Focusable interface for hardware cursor tracking and IME support */
  focused = true;

  private selected = 0; // 0 = approve exception, 1 = reject/split, 2 = split instructions
  private readonly input = new InstructionsInput();
  private scrollOffset = 0;

  private readonly termCols: number;
  private readonly termRows: number;

  constructor(
    private readonly theme: Theme,
    private readonly item: ProcedureLintItem,
    private readonly done: (result: ProcedureReviewResult) => void,
    termCols = 100,
    termRows = 40
  ) {
    this.termCols = termCols;
    this.termRows = termRows;
  }

  // ---------------------------------------------------------------- input ---

  private handleScroll(data: string): boolean {
    if (matchesKey(data, Key.pageUp) || matchesKey(data, "ctrl+u")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 5);
      return true;
    }
    if (matchesKey(data, Key.pageDown) || matchesKey(data, "ctrl+d")) {
      this.scrollOffset += 5;
      return true;
    }
    return false;
  }

  private handleNavigation(data: string): boolean {
    if (matchesKey(data, "escape")) {
      this.done({ action: "reject" });
      return true;
    }
    if (matchesKey(data, "up")) {
      this.selected = Math.max(0, this.selected - 1);
      return true;
    }
    if (matchesKey(data, "down")) {
      this.selected = Math.min(2, this.selected + 1);
      return true;
    }
    if (matchesKey(data, "return")) {
      if (this.selected === 0) {
        this.done({ action: "approve" });
      } else if (this.selected === 1) {
        this.done({ action: "reject" });
      } else {
        this.done({
          action: "split_instructions",
          instructions: this.input.text.trim(),
        });
      }
      return true;
    }
    return false;
  }

  private handleQuickKeys(data: string): boolean {
    if (this.selected === 2) return false;
    const lower = data.toLowerCase();
    if (lower === "p" || lower === "s") {
      this.done({ action: "approve" });
      return true;
    }
    if (lower === "o" || lower === "c") {
      this.done({ action: "reject" });
      return true;
    }
    if (lower === "r" || lower === "z") {
      this.selected = 2;
      return true;
    }
    return false;
  }

  handleInput(data: string): void {
    if (this.handleScroll(data)) return;
    if (this.handleNavigation(data)) return;
    if (this.handleQuickKeys(data)) return;
    if (this.selected === 2) {
      this.input.handleInput(data);
    }
  }

  // --------------------------------------------------------------- render ---

  private padRow(content: string, innerW: number): string {
    let c = content;
    if (visibleWidth(c) > innerW) {
      c = truncateToWidth(c, innerW);
    }
    const padding = " ".repeat(Math.max(0, innerW - visibleWidth(c)));
    return this.theme.fg("border", "│") + c + padding + this.theme.fg("border", "│");
  }

  /** Word-wraps a logical row, preserving its leading indent on continuations. */
  private pushWrapped(rows: string[], text: string, innerW: number): void {
    if (text.trim() === "") {
      rows.push("");
      return;
    }
    const lead = /^ */.exec(text)?.[0] ?? "";
    const indent = lead.length > 0 ? lead : " ";
    const avail = Math.max(10, innerW - indent.length);
    for (const line of wrapTextWithAnsi(text.slice(indent.length), avail)) {
      rows.push(indent + line);
    }
  }

  private buildActionRows(rows: string[], actionRows: number[], innerW: number): void {
    const th = this.theme;
    const cursor = (idx: number, label: string, hint: string): string => {
      const styled = this.selected === idx ? th.fg("accent", label) : th.fg("text", label);
      return `${this.selected === idx ? "  ▶ " : "    "}${styled} ${th.fg("dim", hint)}`;
    };

    actionRows[0] = rows.length;
    this.pushWrapped(rows, cursor(0, "✅ [Povolit výjimku]", "— schválit mírné překročení a pokračovat"), innerW);

    actionRows[1] = rows.length;
    this.pushWrapped(rows, cursor(1, "✂️ [Odmítnout a rozdělit]", "— vrátit AI pokyn k rozdělení na menší sub/funkce"), innerW);

    actionRows[2] = rows.length;
    const third = cursor(2, "✏️ [Pokyny k rozdělení]", "") + this.renderInputDisplay();
    this.pushWrapped(rows, third, innerW);
  }

  private renderInputDisplay(): string {
    const th = this.theme;
    if (this.selected === 2) {
      return this.input.render(th, true, this.focused);
    }
    return this.input.text.length === 0
      ? th.fg("dim", "Pokyny: (Enter pro zadání)")
      : `Pokyny: ${this.input.text}`;
  }

  private buildBody(innerW: number): { rows: string[]; actionRows: number[] } {
    const th = this.theme;
    const rows: string[] = [];
    const actionRows: number[] = [];
    const diff = this.item.lineCount - this.item.maxLines;

    this.pushWrapped(
      rows,
      ` ${th.fg("dim", "📌 Procedura:")} ${th.fg("accent", this.item.fileName)} ${th.fg("dim", `(${this.item.procedureName})`)}`,
      innerW
    );
    this.pushWrapped(
      rows,
      ` ${th.fg("dim", "📊 Počet řádků:")} ${th.fg("warning", String(this.item.lineCount))} ${th.fg("dim", "/ limit:")} ${this.item.maxLines} ${th.fg("error", `(+${diff} řádků nad limit)`)}`,
      innerW
    );
    this.pushWrapped(
      rows,
      ` ${th.fg("dim", "⚠️  Riziko:")} ${th.fg("warning", "LotusScript 32 KB bytecode limit procedury ('Script structure too large')")}`,
      innerW
    );
    if (this.item.commentNotice) {
      this.pushWrapped(
        rows,
        ` ${th.fg("dim", "ℹ️  Komentáře:")} ${th.fg("dim", this.item.commentNotice)}`,
        innerW
      );
    }

    rows.push(th.fg("dim", "─".repeat(innerW)));
    this.pushWrapped(
      rows,
      ` ${th.fg("dim", "🎯 Zvolte akci (šipkami ↑ / ↓, potvrďte Enter):")}`,
      innerW
    );
    this.pushWrapped(rows, "", innerW);

    this.buildActionRows(rows, actionRows, innerW);

    return { rows, actionRows };
  }

  render(width: number): string[] {
    const th = this.theme;

    // Fit the real terminal, keep a readable cap, never smaller than usable.
    const maxInner = Math.max(30, Math.min(this.termCols - 4, 106));
    const innerW = clamp(width - 2, 30, maxInner);

    const top = th.fg("border", `╭${"─".repeat(innerW)}╮`);
    const bottom = th.fg("border", `╰${"─".repeat(innerW)}╯`);
    const sep = th.fg("border", `├${"─".repeat(innerW)}┤`);

    const header = [
      top,
      this.padRow(
        ` ${th.fg("accent", "🪷 LotusScript Linter")} ${th.fg("dim", "·")} ${th.fg("warning", "Překročení limitu délky procedury 📏")}`,
        innerW
      ),
      sep,
    ];
    const footer = [
      this.padRow(
        ` ${th.fg("dim", "💡 ↑↓ akce • Enter potvrdit • Esc zamítnout • PageUp/PageDown posun")}`,
        innerW
      ),
      bottom,
    ];

    const body = this.buildBody(innerW);
    const maxTotal = Math.max(12, Math.floor(this.termRows * 0.9));
    const bodyCap = Math.max(4, maxTotal - header.length - footer.length);

    let visibleRows = body.rows;
    let indicator: string | null = null;

    if (body.rows.length > bodyCap) {
      const cap = Math.max(3, bodyCap - 1);
      const selRow = body.actionRows[this.selected] ?? 0;
      if (selRow < this.scrollOffset) this.scrollOffset = selRow;
      if (selRow >= this.scrollOffset + cap) this.scrollOffset = selRow - cap + 1;
      this.scrollOffset = clamp(this.scrollOffset, 0, Math.max(0, body.rows.length - cap));

      visibleRows = body.rows.slice(this.scrollOffset, this.scrollOffset + cap);
      const above = this.scrollOffset;
      const below = body.rows.length - (this.scrollOffset + cap);
      const parts: string[] = [];
      if (above > 0) parts.push(`▲ ${above}`);
      if (below > 0) parts.push(`▼ ${below}`);
      indicator = this.padRow(
        ` ${th.fg("dim", `… ${parts.join(" · ")} řádků (PageUp/PageDown) …`)}`,
        innerW
      );
    }

    const out = [...header];
    for (const row of visibleRows) out.push(this.padRow(row, innerW));
    if (indicator) out.push(indicator);
    out.push(...footer);
    return out;
  }

  invalidate(): void {}
  dispose(): void {}
}
