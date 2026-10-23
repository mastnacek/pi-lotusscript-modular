/**
 * agent_settled lifecycle — ephemeral cleanup + deterministic debrief.
 * Split out of pipeline/index.ts for the per-file line limit.
 *
 * Cross-slice capabilities (parser / lsp / scorecard) arrive via SettledDeps,
 * wired by the composition root — slices never import each other (VSA).
 * User-facing notify text resolves through the i18n string table; the debrief
 * pushed into pendingDebriefs is model-facing and stays English (§10).
 */

import path from "node:path";
import fs from "node:fs";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentScorecard, LspCheckResult } from "../../shared/types.js";
import { stringsFor } from "../../shared/i18n.js";
import type { PluginState } from "../../shared/state.js";

/** Structural compile options (no cross-slice type imports — slice isolation). */
export interface SettledCompileOptions {
  keepTimestamp?: boolean;
  overwriteSourceLss?: boolean;
  createLssForDxl?: boolean;
  deleteModularDir?: boolean;
}

/** Cross-slice capabilities injected by the composition root. */
export interface SettledDeps {
  compileAgent(targetDirOrFile: string, options?: SettledCompileOptions): string;
  checkLotusScriptDiagnostics(filePath: string): Promise<LspCheckResult>;
  trendLabel(current: AgentScorecard, previous?: AgentScorecard): string;
}

export async function handleAgentSettled(state: PluginState, ctx: ExtensionContext, deps: SettledDeps): Promise<void> {
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
        const finalLss = deps.compileAgent(modDir, {
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
              lspRes = await deps.checkLotusScriptDiagnostics(finalLss);
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
                `🧾 [LotusScript Debrief] ${path.basename(modDir)} — final ${scorecard.score}/${scorecard.max} (${deps.trendLabel(scorecard, previous)})`,
                `- Artifact: ${path.basename(finalLss)}`,
                "- Unmet Definition of Done:",
                ...unmet.map((u) => `    - ${u.label}${u.detail ? `: ${u.detail}` : ""}`),
                '- Propose each unmet trap via lotusscript_gotchas(action: "add") so it is not repeated.',
              ].join("\n")
            );
          }
        }

        if (ctx.hasUI) {
          const st = stringsFor(config.lang).settled;
          const scoreLabel = finalScorecard ? st.score(finalScorecard.score, finalScorecard.max) : "";
          // The folder survives when overwriteSourceLss is off — the artifact
          // then lives inside it, so claiming "deleted" would be a lie.
          const tail = fs.existsSync(modDir)
            ? st.tailKept(scoreLabel)
            : st.tailDeleted(scoreLabel);
          ctx.ui.notify(st.done(path.basename(finalLss), tail), "info");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[LotusScript Modular] Chyba při úklidu ${modDir}: ${msg}`);
      }
    }
  }

  // Folders the agent only read are the user's: they come from scaffolding or
  // from an earlier decompile, so settling never deletes them.
  state.modifiedModularDirs.clear();
  state.readModularDirs.clear();
}
