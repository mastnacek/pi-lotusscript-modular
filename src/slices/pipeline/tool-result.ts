/**
 * tool_result interception — pre-flight gotcha banner on read, whole-file
 * auto-check on edit/write (limit gate, LSP, scorecard, recurring gotchas).
 * The read banner and recurring-gotcha flow live in sibling modules
 * (read-banner.ts, recurring-gotcha.ts) — per-file line limit split.
 *
 * Cross-slice capabilities (lsp / scorecard) arrive via PipelineDeps wired in
 * the composition root — slices never import each other (VSA).
 */

import path from "node:path";
import fs from "node:fs";
import type { ExtensionContext, ToolResultEvent } from "@earendil-works/pi-coding-agent";
import type { LspCheckResult } from "../../shared/types.js";
import type { PipelineDeps } from "./deps.js";
import * as paths from "../../shared/paths.js";
import type { PluginState } from "../../shared/state.js";
import { baseToolName, type ToolResultEventResultShape } from "./shared.js";
import { readBanner } from "./read-banner.js";
import { draftRecurringGotcha } from "./recurring-gotcha.js";

export async function handleToolResult(
  state: PluginState,
  event: ToolResultEvent,
  ctx: ExtensionContext,
  deps: PipelineDeps
): Promise<ToolResultEventResultShape | undefined> {
  const rawName = event.toolName || "";
  const base = baseToolName(rawName);

  // A) Reading a LotusScript file: attach the pre-flight gotcha banner once.
  if (!deps.mutatingToolNames.has(base)) {
    const input = event.input as Record<string, unknown> | undefined;
    const readPath =
      typeof input?.path === "string"
        ? input.path
        : typeof input?.file === "string"
          ? input.file
          : undefined;

    if (readPath) {
      const resolved = path.resolve(readPath);
      if (paths.isLotusScriptSource(resolved) && fs.existsSync(resolved)) {
        // Baseline for the versioning slice: we now know the header as it was.
        deps.observeVersionHeader(resolved);
        return readBanner(state, event, resolved);
      }
    }
  }

  // B) Editing or writing a LotusScript file: whole-file auto-check.
  if ((base === "edit" || base === "write") && !event.isError) {
    return await handleEditToolResult(state, event, ctx, deps);
  }

  return undefined;
}

async function handleEditToolResult(
  state: PluginState,
  event: ToolResultEvent,
  ctx: ExtensionContext,
  deps: PipelineDeps
): Promise<ToolResultEventResultShape | undefined> {
  const { config } = state;

  const targetPath = (event.input as { path?: string })?.path;
  if (!targetPath) return undefined;

  const resolved = path.resolve(targetPath);
  if (!paths.isLotusScriptOrDxl(resolved)) return undefined;

  // Settle-time KB verification tracks every .lss/.dxl mutation.
  state.notesMutatedThisRun = true;

  // Only a real LotusScript source can be compiled; DXL is a design export.
  if (!paths.isLotusScriptSource(resolved)) return undefined;
  if (!fs.existsSync(resolved)) return undefined;

  // Version header oversight is a source-shape concern, not a compilation one:
  // it must fire even when the whole-file check is switched off.
  const versionNotice = deps.checkVersioning(resolved);

  if (!config.autoCheckOnEdit) return withNotice(undefined, versionNotice, event);

  try {
    return withNotice(await checkAndReport(state, event, ctx, deps, resolved), versionNotice, event);
  } catch (err: unknown) {
    state.renderStatusline("error");
    const msg = err instanceof Error ? err.message : String(err);
    return withNotice(
      {
        content: [...event.content, { type: "text", text: `\n\n⚠️ [LotusScript: Check Failed]: ${msg}` }],
      },
      versionNotice,
      event
    );
  }
}

/** Append an extra notice block to a tool-result payload (or create one). */
function withNotice(
  result: ToolResultEventResultShape | undefined,
  notice: string | null,
  event: ToolResultEvent
): ToolResultEventResultShape | undefined {
  if (!notice) return result;
  const block = { type: "text" as const, text: notice };
  if (!result) return { content: [...event.content, block] };
  // `content` is optional on the result shape — never spread a possibly-undefined array.
  const existing = result.content ?? [];
  return { ...result, content: [...existing, block] };
}

