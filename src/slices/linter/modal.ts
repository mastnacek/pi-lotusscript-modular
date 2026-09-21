import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  CURSOR_MARKER,
  type Focusable,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { ProcedureLintItem } from "../../shared/types.js";

export type ProcedureReviewResult =
  | { action: "approve" }
  | { action: "reject" }
  | { action: "split_instructions"; instructions: string };

/**
 * TUI Overlay modal component for reviewing procedure line limit excess.
 */
export class ProcedureLimitComponent implements Focusable {
  readonly width = 76;

  /** Focusable interface for hardware cursor tracking and IME support */
  focused = true;

  private selected = 0; // 0 = approve exception, 1 = reject/split, 2 = split instructions
  private instructionsText = "";
  private instructionsCursor = 0;

  constructor(
    private readonly theme: Theme,
    private readonly item: ProcedureLintItem,
    private readonly done: (result: ProcedureReviewResult) => void
  ) {}

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
    if (this.handleNavigation(data)) return;
    if (this.handleQuickKeys(data)) return;
    if (this.selected === 2) {
      this.handleTextEditing(data);
    }
  }

  private padRow(content: string, innerW: number): string {
    let c = content;
    const vis = visibleWidth(c);
    if (vis > innerW) {
      c = truncateToWidth(c, innerW);
    }
    const visAfter = visibleWidth(c);
    const padding = " ".repeat(Math.max(0, innerW - visAfter));
    return this.theme.fg("border", "│") + c + padding + this.theme.fg("border", "│");
  }

  private renderHeader(innerW: number): string[] {
    const th = this.theme;
    return [
      th.fg("border", `╭${"─".repeat(innerW)}╮`),
      this.padRow(
        ` ${th.fg("accent", "🪷 LotusScript Linter")} ${th.fg("dim", "·")} ${th.fg("warning", "Překročení limitu délky procedury 📏")}`,
        innerW
      ),
      th.fg("border", `├${"─".repeat(innerW)}┤`),
    ];
  }

  private renderStats(innerW: number): string[] {
    const th = this.theme;
    const diff = this.item.lineCount - this.item.maxLines;
    const rows: string[] = [
      this.padRow(` ${th.fg("dim", "📌 Procedura:")} ${th.fg("accent", this.item.fileName)} ${th.fg("dim", `(${this.item.procedureName})`)}`, innerW),
      this.padRow(
        ` ${th.fg("dim", "📊 Počet řádků:")} ${th.fg("warning", String(this.item.lineCount))} ${th.fg("dim", `/ limit:`)} ${this.item.maxLines} ${th.fg("error", `(+${diff} řádků nad limit)`)}`,
        innerW
      ),
      this.padRow(
        ` ${th.fg("dim", "⚠️  Riziko:")} ${th.fg("warning", "LotusScript 32 KB bytecode limit procedury ('Script structure too large')")}`,
        innerW
      ),
    ];

    if (this.item.commentNotice) {
      rows.push(
        this.padRow(
          ` ${th.fg("dim", "ℹ️  Komentáře:")} ${th.fg("dim", this.item.commentNotice)}`,
          innerW
        )
      );
    }

    rows.push(th.fg("border", `├${"─".repeat(innerW)}┤`));
    return rows;
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

  private renderActions(innerW: number): string[] {
    const th = this.theme;
    const is0 = this.selected === 0;
    const is1 = this.selected === 1;
    const is2 = this.selected === 2;

    const row0 = `${is0 ? "  ▶ " : "    "}${is0 ? th.fg("accent", "✅ [Povolit výjimku]") : th.fg("text", "✅ [Povolit výjimku]")} ${th.fg("dim", "— schválit mírné překročení a pokračovat")}`;
    const row1 = `${is1 ? "  ▶ " : "    "}${is1 ? th.fg("accent", "✂️ [Odmítnout a rozdělit]") : th.fg("text", "✂️ [Odmítnout a rozdělit]")} ${th.fg("dim", "— vrátit AI pokyn k rozdělení na menší sub/funkce")}`;
    const row2 = `${is2 ? "  ▶ " : "    "}${is2 ? th.fg("accent", "✏️ [Pokyny k rozdělení]") : th.fg("text", "✏️ [Pokyny k rozdělení]")} ${this.renderInputDisplay()}`;

    return [
      this.padRow(` ${th.fg("dim", "🎯 Zvolte akci (vyberte šipkami ↑ / ↓ a potvrďte klávesou Enter):")}`, innerW),
      this.padRow("", innerW),
      this.padRow(row0, innerW),
      this.padRow(row1, innerW),
      this.padRow(row2, innerW),
      this.padRow("", innerW),
    ];
  }

  private renderFooter(innerW: number): string[] {
    const th = this.theme;
    return [
      this.padRow(
        ` ${th.fg("dim", "💡 ↑↓ navigace • Enter potvrdit • Esc zamítnout • psaním zadáváte pokyny")}`,
        innerW
      ),
      th.fg("border", `╰${"─".repeat(innerW)}╯`),
    ];
  }

  render(_width: number): string[] {
    const innerW = this.width - 2;
    return [
      ...this.renderHeader(innerW),
      ...this.renderStats(innerW),
      ...this.renderActions(innerW),
      ...this.renderFooter(innerW),
    ];
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
  if (!ctx.hasUI) {
    return { action: "reject" };
  }

  const result = await ctx.ui.custom<ProcedureReviewResult | undefined>(
    (_tui, theme, _keybindings, done) =>
      new ProcedureLimitComponent(theme, item, done),
    { overlay: true }
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
