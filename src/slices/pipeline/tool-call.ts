/**
 * tool_call interception — instant-failure guards (protected files, KB edit
 * gate), monolith dump guard, and read-time auto-decompilation redirect.
 * Split out of pipeline/index.ts for the per-file line limit.
 */

import path from "node:path";
import fs from "node:fs";
import type { ToolCallEvent, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { AgentParser } from "../parser/index.js";
import {
  MUTATING_TOOL_NAMES,
  SHELL_LIKE_TOOL_NAMES,
  collectShellLikeSources,
  guardKbBeforeEdit,
  guardMonolithDump,
  guardProtectedFiles,
} from "../guards/index.js";
import * as paths from "../../shared/paths.js";
import type { PluginState } from "../../shared/state.js";

// 1. Tool Call Interception (Auto-decompile on Read/Inspect or redirect to existing modular dir)
export function handleToolCall(state: PluginState, event: ToolCallEvent): ToolCallEventResult | undefined {
  const rawName = event.toolName || "";
  const base = rawName.includes("__") ? rawName.split("__").pop()! : rawName;

  // KB consult tracking: any knowledge-base search tool satisfies the edit gate
  // for the rest of the session (recorded before any early return below).
  if (/kb_search|knowledge_base/i.test(rawName) || /kb_search|knowledge_base/i.test(base)) {
    state.kbConsulted = true;
  }

  const input = event.input as Record<string, unknown> | undefined;
  const pathKey =
    input && typeof input.path === "string"
      ? "path"
      : input && typeof input.file === "string"
        ? "file"
        : null;

  // --- Instant-failure guards (edit/write only; independent of autoDecompileOnRead) ---
  if ((base === "edit" || base === "write") && input && pathKey) {
    const guardPath = path.resolve(input[pathKey] as string);
    const guard = guardProtectedFiles(guardPath);
    if (guard) return guard;
    // HARD GATE: .lss/.dxl edits require a lotus-notes KB query first.
    const kbGuard = guardKbBeforeEdit(guardPath, state.kbConsulted, state.config.enforceKbGate);
    if (kbGuard) return kbGuard;
  }

  if (!state.config.autoDecompileOnRead) return;
  if (MUTATING_TOOL_NAMES.has(base)) return;

  // --- Shell / code-execution read guards (bash, ctx_execute, ctx_batch_execute) ---
  // These tools carry no top-level `path`, so the redirect below cannot see them.
  // Without this guard an agent can dump the whole monolithic file with
  // `cat tlacitko.lss | sed -n '1,400p'`, defeating auto-decompilation.
  if (SHELL_LIKE_TOOL_NAMES.has(base) && input) {
    const sources = collectShellLikeSources(input);
    for (const source of sources) {
      const guard = guardMonolithDump(source, state.activeCwd);
      if (guard) return guard;
    }
  }
  if (!input || !pathKey) return;

  const targetPath = input[pathKey] as string;
  if (!targetPath) return;

  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) return;

  const existingDir = paths.getExistingModularDir(resolved);
  if (existingDir) {
    state.readModularDirs.add(existingDir);
    input[pathKey] = path.join(existingDir, "main.lss");
    return;
  }

  if (paths.isMonolithicLss(resolved)) {
    try {
      const outDir = AgentParser.decompileLss(resolved);
      state.readModularDirs.add(outDir);
      input[pathKey] = path.join(outDir, "main.lss");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[LotusScript Modular] Auto-decompile LSS failed: ${msg}`);
    }
  } else if (paths.isMonolithicDxl(resolved)) {
    try {
      const outDir = AgentParser.decompileDxl(resolved);
      if (outDir) {
        state.readModularDirs.add(outDir);
        input[pathKey] = path.join(outDir, "main.lss");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[LotusScript Modular] Auto-decompile DXL failed: ${msg}`);
    }
  }
}
