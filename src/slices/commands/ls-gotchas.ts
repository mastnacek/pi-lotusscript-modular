/**
 * `/ls gotchas` subcommand — search the central registry or add via the
 * user-approval modal. Split out of commands/index.ts for the per-file limit.
 *
 * The gotchas slice arrives via CommandsDeps (slice isolation, VSA);
 * user-facing text resolves through the i18n string table (pi-plugin-dev §10).
 *
 * Output policy: the toast lists the matching titles and names the tool that
 * returns the full bodies. Three full gotcha bodies in a transient toast is
 * ~1 400 characters of wrapped text the operator cannot scroll back to.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { stringsFor } from "../../shared/i18n.js";
import type { PluginState } from "../../shared/state.js";
import type { CommandsDeps } from "./deps.js";
import type { LsParts } from "./ls-config.js";

export async function lsGotchas(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps): Promise<void> {
  const s = stringsFor(state.config.lang);
  const subAct = (parts[1] || "").toLowerCase();
  if (subAct === "add") {
    const title = parts.slice(2).join(" ").trim();
    if (!title) {
      ctx.ui.notify(s.gotchasCmd.addUsage, "warning");
      return;
    }
    const body = await ctx.ui.input(s.gotchasCmd.bodyPrompt, s.gotchasCmd.bodyPlaceholder);
    if (!body || !body.trim()) {
      ctx.ui.notify(s.gotchasCmd.cancelled, "info");
      return;
    }
    const review = await deps.promptGotchaReview(ctx, title, body.trim(), s);
    if (review.action === "save") {
      const created = deps.addGotcha(title, body.trim());
      ctx.ui.notify(s.gotchasCmd.saved(created.title), "info");
    } else {
      ctx.ui.notify(s.gotchasCmd.notSaved, "warning");
    }
    return;
  }

  const query = parts.slice(1).join(" ").trim();
  if (!query || query === "summary") {
    ctx.ui.notify(deps.getGotchasSummary(12), "info");
    return;
  }

  const hits = deps.searchGotchas(query, 3);
  if (hits.length === 0) {
    ctx.ui.notify(s.gotchasCmd.noneFound(query), "warning");
    return;
  }

  ctx.ui.notify(
    [
      s.gotchasCmd.found(hits.length, query),
      ...hits.map((h) => `  • ${h.title}`),
      s.gotchasCmd.toolHint(query),
    ].join("\n"),
    "info"
  );
}
