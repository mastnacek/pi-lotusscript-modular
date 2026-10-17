/**
 * agent_before_settle — verify-before-done KB gate.
 *
 * Soft counterpart of the edit-time hard gate (guards/guardKbBeforeEdit):
 * when a run mutated .lss/.dxl sources without a single kb_search on the
 * 'lotus-notes' MCP collection, inject ONE verification turn instead of
 * letting the agent settle. One-shot per run (`settleKbNudgeSent`) so a
 * stubborn model cannot loop forever; flags reset in beginRun() at
 * before_agent_start.
 *
 * Model-facing text stays English (language policy, SKILL.md §6).
 */

import type { AgentBeforeSettleEventResult } from "@earendil-works/pi-coding-agent";
import type { PluginState } from "../../shared/state.js";

export function handleAgentBeforeSettle(state: PluginState): AgentBeforeSettleEventResult | undefined {
  if (!state.config.verifyKbBeforeSettle) return undefined;
  if (!state.notesMutatedThisRun) return undefined;
  if (state.kbConsultedThisRun) return undefined;
  if (state.settleKbNudgeSent) return undefined;

  state.settleKbNudgeSent = true;
  state.telemetry.kbSettleNudges++;

  return {
    entries: [
      {
        type: "custom_message",
        customType: "lotusscript-kb-verify",
        display: false,
        content: [
          "VERIFY BEFORE DONE: this run modified LotusScript / DXL sources (.lss/.dxl) without consulting the 'lotus-notes' MCP knowledge base.",
          "Mandatory step now: call mcp__knowledge_base → tool 'kb_search', args: { collection: 'lotus-notes', query: '<the Notes API or topic you just used>' } and check the changes against the result (method and property names, constants, Domino 9.0.1 specifics).",
          "If the check reveals a mismatch, fix the code; otherwise confirm the verification briefly in the final answer.",
        ].join(" "),
      },
    ],
    continue: true,
  };
}
