/**
 * Phases 13a/13b: scaffold slice (63–70) and naming conventions (71–75).
 */

import fs from "node:fs";
import path from "node:path";
import { AgentParser } from "../../src/slices/parser/index.js";
import { lintModularFolder } from "../../src/slices/linter/index.js";
import {
  scaffoldLotusScriptArtifact,
  suggestAlias,
  buildDesignerNotice,
} from "../../src/slices/scaffold/index.js";
import { completeLsArguments } from "../../src/slices/settings/index.js";
import { DEFAULT_CONFIG } from "../../src/shared/config.js";
import lotusscriptModularExtension from "../../index.js";
import { TEST_DIR, mockPi } from "../helpers.js";

/** Tests 63–70. Returns the scaffold output dir for the naming phase. */
export async function phase13a(): Promise<string> {
  const scaffoldOutDir = path.join(TEST_DIR, "ScaffoldOut");
  fs.mkdirSync(scaffoldOutDir, { recursive: true });

  const scaffoldAgent = scaffoldLotusScriptArtifact({
    type: "agent",
    name: "ScaffoldAgent",
    targetDir: scaffoldOutDir,
    purpose: "Testovací agent vygenerovaný kostrou.",
  });
  const agentContent = fs.readFileSync(scaffoldAgent.createdFiles[0]!, "utf-8");
  const agentOk =
    agentContent.includes("Option Public") &&
    agentContent.includes("Option Declare") &&
    agentContent.includes('%Include "lsconst.lss"') &&
    agentContent.includes("Účel:") &&
    agentContent.includes("On Error GoTo Catch");
  console.log("63. Scaffold agent generates compliant skeleton:", agentOk ? "PASS" : "FAIL");
  if (!agentOk) throw new Error(`Bad agent scaffold:\n${agentContent}`);

  const scaffoldProc = scaffoldLotusScriptArtifact({
    type: "procedure",
    name: "Helper",
    targetDir: scaffoldOutDir,
    parentAgent: "ScaffoldAgent",
    isFunction: true,
    returnType: "Long",
    params: "doc As NotesDocument",
    purpose: "Pomocná funkce pro test kostry.",
  });
  const procPath = scaffoldProc.createdFiles[0]!;
  const procContent = fs.readFileSync(procPath, "utf-8");
  const procOk =
    path.basename(procPath) === "func_Helper.lss" &&
    procContent.includes("@script-member-of: ScaffoldAgent") &&
    procContent.includes("@procedure: Helper") &&
    procContent.includes("@parent-declarations: 01_declarations.lss") &&
    procContent.includes("Function Helper(doc As NotesDocument) As Long") &&
    procContent.includes("' Účel: Pomocná funkce pro test kostry.");
  console.log("64. Scaffold procedure generates synthetic header func_Helper.lss:", procOk ? "PASS" : "FAIL");
  if (!procOk) throw new Error(`Bad procedure scaffold:\n${procContent}`);

  // Scaffolded procedure must pass the plugin linter (comment + size)
  const lintScaffold = lintModularFolder(scaffoldOutDir, 300, true);
  const lintScaffoldOk =
    lintScaffold.missingCommentProcedures.length === 0 &&
    lintScaffold.exceededProcedures.length === 0;
  console.log("65. Scaffolded procedure passes the plugin linter:", lintScaffoldOk ? "PASS" : "FAIL");
  if (!lintScaffoldOk) {
    throw new Error(`Scaffold failed linter: ${JSON.stringify(lintScaffold)}`);
  }

  const scaffoldModular = scaffoldLotusScriptArtifact({
    type: "modular",
    name: "ScaffoldModularAgent",
    targetDir: scaffoldOutDir,
    purpose: "Modulární agent z kostry.",
  });
  const modularFiles = scaffoldModular.createdFiles.map((f) => path.basename(f));
  const modularOk =
    ["manifest.json", "main.lss", "00_options.lss", "01_declarations.lss", "sub_Process.lss", "99_initialize.lss"]
      .every((f) => modularFiles.includes(f));
  console.log("66. Scaffold modular folder creates all 6 files:", modularOk ? "PASS" : "FAIL");
  if (!modularOk) throw new Error(`Bad modular scaffold: ${modularFiles.join(", ")}`);

  // Modular scaffold compiles through the AgentParser
  const scaffoldModularRoot = path.join(scaffoldOutDir, "ScaffoldModularAgent");
  const scaffoldCompiled = AgentParser.compileAgent(scaffoldModularRoot, { overwriteSourceLss: false });
  const scaffoldCompiledOk = fs.existsSync(scaffoldCompiled);
  console.log("67. Scaffolded modular folder compiles:", scaffoldCompiledOk ? "PASS" : "FAIL");
  if (!scaffoldCompiledOk) throw new Error("Scaffolded modular folder failed to compile");

  // Scaffold refuses to overwrite existing artifacts
  let overwriteRejected = false;
  try {
    scaffoldLotusScriptArtifact({ type: "agent", name: "ScaffoldAgent", targetDir: scaffoldOutDir });
  } catch {
    overwriteRejected = true;
  }
  console.log("68. Scaffold rejects overwriting existing artifact:", overwriteRejected ? "PASS" : "FAIL");
  if (!overwriteRejected) throw new Error("Scaffold allowed overwrite");

  // Completions expose scaffold subcommand with 4 types
  const scaffoldCompletions = completeLsArguments("scaffold ", DEFAULT_CONFIG);
  const scaffoldCompOk =
    !!scaffoldCompletions &&
    ["agent", "library", "procedure", "modular"].every((t) =>
      scaffoldCompletions.some((c) => c.label === t && c.value === `scaffold ${t} `)
    );
  console.log("69. /ls scaffold completions expose 4 types with trailing space:", scaffoldCompOk ? "PASS" : "FAIL");
  if (!scaffoldCompOk) throw new Error(`Bad scaffold completions: ${JSON.stringify(scaffoldCompletions)}`);

  // lotusscript_scaffold tool is registered
  const scaffoldToolRegistry = mockPi([], "lotusscript_scaffold");
  lotusscriptModularExtension(scaffoldToolRegistry.pi);
  const registeredScaffoldTool = scaffoldToolRegistry.tool;
  const scaffoldToolOk = !!registeredScaffoldTool;
  console.log("70. lotusscript_scaffold tool is registered:", scaffoldToolOk ? "PASS" : "FAIL");
  if (!scaffoldToolOk) throw new Error("lotusscript_scaffold tool was not registered");

  return scaffoldOutDir;
}

