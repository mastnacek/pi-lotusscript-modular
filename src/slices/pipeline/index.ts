/**
 * Pipeline — translates Pi tool_call / tool_result / agent_settled events into
 * slice operations. Barrel module: the implementations live in sibling files
 * (tool-call.ts, tool-result.ts, settled.ts, guidelines.ts) so each stays
 * under the plugin's own per-file line limit. Cross-slice capabilities arrive
 * via PipelineDeps / SettledDeps, wired by the composition root (VSA).
 */

export { handleToolCall } from "./tool-call.js";
export { handleToolResult } from "./tool-result.js";
export { handleAgentSettled, type SettledDeps } from "./settled.js";
export { buildPromptGuidelines } from "./guidelines.js";
export type { PipelineDeps } from "./deps.js";