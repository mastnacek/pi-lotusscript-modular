import type { ModularConfig, SettingsCompletion } from "../../shared/types.js";
import { stringsFor, type Strings } from "../../shared/i18n.js";
import { findSetting, formatValue, settingCopy, SETTING_SPECS } from "./catalogue.js";

interface Suggestion {
  value: string;
  description: string;
  space?: boolean;
  label?: string;
}

/** Dedicated toggle subcommands that map onto a boolean setting from the catalogue. */
const TOGGLE_KEYS = new Map<string, keyof ModularConfig>([
  ["lsp", "enableLsp"],
]);

function directSettingSubcommands(s: Strings): readonly Suggestion[] {
  return SETTING_SPECS.map((spec) => ({
    value: spec.key,
    description: settingCopy(spec.key, s === stringsFor("en") ? "en" : "cs").description,
    space: true,
  }));
}

function lsSubcommands(s: Strings): readonly Suggestion[] {
  const c = s.completions;
  return [
    { value: "status", description: c.subStatus },
    { value: "--global", description: c.subGlobal, space: true },
    { value: "scaffold", description: c.subScaffold, space: true },
    { value: "lang", description: s.lang.description, space: true },
    { value: "lsp", description: c.subLsp, space: true },
    { value: "check", description: c.subCheck, space: true },
    { value: "score", description: c.subScore, space: true },
    { value: "gotchas", description: c.subGotchas, space: true },
    ...directSettingSubcommands(s).filter(
      (x) => x.value !== "enableLsp" 
    ),
    { value: "config", description: c.subConfig, space: true },
    { value: "help", description: c.subHelp },
  ];
}

function configActions(s: Strings): readonly Suggestion[] {
  return [
    { value: "get", description: s.completions.configGet, space: true },
    { value: "set", description: s.completions.configSet, space: true },
  ];
}

function scaffoldTypes(s: Strings): readonly Suggestion[] {
  const c = s.completions;
  return [
    { value: "agent", description: c.scaffoldAgent, space: true },
    { value: "library", description: c.scaffoldLibrary, space: true },
  ];
}

function gotchasTopics(s: Strings): readonly Suggestion[] {
  const c = s.completions;
  return [
    { value: "summary", description: c.gotchasSummary },
    { value: "add", description: c.gotchasAdd, space: true },
    { value: "shell", description: c.topicShell },
    { value: "forall", description: c.topicForall },
    { value: "const", description: c.topicConst },
    { value: "option", description: c.topicOption },
    { value: "variant", description: c.topicVariant },
    { value: "computewithform", description: c.topicComputewithform },
    { value: "replaceall", description: c.topicReplaceall },
  ];
}

/** Locale picker: cs|en, active choice marked in label + description. */
function langItems(base: string, current: ModularConfig, s: Strings, prefix: string): SettingsCompletion[] | null {
  const active = current.lang.trim().toLowerCase().startsWith("en") ? "en" : "cs";
  return filter(base, [
    {
      value: "cs",
      label: active === "cs" ? "cs ✓" : "cs",
      description: `${s.lang.localeCs}${active === "cs" ? s.completions.markActive : s.completions.markInactive}`,
    },
    {
      value: "en",
      label: active === "en" ? "en ✓" : "en",
      description: `${s.lang.localeEn}${active === "en" ? s.completions.markActive : s.completions.markInactive}`,
    },
  ], prefix);
}

function filter(base: string, suggestions: readonly Suggestion[], prefix: string): SettingsCompletion[] | null {
  const items = suggestions
    .filter((s) => s.value.startsWith(prefix))
    .map((s) => ({
      value: `${base}${s.value}${s.space ? " " : ""}`,
      label: s.label ?? s.value,
      description: s.description,
    }));
  return items.length > 0 ? items : null;
}

/** Boolean setting picker: on|off, active choice marked in label + description. */
function toggleItems(
  base: string,
  key: keyof ModularConfig,
  current: ModularConfig,
  s: Strings,
  prefix: string
): SettingsCompletion[] | null {
  const on = current[key] === true;
  const help = settingCopy(key, current.lang);
  return filter(base, [
    {
      value: "on",
      label: on ? "on ✓" : "on",
      description: `${help.on ?? s.completions.turnOn}${on ? s.completions.markActive : s.completions.markInactive}`,
    },
    {
      value: "off",
      label: on ? "off" : "off ✓",
      description: `${help.off ?? s.completions.turnOff}${on ? s.completions.markInactive : s.completions.markActive}`,
    },
  ], prefix);
}

