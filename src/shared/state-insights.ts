/**
 * State insights — scorecards, score history, root-token collection and the
 * pre-flight gotcha banner. Extracted from the PluginState kernel so
 * state.ts stays under the plugin's own per-file limit (self-dogfooded).
 */

import fs from "node:fs";
import path from "node:path";
import type {
  AgentScorecard,
  FolderLintResult,
  GotchaItem,
  JevFolderEvalResult,
  LspCheckResult,
  ModularConfig,
} from "./types.js";
import { getGotchasSummary, searchGotchas } from "../slices/gotchas/index.js";
import { computeScorecard } from "../slices/scorecard/index.js";

export interface StateInsightsDeps {
  getConfig(): ModularConfig;
  isManifestSynced(root: string): boolean;
  renderStatusline(state: "idle" | "compiling" | "clean" | "error"): void;
  setLatestScorecard(sc: AgentScorecard | undefined): void;
  scoreHistory: Map<string, AgentScorecard[]>;
  preflightBannerCache: Map<string, string>;
}

export interface StateInsights {
  buildScorecard(
    root: string,
    opts: {
      lint: FolderLintResult;
      lsp: LspCheckResult | null;
      artifact: "written" | "pending";
      manifestSynced?: boolean;
      jev?: JevFolderEvalResult | null;
    }
  ): AgentScorecard;
  recordScorecard(root: string, scorecard: AgentScorecard): AgentScorecard | undefined;
  collectRootTokens(root: string): string[];
  buildGotchasBanner(root: string): string;
}

export function createStateInsights(deps: StateInsightsDeps): StateInsights {
  const config = deps.getConfig;

  /** Builds a deterministic scorecard for one modular agent root. */
  function buildScorecard(
    root: string,
    opts: {
      lint: FolderLintResult;
      lsp: LspCheckResult | null;
      artifact: "written" | "pending";
      manifestSynced?: boolean;
      jev?: JevFolderEvalResult | null;
    }
  ): AgentScorecard {
    return computeScorecard({
      agent: path.basename(root),
      maxProcedureLines: config().maxProcedureLines,
      lint: opts.lint,
      lsp: opts.lsp,
      lspEnabled: config().enableLsp,
      enforceCzechComments: config().enforceCzechComments,
      manifestSynced: opts.manifestSynced ?? deps.isManifestSynced(root),
      artifact: opts.artifact,
      jev: opts.jev,
    });
  }

  /** Appends to session history and returns the previous scorecard (for the trend line). */
  function recordScorecard(root: string, scorecard: AgentScorecard): AgentScorecard | undefined {
    deps.setLatestScorecard(scorecard);
    const history = deps.scoreHistory.get(root) ?? [];
    const previous = history.at(-1);
    deps.scoreHistory.set(root, [...history, scorecard].slice(-20));
    deps.renderStatusline("clean");
    return previous;
  }

  /**
   * Identifiers and procedure names declared by this agent. These are the tokens
   * most likely to collide with a registered LotusScript trap (reserved words,
   * built-in function names, risky API usage).
   */
  function collectRootTokens(root: string): string[] {
    const tokens = new Set<string>();
    try {
      const declPath = path.join(root, "01_declarations.lss");
      if (fs.existsSync(declPath)) {
        const text = fs.readFileSync(declPath, "utf-8");
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
      }
      for (const f of fs.readdirSync(root)) {
        if (!/^(?:sub_|func_).*\.lss$/i.test(f)) continue;
        tokens.add(f.replace(/\.lss$/i, "").replace(/^(?:sub_|func_)/i, ""));
      }
    } catch {
      // best effort — pre-flight is advisory only
    }
    return [...tokens].filter((t) => t.length >= 3);
  }

  /**
   * Pre-flight gotcha banner. With `injectPreflightGotchas` it surfaces only the
   * traps matching this agent's own identifiers; otherwise the generic summary.
   * Computed once per root per session and cached.
   */
  function buildGotchasBanner(root: string): string {
    if (!config().injectGotchasSummary) return "";

    const cached = deps.preflightBannerCache.get(root);
    if (cached !== undefined) return cached;

    let banner: string;
    if (!config().injectPreflightGotchas) {
      banner = `\n\n${getGotchasSummary(8)}`;
    } else {
      const found = new Map<string, GotchaItem>();
      for (const token of collectRootTokens(root)) {
        for (const hit of searchGotchas(token, 3)) {
          if (`${hit.title}\n${hit.body}`.toLowerCase().includes(token.toLowerCase())) {
            found.set(hit.id, hit);
          }
        }
        if (found.size >= 3) break;
      }

      if (found.size === 0) {
        banner = `\n\n${getGotchasSummary(8)}`;
      } else {
        const lines = [
          "⚠️ PRE-FLIGHT GOTCHA CHECK (matches against this agent's own declarations):",
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

    deps.preflightBannerCache.set(root, banner);
    return banner;
  }

  return {
    buildScorecard,
    recordScorecard,
    collectRootTokens,
    buildGotchasBanner,
  };
}