/**
 * ASCII-only gate for auto-format (SPAI-008 encoding rule): Domino sources
 * are Cp1250 and the LSP lane reads utf-8, so a file with any byte above
 * 0x7F must never round-trip through the formatter. ASCII files are
 * encoding-identical in both code pages and safe to rewrite.
 */
function isAsciiOnlyFile(filePath: string): boolean {
  try {
    return fs.readFileSync(filePath).every((b) => b <= 0x7f);
  } catch {
    return false;
  }
}

/** Auto-format the edited file via the LSP formatter. Returns a one-line notice. */
async function autoFormatEditedFile(
  state: PluginState,
  deps: PipelineDeps,
  resolved: string
): Promise<string> {
  if (!isAsciiOnlyFile(resolved)) return "";
  const before = fs.readFileSync(resolved, "utf8");
  const formatted = await deps.formatLotusScriptFile(resolved);
  if (formatted === null || formatted === before) return "";
  fs.writeFileSync(resolved, formatted, "utf8");
  state.notesMutatedThisRun = true;
  return `\n✨ LSP auto-format applied to ${path.basename(resolved)} (ASCII-only file)`;
}

/** Runs the whole-file check and assembles the scorecard/LSP notice block. */
async function checkAndReport(
  state: PluginState,
  event: ToolResultEvent,
  ctx: ExtensionContext,
  deps: PipelineDeps,
  resolved: string
): Promise<ToolResultEventResultShape> {
  const { config } = state;
  state.renderStatusline("checking");

  // SPAI-008 automation: format the edited file BEFORE the check.
  let formatNotice = "";
  if (config.autoFormatOnSave) {
    try {
      formatNotice = await autoFormatEditedFile(state, deps, resolved);
    } catch {
      formatNotice = "";
    }
  }

  let lspNotice = "";
  let lspResult: LspCheckResult | null = null;
  if (config.enableLsp) {
    lspResult = await deps.checkLotusScriptDiagnostics(resolved);
    if (lspResult.ok) {
      state.renderStatusline("clean");
    } else {
      lspNotice = `\n⚠️ LSP Diagnostics Errors/Warnings:\n${lspResult.diagnostics}`;
      state.renderStatusline("error");
    }
  } else {
    state.renderStatusline("clean");
  }

  // SPAI-008 automation: attach lsp_explain help for the error codes so the
  // agent gets the fix guidance without an extra MCP round-trip.
  let explainNotice = "";
  if (config.autoExplainLspCodes && config.enableLsp && lspResult && !lspResult.ok) {
    try {
      explainNotice = await deps.explainLotusScriptCodes(lspResult.diagnostics);
    } catch {
      explainNotice = "";
    }
  }

  state.lastCheckedFile = resolved;

  // Telemetry: check count + code-length snapshot for the TUI panel.
  state.telemetry.checks++;
  state.telemetry.lastLspOk = config.enableLsp ? (lspResult ? lspResult.ok : null) : null;

  const gotchaNudge = config.enforceGotchaCapture
    ? "\n💡 GOTCHA CHECK: If this fix resolved an unexpected LotusScript bug or compiler error, propose recording it via 'lotusscript_gotchas(action: \"add\")'. The user will review and approve it via modal window."
    : "";
  let scorecardBlock = "";
  if (config.enableScorecard) {
    const scorecard = state.buildScorecard(resolved, { lsp: lspResult });
    const previous = state.recordScorecard(resolved, scorecard);
    scorecardBlock = deps.formatScorecard(scorecard, previous);
  }

  // Recurring-failure detection → harness-generated gotcha draft (user-approved).
  let recurringNotice = "";
  if (config.autoDraftRecurringGotchas && config.enableLsp && lspResult && !lspResult.ok) {
    recurringNotice = await draftRecurringGotcha(state, ctx, deps, resolved, lspResult);
  }

  const checkNotice = [
    "",
    "---",
    "🔍 [LotusScript: Checked]",
    `- File: ${resolved} (whole script)`,
    ...(formatNotice ? [formatNotice] : []),
    ...(scorecardBlock ? ["", scorecardBlock] : []),
    ...(recurringNotice ? [recurringNotice.trimStart()] : []),
    ...(lspNotice ? [lspNotice.trimStart()] : []),
    ...(explainNotice ? ["", explainNotice] : []),
    ...(gotchaNudge ? [gotchaNudge.trimStart()] : []),
    "---",
  ].join("\n");

  return {
    content: [...event.content, { type: "text", text: checkNotice }],
  };
}
