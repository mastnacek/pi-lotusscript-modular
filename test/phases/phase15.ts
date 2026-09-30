/**
 * Phase 15: repeated-event module names (tests 80–84).
 *
 * Regression guard for the lost-button bug. A DXL form carries one
 * `<code event='click'>` block per button, and a form flattened into a single
 * .lss carries one `Sub Click` body per button. Both decompilers derived the
 * module name from the event/procedure name alone, so the second block
 * overwrote the first and the manifest listed the same file twice — reading
 * `Forms/Nahled.dxl` silently dropped the distribution button.
 *
 * Fixtures mirror the real case: the Nahled form in
 * `nsfodp-export/databaze/data__nakupovaci_dokumentace`.
 */

import fs from "node:fs";
import path from "node:path";
import { AgentParser } from "../../src/slices/parser/index.js";
import { makeUniqueFileNames } from "../../src/shared/paths.js";
import { TEST_DIR } from "../helpers.js";

/** DXL form with two `click` buttons plus declarations — the Nahled shape. */
const TWO_BUTTON_FORM_DXL = `<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE form SYSTEM 'xmlschemas/domino_9_0_1.dtd'>
<form name='Nahled' alias='NL' xmlns='http://www.lotus.com/dxl' version='9.0'>
<code event='declarations'><lotusscript>Dim db As NotesDatabase
Dim max As Integer
</lotusscript></code>
<code event='querysave'><lotusscript>Sub Querysave(Source As Notesuidocument, Continue As Variant)
End Sub
</lotusscript></code>
<code event='click'><lotusscript>Sub Click(Source As Button)
Print "distribuce"
Call Send_mail
End Sub
</lotusscript></code>
<code event='click'><lotusscript>Sub Click(Source As Button)
Print "oznaceno precteno"
End Sub
</lotusscript></code>
</form>
`;

/** Single-button form: the folder must stay byte-identical to the old naming. */
const ONE_BUTTON_FORM_DXL = `<?xml version='1.0' encoding='utf-8'?>
<form name='Solo' xmlns='http://www.lotus.com/dxl' version='9.0'>
<code event='declarations'><lotusscript>Dim g_x As Long
</lotusscript></code>
<code event='click'><lotusscript>Sub Click(Source As Button)
Print "jedno tlacitko"
End Sub
</lotusscript></code>
</form>
`;

/** Form where two buttons share a name in different casing. */
const MIXED_CASE_DXL = `<?xml version='1.0' encoding='utf-8'?>
<form name='CaseForm' xmlns='http://www.lotus.com/dxl' version='9.0'>
<code event='Click'><lotusscript>Sub Click(Source As Button)
Print "prvni"
End Sub
</lotusscript></code>
<code event='click'><lotusscript>Sub Click(Source As Button)
Print "druhe"
End Sub
</lotusscript></code>
</form>
`;

/** Form flattened into one .lss — two `Sub Click` bodies. */
const TWO_CLICK_LSS = `Option Declare

Dim g_recp(20) As String

Sub Click(Source As Button)
    Print "distribuce"
End Sub

Sub Click(Source As Button)
    Print "oznaceno precteno"
End Sub
`;

