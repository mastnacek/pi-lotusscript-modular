/**
 * Unified `/ls` command with lazy menus. Verbatim handler from the former fat
 * composition root; session state arrives via PluginState.
 */

import path from "node:path";
import fs from "node:fs";
import type {
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type {
  AgentScorecard,
  CommentStyle,
  JevFolderEvalResult,
  LspCheckResult,
} from "../../shared/types.js";
import { projectConfigPath } from "../../shared/config.js";
import { findModularRoot } from "../../shared/paths.js";
import { AgentParser } from "../parser/index.js";
import { checkLotusScriptDiagnostics } from "../lsp/index.js";
import {
  addGotcha,
  getEffectiveGotchasPath,
  getGotchasSummary,
  promptGotchaReview,
  searchGotchas,
} from "../gotchas/index.js";
import { lintModularFolder } from "../linter/index.js";
import { formatScorecard } from "../scorecard/index.js";
import {
  completeLsArguments,
  findSetting,
  formatValue,
  parseValue,
} from "../settings/index.js";
import { evaluateFolderWithJev } from "../evaluator/index.js";
import {
  scaffoldLotusScriptArtifact,
  type ScaffoldTargetType,
} from "../scaffold/index.js";
import type { PluginState } from "../../shared/state.js";

export interface RegisteredLsCommand {
  description: string;
  getArgumentCompletions: (prefix: string) => ReturnType<typeof completeLsArguments>;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

export function createLsCommand(state: PluginState): RegisteredLsCommand {
  const { config } = state;

  async function handler(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const parts = (args || "").trim().split(/\s+/).filter(Boolean);
    const sub = (parts[0] || "help").toLowerCase();

    switch (sub) {
      case "status": {
        const cfgPath = projectConfigPath(ctx.cwd);
        const lines = [
          "⚙️ [LotusScript Modular — Stav konfigurace]:",
          `- LSP kontrola: ${config.enableLsp ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Přepisovat .lss zdroják: ${config.overwriteSourceLss ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Uklízet složku po dokončení: ${config.cleanupOnSettled ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Kontrola limitů procedur: ${config.checkProcedureLimits ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Max řádků na proceduru: ${config.maxProcedureLines}`,
          `- Vynucovat české komentáře: ${config.enforceCzechComments ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Scorecard (hodnocení): ${config.enableScorecard ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Rubrika Definition of Done: ${config.enforceGradingRubric ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Sémantické hodnocení JEV: ${config.useJevEvaluation ? "ZAPNUTO" : "VYPNUTO"}`,
          `- JEV model: ${config.jevModel}`,
          `- Předletová kontrola gotchas: ${config.injectPreflightGotchas ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Auto-návrh gotchy z opakované chyby: ${config.autoDraftRecurringGotchas ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Auto-dekompilace při čtení: ${config.autoDecompileOnRead ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Auto-rekompilace při uložení: ${config.autoRecompileOnSave ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Vynucovat lotus-notes KB prompt: ${config.enforceKbPrompt ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Vynucovat zápis gotchas: ${config.enforceGotchaCapture ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Vkládat gotchas souhrn: ${config.injectGotchasSummary ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Zachovat timestamp v názvu: ${config.keepTimestampInCompiledName ? "ZAPNUTO" : "VYPNUTO"}`,
          `- Centrální Gotchas soubor: ${getEffectiveGotchasPath()}`,
          `- Konfigurační soubor: ${cfgPath}`,
        ];
        ctx.ui.notify(lines.join("\n"), "info");
        break;
      }

      case "lsp": {
        const val = (parts[1] || "").toLowerCase();
        if (val === "on") config.enableLsp = true;
        else if (val === "off") config.enableLsp = false;
        else config.enableLsp = !config.enableLsp;
        state.updateConfig(config);
        ctx.ui.notify(`LSP kontrola syntaxe je nyní ${config.enableLsp ? "ZAPNUTA" : "VYPNUTA"}.`, "info");
        break;
      }

      case "overwrite": {
        const val = (parts[1] || "").toLowerCase();
        if (val === "on") config.overwriteSourceLss = true;
        else if (val === "off") config.overwriteSourceLss = false;
        else config.overwriteSourceLss = !config.overwriteSourceLss;
        state.updateConfig(config);
        ctx.ui.notify(`Přepisování původního .lss souboru je nyní ${config.overwriteSourceLss ? "ZAPNUTO" : "VYPNUTO"}.`, "info");
        break;
      }

      case "config": {
        const action = (parts[1] || "").toLowerCase();
        if (action === "get") {
          const key = parts[2];
          if (!key) {
            ctx.ui.notify("Použití: /ls config get <klíč>", "warning");
            return;
          }
          const spec = findSetting(key);
          if (!spec) {
            ctx.ui.notify(`Neznámé nastavení: ${key}`, "error");
            return;
          }
          ctx.ui.notify(`${key} = ${formatValue(config[spec.key])} (${spec.description})`, "info");
        } else if (action === "set") {
          const key = parts[2];
          const val = parts[3];
          if (!key || val === undefined) {
            ctx.ui.notify("Použití: /ls config set <klíč> <hodnota>", "warning");
            return;
          }
          const spec = findSetting(key);
          if (!spec) {
            ctx.ui.notify(`Neznámé nastavení: ${key}`, "error");
            return;
          }
          const parsed = parseValue(spec, val);
          if (!parsed.ok) {
            ctx.ui.notify(parsed.error, "error");
            return;
          }
          (config as any)[spec.key] = parsed.value;
          state.updateConfig(config);
          ctx.ui.notify(`Uloženo: ${key} = ${formatValue(parsed.value)}`, "info");
        } else {
          ctx.ui.notify("Použití: /ls config [get|set] ...", "warning");
        }
        break;
      }

      case "scaffold": {
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
        break;
      }

      case "lint": {
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
        break;
      }

      case "score": {
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
        break;
      }

      case "jev": {
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
        break;
      }

      case "compile": {
        const target = parts[1] || ctx.cwd;
        const root = findModularRoot(target);
        if (!root) {
          ctx.ui.notify(`Není modulární složka LotusScriptu: ${target}`, "error");
          return;
        }
        try {
          const compiled = AgentParser.compileAgent(root, {
            keepTimestamp: config.keepTimestampInCompiledName,
            overwriteSourceLss: config.overwriteSourceLss,
            createLssForDxl: true,
          });
          let lspRes: LspCheckResult | null = null;
          let lspLine: string;
          if (config.enableLsp) {
            lspRes = await checkLotusScriptDiagnostics(compiled);
            lspLine = lspRes.ok
              ? `Sestaveno ${path.basename(compiled)} (LSP čisté)`
              : `Sestaveno s LSP chybami:\n${lspRes.diagnostics}`;
          } else {
            lspLine = `Sestaveno: ${compiled}`;
          }
          const out = [lspLine];
          if (config.enableScorecard) {
            const lintRes = lintModularFolder(root, config.maxProcedureLines, config.enforceCzechComments);
            const sc = state.buildScorecard(root, { lint: lintRes, lsp: lspRes, artifact: "pending" });
            out.push("", formatScorecard(sc, state.scoreHistory.get(root)?.at(-1)));
          }
          ctx.ui.notify(out.join("\n"), lspRes && !lspRes.ok ? "warning" : "info");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          ctx.ui.notify(`Chyba kompilace: ${msg}`, "error");
        }
        break;
      }

      case "pack":
      case "clean": {
        const target = parts[1] || ctx.cwd;
        const root = findModularRoot(target);
        if (!root) {
          ctx.ui.notify(`Není modulární složka LotusScriptu: ${target}`, "error");
          return;
        }
        try {
          const lintRes = lintModularFolder(root, config.maxProcedureLines, config.enforceCzechComments);
          const finalLss = AgentParser.compileAgent(root, {
            overwriteSourceLss: config.overwriteSourceLss,
            createLssForDxl: true,
            deleteModularDir: true,
          });
          let lspRes: LspCheckResult | null = null;
          let lspLine: string;
          if (config.enableLsp) {
            lspRes = await checkLotusScriptDiagnostics(finalLss);
            lspLine = lspRes.ok
              ? `Sestaveno a uklizeno: ${path.basename(finalLss)} (LSP čisté)`
              : `Sestaveno s chybami LSP:\n${lspRes.diagnostics}`;
          } else {
            lspLine = `Sestaveno do: ${finalLss} a modulární složka byla smazána.`;
          }
          const out = [lspLine];
          if (config.enableScorecard) {
            const sc = state.buildScorecard(root, {
              lint: lintRes,
              lsp: lspRes,
              artifact: "written",
              manifestSynced: true,
            });
            out.push("", formatScorecard(sc, state.scoreHistory.get(root)?.at(-1)));
          }
          ctx.ui.notify(out.join("\n"), lspRes && !lspRes.ok ? "warning" : "info");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          ctx.ui.notify(`Chyba při úklidu: ${msg}`, "error");
        }
        break;
      }

      case "decompile": {
        const target = parts[1];
        if (!target) {
          ctx.ui.notify("Použití: /ls decompile <cesta k souboru .lss nebo .dxl>", "warning");
          return;
        }
        const resolved = path.resolve(target);
        if (!fs.existsSync(resolved)) {
          ctx.ui.notify(`Soubor nenalezen: ${resolved}`, "error");
          return;
        }
        try {
          let outDir = "";
          if (resolved.toLowerCase().endsWith(".dxl")) {
            outDir = AgentParser.decompileDxl(resolved) || "";
          } else {
            outDir = AgentParser.decompileLss(resolved);
          }
          ctx.ui.notify(`Dekompilováno do: ${outDir}`, "info");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          ctx.ui.notify(`Chyba dekompilace: ${msg}`, "error");
        }
        break;
      }

      case "gotchas": {
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
          break;
        }

        const query = parts.slice(1).join(" ").trim();
        if (!query || query === "summary") {
          ctx.ui.notify(getGotchasSummary(12), "info");
        } else {
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
        break;
      }

      case "help":
      default: {
        const help = [
          "📖 [Příkazy /ls — LotusScript Modular]:",
          "  /ls status                 — Zobrazit konfiguraci pluginu",
          "  /ls config get <klíč>      — Vypsat hodnotu nastavení",
          "  /ls config set <klíč> <v>  — Nastavit hodnotu (true/false)",
          "  /ls scaffold <typ> [název] — Vytvořit kostru (agent, library, procedure, modular)",
          "  /ls lsp [on|off]           — Zapnout/vypnout LSP kontrolu",
          "  /ls overwrite [on|off]     — Zapnout/vypnout přepis .lss souboru",
          "  /ls compile [složka]       — Ručně sestavit modulárního agenta",
          "  /ls lint [složka]          — Zkontrolovat délku procedur a komentáře",
          "  /ls score [složka]         — Zobrazit scorecard a trend agenta",
          "  /ls jev [on|off|složka]    — Sémantické hodnocení JEV (nový vs starý styl, rizika)",
          "  /ls pack [složka]          — Sestavit do .lss a smazat modulární složku",
          "  /ls decompile <soubor>     — Rozložit monolit .lss/.dxl",
          "  /ls gotchas [dotaz]        — Prohledat centrální bázi 40+ gotchas",
        ].join("\n");
        ctx.ui.notify(help, "info");
        break;
      }
    }
  }

  return {
    description: "Správa modulárních LotusScript agentů, LSP a Gotchas báze",
    getArgumentCompletions: (prefix: string) => {
      return completeLsArguments(prefix, config);
    },
    handler,
  };
}

export type { AgentScorecard };
