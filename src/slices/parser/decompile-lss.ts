/**
 * .lss decompiler — splits a bare LotusScript source file into a modular
 * folder (00_options, 01_declarations, sub_/func_ procedures, 99_initialize).
 * Extracted from agent-parser.ts so the module stays under the per-file limit.
 */

import fs from "node:fs";
import path from "node:path";
import type { CodeBlock } from "../../shared/types.js";
import { detectProcPrefix, sanitizeFileName } from "../../shared/paths.js";
import { writeMainLss, writeManifest, writeModuleFile } from "./emitters.js";

/**
 * Decompile a bare LotusScript source file (.lss) into a modular folder structure.
 */
export function decompileLss(lssPath: string, outputDirOverride?: string): string {
  const resolvedLss = path.resolve(lssPath);
  if (!fs.existsSync(resolvedLss)) {
    throw new Error(`LSS file not found: ${resolvedLss}`);
  }

  const content = fs.readFileSync(resolvedLss, "utf-8");
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const scriptName = path.basename(resolvedLss, ".lss");

  const lssDir = path.dirname(resolvedLss);
  const targetDir = outputDirOverride ? path.resolve(outputDirOverride) : path.join(lssDir, scriptName);

  const reProcStart = /^\s*(?:(?:Public|Private)\s+)?(?:Sub|Function|Property\s+(?:Get|Set))\s+([A-Za-z_][A-Za-z0-9_]*)/i;
  const reProcEnd = /^\s*End\s+(?:Sub|Function|Property)\b/i;
  const reBlockStart = /^\s*(?:(?:Public|Private)\s+)?(?:Class|Type)\s+[A-Za-z_]/i;
  const reBlockEnd = /^\s*End\s+(?:Class|Type)\b/i;
  const reOption = /^\s*(?:Option\s|Use\s|UseLSX\s|%Include\s)/i;

  const optionsLines: string[] = [];
  const declLines: string[] = [];
  const procs: { name: string; lines: string[]; kind: CodeBlock["kind"]; fileName: string }[] = [];

  let currentProc: { name: string; lines: string[]; kind: CodeBlock["kind"]; fileName: string } | null = null;
  let inRemBlock = false;
  let pendingDocLines: string[] = [];
  let insideClassOrType = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (/^\s*%REM\b/i.test(trimmed)) {
      inRemBlock = true;
      pendingDocLines.push(line);
      continue;
    }
    if (inRemBlock) {
      pendingDocLines.push(line);
      if (/^\s*%END\s*REM\b/i.test(trimmed)) {
        inRemBlock = false;
      }
      continue;
    }

    if (currentProc) {
      currentProc.lines.push(line);
      if (reProcEnd.test(trimmed)) {
        procs.push(currentProc);
        currentProc = null;
      }
      continue;
    }

    if (insideClassOrType) {
      declLines.push(...pendingDocLines, line);
      pendingDocLines = [];
      if (reBlockEnd.test(trimmed)) {
        insideClassOrType = false;
      }
      continue;
    }

    if (reBlockStart.test(trimmed)) {
      insideClassOrType = true;
      declLines.push(...pendingDocLines, line);
      pendingDocLines = [];
      continue;
    }

    const procMatch = reProcStart.exec(trimmed);
    if (procMatch) {
      const pName = procMatch[1]!;
      let kind: CodeBlock["kind"] = "procedure";
      let fileName = "";

      if (pName.toLowerCase() === "initialize") {
        kind = "initialize";
        fileName = "99_initialize.lss";
      } else if (pName.toLowerCase() === "terminate") {
        kind = "terminate";
        fileName = "99_terminate.lss";
      } else {
        const prefix = detectProcPrefix(trimmed);
        const safeName = sanitizeFileName(pName);
        fileName = `${prefix}${safeName}.lss`;
      }

      currentProc = {
        name: pName,
        lines: [...pendingDocLines, line],
        kind,
        fileName,
      };
      pendingDocLines = [];
      continue;
    }

    if (reOption.test(trimmed)) {
      optionsLines.push(...pendingDocLines, line);
      pendingDocLines = [];
      continue;
    }

    declLines.push(...pendingDocLines, line);
    pendingDocLines = [];
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const order: CodeBlock[] = [];

  const optContent = optionsLines.join("\n").trim();
  if (optContent) {
    order.push({
      event: "(Options)",
      code: optContent,
      kind: "options",
      fileName: "00_options.lss",
    });
  }

  const declContent = declLines.join("\n").trim();
  if (declContent) {
    order.push({
      event: "(Declarations)",
      code: declContent,
      kind: "declarations",
      fileName: "01_declarations.lss",
    });
  }

  const customProcs = procs.filter((p) => p.kind === "procedure");
  const inits = procs.filter((p) => p.kind === "initialize");
  const terms = procs.filter((p) => p.kind === "terminate");

  for (const p of customProcs) {
    order.push({
      event: p.name,
      code: p.lines.join("\n").trim(),
      kind: p.kind,
      fileName: p.fileName,
    });
  }

  for (const p of inits) {
    order.push({
      event: "Initialize",
      code: p.lines.join("\n").trim(),
      kind: p.kind,
      fileName: p.fileName,
    });
  }

  for (const p of terms) {
    order.push({
      event: "Terminate",
      code: p.lines.join("\n").trim(),
      kind: p.kind,
      fileName: p.fileName,
    });
  }

  emitLssArtifacts(targetDir, resolvedLss, scriptName, order);

  return targetDir;
}

/** Writes module files + manifest + main.lss for a decompiled .lss source. */
function emitLssArtifacts(
  targetDir: string,
  resolvedLss: string,
  scriptName: string,
  order: CodeBlock[]
): void {
  const relativeSource = path.relative(targetDir, resolvedLss).replace(/\\/g, "/");
  const timestampIso = new Date().toISOString();

  for (const b of order) {
    writeModuleFile(targetDir, b, [
      `' @script-member-of: ${scriptName}`,
      `' @procedure: ${b.event}`,
      `' @parent-declarations: 01_declarations.lss`,
    ]);
  }

  writeManifest(targetDir, {
    formatVersion: "1.0",
    agentName: scriptName,
    sourceDxl: relativeSource,
    decompileTimestamp: timestampIso,
    compilationOrder: order.map((o) => o.fileName),
  });

  writeMainLss(
    targetDir,
    [
      `' @script-root: ${scriptName}`,
      `' @source-file: ${relativeSource}`,
      `' @decompile-timestamp: ${timestampIso}`,
    ],
    order
  );
}
