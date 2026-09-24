/**
 * Phases 6 (tests 23–28): procedure line-limit & comment linter, procedure
 * limit modal, end-to-end tool_result lint gate, anti-loop gate, sizing.
 */

import fs from "node:fs";
import path from "node:path";
import { lintModularFolder, ProcedureLimitComponent } from "../../src/slices/linter/index.js";
import lotusscriptModularExtension from "../../index.js";
import { MOCK_THEME, TEST_DIR, mockPi } from "../helpers.js";

/** 320-line procedure fixture shared by this phase and the scorecard phase. */
export function buildLongProcLines(): string[] {
  const longProcLines = [
    "' @script-member-of: LintTest",
    "' @procedure: MassiveSub",
    "Sub MassiveSub()",
  ];
  for (let i = 0; i < 320; i++) {
    longProcLines.push(`    Print "Statement line ${i}"`);
  }
  longProcLines.push("End Sub");
  return longProcLines;
}

export async function phase6(): Promise<void> {
  // 23. Test lintProcedureFile & lintModularFolder
  const lintDir = path.join(TEST_DIR, "LintTestDir");
  fs.mkdirSync(lintDir, { recursive: true });

  const shortProcLines = [
    "' @script-member-of: LintTest",
    "' @procedure: ShortHelper",
    "' Účel: Krátká pomocná funkce pro formátování textu.",
    "Function ShortHelper() As String",
    '    ShortHelper = "OK"',
    "End Function",
  ];
  fs.writeFileSync(path.join(lintDir, "func_ShortHelper.lss"), shortProcLines.join("\n"), "utf-8");

  const longProcLines = buildLongProcLines();
  fs.writeFileSync(path.join(lintDir, "sub_MassiveSub.lss"), longProcLines.join("\n"), "utf-8");

  const lintRes = lintModularFolder(lintDir, 300, true);
  console.log("23a. Lint flags procedure exceeding 300 lines:", (lintRes.exceededProcedures.length === 1 && lintRes.exceededProcedures[0]?.fileName === "sub_MassiveSub.lss") ? "PASS" : "FAIL");
  if (lintRes.exceededProcedures.length !== 1 || lintRes.exceededProcedures[0]?.fileName !== "sub_MassiveSub.lss") {
    throw new Error("Linter failed to detect 320-line procedure");
  }

  console.log("23b. Lint flags missing doc comment on MassiveSub:", (lintRes.missingCommentProcedures.length === 1 && lintRes.missingCommentProcedures[0]?.fileName === "sub_MassiveSub.lss") ? "PASS" : "FAIL");
  if (lintRes.missingCommentProcedures.length !== 1) {
    throw new Error("Linter failed to detect missing Czech doc comment");
  }

  // 24. ProcedureLimitComponent layout & rendering
  let procReviewResult: any = null;
  const procComp = new ProcedureLimitComponent(MOCK_THEME, lintRes.exceededProcedures[0]!, (res) => {
    procReviewResult = res;
  });

  const procLines = procComp.render(80);
  const procText = procLines.join("\n");
  const hasLimitEmoji = procText.includes("🪷") && procText.includes("📏") && procText.includes("32 KB");
  const hasLimitActions = procText.includes("✅ [Povolit výjimku]") && procText.includes("✂️ [Odmítnout a rozdělit]") && procText.includes("✏️ [Pokyny k rozdělení]");
  console.log("24. Procedure limit modal layout & emoji rendering:", (hasLimitEmoji && hasLimitActions) ? "PASS" : "FAIL");
  if (!hasLimitEmoji || !hasLimitActions) {
    throw new Error("ProcedureLimitComponent did not render required UI elements");
  }

  // 25. ProcedureLimitComponent keyboard navigation
  procComp.handleInput("\x1b");
  console.log("25a. Escape key rejects line limit excess:", procReviewResult?.action === "reject" ? "PASS" : "FAIL");
  if (procReviewResult?.action !== "reject") throw new Error("Escape failed to reject");

  procReviewResult = null;
  procComp.handleInput("p");
  console.log("25b. 'p' key approves procedure exception:", procReviewResult?.action === "approve" ? "PASS" : "FAIL");
  if (procReviewResult?.action !== "approve") throw new Error("'p' key failed to approve");

  procReviewResult = null;
  procComp.handleInput("\x1b[B"); // Down
  procComp.handleInput("\x1b[B"); // Down (now on index 2: Split instructions)
  const splitNotes = "Vyčleň HTTP volání a JSON parsing do func_Fetch.lss";
  for (const c of splitNotes) {
    procComp.handleInput(c);
  }
  procComp.handleInput("\r"); // Enter
  console.log("25c. Split instructions captured from modal:", (procReviewResult?.action === "split_instructions" && procReviewResult?.instructions === splitNotes) ? "PASS" : "FAIL");
  if (procReviewResult?.action !== "split_instructions" || procReviewResult?.instructions !== splitNotes) {
    throw new Error("Failed to capture split instructions");
  }

  // 26. Integration test: End-to-end tool_result linter check
  const { pi: lintTestPi, handlers: lintTestHandlers } = mockPi(["tool_result"]);
  lotusscriptModularExtension(lintTestPi);
  const lintPiToolResultHandler = lintTestHandlers["tool_result"];

  // Setup modular directory with long procedure
  const agentWithLongProc = path.join(TEST_DIR, "AgentWithLongProc");
  fs.mkdirSync(agentWithLongProc, { recursive: true });
  fs.writeFileSync(path.join(agentWithLongProc, "00_options.lss"), "Option Public\nOption Declare\n", "utf-8");
  fs.writeFileSync(path.join(agentWithLongProc, "01_declarations.lss"), "' Declarations\n", "utf-8");
  fs.writeFileSync(path.join(agentWithLongProc, "main.lss"), "' main.lss\n", "utf-8");
  fs.writeFileSync(path.join(agentWithLongProc, "manifest.json"), JSON.stringify({
    formatVersion: "1.0",
    agentName: "AgentWithLongProc",
    decompileTimestamp: new Date().toISOString(),
    compilationOrder: ["00_options.lss", "01_declarations.lss", "sub_MassiveSub.lss"],
  }, null, 2), "utf-8");
  fs.writeFileSync(path.join(agentWithLongProc, "sub_MassiveSub.lss"), longProcLines.join("\n"), "utf-8");

  // Simulate edit tool result where user REJECTS in modal
  const mockContextReject: any = {
    hasUI: true,
    cwd: TEST_DIR,
    ui: {
      custom: async () => ({ action: "reject" }),
      notify: () => {},
    },
  };
  const { pi: lintMockPi2, handlers: lintHandlers2 } = mockPi(["session_start", "tool_result"]);
  lotusscriptModularExtension(lintMockPi2);
  lintHandlers2["session_start"]({}, mockContextReject);

  const editLongProcEvt: any = {
    toolName: "edit",
    input: { path: path.join(agentWithLongProc, "sub_MassiveSub.lss") },
    content: [{ type: "text", text: "Modified line" }],
    isError: false,
  };

  const lintBlockResult = await lintHandlers2["tool_result"](editLongProcEvt);
  const wasBlocked = lintBlockResult?.isError === true && lintBlockResult?.content?.[1]?.text?.includes("exceeding the 300-line limit");
  console.log("26. Tool result halts and instructs AI to split when user rejects excess:", wasBlocked ? "PASS" : "FAIL");
  if (!wasBlocked) {
    throw new Error(`Expected tool_result to halt with split guidance, got: ${JSON.stringify(lintBlockResult)}`);
  }

  // 27. Anti-loop gate: re-editing an UNCHANGED over-limit file must not reopen the modal.
  let modalOpenCount = 0;
  const loopProbeCtx: any = {
    hasUI: true,
    cwd: TEST_DIR,
    ui: {
      custom: async () => {
        modalOpenCount++;
        return { action: "reject" };
      },
      notify: () => {},
    },
  };
  const { pi: loopPi, handlers: loopHandlers } = mockPi(["session_start", "tool_result"]);
  lotusscriptModularExtension(loopPi);
  loopHandlers["session_start"]({}, loopProbeCtx);

  const loopEvt = () => ({
    toolName: "edit",
    input: { path: path.join(agentWithLongProc, "sub_MassiveSub.lss") },
    content: [{ type: "text", text: "touch" }],
    isError: false,
  });

  const firstLoopRes = await loopHandlers["tool_result"](loopEvt());
  const secondLoopRes = await loopHandlers["tool_result"](loopEvt());
  const thirdLoopRes = await loopHandlers["tool_result"](loopEvt());

  const gateWorked =
    modalOpenCount === 1 &&
    firstLoopRes?.isError === true &&
    secondLoopRes?.isError === true &&
    thirdLoopRes?.isError === true &&
    thirdLoopRes?.content?.[1]?.text?.includes("already rejected the exception for this revision");
  console.log("27. Modal opens once; unchanged re-edits do not re-prompt (no loop):", gateWorked ? "PASS" : "FAIL");
  if (!gateWorked) {
    throw new Error(`Anti-loop gate failed. modalOpenCount=${modalOpenCount}, third=${JSON.stringify(thirdLoopRes)}`);
  }

  // 28. Modal remains readable: wrapped content respects width, and optional terminal sizing works.
  const sizedComp = new ProcedureLimitComponent(MOCK_THEME, lintRes.exceededProcedures[0]!, () => {}, 120, 30);
  const sizedLines = sizedComp.render(120);
  const widthOk = sizedLines.every((l) => l.length < 400);
  const hasWrappedRisk = sizedLines.join("\n").includes("Script structure too large");
  console.log("28. Modal sizes to terminal and wraps long text:", (widthOk && hasWrappedRisk) ? "PASS" : "FAIL");
  if (!widthOk || !hasWrappedRisk) {
    throw new Error("Modal did not wrap/scale correctly");
  }
}
