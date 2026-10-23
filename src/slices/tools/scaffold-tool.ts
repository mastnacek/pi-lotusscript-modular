/**
 * Model tool lotusscript_scaffold — compliant LotusScript skeleton generator.
 * Split out of tools/index.ts for the per-file line limit.
 *
 * The scaffold slice arrives via ToolsDeps wired in the composition root —
 * slices never import each other (VSA). Tool description and result text
 * stay English (model-facing, §10).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { ToolsDeps, ScaffoldOptionsFull } from "./deps.js";
import type { PluginState } from "../../shared/state.js";

export function registerScaffoldTool(pi: ExtensionAPI, _state: PluginState, deps: ToolsDeps): void {
  const ScaffoldParams = Type.Object({
    type: StringEnum(["agent", "library"] as const, {
      description: "Type of LotusScript artifact to scaffold (whole .lss file)",
    }),
    name: Type.String({ description: "Name of the agent or script library" }),
    targetDir: Type.Optional(Type.String({ description: "Target directory (defaults to current working directory)" })),
    purpose: Type.Optional(Type.String({ description: "Purpose description for the header and ' Účel: ... comment" })),
    author: Type.Optional(Type.String({ description: "Author name for header" })),
    date: Type.Optional(Type.String({ description: "Fixed YYYY-MM-DD for the versioned header. Set it to make the scaffold byte-reproducible; omit for today." })),
  });

  type ScaffoldDetails = {
    ok: boolean;
    type?: string;
    createdFiles?: string[];
    message?: string;
    alias?: string;
    notice?: string;
  };

  pi.registerTool<typeof ScaffoldParams, ScaffoldDetails>({
    name: "lotusscript_scaffold",
    label: "Scaffold LotusScript Code",
    description: "Generate compliant whole-file LotusScript code skeletons (standalone agent or script library .lss) adhering to Domino 9.0.1 coding standards.",},{
    parameters: ScaffoldParams,
    async execute(_toolCallId: string, params: {
      type: "agent" | "library";
      name: string;
      targetDir?: string;
      purpose?: string;
      author?: string;
      date?: string;
    }) {
      const options: ScaffoldOptionsFull = {
        type: params.type,
        name: params.name,
        targetDir: params.targetDir,
        purpose: params.purpose,
        author: params.author,
        date: params.date,
      };
      const res = deps.scaffoldLotusScriptArtifact(options);
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