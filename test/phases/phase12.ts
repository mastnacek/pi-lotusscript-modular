/**
 * Phases 12a/12b: shell & code-execution read guards (55–59), agent-facing
 * English language guard (60–61), unmeasured LSP pending semantics (62).
 */

import fs from "node:fs";
import path from "node:path";
import {
  buildGradingRubric,
  computeScorecard,
  formatScorecard,
} from "../../src/slices/scorecard/index.js";
import { DEFAULT_CONFIG } from "../../src/shared/config.js";
import {
  createFallbackEval,
  buildFolderSummary,
  parseJevResponse,
  scanLotusScriptComments,
} from "../../src/slices/evaluator/index.js";
import lotusscriptModularExtension from "../../index.js";
import { TEST_DIR, mockPi } from "../helpers.js";

export interface GuardFixture {
  guardToolCall: (event: any) => any;
  guardToolResult: (event: any, ctx?: any) => Promise<any>;
  shellDir: string;
  shellMonolith: string;
  bashDump: any;
  ctxExec: any;
  ctxBatch: any;
  cleanItems: any[];
  scGood: ReturnType<typeof computeScorecard>;
  scWithJev: ReturnType<typeof computeScorecard>;
}

/** Tests 55–59. Returns fixtures reused by the language guard phase. */
export async function phase12a(cleanItems: any[], scGood: ReturnType<typeof computeScorecard>, scWithJev: ReturnType<typeof computeScorecard>): Promise<GuardFixture> {
  const { pi: guardPi, handlers } = mockPi(["tool_call", "tool_result"]);
  lotusscriptModularExtension(guardPi);
  const guardToolCall = handlers["tool_call"];
  const guardToolResult = handlers["tool_result"];

  const shellDir = path.join(TEST_DIR, "ShellGuardAgent");
  fs.mkdirSync(shellDir, { recursive: true });
  fs.writeFileSync(path.join(shellDir, "00_options.lss"), "Option Public\nOption Declare\n", "utf-8");
  fs.writeFileSync(path.join(shellDir, "01_declarations.lss"), "' Deklarace\nDim g_x As Integer\n", "utf-8");
  fs.writeFileSync(path.join(shellDir, "sub_Work.lss"), "' Účel: Pracovní procedura.\nSub Work()\nEnd Sub\n", "utf-8");
  fs.writeFileSync(path.join(shellDir, "main.lss"), "' %pi-import \"sub_Work.lss\"\n", "utf-8");
  fs.writeFileSync(
    path.join(shellDir, "manifest.json"),
    JSON.stringify(
      {
        formatVersion: "1.0",
        agentName: "ShellGuardAgent",
        decompileTimestamp: new Date().toISOString(),
        compilationOrder: ["00_options.lss", "01_declarations.lss", "sub_Work.lss"],
      },
      null,
      2
    ),
    "utf-8"
  );
  // Monolithic sibling that the modular folder was decompiled from.
  const shellMonolith = path.join(TEST_DIR, "ShellGuardAgent.lss");
  fs.writeFileSync(shellMonolith, ["Option Public", "Sub Work()", "\tPrint \"1\"", "End Sub", ""].join("\n"), "utf-8");

  // 55. bash content dump of the monolith is blocked
  const bashDump = guardToolCall({
    toolName: "bash",
    input: { command: `cd "${TEST_DIR}" && cat -n ShellGuardAgent.lss | sed -n '1,180p'` },
  });
  const bashDumpBlocked =
    bashDump?.block === true &&
    String(bashDump.reason).includes("INSTANT FAILURE") &&
    String(bashDump.reason).includes("monolithic");
  console.log("55. Guard blocks bash content dump of monolithic .lss:", bashDumpBlocked ? "PASS" : "FAIL");
  if (!bashDumpBlocked) throw new Error(`bash monolith dump was not blocked: ${JSON.stringify(bashDump)}`);

  // 56. ctx_execute code that reads the monolith is blocked
  const ctxExec = guardToolCall({
    toolName: "ctx_execute",
    input: {
      language: "javascript",
      code: `const fs = require('fs'); console.log(fs.readFileSync('${shellMonolith.replace(/\\/g, "\\\\")}', 'utf8'));`,
    },
  });
  const ctxExecBlocked = ctxExec?.block === true && String(ctxExec.reason).includes("INSTANT FAILURE");
  console.log("56. Guard blocks ctx_execute readFileSync of monolithic .lss:", ctxExecBlocked ? "PASS" : "FAIL");
  if (!ctxExecBlocked) throw new Error(`ctx_execute monolith read was not blocked: ${JSON.stringify(ctxExec)}`);

  // 57. ctx_batch_execute command array is scanned
  const ctxBatch = guardToolCall({
    toolName: "ctx_batch_execute",
    input: {
      commands: [{ label: "dump", command: `head -n 200 "${shellMonolith}"` }],
      queries: ["anything"],
    },
  });
  const ctxBatchBlocked = ctxBatch?.block === true && String(ctxBatch.reason).includes("INSTANT FAILURE");
  console.log("57. Guard blocks ctx_batch_execute content dump of monolithic .lss:", ctxBatchBlocked ? "PASS" : "FAIL");
  if (!ctxBatchBlocked) throw new Error(`ctx_batch_execute monolith dump was not blocked: ${JSON.stringify(ctxBatch)}`);

  // 58. Modular parts remain readable via bash (no false positive)
  const modularRead = guardToolCall({
    toolName: "bash",
    input: { command: `cat "${path.join(shellDir, "sub_Work.lss")}"` },
  });
  const modularReadOk = modularRead?.block !== true;
  console.log("58. Guard allows bash read of modular sub_*.lss:", modularReadOk ? "PASS" : "FAIL");
  if (!modularReadOk) throw new Error(`Modular file read was wrongly blocked: ${JSON.stringify(modularRead)}`);

  // 59. Metadata-only commands are not blocked
  const metadataCmd = guardToolCall({
    toolName: "bash",
    input: { command: `cd "${TEST_DIR}" && wc -l ShellGuardAgent.lss` },
  });
  const metadataOk = metadataCmd?.block !== true;
  console.log("59. Guard allows metadata-only bash (wc -l) on monolithic file:", metadataOk ? "PASS" : "FAIL");
  if (!metadataOk) throw new Error(`Metadata command was wrongly blocked: ${JSON.stringify(metadataCmd)}`);

  return { guardToolCall, guardToolResult, shellDir, shellMonolith, bashDump, ctxExec, ctxBatch, cleanItems, scGood, scWithJev };
}

