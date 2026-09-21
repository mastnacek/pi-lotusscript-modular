import type { CommentAnalysis, CommentStyle } from "../../shared/types.js";

/**
 * Deterministically checks if a line is an internal tool directive or synthetic header.
 */
export function isSyntheticDirective(line: string): boolean {
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
 * Scans LotusScript source code and extracts comments, distinguishing between
 * string literals ("...", |...|, {...}) and actual remark tokens (' or REM or %REM).
 *
 * Classifies comment style into:
 * - 'new': Contains clean Czech purpose comment (' Účel: ...) and PI agent directives, no legacy template.
 * - 'old': Contains legacy Domino template (%REM, Author/Date, dividers, English remarks) without ' Účel:.
 * - 'mixed': Contains both Czech purpose comment and legacy Domino templates or unstandardized dividers.
 * - 'none': No comments found other than synthetic directives.
 */
export function scanLotusScriptComments(source: string): CommentAnalysis {
  const lines = source.split(/\r?\n/);
  let inBarString = false;
  let inBraceString = false;
  let inPctRem = false;

  const comments: string[] = [];
  const syntheticDirectives: string[] = [];
  let purposeText: string | undefined = undefined;
  const legacyMarkers: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Check %REM multi-line block
    if (inPctRem) {
      comments.push(line);
      if (/^%END\s*REM\b/i.test(trimmed)) {
        inPctRem = false;
      } else {
        if (/\b(?:Author|Date|Description|Parameters|Return Value|Revision|Modified|Created)\s*:/i.test(line)) {
          legacyMarkers.push(line.trim());
        }
        const ucelMatch = /(?:Účel|Ucel)\s*:\s*(.+)$/i.exec(line);
        if (ucelMatch && !purposeText) {
          purposeText = ucelMatch[1]!.trim();
        }
      }
      continue;
    }

    if (/^%REM\b/i.test(trimmed)) {
      inPctRem = true;
      comments.push(line);
      continue;
    }

    // Check synthetic directives
    if (isSyntheticDirective(trimmed)) {
      syntheticDirectives.push(trimmed);
      continue;
    }

    // Character scanner for single-line comments vs string literals
    let inQuote = false;
    let commentStartIdx = -1;

    for (let c = 0; c < line.length; c++) {
      const ch = line[c]!;
      const next = line[c + 1];

      if (inBarString) {
        if (ch === "|" && next === "|") {
          c++;
          continue;
        }
        if (ch === "|") inBarString = false;
        continue;
      }
      if (inBraceString) {
        if (ch === "}" && next === "}") {
          c++;
          continue;
        }
        if (ch === "}") inBraceString = false;
        continue;
      }
      if (inQuote) {
        if (ch === '"' && next === '"') {
          c++;
          continue;
        }
        if (ch === '"') inQuote = false;
        continue;
      }

      // Outside strings: check string openings
      if (ch === '"') {
        inQuote = true;
        continue;
      }
      if (ch === "|") {
        inBarString = true;
        continue;
      }
      if (ch === "{") {
        inBraceString = true;
        continue;
      }

      // Single quote comment
      if (ch === "'") {
        commentStartIdx = c;
        break;
      }

      // REM keyword (must follow whitespace, colon, or line start)
      if ((ch === "R" || ch === "r") && (c === 0 || /\s|:/.test(line[c - 1]!))) {
        const remMatch = /^REM\b/i.exec(line.slice(c));
        if (remMatch) {
          commentStartIdx = c;
          break;
        }
      }
    }

    if (commentStartIdx !== -1) {
      const commentPart = line.slice(commentStartIdx);
      comments.push(commentPart);

      // Check purpose comment: ' Účel: ... or REM Účel: ...
      const ucelMatch = /(?:'|REM\s+)\s*(?:Účel|Ucel)\s*:\s*(.+)$/i.exec(commentPart);
      if (ucelMatch && !purposeText) {
        purposeText = ucelMatch[1]!.trim();
      }

      // Check legacy markers and formatting
      if (
        /[\*=\-_]{5,}/.test(commentPart) ||
        /\b(?:Author|Date|Description|Parameters|Return Value|Revision)\s*:/i.test(commentPart) ||
        /\+\+LotusScript Development Environment/i.test(commentPart)
      ) {
        legacyMarkers.push(commentPart.trim());
      }
    }
  }

  const hasCzechPurpose = typeof purposeText === "string" && purposeText.length >= 4;
  const hasLegacyBlock = legacyMarkers.length > 0;
  let style: CommentStyle = "none";

  if (hasCzechPurpose && !hasLegacyBlock) {
    style = "new";
  } else if (hasCzechPurpose && hasLegacyBlock) {
    style = "mixed";
  } else if (hasLegacyBlock || comments.length > 0) {
    style = "old";
  }

  return {
    style,
    hasCzechPurpose,
    purposeText,
    hasSyntheticHeader: syntheticDirectives.length > 0,
    hasLegacyBlock,
    legacyMarkers,
    totalLines: lines.length,
    commentLines: comments.length,
    comments,
  };
}

/**
 * Extracts procedure signature and bounded code snippet for JEV prompt input.
 */
export function extractProcedureSnippet(
  source: string,
  maxLines = 40
): { name: string; kind: string; signature: string; codeSnippet: string } {
  const lines = source.split(/\r?\n/);
  let name = "unknown";
  let kind = "procedure";
  let signature = "";
  const codeLines: string[] = [];

  const sigRegex = /^\s*(?:(?:Public|Private)\s+)?(Sub|Function|Property\s+(?:Get|Set))\s+([A-Za-z_][A-Za-z0-9_]*)(.*)$/i;

  for (const line of lines) {
    if (isSyntheticDirective(line)) continue;
    const match = sigRegex.exec(line);
    if (match && !signature) {
      kind = match[1]!.trim();
      name = match[2]!;
      signature = line.trim();
    }
    codeLines.push(line);
  }

  const codeSnippet = codeLines.slice(0, maxLines).join("\n");
  return { name, kind, signature, codeSnippet };
}
