/**
 * Recompiler — assembles modular files back into a single .lss artifact.
 * Extracted from agent-parser.ts so the module stays under the per-file limit.
 */

import fs from "node:fs";
import path from "node:path";
import { getTimestamp, sanitizeFileName } from "../../shared/paths.js";
import { syncManifest } from "./sync-manifest.js";
import {
  buildArtifactHeader,
  endSectionTag,
  sectionTag,
  stripArtifactScaffolding,
} from "./scaffolding.js";
import type { AgentManifest } from "../../shared/types.js";

/**
 * Recompile modular files into a single .lss file.
 * If overwriteSourceLss is enabled, updates the original .lss file.
 * If createLssForDxl is enabled, creates <AgentName>.lss alongside original .dxl.
 * If deleteModularDir is enabled, removes the modular folder after compilation.
 */
export function compileAgent(
  targetDirOrFile: string,
  options?: {
    keepTimestamp?: boolean;
    overwriteSourceLss?: boolean;
    createLssForDxl?: boolean;
    deleteModularDir?: boolean;
  }
): string {
  let agentDir = path.resolve(targetDirOrFile);
  if (fs.existsSync(agentDir) && fs.statSync(agentDir).isFile()) {
    agentDir = path.dirname(agentDir);
  }

  const manifestPath = path.join(agentDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in directory: ${agentDir}`);
  }

  const manifest = syncManifest(agentDir);
  const safeName = sanitizeFileName(manifest.agentName);
  const canonicalOutPath = path.join(agentDir, `${safeName}_compiled.lss`);

  const compiledContent = assembleCompiledContent(agentDir, manifest);

  const targetLssPath = resolveTargetLssPath(agentDir, manifest, safeName, options);

  if (targetLssPath) {
    fs.writeFileSync(targetLssPath, compiledContent, "utf-8");
  }

  if (options?.deleteModularDir) {
    fs.rmSync(agentDir, { recursive: true, force: true });
    return targetLssPath || canonicalOutPath;
  }

  fs.writeFileSync(canonicalOutPath, compiledContent, "utf-8");

  if (options?.keepTimestamp) {
    const timestamp = getTimestamp();
    const timestampedPath = path.join(agentDir, `${safeName}_${timestamp}_compiled.lss`);
    fs.writeFileSync(timestampedPath, compiledContent, "utf-8");
  }

  return canonicalOutPath;
}

/** Concatenates all modular files in compilation order into the artifact body. */
function assembleCompiledContent(agentDir: string, manifest: AgentManifest): string {
  const lines: string[] = buildArtifactHeader(manifest.agentName, new Date().toISOString());

  for (const fileName of manifest.compilationOrder) {
    const filePath = path.join(agentDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing component file: ${filePath}`);
    }

    // Self-healing: a modular file that already carries scaffolding (e.g. an
    // 01_declarations.lss polluted by an earlier compile → decompile cycle) must
    // not inject it into the artifact again.
    let content = stripArtifactScaffolding(fs.readFileSync(filePath, "utf-8")).trim();

    content = content.replace(/^'(?: @agent-member-of:| @script-member-of:| @event:| @procedure:| @parent-declarations:)[^\r\n]*\r?\n?/gm, "").trim();

    lines.push(sectionTag(fileName));
    lines.push(content);
    lines.push(`${endSectionTag(fileName)}\n`);
  }

  return lines.join("\n");
}

/** Resolves where the compiled artifact is written, per the option flags. */
function resolveTargetLssPath(
  agentDir: string,
  manifest: AgentManifest,
  safeName: string,
  options?: {
    keepTimestamp?: boolean;
    overwriteSourceLss?: boolean;
    createLssForDxl?: boolean;
    deleteModularDir?: boolean;
  }
): string | null {
  let targetLssPath: string | null = null;
  if (manifest.sourceDxl) {
    const resolvedSource = path.resolve(agentDir, manifest.sourceDxl);
    if (resolvedSource.toLowerCase().endsWith(".lss")) {
      if (options?.overwriteSourceLss || options?.deleteModularDir) {
        targetLssPath = resolvedSource;
      }
    } else if (resolvedSource.toLowerCase().endsWith(".dxl")) {
      if (options?.createLssForDxl || options?.deleteModularDir) {
        targetLssPath = resolvedSource.replace(/\.dxl$/i, ".lss");
      }
    }
  } else if (options?.deleteModularDir) {
    targetLssPath = path.join(path.dirname(agentDir), `${safeName}.lss`);
  }
  return targetLssPath;
}
