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

  // First: which manual applies here. Only the project slice knows whether this
  // workspace has Domino evidence at all, so the line is conditional (and a
  // bounded, cached scan — never a repository walk).
  if (config.injectProjectSkillHint) {
    const projectSkill = deps.projectSkillGuideline();
    if (projectSkill) guidelines.push(projectSkill);
  }

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

  if (config.enforceGradingRubric) {
    guidelines.push(deps.buildGradingRubric(config));
  }

  guidelines.push(
    [
      "LOTUSSCRIPT SOURCE SHAPE:",
      "Every `.lss` file is a whole script — the only supported shape. Read it with the `read` tool using offset/limit, inspect it with `grep`/`bash`, and edit it with anchored edits — nothing is created, split or rewritten behind your back.",
      "Never create a modular folder (manifest.json, main.lss, sub_*.lss, func_*.lss) and never split a script into parts: one `.lss` is the whole module. The domino LSP compiles every .lss exactly as it is — no sibling assembly, no strict-mode probe.",
      "To verify a file, call `lotusscript_check(path)` — it runs the IBM Notes 9.0.1 compiler oracle on the whole file and returns its diagnostics.",
    ].join(" ")
  );

  return guidelines;
}