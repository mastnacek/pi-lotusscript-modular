import type { ModularConfig } from "../../shared/types.js";

export type SettingKind = "boolean";

export interface SettingSpec {
  key: keyof ModularConfig;
  kind: SettingKind;
  description: string;
  valueHelp?: Readonly<Record<string, string>>;
}

export const SETTING_SPECS: readonly SettingSpec[] = [
  {
    key: "enableLsp",
    kind: "boolean",
    description: "Spouštět LotusScript LSP kontrolu syntaxe po rekompilaci",
    valueHelp: {
      true: "Zapnuto — ověřovat syntaxi přes LotusScript LSP server",
      false: "Vypnuto — přeskočit kontrolu LSP",
    },
  },
  {
    key: "overwriteSourceLss",
    kind: "boolean",
    description: "Při rekompilaci přepsat původní .lss soubor na disku (pro .dxl se ignoruje)",
    valueHelp: {
      true: "Zapnuto — synchronizovat zdrojový .lss soubor",
      false: "Vypnuto — zapisovat pouze do modular/<Nazev>_compiled.lss",
    },
  },
  {
    key: "autoDecompileOnRead",
    kind: "boolean",
    description: "Automaticky dekompilovat monolit při čtení (read)",
    valueHelp: {
      true: "Zapnuto — rozložit monolit do podsložky a číst main.lss",
      false: "Vypnuto — číst původní monolit beze změn",
    },
  },
  {
    key: "autoRecompileOnSave",
    kind: "boolean",
    description: "Automaticky rekompilovat při editaci procedurálních .lss souborů",
    valueHelp: {
      true: "Zapnuto — při uložení sub_*.lss sestavit kód",
      false: "Vypnuto — kompilovat pouze ručně přes /ls compile",
    },
  },
  {
    key: "enforceKbPrompt",
    kind: "boolean",
    description: "Vynucovat dotaz do lotus-notes MCP znalostní báze před úpravami",
    valueHelp: {
      true: "Zapnuto — vkládat pravidlo do promptu a výstupů nástrojů",
      false: "Vypnuto — nevkládat připomínku",
    },
  },
  {
    key: "injectGotchasSummary",
    kind: "boolean",
    description: "Vkládat přehled klíčových LotusScript Gotchas do kontextu",
    valueHelp: {
      true: "Zapnuto — vložit souhrn gotchas při čtení modulárních skriptů",
      false: "Vypnuto — gotchas dostupné pouze přes /ls gotchas",
    },
  },
  {
    key: "enforceGotchaCapture",
    kind: "boolean",
    description: "Vynucovat zaznamenávání nově objevených chyb a gotchas",
    valueHelp: {
      true: "Zapnuto — připomínat povinnost uložit nový gotcha po vyřešení problému",
      false: "Vypnuto — nepovinné",
    },
  },
  {
    key: "keepTimestampInCompiledName",
    kind: "boolean",
    description: "Vytvářet navíc soubory s časovou značkou (<Nazev>_<timestamp>_compiled.lss)",
    valueHelp: {
      true: "Zapnuto — ukládat timestamp kopie",
      false: "Vypnuto — pouze stabilní <Nazev>_compiled.lss",
    },
  },
];

export function findSetting(key: string): SettingSpec | undefined {
  return SETTING_SPECS.find((s) => s.key === key);
}

export function parseValue(
  spec: SettingSpec,
  raw: string
): { ok: true; value: boolean } | { ok: false; error: string } {
  const norm = raw.trim().toLowerCase();
  if (spec.kind === "boolean") {
    if (norm === "true" || norm === "on" || norm === "1" || norm === "yes" || norm === "ano") {
      return { ok: true, value: true };
    }
    if (norm === "false" || norm === "off" || norm === "0" || norm === "no" || norm === "ne") {
      return { ok: true, value: false };
    }
    return {
      ok: false,
      error: `Hodnota pro '${spec.key}' musí být 'true' nebo 'false' (zadáno: '${raw}')`,
    };
  }
  return { ok: false, error: `Neznámý typ nastavení: ${spec.kind}` };
}

export function formatValue(val: unknown): string {
  if (typeof val === "boolean") return val ? "true" : "false";
  return String(val ?? "");
}
