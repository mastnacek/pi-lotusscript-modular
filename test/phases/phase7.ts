/**
 * Phase 7 (tests 29–34): scorecard / grading — compute, trend, formatting,
 * rubric content, prompt injection, recompile integration.
 */

import fs from "node:fs";
import path from "node:path";
import {
  buildGradingRubric,
  computeScorecard,
  formatScorecard,
  trendLabel,
} from "../../src/slices/scorecard/index.js";
import { DEFAULT_CONFIG } from "../../src/shared/config.js";
import lotusscriptModularExtension from "../../index.js";
import { TEST_DIR, mockPi } from "../helpers.js";
import { buildLongProcLines } from "./phase6.js";

export async function phase7(): Promise<void> {
  const overItem: any = {
    fileName: "sub_Click.lss",
    procedureName: "Click",
    lineCount: 746,
    maxLines: 300,
    isExceeded: true,
    hasDocComment: true,
  };
  const noDocItem: any = {
    fileName: "func_X.lss",
    procedureName: "X",
    lineCount: 12,
    maxLines: 300,
    isExceeded: false,
    hasDocComment: false,
  };

  // 29. computeScorecard on a failing agent
  const scBad = computeScorecard({
    agent: "ScoreAgent",
    maxProcedureLines: 300,
    lint: { ok: false, exceededProcedures: [overItem], missingCommentProcedures: [noDocItem], allItems: [overItem, noDocItem] },
    lsp: { ok: false, diagnostics: "Error on line 412: type mismatch", errorCount: 2, warningCount: 0 },
    lspEnabled: true,
    enforceCzechComments: true,
    manifestSynced: false,
    artifact: "pending",
  });
  const badOk =
    scBad.score === 0 &&
    scBad.max === 8 &&
    scBad.items.length === 5 &&
    scBad.items.find((i) => i.id === "artifact")?.pending === true;
  console.log("29. Scorecard scores failing agent 0/8 with pending artifact:", badOk ? "PASS" : "FAIL");
  if (!badOk) throw new Error(`Unexpected failing scorecard: ${JSON.stringify(scBad)}`);

  // 30. computeScorecard on a clean agent + trend
  const cleanItems: any[] = [overItem, noDocItem].map((i) => ({
    ...i,
    lineCount: 20,
    isExceeded: false,
    hasDocComment: true,
  }));
  const scGood = computeScorecard({
    agent: "ScoreAgent",
    maxProcedureLines: 300,
    lint: { ok: true, exceededProcedures: [], missingCommentProcedures: [], allItems: cleanItems },
    lsp: { ok: true, diagnostics: "No diagnostics.", errorCount: 0, warningCount: 0 },
    lspEnabled: true,
    enforceCzechComments: true,
    manifestSynced: true,
    artifact: "written",
  });
  const trend = trendLabel(scGood, scBad);
  const goodOk = scGood.score === 10 && scGood.max === 10 && trend.startsWith("▲ +10");
  console.log("30. Scorecard scores clean agent 10/10 and reports upward trend:", goodOk ? "PASS" : "FAIL");
  if (!goodOk) throw new Error(`Unexpected clean scorecard/trend: ${JSON.stringify({ scGood, trend })}`);

  // 31. formatScorecard structure
  const formattedBad = formatScorecard(scBad, undefined);
  const formattedGood = formatScorecard(scGood, scBad);
  const formatOk =
    formattedBad.includes("SCORECARD") &&
    formattedBad.includes("(first compile)") &&
    formattedBad.includes("⬜") &&
    formattedBad.includes("Remaining:") &&
    formattedGood.includes("▲ +10 since last compile");
  console.log("31. formatScorecard emits header, pending icon, remaining list and trend:", formatOk ? "PASS" : "FAIL");
  if (!formatOk) throw new Error(`Unexpected scorecard formatting:\n${formattedBad}\n---\n${formattedGood}`);

  // 32. buildGradingRubric content
  const rubric = buildGradingRubric(DEFAULT_CONFIG);
  const rubricOk =
    rubric.includes("DEFINITION OF DONE") &&
    rubric.includes("HOW YOU'RE GRADED") &&
    rubric.includes("INSTANT FAILURE") &&
    rubric.includes(String(DEFAULT_CONFIG.maxProcedureLines)) &&
    rubric.includes("never self-report");
  console.log("32. Grading rubric contains DoD, grading, instant-failure rules:", rubricOk ? "PASS" : "FAIL");
  if (!rubricOk) throw new Error(`Unexpected rubric:\n${rubric}`);

  // 33. Rubric is injected into the system prompt
  const { pi: rubricPi, handlers: rubricHandlers } = mockPi(["before_agent_start"]);
  lotusscriptModularExtension(rubricPi);
  const promptEvent: any = { systemPromptOptions: { promptGuidelines: [] } };
  rubricHandlers["before_agent_start"](promptEvent);
  const guidelines: string[] = promptEvent.systemPromptOptions.promptGuidelines;
  const rubricInjected = guidelines.some((g) => g.includes("DEFINITION OF DONE"));
  console.log("33. before_agent_start injects the grading rubric:", rubricInjected ? "PASS" : "FAIL");
  if (!rubricInjected) throw new Error(`Rubric was not injected. Guidelines: ${JSON.stringify(guidelines)}`);

  // 34. Scorecard is emitted in the recompile result (integration)
  const scoreDir = path.join(TEST_DIR, "ScoreAgent");
  fs.mkdirSync(scoreDir, { recursive: true });
  fs.writeFileSync(path.join(scoreDir, "00_options.lss"), "Option Public\nOption Declare\n", "utf-8");
  fs.writeFileSync(path.join(scoreDir, "01_declarations.lss"), "' Deklarace\nDim g_score As Integer\n", "utf-8");
  fs.writeFileSync(
    path.join(scoreDir, "sub_Thing.lss"),
    "' @script-member-of: ScoreAgent\n' @procedure: Thing\n' Účel: Testovací procedura pro ověření scorecardu v kompilaci.\nSub Thing()\n    Print \"x\"\nEnd Sub\n",
    "utf-8"
  );
  fs.writeFileSync(path.join(scoreDir, "main.lss"), "' main\n", "utf-8");
  fs.writeFileSync(
    path.join(scoreDir, "manifest.json"),
    JSON.stringify(
      {
        formatVersion: "1.0",
        agentName: "ScoreAgent",
        decompileTimestamp: new Date().toISOString(),
        compilationOrder: ["00_options.lss", "01_declarations.lss", "sub_Thing.lss"],
      },
      null,
      2
    ),
    "utf-8"
  );

  const { pi: scorePi, handlers: scoreHandlers } = mockPi(["tool_result"]);
  lotusscriptModularExtension(scorePi);

  const scoreEditEvt: any = {
    toolName: "edit",
    input: { path: path.join(scoreDir, "sub_Thing.lss") },
    content: [{ type: "text", text: "edited" }],
    isError: false,
  };
  const scoreRes = await scoreHandlers["tool_result"](scoreEditEvt);
  const scoreText: string = scoreRes?.content?.[1]?.text ?? "";
  const scoreEmitted =
    scoreText.includes("SCORECARD") &&
    scoreText.includes("ScoreAgent") &&
    scoreText.includes("procedures ≤ 300 lines") &&
    scoreText.includes("first compile");
  console.log("34. Recompile result contains the computed scorecard:", scoreEmitted ? "PASS" : "FAIL");
  if (!scoreEmitted) throw new Error(`Scorecard missing from recompile result:\n${scoreText}`);

  // Shared fixture for the guards phase: long procedure content reused by
  // AgentWithLongProc setup lives in phase6; expose the builder for parity.
  void buildLongProcLines;
}
