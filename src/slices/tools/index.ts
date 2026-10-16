/**
 * Model-facing tools (lotusscript_compile / _decompile / _gotchas / _scaffold).
 * Pure registration dispatch — tool implementations live in sibling files
 * (compile-tool.ts, gotchas-tool.ts, scaffold-tool.ts) so each stays under the
 * plugin's per-file line limit. Cross-slice capabilities arrive via ToolsDeps,
 * wired by the composition root (VSA).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { PluginState } from "../../shared/state.js";
import type { ToolsDeps } from "./deps.js";
import { registerCompileDecompileTools } from "./compile-tool.js";
import { registerGotchasTool } from "./gotchas-tool.js";
import { registerScaffoldTool } from "./scaffold-tool.js";

export function registerModelTools(pi: ExtensionAPI, state: PluginState, deps: ToolsDeps): void {
  registerCompileDecompileTools(pi, state, deps);
  registerGotchasTool(pi, state, deps);
  registerScaffoldTool(pi, state, deps);
}