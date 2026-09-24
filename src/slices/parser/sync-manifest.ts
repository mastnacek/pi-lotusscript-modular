/**
 * manifest.json synchronization — keeps compilationOrder and main.lss in sync
 * with the modular files on disk. Extracted from agent-parser.ts so the module
 * stays under the per-file limit.
 */

import fs from "node:fs";
import path from "node:path";
import type { AgentManifest } from "../../shared/types.js";
import { rewriteMainLssFromManifest } from "./emitters.js";

/**
 * Synchronize manifest.json and main.lss with any files added or removed on disk.
 */
export function syncManifest(targetDirOrFile: string): AgentManifest {
  let agentDir = path.resolve(targetDirOrFile);
  if (fs.existsSync(agentDir) && fs.statSync(agentDir).isFile()) {
    agentDir = path.dirname(agentDir);
  }

  const manifestPath = path.join(agentDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in directory: ${agentDir}`);
  }

  let manifest: AgentManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as AgentManifest;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse manifest.json at ${manifestPath}: ${msg}`);
  }
  const files = fs.readdirSync(agentDir);

  const lssFiles = files.filter(
    (f) =>
      f.endsWith(".lss") &&
      f !== "main.lss" &&
      !f.endsWith("_compiled.lss") &&
      !/_compiled\.lss$/i.test(f)
  );

  const updatedOrder: string[] = [];
  for (const f of manifest.compilationOrder) {
    if (lssFiles.includes(f) && !updatedOrder.includes(f)) {
      updatedOrder.push(f);
    }
  }

  const newFiles = lssFiles.filter((f) => !updatedOrder.includes(f));

  for (const f of newFiles) {
    if (f === "00_options.lss") {
      updatedOrder.unshift(f);
    } else if (f === "01_declarations.lss") {
      const optIdx = updatedOrder.indexOf("00_options.lss");
      if (optIdx !== -1) {
        updatedOrder.splice(optIdx + 1, 0, f);
      } else {
        updatedOrder.unshift(f);
      }
    } else if (f === "99_initialize.lss") {
      const termIdx = updatedOrder.indexOf("99_terminate.lss");
      if (termIdx !== -1) {
        updatedOrder.splice(termIdx, 0, f);
      } else {
        updatedOrder.push(f);
      }
    } else if (f === "99_terminate.lss") {
      updatedOrder.push(f);
    } else {
      insertBeforeInitOrTerm(updatedOrder, f);
    }
  }

  manifest.compilationOrder = updatedOrder;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  rewriteMainLssFromManifest(agentDir, manifest);

  return manifest;
}

/** Places a new procedure file before 99_initialize / 99_terminate, else last. */
function insertBeforeInitOrTerm(updatedOrder: string[], f: string): void {
  const initIdx = updatedOrder.indexOf("99_initialize.lss");
  if (initIdx !== -1) {
    updatedOrder.splice(initIdx, 0, f);
    return;
  }
  const termIdx = updatedOrder.indexOf("99_terminate.lss");
  if (termIdx !== -1) {
    updatedOrder.splice(termIdx, 0, f);
    return;
  }
  updatedOrder.push(f);
}
