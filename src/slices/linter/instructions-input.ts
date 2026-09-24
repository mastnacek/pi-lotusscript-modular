/**
 * Instructions text input — backspace/delete/arrow/home/end editing plus the
 * inline cursor rendering used by the procedure-limit modal's third action.
 * Extracted from linter/modal.ts so each module stays under the per-file limit.
 */

import { CURSOR_MARKER, matchesKey } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

/** Editable single-line buffer for split instructions inside the modal. */
export class InstructionsInput {
  text = "";
  cursor = 0;

  /** Consumes editing keys; returns true when the input was touched. */
  handleInput(data: string): boolean {
    if (matchesKey(data, "backspace")) {
      if (this.cursor > 0) {
        this.text = this.text.slice(0, this.cursor - 1) + this.text.slice(this.cursor);
        this.cursor--;
      }
      return true;
    }
    if (matchesKey(data, "delete")) {
      if (this.cursor < this.text.length) {
        this.text = this.text.slice(0, this.cursor) + this.text.slice(this.cursor + 1);
      }
      return true;
    }
    if (matchesKey(data, "left")) {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }
    if (matchesKey(data, "right")) {
      this.cursor = Math.min(this.text.length, this.cursor + 1);
      return true;
    }
    if (matchesKey(data, "home")) {
      this.cursor = 0;
      return true;
    }
    if (matchesKey(data, "end")) {
      this.cursor = this.text.length;
      return true;
    }
    if (
      data.length >= 1 &&
      !data.includes("\x1b") &&
      !data.includes("\r") &&
      !data.includes("\n")
    ) {
      this.text = this.text.slice(0, this.cursor) + data + this.text.slice(this.cursor);
      this.cursor += data.length;
      return true;
    }
    return false;
  }

  /** Renders the input row: placeholder when empty, cursor marker when active. */
  render(th: Theme, active: boolean, focused: boolean): string {
    if (this.text.length === 0) {
      const marker = focused ? CURSOR_MARKER : "";
      return `${marker}\x1b[7m \x1b[27m${th.fg("dim", " (zde napište pokyny k rozdělení)")}`;
    }
    const before = this.text.slice(0, this.cursor);
    const cursorChar =
      this.cursor < this.text.length ? this.text[this.cursor] : " ";
    const after = this.text.slice(this.cursor + 1);
    const marker = focused ? CURSOR_MARKER : "";
    return `${before}${marker}\x1b[7m${cursorChar}\x1b[27m${after}`;
  }
}