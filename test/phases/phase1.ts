/**
 * Phases 1–4: gotchas catalogue, lazy menu completions, core decompile →
 * compile → LSP workflow, tool_call auto-decompile redirect, gotcha review
 * modal + tool approval gate.
 */

import fs from "node:fs";
import path from "node:path";
import {
  findModularRoot,
  getExistingModularDir,
  isMonolithicLss,
} from "../../src/shared/paths.js";
import { AgentParser } from "../../src/slices/parser/index.js";
import { checkLotusScriptDiagnostics } from "../../src/slices/lsp/index.js";
import { getAllGotchas, searchGotchas, GotchaReviewComponent, promptGotchaReview } from "../../src/slices/gotchas/index.js";
import { completeLsArguments } from "../../src/slices/settings/index.js";
import { DEFAULT_CONFIG } from "../../src/shared/config.js";
import lotusscriptModularExtension from "../../index.js";
import { MOCK_THEME, MONOLITH_CODE, TEST_DIR, ensureTestDir, mockPi } from "../helpers.js";

export async function phase1To4(): Promise<void> {
  ensureTestDir();

  // --------------------------------------------------
  // 1. Test Gotchas slice
  // --------------------------------------------------
  const allGotchas = getAllGotchas();
  console.log(`1. Loaded gotchas: ${allGotchas.length} entries`);
  if (allGotchas.length < 35) {
    throw new Error(`Expected at least 35 gotchas, got ${allGotchas.length}`);
  }

  const shellHits = searchGotchas("shell");
  console.log(`2. Search gotchas for 'shell': ${shellHits.length} hits`);
  if (shellHits.length === 0 || !shellHits[0]?.title.toLowerCase().includes("shell")) {
    throw new Error("Failed to find Shell gotcha");
  }

  // --------------------------------------------------
  // 2. Test Lazy Menu completions
  // --------------------------------------------------
  const subCompletions = completeLsArguments("", DEFAULT_CONFIG);
  console.log(`3. Root completions: ${subCompletions?.length} items`);
  if (!subCompletions || subCompletions.length === 0) {
    throw new Error("Expected root completions");
  }
  const statusItem = subCompletions.find((c) => c.label === "status");
  if (!statusItem || statusItem.value !== "status") {
    throw new Error("Completion contract violation on status item");
  }

  const configSetCompletions = completeLsArguments("config set ", DEFAULT_CONFIG);
  console.log(`4. Config set completions: ${configSetCompletions?.length} items`);
  const lspKeyItem = configSetCompletions?.find((c) => c.label === "enableLsp");
  if (!lspKeyItem || lspKeyItem.value !== "config set enableLsp ") {
    throw new Error("Completion contract violation: value must be full prefix + key + trailing space");
  }

  const globalCompletions = completeLsArguments("--global ", DEFAULT_CONFIG);
  if (!globalCompletions || !globalCompletions.some((c) => c.value === "--global status")) {
    throw new Error("Expected --global status completion");
  }
  const directSettingCompletions = completeLsArguments("checkProcedureLimits ", DEFAULT_CONFIG);
  if (!directSettingCompletions || !directSettingCompletions.some((c) => c.value === "checkProcedureLimits true")) {
    throw new Error("Expected direct setting value completion");
  }

  // --------------------------------------------------
  // 3. Test Agent workflow (decompile -> sync -> compile -> overwrite -> LSP)
  // --------------------------------------------------
  const monolithPath = path.join(TEST_DIR, "SampleAgent.lss");
  fs.writeFileSync(monolithPath, MONOLITH_CODE, "utf-8");
  console.log(`5. Created sample monolith: ${monolithPath}`);

  const isMono = isMonolithicLss(monolithPath);
  console.log("6. isMonolithicLss:", isMono ? "PASS" : "FAIL");
  if (!isMono) throw new Error("Expected isMonolithicLss to be true");

  const outDir = AgentParser.decompileLss(monolithPath);
  console.log("7. Decompiled to:", outDir);

  const manifestPath = path.join(outDir, "manifest.json");
  const mainLssPath = path.join(outDir, "main.lss");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(mainLssPath)) {
    throw new Error("Missing manifest.json or main.lss");
  }

  const existingDir = getExistingModularDir(monolithPath);
  console.log("8a. getExistingModularDir:", existingDir === outDir ? "PASS" : "FAIL");
  const isMonoAfter = isMonolithicLss(monolithPath);
  console.log("8b. isMonolithicLss after decompile (should be false):", !isMonoAfter ? "PASS" : "FAIL");
  if (isMonoAfter) throw new Error("Expected isMonolithicLss to be false when modular dir exists");

  const root = findModularRoot(mainLssPath);
  console.log("8c. findModularRoot:", root === outDir ? "PASS" : "FAIL");

  const newSubPath = path.join(outDir, "sub_helper.lss");
  fs.writeFileSync(
    newSubPath,
    `' @script-member-of: SampleAgent\nSub HelperProc()\n    Print "Helper"\nEnd Sub\n`,
    "utf-8"
  );
  const syncedManifest = AgentParser.syncManifest(outDir);
  const hasHelper = syncedManifest.compilationOrder.includes("sub_helper.lss");
  console.log("9. syncManifest includes newly added sub_helper.lss:", hasHelper ? "PASS" : "FAIL");
  if (!hasHelper) throw new Error("syncManifest failed to include new sub_helper.lss");

  const compiledFile = AgentParser.compileAgent(outDir, { overwriteSourceLss: true });
  console.log("10. Compiled file:", compiledFile);
  if (!fs.existsSync(compiledFile)) {
    throw new Error("Compiled file does not exist");
  }

  const compiledContent = fs.readFileSync(compiledFile, "utf-8");
  if (!compiledContent.includes("HelperProc") || !compiledContent.includes("ProcessNotes")) {
    throw new Error("Compiled content missing procedures");
  }
  console.log("11. Compiled content verification: PASS");

  const sourceOverwrittenContent = fs.readFileSync(monolithPath, "utf-8");
  const hasOverwrittenHelper = sourceOverwrittenContent.includes("HelperProc");
  console.log("12. Overwrite original .lss source verification:", hasOverwrittenHelper ? "PASS" : "FAIL");
  if (!hasOverwrittenHelper) throw new Error("Original source file was not overwritten");

  const lspRes = await checkLotusScriptDiagnostics(compiledFile);
  console.log("13. LSP Diagnostics result:", lspRes);
  if (!lspRes.ok) {
    throw new Error(`LSP diagnostics reported errors: ${lspRes.diagnostics}`);
  }

  // 14. Test tool_call interception with custom reading tools (e.g. ctx_execute_file, read_all)
  const monolith2Path = path.join(TEST_DIR, "Monolith2.lss");
  fs.writeFileSync(monolith2Path, MONOLITH_CODE, "utf-8");

  const { pi: mockPiA, handlers: handlersA } = mockPi(["tool_call"]);
  lotusscriptModularExtension(mockPiA);

  const toolCallHandler = handlersA["tool_call"];
  if (!toolCallHandler) {
    throw new Error("Failed to register tool_call handler");
  }

  const mockEvent: any = {
    toolName: "ctx_execute_file",
    input: { path: monolith2Path, code: "console.log(FILE_CONTENT.length)" },
  };
  toolCallHandler(mockEvent);

  const redirected = typeof mockEvent.input.path === "string" && mockEvent.input.path.endsWith("main.lss");
  console.log("14. Auto-decompile on custom tool (ctx_execute_file):", redirected ? "PASS" : "FAIL");
  if (!redirected) {
    throw new Error(`Custom tool input.path was not redirected to main.lss: ${mockEvent.input.path}`);
  }

  // 15. Verify that second access to the already decompiled file redirects to existing modular dir
  const mockEvent2: any = {
    toolName: "read_all",
    input: { path: monolith2Path },
  };
  toolCallHandler(mockEvent2);
  const redirectedExisting = typeof mockEvent2.input.path === "string" && mockEvent2.input.path.endsWith("main.lss");
  console.log("15. Redirect existing modular dir on custom tool (read_all):", redirectedExisting ? "PASS" : "FAIL");
  if (!redirectedExisting) {
    throw new Error(`Custom tool input.path was not redirected to existing modular dir: ${mockEvent2.input.path}`);
  }

  // --------------------------------------------------
  // 4. Test Gotcha Review Modal & Approval Gate
  // --------------------------------------------------
  // 16. Component rendering and layout
  let modalResult: any = null;
  const sampleTitle = "Shell keyword collision in Notes 9.0.1";
  const sampleBody = "Never use Shell as variable name.\nIt is a built-in OS command function.\nDim Shell As String fails compiler.";
  const comp = new GotchaReviewComponent(MOCK_THEME, sampleTitle, sampleBody, (res) => {
    modalResult = res;
  });

  const lines = comp.render(80);
  const renderedText = lines.join("\n");
  const hasEmojiAndTitle = renderedText.includes("🪷") && renderedText.includes("💡") && renderedText.includes("Shell keyword collision");
  const hasActions = renderedText.includes("💾 [Uložit gotchu]") && renderedText.includes("❌ [Zrušit návrh]") && renderedText.includes("✏️ [Přepsat]");
  console.log("16. Gotcha review modal layout & emoji rendering:", (hasEmojiAndTitle && hasActions) ? "PASS" : "FAIL");
  if (!hasEmojiAndTitle || !hasActions) {
    throw new Error("GotchaReviewComponent did not render required emojis, title, or actions");
  }

  // 17. Component keyboard navigation & input
  comp.handleInput("\x1b"); // Escape
  console.log("17a. Gotcha modal Escape key cancels:", modalResult?.action === "cancel" ? "PASS" : "FAIL");
  if (modalResult?.action !== "cancel") throw new Error("Escape key did not cancel modal");

  modalResult = null;
  comp.handleInput("s");
  console.log("17b. Gotcha modal 's' shortcut saves:", modalResult?.action === "save" ? "PASS" : "FAIL");
  if (modalResult?.action !== "save") throw new Error("'s' key did not save");

  modalResult = null;
  comp.handleInput("\x1b[B"); // Down
  comp.handleInput("\x1b[B"); // Down (now on index 2: Rewrite)
  const typing = "Add 64-bit Domino notes";
  for (const char of typing) {
    comp.handleInput(char);
  }
  comp.handleInput("\r"); // Enter
  console.log("17c. Gotcha modal inline rewrite instructions:", (modalResult?.action === "rewrite" && modalResult?.instructions === typing) ? "PASS" : "FAIL");
  if (modalResult?.action !== "rewrite" || modalResult?.instructions !== typing) {
    throw new Error(`Expected rewrite with '${typing}', got: ${JSON.stringify(modalResult)}`);
  }

  // 18. promptGotchaReview in non-UI environment
  const nonUiCtx: any = { hasUI: false };
  const nonUiReview = await promptGotchaReview(nonUiCtx, sampleTitle, sampleBody);
  console.log("18. promptGotchaReview without UI defaults to cancel:", nonUiReview.action === "cancel" ? "PASS" : "FAIL");
  if (nonUiReview.action !== "cancel") throw new Error("Expected non-UI review to cancel automatically");

  // 19. Tool registration & approval gate handling
  const toolRegistry = mockPi([], "lotusscript_gotchas");
  lotusscriptModularExtension(toolRegistry.pi);
  const registeredGotchasTool = toolRegistry.tool;

  if (!registeredGotchasTool) throw new Error("lotusscript_gotchas tool was not registered");

  // 19a. Non-UI tool execution rejects auto-saving
  const toolNoUiRes = await registeredGotchasTool.execute(
    "call_1",
    { action: "add", title: sampleTitle, body: sampleBody },
    undefined,
    undefined,
    { hasUI: false }
  );
  console.log("19a. Tool rejects auto-save when no UI:", (!toolNoUiRes.details?.ok && toolNoUiRes.details?.reason === "no_ui") ? "PASS" : "FAIL");
  if (toolNoUiRes.details?.ok || toolNoUiRes.details?.reason !== "no_ui") {
    throw new Error("Tool permitted auto-saving without UI");
  }

  // 19b. UI execution with rewrite request
  const mockUiWithRewrite: any = {
    hasUI: true,
    ui: {
      custom: async () => {
        return { action: "rewrite", instructions: "Uprav příklad kódu" };
      },
      notify: () => {},
    },
  };
  const toolRewriteRes = await registeredGotchasTool.execute(
    "call_2",
    { action: "add", title: sampleTitle, body: sampleBody },
    undefined,
    undefined,
    mockUiWithRewrite
  );
  const rewriteOk = !toolRewriteRes.details?.ok && toolRewriteRes.details?.rewriteRequested && toolRewriteRes.details?.instructions === "Uprav příklad kódu";
  console.log("19b. Tool handles rewrite request from modal:", rewriteOk ? "PASS" : "FAIL");
  if (!rewriteOk) throw new Error(`Rewrite flow failed: ${JSON.stringify(toolRewriteRes)}`);

  // 19c. UI execution with user cancellation
  const mockUiWithCancel: any = {
    hasUI: true,
    ui: {
      custom: async () => ({ action: "cancel" }),
      notify: () => {},
    },
  };
  const toolCancelRes = await registeredGotchasTool.execute(
    "call_3",
    { action: "add", title: sampleTitle, body: sampleBody },
    undefined,
    undefined,
    mockUiWithCancel
  );
  const cancelOk = !toolCancelRes.details?.ok && toolCancelRes.details?.reason === "rejected_by_user";
  console.log("19c. Tool handles user cancellation from modal:", cancelOk ? "PASS" : "FAIL");
  if (!cancelOk) throw new Error("Cancellation flow failed");
}
