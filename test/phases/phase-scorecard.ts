/**
 * Phase: scorecard — deterministic grading of ONE whole-file check.
 * The modular items (manifest sync, assembled artifact) must be gone.
 */

import { DEFAULT_CONFIG } from "../../src/shared/config.js";
import type { FileLintResult, LspCheckResult, ProcedureLintItem } from "../../src/shared/types.js";
import {
  buildGradingRubric,
  computeScorecard,
  formatScorecard,
  normalizeDiagnostics,
  findRecurringSignatures,
  buildRecurringGotchaDraft,
  trendLabel,
} from "../../src/slices/scorecard/index.js";

function proc(name: string, lines: number, commented = true): ProcedureLintItem {
  return {
    filePath: "C:/tmp/Agent.lss",
    procedureName: name,
    startLine: 10,
    lineCount: lines,
    maxLines: 300,
    isExceeded: lines > 300,
    hasDocComment: commented,
  };
}

function lint(items: ProcedureLintItem[]): FileLintResult {
  return {
    ok: items.every((i) => !i.isExceeded),
    exceededProcedures: items.filter((i) => i.isExceeded),
    missingCommentProcedures: items.filter((i) => !i.hasDocComment),
    allItems: items,
  };
}

export async function phaseScorecard(): Promise<void> {
  const cfg = DEFAULT_CONFIG;

  // 1. A pristine whole file scores full marks.
  const clean = computeScorecard({
    agent: "Agent.lss",
    maxProcedureLines: cfg.maxProcedureLines,
    lint: lint([proc("Initialize", 20), proc("Process", 40)]),
    lsp: { ok: true, diagnostics: "", errorCount: 0, warningCount: 0 } as LspCheckResult,
    lspEnabled: true,
    enforceCzechComments: true,
    kbExpected: false,
    kbSearchCount: 0,
    minKbSearches: 3,
  });
  const okClean = clean.score === clean.max && clean.items.every((i) => i.ok);
  console.log("1. clean whole file scores full marks:", okClean ? "PASS" : "FAIL");
  if (!okClean) throw new Error(`Unexpected clean scorecard: ${JSON.stringify(clean.items)}`);

  // 2. Modular DoD items are gone; whole-file items remain.
  const ids = clean.items.map((i) => i.id);
  const okNoModular = !ids.includes("manifest-sync") && !ids.includes("artifact");
  console.log("2. manifest/artifact DoD items are gone:", okNoModular ? "PASS" : "FAIL");
  if (!okNoModular) throw new Error(`Modular items still graded: ${JSON.stringify(ids)}`);
  const okItems = ids.includes("proc-limit") && ids.includes("proc-comments") && ids.includes("lsp-clean");
  console.log("3. procedure/comments/LSP items remain:", okItems ? "PASS" : "FAIL");
  if (!okItems) throw new Error(`Missing whole-file items: ${JSON.stringify(ids)}`);

  // 4. Failures cost points and appear in the rendered block.
  const failed = computeScorecard({
    agent: "Agent.lss",
    maxProcedureLines: cfg.maxProcedureLines,
    lint: lint([proc("Huge", 400), proc("Uncommented", 10, false)]),
    lsp: { ok: false, diagnostics: "LS-0xd028 line 12", errorCount: 1, warningCount: 0 },
    lspEnabled: true,
    enforceCzechComments: true,
    kbExpected: true,
    kbSearchCount: 1,
    minKbSearches: 3,
  });
  const text = formatScorecard(failed);
  const okFail = failed.score < failed.max && text.includes("Remaining:") && text.includes("Huge (400)");
  console.log("4. failures are graded and rendered with detail:", okFail ? "PASS" : "FAIL");
  if (!okFail) throw new Error(`Unexpected failure rendering:\n${text}`);

  // 5. Trend line wording is check-based, not compile-based.
  const trend = trendLabel(
    { ...clean, score: 8 },
    { ...clean, score: 5 }
  );
  const okTrend = trend.includes("+3") && trend.includes("since last check");
  console.log("5. trend line reports change since last check:", okTrend ? "PASS" : "FAIL");
  if (!okTrend) throw new Error(`Bad trend: ${trend}`);

  // 6. A not-run LSP check is pending, never a failure.
  const pending = computeScorecard({
    agent: "Agent.lss",
    maxProcedureLines: cfg.maxProcedureLines,
    lint: lint([proc("Initialize", 20)]),
    lsp: null,
    lspEnabled: true,
    enforceCzechComments: true,
    kbExpected: false,
    kbSearchCount: 0,
    minKbSearches: 3,
  });
  const lspItem = pending.items.find((i) => i.id === "lsp-clean")!;
  const okPending = lspItem.pending === true && !lspItem.ok;
  console.log("6. an absent LSP result is pending, not failed:", okPending ? "PASS" : "FAIL");
  if (!okPending) throw new Error(`LSP item was graded as ${JSON.stringify(lspItem)}`);

  // 7. Rubric describes the whole-file DoD and forbids modular folders.
  // enableLsp must be on for the whole-file LSP rule to appear in the rubric.
  const rubric = buildGradingRubric({ ...cfg, enableLsp: true });
  const okRubric =
    rubric.includes("DEFINITION OF DONE") &&
    rubric.includes("whole .lss") &&
    rubric.includes("INSTANT FAILURE") &&
    rubric.includes("modular folder") &&
    !rubric.includes("manifest.json compilationOrder matches");
  console.log("7. rubric is whole-file and forbids modular folders:", okRubric ? "PASS" : "FAIL");
  if (!okRubric) throw new Error(`Unexpected rubric:\n${rubric}`);

  // 8. Recurring-signature normalisation ignores coordinates.
  const a = normalizeDiagnostics("LS-0xd028 line 4 col 9: Not a member: NOPE");
  const b = normalizeDiagnostics("LS-0xd028 line 91 col 2: Not a member: NOPE");
  const okNorm = a.length === 1 && a[0] === b[0];
  console.log("8. diagnostics normalise to a location-free signature:", okNorm ? "PASS" : "FAIL");
  if (!okNorm) throw new Error(`Normalisation differs: ${JSON.stringify([a, b])}`);

  // 9. Repeats across cycles are detected and drafted for approval.
  const recurring = findRecurringSignatures(a, [a], 2);
  const draft = buildRecurringGotchaDraft("Agent.lss", recurring, ["Agent.lss"]);
  const okDraft = recurring.length === 1 && draft.title.length > 0 && draft.body.length > 0;
  console.log("9. recurring failure produces a gotcha draft:", okDraft ? "PASS" : "FAIL");
  if (!okDraft) throw new Error("no recurring draft was produced");
}
