import type { ModularConfig, SettingsCompletion } from "../../shared/types.js";
import { findSetting, formatValue, SETTING_SPECS } from "./catalogue.js";

interface Suggestion {
  value: string;
  description: string;
  space?: boolean;
}

const DIRECT_SETTING_SUBCOMMANDS: readonly Suggestion[] = SETTING_SPECS.map((s) => ({
  value: s.key,
  description: s.description,
  space: true,
}));

export const LS_SUBCOMMANDS: readonly Suggestion[] = [
  { value: "status", description: "Zobrazit aktuální konfiguraci pluginu" },
  { value: "--global", description: "Uložit následující nastavení globálně (~/.pi/agent/)", space: true },
  { value: "scaffold", description: "Vytvořit kostru LotusScript kódu (agent, library, procedure, modular)", space: true },
  { value: "lsp", description: "Přepnout LotusScript LSP kontrolu: on | off", space: true },
  { value: "overwrite", description: "Přepnout přepisování .lss souboru: on | off", space: true },
  { value: "compile", description: "Sestavit modulární složku do _compiled.lss", space: true },
  { value: "pack", description: "Sestavit do .lss a smazat modulární složku", space: true },
  { value: "lint", description: "Zkontrolovat délku procedur (max 300 řádků) a komentáře", space: true },
  { value: "score", description: "Zobrazit scorecard a trend hodnocení agenta", space: true },
  { value: "jev", description: "Sémantické hodnocení komentářů a rizik modelem JEV (OpenRouter)", space: true },
  { value: "decompile", description: "Rozložit monolitický .lss nebo .dxl do podsložky", space: true },
  { value: "gotchas", description: "Vyhledat v databázi LotusScript Gotchas (40+ pravidel)", space: true },
  ...DIRECT_SETTING_SUBCOMMANDS.filter((s) => !["enableLsp", "overwriteSourceLss", "useJevEvaluation"].includes(s.value)),
  { value: "config", description: "Zobrazit nebo změnit nastavení (get/set, legacy)", space: true },
  { value: "help", description: "Zobrazit nápovědu příkazů" },
];

const CONFIG_ACTIONS: readonly Suggestion[] = [
  { value: "get", description: "Vypsat aktuální hodnotu nastavení", space: true },
  { value: "set", description: "Uložit novou hodnotu nastavení", space: true },
];

const SCAFFOLD_TYPES: readonly Suggestion[] = [
  { value: "agent", description: "Samostatný LotusScript agent (.lss) s ošetřením chyb", space: true },
  { value: "library", description: "Knihovna skriptů (Script Library .lss)", space: true },
  { value: "procedure", description: "Procedura (sub_ nebo func_) do modulární složky", space: true },
  { value: "modular", description: "Kompletní modulární složka (manifest, options, declarations, subs)", space: true },
];

const TOGGLE_VALUES: readonly Suggestion[] = [
  { value: "on", description: "Zapnout" },
  { value: "off", description: "Vypnout" },
];

const GOTCHAS_TOPICS: readonly Suggestion[] = [
  { value: "summary", description: "Zobrazit souhrn klíčových chyb" },
  { value: "add", description: "Přidat novou gotchu se schvalovacím dialogem", space: true },
  { value: "shell", description: "Shell jako název proměnné (vyhrazené slovo)" },
  { value: "forall", description: "ForAll a alias proměnná" },
  { value: "const", description: "Deklarace Const bez As Type" },
  { value: "option", description: "Option Declare a Option Public duplicity" },
  { value: "variant", description: "Variant vs Integer u Notes API" },
  { value: "computewithform", description: "Chování ComputeWithForm u formulářů" },
  { value: "replaceall", description: "Replace vs ReplaceAll a prázdné řetězce" },
];

function filter(base: string, suggestions: readonly Suggestion[], prefix: string): SettingsCompletion[] | null {
  const items = suggestions
    .filter((s) => s.value.startsWith(prefix))
    .map((s) => ({
      value: `${base}${s.value}${s.space ? " " : ""}`,
      label: s.value,
      description: s.description,
    }));
  return items.length > 0 ? items : null;
}

