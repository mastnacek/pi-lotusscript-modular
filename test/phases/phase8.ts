/**
 * Phase 8 (tests 35–39): instant-failure guards — protected files, KB edit
 * gate, legitimate modular files pass, outside-root advisory.
 */

import fs from "node:fs";
import path from "node:path";
import lotusscriptModularExtension from "../../index.js";
import { TEST_DIR, mockPi } from "../helpers.js";

export async function phase8(scoreDir: string): Promise<void> {
  const { pi: guardPi, handlers } = mockPi(["tool_call", "tool_result"]);
  lotusscriptModularExtension(guardPi);
  const guardToolCall = handlers["tool_call"];
  const guardToolResult = handlers["tool_result"];

  // 35. Block editing main.lss
  const mainBlock = guardToolCall({ toolName: "edit", input: { path: path.join(scoreDir, "main.lss") } });
  const mainBlocked =
    mainBlock?.block === true &&
    String(mainBlock.reason).includes("INSTANT FAILURE") &&
    String(mainBlock.reason).includes("main.lss");
  console.log("35. Guard blocks editing main.lss:", mainBlocked ? "PASS" : "FAIL");
  if (!mainBlocked) throw new Error(`main.lss edit was not blocked: ${JSON.stringify(mainBlock)}`);

  // 36. Block hand-editing manifest.json
  const manifestBlock = guardToolCall({ toolName: "write", input: { path: path.join(scoreDir, "manifest.json") } });
  const manifestBlocked = manifestBlock?.block === true && String(manifestBlock.reason).includes("manifest.json");
  console.log("36. Guard blocks hand-editing manifest.json:", manifestBlocked ? "PASS" : "FAIL");
  if (!manifestBlocked) throw new Error(`manifest.json edit was not blocked: ${JSON.stringify(manifestBlock)}`);

  // 37. Block editing generated *_compiled.lss
  const compiledBlock = guardToolCall({ toolName: "edit", input: { path: path.join(scoreDir, "ScoreAgent_compiled.lss") } });
  const compiledBlocked = compiledBlock?.block === true && String(compiledBlock.reason).includes("_compiled.lss");
  console.log("37. Guard blocks editing generated *_compiled.lss:", compiledBlocked ? "PASS" : "FAIL");
  if (!compiledBlocked) throw new Error(`_compiled.lss edit was not blocked: ${JSON.stringify(compiledBlock)}`);

  // 37b. KB edit gate: .lss edit is blocked until kb_search runs
  const kbGateBlock = guardToolCall({ toolName: "edit", input: { path: path.join(scoreDir, "sub_Thing.lss") } });
  const kbGateBlocked = kbGateBlock?.block === true && String(kbGateBlock.reason).includes("KB GATE");
  console.log("37b. KB gate blocks .lss edit before kb_search:", kbGateBlocked ? "PASS" : "FAIL");
  if (!kbGateBlocked) throw new Error(`KB gate did not block .lss edit: ${JSON.stringify(kbGateBlock)}`);

  // 37c. A knowledge-base search tool call satisfies the gate for the session
  guardToolCall({ toolName: "mcp__knowledge_base_kb_search", input: { collection: "lotus-notes", query: "NotesUIDocument" } });
  const afterKb = guardToolCall({ toolName: "edit", input: { path: path.join(scoreDir, "sub_Thing.lss") } });
  const kbUnblocked = afterKb?.block !== true;
  console.log("37c. KB gate releases after kb_search:", kbUnblocked ? "PASS" : "FAIL");
  if (!kbUnblocked) throw new Error(`KB gate still blocking after kb_search: ${JSON.stringify(afterKb)}`);

  // 38. Legitimate modular files are not blocked
  const legitFiles = ["00_options.lss", "01_declarations.lss", "sub_Thing.lss", "func_Helper.lss", "99_initialize.lss"];
  const legitResults = legitFiles.map((f) => guardToolCall({ toolName: "edit", input: { path: path.join(scoreDir, f) } }));
  const anyBlocked = legitResults.some((r) => r?.block === true);
  console.log("38. Legitimate modular files are not blocked:", anyBlocked ? "FAIL" : "PASS");
  if (anyBlocked) throw new Error(`A legitimate modular file was blocked: ${JSON.stringify(legitResults)}`);

  // 39. Advisory when a LotusScript file outside the active modular root is edited
  const insideEvt: any = {
    toolName: "edit",
    input: { path: path.join(scoreDir, "sub_Thing.lss") },
    content: [{ type: "text", text: "edited" }],
    isError: false,
  };
  await guardToolResult(insideEvt); // activates scoreDir as a modified root

  const outsideLss = path.join(TEST_DIR, "OutsideThing.lss");
  fs.writeFileSync(outsideLss, "Option Public\n", "utf-8");
  const outsideEvt: any = {
    toolName: "edit",
    input: { path: outsideLss },
    content: [{ type: "text", text: "edited" }],
    isError: false,
  };
  const outsideRes = await guardToolResult(outsideEvt);
  const advisoryText: string = outsideRes?.content?.[1]?.text ?? "";
  const advisoryOk = advisoryText.includes("Advisory") && advisoryText.includes("outside the active modular root");
  console.log("39. Advisory emitted for LotusScript edit outside the active root:", advisoryOk ? "PASS" : "FAIL");
  if (!advisoryOk) throw new Error(`Expected outside-root advisory, got: ${JSON.stringify(outsideRes)}`);
}
