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
  isReadToolResult,
  isToolCallEventType,
  isWriteToolResult,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ModularConfig } from "./src/shared/types.js";
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
  searchGotchas,
} from "./src/slices/gotchas/index.js";
import {
  completeLsArguments,
  findSetting,
  formatValue,
  parseValue,
  SETTING_SPECS,
} from "./src/slices/settings/index.js";

export default function lotusscriptModularExtension(pi: ExtensionAPI) {
  let config: ModularConfig = { ...DEFAULT_CONFIG };
  let activeCwd = process.cwd();
  let latestUiContext: ExtensionContext | null = null;

  function renderStatusline(state: "idle" | "compiling" | "clean" | "error" = "idle"): void {
    if (!latestUiContext || !latestUiContext.hasUI) return;
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
        "MANDATORY GOTCHA RECORDING: When working with LotusScript / Domino 9.0.1, if you encounter or resolve an unexpected language quirk, compiler trap, or runtime error, you MUST record it to the shared gotchas registry using tool 'lotusscript_gotchas(action: \"add\", title: \"...\", body: \"...\")' before concluding your turn."
      );
    }
  });

  // 1. Tool Call Interception (Auto-decompile on Read or redirect to existing modular dir)
  pi.on("tool_call", (event) => {
    if (!config.autoDecompileOnRead) return;

    if (isToolCallEventType("read", event)) {
      const targetPath = event.input.path;
      if (!targetPath) return;

      const resolved = path.resolve(targetPath);
      if (!fs.existsSync(resolved)) return;

      const existingDir = getExistingModularDir(resolved);
      if (existingDir) {
        event.input.path = path.join(existingDir, "main.lss");
        return;
      }

      if (isMonolithicLss(resolved)) {
        try {
          const outDir = AgentParser.decompileLss(resolved);
          event.input.path = path.join(outDir, "main.lss");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[LotusScript Modular] Auto-decompile LSS failed: ${msg}`);
        }
      } else if (isMonolithicDxl(resolved)) {
        try {
          const outDir = AgentParser.decompileDxl(resolved);
          if (outDir) {
            event.input.path = path.join(outDir, "main.lss");
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[LotusScript Modular] Auto-decompile DXL failed: ${msg}`);
        }
      }
    }
  });

  // 2. Tool Result Interception (Context injection on Read, Auto-recompile on Edit/Write)
  pi.on("tool_result", async (event) => {
    // A) If reading main.lss of a modular agent
    if (isReadToolResult(event)) {
      const readPath = (event.input as { path?: string })?.path;
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
    if ((isEditToolResult(event) || isWriteToolResult(event)) && !event.isError) {
      if (!config.autoRecompileOnSave) return;

      const targetPath = (event.input as { path?: string })?.path;
      if (!targetPath) return;

      const resolved = path.resolve(targetPath);
      const modularRoot = findModularRoot(resolved);
      if (!modularRoot) return;

      if (resolved.toLowerCase().endsWith("_compiled.lss")) return;

      try {
        renderStatusline("compiling");

        const compiledPath = AgentParser.compileAgent(modularRoot, {
          keepTimestamp: config.keepTimestampInCompiledName,
          overwriteSourceLss: config.overwriteSourceLss,
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
          ? " (original .lss overwritten & synced)"
          : "";

        const gotchaNudge = config.enforceGotchaCapture
          ? "\n💡 GOTCHA CHECK: If this fix resolved an unexpected LotusScript bug or compiler error, record it via 'lotusscript_gotchas(action: \"add\")'."
          : "";

        const recompileNotice = [
          "",
          "---",
          `🔨 [LotusScript Modular: Recompiled]`,
          `- Artifact: ${compiledPath}${overwriteNotice}${lspNotice}${gotchaNudge}`,
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
  pi.registerTool({
    name: "lotusscript_compile",
    label: "Compile Modular LotusScript",
    description: "Recompile modular LotusScript folder into single <AgentName>_compiled.lss file and run optional LSP diagnostics.",
    parameters: Type.Object({
      folder: Type.String({ description: "Path to modular agent directory containing manifest.json" }),
    }),
    async execute(_toolCallId: string, params: { folder: string }) {
      const modularRoot = findModularRoot(params.folder);
      if (!modularRoot) {
        return {
          content: [{ type: "text", text: `Error: directory is not a modular agent root: ${params.folder}` }],
          details: { ok: false },
        };
      }

      const compiledPath = AgentParser.compileAgent(modularRoot, {
        keepTimestamp: config.keepTimestampInCompiledName,
        overwriteSourceLss: config.overwriteSourceLss,
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

      return {
        content: [{ type: "text", text: `Compiled: ${compiledPath}${lspReport}` }],
        details: { compiledPath, modularRoot },
      };
    },
  });

  pi.registerTool({
    name: "lotusscript_decompile",
    label: "Decompile LotusScript Monolith",
    description: "Decompiles monolithic LotusScript (.lss) or Domino agent DXL (.dxl) into modular files with manifest.json and main.lss in a folder named after the script.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to .lss or .dxl file to decompile" }),
      outputDir: Type.Optional(Type.String({ description: "Optional custom output directory (defaults to folder alongside source file)" })),
    }),
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
        details: { outDir },
      };
    },
  });

  pi.registerTool({
    name: "lotusscript_gotchas",
    label: "Search or Add LotusScript Gotchas",
    description: "Search 40+ canonical LotusScript / Domino 9.0.1 gotchas, or record a newly discovered gotcha into the shared registry (~/.pi/lotusscript/gotchas.md) across all projects.",
    parameters: Type.Object({
      action: Type.Optional(Type.String({ description: "'search', 'summary', or 'add'" })),
      query: Type.Optional(Type.String({ description: "Keyword to search (e.g. 'shell', 'forall', 'const', 'computewithform', 'variant')" })),
      title: Type.Optional(Type.String({ description: "Gotcha title (required for action='add')" })),
      body: Type.Optional(Type.String({ description: "Gotcha markdown description (required for action='add')" })),
    }),
    async execute(_toolCallId: string, params: { action?: string; query?: string; title?: string; body?: string }) {
      const act = (params.action || "search").toLowerCase();

      if (act === "add") {
        if (!params.title || !params.body) {
          return {
            content: [{ type: "text", text: "Error: both 'title' and 'body' are required to add a gotcha." }],
            details: { ok: false },
          };
        }
        const created = addGotcha(params.title, params.body);
        return {
          content: [{ type: "text", text: `Gotcha successfully added to central repository: ${created.title}` }],
          details: { created },
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
          details: { hits: [] },
        };
      }

      const formatted = hits
        .map((h, i) => `### [${i + 1}] ${h.title}\n\n${h.body}`)
        .join("\n\n---\n\n");

      return {
        content: [{ type: "text", text: formatted }],
        details: { hits },
      };
    },
  });
}
