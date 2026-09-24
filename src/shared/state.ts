/**
 * PluginState — session-scoped kernel shared by the composition root and the
 * pipeline/commands/tools slices. Owns all mutable closure state that used to
 * live inside the extension factory, plus the derived helpers (scorecards,
 * pre-flight banners, procedure-limit gate, statusline).
 *
 * Every session creates one state via `createPluginState()`; nothing here is
 * global, so concurrent/mocked extension registrations stay isolated.
 */

import fs from "node:fs";
import path from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  AgentScorecard,
  FolderLintResult,
  GotchaItem,
  JevFolderEvalResult,
  LspCheckResult,
  ModularConfig,
} from "./types.js";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "./config.js";
import { getGotchasSummary, searchGotchas } from "../slices/gotchas/index.js";
import { lintModularFolder, promptProcedureLineReview } from "../slices/linter/index.js";
import { computeScorecard } from "../slices/scorecard/index.js";

export interface PluginState {
  // --- lifecycle plumbing ---
  /** Unsubscribers from every `pi.on()`; drained on session_shutdown (AGENTS §5). */
  unsubscribers: Array<() => void>;
  /** Retain a `pi.on()` return value; older engine typings declare it void. */
  track(result: unknown): void;

  // --- live session state ---
  config: ModularConfig;
  activeCwd: string;
  latestUiContext: ExtensionContext | null;
  latestScorecard: AgentScorecard | undefined;
  readonly readModularDirs: Set<string>;
  readonly modifiedModularDirs: Set<string>;
  readonly approvedLineExceptions: Set<string>;
  readonly rejectedLineSignatures: Map<string, string>;
  readonly scoreHistory: Map<string, AgentScorecard[]>;
  readonly preflightBannerCache: Map<string, string>;
  readonly pendingDebriefs: string[];
  readonly diagnosticHistory: Map<string, string[][]>;
  readonly recurringGotchaReported: Set<string>;
  /** True once any knowledge-base search tool ran this session (KB edit gate). */
  kbConsulted: boolean;

  // --- helpers ---
  procedureSignature(filePath: string): string;
  isManifestSynced(root: string): boolean;
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
  verifyProcedureLimits(
    folder: string,
    ctx?: ExtensionContext
  ): Promise<{
    ok: boolean;
    message?: string;
    splitInstructions?: string;
    warnings: string[];
    lint: FolderLintResult;
  }>;
  renderStatusline(state: "idle" | "compiling" | "clean" | "error"): void;
  syncConfig(cwd: string): void;
  updateConfig(newConfig: ModularConfig): void;
}

