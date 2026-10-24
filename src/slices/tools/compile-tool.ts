/**
 * Model tool lotusscript_check. Split out of tools/index.ts for the
 * per-file line limit.
 *
 * Whole-file workflow: every .lss/.lsa is checked exactly as it is by the
 * IBM Notes 9.0.1 compiler oracle — no modular folder, no assembly, no
 * strict probe. The same oracle also compiles @formula sources (.fl /
 * .formula), so the tool takes either and reports that lane's FORMULA-0x…
 * codes. Cross-slice capabilities (lsp) arrive via ToolsDeps wired in the
 * composition root — slices never import each other (VSA).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ToolsDeps } from "./deps.js";
import type { PluginState } from "../../shared/state.js";
import { formatDiagnosticGotchas, matchDiagnosticGotchas } from "./diagnostic-gotchas.js";

export function registerCompileTools(pi: ExtensionAPI, state: PluginState, deps: ToolsDeps): void {
  // NOTE: state.config is a live getter — session_start's syncConfig() replaces
  // the config OBJECT after tool registration, so a registration-time capture
  // (`const { config } = state`) would freeze the pre-sync defaults forever.
  // Read state.config at execution time instead.

  const CheckParams = Type.Object({
    path: Type.String({
      description:
        "Path to the file to check: a whole LotusScript .lss/.lsa script or a @formula .fl/.formula source (compiled as-is, exactly as it is)",
    }),
  });

  pi.registerTool<typeof CheckParams, { ok: boolean; checkedPath?: string }>({
    name: "lotusscript_check",
    label: "Check LotusScript File",
    description:
      "Check a whole LotusScript .lss/.lsa script, or a @formula .fl/.formula source, with the IBM Notes 9.0.1 compiler oracle (the same engine Designer uses). The file is compiled exactly as it is — no modular folder, no assembly. Returns compiler diagnostics (LS-0x… / FORMULA-0x… codes) plus the catalogue entries that describe them; on errors, help pages are attached when the oracle has one. The oracle reports the FIRST error it hits, so re-run after each fix until the file is clean.",
    parameters: CheckParams,
    async execute(_toolCallId: string, params: { path: string }) {
      const cfg = state.config;
      const lspResult = await deps.checkLotusScriptDiagnostics(params.path);

      let report: string;
      if (lspResult.ok) {
        report = `Checked: ${params.path}\nLSP Diagnostics: 0 errors (clean)`;
      } else {
        report = `Checked: ${params.path}\nLSP Diagnostics:\n${lspResult.diagnostics}`;
        // SPAI-021: surface the catalogue entries that describe this very error
        // text, so the search step is already done when the agent reads it.
        try {
          const matches = matchDiagnosticGotchas(lspResult.diagnostics, deps.searchGotchas);
          const block = formatDiagnosticGotchas(matches);
          if (block) report += `\n\n${block}`;
        } catch {
          // catalogue unavailable — diagnostics stand alone
        }
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
