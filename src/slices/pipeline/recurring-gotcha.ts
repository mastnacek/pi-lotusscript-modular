/**
 * Recurring-failure gotcha drafting — normalizes LSP diagnostics, detects
 * genuine repeats across compile cycles and drives the user-approval modal.
 * Split out of pipeline/tool-result.ts for the per-file limit.
 *
 * Cross-slice capabilities (scorecard / gotchas) arrive via PipelineDeps
 * wired in the composition root — slices never import each other (VSA).
 * User-facing notify text resolves through the i18n string table; the
 * returned notice is model-facing and stays English (§10).
 */

import path from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { LspCheckResult } from "../../shared/types.js";
import { stringsFor } from "../../shared/i18n.js";
import type { PipelineDeps } from "./deps.js";
import type { PluginState } from "../../shared/state.js";

/** Detects recurring diagnostic signatures and runs the gotcha draft flow. */
export async function draftRecurringGotcha(
  state: PluginState,
  ctx: ExtensionContext,
  deps: PipelineDeps,
  modularRoot: string,
  resolved: string,
  lspResult: LspCheckResult
): Promise<string> {
  const signatures = deps.normalizeDiagnostics(lspResult.diagnostics);
  if (signatures.length === 0) return "";

  const history = state.diagnosticHistory.get(modularRoot) ?? [];
  const recurring = deps.findRecurringSignatures(signatures, history, 2);
  state.diagnosticHistory.set(modularRoot, [...history, signatures].slice(-10));

  const fresh = recurring.filter(
    (s) => !state.recurringGotchaReported.has(`${modularRoot}:${s}`)
  );

  if (fresh.length === 0) return "";

  const reviewCtx = ctx ?? state.latestUiContext;
  const draft = deps.buildRecurringGotchaDraft(
    path.basename(modularRoot),
    fresh,
    [path.basename(resolved)]
  );

  if (!reviewCtx || !reviewCtx.hasUI) {
    return `\n♻️ RECURRING FAILURE (${fresh.length} signature(s)) detected, but no UI is available to approve a gotcha draft. Record it via lotusscript_gotchas(action: "add", ...).`;
  }

  for (const s of fresh) state.recurringGotchaReported.add(`${modularRoot}:${s}`);
  const ui = stringsFor(state.config.lang).recurring;
  const review = await deps.promptGotchaReview(reviewCtx, draft.title, draft.body, stringsFor(state.config.lang));

  if (review.action === "save") {
    const created = deps.addGotcha(draft.title, draft.body);
    reviewCtx.ui.notify(ui.saved(created.title), "info");
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

  reviewCtx.ui.notify(ui.declined, "warning");
  return "\n♻️ Recurring failure detected; the user declined to record a gotcha for it.";
}