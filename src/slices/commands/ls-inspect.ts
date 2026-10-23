/**
 * `/ls` subcommand handlers — scaffold / lint / score (inspection and
 * evaluation side). Split out of commands/index.ts for the per-file limit.
 *
 * Cross-slice capabilities (lsp / linter / scorecard / scaffold) arrive via
 * CommandsDeps — slices never import each other (VSA). User-facing text
 * resolves through the i18n string table (pi-plugin-dev §10).
 */

import path from "node:path";
import fs from "node:fs";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { LspCheckResult } from "../../shared/types.js";
import { normalizeLocale, stringsFor } from "../../shared/i18n.js";
import type { PluginState } from "../../shared/state.js";
import type { CommandsDeps } from "./deps.js";
import type { LsParts } from "./ls-config.js";

export async function lsScaffold(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps): Promise<void> {
  const s = stringsFor(state.config.lang);
  const type = (parts[1] || "").toLowerCase();
  const name = parts[2];
  if (!type || !["agent", "library"].includes(type)) {
    ctx.ui.notify(s.scaffoldCmd.usage, "warning");
    return;
  }
  const targetName = name || "NewScript";
  const targetDir = parts[3] ? path.resolve(ctx.cwd, parts[3]) : ctx.cwd;
  try {
    const res = deps.scaffoldLotusScriptArtifact({
      type,
      name: targetName,
      targetDir,
    });
    const localizedNotice = normalizeLocale(state.config.lang) === "cs" ? res.noticeCs : res.noticeEn;
    const notice = localizedNotice ? `\n\n${localizedNotice}` : "";
    ctx.ui.notify(`✓ ${res.message}${notice}`, "info");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(s.scaffoldCmd.error(msg), "error");
  }
}

/** Resolves the `.lss` file a `/ls lint|score` call targets. */
function resolveTarget(parts: LsParts, ctx: ExtensionCommandContext): string | null {
  const target = parts[1] ? path.resolve(ctx.cwd, parts[1]) : "";
  if (!target || !fs.existsSync(target)) return null;
  return target;
}

export async function lsLint(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps): Promise<void> {
  const config = state.config;
  const s = stringsFor(config.lang);
  const target = resolveTarget(parts, ctx);
  if (!target) {
    ctx.ui.notify(s.check.usage(parts[1] || ""), "warning");
    return;
  }
  const res = deps.lintLotusScriptFile(target, config.enforceCzechComments);
  const lines = [
    s.lint.title(path.basename(target)),
    s.lint.total(res.allItems.length),
    s.lint.missingComment(res.missingCommentProcedures.length),
  ];
  for (const item of res.allItems) {
    const docIcon = item.hasDocComment ? "📝" : s.lint.missingDesc;
    lines.push(
      `  ${docIcon} ${item.procedureName} (line ${item.startLine}) — ${s.lint.linesCount(item.lineCount)}`
    );
  }
  if (config.enableScorecard) {
    const sc = state.buildScorecard(target, { lint: res, lsp: null });
    lines.push("", deps.formatScorecard(sc, state.scoreHistory.get(target)?.at(-1)));
  }
  ctx.ui.notify(lines.join("\n"), res.ok ? "info" : "warning");
}

export async function lsScore(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps): Promise<void> {
  const config = state.config;
  const s = stringsFor(config.lang);
  const target = resolveTarget(parts, ctx);
  if (!target) {
    ctx.ui.notify(s.check.usage(parts[1] || ""), "warning");
    return;
  }
  const lintRes = deps.lintLotusScriptFile(target, config.enforceCzechComments);
  let lspRes: LspCheckResult | null = null;
  if (config.enableLsp) {
    lspRes = await deps.checkLotusScriptDiagnostics(target);
  }
  const sc = state.buildScorecard(target, { lint: lintRes, lsp: lspRes });
  const history = state.scoreHistory.get(target) ?? [];
  const out = [deps.formatScorecard(sc, history.at(-1))];
  if (history.length > 0) {
    const trend = history.map((h) => `${h.score}/${h.max}`).join(" → ");
    out.push("", `${s.score.history(history.length)}${trend} → ${sc.score}/${sc.max}`);
  }
  ctx.ui.notify(out.join("\n"), "info");
}
