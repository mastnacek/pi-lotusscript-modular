/**
 * Phase: pipeline — KB gate, whole-file auto-check on edit, read banner and
 * the verify-before-done settle nudge.
 */

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG } from "../../src/shared/config.js";
import { guardKbBeforeEdit } from "../../src/slices/guards/index.js";
import { handleToolResult } from "../../src/slices/pipeline/tool-result.js";
import { handleToolCall } from "../../src/slices/pipeline/tool-call.js";
import { handleAgentSettled } from "../../src/slices/pipeline/settled.js";
import { handleAgentBeforeSettle } from "../../src/slices/pipeline/before-settle.js";
import { MUTATING_TOOL_NAMES } from "../../src/slices/pipeline/mutating-tools.js";
import type { PipelineDeps } from "../../src/slices/pipeline/deps.js";
import { createTestState, ensureTestDir, mockCtx, SAMPLE_LSS, writeLss } from "../helpers.js";

const LONG_PROC = `Option Declare

Sub Huge
${Array.from({ length: 320 }, (_, i) => `    Dim v${i} As Integer`).join("\n")}
End Sub
`;

function makeDeps(overrides: Partial<PipelineDeps> = {}): {
  deps: PipelineDeps;
  checks: string[];
  traces: { kind: string; detail?: string; ok?: boolean }[];
} {
  const checks: string[] = [];
  const traces: { kind: string; detail?: string; ok?: boolean }[] = [];
  const deps: PipelineDeps = {
    mutatingToolNames: MUTATING_TOOL_NAMES,
    guardKbBeforeEdit,
    trace: (event) => {
      traces.push(event);
    },
    projectSkillGuideline: () => null,
    readSkillNotice: () => null,
    observeVersionHeader: () => {},
    checkVersioning: () => null,
    checkDrift: () => null,
    checkLotusScriptDiagnostics: async (file: string) => {
      checks.push(file);
      return { ok: true, diagnostics: "", errorCount: 0, warningCount: 0 };
    },
    explainLotusScriptCodes: async () => "",
    formatLotusScriptFile: async () => null,
    formatScorecard: () => "SCORECARD",
    buildGradingRubric: () => "RUBRIC",
    trendLabel: () => "=",
    normalizeDiagnostics: () => [],
    findRecurringSignatures: () => [],
    buildRecurringGotchaDraft: () => ({ title: "", body: "" }),
    addGotcha: (title: string, body: string) => ({ id: "g", title, body }),
    promptGotchaReview: async () => ({ action: "cancel" }),
    ...overrides,
  };
  return { deps, checks, traces };
}

function editEvent(file: string): any {
  return { toolName: "edit", input: { path: file }, content: [{ type: "text", text: "ok" }] };
}

