/**
 * Resolves the effective LotusScript scaffold template.
 *
 * Same lazy global-install contract as gotchas.md: the bundled template.lss is
 * copied to ~/.pi/lotusscript/template.lss on first use, so user edits survive
 * package updates and the template is reachable from any working directory.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOTUSSCRIPT_GLOBAL_DIR } from "../../shared/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_TEMPLATE_PATH = path.join(__dirname, "template.lss");
const GLOBAL_TEMPLATE_PATH = path.join(LOTUSSCRIPT_GLOBAL_DIR, "template.lss");

/** Absolute path of the template to scaffold from, or null if none is available. */
export function getEffectiveTemplatePath(): string | null {
  if (fs.existsSync(GLOBAL_TEMPLATE_PATH)) {
    return GLOBAL_TEMPLATE_PATH;
  }
  try {
    if (!fs.existsSync(LOTUSSCRIPT_GLOBAL_DIR)) {
      fs.mkdirSync(LOTUSSCRIPT_GLOBAL_DIR, { recursive: true });
    }
    if (fs.existsSync(BUNDLED_TEMPLATE_PATH)) {
      fs.copyFileSync(BUNDLED_TEMPLATE_PATH, GLOBAL_TEMPLATE_PATH);
      return GLOBAL_TEMPLATE_PATH;
    }
  } catch (err: unknown) {
    console.error(`[LotusScript Modular] Failed to initialize global template: ${err}`);
  }
  return fs.existsSync(BUNDLED_TEMPLATE_PATH) ? BUNDLED_TEMPLATE_PATH : null;
}

/** Absolute path of the bundled template shipped inside the package. */
export function getBundledTemplatePath(): string {
  return BUNDLED_TEMPLATE_PATH;
}