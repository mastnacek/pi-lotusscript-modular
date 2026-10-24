/**
 * `/ls` subcommand handler — check (whole-file verification).
 * Split out of commands/index.ts for the per-file line limit.
 *
 * Cross-slice capabilities (lsp / scorecard) arrive via CommandsDeps —
 * slices never import each other (VSA). User-facing text resolves through the
 * i18n string table (pi-plugin-dev §10).
 *
 * Output policy: the score lives in the HUD and the status badge, the compiler
 * diagnostics belong to `lotusscript_check` (which returns them in full). The
 * toast therefore states the verdict and how to get the detail — a wall of
 * diagnostics in a transient toast is unreadable and vanishes.
 */

import path from "node:path";
import fs from "node:fs";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { LspCheckResult } from "../../shared/types.js";
import { stringsFor } from "../../shared/i18n.js";
import type { PluginState } from "../../shared/state.js";
import type { CommandsDeps } from "./deps.js";
import type { LsParts } from "./ls-config.js";

/** `/ls check <soubor.lss>` — compile the whole file exactly as it is. */
export async function lsCheck(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps): Promise<void> {
  const config = state.config;
  const s = stringsFor(config.lang);
  const target = parts[1] ? path.resolve(ctx.cwd, parts[1]) : "";

  if (!target || !fs.existsSync(target)) {
    ctx.ui.notify(s.check.usage(parts[1] || ""), "warning");
    return;
  }

  let lspRes: LspCheckResult | null = null;
  if (config.enableLsp) {
    lspRes = await deps.checkLotusScriptDiagnostics(target);
  }

  // Grade regardless of the LSP toggle: the scorecard knows when the LSP item
  // is not measured and marks it pending instead of failed.
  let scoreText = "";
  if (config.enableScorecard) {
    const sc = state.buildScorecard(target, { lsp: lspRes });
    state.recordScorecard(target, sc);
    scoreText = s.settled.score(sc.score, sc.max);
  }

  const name = path.basename(target);

  if (!config.enableLsp) {
    ctx.ui.notify(`${s.check.lspDisabled}${scoreText}`, "warning");
    state.renderStatusline("clean");
    return;
  }

  if (lspRes?.ok) {
    ctx.ui.notify(s.check.compactClean(name, scoreText), "info");
    state.renderStatusline("clean");
    return;
  }

  ctx.ui.notify(
    [s.check.compactErrors(name, lspRes?.errorCount ?? 1), s.check.toolHint(target)].join("\n"),
    "warning"
  );
  state.renderStatusline("error");
}
