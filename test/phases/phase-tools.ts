/**
 * Phase: model tools (lotusscript_check / _scaffold / _gotchas) and the
 * whole-file scaffold artifacts.
 */

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG } from "../../src/shared/config.js";
import { stringsFor } from "../../src/shared/i18n.js";
import { registerModelTools } from "../../src/slices/tools/index.js";
import type { ToolsDeps } from "../../src/slices/tools/deps.js";
import { scaffoldLotusScriptArtifact } from "../../src/slices/scaffold/index.js";
import { getGotchasSummary, searchGotchas } from "../../src/slices/gotchas/index.js";
import { createTestState, ensureTestDir, mockPi, TEST_DIR, writeLss } from "../helpers.js";

function makeToolsDeps(diagnostics = ""): ToolsDeps {
  return {
    checkLotusScriptDiagnostics: async () => ({
      ok: diagnostics === "",
      diagnostics,
      errorCount: diagnostics === "" ? 0 : 1,
      warningCount: 0,
    }),
    explainLotusScriptCodes: async () => "HELP PAGE",
    searchGotchas,
    getGotchasSummary,
    addGotcha: (title: string, body: string) => ({ id: "new", title, body }),
    promptGotchaReview: async () => ({ action: "cancel" }),
    auditLibraries: () => ({ markdown: "AUDIT", duplicates: 0, files: 0 }),
    scaffoldLotusScriptArtifact,
    strings: stringsFor,
  };
}

