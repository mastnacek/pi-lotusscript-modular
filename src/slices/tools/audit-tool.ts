/**
 * Model-facing tool `lotusscript_library_audit`.
 *
 * The `/ls audit` command is operator-invoked; this is the same analysis the
 * agent can ask for on its own — typically before adding another agent that
 * would need HTTP, endpoint or error-reporting logic, or when the user asks
 * "shouldn't this be a library?".
 *
 * `plan: true` appends a promotion plan (suggested element name, scaffold
 * command, affected files, post-move steps). The tool never writes anything.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { PluginState } from "../../shared/state.js";
import type { ToolsDeps } from "./deps.js";

export function registerAuditTool(pi: ExtensionAPI, state: PluginState, deps: ToolsDeps): void {
  const AuditParams = Type.Object({
    dir: Type.Optional(Type.String({ description: "Folder of .lss files to audit (defaults to 01_scripts in the current working directory)" })),
    plan: Type.Optional(Type.Boolean({ description: "Append a promotion plan: suggested library name, scaffold command, affected files" })),
  });

  type AuditDetails = { ok: boolean; duplicates?: number; files?: number; dir?: string };

  pi.registerTool<typeof AuditParams, AuditDetails>({
    name: "lotusscript_library_audit",
    label: "Audit LotusScript Libraries",
    description:
      "Find procedures duplicated across .lss files and rank them as script-library candidates (saved lines = lines × (files − 1)). Use before writing another agent that needs shared logic, or when asked whether code should become a library. Read-only; `plan: true` adds the migration plan.",
    parameters: AuditParams,
    async execute(_toolCallId: string, params: { dir?: string; plan?: boolean }) {
      const dir = params.dir || "01_scripts";
      const result = deps.auditLibraries(dir, state.config.lang, params.plan === true);
      return {
        content: [{ type: "text", text: result.markdown }],
        details: { ok: true, duplicates: result.duplicates, files: result.files, dir },
      };
    },
  });
}
