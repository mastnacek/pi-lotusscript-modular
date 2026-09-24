/**
 * DXL decompiler — splits a Domino Agent DXL XML file into a modular folder.
 * Extracted from agent-parser.ts so the module stays under the per-file limit.
 */

import fs from "node:fs";
import path from "node:path";
import type { CodeBlock } from "../../shared/types.js";
import { decodeXml, detectProcPrefix, sanitizeFileName } from "../../shared/paths.js";
import { writeMainLss, writeManifest, writeModuleFile } from "./emitters.js";

/**
 * Decompile a Domino Agent DXL XML file into a modular folder structure.
 */
export function decompileDxl(dxlPath: string, outputDirOverride?: string): string | null {
  const resolvedDxl = path.resolve(dxlPath);
  if (!fs.existsSync(resolvedDxl)) {
    throw new Error(`DXL file not found: ${resolvedDxl}`);
  }

  const xml = fs.readFileSync(resolvedDxl, "utf-8");
  const nameMatch = /<agent\b[^>]*\bname=['"]([^'"]+)['"]/i.exec(xml);
  const rawAgentName = nameMatch ? decodeXml(nameMatch[1]!) : path.basename(resolvedDxl, ".dxl");

  const dxlDir = path.dirname(resolvedDxl);
  const targetDir = outputDirOverride
    ? path.resolve(outputDirOverride)
    : path.join(dxlDir, sanitizeFileName(rawAgentName));

  const blocks = parseDxlBlocks(xml);
  if (blocks.length === 0) return null;

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const options = blocks.filter((b) => b.kind === "options");
  const decls = blocks.filter((b) => b.kind === "declarations");
  const procs = blocks.filter((b) => b.kind === "procedure");
  const inits = blocks.filter((b) => b.kind === "initialize");
  const terms = blocks.filter((b) => b.kind === "terminate");

  const order: CodeBlock[] = [...options, ...decls, ...procs, ...inits, ...terms];

  const relativeDxl = path.relative(targetDir, resolvedDxl).replace(/\\/g, "/");
  const timestampIso = new Date().toISOString();

  for (const b of order) {
    writeModuleFile(targetDir, b, [
      `' @agent-member-of: ${rawAgentName}`,
      `' @event: ${b.event}`,
      `' @parent-declarations: 01_declarations.lss`,
    ]);
  }

  writeManifest(targetDir, {
    formatVersion: "1.0",
    agentName: rawAgentName,
    sourceDxl: relativeDxl,
    decompileTimestamp: timestampIso,
    compilationOrder: order.map((b) => b.fileName),
  });

  writeMainLss(
    targetDir,
    [
      `' @agent-root: ${rawAgentName}`,
      `' @source-dxl: ${relativeDxl}`,
      `' @decompile-timestamp: ${timestampIso}`,
    ],
    order
  );

  return targetDir;
}

/** Extracts and classifies <code event="..."> blocks from the DXL XML. */
function parseDxlBlocks(xml: string): CodeBlock[] {
  const codeBlockRegex = /<code\s+event=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/code>/gi;
  let match: RegExpExecArray | null;

  const blocks: CodeBlock[] = [];

  while ((match = codeBlockRegex.exec(xml)) !== null) {
    const event = match[1]!;
    const innerContent = match[2]!;

    const lotussctiptMatch = /<lotusscript>([\s\S]*?)<\/lotusscript>/i.exec(innerContent);
    if (!lotussctiptMatch) continue;

    const code = decodeXml(lotussctiptMatch[1]!).replace(/\r\n/g, "\n").trim();
    if (!code) continue;

    let kind: CodeBlock["kind"] = "procedure";
    let fileName = "";

    const lowerEvent = event.toLowerCase();
    if (lowerEvent === "options") {
      kind = "options";
      fileName = "00_options.lss";
    } else if (lowerEvent === "declarations") {
      kind = "declarations";
      fileName = "01_declarations.lss";
    } else if (lowerEvent === "initialize" || lowerEvent === "action") {
      kind = "initialize";
      fileName = "99_initialize.lss";
    } else if (lowerEvent === "terminate") {
      kind = "terminate";
      fileName = "99_terminate.lss";
    } else {
      kind = "procedure";
      const prefix = detectProcPrefix(code);
      const safeEvent = sanitizeFileName(event);
      fileName = `${prefix}${safeEvent}.lss`;
    }

    blocks.push({ event, code, kind, fileName });
  }

  return blocks;
}
