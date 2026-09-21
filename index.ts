/**
 * pi-lotusscript-modular — composition root.
 *
 * Composition root only: wires slices and translates Pi events into slice calls.
 * All parsing logic lives in `src/slices/parser`;
 * all LSP logic lives in `src/slices/lsp`;
 * all gotchas live in `src/slices/gotchas`;
 * all settings and completions live in `src/slices/settings`.
 */

import path from "node:path";
import fs from "node:fs";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  isEditToolResult,
  isWriteToolResult,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { GotchaItem, ModularConfig } from "./src/shared/types.js";
import {
  DEFAULT_CONFIG,
  loadConfig,
  projectConfigPath,
  saveConfig,
} from "./src/shared/config.js";
import {
  findModularRoot,
  getExistingModularDir,
  isMonolithicDxl,
  isMonolithicLss,
} from "./src/shared/paths.js";
import { AgentParser } from "./src/slices/parser/index.js";
import { checkLotusScriptDiagnostics } from "./src/slices/lsp/index.js";
import {
  addGotcha,
  getEffectiveGotchasPath,
  getGotchasSummary,
  promptGotchaReview,
  searchGotchas,
} from "./src/slices/gotchas/index.js";
import {
  lintModularFolder,
  promptProcedureLineReview,
} from "./src/slices/linter/index.js";
import {
  completeLsArguments,
  findSetting,
  formatValue,
  parseValue,
} from "./src/slices/settings/index.js";

const MUTATING_TOOL_NAMES = new Set([
  "edit",
  "write",
  "lotusscript_compile",
  "lotusscript_decompile",
]);