/** Parent rows naming a boolean setting carry the live state too. */
function annotateState(items: SettingsCompletion[] | null, current: ModularConfig, s: Strings): SettingsCompletion[] | null {
  return items?.map((item) => {
    const token = item.value.trim().toLowerCase();
    const key: keyof ModularConfig | undefined =
      TOGGLE_KEYS.get(token) ??
      (findSetting(token)?.kind === "boolean" ? (token as keyof ModularConfig) : undefined);
    if (!key) return item;
    const marker = current[key] === true ? s.completions.markOn : s.completions.markOff;
    return { ...item, description: `${item.description}${marker}` };
  }) ?? null;
}

function completeKeys(base: string, current: ModularConfig, s: Strings, prefix: string): SettingsCompletion[] | null {
  const items = SETTING_SPECS.filter((spec) => spec.key.startsWith(prefix)).map((spec) => ({
    value: `${base}${spec.key} `,
    label: spec.key,
    description: `${settingCopy(spec.key, current.lang).description} ${s.completions.now(formatValue(current[spec.key]))}`,
  }));
  return items.length > 0 ? items : null;
}

function completeValues(
  base: string,
  key: string,
  current: ModularConfig,
  s: Strings,
  prefix: string
): SettingsCompletion[] | null {
  const spec = findSetting(key);
  if (!spec) return null;

  if (spec.kind === "boolean") {
    return toggleItems(base, spec.key, current, s, prefix);
  }

  if (spec.kind === "number") {
    const numbers: readonly Suggestion[] = [
      { value: "100", description: s.completions.lines(100) },
      { value: "200", description: s.completions.lines(200) },
      { value: "300", description: s.completions.linesDefault(300) },
      { value: "500", description: s.completions.lines(500) },
    ];
    return filter(base, numbers, prefix);
  }

  return null;
}

export function completeLsArguments(
  prefix: string,
  current: ModularConfig
): SettingsCompletion[] | null {
  const s = stringsFor(current.lang);
  const trimmed = prefix.trimStart();

  // Support --global prefix
  if (trimmed.startsWith("--global")) {
    const afterGlobal = trimmed.slice(8).trimStart();
    const hasTrailingSpace = trimmed.length > 8 || /\s$/.test(prefix);

    if (!hasTrailingSpace && afterGlobal === "") {
      return annotateState(filter("", lsSubcommands(s), trimmed), current, s);
    }

    const subCompletions = completeLsArgumentsClean(afterGlobal, current, s);
    if (!subCompletions) return null;

    return subCompletions.map((item) => ({
      value: `--global ${item.value}`,
      label: item.label,
      description: item.description,
    }));
  }

  return completeLsArgumentsClean(trimmed, current, s);
}

function completeLsArgumentsClean(
  trimmed: string,
  current: ModularConfig,
  s: Strings
): SettingsCompletion[] | null {
  if (!trimmed.includes(" ")) {
    // Lazy parameter completion: a fully typed non-terminal token already yields
    // its parameter list — after a trailing-space Tab the picker never reopens.
    const typed = trimmed.toLowerCase();
    if (typed === "lang") return langItems(`${typed} `, current, s, "");
    const toggleKey = TOGGLE_KEYS.get(typed);
    if (toggleKey) return toggleItems(`${typed} `, toggleKey, current, s, "");
    if (findSetting(typed)) return completeValues(`${typed} `, typed, current, s, "");
    return annotateState(filter("", lsSubcommands(s), trimmed), current, s);
  }

  const [sub] = trimmed.split(/\s+/);
  if (!sub) return null;

  const afterSub = trimmed.slice(sub.length).trimStart();

  if (sub.toLowerCase() === "lang") {
    return langItems(`${sub} `, current, s, afterSub);
  }

  const toggleKey = TOGGLE_KEYS.get(sub.toLowerCase());
  if (toggleKey) {
    return toggleItems(`${sub} `, toggleKey, current, s, afterSub);
  }

  if (sub === "scaffold") {
    return filter("scaffold ", scaffoldTypes(s), afterSub);
  }

  if (sub === "gotchas") {
    return filter(`${sub} `, gotchasTopics(s), afterSub);
  }

  // Direct setting completions (e.g. /ls enforceKbGate <true|false>)
  const directSpec = findSetting(sub);
  if (directSpec) {
    return completeValues(`${sub} `, sub, current, s, afterSub);
  }

  if (sub === "config") {
    if (!afterSub.includes(" ")) {
      return filter("config ", configActions(s), afterSub);
    }

    const [action] = afterSub.split(/\s+/);
    if (!action) return null;

    const afterAction = afterSub.slice(action.length).trimStart();

    if (action === "get") {
      return completeKeys("config get ", current, s, afterAction);
    }

    if (action === "set") {
      if (!afterAction.includes(" ")) {
        return completeKeys("config set ", current, s, afterAction);
      }
      const [key] = afterAction.split(/\s+/);
      if (!key) return null;
      const afterKey = afterAction.slice(key.length).trimStart();
      return completeValues(`config set ${key} `, key, current, s, afterKey);
    }
  }

  return null;
}
