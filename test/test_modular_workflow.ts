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
import { completeLsArguments } from "../src/slices/settings/index.js";
import { DEFAULT_CONFIG } from "../src/shared/config.js";
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

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log("=== All VSA Modular Workflow Tests Passed! ===");
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
