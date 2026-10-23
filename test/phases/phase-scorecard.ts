/**
 * Phase: scorecard — deterministic grading of ONE whole-file check.
 * Modular items (manifest sync, assembled artifact) and the procedure-length
 * item must all be gone; comments, LSP and KB remain.
 */

import { DEFAULT_CONFIG } from "../../src/shared/config.js";
import type { LspCheckResult } from "../../src/shared/types.js";
import {
  buildGradingRubric,
  computeScorecard,
  formatScorecard,
  normalizeDiagnostics,
  findRecurringSignatures,
  buildRecurringGotchaDraft,
  trendLabel,
} from "../../src/slices/scorecard/index.js";

export async function phaseScorecard(): Promise<void> {
  const cfg = DEFAULT_CONFIG;

  // 1. A clean whole file scores full marks.
  const clean = computeScorecard({
    agent: "Agent.lss",
    lsp: { ok: true, diagnostics: "", errorCount: 0, warningCount: 0 } as LspCheckResult,
    lspEnabled: true,
    kbExpected: false,
    kbSearchCount: 0,
    minKbSearches: 3,
  });
  const okClean = clean.score === clean.max && clean.items.every((i) => i.ok);
  console.log("1. clean whole file scores full marks:", okClean ? "PASS" : "FAIL");
  if (!okClean) throw new Error(`Unexpected clean scorecard: ${JSON.stringify(clean.items)}`);

  // 2. No modular and no length items; comments + LSP remain.
  const ids = clean.items.map((i) => i.id);
  const banned = ["manifest-sync", "artifact", "proc-limit"];
  const present = banned.filter((id) => ids.includes(id));
  const okItems =
    present.length === 0 && ids.every((id) => id === "lsp-clean" || id === "kb-consulted");
  console.log(`2. no modular/length items (found: ${present.join(",") || "none"}):`, okItems ? "PASS" : "FAIL");
  if (!okItems) throw new Error(`Unexpected items: ${JSON.stringify(ids)}`);

  // 3. Failures cost points and appear in the rendered block.
  const failed = computeScorecard({
    agent: "Agent.lss",
    lsp: { ok: false, diagnostics: "LS-0xd028 line 12", errorCount: 1, warningCount: 0 },
    lspEnabled: true,
    kbExpected: true,
    kbSearchCount: 1,
    minKbSearches: 3,
  });
  const text = formatScorecard(failed);
  const okFail =
    failed.score < failed.max &&
    text.includes("Remaining:") &&
    text.includes("LS-0xd028") &&
    text.includes("KB consulted (1/3)");
  console.log("3. failures are graded and rendered with detail:", okFail ? "PASS" : "FAIL");
  if (!okFail) throw new Error(`Unexpected failure rendering:\n${text}`);

  // 4. Trend line wording is check-based.
  const trend = trendLabel({ ...clean, score: 8 }, { ...clean, score: 5 });
  const okTrend = trend.includes("+3") && trend.includes("since last check");
  console.log("4. trend line reports change since last check:", okTrend ? "PASS" : "FAIL");
  if (!okTrend) throw new Error(`Bad trend: ${trend}`);

  // 5. A not-run LSP check is pending, never a failure.
  const pending = computeScorecard({
    agent: "Agent.lss",
    lsp: null,
    lspEnabled: true,
    kbExpected: false,
    kbSearchCount: 0,
    minKbSearches: 3,
  });
  const lspItem = pending.items.find((i) => i.id === "lsp-clean")!;
  const okPending = lspItem.pending === true && !lspItem.ok;
  console.log("5. an absent LSP result is pending, not failed:", okPending ? "PASS" : "FAIL");
  if (!okPending) throw new Error(`LSP item was graded as ${JSON.stringify(lspItem)}`);

  // 6. Rubric is whole-file, has no line-limit rule, forbids modular folders.
  // enableLsp must be on for the whole-file LSP rule to appear in the rubric.
  const rubric = buildGradingRubric({ ...cfg, enableLsp: true });
  const okRubric =
    rubric.includes("DEFINITION OF DONE") &&
    rubric.includes("whole .lss") &&
    rubric.includes("INSTANT FAILURE") &&
    rubric.includes("modular folder") &&
    !/\d+ lines/.test(rubric) &&
    !/purpose comment/i.test(rubric) &&
    !/manifest\.json compilationOrder matches/.test(rubric);
  console.log("6. rubric has no length and no comment rule:", okRubric ? "PASS" : "FAIL");
  if (!okRubric) throw new Error(`Unexpected rubric:\n${rubric}`);

  // 7. Recurring-signature normalisation ignores coordinates (incl. columns).
  const a = normalizeDiagnostics("LS-0xd028 line 4 col 9: Not a member: NOPE");
  const b = normalizeDiagnostics("LS-0xd028 line 91 col 2: Not a member: NOPE");
  const okNorm = a.length === 1 && a[0] === b[0];
  console.log("7. diagnostics normalise to a location-free signature:", okNorm ? "PASS" : "FAIL");
  if (!okNorm) throw new Error(`Normalisation differs: ${JSON.stringify([a, b])}`);

  // 8. Repeats across cycles are detected and drafted for approval.
  const recurring = findRecurringSignatures(a, [a], 2);
  const draft = buildRecurringGotchaDraft("Agent.lss", recurring, ["Agent.lss"]);
  const okDraft = recurring.length === 1 && draft.title.length > 0 && draft.body.length > 0;
  console.log("8. recurring failure produces a gotcha draft:", okDraft ? "PASS" : "FAIL");
  if (!okDraft) throw new Error("no recurring draft was produced");
}
