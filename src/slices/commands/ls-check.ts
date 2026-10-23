/**
 * `/ls` subcommand handler — check (whole-file verification).
 * Split out of commands/index.ts for the per-file line limit.
 *
 * Cross-slice capabilities (lsp / linter / scorecard) arrive via CommandsDeps —
 * slices never import each other (VSA). User-facing text resolves through the
 * i18n string table (pi-plugin-dev §10).
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

  const out: string[] = [];
  if (!config.enableLsp) {
    out.push(s.check.lspDisabled);
  } else if (lspRes && lspRes.ok) {
    out.push(s.check.clean(path.basename(target)));
  } else if (lspRes) {
    out.push(s.check.errors(lspRes.diagnostics));
  }

  if (config.enableScorecard) {
    const sc = state.buildScorecard(target, { lsp: lspRes });
    const previous = state.recordScorecard(target, sc);
    out.push("", deps.formatScorecard(sc, previous));
  }

  state.renderStatusline(lspRes && !lspRes.ok ? "error" : "clean");
  ctx.ui.notify(out.join("\n"), lspRes && !lspRes.ok ? "warning" : "info");
}
