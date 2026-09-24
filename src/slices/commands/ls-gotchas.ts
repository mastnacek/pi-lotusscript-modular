/**
 * `/ls gotchas` subcommand — search the central registry or add via the
 * user-approval modal. Split out of commands/index.ts for the per-file limit.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { addGotcha, getGotchasSummary, promptGotchaReview, searchGotchas } from "../gotchas/index.js";
import type { LsParts } from "./ls-config.js";

export async function lsGotchas(_state: unknown, parts: LsParts, ctx: ExtensionCommandContext): Promise<void> {
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
    return;
  }

  const query = parts.slice(1).join(" ").trim();
  if (!query || query === "summary") {
    ctx.ui.notify(getGotchasSummary(12), "info");
    return;
  }

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
