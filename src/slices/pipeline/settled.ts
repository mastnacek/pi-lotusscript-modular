/**
 * agent_settled lifecycle — final whole-file check + deterministic debrief.
 * Split out of pipeline/index.ts for the per-file line limit.
 *
 * Cross-slice capabilities (lsp / linter / scorecard) arrive via SettledDeps,
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

/** Cross-slice capabilities injected by the composition root. */
export interface SettledDeps {
  checkLotusScriptDiagnostics(filePath: string): Promise<LspCheckResult>;
  trendLabel(current: AgentScorecard, previous?: AgentScorecard): string;
}

export async function handleAgentSettled(state: PluginState, ctx: ExtensionContext, deps: SettledDeps): Promise<void> {
  const { config } = state;
  state.setRunState("idle");

  const filePath = state.lastCheckedFile;
  if (!filePath || !fs.existsSync(filePath)) return;
  if (!config.enableScorecard) return;

  // Measure the LSP on the file as it now stands. Skipping the check
  // (lsp: null) made the debrief grade "not measured" as "failed" — see
  // computeScorecard's DoD 3.
  let lspRes: LspCheckResult | null = null;
  if (config.enableLsp) {
    try {
      lspRes = await deps.checkLotusScriptDiagnostics(filePath);
    } catch {
      lspRes = null;
    }
  }

  const scorecard = state.buildScorecard(filePath, { lsp: lspRes });
  const previous = state.recordScorecard(filePath, scorecard);
  const unmet = scorecard.items.filter((i) => !i.ok && !i.pending);

  if (unmet.length === 0) {
    if (ctx.hasUI) {
      const st = stringsFor(config.lang).settled;
      ctx.ui.notify(st.done(path.basename(filePath), st.score(scorecard.score, scorecard.max)), "info");
    }
    return;
  }

  // Debrief: deterministic "note to self" carried into the next turn.
  state.pendingDebriefs.push(
    [
      `🧾 [LotusScript Debrief] ${path.basename(filePath)} — final ${scorecard.score}/${scorecard.max} (${deps.trendLabel(scorecard, previous)})`,
      "- Unmet Definition of Done:",
      ...unmet.map((u) => `    - ${u.label}${u.detail ? `: ${u.detail}` : ""}`),
      '- Propose each unmet trap via lotusscript_gotchas(action: "add") so it is not repeated.',
    ].join("\n")
  );

  if (ctx.hasUI) {
    const st = stringsFor(config.lang).settled;
    ctx.ui.notify(st.done(path.basename(filePath), st.score(scorecard.score, scorecard.max)), "warning");
  }
}
