/**
 * tool_call interception — instant-failure guards only (protected files, KB edit
 * gate). Split out of pipeline/index.ts for the per-file line limit.
 *
 * LotusScript reads are not intercepted here: reading a monolithic `.lss`/`.dxl`
 * returns the file as it is (the decompiler was removed on 2026-10-23).
 *
 * Cross-slice capabilities (guards) arrive via PipelineDeps wired in the
 * composition root — slices never import each other (VSA).
 */

import path from "node:path";
import type { ToolCallEvent, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import type { PipelineDeps } from "./deps.js";
import type { PluginState } from "../../shared/state.js";

export function handleToolCall(state: PluginState, event: ToolCallEvent, deps: PipelineDeps): ToolCallEventResult | undefined {
  const rawName = event.toolName || "";
  const base = rawName.includes("__") ? rawName.split("__").pop()! : rawName;

  // KB consult tracking: any knowledge-base search tool satisfies the edit gate
  // for the rest of the session (recorded before any early return below).
  if (/kb_search|knowledge_base/i.test(rawName) || /kb_search|knowledge_base/i.test(base)) {
    state.kbConsulted = true;
    const kbInput = event.input as Record<string, unknown> | undefined;
    state.recordKbQuery(typeof kbInput?.query === "string" ? kbInput.query : "");
    state.telemetry.kbSearches++;
  }

  const input = event.input as Record<string, unknown> | undefined;
  const pathKey =
    input && typeof input.path === "string"
      ? "path"
      : input && typeof input.file === "string"
        ? "file"
        : null;

  // --- Instant-failure guards (edit/write only) ---
  if ((base === "edit" || base === "write") && input && pathKey) {
    const guardPath = path.resolve(input[pathKey] as string);
    const guard = deps.guardProtectedFiles(guardPath);
    if (guard) {
      state.telemetry.protectedBlocks++;
      return guard;
    }
    // HARD GATE: .lss/.dxl edits require a lotus-notes KB query first.
    const kbGuard = deps.guardKbBeforeEdit(guardPath, state.kbConsulted, state.config.enforceKbGate);
    if (kbGuard) {
      state.telemetry.kbGateBlocks++;
      return kbGuard;
    }
  }
}
