/**
 * Phases 11a (tests 48–54): JEV evaluator — deterministic comment parsing,
 * string-literal immunity, payload, parsing, fallback, scorecard integration.
 */

import {
  scanLotusScriptComments,
  buildJevPayload,
  parseJevResponse,
  createFallbackEval,
  buildFolderSummary,
} from "../../src/slices/evaluator/index.js";
import { computeScorecard } from "../../src/slices/scorecard/index.js";

export const NEW_STYLE_CODE = [
  "' @script-member-of: TestAgent",
  "' @procedure: ProcessDoc",
  "' @parent-declarations: 01_declarations.lss",
  "' Účel: Zpracuje a zvaliduje příchozí objednávku podle pravidel",
  "Sub ProcessDoc(doc As NotesDocument)",
  "  Print \"Done\"",
  "End Sub",
].join("\n");

export const OLD_STYLE_CODE = [
  "%REM",
  "Function: ProcessDoc",
  "Description: Legacy order processing function",
  "Author: Karel Novak",
  "Date: 2011-04-15",
  "%END REM",
  "' **********************************************",
  "Sub ProcessDoc(doc As NotesDocument)",
  "  Rem do work",
  "End Sub",
].join("\n");

export async function phase11a(): Promise<{
  newAnalysis: ReturnType<typeof scanLotusScriptComments>;
  oldAnalysis: ReturnType<typeof scanLotusScriptComments>;
  parsedJev: ReturnType<typeof parseJevResponse>;
  folderSummary: ReturnType<typeof buildFolderSummary>;
  scWithJev: ReturnType<typeof computeScorecard>;
  scGood: ReturnType<typeof computeScorecard>;
  cleanItems: any[];
}> {
  // 48. JEV Evaluator: Deterministic comment parsing (New Style)
  const newAnalysis = scanLotusScriptComments(NEW_STYLE_CODE);
  const newStyleOk =
    newAnalysis.style === "new" &&
    newAnalysis.hasCzechPurpose === true &&
    newAnalysis.purposeText === "Zpracuje a zvaliduje příchozí objednávku podle pravidel" &&
    newAnalysis.hasSyntheticHeader === true &&
    newAnalysis.hasLegacyBlock === false;
  console.log("48. scanLotusScriptComments identifies new style with Czech purpose:", newStyleOk ? "PASS" : "FAIL");
  if (!newStyleOk) throw new Error(`Unexpected new-style analysis: ${JSON.stringify(newAnalysis)}`);

  // 49. JEV Evaluator: Deterministic comment parsing (Old / Legacy Style)
  const oldAnalysis = scanLotusScriptComments(OLD_STYLE_CODE);
  const oldStyleOk =
    oldAnalysis.style === "old" &&
    oldAnalysis.hasCzechPurpose === false &&
    oldAnalysis.hasLegacyBlock === true &&
    oldAnalysis.legacyMarkers.length >= 3;
  console.log("49. scanLotusScriptComments identifies legacy %REM and markers:", oldStyleOk ? "PASS" : "FAIL");
  if (!oldStyleOk) throw new Error(`Unexpected old-style analysis: ${JSON.stringify(oldAnalysis)}`);

  // 50. JEV Evaluator: String literal immunity (' and REM inside quotes)
  const stringLiteralCode = [
    "Sub TestStrings()",
    "  Dim a As String, b As String, c As String",
    "  a = \"Toto je 'uvozovka' a REM text\"",
    "  b = |Tento bar string má 'komentář' uvnitř|",
    "  c = {Tento brace string má REM klíčové slovo uvnitř}",
    "End Sub",
  ].join("\n");
  const stringAnalysis = scanLotusScriptComments(stringLiteralCode);
  const stringOk =
    stringAnalysis.style === "none" &&
    stringAnalysis.commentLines === 0 &&
    stringAnalysis.hasCzechPurpose === false;
  console.log("50. scanLotusScriptComments ignores quotes, bar strings and braces:", stringOk ? "PASS" : "FAIL");
  if (!stringOk) throw new Error(`String immunity failed: ${JSON.stringify(stringAnalysis)}`);

  // 51. JEV Evaluator: Payload generation (Strict Jev 1.13 Ground Truth)
  const jevPayload = buildJevPayload({
    fileName: "sub_ProcessDoc.lss",
    procedureName: "ProcessDoc",
    signature: "Sub ProcessDoc(doc As NotesDocument)",
    codeSnippet: NEW_STYLE_CODE,
    analysis: newAnalysis,
    jevModel: "typesafe/jev-1.13",
  });
  const payloadOk =
    jevPayload.model === "typesafe/jev-1.13" &&
    jevPayload.state.includes("STRICT PI AGENT SPECIFICATION") &&
    jevPayload.state.includes("sub_ProcessDoc.lss") &&
    jevPayload.state.includes("Zpracuje a zvaliduje") &&
    Boolean(jevPayload.questions.is_strictly_new_style) &&
    Boolean(jevPayload.questions.is_trivial_comment) &&
    Boolean(jevPayload.questions.purpose_accuracy) &&
    Boolean(jevPayload.questions.has_runtime_trap) &&
    Boolean(jevPayload.questions.gotcha_severity);
  console.log("51. buildJevPayload builds strict ground truth and calibrated questions:", payloadOk ? "PASS" : "FAIL");
  if (!payloadOk) throw new Error(`Unexpected JEV payload: ${JSON.stringify(jevPayload)}`);

  // 52. JEV Evaluator: Response parsing with calibrated strict thresholds
  const mockJevResponse = {
    model: "typesafe/jev-1.13",
    answers: {
      is_strictly_new_style: { noul: 0.96 },
      is_trivial_comment: { noul: 0.02 },
      purpose_accuracy: { score: 2.0, confidence: 0.95 },
      has_runtime_trap: { noul: 0.03 },
      gotcha_severity: { score: 0.1, confidence: 0.9 },
    },
    usage: { cost: 0.00004 },
  };
  const parsedJev = parseJevResponse(mockJevResponse, newAnalysis, "sub_ProcessDoc.lss", "ProcessDoc");
  const parsedOk =
    parsedJev.styleCompliant === true &&
    parsedJev.commentStyle === "new" &&
    parsedJev.purposeQualityScore === 2.0 &&
    parsedJev.gotchaRiskScore === 0 &&
    parsedJev.summary.includes("STRICT PASS") &&
    parsedJev.costUsd === 0.00004;
  console.log("52. parseJevResponse extracts strict thresholds and compliance:", parsedOk ? "PASS" : "FAIL");
  if (!parsedOk) throw new Error(`Unexpected parsed JEV result: ${JSON.stringify(parsedJev)}`);

  // 53. JEV Evaluator: Fallback eval & folder summary
  const fallbackNew = createFallbackEval("sub_ProcessDoc.lss", "ProcessDoc", newAnalysis);
  const fallbackOld = createFallbackEval("sub_Old.lss", "OldProc", oldAnalysis);
  const folderSummary = buildFolderSummary([fallbackNew, fallbackOld]);
  const summaryOk =
    folderSummary.newStyleCount === 1 &&
    folderSummary.oldStyleCount === 1 &&
    folderSummary.ok === false &&
    folderSummary.summary.includes("New style (compliant): 1/2") &&
    folderSummary.summary.includes("Legacy style (%REM): 1");
  console.log("53. createFallbackEval & buildFolderSummary aggregate metrics:", summaryOk ? "PASS" : "FAIL");
  if (!summaryOk) throw new Error(`Unexpected folder summary: ${JSON.stringify(folderSummary)}`);

  // 54. JEV Evaluator: Scorecard integration
  const cleanItems: any[] = [
    {
      fileName: "sub_Click.lss",
      procedureName: "Click",
      lineCount: 20,
      maxLines: 300,
      isExceeded: false,
      hasDocComment: true,
    },
  ];
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
  const cleanSummary = buildFolderSummary([fallbackNew]);
  const scWithJev = computeScorecard({
    agent: "JevAgent",
    maxProcedureLines: 300,
    lint: { ok: true, exceededProcedures: [], missingCommentProcedures: [], allItems: [] },
    lsp: { ok: true, diagnostics: "No diagnostics.", errorCount: 0, warningCount: 0 },
    lspEnabled: true,
    enforceCzechComments: true,
    manifestSynced: true,
    artifact: "written",
    jev: cleanSummary,
  });
  const jevItem = scWithJev.items.find((i) => i.id === "jev-semantic");
  const scJevOk =
    Boolean(jevItem) &&
    jevItem?.ok === true &&
    scWithJev.score === 12 && // 5 items * 2 + 1 jev item * 2 = 12
    scWithJev.max === 12;
  console.log("54. computeScorecard attaches JEV semantic review item:", scJevOk ? "PASS" : "FAIL");
  if (!scJevOk) throw new Error(`Unexpected scorecard with JEV: ${JSON.stringify(scWithJev)}`);

  return { newAnalysis, oldAnalysis, parsedJev, folderSummary, scWithJev, scGood, cleanItems };
}
