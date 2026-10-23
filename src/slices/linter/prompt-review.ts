/**
 * Prompt helper for the procedure line-limit modal (UI-context wrapper).
 * Split out of linter/modal.ts so each module stays under the per-file limit.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ProcedureLintItem } from "../../shared/types.js";
import { stringsFor, type Strings } from "../../shared/i18n.js";
import { ProcedureLimitComponent, type ProcedureReviewResult } from "./modal.js";

/**
 * Prompts user to approve line limit excess or request logical splitting.
 */
export async function promptProcedureLineReview(
  ctx: ExtensionContext,
  item: ProcedureLintItem,
  strings: Strings = stringsFor(undefined)
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
        tui.terminal.rows,
        strings
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

  if (result.action !== "split_instructions") return { action: "reject" };

  let instructions = result.instructions.trim();
  if (!instructions) {
    const inputVal = await ctx.ui.input(
      strings.limitModal.inputPrompt(item.procedureName),
      strings.limitModal.inputDialogPlaceholder
    );
    if (!inputVal || !inputVal.trim()) {
      return { action: "reject" };
    }
    instructions = inputVal.trim();
  }
  return { action: "split_instructions", instructions };
}
