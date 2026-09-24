/**
 * PluginState — session-scoped kernel shared by the composition root and the
 * pipeline/commands/tools slices. Owns all mutable closure state that used to
 * live inside the extension factory, plus the derived helpers (scorecards,
 * pre-flight banners, procedure-limit gate, statusline).
 *
 * Every session creates one state via `createPluginState()`; nothing here is
 * global, so concurrent/mocked extension registrations stay isolated.
 *
 * Heavy helpers live in sibling modules (state-insights.ts,
 * state-procedure-limits.ts) — this file stays the composition kernel.
 */

import fs from "node:fs";
import path from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  AgentScorecard,
  FolderLintResult,
  JevFolderEvalResult,
  LspCheckResult,
  ModularConfig,
} from "./types.js";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "./config.js";
import { createStateInsights } from "./state-insights.js";
import { createProcedureLimitGate } from "./state-procedure-limits.js";

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
  updateConfig(newConfig: ModularConfig, isGlobal?: boolean, cwd?: string): void;
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

  // Extracted helper groups (scorecards/gotchas banner, procedure-limit gate).
  const insights = createStateInsights({
    getConfig: () => config,
    isManifestSynced,
    renderStatusline,
    setLatestScorecard: (sc) => {
      latestScorecard = sc;
    },
    scoreHistory,
    preflightBannerCache,
  });
  const limitGate = createProcedureLimitGate({
    getConfig: () => config,
    approvedLineExceptions,
    rejectedLineSignatures,
    procedureSignature,
    getLatestUiContext: () => latestUiContext,
  });

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

  function updateConfig(newConfig: ModularConfig, isGlobal = false, cwd?: string): void {
    config = newConfig;
    saveConfig(cwd || activeCwd, config, isGlobal);
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
    buildScorecard: insights.buildScorecard,
    recordScorecard: insights.recordScorecard,
    collectRootTokens: insights.collectRootTokens,
    buildGotchasBanner: insights.buildGotchasBanner,
    verifyProcedureLimits: limitGate.verifyProcedureLimits,
    renderStatusline,
    syncConfig,
    updateConfig,
  };
}
