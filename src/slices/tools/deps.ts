/**
 * ToolsDeps — the slice-isolation seam for the model-tools slice.
 *
 * Slices never import each other (VSA, pi-plugin-dev §6); the composition
 * root (index.ts) is the only multi-slice importer. The tool registrations
 * reach sibling slices (parser / lsp / gotchas / scaffold) only through
 * this object. Types are structural on purpose.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  GotchaItem,
  GotchaReviewResult,
  LspCheckResult,
} from "../../shared/types.js";
import type { Strings } from "../../shared/i18n.js";
export interface AuditResultFull {
  markdown: string;
  duplicates: number;
  files: number;
}

export interface ScaffoldOptionsFull {
  type: string;
  name: string;
  targetDir?: string;
  purpose?: string;
  author?: string;
  isFunction?: boolean;
  parentAgent?: string;
  returnType?: string;
  params?: string;
  date?: string;
  /** `designer` renders the paste-ready variant without `Const LSI_THREAD_*`. */
  target?: string;
}

export interface ScaffoldResultFull {
  ok: boolean;
  type: string;
  createdFiles: string[];
  message: string;
  alias?: string;
  noticeCs?: string;
  noticeEn?: string;
}

export interface ToolsDeps {
  // lsp slice
  checkLotusScriptDiagnostics(filePath: string): Promise<LspCheckResult>;
  // lsp slice — automation lane (SPAI-008)
  explainLotusScriptCodes(diagnosticsText: string): Promise<string>;
  // gotchas slice
  searchGotchas(query: string, limit?: number): GotchaItem[];
  getGotchasSummary(limit?: number): string;
  addGotcha(title: string, body: string): GotchaItem;
  promptGotchaReview(
    ctx: ExtensionContext,
    title: string,
    body: string,
    strings?: Strings
  ): Promise<GotchaReviewResult>;
  // scaffold slice
  scaffoldLotusScriptArtifact(options: ScaffoldOptionsFull): ScaffoldResultFull;
  /** Duplicate-procedure audit for one folder; `plan` appends the migration plan. */
  auditLibraries(dir: string, lang: string, plan: boolean): AuditResultFull;
  /** Localized user-facing copy for notify() sinks (i18n via the seam). */
  strings(lang?: string): Strings;
}