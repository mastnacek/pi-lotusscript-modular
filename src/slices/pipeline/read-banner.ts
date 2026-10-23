/**
 * Read banner — injected into tool results when the model reads main.lss of a
 * modular agent. Split out of pipeline/tool-result.ts for the per-file limit.
 */

import type { ToolResultEvent } from "@earendil-works/pi-coding-agent";
import type { PluginState } from "../../shared/state.js";
import type { ToolResultEventResultShape } from "./shared.js";

/** Injects the modular-agent read banner (with gotchas banner) into a main.lss read. */
export function readBanner(
  state: PluginState,
  event: ToolResultEvent,
  modularRoot: string
): ToolResultEventResultShape {
  const gotchasBanner = state.buildGotchasBanner(modularRoot);

  const notice = [
    "",
    "---",
    "🧩 [LotusScript Modular Folder]",
    `- Modular root: ${modularRoot}`,
    "",
    "ℹ️ `main.lss` is an index of the parts, not the script itself.",
    "  The line count above is the index — never conclude the read was truncated.",
    "  The monolithic source is still on disk and is readable: use the `read` tool",
    "  with offset/limit, or `grep`, whenever the whole-file view is more useful.",
    "",
    "✅ HOW TO READ THE CODE:",
    "  1. Read '01_declarations.lss' first — global variables, constants, types, classes.",
    "  2. Then read only the specific 'sub_*.lss' / 'func_*.lss' file you need.",
    "     List them with the modular root above; each file is one procedure (~30-100 lines).",
    "  3. Edit those procedure files. Manifest sync + recompile run at settle time.",
    `  (LSP validation: ${state.config.enableLsp ? "ENABLED" : "DISABLED"})`,
    `  (Overwrite original .lss: ${state.config.overwriteSourceLss ? "ENABLED" : "DISABLED"})`,
    "",
    "🚨 MANDATORY KB CHECK (AGENTS.md):",
    "  Query 'lotus-notes' MCP collection before writing code:",
    "  mcp__knowledge_base -> tool: 'kb_search', args: { collection: 'lotus-notes', query: '<API or topic>' }",
    suggestedKbQueries(state.collectRootTokens(modularRoot)),
    gotchasBanner,
    "---",
  ].join("\n");

  return {
    content: [...event.content, { type: "text", text: notice }],
  };
}

/**
 * Proactive KB queries derived from the agent's own declarations: only
 * Notes object-model identifiers (NotesSession, NotesDocument, …) make good
 * KB topics — procedure names and domain variables are noise. Empty string
 * when nothing matches, so the banner stays compact for formula-only agents.
 */
export function suggestedKbQueries(rootTokens: string[]): string {
  const apiTokens = rootTokens.filter((t) => /^Notes[A-Z]/.test(t)).slice(0, 3);
  if (apiTokens.length === 0) return "";
  const lines = [
    "",
    "💡 SUGGESTED KB QUERIES FOR THIS AGENT (run these before editing):",
    ...apiTokens.map(
      (t) => `  kb_search(collection: 'lotus-notes', query: '${t}')`
    ),
  ];
  return lines.join("\n");
}