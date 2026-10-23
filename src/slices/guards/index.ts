/**
 * Instant-failure guards: the KB edit gate. Pure functions — no session state.
 *
 * There are no plugin-maintained files to protect any more: with the modular
 * workflow gone, nothing is generated behind the agent's back, so only the
 * mandatory knowledge-base gate remains.
 */

import { isLotusScriptOrDxl } from "../../shared/paths.js";

/** Minimal shape the pipeline needs to reject a tool call. */
export interface GuardBlock {
  block: true;
  reason: string;
}

/**
 * HARD GATE: blocks edit/write of LotusScript sources (.lss / .dxl) until the
 * 'lotus-notes' MCP knowledge base has been queried this session (kb_search).
 * Turns the "MANDATORY KB CHECK" prompt guideline into actual enforcement.
 */
export function guardKbBeforeEdit(guardPath: string, kbConsulted: boolean, enforce: boolean): GuardBlock | null {
  if (!enforce || kbConsulted) return null;
  if (!isLotusScriptOrDxl(guardPath)) return null;

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
