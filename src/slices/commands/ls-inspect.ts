/**
 * `/ls` subcommand handlers — scaffold / lint / score / jev (inspection and
 * evaluation side). Split out of commands/index.ts for the per-file line limit.
 */

import path from "node:path";
import fs from "node:fs";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { CommentStyle, JevFolderEvalResult, LspCheckResult } from "../../shared/types.js";
import { findModularRoot } from "../../shared/paths.js";
import { checkLotusScriptDiagnostics } from "../lsp/index.js";
import { lintModularFolder } from "../linter/index.js";
import { formatScorecard } from "../scorecard/index.js";
import { evaluateFolderWithJev } from "../evaluator/index.js";
import { scaffoldLotusScriptArtifact, type ScaffoldTargetType } from "../scaffold/index.js";
import type { PluginState } from "../../shared/state.js";
import type { LsParts } from "./ls-config.js";

export async function lsScaffold(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext): Promise<void> {
  void state;
  const type = (parts[1] || "").toLowerCase() as ScaffoldTargetType;
  const name = parts[2];
  if (!type || !["agent", "library", "procedure", "modular"].includes(type)) {
    ctx.ui.notify("Použití: /ls scaffold <agent|library|procedure|modular> [název] [cílová složka]", "warning");
    return;
  }
  const targetName = name || (type === "modular" ? "NewModularAgent" : "NewScript");
  const targetDir = parts[3] ? path.resolve(ctx.cwd, parts[3]) : ctx.cwd;
  try {
    const res = scaffoldLotusScriptArtifact({
      type,
      name: targetName,
      targetDir,
    });
    const notice = res.noticeCs ? `\n\n${res.noticeCs}` : "";
    ctx.ui.notify(`✓ ${res.message}${notice}`, "info");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Chyba při vytváření kostry: ${msg}`, "error");
  }
}

export async function lsLint(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext): Promise<void> {
  const config = state.config;
  const target = parts[1] || ctx.cwd;
  const root = findModularRoot(target);
  if (!root) {
    ctx.ui.notify(`Není modulární složka LotusScriptu: ${target}`, "error");
    return;
  }
  const res = lintModularFolder(root, config.maxProcedureLines, config.enforceCzechComments);
  const lines = [
    `🔍 [LotusScript Linter — ${path.basename(root)}]:`,
    `- Celkem procedur: ${res.allItems.length}`,
    `- Překračuje limit ${config.maxProcedureLines} řádků: ${res.exceededProcedures.length}`,
    `- Chybějící český komentář: ${res.missingCommentProcedures.length}`,
  ];
  for (const item of res.allItems) {
    const statusIcon = item.isExceeded ? "❌" : "✓";
    const docIcon = item.hasDocComment ? "📝" : "⚠️ chybí popis";
    lines.push(`  ${statusIcon} ${item.fileName} — ${item.lineCount} řádků [${docIcon}]`);
  }
  if (config.enableScorecard) {
    const sc = state.buildScorecard(root, { lint: res, lsp: null, artifact: "pending" });
    lines.push("", formatScorecard(sc, state.scoreHistory.get(root)?.at(-1)));
  }
  ctx.ui.notify(lines.join("\n"), res.ok ? "info" : "warning");
}

export async function lsScore(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext): Promise<void> {
  const config = state.config;
  const target = parts[1] || ctx.cwd;
  const root = findModularRoot(target);
  if (!root) {
    ctx.ui.notify(`Není modulární složka LotusScriptu: ${target}`, "error");
    return;
  }
  const lintRes = lintModularFolder(root, config.maxProcedureLines, config.enforceCzechComments);
  const compiledName = fs.readdirSync(root).find((f) => /_compiled\.lss$/i.test(f));
  let lspRes: LspCheckResult | null = null;
  if (config.enableLsp && compiledName) {
    lspRes = await checkLotusScriptDiagnostics(path.join(root, compiledName));
  }
  let jevRes: JevFolderEvalResult | null = null;
  if (config.useJevEvaluation) {
    jevRes = await evaluateFolderWithJev(root, {
      apiKey: config.openrouterApiKey,
      jevModel: config.jevModel,
      ctx,
    });
  }
  const sc = state.buildScorecard(root, { lint: lintRes, lsp: lspRes, artifact: "pending", jev: jevRes });
  const history = state.scoreHistory.get(root) ?? [];
  const out = [formatScorecard(sc, history.at(-1))];
  if (history.length > 0) {
    const trend = history.map((h) => `${h.score}/${h.max}`).join(" → ");
    out.push("", `Historie (${history.length}): ${trend} → ${sc.score}/${sc.max}`);
  }
  if (jevRes) {
    out.push("", `🤖 JEV: ${jevRes.summary}`);
  }
  ctx.ui.notify(out.join("\n"), "info");
}

export async function lsJev(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext): Promise<void> {
  const config = state.config;
  const arg1 = (parts[1] || "").toLowerCase();
  if (arg1 === "on") {
    config.useJevEvaluation = true;
    state.updateConfig(config);
    ctx.ui.notify("Sémantické hodnocení JEV je nyní ZAPNUTO.", "info");
    return;
  }
  if (arg1 === "off") {
    config.useJevEvaluation = false;
    state.updateConfig(config);
    ctx.ui.notify("Sémantické hodnocení JEV je nyní VYPNUTO.", "info");
    return;
  }

  const target = parts[1] || ctx.cwd;
  const root = findModularRoot(target);
  if (!root) {
    ctx.ui.notify(`Není modulární složka LotusScriptu: ${target}`, "error");
    return;
  }

  ctx.ui.notify(`Spouštím sémantické posouzení JEV pro: ${path.basename(root)}...`, "info");
  const jevRes = await evaluateFolderWithJev(root, {
    apiKey: config.openrouterApiKey,
    jevModel: config.jevModel,
    ctx,
  });

  const lines = [
    `🤖 [JEV Sémantické hodnocení — ${path.basename(root)}]:`,
    `- Model: ${config.jevModel}`,
    `- Souhrn: ${jevRes.summary}`,
    `- Celkem procedur: ${jevRes.procedures.length}`,
    "",
  ];

  const styleIcons: Record<CommentStyle, string> = {
    new: "✅",
    mixed: "⚠️",
    old: "❌",
    none: "❌",
  };
  const riskIcons = ["🟢", "🟡", "🔴"];

  for (const p of jevRes.procedures) {
    const styleIcon = styleIcons[p.commentStyle] ?? "❓";
    const riskIcon = riskIcons[p.gotchaRiskScore] ?? "🔴";
    lines.push(`  ${styleIcon} ${p.procedureName} (${p.fileName}) [${p.commentStyle.toUpperCase()}] ${riskIcon}`);
    lines.push(`     ${p.summary}`);
  }

  ctx.ui.notify(lines.join("\n"), jevRes.ok ? "info" : "warning");
}
