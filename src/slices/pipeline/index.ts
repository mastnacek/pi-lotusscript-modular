/**
 * Pipeline — translates Pi tool_call / tool_result / agent_settled events into
 * slice operations. Pure event translation; state and helpers come from the
 * PluginState kernel, business logic stays in the slices.
 */

import path from "node:path";
import fs from "node:fs";
import type {
  ExtensionContext,
  ToolCallEvent,
  ToolResultEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import {
  isEditToolResult,
  isWriteToolResult,
} from "@earendil-works/pi-coding-agent";
import type {
  AgentScorecard,
  JevFolderEvalResult,
  LspCheckResult,
} from "../../shared/types.js";
import { AgentParser } from "../parser/index.js";
import { checkLotusScriptDiagnostics } from "../lsp/index.js";
import { addGotcha, promptGotchaReview } from "../gotchas/index.js";
import {
  buildGradingRubric,
  buildRecurringGotchaDraft,
  findRecurringSignatures,
  formatScorecard,
  normalizeDiagnostics,
  trendLabel,
} from "../scorecard/index.js";
import { evaluateFolderWithJev } from "../evaluator/index.js";
import {
  MUTATING_TOOL_NAMES,
  SHELL_LIKE_TOOL_NAMES,
  collectShellLikeSources,
  guardMonolithDump,
  guardProtectedFiles,
} from "../guards/index.js";
import type { PluginState } from "../../shared/state.js";

/** Structural mirror of the engine's ToolResultEventResult (content blocks come
 * straight from `event.content`, so the union stays compatible). */
interface ToolResultEventResultShape {
  content?: ToolResultEvent["content"];
  details?: unknown;
  isError?: boolean;
  usage?: ToolResultEvent["usage"];
}

function baseToolName(raw: string): string {
  return raw.includes("__") ? raw.split("__").pop()! : raw;
}

// 1. Tool Call Interception (Auto-decompile on Read/Inspect or redirect to existing modular dir)
export function handleToolCall(state: PluginState, event: ToolCallEvent): ToolCallEventResult | undefined {
  const rawName = event.toolName || "";
  const base = baseToolName(rawName);

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

  const existingDir = getExistingModularDirSafe(resolved);
  if (existingDir) {
    state.readModularDirs.add(existingDir);
    input[pathKey] = path.join(existingDir, "main.lss");
    return;
  }

  const { isMonolithicLss, isMonolithicDxl } = pathsModule();
  if (isMonolithicLss(resolved)) {
    try {
      const outDir = AgentParser.decompileLss(resolved);
      state.readModularDirs.add(outDir);
      input[pathKey] = path.join(outDir, "main.lss");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[LotusScript Modular] Auto-decompile LSS failed: ${msg}`);
    }
  } else if (isMonolithicDxl(resolved)) {
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

// Local aliases to keep the moved bodies verbatim-friendly.
import * as paths from "../../shared/paths.js";
function getExistingModularDirSafe(resolved: string): string | null {
  return paths.getExistingModularDir(resolved);
}
function pathsModule(): typeof paths {
  return paths;
}

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
        const gotchasBanner = state.buildGotchasBanner(modularRoot);

        const notice = [
          "",
          "---",
          "🧩 [LotusScript Modular Agent Detected — READ THIS BEFORE ACTING]",
          `- Modular root: ${modularRoot}`,
          "",
          "⚠️ THE CONTENT ABOVE IS COMPLETE, NOT TRUNCATED.",
          "  You requested the monolithic .lss/.dxl. The extension intercepted the request,",
          "  split the file into a modular folder, and returned this '%pi-import' index instead.",
          "  The line count above is the index — NOT the size of the original script.",
          "  Never conclude the read failed, was cut short, or is a 'stub'.",
          "",
          "⛔ DO NOT read the monolithic file through bash or code-execution tools.",
          "  Forbidden: cat / sed / head / tail / more / less / Get-Content / python / node",
          "  / any other content dump targeting the original '.lss' or '.dxl'.",
          "  Such calls are blocked, and reading the whole script would flood your context.",
          "",
          "✅ HOW TO READ THE CODE:",
          "  1. Read '01_declarations.lss' first — global variables, constants, types, classes.",
          "  2. Then read only the specific 'sub_*.lss' / 'func_*.lss' file you need.",
          "     List them with the modular root above; each file is one procedure (~30-100 lines).",
          "  3. Edit those procedure files. Manifest sync + recompile are automatic.",
          `  (LSP validation: ${state.config.enableLsp ? "ENABLED" : "DISABLED"})`,
          `  (Overwrite original .lss: ${state.config.overwriteSourceLss ? "ENABLED" : "DISABLED"})`,
          "",
          "🚨 MANDATORY KB CHECK (AGENTS.md):",
          "  Query 'lotus-notes' MCP collection before writing code:",
          "  mcp__knowledge_base -> tool: 'kb_search', args: { collection: 'lotus-notes', query: '<API or topic>' }",
          gotchasBanner,
          "---",
        ].join("\n");

        return {
          content: [...event.content, { type: "text", text: notice }],
        };
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

  if (resolved.toLowerCase().endsWith("_compiled.lss")) return undefined;

  state.modifiedModularDirs.add(modularRoot);
  state.readModularDirs.add(modularRoot);

  // Verify procedure line limits and comments
  const limitCheck = await state.verifyProcedureLimits(modularRoot, state.latestUiContext ?? undefined);
  if (!limitCheck.ok) {
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
      `- Update calls in the original code so that no procedure exceeds the ${config.maxProcedureLines}-line limit.`,
      `- Do NOT retry the same oversized procedure unchanged; it will be rejected again.`,
      "---",
    ].filter(Boolean).join("\n");

    return {
      content: [...event.content, { type: "text", text: errorText }],
      isError: true,
    };
  }

  try {
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

    const overwriteNotice = config.overwriteSourceLss
      ? " (source .lss updated)"
      : "";

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
  } catch (err: unknown) {
    state.renderStatusline("error");
    const msg = err instanceof Error ? err.message : String(err);
    const errorNotice = `\n\n⚠️ [LotusScript Modular: Recompile Failed]: ${msg}`;
    return {
      content: [...event.content, { type: "text", text: errorNotice }],
    };
  }
}

async function draftRecurringGotcha(
  state: PluginState,
  ctx: ExtensionContext,
  modularRoot: string,
  resolved: string,
  lspResult: LspCheckResult
): Promise<string> {
  const signatures = normalizeDiagnostics(lspResult.diagnostics);
  if (signatures.length === 0) return "";

  const history = state.diagnosticHistory.get(modularRoot) ?? [];
  const recurring = findRecurringSignatures(signatures, history, 2);
  state.diagnosticHistory.set(modularRoot, [...history, signatures].slice(-10));

  const fresh = recurring.filter(
    (s) => !state.recurringGotchaReported.has(`${modularRoot}:${s}`)
  );

  if (fresh.length === 0) return "";

  const reviewCtx = ctx ?? state.latestUiContext;
  const draft = buildRecurringGotchaDraft(
    path.basename(modularRoot),
    fresh,
    [path.basename(resolved)]
  );

  if (!reviewCtx || !reviewCtx.hasUI) {
    return `\n♻️ RECURRING FAILURE (${fresh.length} signature(s)) detected, but no UI is available to approve a gotcha draft. Record it via lotusscript_gotchas(action: "add", ...).`;
  }

  for (const s of fresh) state.recurringGotchaReported.add(`${modularRoot}:${s}`);
  const review = await promptGotchaReview(reviewCtx, draft.title, draft.body);

  if (review.action === "save") {
    const created = addGotcha(draft.title, draft.body);
    reviewCtx.ui.notify(`✓ Opakovaná chyba uložena jako gotcha: ${created.title}`, "info");
    return `\n♻️ Recurring failure recorded as a gotcha: ${created.title}`;
  }

  if (review.action === "rewrite") {
    return [
      "",
      "♻️ RECURRING FAILURE — the user wants this gotcha rewritten before saving.",
      `Draft title: ${draft.title}`,
      `User instructions: "${review.instructions}"`,
      'Call lotusscript_gotchas(action: "add", title: "...", body: "...") with the revised text.',
    ].join("\n");
  }

  reviewCtx.ui.notify("Opakovaná chyba nebyla uložena jako gotcha.", "warning");
  return "\n♻️ Recurring failure detected; the user declined to record a gotcha for it.";
}

// agent_settled lifecycle: ephemeral cleanup + debrief
export async function handleAgentSettled(state: PluginState, ctx: ExtensionContext): Promise<void> {
  const { config } = state;
  state.renderStatusline("idle");
  if (!config.cleanupOnSettled) return;

  for (const modDir of state.modifiedModularDirs) {
    if (fs.existsSync(modDir)) {
      try {
        const limitCheck = await state.verifyProcedureLimits(modDir, ctx);
        if (!limitCheck.ok) {
          continue;
        }
        const lintBeforeDelete = limitCheck.lint;
        const finalLss = AgentParser.compileAgent(modDir, {
          overwriteSourceLss: config.overwriteSourceLss,
          createLssForDxl: true,
          deleteModularDir: true,
        });

        let finalScorecard: AgentScorecard | undefined = undefined;
        // Debrief: deterministic "note to self" carried into the next turn.
        if (config.enableScorecard) {
          // Measure the LSP on the artifact that was just written. Skipping the
          // check (lsp: null) made the debrief grade "not measured" as "failed"
          // — see computeScorecard's DoD 3.
          let lspRes: LspCheckResult | null = null;
          if (config.enableLsp) {
            try {
              lspRes = await checkLotusScriptDiagnostics(finalLss);
            } catch {
              lspRes = null;
            }
          }
          const scorecard = state.buildScorecard(modDir, {
            lint: lintBeforeDelete,
            lsp: lspRes,
            artifact: "written",
            manifestSynced: true,
          });
          finalScorecard = scorecard;
          const previous = state.recordScorecard(modDir, scorecard);
          const unmet = scorecard.items.filter((i) => !i.ok && !i.pending);
          if (unmet.length > 0) {
            state.pendingDebriefs.push(
              [
                `🧾 [LotusScript Debrief] ${path.basename(modDir)} — final ${scorecard.score}/${scorecard.max} (${trendLabel(scorecard, previous)})`,
                `- Artifact: ${path.basename(finalLss)}`,
                "- Unmet Definition of Done:",
                ...unmet.map((u) => `    - ${u.label}${u.detail ? `: ${u.detail}` : ""}`),
                '- Propose each unmet trap via lotusscript_gotchas(action: "add") so it is not repeated.',
              ].join("\n")
            );
          }
        }

        if (ctx.hasUI) {
          const scoreLabel = finalScorecard ? ` [skóre: ${finalScorecard.score}/${finalScorecard.max}]` : "";
          ctx.ui.notify(
            `🪷 [LotusScript Modular] Hotovo: ${path.basename(finalLss)} sestaven${scoreLabel} a dočasná složka smazána.`,
            "info"
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[LotusScript Modular] Chyba při úklidu ${modDir}: ${msg}`);
      }
    }
  }

  for (const modDir of state.readModularDirs) {
    if (!state.modifiedModularDirs.has(modDir) && fs.existsSync(modDir)) {
      try {
        fs.rmSync(modDir, { recursive: true, force: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[LotusScript Modular] Chyba při mazání read-only složky ${modDir}: ${msg}`);
      }
    }
  }

  state.modifiedModularDirs.clear();
  state.readModularDirs.clear();
}

// Prompt guidelines (before_agent_start injection), verbatim strings.
export function buildPromptGuidelines(config: import("../../shared/types.js").ModularConfig): string[] {
  const guidelines: string[] = [];

  if (config.enforceKbPrompt) {
    guidelines.push(
      "MANDATORY LOTUSSCRIPT / NOTES 9.0.1 RULE: Before writing or editing LotusScript code, you MUST query the 'lotus-notes' MCP knowledge base collection via kb_search (mcp__knowledge_base: kb_search, collection='lotus-notes'). Do not guess API methods, properties, or constants. Notes 9.0.1 LotusScript rules are strict."
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
