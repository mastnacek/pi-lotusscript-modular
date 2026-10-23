/**
 * Instant-failure guards: protected plugin-maintained files and the KB edit
 * gate. Pure functions — no session state.
 *
 * The monolith content-dump guard was removed deliberately: it blocked
 * legitimate `grep`/`cat` inspection of `.lss` sources, and reading a whole
 * script is now a normal, agent-managed choice rather than something the
 * extension must prevent.
 */

import path from "node:path";
import { findModularRoot } from "../../shared/paths.js";

/** Minimal shape the pipeline needs to reject a tool call. */
export interface GuardBlock {
  block: true;
  reason: string;
}

export function guardProtectedFiles(guardPath: string): GuardBlock | null {
  const guardBase = path.basename(guardPath).toLowerCase();
  const guardRoot = findModularRoot(guardPath);

  if (guardRoot && guardBase === "main.lss") {
    return {
      block: true,
      reason:
        "INSTANT FAILURE: 'main.lss' is a synthetic index of '%pi-import' directives that the extension regenerates from manifest.json on every compile, so your edit would be discarded. Edit the individual 'sub_*.lss' / 'func_*.lss' files instead.",
    };
  }

  if (guardRoot && guardBase === "manifest.json") {
    return {
      block: true,
      reason:
        "INSTANT FAILURE: 'manifest.json' is auto-synced from the files on disk on every compile. Create or delete the 'sub_*.lss' / 'func_*.lss' file instead — the manifest follows automatically.",
    };
  }

  if (/_compiled\.lss$/i.test(guardPath)) {
    return {
      block: true,
      reason:
        "INSTANT FAILURE: '*_compiled.lss' is a generated artifact that every compile overwrites. Edit the modular source files; the extension recompiles automatically.",
    };
  }

  return null;
}

/**
 * HARD GATE: blocks edit/write of LotusScript sources (.lss / .dxl) until the
 * 'lotus-notes' MCP knowledge base has been queried this session (kb_search).
 * Turns the "MANDATORY KB CHECK" prompt guideline into actual enforcement.
 */
export function guardKbBeforeEdit(guardPath: string, kbConsulted: boolean, enforce: boolean): GuardBlock | null {
  if (!enforce || kbConsulted) return null;
  if (!/\.(lss|dxl)$/i.test(guardPath)) return null;

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
