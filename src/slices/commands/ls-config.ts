/**
 * `/ls` subcommand handlers — status / lang / lsp / overwrite / config / help.
 * Split out of commands/index.ts for the per-file line limit; the switch in
 * index.ts dispatches into these pure-async functions.
 *
 * Cross-slice capabilities arrive via CommandsDeps (slice isolation, VSA).
 * All user-facing text resolves through the i18n string table
 * (pi-plugin-dev §10); model-facing text never appears here.
 *
 * Config cascade: the `--global` flag is parsed by the dispatcher
 * (commands/index.ts) and arrives here as `isGlobal`; every mutating handler
 * threads it into state.updateConfig(...), which persists to
 * ~/.pi/agent/lotusscript-modular.json when set, else <cwd>/.pi/.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { projectConfigPath } from "../../shared/config.js";
import { LOCALES, normalizeLocale, stringsFor } from "../../shared/i18n.js";
import type { PluginState } from "../../shared/state.js";
import type { CommandsDeps } from "./deps.js";

export type LsParts = string[];

export async function lsStatus(state: PluginState, _parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps): Promise<void> {
  const config = state.config;
  const s = stringsFor(config.lang);
  const t = s.status;
  const flag = (v: boolean) => (v ? s.on : s.off);
  const cfgPath = projectConfigPath(ctx.cwd);
  const lines = [
    t.title,
    `- ${t.lspCheck}: ${flag(config.enableLsp)}`,
    `- ${t.overwriteSource}: ${flag(config.overwriteSourceLss)}`,
    `- ${t.cleanup}: ${flag(config.cleanupOnSettled)}`,
    `- ${t.procLimits}: ${flag(config.checkProcedureLimits)}`,
    `- ${t.maxLines}: ${config.maxProcedureLines}`,
    `- ${t.czechComments}: ${flag(config.enforceCzechComments)}`,
    `- ${t.scorecard}: ${flag(config.enableScorecard)}`,
    `- ${t.rubric}: ${flag(config.enforceGradingRubric)}`,
    `- ${t.preflight}: ${flag(config.injectPreflightGotchas)}`,
    `- ${t.autoDraft}: ${flag(config.autoDraftRecurringGotchas)}`,
    `- ${t.autoDecompile}: ${flag(config.autoDecompileOnRead)}`,
    `- ${t.autoRecompile}: ${flag(config.autoRecompileOnSave)}`,
    `- ${t.kbPrompt}: ${flag(config.enforceKbPrompt)}`,
    `- ${t.gotchaCapture}: ${flag(config.enforceGotchaCapture)}`,
    `- ${t.gotchasSummary}: ${flag(config.injectGotchasSummary)}`,
    `- ${t.timestamp}: ${flag(config.keepTimestampInCompiledName)}`,
    `- ${t.langLabel}: ${normalizeLocale(config.lang)}`,
    `- ${t.gotchasFile}: ${deps.getEffectiveGotchasPath()}`,
    `- ${t.configFile}: ${cfgPath}`,
  ];
  ctx.ui.notify(lines.join("\n"), "info");
}

/**
 * `/ls lang [cs|en]` — the persisted `lang` config key is the only source of
 * truth for the UI locale (never LANG/LC_ALL/Intl). An unknown code is a
 * usage error: refuse it, write nothing.
 */
export async function lsLang(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps, isGlobal = false): Promise<void> {
  void deps;
  const s = stringsFor(state.config.lang);
  const val = (parts[1] || "").trim().toLowerCase();
  if (!val) {
    ctx.ui.notify(s.lang.current(normalizeLocale(state.config.lang)), "info");
    return;
  }
  if (!(LOCALES as readonly string[]).includes(val)) {
    ctx.ui.notify(s.lang.unknown(val), "error");
    return;
  }
  const config = state.config;
  config.lang = val;
  state.updateConfig(config, isGlobal, ctx.cwd);
  // Confirm in the NEW locale — the user immediately sees the switch worked.
  ctx.ui.notify(stringsFor(val).lang.set(val, isGlobal), "info");
}

