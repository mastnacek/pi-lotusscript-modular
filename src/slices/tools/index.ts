/**
 * Model-facing tools (lotusscript_check / _gotchas / _scaffold / _library_audit).
 * Pure registration dispatch — tool implementations live in sibling files
 * (compile-tool.ts — historical name for the whole-file check tool,
 * gotchas-tool.ts, scaffold-tool.ts, audit-tool.ts) so each stays under the
 * plugin's per-file line limit. Cross-slice capabilities arrive via ToolsDeps,
 * wired by the composition root (VSA).
 *
 * The four model tools:
 * - lotusscript_check                 — whole-file 9.0.1 compiler oracle
 * - lotusscript_scaffold              — compliant .lss skeleton
 * - lotusscript_gotchas               — search / summary / add to the registry
 * - lotusscript_library_audit         — duplicated procedures → library candidates
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { PluginState } from "../../shared/state.js";
import type { ToolsDeps } from "./deps.js";
import { registerCompileTools } from "./compile-tool.js";
import { registerGotchasTool } from "./gotchas-tool.js";
import { registerScaffoldTool } from "./scaffold-tool.js";
import { registerAuditTool } from "./audit-tool.js";

export function registerModelTools(pi: ExtensionAPI, state: PluginState, deps: ToolsDeps): void {
  registerCompileTools(pi, state, deps);
  registerGotchasTool(pi, state, deps);
  registerScaffoldTool(pi, state, deps);
  registerAuditTool(pi, state, deps);
}