/**
 * Prompt guidelines (before_agent_start injection) — verbatim rule strings.
 * Split out of pipeline/index.ts for the per-file line limit.
 *
 * The grading rubric comes from the scorecard slice via PipelineDeps wired in
 * the composition root — slices never import each other (VSA). All text here
 * is model-facing and stays English (pi-plugin-dev §10).
 */

import type { ModularConfig } from "../../shared/types.js";
import type { PipelineDeps } from "./deps.js";

export function buildPromptGuidelines(config: ModularConfig, deps: PipelineDeps): string[] {
  const guidelines: string[] = [];

  if (config.enforceKbPrompt) {
    guidelines.push(
      [
        "MANDATORY LOTUSSCRIPT / NOTES 9.0.1 KB PROTOCOL: Before writing or editing LotusScript / @formula code you MUST query the 'lotus-notes' MCP collection (mcp__knowledge_base → kb_search, collection='lotus-notes'). Never guess API members, constants, or runtime behaviour — Notes 9.0.1 rules are strict.",
        `Always run at least ${config.minKbSearchesPerRun} kb_search calls per task, balanced across the layers — pick the layer matching each question:`,
        "- API signature / member / constant → query the exact member name (IBM Designer 9.0.1 reference, doc_* layer).",
        "- Performance (lookups, view rebuilds, document loops, full-text search) → query the topic together with 'Guirard' (book layer: formulas ch.4, views ch.6, code ch.7).",
        "- Compile/runtime error → query the exact error text (community articles layer).",
        "Quality bar for every change: On Error handling at each entry point; explicit object state (Set ... = Nothing after use; processed vs unprocessed documents inside agents); @DbLookup/@DbColumn never default to NoCache without a stated reason; prefer view.GetAllDocumentsByKey over hand-rolled document loops.",
      ].join(" ") +
        (config.enforceKbGate
          ? " This is ENFORCED: edit/write calls on .lss/.dxl files are rejected until kb_search has been called in this session."
          : "")
    );
  }

  if (config.injectGotchasSummary) {
    guidelines.push(
      `LOTUSSCRIPT GOTCHAS: a registry of known LotusScript and Formula traps is available in the global plugin. Top gotchas include: built-in keywords as names (Shell/Mid/Format), ForAll loop alias declarations, Const without 'As Type', ComputeWithForm side-effects. Use tool 'lotusscript_gotchas' to check specific gotchas.`
    );
  }

  if (config.enforceGotchaCapture) {
    guidelines.push(
      "MANDATORY GOTCHA RECORDING & USER APPROVAL: When working with LotusScript / Domino 9.0.1, if you encounter or resolve an unexpected language quirk, compiler trap, or runtime error, you MUST propose recording it using tool 'lotusscript_gotchas(action: \"add\", title: \"...\", body: \"...\")'. The user will review it in an interactive modal window to approve, cancel, or request rewrites. If the user provides rewrite instructions, regenerate the proposal according to their instructions and call the tool again."
    );
  }

  if (config.checkProcedureLimits) {
    guidelines.push(
      `LOTUSSCRIPT PROCEDURE LIMITS & COMMENTS: Individual subroutines and functions MUST NOT exceed ${config.maxProcedureLines} lines for maintainability and to avoid the hard LotusScript 32 KB bytecode/data procedure limit (compiler halts with 'Script structure too large' if exceeded). Decompose complex logic into smaller subroutines/functions. Each procedure MUST have a concise Czech comment explaining its purpose (' Účel: ...). If a procedure exceeds ${config.maxProcedureLines} lines, an interactive approval modal is shown to the user to either approve a slight excess or reject and require splitting.`
    );
  }

  if (config.enforceGradingRubric) {
    guidelines.push(deps.buildGradingRubric(config));
  }

  guidelines.push(
    [
      "LOTUSSCRIPT SOURCE SHAPE:",
      "A monolithic `.lss` or `.dxl` is the source shape this plugin handles. Read it with the `read` tool using offset/limit, inspect it with `grep`/`bash`, and edit it with anchored edits — nothing is created, split or rewritten behind your back.",
      "Do not create a modular folder (manifest.json, main.lss, sub_*.lss, func_*.lss) for an existing monolith: the decompiler was removed from this plugin on 2026-10-23 and modularization of monoliths is no longer supported.",
      "Modular folders still legitimately exist when `lotusscript_scaffold` created them (type 'modular') or when one is already on disk. There, edits go to the individual part files, never to main.lss, manifest.json or *_compiled.lss, and `lotusscript_compile` reassembles the artifact.",
    ].join(" ")
  );

  return guidelines;
}