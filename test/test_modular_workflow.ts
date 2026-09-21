import fs from "node:fs";
import path from "node:path";
import {
  findModularRoot,
  getExistingModularDir,
  isMonolithicLss,
} from "../src/shared/paths.js";
import { AgentParser } from "../src/slices/parser/index.js";
import { checkLotusScriptDiagnostics } from "../src/slices/lsp/index.js";
import { getAllGotchas, searchGotchas } from "../src/slices/gotchas/index.js";
import { completeLsArguments } from "../src/slices/settings/index.js";
import { DEFAULT_CONFIG } from "../src/shared/config.js";

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

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log("=== All VSA Modular Workflow Tests Passed! ===");
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
