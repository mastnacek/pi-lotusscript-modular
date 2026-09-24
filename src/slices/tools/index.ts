/**
 * Model-facing tools (lotusscript_compile / _decompile / _gotchas / _scaffold).
 * Verbatim tool definitions from the former fat composition root.
 */

import path from "node:path";
import fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { GotchaItem } from "../../shared/types.js";
import { findModularRoot } from "../../shared/paths.js";
import { AgentParser } from "../parser/index.js";
import { checkLotusScriptDiagnostics } from "../lsp/index.js";
import { addGotcha, promptGotchaReview, searchGotchas, getGotchasSummary } from "../gotchas/index.js";
import {
  scaffoldLotusScriptArtifact,
  type ScaffoldTargetType,
} from "../scaffold/index.js";
import type { PluginState } from "../../shared/state.js";

export function registerModelTools(pi: ExtensionAPI, state: PluginState): void {
  const { config } = state;

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

        const effectiveCtx = ctx ?? state.latestUiContext;
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

  const ScaffoldParams = Type.Object({
    type: StringEnum(["agent", "library", "procedure", "modular"] as const, {
      description: "Type of LotusScript artifact to scaffold",
    }),
    name: Type.String({ description: "Name of the script, procedure, library, or modular folder" }),
    targetDir: Type.Optional(Type.String({ description: "Target directory (defaults to current working directory)" })),
    purpose: Type.Optional(Type.String({ description: "Purpose description for the header and ' Účel: ... comment" })),
    author: Type.Optional(Type.String({ description: "Author name for header" })),
    isFunction: Type.Optional(Type.Boolean({ description: "For type='procedure', whether to generate a Function instead of Sub (default false)" })),
    parentAgent: Type.Optional(Type.String({ description: "For type='procedure', the parent agent name for @script-member-of header" })),
    returnType: Type.Optional(Type.String({ description: "For type='procedure' with isFunction=true, return type (e.g. 'String', 'Long')" })),
    params: Type.Optional(Type.String({ description: "Parameter list for the procedure (e.g. 'doc As NotesDocument')" })),
  });

  type ScaffoldDetails = {
    ok: boolean;
    type?: ScaffoldTargetType;
    createdFiles?: string[];
    message?: string;
    alias?: string;
    notice?: string;
  };

  pi.registerTool<typeof ScaffoldParams, ScaffoldDetails>({
    name: "lotusscript_scaffold",
    label: "Scaffold LotusScript Code",
    description: "Generate compliant LotusScript code skeletons (standalone agent, script library, modular procedure, or full modular agent folder) adhering to Domino 9.0.1 coding standards.",
    parameters: ScaffoldParams,
    async execute(_toolCallId: string, params: {
      type: ScaffoldTargetType;
      name: string;
      targetDir?: string;
      purpose?: string;
      author?: string;
      isFunction?: boolean;
      parentAgent?: string;
      returnType?: string;
      params?: string;
    }) {
      try {
        const res = scaffoldLotusScriptArtifact({
          type: params.type,
          name: params.name,
          targetDir: params.targetDir,
          purpose: params.purpose,
          author: params.author,
          isFunction: params.isFunction,
          parentAgent: params.parentAgent,
          returnType: params.returnType,
          params: params.params,
        });
        return {
          content: [{ type: "text", text: `${res.message}\nCreated files:\n${res.createdFiles.map((f) => `- ${f}`).join("\n")}\n\n${res.noticeEn ?? ""}` }],
          details: {
            ok: res.ok,
            type: res.type,
            createdFiles: res.createdFiles,
            message: res.message,
            alias: res.alias,
            notice: res.noticeEn,
          },
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error scaffolding artifact: ${msg}` }],
          details: { ok: false },
        };
      }
    },
  });
}
