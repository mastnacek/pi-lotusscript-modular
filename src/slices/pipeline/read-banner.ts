/**
 * Read banner — injected into tool results when the model reads a LotusScript
 * file. Split out of pipeline/tool-result.ts for the per-file limit.
 *
 * The file IS the script: there is no index, no parts and nothing to assemble,
 * so the banner only adds orientation (LSP state, KB protocol) and the
 * pre-flight gotchas matching this file's own identifiers.
 */

import type { ToolResultEvent } from "@earendil-works/pi-coding-agent";
import type { PluginState } from "../../shared/state.js";
import type { ToolResultEventResultShape } from "./shared.js";

/** Injects the whole-file read banner (with the gotchas banner) into a .lss read. */
export function readBanner(
  state: PluginState,
  event: ToolResultEvent,
  filePath: string
): ToolResultEventResultShape {
  const gotchasBanner = state.buildGotchasBanner(filePath);

  const notice = [
    "",
    "---",
    "📄 [LotusScript Whole Script]",
    `- File: ${filePath}`,
    "",
    "ℹ️ This single file is the whole module: options/declarations at the top, then",
    "  every Sub/Function. Module scope is flat — scan the declarations section",
    "  before editing any procedure.",
    `  (LSP validation: ${state.config.enableLsp ? "ENABLED" : "DISABLED"})`,
    "",
    "🚨 MANDATORY KB CHECK (AGENTS.md):",
    "  Query 'lotus-notes' MCP collection before writing code:",
    "  mcp__knowledge_base -> tool: 'kb_search', args: { collection: 'lotus-notes', query: '<API or topic>' }",
    suggestedKbQueries(state.collectFileTokens(filePath)),
    gotchasBanner,
    "---",
  ].join("\n");

  return {
    content: [...event.content, { type: "text", text: notice }],
  };
}

/**
 * Proactive KB queries derived from the file's own declarations: only
 * Notes object-model identifiers (NotesSession, NotesDocument, …) make good
 * KB topics — procedure names and domain variables are noise. Empty string
 * when nothing matches, so the banner stays compact for formula-only agents.
 */
export function suggestedKbQueries(fileTokens: string[]): string {
  const apiTokens = fileTokens.filter((t) => /^Notes[A-Z]/.test(t)).slice(0, 3);
  if (apiTokens.length === 0) return "";
  const lines = [
    "",
    "💡 SUGGESTED KB QUERIES FOR THIS FILE (run these before editing):",
    ...apiTokens.map(
      (t) => `  kb_search(collection: 'lotus-notes', query: '${t}')`
    ),
  ];
  return lines.join("\n");
}
