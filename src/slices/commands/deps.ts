/**
 * CommandsDeps — the slice-isolation seam for the commands slice.
 *
 * Slices never import each other (VSA, pi-plugin-dev §6); the composition
 * root (index.ts) is the only multi-slice importer. Everything the /ls
 * subcommand handlers need from sibling slices arrives through this object,
 * wired in the root. Types are structural on purpose: even `import type`
 * into another slice trips the slice-isolation invariant.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
  AgentScorecard,
  FolderLintResult,
  GotchaItem,
  GotchaReviewResult,
  LspCheckResult,
  ModularConfig,
  SettingsCompletion,
} from "../../shared/types.js";
import type { Strings } from "../../shared/i18n.js";

export interface SettingSpecLite {
  key: keyof ModularConfig;
  kind: "boolean" | "number" | "string";
}

export type ParseValueResult =
  | { ok: true; value: boolean | number | string }
  | { ok: false; error: string };

export interface SettingCopyLite {
  description: string;
  on?: string;
  off?: string;
}

export interface CompileOptionsLite {
  keepTimestamp?: boolean;
  overwriteSourceLss?: boolean;
  createLssForDxl?: boolean;
  deleteModularDir?: boolean;
}

export interface ScaffoldOptionsLite {
  type: string;
  name: string;
  targetDir?: string;
}

export interface ScaffoldResultLite {
  message: string;
  noticeCs?: string;
  noticeEn?: string;
  createdFiles: string[];
}

export interface CommandsDeps {
  // settings slice
  completeLsArguments(prefix: string, current: ModularConfig): SettingsCompletion[] | null;
  findSetting(key: string): SettingSpecLite | undefined;
  parseValue(spec: SettingSpecLite, raw: string, lang?: string): ParseValueResult;
  formatValue(val: unknown): string;
  settingCopy(key: string, lang?: string): SettingCopyLite;
  // gotchas slice
  getEffectiveGotchasPath(): string;
  getGotchasSummary(limit?: number): string;
  searchGotchas(query: string, limit?: number): GotchaItem[];
  addGotcha(title: string, body: string): GotchaItem;
  promptGotchaReview(
    ctx: ExtensionContext,
    title: string,
    body: string,
    strings?: Strings
  ): Promise<GotchaReviewResult>;
  // parser slice
  compileAgent(targetDirOrFile: string, options?: CompileOptionsLite): string;
  decompileLss(lssPath: string): string;
  decompileDxl(dxlPath: string): string | null;
  // lsp slice
  checkLotusScriptDiagnostics(filePath: string): Promise<LspCheckResult>;
  // linter slice
  lintModularFolder(folderPath: string, maxLines?: number, checkComments?: boolean): FolderLintResult;
  // scorecard slice
  formatScorecard(current: AgentScorecard, previous?: AgentScorecard): string;
  // scaffold slice
  scaffoldLotusScriptArtifact(options: ScaffoldOptionsLite): ScaffoldResultLite;
}
