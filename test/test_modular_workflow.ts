import fs from "node:fs";
import path from "node:path";
import {
  AgentParser,
  findModularRoot,
  getExistingModularDir,
  isMonolithicLss,
} from "../src/agent-parser.ts";
import { checkLotusScriptDiagnostics } from "../src/lsp-check.ts";

async function runTest() {
  console.log("=== Testing LotusScript Modular Standalone Package ===");

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
  console.log("1. Created sample monolith:", monolithPath);

  // Test isMonolithicLss
  const isMono = isMonolithicLss(monolithPath);
  console.log("2. isMonolithicLss:", isMono ? "PASS" : "FAIL");
  if (!isMono) throw new Error("Expected isMonolithicLss to be true");

  // Test decompile
  const outDir = AgentParser.decompileLss(monolithPath);
  console.log("3. Decompiled to:", outDir);

  const manifestPath = path.join(outDir, "manifest.json");
  const mainLssPath = path.join(outDir, "main.lss");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(mainLssPath)) {
    throw new Error("Missing manifest.json or main.lss");
  }

  // Test getExistingModularDir and prevention of redundant decompile
  const existingDir = getExistingModularDir(monolithPath);
  console.log("4a. getExistingModularDir:", existingDir === outDir ? "PASS" : "FAIL");
  const isMonoAfter = isMonolithicLss(monolithPath);
  console.log("4b. isMonolithicLss after decompile (should be false):", !isMonoAfter ? "PASS" : "FAIL");
  if (isMonoAfter) throw new Error("Expected isMonolithicLss to be false when modular dir exists");

  // Test findModularRoot
  const root = findModularRoot(mainLssPath);
  console.log("4c. findModularRoot:", root === outDir ? "PASS" : "FAIL");

  // Test adding a new procedure file and syncing manifest
  const newSubPath = path.join(outDir, "sub_helper.lss");
  fs.writeFileSync(
    newSubPath,
    `' @script-member-of: SampleAgent\nSub HelperProc()\n    Print "Helper"\nEnd Sub\n`,
    "utf-8"
  );
  const syncedManifest = AgentParser.syncManifest(outDir);
  const hasHelper = syncedManifest.compilationOrder.includes("sub_helper.lss");
  console.log("5. syncManifest includes newly added sub_helper.lss:", hasHelper ? "PASS" : "FAIL");
  if (!hasHelper) throw new Error("syncManifest failed to include new sub_helper.lss");

  // Test compile with overwriteSourceLss: true
  const compiledFile = AgentParser.compileAgent(outDir, { overwriteSourceLss: true });
  console.log("6. Compiled file:", compiledFile);
  if (!fs.existsSync(compiledFile)) {
    throw new Error("Compiled file does not exist");
  }

  const compiledContent = fs.readFileSync(compiledFile, "utf-8");
  if (!compiledContent.includes("HelperProc") || !compiledContent.includes("ProcessNotes")) {
    throw new Error("Compiled content missing procedures");
  }
  console.log("7. Compiled content verification: PASS");

  // Verify that original monolith source file was overwritten with fresh code
  const sourceOverwrittenContent = fs.readFileSync(monolithPath, "utf-8");
  const hasOverwrittenHelper = sourceOverwrittenContent.includes("HelperProc");
  console.log("7b. Overwrite original .lss source verification:", hasOverwrittenHelper ? "PASS" : "FAIL");
  if (!hasOverwrittenHelper) throw new Error("Original source file was not overwritten");

  // Test LSP check on the compiled file
  const lspRes = await checkLotusScriptDiagnostics(compiledFile);
  console.log("8. LSP Diagnostics result:", lspRes);
  if (!lspRes.ok) {
    throw new Error(`LSP diagnostics reported errors: ${lspRes.diagnostics}`);
  }

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log("=== All Modular Workflow Tests Passed! ===");
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