/** Writes a DXL fixture and returns its path. */
function writeDxl(name: string, xml: string): string {
  const dir = path.join(TEST_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${name}.dxl`);
  fs.writeFileSync(p, xml, "utf-8");
  return p;
}

export async function phase15(): Promise<void> {
  // 80. Pure helper: first occurrence keeps the name, later ones get _2 / _3
  const unique = makeUniqueFileNames([
    "sub_click.lss",
    "99_initialize.lss",
    "sub_click.lss",
    "sub_click.lss",
  ]);
  const helperOk =
    unique[0] === "sub_click.lss" &&
    unique[1] === "99_initialize.lss" &&
    unique[2] === "sub_click_2.lss" &&
    unique[3] === "sub_click_3.lss";
  console.log("80. makeUniqueFileNames suffixes repeats, keeps first:", helperOk ? "PASS" : "FAIL");
  if (!helperOk) throw new Error(`Bad unique names: ${unique.join(", ")}`);

  // 80b. Pure helper is case-insensitive and idempotent across cycles
  const caseOk =
    makeUniqueFileNames(["sub_Click.lss", "sub_click.lss"])[1] === "sub_click_2.lss" &&
    JSON.stringify(makeUniqueFileNames(unique)) === JSON.stringify(unique);
  console.log("80b. Case-insensitive and stable when re-run:", caseOk ? "PASS" : "FAIL");
  if (!caseOk) throw new Error("makeUniqueFileNames is not case-insensitive / not stable");

  // 81. Two-button DXL: both Click bodies survive as separate modules
  const dxlPath = writeDxl("Nahled", TWO_BUTTON_FORM_DXL);
  const modDir = AgentParser.decompileDxl(dxlPath)!;
  const manifest = JSON.parse(fs.readFileSync(path.join(modDir, "manifest.json"), "utf-8")) as {
    compilationOrder: string[];
  };
  const order = manifest.compilationOrder;
  const orderOk =
    order.length === 4 &&
    new Set(order).size === order.length &&
    order.includes("sub_click.lss") &&
    order.includes("sub_click_2.lss");
  console.log(`81. Two-button DXL keeps both Click modules (${order.join(", ")}):`, orderOk ? "PASS" : "FAIL");
  if (!orderOk) throw new Error(`Lost a Click block: ${order.join(", ")}`);

  // 82. Each module holds the code of its own button
  const first = fs.readFileSync(path.join(modDir, "sub_click.lss"), "utf-8");
  const second = fs.readFileSync(path.join(modDir, "sub_click_2.lss"), "utf-8");
  const bodiesOk =
    first.includes("distribuce") && !first.includes("oznaceno precteno") &&
    second.includes("oznaceno precteno") && !second.includes("distribuce") &&
    first.includes("@event: click") && second.includes("@event: click");
  console.log("82. Each Click module keeps its own body and @event header:", bodiesOk ? "PASS" : "FAIL");
  if (!bodiesOk) {
    throw new Error(`Module bodies mixed up:\n--- sub_click.lss ---\n${first}\n--- sub_click_2.lss ---\n${second}`);
  }

  // 83. Single-button DXL keeps the original plain name (backwards compatible)
  const soloDir = AgentParser.decompileDxl(writeDxl("Solo", ONE_BUTTON_FORM_DXL))!;
  const soloManifest = JSON.parse(fs.readFileSync(path.join(soloDir, "manifest.json"), "utf-8")) as {
    compilationOrder: string[];
  };
  const soloOk =
    soloManifest.compilationOrder.includes("sub_click.lss") &&
    !soloManifest.compilationOrder.some((f) => /_2\.lss$/.test(f));
  console.log("83. Single-button DXL naming is unchanged:", soloOk ? "PASS" : "FAIL");
  if (!soloOk) throw new Error(`Unexpected rename: ${soloManifest.compilationOrder.join(", ")}`);

  // 83b. Click / click in one form must not collide either
  const caseDir = AgentParser.decompileDxl(writeDxl("CaseForm", MIXED_CASE_DXL))!;
  const caseManifest = JSON.parse(fs.readFileSync(path.join(caseDir, "manifest.json"), "utf-8")) as {
    compilationOrder: string[];
  };
  const caseDxlOk =
    new Set(caseManifest.compilationOrder).size === caseManifest.compilationOrder.length &&
    caseManifest.compilationOrder.length === 2;
  console.log("83b. `Click` and `click` in one form do not collide:", caseDxlOk ? "PASS" : "FAIL");
  if (!caseDxlOk) throw new Error(`Case collision: ${caseManifest.compilationOrder.join(", ")}`);

  // 84. Flattened .lss with two Sub Click bodies keeps both
  const lssDir = path.join(TEST_DIR, "NahledLss");
  fs.mkdirSync(lssDir, { recursive: true });
  const lssPath = path.join(lssDir, "NahledLss.lss");
  fs.writeFileSync(lssPath, TWO_CLICK_LSS, "utf-8");

  const lssModDir = AgentParser.decompileLss(lssPath);
  const lssManifest = JSON.parse(fs.readFileSync(path.join(lssModDir, "manifest.json"), "utf-8")) as {
    compilationOrder: string[];
  };
  const lssOrder = lssManifest.compilationOrder;
  const lssOk =
    lssOrder.includes("sub_Click.lss") &&
    lssOrder.includes("sub_Click_2.lss") &&
    fs.existsSync(path.join(lssModDir, "sub_Click.lss")) &&
    fs.existsSync(path.join(lssModDir, "sub_Click_2.lss")) &&
    fs.readFileSync(path.join(lssModDir, "sub_Click.lss"), "utf-8").includes("distribuce") &&
    fs.readFileSync(path.join(lssModDir, "sub_Click_2.lss"), "utf-8").includes("oznaceno precteno");
  console.log(`84. Flattened .lss keeps both Sub Click bodies (${lssOrder.join(", ")}):`, lssOk ? "PASS" : "FAIL");
  if (!lssOk) throw new Error(`Lost a Sub Click body: ${lssOrder.join(", ")}`);

  // 84b. Compile → decompile round trip stays stable (no _2, _3, _2 suffixes)
  AgentParser.compileAgent(lssModDir, { overwriteSourceLss: true, createLssForDxl: true });
  AgentParser.decompileLss(lssPath);
  const again = JSON.parse(fs.readFileSync(path.join(lssModDir, "manifest.json"), "utf-8")) as {
    compilationOrder: string[];
  };
  const stableOk =
    JSON.stringify(again.compilationOrder) === JSON.stringify(lssOrder) &&
    fs.readFileSync(path.join(lssModDir, "sub_Click_2.lss"), "utf-8").includes("oznaceno precteno");
  console.log("84b. compile→decompile round trip keeps the same module names:", stableOk ? "PASS" : "FAIL");
  if (!stableOk) {
    throw new Error(`Round trip drifted: ${lssOrder.join(", ")} → ${again.compilationOrder.join(", ")}`);
  }
}
