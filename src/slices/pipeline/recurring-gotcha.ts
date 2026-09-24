/**
 * Recurring-failure gotcha drafting — normalizes LSP diagnostics, detects
 * genuine repeats across compile cycles and drives the user-approval modal.
 * Split out of pipeline/tool-result.ts for the per-file limit.
 */

import path from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { LspCheckResult } from "../../shared/types.js";
import { addGotcha, promptGotchaReview } from "../gotchas/index.js";
import {
  buildRecurringGotchaDraft,
  findRecurringSignatures,
  normalizeDiagnostics,
} from "../scorecard/index.js";
import type { PluginState } from "../../shared/state.js";

/** Detects recurring diagnostic signatures and runs the gotcha draft flow. */
export async function draftRecurringGotcha(
  state: PluginState,
  ctx: ExtensionContext,
  modularRoot: string,
  resolved: string,
  lspResult: LspCheckResult
): Promise<string> {
  const signatures = normalizeDiagnostics(lspResult.diagnostics);
  if (signatures.length === 0) return "";

  const history = state.diagnosticHistory.get(modularRoot) ?? [];
  const recurring = findRecurringSignatures(signatures, history, 2);
  state.diagnosticHistory.set(modularRoot, [...history, signatures].slice(-10));

  const fresh = recurring.filter(
    (s) => !state.recurringGotchaReported.has(`${modularRoot}:${s}`)
  );

  if (fresh.length === 0) return "";

  const reviewCtx = ctx ?? state.latestUiContext;
  const draft = buildRecurringGotchaDraft(
    path.basename(modularRoot),
    fresh,
    [path.basename(resolved)]
  );

  if (!reviewCtx || !reviewCtx.hasUI) {
    return `\n♻️ RECURRING FAILURE (${fresh.length} signature(s)) detected, but no UI is available to approve a gotcha draft. Record it via lotusscript_gotchas(action: "add", ...).`;
  }

  for (const s of fresh) state.recurringGotchaReported.add(`${modularRoot}:${s}`);
  const review = await promptGotchaReview(reviewCtx, draft.title, draft.body);

  if (review.action === "save") {
    const created = addGotcha(draft.title, draft.body);
    reviewCtx.ui.notify(`✓ Opakovaná chyba uložena jako gotcha: ${created.title}`, "info");
    return `\n♻️ Recurring failure recorded as a gotcha: ${created.title}`;
  }

  if (review.action === "rewrite") {
    return [
      "",
      "♻️ RECURRING FAILURE — the user wants this gotcha rewritten before saving.",
      `Draft title: ${draft.title}`,
      `User instructions: "${review.instructions}"`,
      'Call lotusscript_gotchas(action: "add", title: "...", body: "...") with the revised text.',
    ].join("\n");
  }

  reviewCtx.ui.notify("Opakovaná chyba nebyla uložena jako gotcha.", "warning");
  return "\n♻️ Recurring failure detected; the user declined to record a gotcha for it.";
}