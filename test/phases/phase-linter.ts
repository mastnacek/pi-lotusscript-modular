/**
 * Phase: whole-file linter — procedures are found inside ONE .lss file,
 * measured against maxProcedureLines and checked for a Czech purpose comment.
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

  // 2. Line counts come from the real block extents.
  const initProc = procs[0]!;
  const okSpan = initProc.lineCount === 5 && initProc.startLine === 11;
  console.log("2. procedure block span is measured (start line + length):", okSpan ? "PASS" : "FAIL");
  if (!okSpan) throw new Error(`Bad span: ${JSON.stringify(initProc)}`);

  // 3. Lint a whole file: `ProcessNotes` has no purpose comment, the others do.
  const file = writeLss("LintAgent.lss");
  const lint = lintLotusScriptFile(file, 300, true);
  const missing = lint.missingCommentProcedures.map((p) => p.procedureName);
  const okComments = missing.length === 1 && missing[0] === "ProcessNotes";
  console.log("3. only the procedure without ' Účel:' is reported:", okComments ? "PASS" : "FAIL");
  if (!okComments) throw new Error(`Unexpected missing comments: ${JSON.stringify(missing)}`);

  // 4. Everything else passes the 300-line limit.
  const okLimits = lint.ok && lint.exceededProcedures.length === 0 && lint.allItems.length === 3;
  console.log("4. no procedure exceeds the limit in the sample:", okLimits ? "PASS" : "FAIL");
  if (!okLimits) throw new Error(`Unexpected limit result: ${JSON.stringify(lint.exceededProcedures)}`);

  // 5. A tiny limit flags exactly the oversized blocks, with their own line.
  // Initialize (5 lines) and ProcessNotes (4) exceed a 3-line limit; GetStatus is
  // exactly 3 lines, so it must not be flagged.
  const tight = lintLotusScriptFile(file, 3, false);
  const tightNames = tight.exceededProcedures.map((p) => p.procedureName);
  const okTight =
    tight.exceededProcedures.length === 2 &&
    tightNames.includes("Initialize") &&
    tightNames.includes("ProcessNotes") &&
    !tightNames.includes("GetStatus") &&
    !tight.ok;
  console.log("5. a tight limit flags oversized procedures only:", okTight ? "PASS" : "FAIL");
  if (!okTight) throw new Error(`Unexpected tight lint: ${JSON.stringify(tight.exceededProcedures)}`);

  // 6. Comment checking can be disabled (no missing-comment items).
  const noComments = lintLotusScriptFile(file, 300, false);
  const okNoComments = noComments.missingCommentProcedures.length === 0;
  console.log("6. enforceCzechComments:false suppresses comment findings:", okNoComments ? "PASS" : "FAIL");
  if (!okNoComments) throw new Error("comment check was not suppressed");

  // 7. A missing file is an empty, passing result (never a crash).
  const absent = lintLotusScriptFile(`${file}.nope.lss`, 300, true);
  const okAbsent = absent.ok && absent.allItems.length === 0;
  console.log("7. missing file yields an empty passing result:", okAbsent ? "PASS" : "FAIL");
  if (!okAbsent) throw new Error("missing file did not degrade gracefully");
}
