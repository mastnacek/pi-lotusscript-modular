/**
 * `/ls` subcommand handler — audit (which agents should be a script library).
 * Split out of commands/index.ts for the per-file line limit.
 *
 * The analysis lives in the audit slice; this handler only resolves the target
 * folder and prints the pre-rendered markdown that arrives via CommandsDeps
 * (slice isolation, VSA).
 */

import path from "node:path";
import fs from "node:fs";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { PluginState } from "../../shared/state.js";
import type { CommandsDeps } from "./deps.js";
import type { LsParts } from "./ls-config.js";

/** `/ls audit [dir]` — duplicate-procedure report for one mirror folder. */
export async function lsAudit(
  state: PluginState,
  parts: LsParts,
  ctx: ExtensionCommandContext,
  deps: CommandsDeps
): Promise<void> {
  const target = path.resolve(ctx.cwd, parts[1] || "01_scripts");

  if (!fs.existsSync(target)) {
    ctx.ui.notify(
      state.config.lang === "en"
        ? `📚 Folder not found: ${target}`
        : `📚 Adresář nenalezen: ${target}`,
      "warning"
    );
    return;
  }

  const result = deps.auditLibraries(target, state.config.lang);
  ctx.ui.notify(result.markdown, result.duplicates > 0 ? "warning" : "info");
  state.renderStatusline("clean");
}
