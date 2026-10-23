/**
 * `/ls` subcommand handlers — scaffold / lint / score (inspection and
 * evaluation side). Split out of commands/index.ts for the per-file line limit.
 *
 * Cross-slice capabilities (lsp / linter / scorecard / scaffold) arrive via
 * CommandsDeps — slices never import each other (VSA). User-facing text
 * resolves through the i18n string table (pi-plugin-dev §10).
 */

import path from "node:path";
import fs from "node:fs";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { LspCheckResult } from "../../shared/types.js";
import { findModularRoot } from "../../shared/paths.js";
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

export async function lsLint(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps): Promise<void> {
  const config = state.config;
  const s = stringsFor(config.lang);
  const target = parts[1] || ctx.cwd;
  const root = findModularRoot(target);
  if (!root) {
    ctx.ui.notify(s.compile.notModular(target), "error");
    return;
  }
  const res = deps.lintModularFolder(root, config.maxProcedureLines, config.enforceCzechComments);
  const lines = [
    s.lint.title(path.basename(root)),
    s.lint.total(res.allItems.length),
    s.lint.exceeding(config.maxProcedureLines, res.exceededProcedures.length),
    s.lint.missingComment(res.missingCommentProcedures.length),
  ];
  for (const item of res.allItems) {
    const statusIcon = item.isExceeded ? "❌" : "✓";
    const docIcon = item.hasDocComment ? "📝" : s.lint.missingDesc;
    lines.push(`  ${statusIcon} ${item.fileName} — ${s.lint.linesCount(item.lineCount)} [${docIcon}]`);
  }
  if (config.enableScorecard) {
    const sc = state.buildScorecard(root, { lint: res, lsp: null, artifact: "pending" });
    lines.push("", deps.formatScorecard(sc, state.scoreHistory.get(root)?.at(-1)));
  }
  ctx.ui.notify(lines.join("\n"), res.ok ? "info" : "warning");
}

export async function lsScore(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps): Promise<void> {
  const config = state.config;
  const s = stringsFor(config.lang);
  const target = parts[1] || ctx.cwd;
  const root = findModularRoot(target);
  if (!root) {
    ctx.ui.notify(s.compile.notModular(target), "error");
    return;
  }
  const lintRes = deps.lintModularFolder(root, config.maxProcedureLines, config.enforceCzechComments);
  const compiledName = fs.readdirSync(root).find((f) => /_compiled\.lss$/i.test(f));
  let lspRes: LspCheckResult | null = null;
  if (config.enableLsp && compiledName) {
    lspRes = await deps.checkLotusScriptDiagnostics(path.join(root, compiledName));
  }
  const sc = state.buildScorecard(root, { lint: lintRes, lsp: lspRes, artifact: "pending" });
  const history = state.scoreHistory.get(root) ?? [];
  const out = [deps.formatScorecard(sc, history.at(-1))];
  if (history.length > 0) {
    const trend = history.map((h) => `${h.score}/${h.max}`).join(" → ");
    out.push("", `${s.score.history(history.length)}${trend} → ${sc.score}/${sc.max}`);
  }
  ctx.ui.notify(out.join("\n"), "info");
}
