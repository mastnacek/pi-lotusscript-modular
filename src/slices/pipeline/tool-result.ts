/**
 * tool_result interception — read-time context injection for main.lss and
 * auto-recompile on edit/write (limit gate, LSP, scorecard, recurring gotchas).
 * The read banner and recurring-gotcha flow live in sibling modules
 * (read-banner.ts, recurring-gotcha.ts) — per-file line limit split.
 */

import path from "node:path";
import type { ExtensionContext, ToolResultEvent } from "@earendil-works/pi-coding-agent";
import { isEditToolResult, isWriteToolResult } from "@earendil-works/pi-coding-agent";
import type { JevFolderEvalResult, LspCheckResult } from "../../shared/types.js";
import { AgentParser } from "../parser/index.js";
import { checkLotusScriptDiagnostics } from "../lsp/index.js";
import { formatScorecard } from "../scorecard/index.js";
import { evaluateFolderWithJev } from "../evaluator/index.js";
import { MUTATING_TOOL_NAMES } from "../guards/index.js";
import * as paths from "../../shared/paths.js";
import type { PluginState } from "../../shared/state.js";
import { baseToolName, type ToolResultEventResultShape } from "./shared.js";
import { readBanner } from "./read-banner.js";
import { draftRecurringGotcha } from "./recurring-gotcha.js";

// 2. Tool Result Interception (Context injection on Read/Inspect, Auto-recompile on Edit/Write)
export async function handleToolResult(
  state: PluginState,
  event: ToolResultEvent,
  ctx: ExtensionContext
): Promise<ToolResultEventResultShape | undefined> {
  const rawName = event.toolName || "";
  const base = baseToolName(rawName);

  // A) If reading or inspecting main.lss of a modular agent
  if (!MUTATING_TOOL_NAMES.has(base)) {
    const input = event.input as Record<string, unknown> | undefined;
    const readPath =
      typeof input?.path === "string"
        ? input.path
        : typeof input?.file === "string"
          ? input.file
          : undefined;

    if (readPath) {
      const resolved = path.resolve(readPath);
      const modularRoot = paths.findModularRoot(resolved);
      const isMain = path.basename(resolved).toLowerCase() === "main.lss";

      if (modularRoot && isMain) {
        return readBanner(state, event, modularRoot);
      }
    }
  }

  // B) If editing or writing a file inside a modular folder
  if ((isEditToolResult(event) || isWriteToolResult(event) || base === "edit" || base === "write") && !event.isError) {
    return await handleEditToolResult(state, event, ctx, base);
  }

  return undefined;
}

async function handleEditToolResult(
  state: PluginState,
  event: ToolResultEvent,
  ctx: ExtensionContext,
  _base: string
): Promise<ToolResultEventResultShape | undefined> {
  const { config } = state;
  if (!config.autoRecompileOnSave) return undefined;

  const targetPath = (event.input as { path?: string })?.path;
  if (!targetPath) return undefined;

  const resolved = path.resolve(targetPath);
  const modularRoot = paths.findModularRoot(resolved);
  if (!modularRoot) {
    return outsideRootAdvisory(state, event, resolved);
  }

  if (resolved.toLowerCase().endsWith("_compiled.lss")) return undefined;

  state.modifiedModularDirs.add(modularRoot);
  state.readModularDirs.add(modularRoot);

  // Verify procedure line limits and comments
  const limitCheck = await state.verifyProcedureLimits(modularRoot, state.latestUiContext ?? undefined);
  if (!limitCheck.ok) {
    return limitGateError(state, event, limitCheck);
  }

  try {
    return await recompileAndReport(state, event, ctx, modularRoot, resolved, limitCheck);
  } catch (err: unknown) {
    state.renderStatusline("error");
    const msg = err instanceof Error ? err.message : String(err);
    const errorNotice = `\n\n⚠️ [LotusScript Modular: Recompile Failed]: ${msg}`;
    return {
      content: [...event.content, { type: "text", text: errorNotice }],
    };
  }
}

/** Advisory for edits landing on a LotusScript file outside any active modular root. */
function outsideRootAdvisory(
  state: PluginState,
  event: ToolResultEvent,
  resolved: string
): ToolResultEventResultShape | undefined {
  const activeRoots = [...state.modifiedModularDirs, ...state.readModularDirs];
  if (
    activeRoots.length > 0 &&
    /\.(lss|dxl)$/i.test(resolved) &&
    !/_compiled\.lss$/i.test(resolved)
  ) {
    return {
      content: [
        ...event.content,
        {
          type: "text",
          text: `\n\n⚠️ [LotusScript Modular] Advisory: this edit targets a LotusScript file outside the active modular root(s): ${activeRoots.map((r) => path.basename(r)).join(", ")}. If you meant to change a decompiled agent, edit its 'sub_*.lss' / 'func_*.lss' files so manifest sync and recompile stay correct.`,
        },
      ],
    };
  }
  return undefined;
}