export function createPluginState(): PluginState {
  const unsubscribers: Array<() => void> = [];

  const track = (result: unknown): void => {
    if (typeof result === "function") unsubscribers.push(result as () => void);
  };

  let config: ModularConfig = { ...DEFAULT_CONFIG };
  let activeCwd = process.cwd();
  let latestUiContext: ExtensionContext | null = null;
  let latestScorecard: AgentScorecard | undefined = undefined;

  const readModularDirs = new Set<string>();
  const modifiedModularDirs = new Set<string>();
  const approvedLineExceptions = new Set<string>();
  const rejectedLineSignatures = new Map<string, string>();
  const scoreHistory = new Map<string, AgentScorecard[]>();
  const preflightBannerCache = new Map<string, string>();
  const pendingDebriefs: string[] = [];
  const diagnosticHistory = new Map<string, string[][]>();
  const recurringGotchaReported = new Set<string>();
  let kbConsulted = false;

  /** Cheap content signature used to avoid re-prompting for unchanged files. */
  function procedureSignature(filePath: string): string {
    try {
      const st = fs.statSync(filePath);
      return `${st.mtimeMs}:${st.size}`;
    } catch {
      return "missing";
    }
  }

  /** True when manifest.json compilationOrder covers exactly the procedure files on disk. */
  function isManifestSynced(root: string): boolean {
    try {
      const manifestPath = path.join(root, "manifest.json");
      if (!fs.existsSync(manifestPath)) return false;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as { compilationOrder?: string[] };
      const order = manifest.compilationOrder ?? [];
      const onDisk = fs
        .readdirSync(root)
        .filter((f) => f.endsWith(".lss") && f !== "main.lss" && !/_compiled\.lss$/i.test(f));
      return onDisk.length === order.length && onDisk.every((f) => order.includes(f));
    } catch {
      return false;
    }
  }

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
      maxProcedureLines: config.maxProcedureLines,
      lint: opts.lint,
      lsp: opts.lsp,
      lspEnabled: config.enableLsp,
      enforceCzechComments: config.enforceCzechComments,
      manifestSynced: opts.manifestSynced ?? isManifestSynced(root),
      artifact: opts.artifact,
      jev: opts.jev,
    });
  }

  /** Appends to session history and returns the previous scorecard (for the trend line). */
  function recordScorecard(root: string, scorecard: AgentScorecard): AgentScorecard | undefined {
    latestScorecard = scorecard;
    const history = scoreHistory.get(root) ?? [];
    const previous = history.at(-1);
    scoreHistory.set(root, [...history, scorecard].slice(-20));
    renderStatusline("clean");
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
    if (!config.injectGotchasSummary) return "";

    const cached = preflightBannerCache.get(root);
    if (cached !== undefined) return cached;

    let banner: string;
    if (!config.injectPreflightGotchas) {
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

    preflightBannerCache.set(root, banner);
    return banner;
  }

  async function verifyProcedureLimits(
    folder: string,
    ctx?: ExtensionContext
  ): Promise<{
    ok: boolean;
    message?: string;
    splitInstructions?: string;
    warnings: string[];
    lint: FolderLintResult;
  }> {
    const warnings: string[] = [];
    const lint = lintModularFolder(
      folder,
      config.maxProcedureLines,
      config.enforceCzechComments
    );

    if (config.enforceCzechComments) {
      for (const m of lint.missingCommentProcedures) {
        warnings.push(
          `Procedure '${m.fileName}' lacks a concise Czech documentation comment describing its purpose (' Účel: ...).`
        );
      }
    }

    if (!config.checkProcedureLimits) return { ok: true, warnings, lint };

    for (const item of lint.exceededProcedures) {
      const key = `${path.resolve(folder)}:${item.fileName}`;
      if (approvedLineExceptions.has(key)) continue;

      const filePath = path.join(folder, item.fileName);
      const signature = procedureSignature(filePath);

      // Already rejected for this exact content revision — do NOT re-open the
      // modal (prevents modal spam / infinite prompting on every unrelated
      // edit in the same folder). The AI still receives the split directive.
      if (rejectedLineSignatures.get(key) === signature) {
        return {
          ok: false,
          warnings,
          lint,
          message: `Procedure '${item.fileName}' has ${item.lineCount} lines, exceeding the ${item.maxLines}-line limit. The user already rejected the exception for this revision. Split it into smaller subroutines/functions in 'sub_*.lss' or 'func_*.lss' files.`,
        };
      }

      const effectiveCtx = ctx ?? latestUiContext;
      if (!effectiveCtx || !effectiveCtx.hasUI) {
        return {
          ok: false,
          warnings,
          lint,
          message: `Procedure '${item.fileName}' has ${item.lineCount} lines, exceeding the ${item.maxLines}-line limit. Approving an exception requires an interactive UI, which is unavailable. Split the procedure into smaller subroutines/functions.`,
        };
      }

      const review = await promptProcedureLineReview(effectiveCtx, item);

      if (review.action === "approve") {
        approvedLineExceptions.add(key);
        rejectedLineSignatures.delete(key);
        effectiveCtx.ui.notify(
          `✓ Schválena výjimka délky pro ${item.fileName} (${item.lineCount} řádků)`,
          "info"
        );
      } else if (review.action === "split_instructions") {
        rejectedLineSignatures.set(key, signature);
        return {
          ok: false,
          warnings,
          lint,
          splitInstructions: review.instructions,
          message: `Procedure '${item.fileName}' has ${item.lineCount} lines (limit ${item.maxLines}). The user rejected the exception and provided splitting instructions: "${review.instructions}"`,
        };
      } else {
        rejectedLineSignatures.set(key, signature);
        return {
          ok: false,
          warnings,
          lint,
          message: `Procedure '${item.fileName}' has ${item.lineCount} lines, exceeding the ${item.maxLines}-line limit. The user rejected the exception and requests splitting it into smaller subroutines/functions according to LotusScript principles (avoiding the 32 KB procedure limit).`,
        };
      }
    }

    return { ok: true, warnings, lint };
  }

  function renderStatusline(state: "idle" | "compiling" | "clean" | "error" = "idle"): void {
    if (!latestUiContext || !latestUiContext.hasUI || !latestUiContext.ui?.theme) return;
    const theme = latestUiContext.ui.theme;
    const scoreBadge = latestScorecard ? ` [${latestScorecard.score}/${latestScorecard.max}]` : "";

    if (state === "compiling") {
      latestUiContext.ui.setStatus(
        "lotusscript",
        theme.fg("warning", `🪷 LS${scoreBadge}: compiling...`)
      );
      return;
    }

    if (state === "clean") {
      latestUiContext.ui.setStatus(
        "lotusscript",
        theme.fg("success", `🪷 LS${scoreBadge}: compiled ✓`)
      );
      return;
    }

    if (state === "error") {
      latestUiContext.ui.setStatus(
        "lotusscript",
        theme.fg("error", `🪷 LS${scoreBadge}: LSP error ⚠`)
      );
      return;
    }

    // Default / idle state
    const icon = theme.fg("accent", `🪷 LS${scoreBadge}`);
    const jevFlag = config.useJevEvaluation ? " · JEV:on" : "";
    const flags = theme.fg(
      "dim",
      ` (LSP:${config.enableLsp ? "on" : "off"} · OW:${config.overwriteSourceLss ? "on" : "off"}${jevFlag})`
    );
    latestUiContext.ui.setStatus("lotusscript", icon + flags);
  }

  function syncConfig(cwd: string): void {
    activeCwd = cwd;
    config = loadConfig(cwd);
    kbConsulted = false; // new session → KB consult gate re-arms
  }

  function updateConfig(newConfig: ModularConfig): void {
    config = newConfig;
    saveConfig(activeCwd, config);
    renderStatusline("idle");
  }

  return {
    unsubscribers,
    track,
    get config() {
      return config;
    },
    set config(c: ModularConfig) {
      config = c;
    },
    get activeCwd() {
      return activeCwd;
    },
    set activeCwd(cwd: string) {
      activeCwd = cwd;
    },
    get latestUiContext() {
      return latestUiContext;
    },
    set latestUiContext(c: ExtensionContext | null) {
      latestUiContext = c;
    },
    get latestScorecard() {
      return latestScorecard;
    },
    set latestScorecard(sc: AgentScorecard | undefined) {
      latestScorecard = sc;
    },
    readModularDirs,
    modifiedModularDirs,
    approvedLineExceptions,
    rejectedLineSignatures,
    scoreHistory,
    preflightBannerCache,
    pendingDebriefs,
    diagnosticHistory,
    recurringGotchaReported,
    get kbConsulted() {
      return kbConsulted;
    },
    set kbConsulted(v: boolean) {
      kbConsulted = v;
    },
    procedureSignature,
    isManifestSynced,
    buildScorecard,
    recordScorecard,
    collectRootTokens,
    buildGotchasBanner,
    verifyProcedureLimits,
    renderStatusline,
    syncConfig,
    updateConfig,
  };
}