export async function phaseTools(): Promise<void> {
  ensureTestDir();

  // 1. lotusscript_check is registered with a whole-file description.
  const checkHarness = mockPi([], "lotusscript_check");
  const state = createTestState();
  state.config = { ...DEFAULT_CONFIG };
  registerModelTools(checkHarness.pi, state, makeToolsDeps());
  const tool = checkHarness.tool;
  const okTool =
    !!tool &&
    /whole/i.test(tool.description) &&
    /no modular folder/i.test(tool.description) &&
    !!tool.parameters?.properties?.path;
  console.log("1. lotusscript_check registered as a whole-file check:", okTool ? "PASS" : "FAIL");
  if (!okTool) throw new Error(`Tool: ${JSON.stringify(tool?.description)}`);

  // 2. A clean check reports 0 errors and names the file.
  const file = writeLss("ToolAgent.lss");
  const clean = await tool.execute("t1", { path: file });
  const cleanText = clean.content[0].text as string;
  const okClean = cleanText.includes(file) && cleanText.includes("0 errors");
  console.log("2. clean file reports 0 errors:", okClean ? "PASS" : "FAIL");
  if (!okClean) throw new Error(cleanText);

  // 3. Errors are reported with the attached help page (SPAI-008 lane).
  const errHarness = mockPi([], "lotusscript_check");
  registerModelTools(errHarness.pi, state, makeToolsDeps("LS-0xd028 line 12: Not a member: NOPE"));
  const failed = await errHarness.tool.execute("t2", { path: file });
  const failedText = failed.content[0].text as string;
  const okFailed = failedText.includes("LS-0xd028") && failedText.includes("HELP PAGE");
  console.log("3. failing check returns diagnostics + help page:", okFailed ? "PASS" : "FAIL");
  if (!okFailed) throw new Error(failedText);

  // 3b. The diagnostic text is matched against the gotcha catalogue (SPAI-021).
  const matchHarness = mockPi([], "lotusscript_check");
  registerModelTools(
    matchHarness.pi,
    state,
    makeToolsDeps("ERROR x.lss:9:1 [LS-0xd019] Illegal parenthesized reference: hodnota"),
  );
  const matched = await matchHarness.tool.execute("t2b", { path: file });
  const matchedText = matched.content[0].text as string;
  const okMatch =
    matchedText.includes("GOTCHA MATCHES") &&
    matchedText.toLowerCase().includes("illegal parenthesized reference") &&
    matchedText.includes("lotusscript_gotchas");
  console.log("3b. a diagnostic surfaces the gotcha that describes it:", okMatch ? "PASS" : "FAIL");
  if (!okMatch) throw new Error(matchedText);

  // 4. The other two tools are still registered.
  for (const name of ["lotusscript_scaffold", "lotusscript_gotchas"]) {
    const h = mockPi([], name);
    registerModelTools(h.pi, state, makeToolsDeps());
    const ok = !!h.tool;
    console.log(`4. ${name} is registered:`, ok ? "PASS" : "FAIL");
    if (!ok) throw new Error(`${name} missing`);
  }
  const scaffoldHarness = mockPi([], "lotusscript_scaffold");
  registerModelTools(scaffoldHarness.pi, state, makeToolsDeps());
  const scaffoldParams = Object.keys(scaffoldHarness.tool.parameters.properties);
  const okParams = scaffoldParams.includes("type") && !scaffoldParams.includes("isFunction");
  console.log("5. scaffold tool no longer offers procedure parameters:", okParams ? "PASS" : "FAIL");
  if (!okParams) throw new Error(`Params: ${JSON.stringify(scaffoldParams)}`);

  // 6. Agent scaffold writes ONE whole .lss with the required sections.
  const agent = scaffoldLotusScriptArtifact({
    type: "agent",
    name: "ScaffoldAgent",
    targetDir: TEST_DIR,
    purpose: "testovací účel",
    author: "Tester",
    date: "2026-11-02",
  });
  const agentPath = agent.createdFiles[0]!;
  const agentBody = fs.readFileSync(agentPath, "utf-8");
  const okAgent =
    fs.existsSync(agentPath) &&
    agent.createdFiles.length === 1 &&
    agentBody.includes("Option Declare") &&
    agentBody.includes("On Error") &&
    agent.alias?.startsWith("ag_") &&
    (agent.noticeEn ?? "").includes("Ctrl+Shift+F9");
  console.log("6. agent scaffold is one whole .lss with header + handler:", okAgent ? "PASS" : "FAIL");
  if (!okAgent) throw new Error(`${agentPath}\n${agentBody.slice(0, 400)}`);

  // 7. Library scaffold adds the version constant and uses the lib_ prefix.
  const library = scaffoldLotusScriptArtifact({
    type: "library",
    name: "ScaffoldLib",
    targetDir: TEST_DIR,
    date: "2026-11-02",
  });
  const libBody = fs.readFileSync(library.createdFiles[0]!, "utf-8");
  const okLib =
    library.createdFiles.length === 1 &&
    libBody.includes("LIB_VERSION") &&
    library.alias?.startsWith("lib_");
  console.log("7. library scaffold adds LIB_VERSION and lib_ alias:", okLib ? "PASS" : "FAIL");
  if (!okLib) throw new Error(libBody.slice(0, 300));

  // 8. Scaffolds are byte-reproducible with a pinned date.
  const again = scaffoldLotusScriptArtifact({
    type: "library",
    name: "ScaffoldLib2",
    targetDir: path.join(TEST_DIR, "sub"),
    date: "2026-11-02",
  });
  const okDate = fs.readFileSync(again.createdFiles[0]!, "utf-8").includes("2026-11-02");
  console.log("8. pinned date appears in the scaffold header:", okDate ? "PASS" : "FAIL");
  if (!okDate) throw new Error("date was not pinned");

  // 9. An existing artifact is never overwritten.
  let rejected = false;
  try {
    scaffoldLotusScriptArtifact({ type: "agent", name: "ScaffoldAgent", targetDir: TEST_DIR });
  } catch {
    rejected = true;
  }
  console.log("9. scaffold refuses to overwrite an existing file:", rejected ? "PASS" : "FAIL");
  if (!rejected) throw new Error("scaffold allowed an overwrite");

  // 10. `target: "designer"` drops the LSI_THREAD block and inlines the indexes.
  const designer = scaffoldLotusScriptArtifact({
    type: "agent",
    name: "DesignerAgent",
    targetDir: TEST_DIR,
    date: "2026-11-02",
    target: "designer",
  });
  const designerBody = fs.readFileSync(designer.createdFiles[0]!, "utf-8");
  const okDesigner =
    !designerBody.includes("LSI_THREAD") &&
    !designerBody.includes("%Include") &&
    designerBody.includes("GetThreadInfo(1)") &&
    designerBody.includes("GetThreadInfo(10)") &&
    designerBody.includes("Option Declare") &&
    agentBody.includes("Const LSI_THREAD_PROC") === true;
  console.log("10. designer target omits LSI_THREAD_* and keeps the file polymorphic:", okDesigner ? "PASS" : "FAIL");
  if (!okDesigner) throw new Error(designerBody.slice(0, 900));

  // 11. Gotcha registry still answers searches and summaries.
  const hits = searchGotchas("shell", 3);
  const summary = getGotchasSummary(5);
  const okGotchas = hits.length > 0 && summary.length > 20;
  console.log("11. gotcha search + summary work:", okGotchas ? "PASS" : "FAIL");
  if (!okGotchas) throw new Error("gotcha registry unresponsive");
}