/** Blocking tool result when the user rejected an over-limit procedure. */
function limitGateError(
  state: PluginState,
  event: ToolResultEvent,
  limitCheck: { message?: string; splitInstructions?: string }
): ToolResultEventResultShape {
  state.renderStatusline("error");
  const instructionsNotice = limitCheck.splitInstructions
    ? `\nUser's splitting instructions:\n"${limitCheck.splitInstructions}"\n`
    : "";
  const errorText = [
    "",
    "---",
    "⚠️ [LotusScript Lint Error: Procedure length limit exceeded]",
    limitCheck.message,
    instructionsNotice,
    "Mandatory step for AI:",
    `- Split the logic of this procedure into smaller 'sub_*.lss' or 'func_*.lss' files.`,
    `- Update calls in the original code so that no procedure exceeds the ${state.config.maxProcedureLines}-line limit.`,
    `- Do NOT retry the same oversized procedure unchanged; it will be rejected again.`,
    "---",
  ].filter(Boolean).join("\n");

  return {
    content: [...event.content, { type: "text", text: errorText }],
    isError: true,
  };
}

/** Recompiles the modular root and assembles the scorecard/LSP notice block. */
async function recompileAndReport(
  state: PluginState,
  event: ToolResultEvent,
  ctx: ExtensionContext,
  modularRoot: string,
  resolved: string,
  limitCheck: { warnings: string[]; lint: import("../../shared/types.js").FolderLintResult }
): Promise<ToolResultEventResultShape> {
  const { config } = state;
  state.renderStatusline("compiling");

  const compiledPath = AgentParser.compileAgent(modularRoot, {
    keepTimestamp: config.keepTimestampInCompiledName,
    overwriteSourceLss: config.overwriteSourceLss,
    createLssForDxl: true,
  });

  let lspNotice = "";
  let lspResult: LspCheckResult | null = null;
  if (config.enableLsp) {
    lspResult = await checkLotusScriptDiagnostics(compiledPath);
    if (lspResult.ok) {
      state.renderStatusline("clean");
    } else {
      lspNotice = `\n⚠️ LSP Diagnostics Errors/Warnings:\n${lspResult.diagnostics}`;
      state.renderStatusline("error");
    }
  } else {
    state.renderStatusline("clean");
  }

  const overwriteNotice = config.overwriteSourceLss ? " (source .lss updated)" : "";
  const cleanupNotice = config.cleanupOnSettled
    ? "\nℹ️ (the temporary modular folder is deleted automatically once the agent finishes)"
    : "";
  const gotchaNudge = config.enforceGotchaCapture
    ? "\n💡 GOTCHA CHECK: If this fix resolved an unexpected LotusScript bug or compiler error, propose recording it via 'lotusscript_gotchas(action: \"add\")'. The user will review and approve it via modal window."
    : "";
  const commentWarnings = limitCheck.warnings.length > 0
    ? `\nℹ️ [Comments]:\n${limitCheck.warnings.map((w) => `  - ${w}`).join("\n")}`
    : "";

  let scorecardBlock = "";
  if (config.enableScorecard) {
    let jevRes: JevFolderEvalResult | null = null;
    if (config.useJevEvaluation) {
      try {
        jevRes = await evaluateFolderWithJev(modularRoot, {
          apiKey: config.openrouterApiKey,
          jevModel: config.jevModel,
          ctx,
        });
      } catch {
        // Non-fatal fallback
      }
    }
    const scorecard = state.buildScorecard(modularRoot, {
      lint: limitCheck.lint,
      lsp: lspResult,
      artifact: "pending",
      jev: jevRes,
    });
    const previous = state.recordScorecard(modularRoot, scorecard);
    scorecardBlock = formatScorecard(scorecard, previous);
  }

  // Recurring-failure detection → harness-generated gotcha draft (user-approved).
  let recurringNotice = "";
  if (config.autoDraftRecurringGotchas && config.enableLsp && lspResult && !lspResult.ok) {
    recurringNotice = await draftRecurringGotcha(state, ctx, modularRoot, resolved, lspResult);
  }

  const recompileNotice = [
    "",
    "---",
    `🔨 [LotusScript Modular: Recompiled]`,
    `- Artifact: ${compiledPath}${overwriteNotice}${cleanupNotice}`,
    ...(scorecardBlock ? ["", scorecardBlock] : []),
    ...(recurringNotice ? [recurringNotice.trimStart()] : []),
    ...(lspNotice ? [lspNotice.trimStart()] : []),
    ...(gotchaNudge ? [gotchaNudge.trimStart()] : []),
    ...(commentWarnings ? [commentWarnings.trimStart()] : []),
    "---",
  ].join("\n");

  return {
    content: [...event.content, { type: "text", text: recompileNotice }],
  };
}
