/**
 * PluginState — session-scoped kernel shared by the composition root and the
 * pipeline/commands/tools slices. Owns all mutable closure state that used to
 * live inside the extension factory, plus the derived helpers (scorecards,
 * pre-flight banners, procedure-limit gate, statusline).
 *
 * Every session creates one state via `createPluginState()`; nothing here is
 * global, so concurrent/mocked extension registrations stay isolated.
 *
 * Heavy helpers live in a sibling module (state-insights.ts) — this file stays
 * the composition kernel.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  AgentScorecard,
  HookName,
  HookTelemetry,
  LspCheckResult,
  ModularConfig,
} from "./types.js";
import { DEFAULT_CONFIG, loadConfig, saveConfig } from "./config.js";
import { stringsFor } from "./i18n.js";
import { createStateInsights } from "./state-insights.js";
import {
  createTelemetry,
  renderTelemetryPanel as renderTelemetryPanelWidget,
} from "./state-telemetry.js";

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
  /** Absolute path of the file the current run last ran a whole-file check on. */
  lastCheckedFile: string | null;
  readonly scoreHistory: Map<string, AgentScorecard[]>;
  readonly preflightBannerCache: Map<string, string>;
  readonly pendingDebriefs: string[];
  readonly diagnosticHistory: Map<string, string[][]>;
  readonly recurringGotchaReported: Set<string>;
  /** Canonical VERZE/CHANGELOG block last seen per file (versioning baseline). */
  readonly versionHeaders: Map<string, string>;
  /** Files already nudged about versioning in the current run. */
  readonly versioningNudged: Set<string>;
  /** Files already nudged about library drift in the current run. */
  readonly driftNudged: Set<string>;
  /** Checkpoints already shown in the chat this session (trace dedupe). */
  readonly traceEmitted: Set<string>;
  /** Icons of shown checkpoints, rendered as a statusline suffix. */
  readonly traceTags: string[];
  /** True once any knowledge-base search tool ran this session (KB edit gate). */
  kbConsulted: boolean;
  /** Queries sent to the knowledge base in the current run (plural KB verification). */
  readonly kbQueriesThisRun: string[];
  /** Record a kb_search query observed in tool_call. */
  recordKbQuery(query: string): void;
  /** True once an edit/write succeeded on a .lss/.dxl source in the current run. */
  notesMutatedThisRun: boolean;
  /** One-shot latch: the settle verification turn was already injected for this run. */
  settleKbNudgeSent: boolean;
  /** Reset per-run flags at before_agent_start. */
  beginRun(): void;
  /** Live session counters for the in-TUI telemetry panel. */
  readonly telemetry: HookTelemetry;

  // --- helpers ---
  buildScorecard(
    filePath: string,
    opts: {
      lsp: LspCheckResult | null;
    }
  ): AgentScorecard;
  recordScorecard(filePath: string, scorecard: AgentScorecard): AgentScorecard | undefined;
  collectFileTokens(filePath: string): string[];
  buildGotchasBanner(filePath: string): string;
  renderStatusline(state: "idle" | "checking" | "clean" | "error"): void;
  /** Count a hook invocation and refresh the telemetry panel. */
  countHook(name: HookName): void;
  /** Re-apply the telemetry widget (config toggles, manual refresh). */
  renderTelemetryPanel(): void;
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
  let lastCheckedFile: string | null = null;

  const scoreHistory = new Map<string, AgentScorecard[]>();
  const preflightBannerCache = new Map<string, string>();
  const pendingDebriefs: string[] = [];
  const diagnosticHistory = new Map<string, string[][]>();
  const recurringGotchaReported = new Set<string>();
  const versionHeaders = new Map<string, string>();
  const versioningNudged = new Set<string>();
  const driftNudged = new Set<string>();
  const traceEmitted = new Set<string>();
  const traceTags: string[] = [];
  let kbConsulted = false;
  const kbQueriesThisRun: string[] = [];
  let notesMutatedThisRun = false;
  let settleKbNudgeSent = false;
  const telemetry = createTelemetry();

  // Extracted helper groups (scorecards/gotchas banner, procedure-limit gate).
  const insights = createStateInsights({
    getConfig: () => config,
    getKbSearchCount: () => kbQueriesThisRun.length,
    renderStatusline,
    setLatestScorecard: (sc) => {
      latestScorecard = sc;
    },
    scoreHistory,
    preflightBannerCache,
  });

  function renderStatusline(state: "idle" | "checking" | "clean" | "error" = "idle"): void {
    if (!latestUiContext || !latestUiContext.hasUI || !latestUiContext.ui?.theme) return;
    const theme = latestUiContext.ui.theme;
    const sl = stringsFor(config.lang).statusline;
    const scoreBadge = latestScorecard ? ` [${latestScorecard.score}/${latestScorecard.max}]` : "";

    if (state === "checking") {
      latestUiContext.ui.setStatus(
        "lotusscript",
        theme.fg("warning", sl.checking(scoreBadge))
      );
      return;
    }

    if (state === "clean") {
      latestUiContext.ui.setStatus(
        "lotusscript",
        theme.fg("success", sl.clean(scoreBadge))
      );
      return;
    }

    if (state === "error") {
      latestUiContext.ui.setStatus(
        "lotusscript",
        theme.fg("error", sl.error(scoreBadge))
      );
      return;
    }

    // Default / idle state — the trace tail shows which checkpoints have fired.
    const icon = theme.fg("accent", `🪷 LS${scoreBadge}`);
    const flags = theme.fg("dim", ` (LSP:${config.enableLsp ? "on" : "off"})`);
    latestUiContext.ui.setStatus("lotusscript", icon + flags + traceTailText());
  }

  /** Stable icon sequence of the checkpoints already shown (no slice import). */
  function traceTailText(): string {
    const order = ["🧩", "📄", "📝", "🔍", "🔖", "🧱", "🚧", "🏁"];
    const present = order.filter((i) => traceTags.includes(i));
    return present.length > 0 ? " " + present.join("") : "";
  }

  function syncConfig(cwd: string): void {
    activeCwd = cwd;
    config = loadConfig(cwd);
    kbConsulted = false; // new session → KB consult gate re-arms
    Object.assign(telemetry, createTelemetry()); // session-scoped counters reset
  }

  function countHook(name: HookName): void {
    telemetry.hookCalls[name]++;
    renderTelemetryPanel();
  }

  function renderTelemetryPanel(): void {
    renderTelemetryPanelWidget(latestUiContext, () => telemetry, () => config);
  }

  function updateConfig(newConfig: ModularConfig, isGlobal = false, cwd?: string): void {
    config = newConfig;
    saveConfig(cwd || activeCwd, config, isGlobal);
    renderStatusline("idle");
    renderTelemetryPanel(); // showTelemetryPanel may have been toggled
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
    get lastCheckedFile() {
      return lastCheckedFile;
    },
    set lastCheckedFile(filePath: string | null) {
      lastCheckedFile = filePath;
    },
    scoreHistory,
    preflightBannerCache,
    pendingDebriefs,
    diagnosticHistory,
    recurringGotchaReported,
    versionHeaders,
    versioningNudged,
    driftNudged,
    traceEmitted,
    traceTags,
    get kbConsulted() {
      return kbConsulted;
    },
    set kbConsulted(v: boolean) {
      kbConsulted = v;
    },
    kbQueriesThisRun,
    recordKbQuery(query: string) {
      kbQueriesThisRun.push(query);
    },
    get notesMutatedThisRun() {
      return notesMutatedThisRun;
    },
    set notesMutatedThisRun(v: boolean) {
      notesMutatedThisRun = v;
    },
    get settleKbNudgeSent() {
      return settleKbNudgeSent;
    },
    set settleKbNudgeSent(v: boolean) {
      settleKbNudgeSent = v;
    },
    beginRun() {
      kbQueriesThisRun.length = 0;
      notesMutatedThisRun = false;
      settleKbNudgeSent = false;
      lastCheckedFile = null;
      // The header baseline survives across runs; only the once-per-run nudge resets.
      versioningNudged.clear();
      driftNudged.clear();
    },
    telemetry,
    buildScorecard: insights.buildScorecard,
    recordScorecard: insights.recordScorecard,
    collectFileTokens: insights.collectFileTokens,
    buildGotchasBanner: insights.buildGotchasBanner,
    renderStatusline,
    countHook,
    renderTelemetryPanel,
    syncConfig,
    updateConfig,
  };
}
