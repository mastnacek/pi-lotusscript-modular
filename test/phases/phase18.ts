/**
 * Phase 18 (tests 89–92): agent_before_settle — the verify-before-done KB gate.
 *
 * A run that mutated .lss/.dxl sources without a kb_search on 'lotus-notes'
 * gets exactly one injected verification turn (continue:true + custom_message);
 * a run with a KB consult, no mutation, a disabled setting, or an already-sent
 * nudge settles untouched.
 */

import { createPluginState } from "../../src/shared/state.js";
import { handleAgentBeforeSettle } from "../../src/slices/pipeline/index.js";

function report(num: string, label: string, ok: boolean): void {
  console.log(`${num}. ${label}:`, ok ? "PASS" : "FAIL");
  if (!ok) throw new Error(`Phase 18 check ${num} failed: ${label}`);
}

export async function phase18(): Promise<void> {
  // --- 89: mutation without KB consult → one verification turn ---
  const s1 = createPluginState();
  s1.beginRun();
  s1.notesMutatedThisRun = true;
  const r1 = handleAgentBeforeSettle(s1);
  const entry = r1?.entries?.[0];
  report(
    "89",
    "handleAgentBeforeSettle injects continue:true + English custom_message when a run mutated .lss/.dxl without kb_search",
    r1?.continue === true &&
      entry?.type === "custom_message" &&
      entry.customType === "lotusscript-kb-verify" &&
      entry.display === false &&
      typeof entry.content === "string" &&
      entry.content.includes("kb_search") &&
      !/[áčďéěíňóřšťúůýž]/i.test(entry.content) && // model-facing text stays English
      s1.telemetry.kbSettleNudges === 1
  );

  // --- 90: one-shot latch — a second settle in the same run adds nothing ---
  const r1b = handleAgentBeforeSettle(s1);
  report("90", "the nudge is one-shot per run (settleKbNudgeSent latch)", r1b === undefined);

  // --- 91: KB satisfied (≥ min queries), nothing mutated, or setting off → settle untouched ---
  const s2 = createPluginState();
  s2.beginRun();
  s2.notesMutatedThisRun = true;
  s2.recordKbQuery("NotesDocument Save");
  s2.recordKbQuery("Guirard view performance");
  s2.recordKbQuery("type mismatch error");
  const kbOk = handleAgentBeforeSettle(s2) === undefined;

  // ...but below the per-run minimum the nudge still fires, reporting progress
  const s2b = createPluginState();
  s2b.beginRun();
  s2b.notesMutatedThisRun = true;
  s2b.recordKbQuery("NotesDocument Save");
  const partial = handleAgentBeforeSettle(s2b);
  const partialContent = typeof partial?.entries?.[0] === "object" && "content" in partial.entries[0]
    ? String((partial.entries[0] as { content: unknown }).content)
    : "";
  const partialOk = partial?.continue === true && partialContent.includes("1/3");

  const s3 = createPluginState();
  s3.beginRun();
  const noMutationOk = handleAgentBeforeSettle(s3) === undefined;

  const s4 = createPluginState();
  s4.beginRun();
  s4.config = { ...s4.config, verifyKbBeforeSettle: false };
  s4.notesMutatedThisRun = true;
  const disabledOk = handleAgentBeforeSettle(s4) === undefined;
  report(
    "91",
    "no nudge when the run made ≥3 KB queries, nothing mutated, or verifyKbBeforeSettle is off; below-minimum runs get a progress-aware nudge",
    kbOk && partialOk && noMutationOk && disabledOk
  );

  // --- 92: beginRun() re-arms the gate for the next run ---
  s1.beginRun();
  // Read through join() so TS literal narrowing on the earlier assignments
  // cannot flag the expected reset values as impossible comparisons.
  const flagsReset =
    [s1.kbQueriesThisRun.length, s1.notesMutatedThisRun, s1.settleKbNudgeSent].join(",") ===
    "0,false,false";
  s1.notesMutatedThisRun = true;
  const r2 = handleAgentBeforeSettle(s1);
  report(
    "92",
    "beginRun() resets per-run flags so the next run is verified again",
    flagsReset && r2?.continue === true
  );
}
