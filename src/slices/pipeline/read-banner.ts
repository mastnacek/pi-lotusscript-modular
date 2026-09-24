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
    "🧩 [LotusScript Modular Agent Detected — READ THIS BEFORE ACTING]",
    `- Modular root: ${modularRoot}`,
    "",
    "⚠️ THE CONTENT ABOVE IS COMPLETE, NOT TRUNCATED.",
    "  You requested the monolithic .lss/.dxl. The extension intercepted the request,",
    "  split the file into a modular folder, and returned this '%pi-import' index instead.",
    "  The line count above is the index — NOT the size of the original script.",
    "  Never conclude the read failed, was cut short, or is a 'stub'.",
    "",
    "⛔ DO NOT read the monolithic file through bash or code-execution tools.",
    "  Forbidden: cat / sed / head / tail / more / less / Get-Content / python / node",
    "  / any other content dump targeting the original '.lss' or '.dxl'.",
    "  Such calls are blocked, and reading the whole script would flood your context.",
    "",
    "✅ HOW TO READ THE CODE:",
    "  1. Read '01_declarations.lss' first — global variables, constants, types, classes.",
    "  2. Then read only the specific 'sub_*.lss' / 'func_*.lss' file you need.",
    "     List them with the modular root above; each file is one procedure (~30-100 lines).",
    "  3. Edit those procedure files. Manifest sync + recompile are automatic.",
    `  (LSP validation: ${state.config.enableLsp ? "ENABLED" : "DISABLED"})`,
    `  (Overwrite original .lss: ${state.config.overwriteSourceLss ? "ENABLED" : "DISABLED"})`,
    "",
    "🚨 MANDATORY KB CHECK (AGENTS.md):",
    "  Query 'lotus-notes' MCP collection before writing code:",
    "  mcp__knowledge_base -> tool: 'kb_search', args: { collection: 'lotus-notes', query: '<API or topic>' }",
    gotchasBanner,
    "---",
  ].join("\n");

  return {
    content: [...event.content, { type: "text", text: notice }],
  };
}