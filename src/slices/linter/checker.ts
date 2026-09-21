import fs from "node:fs";
import path from "node:path";
import type { FolderLintResult, ProcedureLintItem } from "../../shared/types.js";

/**
 * Checks if a line is an internal tool directive or synthetic header.
 */
function isSyntheticDirective(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("' @script-member-of:") ||
    trimmed.startsWith("' @agent-member-of:") ||
    trimmed.startsWith("' @procedure:") ||
    trimmed.startsWith("' @event:") ||
    trimmed.startsWith("' @parent-declarations:") ||
    trimmed.startsWith("' %pi-import")
  );
}

/**
 * Checks if procedure content contains meaningful documentation comment.
 */
function checkProcedureDocComment(lines: string[]): { hasDocComment: boolean; notice?: string } {
  let foundComment = false;
  let commentChars = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (isSyntheticDirective(trimmed)) continue;

    if (trimmed.startsWith("'") || trimmed.startsWith("REM ") || trimmed.startsWith("%REM")) {
      const commentText = trimmed.replace(/^('+|REM\s+|%REM)/i, "").trim();
      if (commentText.length >= 6) {
        foundComment = true;
        commentChars += commentText.length;
      }
    } else if (
      /^\s*(?:(?:Public|Private)\s+)?(?:Sub|Function|Property)\b/i.test(trimmed)
    ) {
      // Reached procedure declaration line
      if (foundComment) break;
    }
  }

  if (!foundComment || commentChars < 8) {
    return {
      hasDocComment: false,
      notice: "Procedura postrádá stručný český komentář s popisem účelu (' Účel: ...)",
    };
  }

  return { hasDocComment: true };
}

/**
 * Extract clean procedure name from file name or declaration.
 */
function extractProcedureName(fileName: string, content: string): string {
  const match = /^\s*(?:(?:Public|Private)\s+)?(?:Sub|Function|Property\s+(?:Get|Set))\s+([A-Za-z_][A-Za-z0-9_]*)/im.exec(content);
  if (match && match[1]) {
    return match[1];
  }
  return fileName.replace(/\.lss$/i, "");
}

/**
 * Lints an individual procedure file for line limit and documentation.
 */
export function lintProcedureFile(
  filePath: string,
  maxLines = 300,
  checkComments = true
): ProcedureLintItem | null {
  if (!fs.existsSync(filePath)) return null;

  const fileName = path.basename(filePath);
  const isProc =
    fileName.startsWith("sub_") ||
    fileName.startsWith("func_") ||
    fileName === "99_initialize.lss" ||
    fileName === "99_terminate.lss";

  if (!isProc) return null;

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const lineCount = lines.length;
  const isExceeded = lineCount > maxLines;
  const procedureName = extractProcedureName(fileName, content);

  const docCheck = checkComments
    ? checkProcedureDocComment(lines)
    : { hasDocComment: true };

  return {
    fileName,
    procedureName,
    lineCount,
    maxLines,
    isExceeded,
    hasDocComment: docCheck.hasDocComment,
    commentNotice: docCheck.notice,
  };
}

/**
 * Lints all procedure files in a modular agent directory.
 */
export function lintModularFolder(
  folderPath: string,
  maxLines = 300,
  checkComments = true
): FolderLintResult {
  const folder = path.resolve(folderPath);
  if (!fs.existsSync(folder)) {
    return { ok: true, exceededProcedures: [], missingCommentProcedures: [], allItems: [] };
  }

  const files = fs.readdirSync(folder);
  const allItems: ProcedureLintItem[] = [];
  const exceededProcedures: ProcedureLintItem[] = [];
  const missingCommentProcedures: ProcedureLintItem[] = [];

  for (const file of files) {
    if (!file.endsWith(".lss") || file === "main.lss" || file.endsWith("_compiled.lss")) {
      continue;
    }

    const fullPath = path.join(folder, file);
    const item = lintProcedureFile(fullPath, maxLines, checkComments);
    if (!item) continue;

    allItems.push(item);

    if (item.isExceeded) {
      exceededProcedures.push(item);
    }

    if (!item.hasDocComment) {
      missingCommentProcedures.push(item);
    }
  }

  const ok = exceededProcedures.length === 0;

  return {
    ok,
    exceededProcedures,
    missingCommentProcedures,
    allItems,
  };
}
