import type { ModularConfig, SettingsCompletion } from "../../shared/types.js";
import { findSetting, formatValue, SETTING_SPECS } from "./catalogue.js";

interface Suggestion {
  value: string;
  description: string;
  space?: boolean;
}

export const LS_SUBCOMMANDS: readonly Suggestion[] = [
  { value: "status", description: "Zobrazit aktuální konfiguraci pluginu" },
  { value: "config", description: "Zobrazit nebo změnit nastavení (get/set)", space: true },
  { value: "lsp", description: "Přepnout LotusScript LSP kontrolu: on | off", space: true },
  { value: "overwrite", description: "Přepnout přepisování .lss souboru: on | off", space: true },
  { value: "compile", description: "Sestavit modulární složku do _compiled.lss", space: true },
  { value: "pack", description: "Sestavit do .lss a smazat modulární složku", space: true },
  { value: "lint", description: "Zkontrolovat délku procedur (max 300 řádků) a komentáře", space: true },
  { value: "decompile", description: "Rozložit monolitický .lss nebo .dxl do podsložky", space: true },
  { value: "gotchas", description: "Vyhledat v databázi LotusScript Gotchas (40+ pravidel)", space: true },
  { value: "help", description: "Zobrazit nápovědu příkazů" },
];

const CONFIG_ACTIONS: readonly Suggestion[] = [
  { value: "get", description: "Vypsat aktuální hodnotu nastavení", space: true },
  { value: "set", description: "Uložit novou hodnotu nastavení", space: true },
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

  const booleans: readonly Suggestion[] = [
    { value: "true", description: spec.valueHelp?.true ?? "Povolit" },
    { value: "false", description: spec.valueHelp?.false ?? "Zakázat" },
  ];
  return filter(base, booleans, prefix);
}

export function completeLsArguments(
  prefix: string,
  current: ModularConfig
): SettingsCompletion[] | null {
  const trimmed = prefix.trimStart();

  if (!trimmed.includes(" ")) {
    return filter("", LS_SUBCOMMANDS, trimmed);
  }

  const [sub] = trimmed.split(/\s+/);
  if (!sub) return null;

  const afterSub = trimmed.slice(sub.length).trimStart();

  if (sub === "lsp" || sub === "overwrite") {
    return filter(`${sub} `, TOGGLE_VALUES, afterSub);
  }

  if (sub === "gotchas") {
    return filter(`${sub} `, GOTCHAS_TOPICS, afterSub);
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