export async function lsLsp(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps, isGlobal = false): Promise<void> {
  void deps;
  const config = state.config;
  const val = (parts[1] || "").toLowerCase();
  if (val === "on") config.enableLsp = true;
  else if (val === "off") config.enableLsp = false;
  else config.enableLsp = !config.enableLsp;
  state.updateConfig(config, isGlobal, ctx.cwd);
  ctx.ui.notify(stringsFor(config.lang).set.lspToggled(config.enableLsp, isGlobal), "info");
}

export async function lsOverwrite(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps, isGlobal = false): Promise<void> {
  void deps;
  const config = state.config;
  const val = (parts[1] || "").toLowerCase();
  if (val === "on") config.overwriteSourceLss = true;
  else if (val === "off") config.overwriteSourceLss = false;
  else config.overwriteSourceLss = !config.overwriteSourceLss;
  state.updateConfig(config, isGlobal, ctx.cwd);
  ctx.ui.notify(stringsFor(config.lang).set.overwriteToggled(config.overwriteSourceLss, isGlobal), "info");
}

export async function lsDirectSetting(state: PluginState, key: string, val: string | undefined, ctx: ExtensionCommandContext, deps: CommandsDeps, isGlobal = false): Promise<void> {
  const config = state.config;
  const s = stringsFor(config.lang);
  const spec = deps.findSetting(key);
  if (!spec) return;

  if (val === undefined || val === "") {
    ctx.ui.notify(s.set.currentValue(spec.key, deps.formatValue(config[spec.key]), deps.settingCopy(spec.key, config.lang).description), "info");
    return;
  }

  const parsed = deps.parseValue(spec, val, config.lang);
  if (!parsed.ok) {
    ctx.ui.notify(parsed.error, "error");
    return;
  }
  Object.assign(config, { [spec.key]: parsed.value });
  state.updateConfig(config, isGlobal, ctx.cwd);
  ctx.ui.notify(s.set.savedKV(isGlobal, key, deps.formatValue(parsed.value)), "info");
}

export async function lsConfig(state: PluginState, parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps, isGlobal = false): Promise<void> {
  const config = state.config;
  const s = stringsFor(config.lang);
  const action = (parts[1] || "").toLowerCase();
  if (action === "get") {
    const key = parts[2];
    if (!key) {
      ctx.ui.notify(s.set.usageConfigGet, "warning");
      return;
    }
    const spec = deps.findSetting(key);
    if (!spec) {
      ctx.ui.notify(s.set.unknownSetting(key), "error");
      return;
    }
    ctx.ui.notify(s.set.currentValue(key, deps.formatValue(config[spec.key]), deps.settingCopy(spec.key, config.lang).description), "info");
  } else if (action === "set") {
    const key = parts[2];
    const val = parts[3];
    if (!key || val === undefined) {
      ctx.ui.notify(s.set.usageConfigSet, "warning");
      return;
    }
    const spec = deps.findSetting(key);
    if (!spec) {
      ctx.ui.notify(s.set.unknownSetting(key), "error");
      return;
    }
    const parsed = deps.parseValue(spec, val, config.lang);
    if (!parsed.ok) {
      ctx.ui.notify(parsed.error, "error");
      return;
    }
    Object.assign(config, { [spec.key]: parsed.value });
    state.updateConfig(config, isGlobal, ctx.cwd);
    ctx.ui.notify(s.set.savedKV(isGlobal, key, deps.formatValue(parsed.value)), "info");
  } else {
    ctx.ui.notify(s.set.usageConfig, "warning");
  }
}

export async function lsHelp(state: PluginState, _parts: LsParts, ctx: ExtensionCommandContext, deps: CommandsDeps): Promise<void> {
  void deps;
  ctx.ui.notify(stringsFor(state.config.lang).help.lines.join("\n"), "info");
}
