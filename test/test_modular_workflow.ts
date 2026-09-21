import fs from "node:fs";
import path from "node:path";
import {
  findModularRoot,
  getExistingModularDir,
  isMonolithicLss,
} from "../src/shared/paths.js";
import { AgentParser } from "../src/slices/parser/index.js";
import { checkLotusScriptDiagnostics } from "../src/slices/lsp/index.js";
import { getAllGotchas, searchGotchas, GotchaReviewComponent, promptGotchaReview } from "../src/slices/gotchas/index.js";
import { lintModularFolder, ProcedureLimitComponent } from "../src/slices/linter/index.js";
import {
  buildGradingRubric,
  buildRecurringGotchaDraft,
  computeScorecard,
  findRecurringSignatures,
  formatScorecard,
  normalizeDiagnostics,
  trendLabel,
} from "../src/slices/scorecard/index.js";
import { completeLsArguments } from "../src/slices/settings/index.js";
import {
  scanLotusScriptComments,
  buildJevPayload,
  parseJevResponse,
  createFallbackEval,
  buildFolderSummary,
} from "../src/slices/evaluator/index.js";
import { DEFAULT_CONFIG, projectConfigPath } from "../src/shared/config.js";
import lotusscriptModularExtension from "../index.js";

async function runTest() {
  console.log("=== Testing LotusScript Modular Standalone Package (VSA Layout) ===");

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

  // --------------------------------------------------
  // 3. Test Agent workflow (decompile -> sync -> compile -> overwrite -> LSP)
  // --------------------------------------------------
  const testDir = path.resolve("./temp_modular_test");
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const monolithPath = path.join(testDir, "SampleAgent.lss");
  const monolithCode = `%REM
    Agent: SampleAgent
%END REM
Option Public
Option Declare

Dim g_session As NotesSession
Dim g_db As NotesDatabase

Sub Initialize
    Set g_session = New NotesSession
    Set g_db = g_session.CurrentDatabase
    Call ProcessNotes()
End Sub

Sub ProcessNotes()
    Dim doc As NotesDocument
    Print "Processing..."
End Sub

Function GetStatus() As String
    GetStatus = "OK"
End Function
`;

  fs.writeFileSync(monolithPath, monolithCode, "utf-8");
  console.log("5. Created sample monolith:", monolithPath);

  // Test isMonolithicLss
  const isMono = isMonolithicLss(monolithPath);
  console.log("6. isMonolithicLss:", isMono ? "PASS" : "FAIL");
  if (!isMono) throw new Error("Expected isMonolithicLss to be true");

  // Test decompile
  const outDir = AgentParser.decompileLss(monolithPath);
  console.log("7. Decompiled to:", outDir);

  const manifestPath = path.join(outDir, "manifest.json");
  const mainLssPath = path.join(outDir, "main.lss");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(mainLssPath)) {
    throw new Error("Missing manifest.json or main.lss");
  }

  // Test getExistingModularDir and prevention of redundant decompile
  const existingDir = getExistingModularDir(monolithPath);
  console.log("8a. getExistingModularDir:", existingDir === outDir ? "PASS" : "FAIL");
  const isMonoAfter = isMonolithicLss(monolithPath);
  console.log("8b. isMonolithicLss after decompile (should be false):", !isMonoAfter ? "PASS" : "FAIL");
  if (isMonoAfter) throw new Error("Expected isMonolithicLss to be false when modular dir exists");

  // Test findModularRoot
  const root = findModularRoot(mainLssPath);
  console.log("8c. findModularRoot:", root === outDir ? "PASS" : "FAIL");

  // Test adding a new procedure file and syncing manifest
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

  // Test compile with overwriteSourceLss: true
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

  // Verify that original monolith source file was overwritten with fresh code
  const sourceOverwrittenContent = fs.readFileSync(monolithPath, "utf-8");
  const hasOverwrittenHelper = sourceOverwrittenContent.includes("HelperProc");
  console.log("12. Overwrite original .lss source verification:", hasOverwrittenHelper ? "PASS" : "FAIL");
  if (!hasOverwrittenHelper) throw new Error("Original source file was not overwritten");

  // Test LSP check on the compiled file
  const lspRes = await checkLotusScriptDiagnostics(compiledFile);
  console.log("13. LSP Diagnostics result:", lspRes);
  if (!lspRes.ok) {
    throw new Error(`LSP diagnostics reported errors: ${lspRes.diagnostics}`);
  }

  // 14. Test tool_call interception with custom reading tools (e.g. ctx_execute_file, read_all)
  const monolith2Path = path.join(testDir, "Monolith2.lss");
  fs.writeFileSync(monolith2Path, monolithCode, "utf-8");

  let toolCallHandler: any = null;
  const mockPi: any = {
    on: (evt: string, handler: any) => {
      if (evt === "tool_call") toolCallHandler = handler;
    },
    registerCommand: () => {},
    registerTool: () => {},
  };
  lotusscriptModularExtension(mockPi);

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
  const mockTheme: any = {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
  };

  // 16. Component rendering and layout
  let modalResult: any = null;
  const sampleTitle = "Shell keyword collision in Notes 9.0.1";
  const sampleBody = "Never use Shell as variable name.\nIt is a built-in OS command function.\nDim Shell As String fails compiler.";
  const comp = new GotchaReviewComponent(mockTheme, sampleTitle, sampleBody, (res) => {
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
  // Test 17a: Escape key cancels
  comp.handleInput("\x1b"); // Escape
  console.log("17a. Gotcha modal Escape key cancels:", modalResult?.action === "cancel" ? "PASS" : "FAIL");
  if (modalResult?.action !== "cancel") throw new Error("Escape key did not cancel modal");

  // Test 17b: 's' key approves/saves
  modalResult = null;
  comp.handleInput("s");
  console.log("17b. Gotcha modal 's' shortcut saves:", modalResult?.action === "save" ? "PASS" : "FAIL");
  if (modalResult?.action !== "save") throw new Error("'s' key did not save");

  // Test 17c: Navigate down to rewrite, type instructions, Enter
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
  let registeredGotchasTool: any = null;
  const toolRegistryPi: any = {
    on: () => {},
    registerCommand: () => {},
    registerTool: (def: any) => {
      if (def.name === "lotusscript_gotchas") {
        registeredGotchasTool = def;
      }
    },
  };
  lotusscriptModularExtension(toolRegistryPi);

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

  // --------------------------------------------------
  // 5. Test Ephemeral Modularization & Cleanup on Settled
  // --------------------------------------------------
  // 20. compileAgent with deleteModularDir for .lss
  const ephemeralLssPath = path.join(testDir, "EphemeralScript.lss");
  fs.writeFileSync(ephemeralLssPath, monolithCode, "utf-8");
  const ephDir = AgentParser.decompileLss(ephemeralLssPath);
  if (!fs.existsSync(ephDir)) throw new Error("Failed to decompile EphemeralScript");

  const ephResult = AgentParser.compileAgent(ephDir, {
    overwriteSourceLss: true,
    deleteModularDir: true,
  });

  const ephDeleted = !fs.existsSync(ephDir);
  const ephFileUpdated = fs.existsSync(ephemeralLssPath) && fs.readFileSync(ephemeralLssPath, "utf-8").includes("ProcessNotes");
  console.log("20. Ephemeral .lss compiles, overwrites source and deletes modular folder:", (ephDeleted && ephFileUpdated && ephResult === ephemeralLssPath) ? "PASS" : "FAIL");
  if (!ephDeleted || !ephFileUpdated) {
    throw new Error("Ephemeral .lss compilation failed to delete folder or overwrite source");
  }

  // 21. compileAgent with createLssForDxl & deleteModularDir for .dxl
  const sampleDxl = `<?xml version="1.0" encoding="UTF-8"?>
<agent name="SampleDxlAgent">
<code event="initialize"><lotusscript>
Option Public
Option Declare
Sub Initialize
    Print "Hello from DXL"
End Sub
</lotusscript></code>
</agent>`;
  const dxlPath = path.join(testDir, "SampleDxlAgent.dxl");
  fs.writeFileSync(dxlPath, sampleDxl, "utf-8");
  const dxlOutDir = AgentParser.decompileDxl(dxlPath);
  if (!dxlOutDir || !fs.existsSync(dxlOutDir)) throw new Error("Failed to decompile SampleDxlAgent");

  const expectedNewLss = path.join(testDir, "SampleDxlAgent.lss");
  const dxlCompiledResult = AgentParser.compileAgent(dxlOutDir, {
    createLssForDxl: true,
    deleteModularDir: true,
  });

  const dxlFolderDeleted = !fs.existsSync(dxlOutDir);
  const dxlNewLssExists = fs.existsSync(expectedNewLss) && fs.readFileSync(expectedNewLss, "utf-8").includes("Hello from DXL");
  console.log("21. Ephemeral .dxl compiles to new standalone .lss and deletes modular folder:", (dxlFolderDeleted && dxlNewLssExists && dxlCompiledResult === expectedNewLss) ? "PASS" : "FAIL");
  if (!dxlFolderDeleted || !dxlNewLssExists) {
    throw new Error("Ephemeral .dxl compilation failed to create .lss or delete folder");
  }

  // 22. agent_settled lifecycle hook cleans up modified modular folders
  let agentSettledHandler: any = null;
  let extToolCallHandler: any = null;
  let extToolResultHandler: any = null;

  const lifecycleMockPi: any = {
    on: (evt: string, handler: any) => {
      if (evt === "agent_settled") agentSettledHandler = handler;
      if (evt === "tool_call") extToolCallHandler = handler;
      if (evt === "tool_result") extToolResultHandler = handler;
    },
    registerCommand: () => {},
    registerTool: () => {},
  };
  lotusscriptModularExtension(lifecycleMockPi);

  if (!agentSettledHandler || !extToolCallHandler || !extToolResultHandler) {
    throw new Error("Lifecycle handlers failed to register");
  }

  const liveLss = path.join(testDir, "LiveAgent.lss");
  fs.writeFileSync(liveLss, monolithCode, "utf-8");

  // Simulate reading file -> decompiles
  const readEvt: any = { toolName: "read", input: { path: liveLss } };
  extToolCallHandler(readEvt);
  const liveModularDir = path.join(testDir, "LiveAgent");
  if (!fs.existsSync(liveModularDir)) throw new Error("Failed to auto-decompile LiveAgent");

  // Simulate editing a procedure inside the modular folder
  const subClick = path.join(liveModularDir, "sub_ProcessNotes.lss");
  const editEvt: any = {
    toolName: "edit",
    input: { path: subClick },
    content: [{ type: "text", text: "Edited" }],
    isError: false,
  };
  await extToolResultHandler(editEvt);

  // Trigger agent_settled
  await agentSettledHandler({}, { hasUI: false, cwd: testDir });

  const liveFolderDeleted = !fs.existsSync(liveModularDir);
  const liveLssUpdated = fs.existsSync(liveLss) && fs.readFileSync(liveLss, "utf-8").includes("ProcessNotes");
  console.log("22. agent_settled automatically cleans up modified modular folders:", (liveFolderDeleted && liveLssUpdated) ? "PASS" : "FAIL");
  if (!liveFolderDeleted || !liveLssUpdated) {
    throw new Error("agent_settled hook failed to clean up modular directory");
  }

  // --------------------------------------------------
  // 6. Test Procedure Line-Limit & Comment Linter
  // --------------------------------------------------
  // 23. Test lintProcedureFile & lintModularFolder
  const lintDir = path.join(testDir, "LintTestDir");
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

  // Create procedure with 320 lines (exceeding 300 limit)
  const longProcLines = [
    "' @script-member-of: LintTest",
    "' @procedure: MassiveSub",
    "Sub MassiveSub()",
  ];
  for (let i = 0; i < 320; i++) {
    longProcLines.push(`    Print "Statement line ${i}"`);
  }
  longProcLines.push("End Sub");
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
  const procComp = new ProcedureLimitComponent(mockTheme, lintRes.exceededProcedures[0]!, (res) => {
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
  // 25a. Escape rejects
  procComp.handleInput("\x1b");
  console.log("25a. Escape key rejects line limit excess:", procReviewResult?.action === "reject" ? "PASS" : "FAIL");
  if (procReviewResult?.action !== "reject") throw new Error("Escape failed to reject");

  // 25b. 'p' key approves exception
  procReviewResult = null;
  procComp.handleInput("p");
  console.log("25b. 'p' key approves procedure exception:", procReviewResult?.action === "approve" ? "PASS" : "FAIL");
  if (procReviewResult?.action !== "approve") throw new Error("'p' key failed to approve");

  // 25c. Navigate to split instructions, type directions, Enter
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
  let lintPiToolResultHandler: any = null;
  const lintTestPi: any = {
    on: (evt: string, handler: any) => {
      if (evt === "tool_result") lintPiToolResultHandler = handler;
    },
    registerCommand: () => {},
    registerTool: () => {},
  };
  lotusscriptModularExtension(lintTestPi);

  // Setup modular directory with long procedure
  const agentWithLongProc = path.join(testDir, "AgentWithLongProc");
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
  // We mock ui.custom to return reject
  const mockContextReject: any = {
    hasUI: true,
    cwd: testDir,
    ui: {
      custom: async () => ({ action: "reject" }),
      notify: () => {},
    },
  };
  // We need latestUiContext set on extension, so we can trigger session_start
  let sessionStartHandler: any = null;
  const lintMockPi2: any = {
    on: (evt: string, handler: any) => {
      if (evt === "session_start") sessionStartHandler = handler;
      if (evt === "tool_result") lintPiToolResultHandler = handler;
    },
    registerCommand: () => {},
    registerTool: () => {},
  };
  lotusscriptModularExtension(lintMockPi2);
  sessionStartHandler({}, mockContextReject);

  const editLongProcEvt: any = {
    toolName: "edit",
    input: { path: path.join(agentWithLongProc, "sub_MassiveSub.lss") },
    content: [{ type: "text", text: "Modified line" }],
    isError: false,
  };

  const lintBlockResult = await lintPiToolResultHandler(editLongProcEvt);
  const wasBlocked = lintBlockResult?.isError === true && lintBlockResult?.content?.[1]?.text?.includes("exceeding the 300-line limit");
  console.log("26. Tool result halts and instructs AI to split when user rejects excess:", wasBlocked ? "PASS" : "FAIL");
  if (!wasBlocked) {
    throw new Error(`Expected tool_result to halt with split guidance, got: ${JSON.stringify(lintBlockResult)}`);
  }

  // 27. Anti-loop gate: re-editing an UNCHANGED over-limit file must not reopen the modal.
  let modalOpenCount = 0;
  const loopProbeCtx: any = {
    hasUI: true,
    cwd: testDir,
    ui: {
      custom: async () => {
        modalOpenCount++;
        return { action: "reject" };
      },
      notify: () => {},
    },
  };
  let loopSessionStart: any = null;
  let loopToolResult: any = null;
  const loopPi: any = {
    on: (evt: string, handler: any) => {
      if (evt === "session_start") loopSessionStart = handler;
      if (evt === "tool_result") loopToolResult = handler;
    },
    registerCommand: () => {},
    registerTool: () => {},
  };
  lotusscriptModularExtension(loopPi);
  loopSessionStart({}, loopProbeCtx);

  const loopEvt = () => ({
    toolName: "edit",
    input: { path: path.join(agentWithLongProc, "sub_MassiveSub.lss") },
    content: [{ type: "text", text: "touch" }],
    isError: false,
  });

  const firstLoopRes = await loopToolResult(loopEvt());
  const secondLoopRes = await loopToolResult(loopEvt());
  const thirdLoopRes = await loopToolResult(loopEvt());

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
  const sizedComp = new ProcedureLimitComponent(mockTheme, lintRes.exceededProcedures[0]!, () => {}, 120, 30);
  const sizedLines = sizedComp.render(120);
  const widthOk = sizedLines.every((l) => l.length < 400);
  const hasWrappedRisk = sizedLines.join("\n").includes("Script structure too large");
  console.log("28. Modal sizes to terminal and wraps long text:", (widthOk && hasWrappedRisk) ? "PASS" : "FAIL");
  if (!widthOk || !hasWrappedRisk) {
    throw new Error("Modal did not wrap/scale correctly");
  }

  // --------------------------------------------------
  // 7. Scorecard / grading (Phase 1)
  // --------------------------------------------------
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
  let skipRubricPromptHandler: any = null;
  const rubricPi: any = {
    on: (evt: string, handler: any) => {
      if (evt === "before_agent_start") skipRubricPromptHandler = handler;
    },
    registerCommand: () => {},
    registerTool: () => {},
  };
  lotusscriptModularExtension(rubricPi);
  const promptEvent: any = { systemPromptOptions: { promptGuidelines: [] } };
  skipRubricPromptHandler(promptEvent);
  const guidelines: string[] = promptEvent.systemPromptOptions.promptGuidelines;
  const rubricInjected = guidelines.some((g) => g.includes("DEFINITION OF DONE"));
  console.log("33. before_agent_start injects the grading rubric:", rubricInjected ? "PASS" : "FAIL");
  if (!rubricInjected) throw new Error(`Rubric was not injected. Guidelines: ${JSON.stringify(guidelines)}`);

  // 34. Scorecard is emitted in the recompile result (integration)
  const scoreDir = path.join(testDir, "ScoreAgent");
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

  let scoreToolResult: any = null;
  const scorePi: any = {
    on: (evt: string, handler: any) => {
      if (evt === "tool_result") scoreToolResult = handler;
    },
    registerCommand: () => {},
    registerTool: () => {},
  };
  lotusscriptModularExtension(scorePi);

  const scoreEditEvt: any = {
    toolName: "edit",
    input: { path: path.join(scoreDir, "sub_Thing.lss") },
    content: [{ type: "text", text: "edited" }],
    isError: false,
  };
  const scoreRes = await scoreToolResult(scoreEditEvt);
  const scoreText: string = scoreRes?.content?.[1]?.text ?? "";
  const scoreEmitted =
    scoreText.includes("SCORECARD") &&
    scoreText.includes("ScoreAgent") &&
    scoreText.includes("procedures ≤ 300 lines") &&
    scoreText.includes("first compile");
  console.log("34. Recompile result contains the computed scorecard:", scoreEmitted ? "PASS" : "FAIL");
  if (!scoreEmitted) throw new Error(`Scorecard missing from recompile result:\n${scoreText}`);

  // --------------------------------------------------
  // 8. Instant-failure guards (Phase 2)
  // --------------------------------------------------
  let guardToolCall: any = null;
  let guardToolResult: any = null;
  const guardPi: any = {
    on: (evt: string, handler: any) => {
      if (evt === "tool_call") guardToolCall = handler;
      if (evt === "tool_result") guardToolResult = handler;
    },
    registerCommand: () => {},
    registerTool: () => {},
  };
  lotusscriptModularExtension(guardPi);

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

  const outsideLss = path.join(testDir, "OutsideThing.lss");
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

  // --------------------------------------------------
  // 9. Pre-flight gotchas, debrief handoff (Phase 3)
  // --------------------------------------------------
  const makeRoot = (name: string, files: Record<string, string>): string => {
    const dir = path.join(testDir, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "main.lss"), "' main\n", "utf-8");
    for (const [file, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, file), body, "utf-8");
    }
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify(
        {
          formatVersion: "1.0",
          agentName: name,
          decompileTimestamp: new Date().toISOString(),
          compilationOrder: ["00_options.lss", "01_declarations.lss", ...Object.keys(files).filter((f) => f !== "00_options.lss" && f !== "01_declarations.lss")],
        },
        null,
        2
      ),
      "utf-8"
    );
    return dir;
  };

  // 40. Pre-flight banner surfaces a trap matching the agent's own identifier
  const preflightDir = makeRoot("PreflightAgent", {
    "00_options.lss": "Option Public\nOption Declare\n",
    "01_declarations.lss": "' Deklarace\nDim shell As Variant\n",
    "sub_Thing.lss": "' @script-member-of: PreflightAgent\n' @procedure: Thing\n' Účel: Testovací procedura pro předletovou kontrolu gotchas.\nSub Thing()\n    Print \"x\"\nEnd Sub\n",
  });

  let preflightToolResult: any = null;
  const preflightPi: any = {
    on: (evt: string, handler: any) => {
      if (evt === "tool_result") preflightToolResult = handler;
    },
    registerCommand: () => {},
    registerTool: () => {},
  };
  lotusscriptModularExtension(preflightPi);

  const preflightRead = await preflightToolResult({
    toolName: "read",
    input: { path: path.join(preflightDir, "main.lss") },
    content: [{ type: "text", text: "main.lss body" }],
    isError: false,
  });
  const preflightText: string = preflightRead?.content?.[1]?.text ?? "";
  const preflightOk =
    preflightText.includes("PRE-FLIGHT GOTCHA CHECK") &&
    preflightText.toLowerCase().includes("shell");
  console.log("40. Pre-flight banner surfaces traps matching agent identifiers:", preflightOk ? "PASS" : "FAIL");
  if (!preflightOk) throw new Error(`Pre-flight banner missing targeted match:\n${preflightText}`);

  // 41. Pre-flight falls back to the generic summary when nothing matches
  const inertDir = makeRoot("InertAgent", {
    "00_options.lss": "Option Public\n",
    "01_declarations.lss": "' nic\n",
    "sub_Zzq.lss": "' @script-member-of: InertAgent\n' @procedure: Zzq\n' Účel: Inertní procedura bez kolize s evidovanými pastmi.\nSub Zzq()\n    Print \"y\"\nEnd Sub\n",
  });
  const inertRead = await preflightToolResult({
    toolName: "read",
    input: { path: path.join(inertDir, "main.lss") },
    content: [{ type: "text", text: "main.lss body" }],
    isError: false,
  });
  const inertText: string = inertRead?.content?.[1]?.text ?? "";
  const fallbackOk = inertText.includes("Top Critical LotusScript Gotchas");
  console.log("41. Pre-flight falls back to generic summary without matches:", fallbackOk ? "PASS" : "FAIL");
  if (!fallbackOk) throw new Error(`Expected generic gotchas fallback:\n${inertText}`);

  // 42. Debrief is emitted at settle and handed to the next turn
  const debriefDir = makeRoot("DebriefAgent", {
    "00_options.lss": "Option Public\n",
    "01_declarations.lss": "' nic\nDim g_count As Long\n",
    "sub_NoComment.lss": "' @script-member-of: DebriefAgent\n' @procedure: NoComment\nSub NoComment()\n    Print \"z\"\nEnd Sub\n",
  });

  let debriefToolResult: any = null;
  let debriefSettled: any = null;
  let debriefBeforeStart: any = null;
  const debriefPi: any = {
    on: (evt: string, handler: any) => {
      if (evt === "tool_result") debriefToolResult = handler;
      if (evt === "agent_settled") debriefSettled = handler;
      if (evt === "before_agent_start") debriefBeforeStart = handler;
    },
    registerCommand: () => {},
    registerTool: () => {},
  };
  lotusscriptModularExtension(debriefPi);

  await debriefToolResult({
    toolName: "edit",
    input: { path: path.join(debriefDir, "sub_NoComment.lss") },
    content: [{ type: "text", text: "edited" }],
    isError: false,
  });

  const settleCtx: any = { hasUI: false, cwd: testDir, ui: { notify: () => {} } };
  await debriefSettled({}, settleCtx);

  const debriefEvent: any = { systemPromptOptions: { promptGuidelines: [] } };
  const debriefTurn = debriefBeforeStart(debriefEvent);
  const debriefContent: string = debriefTurn?.message?.content ?? "";
  const debriefOk =
    debriefTurn?.message?.customType === "lotusscript-debrief" &&
    debriefContent.includes("LotusScript Debrief") &&
    debriefContent.includes("Unmet Definition of Done") &&
    debriefContent.includes("Czech purpose comments");
  console.log("42. Debrief emitted at settle and injected into the next turn:", debriefOk ? "PASS" : "FAIL");
  if (!debriefOk) throw new Error(`Debrief handoff failed: ${JSON.stringify(debriefTurn)}`);

  // 42b. Debrief is consumed exactly once
  const secondTurn: any = debriefBeforeStart({ systemPromptOptions: { promptGuidelines: [] } });
  const consumed = secondTurn === undefined;
  console.log("42b. Debrief is consumed once (no repeat injection):", consumed ? "PASS" : "FAIL");
  if (!consumed) throw new Error(`Debrief repeated: ${JSON.stringify(secondTurn)}`);

  // 43. No debrief when the Definition of Done is fully satisfied
  const cleanDir = makeRoot("CleanAgent", {
    "00_options.lss": "Option Public\n",
    "01_declarations.lss": "' nic\nDim g_total As Long\n",
    "sub_Fine.lss": "' @script-member-of: CleanAgent\n' @procedure: Fine\n' Účel: Procedura splňující všechny položky Definition of Done.\nSub Fine()\n    Print \"ok\"\n    ' druhá řádka popisu\nEnd Sub\n",
  });

  let cleanToolResult: any = null;
  let cleanSettled: any = null;
  let cleanBeforeStart: any = null;
  const cleanPi: any = {
    on: (evt: string, handler: any) => {
      if (evt === "tool_result") cleanToolResult = handler;
      if (evt === "agent_settled") cleanSettled = handler;
      if (evt === "before_agent_start") cleanBeforeStart = handler;
    },
    registerCommand: () => {},
    registerTool: () => {},
  };
  lotusscriptModularExtension(cleanPi);

  await cleanToolResult({
    toolName: "edit",
    input: { path: path.join(cleanDir, "sub_Fine.lss") },
    content: [{ type: "text", text: "edited" }],
    isError: false,
  });
  await cleanSettled({}, { hasUI: false, cwd: testDir, ui: { notify: () => {} } });
  const cleanTurn: any = cleanBeforeStart({ systemPromptOptions: { promptGuidelines: [] } });
  const noDebrief = cleanTurn === undefined;
  console.log("43. No debrief when Definition of Done is satisfied:", noDebrief ? "PASS" : "FAIL");
  if (!noDebrief) throw new Error(`Unexpected debrief for clean agent: ${JSON.stringify(cleanTurn)}`);

  // --------------------------------------------------
  // 10. Recurring-failure gotcha drafting (Phase 4)
  // --------------------------------------------------
  // 44. normalizeDiagnostics is location-independent
  const sigA = normalizeDiagnostics("ERROR: Type mismatch in assignment (line 10; column 2)")[0];
  const sigB = normalizeDiagnostics("ERROR: Type mismatch in assignment (line 931; column 37)")[0];
  const normOk =
    !!sigA &&
    sigA === sigB &&
    sigA.includes("type mismatch") &&
    !/\d/.test(sigA);
  console.log("44. normalizeDiagnostics strips line/column so the same fault matches:", normOk ? "PASS" : "FAIL");
  if (!normOk) throw new Error(`Normalization failed: "${sigA}" vs "${sigB}"`);

  // 45. findRecurringSignatures distinguishes recurring from one-off
  const recurringHit = findRecurringSignatures(["error: type mismatch in assignment"], [["error: type mismatch in assignment"]], 2);
  const oneOff = findRecurringSignatures(["error: brand new problem here"], [["error: type mismatch in assignment"]], 2);
  const noHistory = findRecurringSignatures(["error: type mismatch in assignment"], [], 2);
  const recurOk = recurringHit.length === 1 && oneOff.length === 0 && noHistory.length === 0;
  console.log("45. findRecurringSignatures flags only genuine repeats:", recurOk ? "PASS" : "FAIL");
  if (!recurOk) throw new Error(`Recurrence detection failed: ${JSON.stringify({ recurringHit, oneOff, noHistory })}`);

  // 46. buildRecurringGotchaDraft produces a usable draft
  const draft = buildRecurringGotchaDraft("RecurAgent", ["error: type mismatch in assignment"], ["sub_Recur.lss"]);
  const draftOk =
    draft.title.includes("Recurring LotusScript diagnostic in RecurAgent") &&
    draft.body.includes("Recurring failure detected by the harness") &&
    draft.body.includes("sub_Recur.lss") &&
    draft.body.includes("error: type mismatch in assignment");
  console.log("46. buildRecurringGotchaDraft produces a usable draft:", draftOk ? "PASS" : "FAIL");
  if (!draftOk) throw new Error(`Bad draft: ${JSON.stringify(draft)}`);

  // 47. Integration: a recurring LSP diagnostic opens the gotcha modal exactly once
  const fakeLsp = path.join(testDir, "fake-lsp.cjs");
  fs.writeFileSync(
    fakeLsp,
    [
      "process.stdin.setEncoding('utf8');",
      "let buf = '';",
      "process.stdin.on('data', (chunk) => {",
      "  buf += chunk;",
      "  let idx;",
      "  while ((idx = buf.indexOf('\\n')) !== -1) {",
      "    const line = buf.slice(0, idx).trim();",
      "    buf = buf.slice(idx + 1);",
      "    if (!line) continue;",
      "    let msg;",
      "    try { msg = JSON.parse(line); } catch { continue; }",
      "    if (msg.method === 'initialize') {",
      "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }) + '\\n');",
      "    } else if (msg.method === 'tools/call') {",
      "      const n = 100 + Math.floor(Math.random() * 800);",
      "      const text = `ERROR: Type mismatch in assignment (line ${n}; column ${n % 40})`;",
      "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text }] } }) + '\\n');",
      "    }",
      "  }",
      "});",
    ].join("\n"),
    "utf-8"
  );

  const recurDir = makeRoot("RecurAgent", {
    "00_options.lss": "Option Public\n",
    "01_declarations.lss": "' nic\nDim g_x As Long\n",
    "sub_Recur.lss": "' @script-member-of: RecurAgent\n' @procedure: Recur\n' Účel: Procedura pro test opakované LSP chyby.\nSub Recur()\n    Print \"r\"\nEnd Sub\n",
  });

  const cfgPath = projectConfigPath(testDir);
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({ enableLsp: true, autoDraftRecurringGotchas: true }, null, 2),
    "utf-8"
  );

  const previousLspEnv = process.env.LOTUSSCRIPT_MCP_SERVER;
  process.env.LOTUSSCRIPT_MCP_SERVER = fakeLsp;

  let modalCalls = 0;
  const recurCtx: any = {
    hasUI: true,
    cwd: testDir,
    ui: {
      custom: async () => {
        modalCalls++;
        return { action: "cancel" };
      },
      notify: () => {},
    },
  };

  let recurSessionStart: any = null;
  let recurToolResult: any = null;
  const recurPi: any = {
    on: (evt: string, handler: any) => {
      if (evt === "session_start") recurSessionStart = handler;
      if (evt === "tool_result") recurToolResult = handler;
    },
    registerCommand: () => {},
    registerTool: () => {},
  };
  lotusscriptModularExtension(recurPi);
  recurSessionStart({}, recurCtx);

  const recurEdit = () => ({
    toolName: "edit",
    input: { path: path.join(recurDir, "sub_Recur.lss") },
    content: [{ type: "text", text: "edited" }],
    isError: false,
  });

  await recurToolResult(recurEdit(), recurCtx);
  const afterFirst = modalCalls;
  await recurToolResult(recurEdit(), recurCtx);
  const afterSecond = modalCalls;
  await recurToolResult(recurEdit(), recurCtx);
  const afterThird = modalCalls;

  const recurringOk = afterFirst === 0 && afterSecond === 1 && afterThird === 1;
  console.log("47. Recurring LSP diagnostic drafts a gotcha exactly once:", recurringOk ? "PASS" : "FAIL");
  if (!recurringOk) {
    throw new Error(`Recurring detection failed — modal calls after each cycle: ${afterFirst}/${afterSecond}/${afterThird}`);
  }

  if (previousLspEnv === undefined) delete process.env.LOTUSSCRIPT_MCP_SERVER;
  else process.env.LOTUSSCRIPT_MCP_SERVER = previousLspEnv;

  // --------------------------------------------------
  // 48. JEV Evaluator: Deterministic comment parsing (New Style)
  // --------------------------------------------------
  const newStyleCode = [
    "' @script-member-of: TestAgent",
    "' @procedure: ProcessDoc",
    "' @parent-declarations: 01_declarations.lss",
    "' Účel: Zpracuje a zvaliduje příchozí objednávku podle pravidel",
    "Sub ProcessDoc(doc As NotesDocument)",
    "  Print \"Done\"",
    "End Sub",
  ].join("\n");
  const newAnalysis = scanLotusScriptComments(newStyleCode);
  const newStyleOk =
    newAnalysis.style === "new" &&
    newAnalysis.hasCzechPurpose === true &&
    newAnalysis.purposeText === "Zpracuje a zvaliduje příchozí objednávku podle pravidel" &&
    newAnalysis.hasSyntheticHeader === true &&
    newAnalysis.hasLegacyBlock === false;
  console.log("48. scanLotusScriptComments identifies new style with Czech purpose:", newStyleOk ? "PASS" : "FAIL");
  if (!newStyleOk) throw new Error(`Unexpected new-style analysis: ${JSON.stringify(newAnalysis)}`);

  // --------------------------------------------------
  // 49. JEV Evaluator: Deterministic comment parsing (Old / Legacy Style)
  // --------------------------------------------------
  const oldStyleCode = [
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
  const oldAnalysis = scanLotusScriptComments(oldStyleCode);
  const oldStyleOk =
    oldAnalysis.style === "old" &&
    oldAnalysis.hasCzechPurpose === false &&
    oldAnalysis.hasLegacyBlock === true &&
    oldAnalysis.legacyMarkers.length >= 3;
  console.log("49. scanLotusScriptComments identifies legacy %REM and markers:", oldStyleOk ? "PASS" : "FAIL");
  if (!oldStyleOk) throw new Error(`Unexpected old-style analysis: ${JSON.stringify(oldAnalysis)}`);

  // --------------------------------------------------
  // 50. JEV Evaluator: String literal immunity (' and REM inside quotes)
  // --------------------------------------------------
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

  // --------------------------------------------------
  // 51. JEV Evaluator: Payload generation (Strict Jev 1.13 Ground Truth)
  // --------------------------------------------------
  const jevPayload = buildJevPayload({
    fileName: "sub_ProcessDoc.lss",
    procedureName: "ProcessDoc",
    signature: "Sub ProcessDoc(doc As NotesDocument)",
    codeSnippet: newStyleCode,
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

  // --------------------------------------------------
  // 52. JEV Evaluator: Response parsing with calibrated strict thresholds
  // --------------------------------------------------
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

  // --------------------------------------------------
  // 53. JEV Evaluator: Fallback eval & folder summary
  // --------------------------------------------------
  const fallbackNew = createFallbackEval("sub_ProcessDoc.lss", "ProcessDoc", newAnalysis);
  const fallbackOld = createFallbackEval("sub_Old.lss", "OldProc", oldAnalysis);
  const folderSummary = buildFolderSummary([fallbackNew, fallbackOld]);
  const summaryOk =
    folderSummary.newStyleCount === 1 &&
    folderSummary.oldStyleCount === 1 &&
    folderSummary.ok === false &&
    folderSummary.summary.includes("Nový styl (vyhovující): 1/2") &&
    folderSummary.summary.includes("Starý styl (%REM/legacy): 1");
  console.log("53. createFallbackEval & buildFolderSummary aggregate metrics:", summaryOk ? "PASS" : "FAIL");
  if (!summaryOk) throw new Error(`Unexpected folder summary: ${JSON.stringify(folderSummary)}`);

  // --------------------------------------------------
  // 54. JEV Evaluator: Scorecard integration
  // --------------------------------------------------
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

  // --------------------------------------------------
  // 55-59. Shell / code-execution read guards (bash, ctx_execute, ctx_batch_execute)
  // --------------------------------------------------
  const shellDir = path.join(testDir, "ShellGuardAgent");
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
  const shellMonolith = path.join(testDir, "ShellGuardAgent.lss");
  fs.writeFileSync(shellMonolith, ["Option Public", "Sub Work()", "\tPrint \"1\"", "End Sub", ""].join("\n"), "utf-8");

  // 55. bash content dump of the monolith is blocked
  const bashDump = guardToolCall({
    toolName: "bash",
    input: { command: `cd "${testDir}" && cat -n ShellGuardAgent.lss | sed -n '1,180p'` },
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
    input: { command: `cd "${testDir}" && wc -l ShellGuardAgent.lss` },
  });
  const metadataOk = metadataCmd?.block !== true;
  console.log("59. Guard allows metadata-only bash (wc -l) on monolithic file:", metadataOk ? "PASS" : "FAIL");
  if (!metadataOk) throw new Error(`Metadata command was wrongly blocked: ${JSON.stringify(metadataCmd)}`);

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log("=== All VSA Modular Workflow Tests Passed! ===");
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
