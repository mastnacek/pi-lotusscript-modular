/**
 * `/ls` subcommand handler — audit (which agents should be a script library).
 * Split out of commands/index.ts for the per-file line limit.
 *
 * The analysis lives in the audit slice; this handler only resolves the target
 * folder and prints the pre-rendered markdown that arrives via CommandsDeps
 * (slice isolation, VSA).
 *
 * Output policy: a notify() toast is a glance, not a report. The table is
 * reachable through `lotusscript_library_audit`, so the toast carries the
 * headline and a pointer instead of a table that wraps and disappears.
 */

import path from "node:path";
import fs from "node:fs";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { stringsFor } from "../../shared/i18n.js";
import type { PluginState } from "../../shared/state.js";
import type { CommandsDeps } from "./deps.js";
import type { LsParts } from "./ls-config.js";

/** `/ls audit [dir]` — duplicate-procedure summary for one mirror folder. */
export async function lsAudit(
  state: PluginState,
  parts: LsParts,
  ctx: ExtensionCommandContext,
  deps: CommandsDeps
): Promise<void> {
  const s = stringsFor(state.config.lang).auditCmd;
  const target = path.resolve(ctx.cwd, parts[1] || "01_scripts");

  if (!fs.existsSync(target)) {
    ctx.ui.notify(s.notFound(target), "warning");
    return;
  }

  const result = deps.auditLibraries(target, state.config.lang);
  if (result.duplicates === 0) {
    ctx.ui.notify(s.none(result.files), "info");
    return;
  }

  ctx.ui.notify(
    [s.summary(result.duplicates, result.savedLines), s.toolHint(target)].join("\n"),
    "warning"
  );
  state.setRunState("clean");
}
