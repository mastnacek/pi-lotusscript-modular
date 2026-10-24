/**
 * State insights — scorecards, score history, file-token collection and the
 * pre-flight gotcha banner. Extracted from the PluginState kernel so
 * state.ts stays under the plugin's own per-file limit (self-dogfooded).
 */

import fs from "node:fs";
import path from "node:path";
import type {
  AgentScorecard,
  GotchaItem,
  LspCheckResult,
  ModularConfig,
  ScorecardInput,
} from "./types.js";

/**
 * Slice capabilities the kernel is NOT allowed to import (VSA: `src/shared/`
 * depends on nothing but itself). The composition root supplies them.
 */
export interface InsightsCapabilities {
  getGotchasSummary(limit?: number): string;
  searchGotchas(query: string, limit?: number): GotchaItem[];
  computeScorecard(input: ScorecardInput): AgentScorecard;
}

export interface StateInsightsDeps extends InsightsCapabilities {
  getConfig(): ModularConfig;
  getKbSearchCount(): number;
  renderStatusline(state: "idle" | "checking" | "clean" | "error"): void;
  setLatestScorecard(sc: AgentScorecard | undefined): void;
  scoreHistory: Map<string, AgentScorecard[]>;
  preflightBannerCache: Map<string, string>;
}

export interface StateInsights {
  buildScorecard(
    filePath: string,
    opts: {
      lsp: LspCheckResult | null;
    }
  ): AgentScorecard;
  recordScorecard(filePath: string, scorecard: AgentScorecard): AgentScorecard | undefined;
  collectFileTokens(filePath: string): string[];
  buildGotchasBanner(filePath: string): string;
}

export function createStateInsights(deps: StateInsightsDeps): StateInsights {
  const config = deps.getConfig;

  /** Builds a deterministic scorecard for one whole LotusScript file. */
  function buildScorecard(
    filePath: string,
    opts: {
      lsp: LspCheckResult | null;
    }
  ): AgentScorecard {
    const cfg = config();
    return deps.computeScorecard({
      agent: path.basename(filePath),
      lsp: opts.lsp,
      lspEnabled: cfg.enableLsp,
      kbExpected: cfg.enforceKbPrompt || cfg.enforceKbGate || cfg.verifyKbBeforeSettle,
      kbSearchCount: deps.getKbSearchCount(),
      minKbSearches: cfg.minKbSearchesPerRun,
    });
  }

  /** Appends to session history and returns the previous scorecard (for the trend line). */
  function recordScorecard(filePath: string, scorecard: AgentScorecard): AgentScorecard | undefined {
    deps.setLatestScorecard(scorecard);
    const history = deps.scoreHistory.get(filePath) ?? [];
    const previous = history.at(-1);
    deps.scoreHistory.set(filePath, [...history, scorecard].slice(-20));
    deps.renderStatusline("clean");
    return previous;
  }

  /**
   * Identifiers declared by this file: declarations, procedure names and type
   * names. These are the tokens most likely to collide with a registered
   * LotusScript trap (reserved words, built-in function names, risky API usage).
   */
  function collectFileTokens(filePath: string): string[] {
    const tokens = new Set<string>();
    try {
      const text = fs.readFileSync(filePath, "utf-8");
      for (const m of text.matchAll(
        /\b(?:Dim|Static|Const|Global|Type|Class|Sub|Function|Property(?:\s+Get|\s+Set)?)\s+([A-Za-z_][A-Za-z0-9_]*)/gi
      )) {
        const name = m[1];
        if (name) tokens.add(name);
      }
      for (const m of text.matchAll(/\bAs\s+([A-Za-z_][A-Za-z0-9_]*)/gi)) {
        const name = m[1];
        if (name) tokens.add(name);
      }
    } catch {
      // best effort — pre-flight is advisory only
    }
    return [...tokens].filter((t) => t.length >= 3);
  }

  /**
   * Pre-flight gotcha banner. With `injectPreflightGotchas` it surfaces only the
   * traps matching this file's own identifiers; otherwise the generic summary.
   * Computed once per file per session and cached.
   */
  function buildGotchasBanner(filePath: string): string {
    if (!config().injectGotchasSummary) return "";

    const cached = deps.preflightBannerCache.get(filePath);
    if (cached !== undefined) return cached;

    let banner: string;
    if (!config().injectPreflightGotchas) {
      banner = `\n\n${deps.getGotchasSummary(8)}`;
    } else {
      const found = new Map<string, GotchaItem>();
      for (const token of collectFileTokens(filePath)) {
        for (const hit of deps.searchGotchas(token, 3)) {
          if (`${hit.title}\n${hit.body}`.toLowerCase().includes(token.toLowerCase())) {
            found.set(hit.id, hit);
          }
        }
        if (found.size >= 3) break;
      }

      if (found.size === 0) {
        banner = `\n\n${deps.getGotchasSummary(8)}`;
      } else {
        const lines = [
          "⚠️ PRE-FLIGHT GOTCHA CHECK (matches against this file's own declarations):",
        ];
        for (const g of [...found.values()].slice(0, 3)) {
          const gist = g.body
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 2)
            .join(" ");
          lines.push(`  • ${g.title}`);
          if (gist) lines.push(`    ${gist.slice(0, 200)}`);
        }
        lines.push("  Full text: tool 'lotusscript_gotchas' with a keyword, or /ls gotchas <query>.");
        banner = `\n\n${lines.join("\n")}`;
      }
    }

    deps.preflightBannerCache.set(filePath, banner);
    return banner;
  }

  return {
    buildScorecard,
    recordScorecard,
    collectFileTokens,
    buildGotchasBanner,
  };
}
