/**
 * Phase: whole-file linter — procedures are found inside ONE .lss file to check
 * their Czech purpose comment. The procedure-LENGTH rule was removed with the
 * modular layout, so no size verdict may come back.
 */

import { findProcedures, lintLotusScriptFile } from "../../src/slices/linter/index.js";
import { ensureTestDir, SAMPLE_LSS, writeLss } from "../helpers.js";

export async function phaseLinter(): Promise<void> {
  ensureTestDir();

  // 1. Procedure discovery inside a single whole script.
  const procs = findProcedures(SAMPLE_LSS);
  const names = procs.map((p) => p.name);
  const okNames =
    names.length === 3 && names[0] === "Initialize" && names[1] === "ProcessNotes" && names[2] === "GetStatus";
  console.log("1. findProcedures finds every Sub/Function in the whole file:", okNames ? "PASS" : "FAIL");
  if (!okNames) throw new Error(`Unexpected procedures: ${JSON.stringify(procs)}`);

  // 2. Block extents are measured (used for coordinates and reports only).
  const initProc = procs[0]!;
  const okSpan = initProc.lineCount === 5 && initProc.startLine === 11;
  console.log("2. procedure block span is measured (start line + length):", okSpan ? "PASS" : "FAIL");
  if (!okSpan) throw new Error(`Bad span: ${JSON.stringify(initProc)}`);

  // 3. Lint a whole file: only the procedure without a purpose comment is flagged.
  const file = writeLss("LintAgent.lss");
  const lint = lintLotusScriptFile(file, true);
  const missing = lint.missingCommentProcedures.map((p) => p.procedureName);
  const okComments = missing.length === 1 && missing[0] === "ProcessNotes";
  console.log("3. only the procedure without ' Účel:' is reported:", okComments ? "PASS" : "FAIL");
  if (!okComments) throw new Error(`Unexpected missing comments: ${JSON.stringify(missing)}`);

  // 4. Comment checking can be disabled.
  const noComments = lintLotusScriptFile(file, false);
  const okNoComments = noComments.missingCommentProcedures.length === 0 && noComments.ok;
  console.log("4. comment check can be disabled:", okNoComments ? "PASS" : "FAIL");
  if (!okNoComments) throw new Error("comment check was not suppressed");

  // 5. A missing file is an empty, passing result (never a crash).
  const absent = lintLotusScriptFile(`${file}.nope.lss`, true);
  const okAbsent = absent.ok && absent.allItems.length === 0;
  console.log("5. missing file yields an empty passing result:", okAbsent ? "PASS" : "FAIL");
  if (!okAbsent) throw new Error("missing file did not degrade gracefully");

  // 6. NO length verdict anywhere: a huge procedure is not a lint finding.
  const huge = `Option Declare\n\n' Účel: velká procedura\nSub Huge\n${Array.from(
    { length: 400 },
    (_, i) => `    Dim v${i} As Integer`
  ).join("\n")}\nEnd Sub\n`;
  const hugeFile = writeLss("Huge.lss", huge);
  const hugeLint = lintLotusScriptFile(hugeFile, true);
  const keys = Object.keys(hugeLint);
  const okNoLength =
    hugeLint.ok &&
    hugeLint.missingCommentProcedures.length === 0 &&
    !keys.includes("exceededProcedures") &&
    !("isExceeded" in hugeLint.allItems[0]!) &&
    !("maxLines" in hugeLint.allItems[0]!);
  console.log("6. no procedure-length verdict survives (400-line sub is clean):", okNoLength ? "PASS" : "FAIL");
  if (!okNoLength) throw new Error(`Length rule leaked: ${JSON.stringify(hugeLint.allItems[0])}`);

  // 7. Comment placement matters: directly above the declaration, not in the body.
  const nested = `Option Declare\n\nSub Placed\n   ' Účel: comment inside the body\n   Dim x As Integer\nEnd Sub\n`;
  const nestedLint = lintLotusScriptFile(writeLss("Placed.lss", nested), true);
  const okPlacement = nestedLint.missingCommentProcedures.length === 1;
  console.log("7. a comment inside the body does not count as the purpose comment:", okPlacement ? "PASS" : "FAIL");
  if (!okPlacement) throw new Error("body comment was accepted");
}
