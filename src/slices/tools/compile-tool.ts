/**
 * Model tool lotusscript_compile. Split out of tools/index.ts for the
 * per-file line limit.
 *
 * Cross-slice capabilities (parser / lsp) arrive via ToolsDeps wired in the
 * composition root — slices never import each other (VSA).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { findModularRoot } from "../../shared/paths.js";
import type { ToolsDeps } from "./deps.js";
import type { PluginState } from "../../shared/state.js";

export function registerCompileTools(pi: ExtensionAPI, state: PluginState, deps: ToolsDeps): void {
  // NOTE: state.config is a live getter — session_start's syncConfig() replaces
  // the config OBJECT after tool registration, so a registration-time capture
  // (`const { config } = state`) would freeze the pre-sync defaults forever
  // (banner showed LSP ENABLED while this tool reported "validation disabled").
  // Read state.config at execution time instead.

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
      const cfg = state.config;
      const compiledPath = deps.compileAgent(modularRoot, {
        keepTimestamp: cfg.keepTimestampInCompiledName,
        overwriteSourceLss: cfg.overwriteSourceLss,
        createLssForDxl: true,
        deleteModularDir: shouldClean,
      });

      let lspReport = "";
      if (cfg.enableLsp) {
        const lspResult = await deps.checkLotusScriptDiagnostics(compiledPath);
        if (lspResult.ok) {
          lspReport = "\nLSP Diagnostics: 0 errors (clean)";
        } else {
          lspReport = `\nLSP Diagnostics:\n${lspResult.diagnostics}`;
          // SPAI-008 automation: attach lsp_explain help for the error codes.
          if (cfg.autoExplainLspCodes) {
            try {
              const explain = await deps.explainLotusScriptCodes(lspResult.diagnostics);
              if (explain) lspReport += `\n\n${explain}`;
            } catch {
              // explain lane unavailable — report bare codes
            }
          }
        }
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

}
