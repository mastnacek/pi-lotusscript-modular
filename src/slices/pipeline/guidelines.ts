/**
 * Prompt guidelines (before_agent_start injection) — verbatim rule strings.
 * Split out of pipeline/index.ts for the per-file line limit.
 */

import type { ModularConfig } from "../../shared/types.js";
import { buildGradingRubric } from "../scorecard/index.js";

export function buildPromptGuidelines(config: ModularConfig): string[] {
  const guidelines: string[] = [];

  if (config.enforceKbPrompt) {
    guidelines.push(
      "MANDATORY LOTUSSCRIPT / NOTES 9.0.1 RULE: Before writing or editing LotusScript code, you MUST query the 'lotus-notes' MCP knowledge base collection via kb_search (mcp__knowledge_base: kb_search, collection='lotus-notes'). Do not guess API methods, properties, or constants. Notes 9.0.1 LotusScript rules are strict." +
        (config.enforceKbGate
          ? " This is ENFORCED: edit/write calls on .lss/.dxl files are rejected until kb_search has been called in this session."
          : "")
    );
  }

  if (config.injectGotchasSummary) {
    guidelines.push(
      `LOTUSSCRIPT GOTCHAS: 40+ known LotusScript traps are registered in the global plugin. Top gotchas include: built-in keywords as names (Shell/Mid/Format), ForAll loop alias declarations, Const without 'As Type', ComputeWithForm side-effects. Use tool 'lotusscript_gotchas' to check specific gotchas.`
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
    guidelines.push(buildGradingRubric(config));
  }

  guidelines.push(
    "LOTUSSCRIPT MODULAR AGENTS (EPHEMERAL WORKFLOW): When reading LotusScript (.lss) or Domino agent DXL (.dxl) files, the extension temporarily decompiles them into modular folders (manifest.json, main.lss, sub_*.lss, func_*.lss) for fine-grained editing. Always edit the individual modular files. Once you finish your modifications, the extension automatically compiles the final code into the standalone .lss file (or creates <name>.lss for .dxl) and completely deletes the temporary modular folder."
  );

  return guidelines;
}
