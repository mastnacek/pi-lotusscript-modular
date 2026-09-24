/**
 * agent_settled lifecycle — ephemeral cleanup + deterministic debrief.
 * Split out of pipeline/index.ts for the per-file line limit.
 */

import path from "node:path";
import fs from "node:fs";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentScorecard, LspCheckResult } from "../../shared/types.js";
import { AgentParser } from "../parser/index.js";
import { checkLotusScriptDiagnostics } from "../lsp/index.js";
import { trendLabel } from "../scorecard/index.js";
import type { PluginState } from "../../shared/state.js";

export async function handleAgentSettled(state: PluginState, ctx: ExtensionContext): Promise<void> {
  const { config } = state;
  state.renderStatusline("idle");
  if (!config.cleanupOnSettled) return;

  for (const modDir of state.modifiedModularDirs) {
    if (fs.existsSync(modDir)) {
      try {
        const limitCheck = await state.verifyProcedureLimits(modDir, ctx);
        if (!limitCheck.ok) {
          continue;
        }
        const lintBeforeDelete = limitCheck.lint;
        const finalLss = AgentParser.compileAgent(modDir, {
          overwriteSourceLss: config.overwriteSourceLss,
          createLssForDxl: true,
          deleteModularDir: true,
        });

        let finalScorecard: AgentScorecard | undefined = undefined;
        // Debrief: deterministic "note to self" carried into the next turn.
        if (config.enableScorecard) {
          // Measure the LSP on the artifact that was just written. Skipping the
          // check (lsp: null) made the debrief grade "not measured" as "failed"
          // — see computeScorecard's DoD 3.
          let lspRes: LspCheckResult | null = null;
          if (config.enableLsp) {
            try {
              lspRes = await checkLotusScriptDiagnostics(finalLss);
            } catch {
              lspRes = null;
            }
          }
          const scorecard = state.buildScorecard(modDir, {
            lint: lintBeforeDelete,
            lsp: lspRes,
            artifact: "written",
            manifestSynced: true,
          });
          finalScorecard = scorecard;
          const previous = state.recordScorecard(modDir, scorecard);
          const unmet = scorecard.items.filter((i) => !i.ok && !i.pending);
          if (unmet.length > 0) {
            state.pendingDebriefs.push(
              [
                `🧾 [LotusScript Debrief] ${path.basename(modDir)} — final ${scorecard.score}/${scorecard.max} (${trendLabel(scorecard, previous)})`,
                `- Artifact: ${path.basename(finalLss)}`,
                "- Unmet Definition of Done:",
                ...unmet.map((u) => `    - ${u.label}${u.detail ? `: ${u.detail}` : ""}`),
                '- Propose each unmet trap via lotusscript_gotchas(action: "add") so it is not repeated.',
              ].join("\n")
            );
          }
        }

        if (ctx.hasUI) {
          const scoreLabel = finalScorecard ? ` [skóre: ${finalScorecard.score}/${finalScorecard.max}]` : "";
          ctx.ui.notify(
            `🪷 [LotusScript Modular] Hotovo: ${path.basename(finalLss)} sestaven${scoreLabel} a dočasná složka smazána.`,
            "info"
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[LotusScript Modular] Chyba při úklidu ${modDir}: ${msg}`);
      }
    }
  }

  for (const modDir of state.readModularDirs) {
    if (!state.modifiedModularDirs.has(modDir) && fs.existsSync(modDir)) {
      try {
        fs.rmSync(modDir, { recursive: true, force: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[LotusScript Modular] Chyba při mazání read-only složky ${modDir}: ${msg}`);
      }
    }
  }

  state.modifiedModularDirs.clear();
  state.readModularDirs.clear();
}
