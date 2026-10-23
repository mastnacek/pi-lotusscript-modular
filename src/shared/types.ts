/**
 * Shared types for pi-lotusscript-modular.
 * Kernel types: no slice imports here.
 */

export interface ModularConfig {
  /** UI language for user-facing text (cs | en). Model-facing text stays English. */
  lang: string;
  /** Run LotusScript LSP diagnostics check after compile */
  enableLsp: boolean;
  /** Automatically recompile on edits to modular procedure files */
  autoRecompileOnSave: boolean;
  /** Auto-format the edited modular file via the LSP formatter before recompile (ASCII-only files) */
  autoFormatOnSave: boolean;
  /** Auto-attach lsp_explain help pages for new LSP error codes after a failed check */
  autoExplainLspCodes: boolean;
  /** Keep timestamped copy of compiled file (<Name>_<timestamp>_compiled.lss) */
  keepTimestampInCompiledName: boolean;
  /** Overwrite original .lss file with recompiled code (never touches .dxl) */
  overwriteSourceLss: boolean;
  /** Clean up (compile then delete) the modular folder when the agent finishes modifications */
  cleanupOnSettled: boolean;
  /** Enforce consulting lotus-notes MCP knowledge base (prompt guideline) */
  enforceKbPrompt: boolean;
  /** HARD GATE: reject edit/write of .lss/.dxl until kb_search on 'lotus-notes' was called this session */
  enforceKbGate: boolean;
  /** Before the agent settles, require a lotus-notes KB query in any run that mutated .lss/.dxl sources (one-shot verification turn) */
  verifyKbBeforeSettle: boolean;
  /** Minimum kb_search calls per run that touches LotusScript sources — one per KB layer (IBM reference, Guirard book, community/error text) */
  minKbSearchesPerRun: number;
  /** Automatically inject top LotusScript gotchas into system prompt */
  injectGotchasSummary: boolean;
  /** Enforce recording newly discovered LotusScript traps and gotchas */
  enforceGotchaCapture: boolean;
  /** Enforce checking procedure line limits and comments */
  checkProcedureLimits: boolean;
  /** Maximum lines allowed per individual subroutine or function */
  maxProcedureLines: number;
  /** Enforce concise Czech documentation comments on procedures */
  enforceCzechComments: boolean;
  /** Compute and inject a deterministic per-agent scorecard after every compile */
  enableScorecard: boolean;
  /** Inject the LotusScript Definition of Done + grading rubric into the system prompt */
  enforceGradingRubric: boolean;
  /** Replace the generic gotcha summary with traps matching this agent's own identifiers */
  injectPreflightGotchas: boolean;
  /** Auto-draft a gotcha when the same LSP diagnostic recurs across compile cycles */
  autoDraftRecurringGotchas: boolean;
  
  /** Custom OpenRouter API key override (falls back to process.env.OPENROUTER_API_KEY or ~/.pi/agent/auth.json) */
  
  /** Show the in-TUI telemetry panel (hook usage, reads, gate blocks, code length) above the editor */
  showTelemetryPanel: boolean;
}

/** Names of the pi event hooks this plugin subscribes to. */
export type HookName =
  | "session_start"
  | "turn_end"
  | "agent_settled"
  | "agent_before_settle"
  | "before_agent_start"
  | "tool_call"
  | "tool_result";

/**
 * Live session telemetry rendered by the in-TUI panel (`setWidget` aboveEditor).
 * Mutated by the pipeline handlers, read by the panel component on every frame —
 * never persisted, reset at each `session_start`.
 */
export interface HookTelemetry {
  /** Invocation count per subscribed hook. */
  hookCalls: Record<HookName, number>;
  /** kb_search calls observed this session (satisfies the KB edit gate). */
  kbSearches: number;
  
  /** Edit/write calls blocked until a KB query runs (enforceKbGate). */
  kbGateBlocks: number;
  /** agent_before_settle verification turns injected (mutated .lss/.dxl without a KB query in the run). */
  kbSettleNudges: number;
  /** Edits of protected files (main.lss / manifest.json / *_compiled.lss) blocked. */
  protectedBlocks: number;
  /** Edit-triggered recompiles of a modular root. */
  recompiles: number;
  /** Procedure count in the last recompiled folder (null before the first compile). */
  lastProcCount: number | null;
  /** Longest procedure line count (null before the first compile). */
  lastLongestProc: number | null;
  /** Last LSP outcome (null = LSP disabled or not run yet). */
  lastLspOk: boolean | null;
}

export type CommentStyle = "new" | "old" | "mixed" | "none";

export interface CommentAnalysis {
  style: CommentStyle;
  hasCzechPurpose: boolean;
  purposeText?: string;
  hasSyntheticHeader: boolean;
  hasLegacyBlock: boolean;
  legacyMarkers: string[];
  totalLines: number;
  commentLines: number;
  comments: string[];
}

export interface ScorecardItem {
  id: string;
  label: string;
  ok: boolean;
  weight: number;
  /** Item is not yet applicable (e.g. final artifact during mid-work compiles). */
  pending?: boolean;
  detail?: string;
}

export interface AgentScorecard {
  agent: string;
  score: number;
  max: number;
  items: ScorecardItem[];
  ts: string;
}

export interface ScorecardInput {
  agent: string;
  maxProcedureLines: number;
  lint: FolderLintResult;
  lsp: LspCheckResult | null;
  lspEnabled: boolean;
  enforceCzechComments: boolean;
  manifestSynced: boolean;
  artifact: "written" | "pending";
  /** KB verification is part of the DoD only when at least one KB enforcement toggle is on. */
  kbExpected: boolean;
  /** kb_search calls on the lotus-notes collection observed in the current run. */
  kbSearchCount: number;
  /** Required kb_search calls per run (config.minKbSearchesPerRun). */
  minKbSearches: number;
}

export interface ProcedureLintItem {
  fileName: string;
  procedureName: string;
  lineCount: number;
  maxLines: number;
  isExceeded: boolean;
  hasDocComment: boolean;
  commentNotice?: string;
  commentStyle?: CommentStyle;
}

export interface FolderLintResult {
  ok: boolean;
  exceededProcedures: ProcedureLintItem[];
  missingCommentProcedures: ProcedureLintItem[];
  allItems: ProcedureLintItem[];
}

export interface CodeBlock {
  event: string;
  code: string;
  kind: "options" | "declarations" | "procedure" | "initialize" | "terminate";
  fileName: string;
}

export interface AgentManifest {
  formatVersion: string;
  agentName: string;
  sourceDxl?: string;
  decompileTimestamp: string;
  compilationOrder: string[];
}

export interface LspCheckResult {
  ok: boolean;
  diagnostics: string;
  errorCount: number;
  warningCount: number;
}

export interface GotchaItem {
  id: string;
  title: string;
  body: string;
}

/** Outcome of the gotcha approval modal (defined in shared so cross-slice
 *  dependency contracts can name it without reaching into the gotchas slice). */
export type GotchaReviewResult =
  | { action: "save" }
  | { action: "cancel" }
  | { action: "rewrite"; instructions: string };

export interface SettingsCompletion {
  value: string;
  label: string;
  description: string;
}
