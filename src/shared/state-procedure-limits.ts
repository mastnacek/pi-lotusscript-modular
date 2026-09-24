/**
 * Procedure line-limit gate — extracted from the PluginState kernel so
 * state.ts stays under the plugin's own per-file limit (self-dogfooded).
 * Interactive approval modal, exception memory and rejection signatures.
 */

import path from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { FolderLintResult, ModularConfig } from "./types.js";
import { lintModularFolder, promptProcedureLineReview } from "../slices/linter/index.js";

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
  lint: FolderLintResult;
};

export interface ProcedureLimitGate {
  verifyProcedureLimits(folder: string, ctx?: ExtensionContext): Promise<VerifyLimitsResult>;
}

export function createProcedureLimitGate(deps: ProcedureLimitDeps): ProcedureLimitGate {
  async function verifyProcedureLimits(
    folder: string,
    ctx?: ExtensionContext
  ): Promise<VerifyLimitsResult> {
    const config = deps.getConfig();
    const warnings: string[] = [];
    const lint = lintModularFolder(
      folder,
      config.maxProcedureLines,
      config.enforceCzechComments
    );

    if (config.enforceCzechComments) {
      for (const m of lint.missingCommentProcedures) {
        warnings.push(
          `Procedure '${m.fileName}' lacks a concise Czech documentation comment describing its purpose (' Účel: ...).`
        );
      }
    }

    if (!config.checkProcedureLimits) return { ok: true, warnings, lint };

    for (const item of lint.exceededProcedures) {
      const key = `${path.resolve(folder)}:${item.fileName}`;
      if (deps.approvedLineExceptions.has(key)) continue;

      const filePath = path.join(folder, item.fileName);
      const signature = deps.procedureSignature(filePath);

      // Already rejected for this exact content revision — do NOT re-open the
      // modal (prevents modal spam / infinite prompting on every unrelated
      // edit in the same folder). The AI still receives the split directive.
      if (deps.rejectedLineSignatures.get(key) === signature) {
        return {
          ok: false,
          warnings,
          lint,
          message: `Procedure '${item.fileName}' has ${item.lineCount} lines, exceeding the ${item.maxLines}-line limit. The user already rejected the exception for this revision. Split it into smaller subroutines/functions in 'sub_*.lss' or 'func_*.lss' files.`,
        };
      }

      const effectiveCtx = ctx ?? deps.getLatestUiContext();
      if (!effectiveCtx || !effectiveCtx.hasUI) {
        return {
          ok: false,
          warnings,
          lint,
          message: `Procedure '${item.fileName}' has ${item.lineCount} lines, exceeding the ${item.maxLines}-line limit. Approving an exception requires an interactive UI, which is unavailable. Split the procedure into smaller subroutines/functions.`,
        };
      }

      const review = await promptProcedureLineReview(effectiveCtx, item);

      if (review.action === "approve") {
        deps.approvedLineExceptions.add(key);
        deps.rejectedLineSignatures.delete(key);
        effectiveCtx.ui.notify(
          `✓ Schválena výjimka délky pro ${item.fileName} (${item.lineCount} řádků)`,
          "info"
        );
      } else if (review.action === "split_instructions") {
        deps.rejectedLineSignatures.set(key, signature);
        return {
          ok: false,
          warnings,
          lint,
          splitInstructions: review.instructions,
          message: `Procedure '${item.fileName}' has ${item.lineCount} lines (limit ${item.maxLines}). The user rejected the exception and provided splitting instructions: "${review.instructions}"`,
        };
      } else {
        deps.rejectedLineSignatures.set(key, signature);
        return {
          ok: false,
          warnings,
          lint,
          message: `Procedure '${item.fileName}' has ${item.lineCount} lines, exceeding the ${item.maxLines}-line limit. The user rejected the exception and requests splitting it into smaller subroutines/functions according to LotusScript principles (avoiding the 32 KB procedure limit).`,
        };
      }
    }

    return { ok: true, warnings, lint };
  }

  return { verifyProcedureLimits };
}
