/**
 * Shared artifact emitters for the decompilers — modular module files,
 * manifest.json and the synthetic main.lss index. Extracted from
 * agent-parser.ts so each decompiler module stays under the per-file limit.
 */

import fs from "node:fs";
import path from "node:path";
import type { AgentManifest, CodeBlock } from "../../shared/types.js";

/** Writes one modular file; procedure files get their synthetic header block. */
export function writeModuleFile(
  targetDir: string,
  block: CodeBlock,
  headerLines: string[]
): void {
  const filePath = path.join(targetDir, block.fileName);
  let fileContent = "";
  if (block.kind === "procedure") {
    fileContent = [...headerLines, "", block.code, ""].join("\n");
  } else {
    fileContent = block.code + "\n";
  }
  fs.writeFileSync(filePath, fileContent, "utf-8");
}

/** Writes manifest.json with the resolved compilation order. */
export function writeManifest(targetDir: string, manifest: AgentManifest): void {
  fs.writeFileSync(
    path.join(targetDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );
}

/** Writes the synthetic '%pi-import' index consumed by the skill & guards. */
export function writeMainLss(
  targetDir: string,
  headerLines: string[],
  order: CodeBlock[]
): void {
  const mainLssLines = [...headerLines, `'`, `' Synthetic virtual imports for PI skill & developer navigation:`];
  for (const b of order) {
    mainLssLines.push(`' %pi-import "${b.fileName}"`);
  }
  mainLssLines.push("");
  fs.writeFileSync(path.join(targetDir, "main.lss"), mainLssLines.join("\n"), "utf-8");
}

/** Rewrites an existing main.lss from a manifest (used by syncManifest). */
export function rewriteMainLssFromManifest(agentDir: string, manifest: AgentManifest): void {
  const mainLssPath = path.join(agentDir, "main.lss");
  if (!fs.existsSync(mainLssPath)) return;
  const mainLines = [
    `' @agent-root: ${manifest.agentName}`,
    `' @source-dxl: ${manifest.sourceDxl || ""}`,
    `' @decompile-timestamp: ${manifest.decompileTimestamp || ""}`,
    `'`,
    `' Synthetic virtual imports for PI skill & developer navigation:`,
  ];
  for (const item of manifest.compilationOrder) {
    mainLines.push(`' %pi-import "${item}"`);
  }
  mainLines.push("");
  fs.writeFileSync(mainLssPath, mainLines.join("\n"), "utf-8");
}
