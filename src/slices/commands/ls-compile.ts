/**
 * `/ls` subcommand handlers — compile / pack(clean) / decompile (build side).
 * Split out of commands/index.ts for the per-file line limit.
 */

import path from "node:path";
import fs from "node:fs";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { LspCheckResult } from "../../shared/types.js";
import { findModularRoot } from "../../shared/paths.js";
import { AgentParser } from "../parser/index.js";
import { checkLotusScriptDiagnostics } from "../lsp/index.js";
import { lintModularFolder } from "../linter/index.js";
import { formatScorecard } from "../scorecard/index.js";
import type { PluginState } from "../../shared/state.js";
import type { LsParts } from "./ls-config.js";

export async function lsCompile(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext): Promise<void> {
  const config = state.config;
  const target = parts[1] || ctx.cwd;
  const root = findModularRoot(target);
  if (!root) {
    ctx.ui.notify(`Není modulární složka LotusScriptu: ${target}`, "error");
    return;
  }
  try {
    const compiled = AgentParser.compileAgent(root, {
      keepTimestamp: config.keepTimestampInCompiledName,
      overwriteSourceLss: config.overwriteSourceLss,
      createLssForDxl: true,
    });
    let lspRes: LspCheckResult | null = null;
    let lspLine: string;
    if (config.enableLsp) {
      lspRes = await checkLotusScriptDiagnostics(compiled);
      lspLine = lspRes.ok
        ? `Sestaveno ${path.basename(compiled)} (LSP čisté)`
        : `Sestaveno s LSP chybami:\n${lspRes.diagnostics}`;
    } else {
      lspLine = `Sestaveno: ${compiled}`;
    }
    const out = [lspLine];
    if (config.enableScorecard) {
      const lintRes = lintModularFolder(root, config.maxProcedureLines, config.enforceCzechComments);
      const sc = state.buildScorecard(root, { lint: lintRes, lsp: lspRes, artifact: "pending" });
      out.push("", formatScorecard(sc, state.scoreHistory.get(root)?.at(-1)));
    }
    ctx.ui.notify(out.join("\n"), lspRes && !lspRes.ok ? "warning" : "info");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Chyba kompilace: ${msg}`, "error");
  }
}

export async function lsPack(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext): Promise<void> {
  const config = state.config;
  const target = parts[1] || ctx.cwd;
  const root = findModularRoot(target);
  if (!root) {
    ctx.ui.notify(`Není modulární složka LotusScriptu: ${target}`, "error");
    return;
  }
  try {
    const lintRes = lintModularFolder(root, config.maxProcedureLines, config.enforceCzechComments);
    const finalLss = AgentParser.compileAgent(root, {
      overwriteSourceLss: config.overwriteSourceLss,
      createLssForDxl: true,
      deleteModularDir: true,
    });
    let lspRes: LspCheckResult | null = null;
    let lspLine: string;
    if (config.enableLsp) {
      lspRes = await checkLotusScriptDiagnostics(finalLss);
      lspLine = lspRes.ok
        ? `Sestaveno a uklizeno: ${path.basename(finalLss)} (LSP čisté)`
        : `Sestaveno s chybami LSP:\n${lspRes.diagnostics}`;
    } else {
      lspLine = `Sestaveno do: ${finalLss} a modulární složka byla smazána.`;
    }
    const out = [lspLine];
    if (config.enableScorecard) {
      const sc = state.buildScorecard(root, {
        lint: lintRes,
        lsp: lspRes,
        artifact: "written",
        manifestSynced: true,
      });
      out.push("", formatScorecard(sc, state.scoreHistory.get(root)?.at(-1)));
    }
    ctx.ui.notify(out.join("\n"), lspRes && !lspRes.ok ? "warning" : "info");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Chyba při úklidu: ${msg}`, "error");
  }
}

export async function lsDecompile(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext): Promise<void> {
  void state;
  const target = parts[1];
  if (!target) {
    ctx.ui.notify("Použití: /ls decompile <cesta k souboru .lss nebo .dxl>", "warning");
    return;
  }
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) {
    ctx.ui.notify(`Soubor nenalezen: ${resolved}`, "error");
    return;
  }
  try {
    let outDir = "";
    if (resolved.toLowerCase().endsWith(".dxl")) {
      outDir = AgentParser.decompileDxl(resolved) || "";
    } else {
      outDir = AgentParser.decompileLss(resolved);
    }
    ctx.ui.notify(`Dekompilováno do: ${outDir}`, "info");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Chyba dekompilace: ${msg}`, "error");
  }
}
