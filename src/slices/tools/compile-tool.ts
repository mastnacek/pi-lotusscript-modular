/**
 * Model tool lotusscript_check. Split out of tools/index.ts for the
 * per-file line limit.
 *
 * Whole-file workflow: every .lss/.lsa is checked exactly as it is by the
 * IBM Notes 9.0.1 compiler oracle — no modular folder, no assembly, no
 * strict probe. Cross-slice capabilities (lsp) arrive via ToolsDeps wired
 * in the composition root — slices never import each other (VSA).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ToolsDeps } from "./deps.js";
import type { PluginState } from "../../shared/state.js";

export function registerCompileTools(pi: ExtensionAPI, state: PluginState, deps: ToolsDeps): void {
  // NOTE: state.config is a live getter — session_start's syncConfig() replaces
  // the config OBJECT after tool registration, so a registration-time capture
  // (`const { config } = state`) would freeze the pre-sync defaults forever.
  // Read state.config at execution time instead.

  const CheckParams = Type.Object({
    path: Type.String({ description: "Path to the .lss/.lsa file to check (checked as a whole script, exactly as it is)" }),
  });

  pi.registerTool<typeof CheckParams, { ok: boolean; checkedPath?: string }>({
    name: "lotusscript_check",
    label: "Check LotusScript File",
    description:
      "Check a whole LotusScript .lss/.lsa file with the IBM Notes 9.0.1 compiler oracle. The file is compiled exactly as it is — no modular folder, no assembly. Returns compiler diagnostics; on errors, help pages for the error codes are attached when enabled.",
    parameters: CheckParams,
    async execute(_toolCallId: string, params: { path: string }) {
      const cfg = state.config;
      const lspResult = await deps.checkLotusScriptDiagnostics(params.path);

      let report: string;
      if (lspResult.ok) {
        report = `Checked: ${params.path}\nLSP Diagnostics: 0 errors (clean)`;
      } else {
        report = `Checked: ${params.path}\nLSP Diagnostics:\n${lspResult.diagnostics}`;
        // SPAI-008 automation: attach lsp_explain help for the error codes.
        if (cfg.autoExplainLspCodes) {
          try {
            const explain = await deps.explainLotusScriptCodes(lspResult.diagnostics);
            if (explain) report += `\n\n${explain}`;
          } catch {
            // explain lane unavailable — report bare codes
          }
        }
      }

      return {
        content: [{ type: "text", text: report }],
        details: { ok: lspResult.ok, checkedPath: params.path },
      };
    },
  });
}