export default function lotusscriptModularExtension(pi: ExtensionAPI) {
  let config: ModularConfig = { ...DEFAULT_CONFIG };
  let activeCwd = process.cwd();
  let latestUiContext: ExtensionContext | null = null;
  const readModularDirs = new Set<string>();
  const modifiedModularDirs = new Set<string>();
  const approvedLineExceptions = new Set<string>();
  const rejectedLineSignatures = new Map<string, string>();

  /** Cheap content signature used to avoid re-prompting for unchanged files. */
  function procedureSignature(filePath: string): string {
    try {
      const st = fs.statSync(filePath);
      return `${st.mtimeMs}:${st.size}`;
    } catch {
      return "missing";
    }
  }

  async function verifyProcedureLimits(
    folder: string,
    ctx?: ExtensionContext
  ): Promise<{ ok: boolean; message?: string; splitInstructions?: string; warnings: string[] }> {
    const warnings: string[] = [];
    if (!config.checkProcedureLimits) return { ok: true, warnings };

    const lint = lintModularFolder(
      folder,
      config.maxProcedureLines,
      config.enforceCzechComments
    );

    for (const item of lint.exceededProcedures) {
      const key = `${path.resolve(folder)}:${item.fileName}`;
      if (approvedLineExceptions.has(key)) continue;

      const filePath = path.join(folder, item.fileName);
      const signature = procedureSignature(filePath);

      // Already rejected for this exact content revision — do NOT re-open the
      // modal (prevents modal spam / infinite prompting on every unrelated
      // edit in the same folder). The AI still receives the split directive.
      if (rejectedLineSignatures.get(key) === signature) {
        return {
          ok: false,
          warnings,
          message: `Procedure '${item.fileName}' has ${item.lineCount} lines, exceeding the ${item.maxLines}-line limit. The user already rejected the exception for this revision. Split it into smaller subroutines/functions in 'sub_*.lss' or 'func_*.lss' files.`,
        };
      }

      const effectiveCtx = ctx ?? latestUiContext;
      if (!effectiveCtx || !effectiveCtx.hasUI) {
        return {
          ok: false,
          warnings,
          message: `Procedure '${item.fileName}' has ${item.lineCount} lines, exceeding the ${item.maxLines}-line limit. Approving an exception requires an interactive UI, which is unavailable. Split the procedure into smaller subroutines/functions.`,
        };
      }

      const review = await promptProcedureLineReview(effectiveCtx, item);

      if (review.action === "approve") {
        approvedLineExceptions.add(key);
        rejectedLineSignatures.delete(key);
        effectiveCtx.ui.notify(
          `✓ Schválena výjimka délky pro ${item.fileName} (${item.lineCount} řádků)`,
          "info"
        );
      } else if (review.action === "split_instructions") {
        rejectedLineSignatures.set(key, signature);
        return {
          ok: false,
          warnings,
          splitInstructions: review.instructions,
          message: `Procedure '${item.fileName}' has ${item.lineCount} lines (limit ${item.maxLines}). The user rejected the exception and provided splitting instructions: "${review.instructions}"`,
        };
      } else {
        rejectedLineSignatures.set(key, signature);
        return {
          ok: false,
          warnings,
          message: `Procedure '${item.fileName}' has ${item.lineCount} lines, exceeding the ${item.maxLines}-line limit. The user rejected the exception and requests splitting it into smaller subroutines/functions according to LotusScript principles (avoiding the 32 KB procedure limit).`,
        };
      }
    }

    if (config.enforceCzechComments && lint.missingCommentProcedures.length > 0) {
      for (const m of lint.missingCommentProcedures) {
        warnings.push(`Procedure '${m.fileName}' lacks a concise Czech documentation comment describing its purpose (' Účel: ...).`);
      }
    }

    return { ok: true, warnings };
  }

  function renderStatusline(state: "idle" | "compiling" | "clean" | "error" = "idle"): void {
    if (!latestUiContext || !latestUiContext.hasUI || !latestUiContext.ui?.theme) return;
    const theme = latestUiContext.ui.theme;

    if (state === "compiling") {
      latestUiContext.ui.setStatus(
        "lotusscript",
        theme.fg("warning", "🪷 LS: compiling...")
      );
      return;
    }

    if (state === "clean") {
      latestUiContext.ui.setStatus(
        "lotusscript",
        theme.fg("success", "🪷 LS: compiled ✓")
      );
      return;
    }

    if (state === "error") {
      latestUiContext.ui.setStatus(
        "lotusscript",
        theme.fg("error", "🪷 LS: LSP error ⚠")
      );
      return;
    }

    // Default / idle state
    const icon = theme.fg("accent", "🪷 LS");
    const flags = theme.fg(
      "dim",
      ` (LSP:${config.enableLsp ? "on" : "off"} · OW:${config.overwriteSourceLss ? "on" : "off"})`
    );
    latestUiContext.ui.setStatus("lotusscript", icon + flags);
  }

  function syncConfig(cwd: string): void {
    activeCwd = cwd;
    config = loadConfig(cwd);
  }

  function updateConfig(newConfig: ModularConfig): void {
    config = newConfig;
    saveConfig(activeCwd, config);
    renderStatusline("idle");
  }

  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    latestUiContext = ctx;
    syncConfig(ctx.cwd);
    renderStatusline("idle");
  });

  pi.on("turn_end", () => {
    renderStatusline("idle");
  });

  pi.on("agent_settled", async (_event, ctx: ExtensionContext) => {
    renderStatusline("idle");
    if (!config.cleanupOnSettled) return;

    for (const modDir of modifiedModularDirs) {
      if (fs.existsSync(modDir)) {
        try {
          const limitCheck = await verifyProcedureLimits(modDir, ctx);
          if (!limitCheck.ok) {
            continue;
          }
          const finalLss = AgentParser.compileAgent(modDir, {
            overwriteSourceLss: config.overwriteSourceLss,
            createLssForDxl: true,
            deleteModularDir: true,
          });
          if (ctx.hasUI) {
            ctx.ui.notify(
              `🪷 [LotusScript Modular] Hotovo: ${path.basename(finalLss)} sestaven a dočasná složka smazána.`,
              "info"
            );
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[LotusScript Modular] Chyba při úklidu ${modDir}: ${msg}`);
        }
      }
    }

    for (const modDir of readModularDirs) {
      if (!modifiedModularDirs.has(modDir) && fs.existsSync(modDir)) {
        try {
          fs.rmSync(modDir, { recursive: true, force: true });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[LotusScript Modular] Chyba při mazání read-only složky ${modDir}: ${msg}`);
        }
      }
    }

    modifiedModularDirs.clear();
    readModularDirs.clear();
  });

  // Prompt injection: enforce KB query + inject gotchas reminder
  pi.on("before_agent_start", (event) => {
    if (!event.systemPromptOptions?.promptGuidelines) return;

    if (config.enforceKbPrompt) {
      event.systemPromptOptions.promptGuidelines.push(
        "MANDATORY LOTUSSCRIPT / NOTES 9.0.1 RULE: Before writing or editing LotusScript code, you MUST query the 'lotus-notes' MCP knowledge base collection via kb_search (mcp__knowledge_base: kb_search, collection='lotus-notes'). Do not guess API methods, properties, or constants. Notes 9.0.1 LotusScript rules are strict."
      );
    }

    if (config.injectGotchasSummary) {
      event.systemPromptOptions.promptGuidelines.push(
        `LOTUSSCRIPT GOTCHAS: 40+ known LotusScript traps are registered in the global plugin. Top gotchas include: built-in keywords as names (Shell/Mid/Format), ForAll loop alias declarations, Const without 'As Type', ComputeWithForm side-effects. Use tool 'lotusscript_gotchas' to check specific gotchas.`
      );
    }

    if (config.enforceGotchaCapture) {
      event.systemPromptOptions.promptGuidelines.push(
        "MANDATORY GOTCHA RECORDING & USER APPROVAL: When working with LotusScript / Domino 9.0.1, if you encounter or resolve an unexpected language quirk, compiler trap, or runtime error, you MUST propose recording it using tool 'lotusscript_gotchas(action: \"add\", title: \"...\", body: \"...\")'. The user will review it in an interactive modal window to approve, cancel, or request rewrites. If the user provides rewrite instructions, regenerate the proposal according to their instructions and call the tool again."
      );
    }

    if (config.checkProcedureLimits) {
      event.systemPromptOptions.promptGuidelines.push(
        `LOTUSSCRIPT PROCEDURE LIMITS & COMMENTS: Individual subroutines and functions MUST NOT exceed ${config.maxProcedureLines} lines for maintainability and to avoid the hard LotusScript 32 KB bytecode/data procedure limit (compiler halts with 'Script structure too large' if exceeded). Decompose complex logic into smaller subroutines/functions. Each procedure MUST have a concise Czech comment explaining its purpose (' Účel: ...). If a procedure exceeds ${config.maxProcedureLines} lines, an interactive approval modal is shown to the user to either approve a slight excess or reject and require splitting.`
      );
    }

    event.systemPromptOptions.promptGuidelines.push(
      "LOTUSSCRIPT MODULAR AGENTS (EPHEMERAL WORKFLOW): When reading LotusScript (.lss) or Domino agent DXL (.dxl) files, the extension temporarily decompiles them into modular folders (manifest.json, main.lss, sub_*.lss, func_*.lss) for fine-grained editing. Always edit the individual modular files. Once you finish your modifications, the extension automatically compiles the final code into the standalone .lss file (or creates <name>.lss for .dxl) and completely deletes the temporary modular folder."
    );
  });

  // 1. Tool Call Interception (Auto-decompile on Read/Inspect or redirect to existing modular dir)
  pi.on("tool_call", (event) => {
    if (!config.autoDecompileOnRead) return;

    const rawName = event.toolName || "";
    const baseToolName = rawName.includes("__") ? rawName.split("__").pop()! : rawName;
    if (MUTATING_TOOL_NAMES.has(baseToolName)) return;

    const input = event.input as Record<string, unknown> | undefined;
    if (!input) return;

    const pathKey = typeof input.path === "string" ? "path" : (typeof input.file === "string" ? "file" : null);
    if (!pathKey) return;

    const targetPath = input[pathKey] as string;
    if (!targetPath) return;

    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) return;

    const existingDir = getExistingModularDir(resolved);
    if (existingDir) {
      readModularDirs.add(existingDir);
      input[pathKey] = path.join(existingDir, "main.lss");
      return;
    }

    if (isMonolithicLss(resolved)) {
      try {
        const outDir = AgentParser.decompileLss(resolved);
        readModularDirs.add(outDir);
        input[pathKey] = path.join(outDir, "main.lss");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[LotusScript Modular] Auto-decompile LSS failed: ${msg}`);
      }
    } else if (isMonolithicDxl(resolved)) {
      try {
        const outDir = AgentParser.decompileDxl(resolved);
        if (outDir) {
          readModularDirs.add(outDir);
          input[pathKey] = path.join(outDir, "main.lss");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[LotusScript Modular] Auto-decompile DXL failed: ${msg}`);
      }
    }
  });

  // 2. Tool Result Interception (Context injection on Read/Inspect, Auto-recompile on Edit/Write)
  pi.on("tool_result", async (event) => {
    const rawName = event.toolName || "";
    const baseToolName = rawName.includes("__") ? rawName.split("__").pop()! : rawName;

    // A) If reading or inspecting main.lss of a modular agent
    if (!MUTATING_TOOL_NAMES.has(baseToolName)) {
      const input = event.input as Record<string, unknown> | undefined;
      const readPath =
        typeof input?.path === "string"
          ? input.path
          : typeof input?.file === "string"
            ? input.file
            : undefined;

      if (readPath) {
        const resolved = path.resolve(readPath);
        const modularRoot = findModularRoot(resolved);
        const isMain = path.basename(resolved).toLowerCase() === "main.lss";

        if (modularRoot && isMain) {
          const gotchasBanner = config.injectGotchasSummary
            ? `\n\n${getGotchasSummary(8)}`
            : "";

          const notice = [
            "",
            "---",
            "🧩 [LotusScript Modular Agent Detected]",
            `- Modular root: ${modularRoot}`,
            "- Virtual imports (%pi-import) shown above are assembled in manifest order.",
            "- IMPORTANT: Inspect '01_declarations.lss' first to check global variables, types, and classes.",
            "- Edit individual 'sub_*.lss' / 'func_*.lss' files. Edits automatically sync the manifest and recompile.",
            `  (LSP validation: ${config.enableLsp ? "ENABLED" : "DISABLED"})`,
            `  (Overwrite original .lss: ${config.overwriteSourceLss ? "ENABLED" : "DISABLED"})`,
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
    if ((isEditToolResult(event) || isWriteToolResult(event) || baseToolName === "edit" || baseToolName === "write") && !event.isError) {
      if (!config.autoRecompileOnSave) return;

      const targetPath = (event.input as { path?: string })?.path;
      if (!targetPath) return;

      const resolved = path.resolve(targetPath);
      const modularRoot = findModularRoot(resolved);
      if (!modularRoot) return;

      if (resolved.toLowerCase().endsWith("_compiled.lss")) return;

      modifiedModularDirs.add(modularRoot);
      readModularDirs.add(modularRoot);

      // Verify procedure line limits and comments
      const limitCheck = await verifyProcedureLimits(modularRoot, latestUiContext ?? undefined);
      if (!limitCheck.ok) {
        renderStatusline("error");
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
        renderStatusline("compiling");

        const compiledPath = AgentParser.compileAgent(modularRoot, {
          keepTimestamp: config.keepTimestampInCompiledName,
          overwriteSourceLss: config.overwriteSourceLss,
          createLssForDxl: true,
        });

        let lspNotice = "";
        if (config.enableLsp) {
          const lspResult = await checkLotusScriptDiagnostics(compiledPath);
          if (lspResult.ok) {
            lspNotice = `\n✓ LSP Diagnostics: 0 errors (clean)`;
            renderStatusline("clean");
          } else {
            lspNotice = `\n⚠️ LSP Diagnostics Errors/Warnings:\n${lspResult.diagnostics}`;
            renderStatusline("error");
          }
        } else {
          lspNotice = `\n(LSP validation disabled — toggle with /ls lsp on)`;
          renderStatusline("clean");
        }

        const overwriteNotice = config.overwriteSourceLss
          ? " (zdrojový .lss aktualizován)"
          : "";

        const cleanupNotice = config.cleanupOnSettled
          ? "\nℹ️ (Dočasná modulární složka bude automaticky smazána po dokončení práce agenta)"
          : "";

        const gotchaNudge = config.enforceGotchaCapture
          ? "\n💡 GOTCHA CHECK: If this fix resolved an unexpected LotusScript bug or compiler error, propose recording it via 'lotusscript_gotchas(action: \"add\")'. The user will review and approve it via modal window."
          : "";

        const commentWarnings = limitCheck.warnings.length > 0
          ? `\nℹ️ [Comments]:\n${limitCheck.warnings.map((w) => `  - ${w}`).join("\n")}`
          : "";

        const recompileNotice = [
          "",
          "---",
          `🔨 [LotusScript Modular: Recompiled]`,
          `- Artifact: ${compiledPath}${overwriteNotice}${cleanupNotice}${lspNotice}${gotchaNudge}${commentWarnings}`,
          "---",
        ].join("\n");

        return {
          content: [...event.content, { type: "text", text: recompileNotice }],
        };
      } catch (err: unknown) {
        renderStatusline("error");
        const msg = err instanceof Error ? err.message : String(err);
        const errorNotice = `\n\n⚠️ [LotusScript Modular: Recompile Failed]: ${msg}`;
        return {
          content: [...event.content, { type: "text", text: errorNotice }],
        };
      }
    }
  });

  // 3. Unified `/ls` Command with Lazy Menus
  pi.registerCommand("ls", {
    description: "Správa modulárních LotusScript agentů, LSP a Gotchas báze",
    getArgumentCompletions: (prefix: string) => {
      return completeLsArguments(prefix, config);
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parts = (args || "").trim().split(/\s+/).filter(Boolean);
      const sub = (parts[0] || "help").toLowerCase();

      switch (sub) {
        case "status": {
          const cfgPath = projectConfigPath(ctx.cwd);
          const lines = [
            "⚙️ [LotusScript Modular — Stav konfigurace]:",
            `- LSP kontrola: ${config.enableLsp ? "ZAPNUTO" : "VYPNUTO"}`,
            `- Přepisovat .lss zdroják: ${config.overwriteSourceLss ? "ZAPNUTO" : "VYPNUTO"}`,
            `- Uklízet složku po dokončení: ${config.cleanupOnSettled ? "ZAPNUTO" : "VYPNUTO"}`,
            `- Kontrola limitů procedur: ${config.checkProcedureLimits ? "ZAPNUTO" : "VYPNUTO"}`,
            `- Max řádků na proceduru: ${config.maxProcedureLines}`,
            `- Vynucovat české komentáře: ${config.enforceCzechComments ? "ZAPNUTO" : "VYPNUTO"}`,
            `- Auto-dekompilace při čtení: ${config.autoDecompileOnRead ? "ZAPNUTO" : "VYPNUTO"}`,
            `- Auto-rekompilace při uložení: ${config.autoRecompileOnSave ? "ZAPNUTO" : "VYPNUTO"}`,
            `- Vynucovat lotus-notes KB prompt: ${config.enforceKbPrompt ? "ZAPNUTO" : "VYPNUTO"}`,
            `- Vynucovat zápis gotchas: ${config.enforceGotchaCapture ? "ZAPNUTO" : "VYPNUTO"}`,
            `- Vkládat gotchas souhrn: ${config.injectGotchasSummary ? "ZAPNUTO" : "VYPNUTO"}`,
            `- Zachovat timestamp v názvu: ${config.keepTimestampInCompiledName ? "ZAPNUTO" : "VYPNUTO"}`,
            `- Centrální Gotchas soubor: ${getEffectiveGotchasPath()}`,
            `- Konfigurační soubor: ${cfgPath}`,
          ];
          ctx.ui.notify(lines.join("\n"), "info");
          break;
        }

        case "lsp": {
          const val = (parts[1] || "").toLowerCase();
          if (val === "on") config.enableLsp = true;
          else if (val === "off") config.enableLsp = false;
          else config.enableLsp = !config.enableLsp;
          updateConfig(config);
          ctx.ui.notify(`LSP kontrola syntaxe je nyní ${config.enableLsp ? "ZAPNUTA" : "VYPNUTA"}.`, "info");
          break;
        }

        case "overwrite": {
          const val = (parts[1] || "").toLowerCase();
          if (val === "on") config.overwriteSourceLss = true;
          else if (val === "off") config.overwriteSourceLss = false;
          else config.overwriteSourceLss = !config.overwriteSourceLss;
          updateConfig(config);
          ctx.ui.notify(`Přepisování původního .lss souboru je nyní ${config.overwriteSourceLss ? "ZAPNUTO" : "VYPNUTO"}.`, "info");
          break;
        }

        case "config": {
          const action = (parts[1] || "").toLowerCase();
          if (action === "get") {
            const key = parts[2];
            if (!key) {
              ctx.ui.notify("Použití: /ls config get <klíč>", "warning");
              return;
            }
            const spec = findSetting(key);
            if (!spec) {
              ctx.ui.notify(`Neznámé nastavení: ${key}`, "error");
              return;
            }
            ctx.ui.notify(`${key} = ${formatValue(config[spec.key])} (${spec.description})`, "info");
          } else if (action === "set") {
            const key = parts[2];
            const val = parts[3];
            if (!key || val === undefined) {
              ctx.ui.notify("Použití: /ls config set <klíč> <hodnota>", "warning");
              return;
            }
            const spec = findSetting(key);
            if (!spec) {
              ctx.ui.notify(`Neznámé nastavení: ${key}`, "error");
              return;
            }
            const parsed = parseValue(spec, val);
            if (!parsed.ok) {
              ctx.ui.notify(parsed.error, "error");
              return;
            }
            (config as any)[spec.key] = parsed.value;
            updateConfig(config);
            ctx.ui.notify(`Uloženo: ${key} = ${formatValue(parsed.value)}`, "info");
          } else {
            ctx.ui.notify("Použití: /ls config [get|set] ...", "warning");
          }
          break;
        }

        case "lint": {
          const target = parts[1] || ctx.cwd;
          const root = findModularRoot(target);
          if (!root) {
            ctx.ui.notify(`Není modulární složka LotusScriptu: ${target}`, "error");
            return;
          }
          const res = lintModularFolder(root, config.maxProcedureLines, config.enforceCzechComments);
          const lines = [
            `🔍 [LotusScript Linter — ${path.basename(root)}]:`,
            `- Celkem procedur: ${res.allItems.length}`,
            `- Překračuje limit ${config.maxProcedureLines} řádků: ${res.exceededProcedures.length}`,
            `- Chybějící český komentář: ${res.missingCommentProcedures.length}`,
          ];
          for (const item of res.allItems) {
            const statusIcon = item.isExceeded ? "❌" : "✓";
            const docIcon = item.hasDocComment ? "📝" : "⚠️ chybí popis";
            lines.push(`  ${statusIcon} ${item.fileName} — ${item.lineCount} řádků [${docIcon}]`);
          }
          ctx.ui.notify(lines.join("\n"), res.ok ? "info" : "warning");
          break;
        }

        case "compile": {
          const target = parts[1] || ctx.cwd;
          const root = findModularRoot(target);
          if (!root) {
            ctx.ui.notify(`Není modulární složka LotusScriptu: ${target}`, "error");
            return;
          }
          try {
            const compiled = AgentParser.compileAgent(root, {
              keepTimestamp: config.keepTimestampInCompiledName,
              overwriteSourceLss: config.overwriteSourceLss,
              createLssForDxl: true,
            });
            if (config.enableLsp) {
              const lspRes = await checkLotusScriptDiagnostics(compiled);
              if (lspRes.ok) {
                ctx.ui.notify(`Sestaveno ${path.basename(compiled)} (LSP čisté)`, "info");
              } else {
                ctx.ui.notify(`Sestaveno s LSP chybami:\n${lspRes.diagnostics}`, "warning");
              }
            } else {
              ctx.ui.notify(`Sestaveno: ${compiled}`, "info");
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.ui.notify(`Chyba kompilace: ${msg}`, "error");
          }
          break;
        }

        case "pack":
        case "clean": {
          const target = parts[1] || ctx.cwd;
          const root = findModularRoot(target);
          if (!root) {
            ctx.ui.notify(`Není modulární složka LotusScriptu: ${target}`, "error");
            return;
          }
          try {
            const finalLss = AgentParser.compileAgent(root, {
              overwriteSourceLss: config.overwriteSourceLss,
              createLssForDxl: true,
              deleteModularDir: true,
            });
            if (config.enableLsp) {
              const lspRes = await checkLotusScriptDiagnostics(finalLss);
              if (lspRes.ok) {
                ctx.ui.notify(`Sestaveno a uklizeno: ${path.basename(finalLss)} (LSP čisté)`, "info");
              } else {
                ctx.ui.notify(`Sestaveno s chybami LSP:\n${lspRes.diagnostics}`, "warning");
              }
            } else {
              ctx.ui.notify(`Sestaveno do: ${finalLss} a modulární složka byla smazána.`, "info");
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.ui.notify(`Chyba při úklidu: ${msg}`, "error");
          }
          break;
        }

        case "decompile": {
          const target = parts[1];
          if (!target) {
            ctx.ui.notify("Použití: /ls decompile <cesta k souboru .lss nebo .dxl>", "warning");
            return;
          }
          const resolved = path.resolve(target);
          if (!fs.existsSync(resolved)) {
            ctx.ui.notify(`Soubor nenalezen: ${resolved}`, "error");
            return;
          }
          try {
            let outDir = "";
            if (resolved.toLowerCase().endsWith(".dxl")) {
              outDir = AgentParser.decompileDxl(resolved) || "";
            } else {
              outDir = AgentParser.decompileLss(resolved);
            }
            ctx.ui.notify(`Dekompilováno do: ${outDir}`, "info");
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.ui.notify(`Chyba dekompilace: ${msg}`, "error");
          }
          break;
        }

        case "gotchas": {
          const subAct = (parts[1] || "").toLowerCase();
          if (subAct === "add") {
            const title = parts.slice(2).join(" ").trim();
            if (!title) {
              ctx.ui.notify("Použití: /ls gotchas add <název gotchy>", "warning");
              return;
            }
            const body = await ctx.ui.input("Zadejte popis / tělo gotchy:", "Popište problém a řešení...");
            if (!body || !body.trim()) {
              ctx.ui.notify("Zadání zrušeno.", "info");
              return;
            }
            const review = await promptGotchaReview(ctx, title, body.trim());
            if (review.action === "save") {
              const created = addGotcha(title, body.trim());
              ctx.ui.notify(`✓ Gotcha uložena do báze: ${created.title}`, "info");
            } else {
              ctx.ui.notify("Gotcha nebyla uložena (zrušeno uživatelem).", "warning");
            }
            break;
          }

          const query = parts.slice(1).join(" ").trim();
          if (!query || query === "summary") {
            ctx.ui.notify(getGotchasSummary(12), "info");
          } else {
            const hits = searchGotchas(query, 3);
            if (hits.length === 0) {
              ctx.ui.notify(`Žádné gotchas nenalezeny pro výraz: "${query}"`, "warning");
            } else {
              const formatted = hits
                .map((h, i) => `=== [${i + 1}] ${h.title} ===\n${h.body.slice(0, 450)}...`)
                .join("\n\n");
              ctx.ui.notify(formatted, "info");
            }
          }
          break;
        }

        case "help":
        default: {
          const help = [
            "📖 [Příkazy /ls — LotusScript Modular]:",
            "  /ls status                 — Zobrazit konfiguraci pluginu",
            "  /ls config get <klíč>      — Vypsat hodnotu nastavení",
            "  /ls config set <klíč> <v>  — Nastavit hodnotu (true/false)",
            "  /ls lsp [on|off]           — Zapnout/vypnout LSP kontrolu",
            "  /ls overwrite [on|off]     — Zapnout/vypnout přepis .lss souboru",
            "  /ls compile [složka]       — Ručně sestavit modulárního agenta",
            "  /ls lint [složka]          — Zkontrolovat délku procedur a komentáře",
            "  /ls pack [složka]          — Sestavit do .lss a smazat modulární složku",
            "  /ls decompile <soubor>     — Rozložit monolit .lss/.dxl",
            "  /ls gotchas [dotaz]        — Prohledat centrální bázi 40+ gotchas",
          ].join("\n");
          ctx.ui.notify(help, "info");
          break;
        }
      }
    },
  });

  // 4. Custom Tools for the Model
  const CompileParams = Type.Object({
    folder: Type.String({ description: "Path to modular agent directory containing manifest.json" }),
    clean: Type.Optional(Type.Boolean({ description: "Whether to delete the modular folder after compiling" })),
  });

  pi.registerTool<typeof CompileParams, { ok: boolean; compiledPath?: string; modularRoot?: string }>({
    name: "lotusscript_compile",
    label: "Compile Modular LotusScript",
    description: "Recompile modular LotusScript folder into single .lss file and run optional LSP diagnostics.",
    parameters: CompileParams,
    async execute(_toolCallId: string, params: { folder: string; clean?: boolean }) {
      const modularRoot = findModularRoot(params.folder);
      if (!modularRoot) {
        return {
          content: [{ type: "text", text: `Error: directory is not a modular agent root: ${params.folder}` }],
          details: { ok: false },
        };
      }

      const shouldClean = params.clean ?? false;
      const compiledPath = AgentParser.compileAgent(modularRoot, {
        keepTimestamp: config.keepTimestampInCompiledName,
        overwriteSourceLss: config.overwriteSourceLss,
        createLssForDxl: true,
        deleteModularDir: shouldClean,
      });

      let lspReport = "";
      if (config.enableLsp) {
        const lspResult = await checkLotusScriptDiagnostics(compiledPath);
        lspReport = lspResult.ok
          ? "\nLSP Diagnostics: 0 errors (clean)"
          : `\nLSP Diagnostics:\n${lspResult.diagnostics}`;
      } else {
        lspReport = "\n(LSP validation disabled)";
      }

      const cleanNote = shouldClean ? "\n(Modular folder deleted)" : "";
      return {
        content: [{ type: "text", text: `Compiled: ${compiledPath}${cleanNote}${lspReport}` }],
        details: { ok: true, compiledPath, modularRoot },
      };
    },
  });

  const DecompileParams = Type.Object({
    path: Type.String({ description: "Path to .lss or .dxl file to decompile" }),
    outputDir: Type.Optional(Type.String({ description: "Optional custom output directory (defaults to folder alongside source file)" })),
  });

  pi.registerTool<typeof DecompileParams, { ok: boolean; outDir?: string }>({
    name: "lotusscript_decompile",
    label: "Decompile LotusScript Monolith",
    description: "Decompiles monolithic LotusScript (.lss) or Domino agent DXL (.dxl) into modular files with manifest.json and main.lss in a folder named after the script.",
    parameters: DecompileParams,
    async execute(_toolCallId: string, params: { path: string; outputDir?: string }) {
      const resolved = path.resolve(params.path);
      if (!fs.existsSync(resolved)) {
        return {
          content: [{ type: "text", text: `Error: file not found: ${resolved}` }],
          details: { ok: false },
        };
      }

      let outDir = "";
      if (resolved.toLowerCase().endsWith(".dxl")) {
        outDir = AgentParser.decompileDxl(resolved, params.outputDir) || "";
      } else {
        outDir = AgentParser.decompileLss(resolved, params.outputDir);
      }

      if (!outDir) {
        return {
          content: [{ type: "text", text: `Notice: no LotusScript code found in ${resolved}` }],
          details: { ok: false },
        };
      }

      return {
        content: [{ type: "text", text: `Decompiled to: ${outDir}\nFiles: manifest.json, main.lss, 00_options.lss, 01_declarations.lss, procedures, 99_initialize.lss` }],
        details: { ok: true, outDir },
      };
    },
  });

  const GotchasParams = Type.Object({
    action: Type.Optional(Type.String({ description: "'search', 'summary', or 'add'" })),
    query: Type.Optional(Type.String({ description: "Keyword to search (e.g. 'shell', 'forall', 'const', 'computewithform', 'variant')" })),
    title: Type.Optional(Type.String({ description: "Gotcha title (required for action='add')" })),
    body: Type.Optional(Type.String({ description: "Gotcha markdown description (required for action='add')" })),
  });

  pi.registerTool<
    typeof GotchasParams,
    {
      ok?: boolean;
      created?: GotchaItem;
      hits?: GotchaItem[];
      approved?: boolean;
      rewriteRequested?: boolean;
      instructions?: string;
      reason?: string;
    }
  >({
    name: "lotusscript_gotchas",
    label: "Search or Add LotusScript Gotchas",
    description: "Search 40+ canonical LotusScript / Domino 9.0.1 gotchas, or propose adding a newly discovered gotcha to the shared registry (~/.pi/lotusscript/gotchas.md) with interactive user modal approval.",
    parameters: GotchasParams,
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate,
      ctx
    ) {
      const act = (params.action || "search").toLowerCase();

      if (act === "add") {
        if (!params.title || !params.body) {
          return {
            content: [{ type: "text", text: "Error: both 'title' and 'body' are required to add a gotcha." }],
            details: { ok: false },
          };
        }

        const effectiveCtx = ctx ?? latestUiContext;
        if (!effectiveCtx || !effectiveCtx.hasUI) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Gotcha was not saved because manual user approval is required via interactive UI, but no UI is available in this session.",
              },
            ],
            details: { ok: false, approved: false, reason: "no_ui" },
          };
        }

        const review = await promptGotchaReview(effectiveCtx, params.title, params.body);

        if (review.action === "save") {
          const created = addGotcha(params.title, params.body);
          effectiveCtx.ui.notify(`✓ Gotcha schválena a zapsána do centrální báze: ${created.title}`, "info");
          return {
            content: [
              {
                type: "text",
                text: `Gotcha successfully approved by user and added to central repository: ${created.title}`,
              },
            ],
            details: { ok: true, created, approved: true },
          };
        }

        if (review.action === "rewrite") {
          effectiveCtx.ui.notify("Požadavek na přepsání gotchy předán AI...", "info");
          return {
            content: [
              {
                type: "text",
                text: [
                  `The user reviewed the proposed gotcha and requested changes before saving:`,
                  ``,
                  `User's rewrite instructions:`,
                  `"${review.instructions}"`,
                  ``,
                  `Please revise the gotcha title and body according to the user's instructions, and then call lotusscript_gotchas(action: "add", title: "...", body: "...") again with the revised proposal for approval.`,
                ].join("\n"),
              },
            ],
            details: {
              ok: false,
              approved: false,
              rewriteRequested: true,
              instructions: review.instructions,
            },
          };
        }

        // review.action === "cancel" or dismissed
        effectiveCtx.ui.notify("Gotcha nebyla uložena (zamítnuto uživatelem).", "warning");
        return {
          content: [
            {
              type: "text",
              text: `User rejected saving this gotcha proposal ("${params.title}"). It was NOT saved to the repository. Do not attempt to save this gotcha again unless explicitly requested by the user.`,
            },
          ],
          details: { ok: false, approved: false, reason: "rejected_by_user" },
        };
      }

      if (act === "summary" || (!params.query && act === "search")) {
        return {
          content: [{ type: "text", text: getGotchasSummary(15) }],
          details: { ok: true },
        };
      }

      const hits = searchGotchas(params.query || "", 5);
      if (hits.length === 0) {
        return {
          content: [{ type: "text", text: `No gotchas found matching: "${params.query}"` }],
          details: { ok: true, hits: [] },
        };
      }

      const formatted = hits
        .map((h, i) => `### [${i + 1}] ${h.title}\n\n${h.body}`)
        .join("\n\n---\n\n");

      return {
        content: [{ type: "text", text: formatted }],
        details: { ok: true, hits },
      };
    },
  });
}
