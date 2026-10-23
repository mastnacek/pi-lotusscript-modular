/**
 * Procedure line-limit gate — extracted from the PluginState kernel so
 * state.ts stays under the plugin's own per-file limit (self-dogfooded).
 * Interactive approval modal, exception memory and rejection signatures.
 *
 * Whole-file workflow: the gate lints every procedure inside ONE `.lss` file.
 */

import path from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { FileLintResult, ModularConfig } from "./types.js";
import { stringsFor } from "./i18n.js";
import { lintLotusScriptFile, promptProcedureLineReview } from "../slices/linter/index.js";

export interface ProcedureLimitDeps {
  getConfig(): ModularConfig;
  approvedLineExceptions: Set<string>;
  rejectedLineSignatures: Map<string, string>;
  procedureSignature(filePath: string): string;
  getLatestUiContext(): ExtensionContext | null;
}

export type VerifyLimitsResult = {
  ok: boolean;
  message?: string;
  splitInstructions?: string;
  warnings: string[];
  lint: FileLintResult;
};

export interface ProcedureLimitGate {
  verifyProcedureLimits(filePath: string, ctx?: ExtensionContext): Promise<VerifyLimitsResult>;
}

export function createProcedureLimitGate(deps: ProcedureLimitDeps): ProcedureLimitGate {
  async function verifyProcedureLimits(
    filePath: string,
    ctx?: ExtensionContext
  ): Promise<VerifyLimitsResult> {
    const config = deps.getConfig();
    const warnings: string[] = [];
    const resolvedFile = path.resolve(filePath);
    const lint = lintLotusScriptFile(
      resolvedFile,
      config.maxProcedureLines,
      config.enforceCzechComments
    );

    if (config.enforceCzechComments) {
      for (const m of lint.missingCommentProcedures) {
        warnings.push(
          `Procedure '${m.procedureName}' (line ${m.startLine}) lacks a concise Czech documentation comment describing its purpose (' Účel: ...).`
        );
      }
    }

    if (!config.checkProcedureLimits) return { ok: true, warnings, lint };

    for (const item of lint.exceededProcedures) {
      const key = resolvedFile;
      if (deps.approvedLineExceptions.has(key)) continue;

      const signature = deps.procedureSignature(resolvedFile);

      // Already rejected for this exact content revision — do NOT re-open the
      // modal (prevents modal spam / infinite prompting on every unrelated
      // edit of the same file). The AI still receives the split directive.
      if (deps.rejectedLineSignatures.get(key) === signature) {
        return {
          ok: false,
          warnings,
          lint,
          message: `Procedure '${item.procedureName}' (line ${item.startLine}) has ${item.lineCount} lines, exceeding the ${item.maxLines}-line limit. The user already rejected the exception for this revision. Split it into smaller subroutines/functions inside the same .lss file.`,
        };
      }

      const effectiveCtx = ctx ?? deps.getLatestUiContext();
      if (!effectiveCtx || !effectiveCtx.hasUI) {
        return {
          ok: false,
          warnings,
          lint,
          message: `Procedure '${item.procedureName}' (line ${item.startLine}) has ${item.lineCount} lines, exceeding the ${item.maxLines}-line limit. Approving an exception requires an interactive UI, which is unavailable. Split the procedure into smaller subroutines/functions.`,
        };
      }

      const review = await promptProcedureLineReview(effectiveCtx, item, stringsFor(config.lang));

      if (review.action === "approve") {
        deps.approvedLineExceptions.add(key);
        deps.rejectedLineSignatures.delete(key);
        effectiveCtx.ui.notify(
          stringsFor(config.lang).limits.exceptionApproved(item.procedureName, item.lineCount),
          "info"
        );
      } else if (review.action === "split_instructions") {
        deps.rejectedLineSignatures.set(key, signature);
        return {
          ok: false,
          warnings,
          lint,
          splitInstructions: review.instructions,
          message: `Procedure '${item.procedureName}' (line ${item.startLine}) has ${item.lineCount} lines (limit ${item.maxLines}). The user rejected the exception and provided splitting instructions: "${review.instructions}"`,
        };
      } else {
        deps.rejectedLineSignatures.set(key, signature);
        return {
          ok: false,
          warnings,
          lint,
          message: `Procedure '${item.procedureName}' (line ${item.startLine}) has ${item.lineCount} lines, exceeding the ${item.maxLines}-line limit. The user rejected the exception and requests splitting it into smaller subroutines/functions according to LotusScript principles (avoiding the 32 KB procedure limit).`,
        };
      }
    }

    return { ok: true, warnings, lint };
  }

  return { verifyProcedureLimits };
}
