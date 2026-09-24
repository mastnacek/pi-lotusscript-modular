/**
 * Model-facing tools (lotusscript_compile / _decompile / _gotchas / _scaffold).
 * Pure registration dispatch — tool implementations live in sibling files
 * (compile-tool.ts, gotchas-tool.ts, scaffold-tool.ts) so each stays under the
 * plugin's per-file line limit.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { PluginState } from "../../shared/state.js";
import { registerCompileDecompileTools } from "./compile-tool.js";
import { registerGotchasTool } from "./gotchas-tool.js";
import { registerScaffoldTool } from "./scaffold-tool.js";

export function registerModelTools(pi: ExtensionAPI, state: PluginState): void {
  registerCompileDecompileTools(pi, state);
  registerGotchasTool(pi, state);
  registerScaffoldTool(pi, state);
}