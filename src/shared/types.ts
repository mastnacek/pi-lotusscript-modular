/**
 * Shared types for pi-lotusscript-modular.
 * Kernel types: no slice imports here.
 */

export interface ModularConfig {
  /** Run LotusScript LSP diagnostics check after compile */
  enableLsp: boolean;
  /** Automatically decompile monolithic .lss or .dxl files on read */
  autoDecompileOnRead: boolean;
  /** Automatically recompile on edits to modular procedure files */
  autoRecompileOnSave: boolean;
  /** Keep timestamped copy of compiled file (<Name>_<timestamp>_compiled.lss) */
  keepTimestampInCompiledName: boolean;
  /** Overwrite original .lss file with recompiled code (never touches .dxl) */
  overwriteSourceLss: boolean;
  /** Automatically clean up and delete decompiled folder when agent finishes modifications */
  cleanupOnSettled: boolean;
  /** Enforce consulting lotus-notes MCP knowledge base */
  enforceKbPrompt: boolean;
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
  /** Evaluate procedures with JEV model on OpenRouter for semantic comment & gotcha analysis */
  useJevEvaluation: boolean;
  /** Custom OpenRouter API key override (falls back to process.env.OPENROUTER_API_KEY or ~/.pi/agent/auth.json) */
  openrouterApiKey?: string;
  /** JEV model identifier on OpenRouter */
  jevModel: string;
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

export interface JevProcedureEval {
  fileName: string;
  procedureName: string;
  commentStyle: CommentStyle;
  styleCompliant: boolean;
  purposeQualityScore: number; // 0..2
  gotchaRiskScore: number; // 0..2 (0 = safe, 1 = warning, 2 = danger)
  summary: string;
  modelUsed: string;
  costUsd?: number;
}

export interface JevFolderEvalResult {
  ok: boolean;
  newStyleCount: number;
  oldStyleCount: number;
  mixedStyleCount: number;
  uncommentedCount: number;
  procedures: JevProcedureEval[];
  averageQuality: number;
  maxGotchaRisk: number;
  totalCostUsd: number;
  summary: string;
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
  jev?: JevFolderEvalResult | null;
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

export interface SettingsCompletion {
  value: string;
  label: string;
  description: string;
}
