import fs from "node:fs";
import path from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  isToolCallEventType,
  isReadToolResult,
  isEditToolResult,
  isWriteToolResult,
  CONFIG_DIR_NAME,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  AgentParser,
  findModularRoot,
  getExistingModularDir,
  isMonolithicLss,
  isMonolithicDxl,
} from "./src/agent-parser.ts";
import { checkLotusScriptDiagnostics } from "./src/lsp-check.ts";

export interface ModularLotusScriptConfig {
  enableLsp: boolean;
  autoDecompileOnRead: boolean;
  autoRecompileOnSave: boolean;
  keepTimestampInCompiledName: boolean;
  overwriteSourceLss: boolean;
  enforceKbPrompt: boolean;
}

const DEFAULT_CONFIG: ModularLotusScriptConfig = {
  enableLsp: false,
  autoDecompileOnRead: true,
  autoRecompileOnSave: true,
  keepTimestampInCompiledName: false,
  overwriteSourceLss: true,
  enforceKbPrompt: true,
};

export default function lotusscriptModularExtension(pi: ExtensionAPI) {
  let config: ModularLotusScriptConfig = { ...DEFAULT_CONFIG };
  let configFilePath = "";

  function loadConfig(cwd: string): void {
    configFilePath = path.join(cwd, CONFIG_DIR_NAME, "lotusscript-modular.json");
    if (fs.existsSync(configFilePath)) {
      try {
        const raw = fs.readFileSync(configFilePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<ModularLotusScriptConfig>;
        config = { ...DEFAULT_CONFIG, ...parsed };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[LotusScript Modular] Failed to load config: ${msg}`);
      }
    } else {
      saveConfig();
    }
  }

  function saveConfig(): void {
    if (!configFilePath) return;
    try {
      const dir = path.dirname(configFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), "utf-8");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[LotusScript Modular] Failed to save config: ${msg}`);
    }
  }

  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    loadConfig(ctx.cwd);
  });

  // Inject mandatory LotusScript knowledge base rule into system prompt
  pi.on("before_agent_start", (event) => {
    if (!config.enforceKbPrompt) return;
    if (event.systemPromptOptions?.promptGuidelines) {
      event.systemPromptOptions.promptGuidelines.push(
        "MANDATORY LOTUSSCRIPT / NOTES 9.0.1 RULE: Before writing, editing, or refactoring LotusScript code, you MUST query the 'lotus-notes' MCP knowledge base collection via kb_search (mcp__knowledge_base: kb_search, collection='lotus-notes'). Do not guess API methods, properties, or constants. Notes 9.0.1 LotusScript rules are strict (e.g. Variant vs Integer, flat scoping, Option Declare)."
      );
    }
  });

  // 1. Tool Call Interception (Auto-decompile on Read)
  const autoDecompiledMap = new Set<string>();

  pi.on("tool_call", (event) => {
    if (!config.autoDecompileOnRead) return;

    if (isToolCallEventType("read", event)) {
      const targetPath = event.input.path;
      if (!targetPath) return;

      const resolved = path.resolve(targetPath);
      if (!fs.existsSync(resolved)) return;

      // If modular directory already exists, seamlessly redirect read to main.lss
      const existingDir = getExistingModularDir(resolved);
      if (existingDir) {
        event.input.path = path.join(existingDir, "main.lss");
        return;
      }

      if (isMonolithicLss(resolved)) {
        try {
          const outDir = AgentParser.decompileLss(resolved);
          const mainPath = path.join(outDir, "main.lss");
          event.input.path = mainPath;
          autoDecompiledMap.add(path.resolve(mainPath));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[LotusScript Modular] Auto-decompile LSS failed: ${msg}`);
        }
      } else if (isMonolithicDxl(resolved)) {
        try {
          const outDir = AgentParser.decompileDxl(resolved);
          if (outDir) {
            const mainPath = path.join(outDir, "main.lss");
            event.input.path = mainPath;
            autoDecompiledMap.add(path.resolve(mainPath));
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[LotusScript Modular] Auto-decompile DXL failed: ${msg}`);
        }
      }
    }
  });

  // 2. Tool Result Interception (Provide context on Read, Auto-recompile & LSP on Edit/Write)
  pi.on("tool_result", async (event) => {
    // A) If reading main.lss of a modular agent
    if (isReadToolResult(event)) {
      const readPath = (event.input as { path?: string })?.path;
      if (readPath) {
        const resolved = path.resolve(readPath);
        const modularRoot = findModularRoot(resolved);
        const isMain = path.basename(resolved).toLowerCase() === "main.lss";

        if (modularRoot && isMain) {
          const notice = [
            "",
            "---",
            "🧩 [LotusScript Modular Agent Detected]",
            `- Modular root: ${modularRoot}`,
            "- Virtual imports (%pi-import) shown above are assembled in manifest order.",
            "- IMPORTANT: Inspect '01_declarations.lss' first to check global variables, types, and classes.",
            "- Edit individual 'sub_*.lss' / 'func_*.lss' files. Edits automatically sync the manifest and recompile.",
            `  (LSP validation is currently ${config.enableLsp ? "ENABLED" : "DISABLED (toggle with /ls-lsp on)"})`,
            `  (Overwrite original .lss on compile: ${config.overwriteSourceLss ? "ENABLED" : "DISABLED"})`,
            "",
            "🚨 MANDATORY KB CHECK (AGENTS.md):",
            "  Before writing or editing any LotusScript code, you MUST query the 'lotus-notes' knowledge base collection:",
            "  mcp__knowledge_base -> tool: 'kb_search', args: { collection: 'lotus-notes', query: '<API or topic>' }",
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

      // Avoid re-compiling when editing the compiled file itself
      if (resolved.toLowerCase().endsWith("_compiled.lss")) return;

      try {
        // Sync and recompile (with optional .lss overwrite)
        const compiledPath = AgentParser.compileAgent(modularRoot, {
          keepTimestamp: config.keepTimestampInCompiledName,
          overwriteSourceLss: config.overwriteSourceLss,
        });

        let lspNotice = "";
        if (config.enableLsp) {
          const lspResult = await checkLotusScriptDiagnostics(compiledPath);
          if (lspResult.ok) {
            lspNotice = `\n✓ LSP Diagnostics: 0 errors (clean)`;
          } else {
            lspNotice = `\n⚠️ LSP Diagnostics Errors/Warnings:\n${lspResult.diagnostics}`;
          }
        } else {
          lspNotice = `\n(LSP validation disabled — toggle with /ls-lsp on)`;
        }

        const overwriteNotice = config.overwriteSourceLss
          ? " (original .lss overwritten & synced)"
          : "";

        const recompileNotice = [
          "",
          "---",
          `🔨 [LotusScript Modular: Recompiled]`,
          `- Artifact: ${compiledPath}${overwriteNotice}${lspNotice}`,
          "---",
        ].join("\n");

        return {
          content: [...event.content, { type: "text", text: recompileNotice }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const errorNotice = `\n\n⚠️ [LotusScript Modular: Recompile Failed]: ${msg}`;
        return {
          content: [...event.content, { type: "text", text: errorNotice }],
        };
      }
    }
  });

  // 3. Custom Commands
  pi.registerCommand("ls-lsp", {
    description: "Toggle LotusScript LSP check on recompile (on/off)",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const arg = (args || "").trim().toLowerCase();
      if (arg === "on" || arg === "true" || arg === "1") {
        config.enableLsp = true;
      } else if (arg === "off" || arg === "false" || arg === "0") {
        config.enableLsp = false;
      } else {
        config.enableLsp = !config.enableLsp;
      }
      saveConfig();
      const statusText = config.enableLsp ? "ENABLED" : "DISABLED";
      ctx.ui.notify(`LotusScript LSP validation is now ${statusText}`, "info");
    },
  });

  pi.registerCommand("ls-status", {
    description: "Show LotusScript Modular extension configuration",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const summary = [
        "LotusScript Modular Settings:",
        `- LSP Validation: ${config.enableLsp ? "ENABLED" : "DISABLED"}`,
        `- Overwrite .lss source: ${config.overwriteSourceLss ? "ENABLED" : "DISABLED"}`,
        `- Auto-decompile on read: ${config.autoDecompileOnRead}`,
        `- Auto-recompile on save: ${config.autoRecompileOnSave}`,
        `- Enforce lotus-notes KB prompt: ${config.enforceKbPrompt}`,
        `- Keep timestamped compiled files: ${config.keepTimestampInCompiledName}`,
        `- Config file: ${configFilePath}`,
      ].join("\n");
      ctx.ui.notify(summary, "info");
    },
  });

  pi.registerCommand("ls-overwrite", {
    description: "Toggle overwriting original .lss source on recompile (on/off)",
    handler: (args: string, ctx: ExtensionCommandContext) => {
      const arg = (args || "").trim().toLowerCase();
      if (arg === "on" || arg === "true" || arg === "1") {
        config.overwriteSourceLss = true;
      } else if (arg === "off" || arg === "false" || arg === "0") {
        config.overwriteSourceLss = false;
      } else {
        config.overwriteSourceLss = !config.overwriteSourceLss;
      }
      saveConfig();
      const statusText = config.overwriteSourceLss ? "ENABLED" : "DISABLED";
      ctx.ui.notify(`Overwriting original .lss file is now ${statusText}`, "info");
    },
  });

  pi.registerCommand("ls-compile", {
    description: "Recompile a modular agent folder into <Agent>_compiled.lss",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const target = (args || "").trim() || ctx.cwd;
      const modularRoot = findModularRoot(target);
      if (!modularRoot) {
        ctx.ui.notify(`Not a modular LotusScript directory: ${target}`, "error");
        return;
      }
      try {
        const compiled = AgentParser.compileAgent(modularRoot, {
          keepTimestamp: config.keepTimestampInCompiledName,
          overwriteSourceLss: config.overwriteSourceLss,
        });
        if (config.enableLsp) {
          const lspResult = await checkLotusScriptDiagnostics(compiled);
          if (lspResult.ok) {
            ctx.ui.notify(`Compiled ${path.basename(compiled)} (LSP clean)`, "info");
          } else {
            ctx.ui.notify(`Compiled with LSP diagnostics: ${lspResult.diagnostics}`, "warning");
          }
        } else {
          ctx.ui.notify(`Compiled ${path.basename(compiled)}`, "info");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Compilation error: ${msg}`, "error");
      }
    },
  });

  pi.registerCommand("ls-decompile", {
    description: "Decompile monolithic .lss or .dxl file into modular folder",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const target = (args || "").trim();
      if (!target) {
        ctx.ui.notify("Usage: /ls-decompile <path-to-file>", "warning");
        return;
      }
      const resolved = path.resolve(target);
      if (!fs.existsSync(resolved)) {
        ctx.ui.notify(`File not found: ${resolved}`, "error");
        return;
      }
      try {
        let outDir = "";
        if (resolved.toLowerCase().endsWith(".dxl")) {
          outDir = AgentParser.decompileDxl(resolved) || "";
        } else {
          outDir = AgentParser.decompileLss(resolved);
        }
        ctx.ui.notify(`Decompiled to ${outDir}`, "info");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Decompile error: ${msg}`, "error");
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
    name: "lotusscript_lsp_toggle",
    label: "Toggle LotusScript LSP Check",
    description: "Toggle LotusScript LSP validation on or off in configuration.",
    parameters: Type.Object({
      enabled: Type.Boolean({ description: "True to enable LSP verification, false to disable." }),
    }),
    async execute(_toolCallId: string, params: { enabled: boolean }) {
      config.enableLsp = params.enabled;
      saveConfig();
      return {
        content: [{ type: "text", text: `LotusScript LSP check is now ${config.enableLsp ? "ENABLED" : "DISABLED"}.` }],
        details: { enableLsp: config.enableLsp },
      };
    },
  });
}
