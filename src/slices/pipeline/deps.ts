/**
 * PipelineDeps — the slice-isolation seam for the pipeline slice.
 *
 * Slices never import each other (VSA, pi-plugin-dev §6); the composition
 * root (index.ts) is the only multi-slice importer. Everything the
 * tool_call / tool_result / agent_settled / guideline handlers need from
 * sibling slices (parser, guards, lsp, scorecard, gotchas) arrives through
 * this object, wired in the root. Types are structural on purpose: even
 * `import type` into another slice trips the slice-isolation invariant.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  AgentScorecard,
  FolderLintResult,
  GotchaItem,
  GotchaReviewResult,
  LspCheckResult,
  ModularConfig,
} from "../../shared/types.js";
import type { Strings } from "../../shared/i18n.js";

/** Structural guard block (guards slice returns this shape). */
export interface GuardBlockLite {
  block: true;
  reason: string;
}

/** Structural compile options (no cross-slice type imports). */
export interface PipelineCompileOptions {
  keepTimestamp?: boolean;
  overwriteSourceLss?: boolean;
  createLssForDxl?: boolean;
  deleteModularDir?: boolean;
}

export interface PipelineDeps {
  // parser slice
  compileAgent(targetDirOrFile: string, options?: PipelineCompileOptions): string;
  // guards slice (constants exposed as sets; blocks are structural)
  /** Tools that mutate sources and must never be treated as a read. */
  readonly mutatingToolNames: ReadonlySet<string>;
  guardProtectedFiles(guardPath: string): GuardBlockLite | null;
  guardKbBeforeEdit(guardPath: string, kbConsulted: boolean, enforce: boolean): GuardBlockLite | null;
  // lsp slice
  checkLotusScriptDiagnostics(filePath: string): Promise<LspCheckResult>;
  // lsp slice — automation lane (SPAI-008): MCP is pull-only, so automatic
  // invocation of MCP-only features runs through these event-driven helpers
  explainLotusScriptCodes(diagnosticsText: string): Promise<string>;
  formatLotusScriptFile(filePath: string): Promise<string | null>;
  // scorecard slice
  formatScorecard(current: AgentScorecard, previous?: AgentScorecard): string;
  buildGradingRubric(config: ModularConfig): string;
  trendLabel(current: AgentScorecard, previous?: AgentScorecard): string;
  normalizeDiagnostics(diagnostics: string): string[];
  findRecurringSignatures(
    current: readonly string[],
    history: readonly (readonly string[])[],
    minCycles?: number
  ): string[];
  buildRecurringGotchaDraft(
    agent: string,
    signatures: readonly string[],
    editedFiles: readonly string[]
  ): { title: string; body: string };
  // gotchas slice
  addGotcha(title: string, body: string): GotchaItem;
  promptGotchaReview(
    ctx: ExtensionContext,
    title: string,
    body: string,
    strings?: Strings
  ): Promise<GotchaReviewResult>;
  /** Lint re-export used by the settled flow through PluginState (structural). */
  lintSignature?(folder: string, maxLines: number, checkComments: boolean): FolderLintResult;
}