/**
 * Phase 16 (tests 85–87): hook telemetry — counters through the pipeline
 * handlers, panel line building with width safety, countHook + session reset.
 */

import fs from "node:fs";
import path from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createPluginState } from "../../src/shared/state.js";
import {
  TelemetryPanelComponent,
  telemetryLines,
} from "../../src/shared/state-telemetry.js";
import { handleToolCall } from "../../src/slices/pipeline/index.js";
import type { PipelineDeps } from "../../src/slices/pipeline/deps.js";
import { guardKbBeforeEdit, guardProtectedFiles } from "../../src/slices/guards/index.js";
import { MUTATING_TOOL_NAMES } from "../../src/slices/pipeline/mutating-tools.js";
import { AgentParser } from "../fixtures/agent-parser.js";
import { DEFAULT_CONFIG } from "../../src/shared/config.js";
import { MONOLITH_CODE, makeRoot, MOCK_THEME, TEST_DIR } from "../helpers.js";

export async function phase16(): Promise<void> {
  // 85. Telemetry counters move with every hook-mandated tool interaction
  const state = createPluginState();
  // Slice-isolation seam: tests sit outside src/slices and may import the
  // collaborators directly (composition-root pattern, VSA).
  const deps: PipelineDeps = {
    compileAgent: (target, options) => AgentParser.compileAgent(target, options),
    guardProtectedFiles,
    guardKbBeforeEdit,
    mutatingToolNames: MUTATING_TOOL_NAMES,
    checkLotusScriptDiagnostics: async () => ({ ok: true, diagnostics: "", errorCount: 0, warningCount: 0 }),
    explainLotusScriptCodes: async () => "",
    formatLotusScriptFile: async () => null,
    formatScorecard: () => "",
    buildGradingRubric: () => "",
    trendLabel: () => "",
    normalizeDiagnostics: () => [],
    findRecurringSignatures: () => [],
    buildRecurringGotchaDraft: () => ({ title: "", body: "" }),
    addGotcha: () => ({ id: "", title: "", body: "" }),
    promptGotchaReview: async () => ({ action: "cancel" }),
  };
  const monolith = path.join(TEST_DIR, "TelemetryMonolith.lss");
  fs.writeFileSync(monolith, MONOLITH_CODE, "utf-8");
  const tc = (toolName: string, input: Record<string, unknown>) =>
    handleToolCall(state, { toolName, input } as never, deps);

  // 85a. KB gate blocks an .lss edit before any kb_search (kbConsulted=false)
  tc("edit", { path: path.join(TEST_DIR, "PlainScript.lss") });
  const gateCountOk = state.telemetry.kbGateBlocks === 1;
  console.log("85a. KB gate block counted:", gateCountOk ? "PASS" : "FAIL");
  if (!gateCountOk) throw new Error(`kbGateBlocks=${state.telemetry.kbGateBlocks}`);

  // 85b. Protected-file edit counted (needs a real modular root)
  const teleRoot = makeRoot("TelemetryAgent", { "sub_Thing.lss": "' Účel: test\nSub Thing\nEnd Sub\n" });
  tc("edit", { path: path.join(teleRoot, "main.lss") });
  const protectedOk = state.telemetry.protectedBlocks === 1;
  console.log("85b. Protected-file block counted:", protectedOk ? "PASS" : "FAIL");
  if (!protectedOk) throw new Error(`protectedBlocks=${state.telemetry.protectedBlocks}`);

  // 85c. kb_search observed and gate releases
  tc("mcp__knowledge_base_kb_search", { collection: "lotus-notes", query: "x" });
  const kbOk = state.telemetry.kbSearches === 1 && state.kbConsulted;
  console.log("85c. kb_search counted and gate armed:", kbOk ? "PASS" : "FAIL");
  if (!kbOk) throw new Error(`kbSearches=${state.telemetry.kbSearches}`);

  // 85d. Shell inspection of a monolith is no longer intercepted (the dump
  // guard was retired): `cat`/`grep` pass through untouched.
  const shellRead = { toolName: "bash", input: { command: `cat ${monolith}` } };
  const shellResult = handleToolCall(state, shellRead as never, deps);
  const dumpOk = shellResult === undefined;
  console.log("85d. Shell read of a monolith is not blocked:", dumpOk ? "PASS" : "FAIL");
  if (!dumpOk) throw new Error(`unexpected block: ${JSON.stringify(shellResult)}`);

  // 85e. Reading a monolith no longer decompiles or rewrites the path.
  const firstRead = { toolName: "read", input: { path: monolith } };
  handleToolCall(state, firstRead as never, deps);
  const secondRead = { toolName: "read", input: { path: monolith } };
  handleToolCall(state, secondRead as never, deps);
  const readsOk =
    firstRead.input.path === monolith &&
    secondRead.input.path === monolith &&
    !fs.existsSync(path.join(TEST_DIR, "TelemetryMonolith"));
  console.log("85e. Read leaves the monolith untouched (no auto-decompile):", readsOk ? "PASS" : "FAIL");
  if (!readsOk) {
    throw new Error(`path=${String(secondRead.input.path)} folder=${fs.existsSync(path.join(TEST_DIR, "TelemetryMonolith"))}`);
  }

  // 86. Panel lines: content markers + width safety through the component
  const lines = telemetryLines(state.telemetry, DEFAULT_CONFIG);
  const contentOk =
    lines.length === 4 &&
    lines[0]!.includes("haky") &&
    lines.some((l) => l.includes("KB")) &&
    lines[3]!.includes("kód");
  console.log("86. telemetryLines carries hook, gate and code markers:", contentOk ? "PASS" : "FAIL");
  if (!contentOk) throw new Error(`bad panel lines: ${JSON.stringify(lines)}`);

  const beforeCompileOk = telemetryLines(state.telemetry, DEFAULT_CONFIG)[3]!.includes("žádná kompilace");
  const component = new TelemetryPanelComponent(
    MOCK_THEME,
    () => state.telemetry,
    () => ({ ...DEFAULT_CONFIG, maxProcedureLines: 300 })
  );
  const rendered = component.render(40);
  const widthOk =
    beforeCompileOk && rendered.every((l) => visibleWidth(l) <= 40);
  console.log("86b. Panel renders width-safe at 40 cols, pre-compile placeholder:", widthOk ? "PASS" : "FAIL");
  if (!widthOk) throw new Error(`rendered=${JSON.stringify(rendered)}`);

  // 87. countHook totals + syncConfig resets session counters
  state.countHook("tool_call");
  state.countHook("tool_call");
  state.countHook("session_start");
  const hookOk =
    state.telemetry.hookCalls.tool_call === 2 &&
    state.telemetry.hookCalls.session_start === 1 &&
    Object.values(state.telemetry.hookCalls).reduce((a: number, b: number) => a + b, 0) === 3;
  console.log("87. countHook increments per hook:", hookOk ? "PASS" : "FAIL");
  if (!hookOk) throw new Error(`hookCalls=${JSON.stringify(state.telemetry.hookCalls)}`);

  state.syncConfig(process.cwd());
  const resetOk = state.telemetry.kbSearches === 0 && state.telemetry.hookCalls.tool_call === 0;
  console.log("87b. syncConfig resets session telemetry:", resetOk ? "PASS" : "FAIL");
  if (!resetOk) throw new Error(`telemetry not reset: ${JSON.stringify(state.telemetry)}`);
}
