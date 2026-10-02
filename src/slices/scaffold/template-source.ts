/**
 * Location of the LotusScript scaffold template.
 *
 * The template ships INSIDE the package, so `pi update` delivers template
 * improvements together with the code that reads them — the file is versioned
 * with the plugin and can never drift from it.
 *
 * Edit it in the development repo (src/slices/scaffold/template.lss) and push.
 * Never edit it in the installed checkout: that is a git working tree which
 * `pi update` reconciles, so a local edit there is either clobbered or breaks
 * the next pull.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLED_TEMPLATE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "template.lss",
);

/** Absolute path of the template shipped with the installed plugin. */
export function getBundledTemplatePath(): string {
  return BUNDLED_TEMPLATE_PATH;
}