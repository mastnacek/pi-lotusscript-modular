/**
 * Phase 5: ephemeral modularization & cleanup on settled (.lss overwrite,
 * .dxl → new .lss, agent_settled lifecycle deletion).
 */

import fs from "node:fs";
import path from "node:path";
import { AgentParser } from "../../src/slices/parser/index.js";
import lotusscriptModularExtension from "../../index.js";
import { MONOLITH_CODE, TEST_DIR, mockPi } from "../helpers.js";

export async function phase5(): Promise<void> {
  // 20. compileAgent with deleteModularDir for .lss
  const ephemeralLssPath = path.join(TEST_DIR, "EphemeralScript.lss");
  fs.writeFileSync(ephemeralLssPath, MONOLITH_CODE, "utf-8");
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
  const dxlPath = path.join(TEST_DIR, "SampleDxlAgent.dxl");
  fs.writeFileSync(dxlPath, sampleDxl, "utf-8");
  const dxlOutDir = AgentParser.decompileDxl(dxlPath);
  if (!dxlOutDir || !fs.existsSync(dxlOutDir)) throw new Error("Failed to decompile SampleDxlAgent");

  const expectedNewLss = path.join(TEST_DIR, "SampleDxlAgent.lss");
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
  const { pi: lifecycleMockPi, handlers } = mockPi(["agent_settled", "tool_call", "tool_result"]);
  lotusscriptModularExtension(lifecycleMockPi);

  const agentSettledHandler = handlers["agent_settled"];
  const extToolCallHandler = handlers["tool_call"];
  const extToolResultHandler = handlers["tool_result"];

  if (!agentSettledHandler || !extToolCallHandler || !extToolResultHandler) {
    throw new Error("Lifecycle handlers failed to register");
  }

  const liveLss = path.join(TEST_DIR, "LiveAgent.lss");
  fs.writeFileSync(liveLss, MONOLITH_CODE, "utf-8");

  // Simulate reading file -> decompiles
  const readEvt: any = { toolName: "read", input: { path: liveLss } };
  extToolCallHandler(readEvt);
  const liveModularDir = path.join(TEST_DIR, "LiveAgent");
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
  await agentSettledHandler({}, { hasUI: false, cwd: TEST_DIR });

  const liveFolderDeleted = !fs.existsSync(liveModularDir);
  const liveLssUpdated = fs.existsSync(liveLss) && fs.readFileSync(liveLss, "utf-8").includes("ProcessNotes");
  console.log("22. agent_settled automatically cleans up modified modular folders:", (liveFolderDeleted && liveLssUpdated) ? "PASS" : "FAIL");
  if (!liveFolderDeleted || !liveLssUpdated) {
    throw new Error("agent_settled hook failed to clean up modular directory");
  }
}