export async function phasePipeline(): Promise<void> {
  ensureTestDir();

  // 1. KB gate: blocks .lss and .dxl before any kb_search, allows other files.
  const blocked = guardKbBeforeEdit(path.join("C:/tmp", "A.lss"), false, true);
  const blockedDxl = guardKbBeforeEdit(path.join("C:/tmp", "A.dxl"), false, true);
  const allowed = guardKbBeforeEdit(path.join("C:/tmp", "notes.md"), false, true);
  const okGate = !!blocked?.block && !!blockedDxl?.block && allowed === null;
  console.log("1. KB gate blocks .lss/.dxl and ignores other files:", okGate ? "PASS" : "FAIL");
  if (!okGate) throw new Error("KB gate did not behave");
  const afterQuery = guardKbBeforeEdit(path.join("C:/tmp", "A.lss"), true, true);
  const disabled = guardKbBeforeEdit(path.join("C:/tmp", "A.lss"), false, false);
  const okRelease = afterQuery === null && disabled === null;
  console.log("2. gate releases after a KB query, and when disabled:", okRelease ? "PASS" : "FAIL");
  if (!okRelease) throw new Error("gate did not release");

  // 3. Auto-check on edit runs the whole-file check and records it.
  const state = createTestState();
  state.config = { ...DEFAULT_CONFIG, enableLsp: true, enableScorecard: false };
  const file = writeLss("AutoCheck.lss");
  const { deps, checks, traces } = makeDeps();
  const result = await handleToolResult(state, editEvent(file), mockCtx(), deps);
  const text = JSON.stringify(result?.content ?? []);
  const okAuto = checks.length === 1 && checks[0] === file && text.includes("Checked") && text.includes("whole script");
  console.log("3. edit triggers a whole-file check with a notice:", okAuto ? "PASS" : "FAIL");
  if (!okAuto) throw new Error(`No auto-check: ${text}`);
  const okTelemetry = state.telemetry.checks === 1 && state.lastCheckedFile === file && state.notesMutatedThisRun;
  console.log("4. check telemetry + lastCheckedFile + mutation flag set:", okTelemetry ? "PASS" : "FAIL");
  if (!okTelemetry) throw new Error(`Telemetry wrong: ${JSON.stringify(state.telemetry)}`);

  // 5. Auto-check off: mutation is still recorded, nothing is compiled.
  const state2 = createTestState();
  state2.config = { ...DEFAULT_CONFIG, autoCheckOnEdit: false };
  const { deps: deps2, checks: checks2 } = makeDeps();
  const off = await handleToolResult(state2, editEvent(file), mockCtx(), deps2);
  const okOff = off === undefined && checks2.length === 0 && state2.notesMutatedThisRun;
  console.log("5. auto-check off skips compiling but tracks the mutation:", okOff ? "PASS" : "FAIL");
  if (!okOff) throw new Error("auto-check off did not behave");

  // 6. A DXL edit is a mutation but never compiled.
  const dxl = path.join(path.dirname(file), "Form.dxl");
  fs.writeFileSync(dxl, "<form/>", "utf-8");
  const state3 = createTestState();
  state3.config = { ...DEFAULT_CONFIG, enableLsp: true };
  const { deps: deps3, checks: checks3 } = makeDeps();
  const dxlResult = await handleToolResult(state3, editEvent(dxl), mockCtx(), deps3);
  const okDxl = dxlResult === undefined && checks3.length === 0 && state3.notesMutatedThisRun;
  console.log("6. .dxl edit is tracked, not compiled:", okDxl ? "PASS" : "FAIL");
  if (!okDxl) throw new Error("dxl handling wrong");

  // 7. An oversized procedure is NOT blocked any more (no length rule); a
  //    missing purpose comment is reported as a warning instead.
  const state4 = createTestState();
  state4.config = { ...DEFAULT_CONFIG, enableLsp: true };
  const huge = writeLss("Huge.lss", LONG_PROC.replace("Sub Huge", "Sub Huge"));
  const { deps: deps4, checks: checks4 } = makeDeps();
  const gate = await handleToolResult(state4, editEvent(huge), mockCtx(), deps4);
  const gateText = JSON.stringify(gate?.content ?? []);
  const okNoBlock = gate?.isError !== true && checks4.length === 1 && !/length limit/i.test(gateText);
  console.log("7. oversized procedure is checked, never blocked by a length rule:", okNoBlock ? "PASS" : "FAIL");
  if (!okNoBlock) throw new Error(`Unexpected gate: ${gateText}`);
  const okNoCommentLint = !/purpose comment/i.test(gateText);
  console.log("8. no purpose-comment lint appears any more:", okNoCommentLint ? "PASS" : "FAIL");
  if (!okNoCommentLint) throw new Error(`Comment lint still reported: ${gateText}`);

  // 8. Reading a .lss injects the whole-file banner; other files do not.
  const state5 = createTestState();
  state5.config = { ...DEFAULT_CONFIG };
  const { deps: deps5 } = makeDeps();
  const readRes = await handleToolResult(
    state5,
    { toolName: "read", input: { path: file }, content: [{ type: "text", text: SAMPLE_LSS }] } as any,
    mockCtx(),
    deps5
  );
  const readText = JSON.stringify(readRes?.content ?? []);
  const okBanner = readText.includes("Whole Script") && readText.includes("MANDATORY KB CHECK");
  console.log("8. reading a .lss attaches the whole-file banner:", okBanner ? "PASS" : "FAIL");
  if (!okBanner) throw new Error(`No banner: ${readText}`);
  const txt = path.join(path.dirname(file), "notes.txt");
  fs.writeFileSync(txt, "plain", "utf-8");
  const noBanner = await handleToolResult(
    state5,
    { toolName: "read", input: { path: txt }, content: [] } as any,
    mockCtx(),
    deps5
  );
  const okNoBanner = noBanner === undefined;
  console.log("9. reading a non-LotusScript file injects nothing:", okNoBanner ? "PASS" : "FAIL");
  if (!okNoBanner) throw new Error("banner leaked onto a text file");

  // 10. Verify-before-done: one verification turn, then latched.
  const state6 = createTestState();
  state6.config = { ...DEFAULT_CONFIG, verifyKbBeforeSettle: true, minKbSearchesPerRun: 3 };
  state6.beginRun();
  state6.notesMutatedThisRun = true;
  state6.recordKbQuery("NotesSession");
  const nudge = handleAgentBeforeSettle(state6);
  const okNudge = Boolean(nudge && nudge.continue === true);
  console.log("10. a mutated run below the KB minimum gets one verification turn:", okNudge ? "PASS" : "FAIL");
  if (!okNudge) throw new Error("no settle nudge was injected");
  const second = handleAgentBeforeSettle(state6);
  const okLatch = second === undefined && state6.telemetry.kbSettleNudges === 1;
  console.log("11. the nudge is one-shot per run:", okLatch ? "PASS" : "FAIL");
  if (!okLatch) throw new Error("nudge repeated");

  // 12. No nudge when nothing mutated, or when the KB minimum is met.
  const state7 = createTestState();
  state7.config = { ...DEFAULT_CONFIG };
  state7.beginRun();
  const noMutation = handleAgentBeforeSettle(state7);
  state7.notesMutatedThisRun = true;
  for (let i = 0; i < 3; i++) state7.recordKbQuery(`q${i}`);
  const metMinimum = handleAgentBeforeSettle(state7);
  const okQuiet = noMutation === undefined && metMinimum === undefined;
  console.log("12. no nudge without mutation or with the minimum met:", okQuiet ? "PASS" : "FAIL");
  if (!okQuiet) throw new Error("unexpected nudge");

  // 13. The entry-skill pointer rides on the read banner and obeys its setting.
  const state8 = createTestState();
  state8.config = { ...DEFAULT_CONFIG };
  const { deps: deps8 } = makeDeps({ readSkillNotice: () => "ENTRY SKILL: /skills/lotusscript-modular/SKILL.md" });
  const withSkill = await handleToolResult(
    state8,
    { toolName: "read", input: { path: file }, content: [] } as any,
    mockCtx(),
    deps8
  );
  const okSkillBanner = JSON.stringify(withSkill?.content ?? []).includes("ENTRY SKILL");
  console.log("13. entry-skill pointer appears in the .lss read banner:", okSkillBanner ? "PASS" : "FAIL");
  if (!okSkillBanner) throw new Error("no skill pointer in banner");

  const state9 = createTestState();
  state9.config = { ...DEFAULT_CONFIG, injectProjectSkillHint: false };
  const { deps: deps9 } = makeDeps({ readSkillNotice: () => "ENTRY SKILL: should-not-appear" });
  const offSkill = await handleToolResult(
    state9,
    { toolName: "read", input: { path: file }, content: [] } as any,
    mockCtx(),
    deps9
  );
  const okSkillOff = !JSON.stringify(offSkill?.content ?? []).includes("should-not-appear");
  console.log("14. injectProjectSkillHint=off suppresses the pointer:", okSkillOff ? "PASS" : "FAIL");
  if (!okSkillOff) throw new Error("skill pointer leaked past the setting");

  // 15. Every stage leaves a visible checkpoint (SPAI-010).
  const checkTrace = traces.some((t) => t.kind === "check" && t.ok === true && t.detail === "0 errors");
  const gateState = createTestState();
  gateState.config = { ...DEFAULT_CONFIG, enforceKbGate: true };
  const { deps: gateDeps, traces: gateTraces } = makeDeps();
  const gateResult = handleToolCall(
    gateState,
    { toolName: "edit", input: { path: path.join("C:/tmp", "Gate.lss") } } as any,
    gateDeps,
    "C:/tmp"
  );
  const gateTrace = !!gateResult?.block && gateTraces.some((t) => t.kind === "gate" && t.ok === false);

  const dodState = createTestState();
  dodState.config = { ...DEFAULT_CONFIG, enableScorecard: true, enableLsp: true };
  dodState.lastCheckedFile = file;
  const dodTraces: { kind: string; detail?: string; ok?: boolean }[] = [];
  await handleAgentSettled(dodState, mockCtx(), {
    checkLotusScriptDiagnostics: async () => ({ ok: true, diagnostics: "", errorCount: 0, warningCount: 0 }),
    trendLabel: () => "=",
    trace: (event) => dodTraces.push(event),
  });
  const dodTrace = dodTraces.some((t) => t.kind === "dod");

  const okTraces = checkTrace && gateTrace && dodTrace;
  console.log("15. check, gate and DoD each leave a visible checkpoint:", okTraces ? "PASS" : "FAIL");
  if (!okTraces) throw new Error(`traces: ${JSON.stringify({ checkTrace, gateTrace, dodTrace })}`);
}
