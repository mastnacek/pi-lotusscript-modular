/**
 * `/ls` subcommand handlers — compile / pack(clean) (build side).
 * Split out of commands/index.ts for the per-file line limit.
 *
 * Cross-slice capabilities (parser / lsp / linter / scorecard) arrive via
 * CommandsDeps — slices never import each other (VSA). User-facing text
 * resolves through the i18n string table (pi-plugin-dev §10).
 */

import path from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { LspCheckResult } from "../../shared/types.js";
import { findModularRoot } from "../../shared/paths.js";
import { stringsFor } from "../../shared/i18n.js";
import type { PluginState } from "../../shared/state.js";
import type { CommandsDeps } from "./deps.js";
import type { LsParts } from "./ls-config.js";

export async function lsCompile(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps): Promise<void> {
  const config = state.config;
  const s = stringsFor(config.lang);
  const target = parts[1] || ctx.cwd;

  // Whole-file workflow: a .lss/.lsa target is checked exactly as it is by the
  // 9.0.1 compiler oracle — no modular folder, no assembly.
  if (/\.(lss|lsa)$/i.test(target)) {
    const lspRes = await deps.checkLotusScriptDiagnostics(target);
    const lspLine = lspRes.ok
      ? s.compile.compiledClean(path.basename(target))
      : s.compile.compiledLspErrors(lspRes.diagnostics);
    ctx.ui.notify(lspLine, lspRes.ok ? "info" : "warning");
    return;
  }

  // Legacy: a modular folder on disk (pre-2026-11 layout) still compiles.
  const root = findModularRoot(target);
  if (!root) {
    ctx.ui.notify(s.compile.notModular(target), "error");
    return;
  }
  try {
    const compiled = deps.compileAgent(root, {
      keepTimestamp: config.keepTimestampInCompiledName,
      overwriteSourceLss: config.overwriteSourceLss,
      createLssForDxl: true,
    });
    let lspRes: LspCheckResult | null = null;
    let lspLine: string;
    if (config.enableLsp) {
      lspRes = await deps.checkLotusScriptDiagnostics(compiled);
      lspLine = lspRes.ok
        ? s.compile.compiledClean(path.basename(compiled))
        : s.compile.compiledLspErrors(lspRes.diagnostics);
    } else {
      lspLine = s.compile.compiled(compiled);
    }
    const out = [lspLine];
    if (config.enableScorecard) {
      const lintRes = deps.lintModularFolder(root, config.maxProcedureLines, config.enforceCzechComments);
      const sc = state.buildScorecard(root, { lint: lintRes, lsp: lspRes, artifact: "pending" });
      out.push("", deps.formatScorecard(sc, state.scoreHistory.get(root)?.at(-1)));
    }
    ctx.ui.notify(out.join("\n"), lspRes && !lspRes.ok ? "warning" : "info");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(s.compile.compileError(msg), "error");
  }
}

export async function lsPack(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps): Promise<void> {
  const config = state.config;
  const s = stringsFor(config.lang);
  const target = parts[1] || ctx.cwd;
  const root = findModularRoot(target);
  if (!root) {
    ctx.ui.notify(s.compile.notModular(target), "error");
    return;
  }
  try {
    const lintRes = deps.lintModularFolder(root, config.maxProcedureLines, config.enforceCzechComments);
    const finalLss = deps.compileAgent(root, {
      overwriteSourceLss: config.overwriteSourceLss,
      createLssForDxl: true,
      deleteModularDir: true,
    });
    let lspRes: LspCheckResult | null = null;
    let lspLine: string;
    if (config.enableLsp) {
      lspRes = await deps.checkLotusScriptDiagnostics(finalLss);
      lspLine = lspRes.ok
        ? s.compile.packedClean(path.basename(finalLss))
        : s.compile.packedLspErrors(lspRes.diagnostics);
    } else {
      lspLine = s.compile.packedDone(finalLss);
    }
    const out = [lspLine];
    if (config.enableScorecard) {
      const sc = state.buildScorecard(root, {
        lint: lintRes,
        lsp: lspRes,
        artifact: "written",
        manifestSynced: true,
      });
      out.push("", deps.formatScorecard(sc, state.scoreHistory.get(root)?.at(-1)));
    }
    ctx.ui.notify(out.join("\n"), lspRes && !lspRes.ok ? "warning" : "info");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(s.compile.packError(msg), "error");
  }
}
