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
  const done = state.kbQueriesThisRun.length;
  const required = state.config.minKbSearchesPerRun;
  if (done >= required) return undefined;
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
          `VERIFY BEFORE DONE: this run modified LotusScript / DXL sources (.lss/.dxl) but made only ${done}/${required} required kb_search calls on the 'lotus-notes' MCP collection.`,
          `Mandatory step now: run the remaining ${required - done} kb_search call(s) (mcp__knowledge_base → kb_search, collection='lotus-notes') so the run covers every layer — one query for the exact API members used (IBM reference), one for the performance/design angle (Guirard book: formulas ch.4, views ch.6, code ch.7), and when fixing an error one with the exact error text (community layer).`,
          "Check the changes against the results: method/property names and constants, error handling (On Error coverage), object state (Set ... = Nothing, processed vs unprocessed documents) and performance (lookup cache modes, view access patterns).",
          "If a check reveals a mismatch, fix the code; otherwise confirm the verification briefly in the final answer.",
        ].join(" "),
      },
    ],
    continue: true,
  };
}
