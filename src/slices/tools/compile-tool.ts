/**
 * Model tools lotusscript_compile / lotusscript_decompile. Split out of
 * tools/index.ts for the per-file line limit.
 */

import path from "node:path";
import fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { findModularRoot } from "../../shared/paths.js";
import { AgentParser } from "../parser/index.js";
import { checkLotusScriptDiagnostics } from "../lsp/index.js";
import type { PluginState } from "../../shared/state.js";

export function registerCompileDecompileTools(pi: ExtensionAPI, state: PluginState): void {
  const { config } = state;

  const CompileParams = Type.Object({
    folder: Type.String({ description: "Path to modular agent directory containing manifest.json" }),
    clean: Type.Optional(Type.Boolean({ description: "Whether to delete the modular folder after compiling" })),
  });

  pi.registerTool<typeof CompileParams, { ok: boolean; compiledPath?: string; modularRoot?: string }>({
    name: "lotusscript_compile",
    label: "Compile Modular LotusScript",
    description: "Recompile modular LotusScript folder into single .lss file and run optional LSP diagnostics.",
    parameters: CompileParams,
    async execute(_toolCallId: string, params: { folder: string; clean?: boolean }) {
      const modularRoot = findModularRoot(params.folder);
      if (!modularRoot) {
        throw new Error(`Directory is not a modular agent root: ${params.folder}`);
      }

      const shouldClean = params.clean ?? false;
      const compiledPath = AgentParser.compileAgent(modularRoot, {
        keepTimestamp: config.keepTimestampInCompiledName,
        overwriteSourceLss: config.overwriteSourceLss,
        createLssForDxl: true,
        deleteModularDir: shouldClean,
      });

      let lspReport = "";
      if (config.enableLsp) {
        const lspResult = await checkLotusScriptDiagnostics(compiledPath);
        lspReport = lspResult.ok
          ? "\nLSP Diagnostics: 0 errors (clean)"
          : `\nLSP Diagnostics:\n${lspResult.diagnostics}`;
      } else {
        lspReport = "\n(LSP validation disabled)";
      }

      const cleanNote = shouldClean ? "\n(Modular folder deleted)" : "";
      return {
        content: [{ type: "text", text: `Compiled: ${compiledPath}${cleanNote}${lspReport}` }],
        details: { ok: true, compiledPath, modularRoot },
      };
    },
  });

  const DecompileParams = Type.Object({
    path: Type.String({ description: "Path to .lss or .dxl file to decompile" }),
    outputDir: Type.Optional(Type.String({ description: "Optional custom output directory (defaults to folder alongside source file)" })),
  });

  pi.registerTool<typeof DecompileParams, { ok: boolean; outDir?: string }>({
    name: "lotusscript_decompile",
    label: "Decompile LotusScript Monolith",
    description: "Decompiles monolithic LotusScript (.lss) or Domino agent DXL (.dxl) into modular files with manifest.json and main.lss in a folder named after the script.",
    parameters: DecompileParams,
    async execute(_toolCallId: string, params: { path: string; outputDir?: string }) {
      const resolved = path.resolve(params.path);
      if (!fs.existsSync(resolved)) {
        throw new Error(`File not found: ${resolved}`);
      }

      let outDir = "";
      if (resolved.toLowerCase().endsWith(".dxl")) {
        outDir = AgentParser.decompileDxl(resolved, params.outputDir) || "";
      } else {
        outDir = AgentParser.decompileLss(resolved, params.outputDir);
      }

      if (!outDir) {
        throw new Error(`No LotusScript code found in ${resolved}`);
      }

      return {
        content: [{ type: "text", text: `Decompiled to: ${outDir}\nFiles: manifest.json, main.lss, 00_options.lss, 01_declarations.lss, procedures, 99_initialize.lss` }],
        details: { ok: true, outDir },
      };
    },
  });
}