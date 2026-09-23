import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  CURSOR_MARKER,
  type Focusable,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

export type GotchaReviewResult =
  | { action: "save" }
  | { action: "cancel" }
  | { action: "rewrite"; instructions: string };

/**
 * Modal overlay component for manual review and approval of proposed LotusScript gotchas.
 */
export class GotchaReviewComponent implements Focusable {
  readonly width = 76;

  /** Focusable interface for hardware cursor tracking and IME support */
  focused = true;

  private selected = 0; // 0 = save, 1 = cancel, 2 = rewrite
  private instructionsText = "";
  private instructionsCursor = 0;

  constructor(
    private readonly theme: Theme,
    private readonly title: string,
    private readonly body: string,
    private readonly done: (result: GotchaReviewResult) => void
  ) {}

  private handleNavigation(data: string): boolean {
    if (matchesKey(data, "escape")) {
      this.done({ action: "cancel" });
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
        this.done({ action: "save" });
      } else if (this.selected === 1) {
        this.done({ action: "cancel" });
      } else {
        this.done({ action: "rewrite", instructions: this.instructionsText.trim() });
      }
      return true;
    }
    return false;
  }

  private handleQuickKeys(data: string): boolean {
    if (this.selected === 2) return false;
    const lower = data.toLowerCase();
    if (lower === "s" || lower === "u") {
      this.done({ action: "save" });
      return true;
    }
    if (lower === "c" || lower === "z") {
      this.done({ action: "cancel" });
      return true;
    }
    if (lower === "r" || lower === "p") {
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
      this.instructionsCursor = Math.min(this.instructionsText.length, this.instructionsCursor + 1);
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
    if (data.length >= 1 && !data.includes("\x1b") && !data.includes("\r") && !data.includes("\n")) {
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
        ` ${th.fg("accent", "🪷 LotusScript Gotchas")} ${th.fg("dim", "·")} ${th.fg("warning", "Schválení nového záznamu 💡")}`,
        innerW
      ),
      th.fg("border", `├${"─".repeat(innerW)}┤`),
    ];
  }

  private renderTitle(innerW: number): string[] {
    const th = this.theme;
    const rows = [this.padRow(` ${th.fg("dim", "📌 Návrh názvu:")}`, innerW)];
    for (const line of wrapTextWithAnsi(this.title, innerW - 6)) {
      rows.push(this.padRow(`    ${th.fg("accent", line)}`, innerW));
    }
    rows.push(this.padRow("", innerW));
    return rows;
  }

  private renderBody(innerW: number): string[] {
    const th = this.theme;
    const rows = [this.padRow(` ${th.fg("dim", "📋 Návrh popisu / těla gotchy:")}`, innerW)];
    const rawLines = this.body.split(/\r?\n/);
    const wrapped: string[] = [];
    for (const bLine of rawLines) {
      if (bLine.trim() === "") {
        wrapped.push("");
      } else {
        wrapped.push(...wrapTextWithAnsi(bLine, innerW - 6));
      }
    }

    const maxPreview = 6;
    for (const pLine of wrapped.slice(0, maxPreview)) {
      rows.push(this.padRow(`    ${th.fg("text", pLine)}`, innerW));
    }
    if (wrapped.length > maxPreview) {
      rows.push(this.padRow(`    ${th.fg("dim", `... (+ ${wrapped.length - maxPreview} dalších řádků)`)}`, innerW));
    }
    rows.push(th.fg("border", `├${"─".repeat(innerW)}┤`));
    return rows;
  }

  private renderInputDisplay(): string {
    const th = this.theme;
    if (this.selected === 2) {
      if (this.instructionsText.length === 0) {
        const marker = this.focused ? CURSOR_MARKER : "";
        return `${marker}\x1b[7m \x1b[27m${th.fg("dim", " (napište pokyny pro AI)")}`;
      }
      const before = this.instructionsText.slice(0, this.instructionsCursor);
      const cursorChar = this.instructionsCursor < this.instructionsText.length
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

    const row0 = `${is0 ? "  ▶ " : "    "}${is0 ? th.fg("accent", "💾 [Uložit gotchu]") : th.fg("text", "💾 [Uložit gotchu]")} ${th.fg("dim", "— schválit a zapsat do registru")}`;
    const row1 = `${is1 ? "  ▶ " : "    "}${is1 ? th.fg("accent", "❌ [Zrušit návrh]") : th.fg("text", "❌ [Zrušit návrh]")} ${th.fg("dim", "— odmítnout a neukládat do báze")}`;
    const row2 = `${is2 ? "  ▶ " : "    "}${is2 ? th.fg("accent", "✏️ [Přepsat]") : th.fg("text", "✏️ [Přepsat]")} ${this.renderInputDisplay()}`;

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
      this.padRow(` ${th.fg("dim", "💡 ↑↓ navigace • Enter potvrdit • Esc zrušit • psaním píšete pokyny")}`, innerW),
      th.fg("border", `╰${"─".repeat(innerW)}╯`),
    ];
  }

  render(_width: number): string[] {
    const innerW = this.width - 2;
    return [
      ...this.renderHeader(innerW),
      ...this.renderTitle(innerW),
      ...this.renderBody(innerW),
      ...this.renderActions(innerW),
      ...this.renderFooter(innerW),
    ];
  }

  invalidate(): void {}
  dispose(): void {}
}

/**
 * Prompts the user with an interactive modal dialog to review a proposed gotcha.
 * Requires explicit user approval before anything can be saved.
 */
export async function promptGotchaReview(
  ctx: ExtensionContext,
  title: string,
  body: string
): Promise<GotchaReviewResult> {
  if (!ctx.hasUI || (ctx.mode && ctx.mode !== "tui")) {
    return { action: "cancel" };
  }

  const result = await ctx.ui.custom<GotchaReviewResult | undefined>(
    (_tui, theme, _keybindings, done) =>
      new GotchaReviewComponent(theme, title, body, done),
    { overlay: true }
  );

  if (!result || result.action === "cancel") {
    return { action: "cancel" };
  }

  if (result.action === "save") {
    return { action: "save" };
  }

  if (result.action === "rewrite") {
    let instructions = result.instructions.trim();
    // If the user selected rewrite but didn't type inline instructions, prompt via standard input dialog
    if (!instructions) {
      const inputVal = await ctx.ui.input(
        "✏️ Instrukce pro přepsání gotchy AI:",
        "Napište, co má AI v návrhu upravit, doplnit nebo přepsat..."
      );
      if (!inputVal || !inputVal.trim()) {
        return { action: "cancel" };
      }
      instructions = inputVal.trim();
    }
    return { action: "rewrite", instructions };
  }

  return { action: "cancel" };
}
