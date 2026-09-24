/**
 * Instant-failure guards: protected plugin-maintained files + monolith content
 * dumps through shell/code tools. Pure functions — no session state.
 */

import path from "node:path";
import {
  findMonolithicScriptReads,
  findModularRoot,
} from "../../shared/paths.js";

/** Tools that mutate agent sources and must not be auto-decompiled on read. */
export const MUTATING_TOOL_NAMES = new Set([
  "edit",
  "write",
  "lotusscript_compile",
  "lotusscript_decompile",
]);

/**
 * Tools that can read file CONTENT without exposing a `path` parameter, so the
 * read-time auto-decompile hook never sees them. Their command/code text must be
 * scanned for monolithic `.lss` / `.dxl` reads instead.
 */
export const SHELL_LIKE_TOOL_NAMES = new Set([
  "bash",
  "shell",
  "execute",
  "run",
  "ctx_execute",
  "ctx_execute_file",
  "ctx_batch_execute",
  "ctx_fetch_and_index",
  "ctx_index",
]);

/**
 * Extracts every free-text command/code fragment a shell-like tool would execute.
 * Handles bash (`command`), ctx_execute (`code`) and ctx_batch_execute (`commands[]`).
 */
export function collectShellLikeSources(input: Record<string, unknown> | undefined): string[] {
  if (!input) return [];
  const sources: string[] = [];

  if (typeof input.command === "string" && input.command) {
    sources.push(input.command);
  }
  if (typeof input.code === "string" && input.code) {
    sources.push(input.code);
  }
  if (Array.isArray(input.commands)) {
    for (const entry of input.commands) {
      if (typeof entry === "string" && entry) {
        sources.push(entry);
      } else if (entry && typeof entry === "object" && typeof (entry as { command?: unknown }).command === "string") {
        sources.push((entry as { command: string }).command);
      }
    }
  }

  return sources;
}

export interface GuardBlock {
  block: true;
  reason: string;
}

/**
 * Blocks edit/write to files the extension maintains itself:
 * `main.lss` (synthetic index), `manifest.json` (auto-synced),
 * `*_compiled.lss` (generated artifact).
 */
export function guardProtectedFiles(guardPath: string): GuardBlock | null {
  const guardBase = path.basename(guardPath).toLowerCase();
  const guardRoot = findModularRoot(guardPath);

  if (guardRoot && guardBase === "main.lss") {
    return {
      block: true,
      reason:
        "INSTANT FAILURE: 'main.lss' is a synthetic index of '%pi-import' directives that the extension regenerates from manifest.json on every compile, so your edit would be discarded. Edit the individual 'sub_*.lss' / 'func_*.lss' files instead.",
    };
  }

  if (guardRoot && guardBase === "manifest.json") {
    return {
      block: true,
      reason:
        "INSTANT FAILURE: 'manifest.json' is auto-synced from the files on disk on every compile. Create or delete the 'sub_*.lss' / 'func_*.lss' file instead — the manifest follows automatically.",
    };
  }

  if (/_compiled\.lss$/i.test(guardPath)) {
    return {
      block: true,
      reason:
        "INSTANT FAILURE: '*_compiled.lss' is a generated artifact that every compile overwrites. Edit the modular source files; the extension recompiles automatically.",
    };
  }

  return null;
}

/**
 * Blocks shell/code execution tools from dumping monolithic LotusScript
 * files into the context window (they bypass read-time auto-decompilation).
 */
export function guardMonolithDump(source: string, activeCwd: string): GuardBlock | null {
  const hits = findMonolithicScriptReads(source, activeCwd);
  if (hits.length === 0) return null;

  const hit = hits[0]!;
  const modularHint = hit.modularRoot
    ? `The decompiled folder already exists at '${hit.modularRoot}'. Read its '01_declarations.lss' first, then only the specific 'sub_*.lss' / 'func_*.lss' files you need.`
    : `Read the file with the 'read' tool instead — it auto-decompiles into a modular folder whose '01_declarations.lss' and 'sub_*.lss' / 'func_*.lss' files you can inspect selectively.`;

  return {
    block: true,
    reason: [
      `INSTANT FAILURE: you are dumping a monolithic LotusScript file ('${hit.referenced}') through a shell/code tool.`,
      "Shell and code-execution tools bypass read-time auto-decompilation, so the entire monolith (thousands of lines) would be loaded into the context window.",
      modularHint,
      "Do NOT retry this command with cat / sed / head / tail / more / Get-Content / python / node or any other content dump.",
    ].join(" "),
  };
}

/**
 * HARD GATE: blocks edit/write of LotusScript sources (.lss / .dxl) until the
 * 'lotus-notes' MCP knowledge base has been queried this session (kb_search).
 * Turns the "MANDATORY KB CHECK" prompt guideline into actual enforcement.
 */
export function guardKbBeforeEdit(guardPath: string, kbConsulted: boolean, enforce: boolean): GuardBlock | null {
  if (!enforce || kbConsulted) return null;
  if (!/\.(lss|dxl)$/i.test(guardPath)) return null;

  return {
    block: true,
    reason: [
      "KB GATE: you are editing LotusScript/DXL source, but the 'lotus-notes' MCP knowledge base has NOT been queried this session (AGENTS.md mandatory rule).",
      "Do NOT retry this edit unchanged — it will be rejected again.",
      "Mandatory step first: call the knowledge base search for the API/topic you are about to use:",
      "  mcp__knowledge_base → tool 'kb_search', args: { collection: 'lotus-notes', query: '<API or topic>' }",
      "Then re-run this edit.",
    ].join(" "),
  };
}