/** Tests 60–62. Consumes guard fixtures + JEV fixtures. */
export async function phase12b(fixture: GuardFixture, jev: {
  newAnalysis: ReturnType<typeof scanLotusScriptComments>;
  oldAnalysis: ReturnType<typeof scanLotusScriptComments>;
  parsedJev: ReturnType<typeof parseJevResponse>;
  folderSummary: ReturnType<typeof buildFolderSummary>;
}): Promise<void> {
  const { bashDump, ctxExec, ctxBatch, cleanItems, scGood, scWithJev } = fixture;

  // 60. Agent-facing text is English (Czech only in user UI surfaces)
  const AGENT_FACING_ALLOWED =
    /Účel|zpracování|pomocná funkce|pomocná|funkce|\btest\b/gi;
  const czechDiacritics = /[áčďéěíňóřšťúůýž]/i;
  const hasAgentFacingCzech = (text: string): boolean =>
    czechDiacritics.test(text.replace(AGENT_FACING_ALLOWED, ""));

  const agentFacingSamples: Array<{ label: string; text: string }> = [
    { label: "fallback eval summary", text: createFallbackEval("sub_A.lss", "A", jev.newAnalysis).summary },
    { label: "fallback eval (legacy) summary", text: createFallbackEval("sub_B.lss", "B", jev.oldAnalysis).summary },
    { label: "parseJevResponse summary", text: jev.parsedJev.summary },
    { label: "buildFolderSummary summary", text: jev.folderSummary.summary },
    { label: "buildGradingRubric", text: buildGradingRubric(DEFAULT_CONFIG) },
    { label: "formatScorecard", text: formatScorecard(scWithJev, scGood) },
    { label: "bash block reason", text: String(bashDump?.reason ?? "") },
    { label: "ctx_execute block reason", text: String(ctxExec?.reason ?? "") },
    { label: "ctx_batch_execute block reason", text: String(ctxBatch?.reason ?? "") },
  ];

  const offending = agentFacingSamples.filter((s) => hasAgentFacingCzech(s.text));
  const englishOk = offending.length === 0;
  console.log(
    "60. All agent-facing surfaces are English:",
    englishOk ? "PASS" : `FAIL (${offending.map((o) => o.label).join(", ")})`
  );
  if (!englishOk) {
    throw new Error(
      `Agent-facing text contains Czech:\n${offending
        .map((o) => `--- ${o.label} ---\n${o.text}`)
        .join("\n")}`
    );
  }

  // 61. Sanity: the English guard actually detects Czech (not a no-op)
  const guardWorks = hasAgentFacingCzech("STRICT FAIL: triviální komentář");
  console.log("61. English guard detects Czech (anti-no-op sanity check):", guardWorks ? "PASS" : "FAIL");
  if (!guardWorks) throw new Error("English guard did not flag known Czech text — test is vacuous");

  // 62. An unmeasured (or harness-failed) LSP result is pending, not failed
  const cleanLint = {
    ok: true,
    exceededProcedures: [],
    missingCommentProcedures: [],
    allItems: cleanItems,
  };
  const scNoLsp = computeScorecard({
    agent: "ScoreAgent",
    maxProcedureLines: 300,
    lint: cleanLint,
    lsp: null,
    lspEnabled: true,
    enforceCzechComments: true,
    manifestSynced: true,
    artifact: "written",
  });
  const scHarness = computeScorecard({
    agent: "ScoreAgent",
    maxProcedureLines: 300,
    lint: cleanLint,
    lsp: {
      ok: false,
      diagnostics: "LotusScript LSP server not found at: D:/nope/server.js",
      errorCount: 1,
      warningCount: 0,
    },
    lspEnabled: true,
    enforceCzechComments: true,
    manifestSynced: true,
    artifact: "written",
  });
  const lspItemUnmeasured = scNoLsp.items.find((i) => i.id === "lsp-clean");
  const lspItemHarness = scHarness.items.find((i) => i.id === "lsp-clean");
  const lspPendingOk =
    scNoLsp.score === 8 &&
    scNoLsp.max === 8 &&
    lspItemUnmeasured?.pending === true &&
    lspItemUnmeasured?.ok === false &&
    lspItemUnmeasured?.label === "LSP diagnostics (not checked)" &&
    scHarness.max === 8 &&
    lspItemHarness?.pending === true &&
    !formatScorecard(scNoLsp, undefined).includes("- LSP diagnostics");
  console.log(
    "62. Unmeasured/harness-failed LSP is pending, not a failed DoD item:",
    lspPendingOk ? "PASS" : "FAIL"
  );
  if (!lspPendingOk) {
    throw new Error(
      `Unexpected LSP pending scorecard: ${JSON.stringify({ scNoLsp, scHarness })}`
    );
  }
}
