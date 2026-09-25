/**
 * Phase 14: artifact-scaffolding round-trip idempotency (tests 76–79).
 *
 * Regression guard for the accumulation bug: `compileAgent` writes a provenance
 * header + `' === SECTION: x ===` markers into the artifact, and the same file is
 * also the `sourceDxl` that `decompileLss` reads back. Without stripping those
 * generated markers, every compile → decompile cycle nested one more header +
 * section block into `01_declarations.lss` and the artifact grew without bound.
 */

import fs from "node:fs";
import path from "node:path";
import { AgentParser } from "../../src/slices/parser/index.js";
import {
  ASSEMBLED_HEADER_MARKER,
  buildArtifactHeader,
  sectionTag,
  endSectionTag,
  stripArtifactScaffolding,
} from "../../src/slices/parser/scaffolding.js";
import { TEST_DIR } from "../helpers.js";

const count = (text: string, needle: RegExp): number => (text.match(needle) || []).length;

/** Monolith whose options/declarations/procedures all must survive the round trip. */
const ROUND_TRIP_SOURCE = `Option Public
Option Declare
Use "VebaApiLib"

Dim g_counter As Long

Sub Initialize
    Call Bump()
End Sub

Sub Bump()
    g_counter = g_counter + 1
End Sub

Function Label() As String
    Label = "n=" & CStr(g_counter)
End Function
`;

/** Runs one decompile → compile cycle over `lssPath` and returns the declarations file. */
function runCycle(lssPath: string): string {
  const modDir = AgentParser.decompileLss(lssPath);
  AgentParser.compileAgent(modDir, { overwriteSourceLss: true, createLssForDxl: true });
  return path.join(modDir, "01_declarations.lss");
}

export async function phase14(): Promise<void> {
  // 76. stripArtifactScaffolding removes generated markers, keeps user content
  const polluted = [
    ...buildArtifactHeader("DemoAgent", "2026-01-01T00:00:00.000Z"),
    sectionTag("01_declarations.lss"),
    "%REM",
    "    Uživatelská dokumentace deklarací.",
    "%END REM",
    "Dim g_x As Integer",
    endSectionTag("01_declarations.lss"),
  ].join("\n");
  const stripped = stripArtifactScaffolding(polluted);
  const stripOk =
    !stripped.includes(ASSEMBLED_HEADER_MARKER) &&
    !stripped.includes("=== SECTION") &&
    stripped.includes("Uživatelská dokumentace deklarací.") &&
    stripped.includes("Dim g_x As Integer");
  console.log("76. stripArtifactScaffolding drops generated markers, keeps user code:", stripOk ? "PASS" : "FAIL");
  if (!stripOk) throw new Error(`Bad strip result:\n${stripped}`);

  // 77. Three compile → decompile cycles keep 01_declarations.lss free of markers
  const dir = path.join(TEST_DIR, "RoundTripAgent");
  fs.mkdirSync(dir, { recursive: true });
  const lssPath = path.join(dir, "RoundTripAgent.lss");
  fs.writeFileSync(lssPath, ROUND_TRIP_SOURCE, "utf-8");

  const declPath = runCycle(lssPath);
  const declCycle1 = fs.readFileSync(declPath, "utf-8");
  const declLines1 = declCycle1.split("\n").length;

  runCycle(lssPath);
  runCycle(lssPath);
  const declCycle3 = fs.readFileSync(declPath, "utf-8");

  const declClean =
    count(declCycle3, /=== SECTION/g) === 0 &&
    count(declCycle3, /Assembled from modular source files/g) === 0;
  const declStable = declCycle3.split("\n").length === declLines1;
  console.log(
    `77. 3× compile→decompile keeps 01_declarations.lss clean (tags=${count(declCycle3, /=== SECTION/g)}, ${declLines1}→${declCycle3.split("\n").length} lines):`,
    declClean && declStable ? "PASS" : "FAIL"
  );
  if (!declClean || !declStable) {
    throw new Error(`Declarations file accumulated scaffolding:\n${declCycle3.slice(0, 400)}`);
  }

  // 78. Artifact size stabilizes and holds exactly one marker pair per modular file
  const artifact1 = fs.readFileSync(lssPath, "utf-8");
  runCycle(lssPath);
  const artifact2 = fs.readFileSync(lssPath, "utf-8");
  const normalize = (t: string) => t.replace(/Compiled: [0-9T:.Z-]+/g, "Compiled: X");
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "RoundTripAgent", "manifest.json"), "utf-8")) as {
    compilationOrder: string[];
  };
  const expectedTags = manifest.compilationOrder.length;
  const artifactOk =
    normalize(artifact1) === normalize(artifact2) &&
    count(artifact2, /=== SECTION:/g) === expectedTags &&
    count(artifact2, /=== END SECTION:/g) === expectedTags &&
    count(artifact2, /Assembled from modular source files/g) === 1;
  console.log(
    `78. Artifact is cycle-stable with one section pair per file (${count(artifact2, /=== SECTION:/g)}/${expectedTags}):`,
    artifactOk ? "PASS" : "FAIL"
  );
  if (!artifactOk) {
    throw new Error(
      `Artifact not stable: sections=${count(artifact2, /=== SECTION:/g)} ends=${count(artifact2, /=== END SECTION:/g)} expected=${expectedTags}`
    );
  }

  // 79. Self-healing: a polluted 01_declarations.lss is cleaned on the next compile
  fs.writeFileSync(
    declPath,
    [...buildArtifactHeader("RoundTripAgent", "2026-01-01T00:00:00.000Z"), sectionTag("01_declarations.lss"), declCycle1, endSectionTag("01_declarations.lss")].join("\n"),
    "utf-8"
  );
  AgentParser.compileAgent(path.join(dir, "RoundTripAgent"), { overwriteSourceLss: true, createLssForDxl: true });
  const healed = fs.readFileSync(lssPath, "utf-8");
  const healedOk =
    count(healed, /Assembled from modular source files/g) === 1 &&
    healed.includes("Sub Bump()") &&
    healed.includes("Function Label() As String");
  console.log("79. Polluted declarations file is self-healed by the next compile:", healedOk ? "PASS" : "FAIL");
  if (!healedOk) throw new Error(`Self-healing failed:\n${healed.slice(0, 400)}`);
}
