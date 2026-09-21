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
  /** Enforce consulting lotus-notes MCP knowledge base */
  enforceKbPrompt: boolean;
  /** Automatically inject top LotusScript gotchas into system prompt */
  injectGotchasSummary: boolean;
  /** Enforce recording newly discovered LotusScript traps and gotchas */
  enforceGotchaCapture: boolean;
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
