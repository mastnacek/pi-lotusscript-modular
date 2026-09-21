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
}

export interface ProcedureLintItem {
  fileName: string;
  procedureName: string;
  lineCount: number;
  maxLines: number;
  isExceeded: boolean;
  hasDocComment: boolean;
  commentNotice?: string;
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
