/**
 * Model tool lotusscript_scaffold — compliant LotusScript skeleton generator.
 * Split out of tools/index.ts for the per-file line limit.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { scaffoldLotusScriptArtifact, type ScaffoldTargetType } from "../scaffold/index.js";
import type { PluginState } from "../../shared/state.js";

export function registerScaffoldTool(pi: ExtensionAPI, _state: PluginState): void {
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
    },
  });
}