function completeKeys(base: string, current: ModularConfig, prefix: string): SettingsCompletion[] | null {
  const items = SETTING_SPECS.filter((spec) => spec.key.startsWith(prefix)).map((spec) => ({
    value: `${base}${spec.key} `,
    label: spec.key,
    description: `${spec.description} (nyní: ${formatValue(current[spec.key])})`,
  }));
  return items.length > 0 ? items : null;
}

function completeValues(base: string, key: string, prefix: string): SettingsCompletion[] | null {
  const spec = findSetting(key);
  if (!spec) return null;

  if (spec.kind === "boolean") {
    const booleans: readonly Suggestion[] = [
      { value: "true", description: spec.valueHelp?.true ?? "Povolit" },
      { value: "false", description: spec.valueHelp?.false ?? "Zakázat" },
    ];
    return filter(base, booleans, prefix);
  }

  if (spec.kind === "number") {
    const numbers: readonly Suggestion[] = [
      { value: "100", description: "100 řádků" },
      { value: "200", description: "200 řádků" },
      { value: "300", description: "300 řádků (výchozí limit)" },
      { value: "500", description: "500 řádků" },
    ];
    return filter(base, numbers, prefix);
  }

  return null;
}

export function completeLsArguments(
  prefix: string,
  current: ModularConfig
): SettingsCompletion[] | null {
  const trimmed = prefix.trimStart();

  // Support --global prefix
  if (trimmed.startsWith("--global")) {
    const afterGlobal = trimmed.slice(8).trimStart();
    const hasTrailingSpace = trimmed.length > 8 || /\s$/.test(prefix);

    if (!hasTrailingSpace && afterGlobal === "") {
      return filter("", LS_SUBCOMMANDS, trimmed);
    }

    const subCompletions = completeLsArgumentsClean(afterGlobal, current);
    if (!subCompletions) return null;

    return subCompletions.map((item) => ({
      value: `--global ${item.value}`,
      label: item.label,
      description: item.description,
    }));
  }

  return completeLsArgumentsClean(trimmed, current);
}

function completeLsArgumentsClean(
  trimmed: string,
  current: ModularConfig
): SettingsCompletion[] | null {
  if (!trimmed.includes(" ")) {
    return filter("", LS_SUBCOMMANDS, trimmed);
  }

  const [sub] = trimmed.split(/\s+/);
  if (!sub) return null;

  const afterSub = trimmed.slice(sub.length).trimStart();

  if (sub === "lsp" || sub === "overwrite" || sub === "jev") {
    return filter(`${sub} `, TOGGLE_VALUES, afterSub);
  }

  if (sub === "scaffold") {
    return filter("scaffold ", SCAFFOLD_TYPES, afterSub);
  }

  if (sub === "gotchas") {
    return filter(`${sub} `, GOTCHAS_TOPICS, afterSub);
  }

  // Direct setting completions (e.g. /ls checkProcedureLimits <true|false>)
  const directSpec = findSetting(sub);
  if (directSpec) {
    return completeValues(`${sub} `, sub, afterSub);
  }

  if (sub === "config") {
    if (!afterSub.includes(" ")) {
      return filter("config ", CONFIG_ACTIONS, afterSub);
    }

    const [action] = afterSub.split(/\s+/);
    if (!action) return null;

    const afterAction = afterSub.slice(action.length).trimStart();

    if (action === "get") {
      return completeKeys("config get ", current, afterAction);
    }

    if (action === "set") {
      if (!afterAction.includes(" ")) {
        return completeKeys("config set ", current, afterAction);
      }
      const [key] = afterAction.split(/\s+/);
      if (!key) return null;
      const afterKey = afterAction.slice(key.length).trimStart();
      return completeValues(`config set ${key} `, key, afterKey);
    }
  }

  return null;
}
