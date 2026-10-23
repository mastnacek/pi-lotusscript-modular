/**
 * Whole-file procedure linter.
 *
 * A LotusScript module is ONE `.lss` file holding every `Sub`/`Function`. The
 * linter locates those blocks only to check that each one carries a Czech
 * purpose comment (`' Účel: ...`) above its declaration — no size rule: the
 * 300-line convention belonged to the per-procedure file layout, and the
 * compiler reports a genuinely oversized procedure itself.
 */

import fs from "node:fs";
import type { FileLintResult, ProcedureLintItem } from "../../shared/types.js";

/** A procedure declaration (`Sub`/`Function`/`Property Get|Set`), at any indent. */
const PROC_DECL =
  /^\s*(?:(?:Public|Private)\s+)?(?:Sub|Function|Property\s+(?:Get|Set))\s+([A-Za-z_][A-Za-z0-9_]*)/i;

/** A block terminator that closes a procedure. */
const PROC_END = /^\s*End\s+(?:Sub|Function|Property)\b/i;

/** Comment prefixes that carry a real documented purpose. */
function commentTextOf(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.startsWith("'")) return trimmed.replace(/^'+/, "").trim();
  if (/^REM\b/i.test(trimmed)) return trimmed.replace(/^REM\s*/i, "").trim();
  if (/^%REM\b/i.test(trimmed)) return trimmed.replace(/^%REM\s*/i, "").trim();
  return null;
}

/**
 * Documentation check for one procedure block: a comment of at least 8 comment
 * characters must sit directly above the declaration (blank lines allowed).
 */
function checkProcedureDocComment(blockStart: number, lines: string[]): { hasDocComment: boolean; notice?: string } {
  let commentChars = 0;
  for (let i = blockStart - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    const text = commentTextOf(line);
    if (text === null) break;
    commentChars += text.length;
  }

  if (commentChars < 8) {
    return {
      hasDocComment: false,
      notice: "Procedura postrádá stručný český komentář s popisem účelu (' Účel: ...)",
    };
  }
  return { hasDocComment: true };
}

/**
 * Splits a whole LotusScript source into procedure blocks.
 * Exposed for tests: `[{ name, startLine, lineCount }]` with 1-based startLine.
 */
export function findProcedures(content: string): Array<{ name: string; startLine: number; lineCount: number }> {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const found: Array<{ name: string; startLine: number; lineCount: number }> = [];

  let i = 0;
  while (i < lines.length) {
    const decl = PROC_DECL.exec(lines[i] ?? "");
    if (!decl) {
      i++;
      continue;
    }

    const name = decl[1] ?? "Unknown";
    const startIndex = i;
    let endIndex = i;
    // Scan to the matching End Sub/Function/Property. Nested declarations inside
    // a block (rare, e.g. a Type inside a Sub) must not open a second block, so
    // the scan only accepts the terminator that closes this declaration.
    let j = i + 1;
    while (j < lines.length) {
      if (PROC_END.test(lines[j] ?? "")) {
        endIndex = j;
        break;
      }
      j++;
    }
    if (j >= lines.length) endIndex = lines.length - 1;

    found.push({
      name,
      startLine: startIndex + 1,
      lineCount: endIndex - startIndex + 1,
    });
    i = endIndex + 1;
  }

  return found;
}

/**
 * Lints one whole `.lss` file: the purpose comment of every procedure inside it.
 * Returns an empty result when the file is missing or holds no procedure.
 */
export function lintLotusScriptFile(
  filePath: string,
  checkComments = true
): FileLintResult {
  const empty: FileLintResult = {
    ok: true,
    missingCommentProcedures: [],
    allItems: [],
  };
  if (!fs.existsSync(filePath)) return empty;

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const allItems: ProcedureLintItem[] = [];

  for (const proc of findProcedures(content)) {
    const docCheck = checkComments
      ? checkProcedureDocComment(proc.startLine - 1, lines)
      : { hasDocComment: true };

    allItems.push({
      filePath,
      procedureName: proc.name,
      startLine: proc.startLine,
      lineCount: proc.lineCount,
      hasDocComment: docCheck.hasDocComment,
      commentNotice: (docCheck as { notice?: string }).notice,
    });
  }

  const missingCommentProcedures = allItems.filter((item) => !item.hasDocComment);
  return {
    ok: missingCommentProcedures.length === 0,
    missingCommentProcedures,
    allItems,
  };
}