/** Tests 71–75. */
export async function phase13b(scaffoldOutDir: string): Promise<void> {
  // 71. Alias derivation: diacritics stripped, camelCase split, type prefix
  const aliasCz = suggestAlias("Aktualizace pracovníků okruhů (save)", "agent");
  const aliasLib = suggestAlias("VebaApiLib", "library");
  const aliasOk =
    /^ag_[a-z0-9_]+$/.test(aliasCz) &&
    aliasCz.startsWith("ag_") &&
    aliasCz.includes("save") &&
    !/[áčďéěíňóřšťúůýž]/.test(aliasCz) &&
    aliasCz.length <= 40 &&
    aliasLib.startsWith("lib_");
  console.log(`71. suggestAlias derives ASCII lowercase aliases (${aliasCz}, ${aliasLib}):`, aliasOk ? "PASS" : "FAIL");
  if (!aliasOk) throw new Error(`Bad alias derivation: "${aliasCz}" / "${aliasLib}"`);

  // 72. Designer notice (EN, agent-facing): contains alias, steps, description line
  const noticeEn = buildDesignerNotice(
    { elementType: "Agent (standalone .lss)", name: "TestAgent", alias: "ag_test_agent", purpose: "Testovací agent pro notice." },
    "en"
  );
  const noticeEnOk =
    noticeEn.includes("DESIGNER REGISTRATION") &&
    noticeEn.includes("Alias:    ag_test_agent") &&
    noticeEn.includes("Ctrl+Shift+F9") &&
    noticeEn.includes('@Command([ToolsRunMacro]; "ag_test_agent")') &&
    noticeEn.includes("Comment");
  console.log("72. Designer notice EN contains alias, steps, invocation, description:", noticeEnOk ? "PASS" : "FAIL");
  if (!noticeEnOk) throw new Error(`Bad EN notice:\n${noticeEn}`);

  // 73. Designer notice (CS, user-facing): Czech labels, same alias
  const noticeCs = buildDesignerNotice(
    { elementType: "Agent (standalone .lss)", name: "TestAgent", alias: "ag_test_agent", purpose: "Testovací agent pro notice." },
    "cs"
  );
  const noticeCsOk =
    noticeCs.includes("REGISTRACE DO DESIGNERU") &&
    noticeCs.includes("Alias:    ag_test_agent") &&
    noticeCs.includes("Účel:") &&
    noticeCs.includes("Ctrl+Shift+F9");
  console.log("73. Designer notice CS is user-facing Czech:", noticeCsOk ? "PASS" : "FAIL");
  if (!noticeCsOk) throw new Error(`Bad CS notice:\n${noticeCs}`);

  // 74. Scaffold result carries alias + both notices
  const noticeScaffold = scaffoldLotusScriptArtifact({
    type: "agent",
    name: "NoticeTestAgent",
    targetDir: scaffoldOutDir,
    purpose: "Agent pro test notifikace.",
  });
  const noticeScaffoldOk =
    typeof noticeScaffold.alias === "string" &&
    noticeScaffold.alias.startsWith("ag_") &&
    !!noticeScaffold.noticeCs &&
    !!noticeScaffold.noticeEn &&
    noticeScaffold.noticeEn!.includes("DESIGNER REGISTRATION");
  console.log("74. Scaffold result carries alias and Designer notices:", noticeScaffoldOk ? "PASS" : "FAIL");
  if (!noticeScaffoldOk) throw new Error(`Bad scaffold notice result: ${JSON.stringify(noticeScaffold)}`);

  // 75. Completions include scaffold parent row + naming reference exists
  const namingRef = path.resolve(process.cwd(), "skills/lotusscript-modular/references/naming-conventions.md");
  const namingOk = fs.existsSync(namingRef);
  console.log("75. references/naming-conventions.md exists:", namingOk ? "PASS" : "FAIL");
  if (!namingOk) throw new Error("naming-conventions.md missing");
}
