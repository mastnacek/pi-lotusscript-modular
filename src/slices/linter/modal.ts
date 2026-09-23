import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  CURSOR_MARKER,
  type Focusable,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { ProcedureLintItem } from "../../shared/types.js";

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
  private instructionsText = "";
  private instructionsCursor = 0;
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
          instructions: this.instructionsText.trim(),
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

  private handleTextEditing(data: string): void {
    if (matchesKey(data, "backspace")) {
      if (this.instructionsCursor > 0) {
        this.instructionsText =
          this.instructionsText.slice(0, this.instructionsCursor - 1) +
          this.instructionsText.slice(this.instructionsCursor);
        this.instructionsCursor--;
      }
      return;
    }
    if (matchesKey(data, "delete")) {
      if (this.instructionsCursor < this.instructionsText.length) {
        this.instructionsText =
          this.instructionsText.slice(0, this.instructionsCursor) +
          this.instructionsText.slice(this.instructionsCursor + 1);
      }
      return;
    }
    if (matchesKey(data, "left")) {
      this.instructionsCursor = Math.max(0, this.instructionsCursor - 1);
      return;
    }
    if (matchesKey(data, "right")) {
      this.instructionsCursor = Math.min(
        this.instructionsText.length,
        this.instructionsCursor + 1
      );
      return;
    }
    if (matchesKey(data, "home")) {
      this.instructionsCursor = 0;
      return;
    }
    if (matchesKey(data, "end")) {
      this.instructionsCursor = this.instructionsText.length;
      return;
    }
    if (
      data.length >= 1 &&
      !data.includes("\x1b") &&
      !data.includes("\r") &&
      !data.includes("\n")
    ) {
      this.instructionsText =
        this.instructionsText.slice(0, this.instructionsCursor) +
        data +
        this.instructionsText.slice(this.instructionsCursor);
      this.instructionsCursor += data.length;
    }
  }

  handleInput(data: string): void {
    if (this.handleScroll(data)) return;
    if (this.handleNavigation(data)) return;
    if (this.handleQuickKeys(data)) return;
    if (this.selected === 2) {
      this.handleTextEditing(data);
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

  private renderInputDisplay(): string {
    const th = this.theme;
    if (this.selected === 2) {
      if (this.instructionsText.length === 0) {
        const marker = this.focused ? CURSOR_MARKER : "";
        return `${marker}\x1b[7m \x1b[27m${th.fg("dim", " (zde napište pokyny k rozdělení)")}`;
      }
      const before = this.instructionsText.slice(0, this.instructionsCursor);
      const cursorChar =
        this.instructionsCursor < this.instructionsText.length
          ? this.instructionsText[this.instructionsCursor]
          : " ";
      const after = this.instructionsText.slice(this.instructionsCursor + 1);
      const marker = this.focused ? CURSOR_MARKER : "";
      return `${before}${marker}\x1b[7m${cursorChar}\x1b[27m${after}`;
    }
    return this.instructionsText.length === 0
      ? th.fg("dim", "Pokyny: (Enter pro zadání)")
      : `Pokyny: ${this.instructionsText}`;
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

    actionRows[0] = rows.length;
    this.pushWrapped(
      rows,
      `${this.selected === 0 ? "  ▶ " : "    "}${this.selected === 0 ? th.fg("accent", "✅ [Povolit výjimku]") : th.fg("text", "✅ [Povolit výjimku]")} ${th.fg("dim", "— schválit mírné překročení a pokračovat")}`,
      innerW
    );

    actionRows[1] = rows.length;
    this.pushWrapped(
      rows,
      `${this.selected === 1 ? "  ▶ " : "    "}${this.selected === 1 ? th.fg("accent", "✂️ [Odmítnout a rozdělit]") : th.fg("text", "✂️ [Odmítnout a rozdělit]")} ${th.fg("dim", "— vrátit AI pokyn k rozdělení na menší sub/funkce")}`,
      innerW
    );

    actionRows[2] = rows.length;
    this.pushWrapped(
      rows,
      `${this.selected === 2 ? "  ▶ " : "    "}${this.selected === 2 ? th.fg("accent", "✏️ [Pokyny k rozdělení]") : th.fg("text", "✏️ [Pokyny k rozdělení]")} ${this.renderInputDisplay()}`,
      innerW
    );

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

/**
 * Prompts user to approve line limit excess or request logical splitting.
 */
export async function promptProcedureLineReview(
  ctx: ExtensionContext,
  item: ProcedureLintItem
): Promise<ProcedureReviewResult> {
  if (!ctx.hasUI || (ctx.mode && ctx.mode !== "tui")) {
    return { action: "reject" };
  }

  const result = await ctx.ui.custom<ProcedureReviewResult | undefined>(
    (tui, theme, _keybindings, done) =>
      new ProcedureLimitComponent(
        theme,
        item,
        done,
        tui.terminal.columns,
        tui.terminal.rows
      ),
    {
      overlay: true,
      overlayOptions: { width: "90%", maxHeight: "90%", margin: 1 },
    }
  );

  if (!result || result.action === "reject") {
    return { action: "reject" };
  }

  if (result.action === "approve") {
    return { action: "approve" };
  }

  if (result.action === "split_instructions") {
    let instructions = result.instructions.trim();
    if (!instructions) {
      const inputVal = await ctx.ui.input(
        `✏️ Pokyny pro rozdělení procedury '${item.fileName}':`,
        "Napište, jak má AI proceduru rozdělit (např. vyčleň HTTP volání nebo databázové dotazy)..."
      );
      if (!inputVal || !inputVal.trim()) {
        return { action: "reject" };
      }
      instructions = inputVal.trim();
    }
    return { action: "split_instructions", instructions };
  }

  return { action: "reject" };
}