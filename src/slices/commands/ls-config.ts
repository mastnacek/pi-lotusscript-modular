/**
 * `/ls` subcommand handlers — status / lsp / overwrite / config / help.
 * Split out of commands/index.ts for the per-file line limit; the switch in
 * index.ts dispatches into these pure-async functions.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { projectConfigPath } from "../../shared/config.js";
import { getEffectiveGotchasPath } from "../gotchas/index.js";
import { findSetting, formatValue, parseValue } from "../settings/index.js";
import type { PluginState } from "../../shared/state.js";

export type LsParts = string[];

export async function lsStatus(state: PluginState, _parts: LsParts, ctx: ExtensionCommandContext): Promise<void> {
  const config = state.config;
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
}

export async function lsLsp(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext): Promise<void> {
  const config = state.config;
  const val = (parts[1] || "").toLowerCase();
  if (val === "on") config.enableLsp = true;
  else if (val === "off") config.enableLsp = false;
  else config.enableLsp = !config.enableLsp;
  state.updateConfig(config);
  ctx.ui.notify(`LSP kontrola syntaxe je nyní ${config.enableLsp ? "ZAPNUTA" : "VYPNUTA"}.`, "info");
}

export async function lsOverwrite(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext): Promise<void> {
  const config = state.config;
  const val = (parts[1] || "").toLowerCase();
  if (val === "on") config.overwriteSourceLss = true;
  else if (val === "off") config.overwriteSourceLss = false;
  else config.overwriteSourceLss = !config.overwriteSourceLss;
  state.updateConfig(config);
  ctx.ui.notify(`Přepisování původního .lss souboru je nyní ${config.overwriteSourceLss ? "ZAPNUTO" : "VYPNUTO"}.`, "info");
}

export async function lsConfig(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext): Promise<void> {
  const config = state.config;
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
}

export async function lsHelp(_state: PluginState, _parts: LsParts, ctx: ExtensionCommandContext): Promise<void> {
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
}
