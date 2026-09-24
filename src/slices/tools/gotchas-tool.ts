/**
 * Model tool lotusscript_gotchas — search / summary / user-approved add.
 * Split out of tools/index.ts for the per-file line limit.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { GotchaItem } from "../../shared/types.js";
import { addGotcha, promptGotchaReview, searchGotchas, getGotchasSummary } from "../gotchas/index.js";
import type { PluginState } from "../../shared/state.js";

export function registerGotchasTool(pi: ExtensionAPI, state: PluginState): void {
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
}