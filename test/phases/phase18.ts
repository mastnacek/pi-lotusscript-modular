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

  // --- 91: KB consulted, nothing mutated, or setting off → settle untouched ---
  const s2 = createPluginState();
  s2.beginRun();
  s2.notesMutatedThisRun = true;
  s2.kbConsultedThisRun = true;
  const kbOk = handleAgentBeforeSettle(s2) === undefined;

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
    "no nudge when KB was consulted in the run, nothing mutated, or verifyKbBeforeSettle is off",
    kbOk && noMutationOk && disabledOk
  );

  // --- 92: beginRun() re-arms the gate for the next run ---
  s1.beginRun();
  const flagsReset =
    s1.kbConsultedThisRun === false &&
    s1.notesMutatedThisRun === false &&
    s1.settleKbNudgeSent === false;
  s1.notesMutatedThisRun = true;
  const r2 = handleAgentBeforeSettle(s1);
  report(
    "92",
    "beginRun() resets per-run flags so the next run is verified again",
    flagsReset && r2?.continue === true
  );
}
