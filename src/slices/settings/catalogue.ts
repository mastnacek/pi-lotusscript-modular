import type { ModularConfig } from "../../shared/types.js";

export type SettingKind = "boolean" | "number" | "string";

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
  {
    key: "cleanupOnSettled",
    kind: "boolean",
    description: "Po dokončení práce agenta sestavit výsledný .lss a smazat dočasnou dekompilovanou složku",
    valueHelp: {
      true: "Zapnuto — automaticky uklidit a smazat dekompilovanou složku po dokončení úkolu",
      false: "Vypnuto — ponechat dekompilovanou složku na disku",
    },
  },
  {
    key: "checkProcedureLimits",
    kind: "boolean",
    description: "Kontrolovat maximální délku procedur (sub/funkcí) a přítomnost komentářů",
    valueHelp: {
      true: "Zapnuto — hlídat limit řádků a komentáře",
      false: "Vypnuto — nekontrolovat",
    },
  },
  {
    key: "maxProcedureLines",
    kind: "number",
    description: "Maximální povolený počet řádků na jednu proceduru / funkci (výchozí: 300)",
  },
  {
    key: "enforceCzechComments",
    kind: "boolean",
    description: "Vynucovat stručné české komentáře s popisem účelu u každé procedury",
    valueHelp: {
      true: "Zapnuto — vyžadovat český popis u procedur",
      false: "Vypnuto — nepovinné",
    },
  },
  {
    key: "enableScorecard",
    kind: "boolean",
    description: "Počitovat a vkládat deterministický scorecard po každé kompilaci agenta",
    valueHelp: {
      true: "Zapnuto — vkládat hodnocení (scorecard) do výsledku kompilace",
      false: "Vypnuto — pouze prose hlášení bez skóre",
    },
  },
  {
    key: "enforceGradingRubric",
    kind: "boolean",
    description: "Vkládat do system promptu Definition of Done a hodnotící rubriku",
    valueHelp: {
      true: "Zapnuto — model dostane DoD a způsob hodnocení",
      false: "Vypnuto — rubrika se nevkládá",
    },
  },
  {
    key: "injectPreflightGotchas",
    kind: "boolean",
    description: "Vkládat místo obecného souhrnu gotchas cílené nálezy podle identifikátorů agenta",
    valueHelp: {
      true: "Zapnuto — předletová kontrola gotchas podle vlastních identifikátorů agenta",
      false: "Vypnuto — vkládat obecný souhrn top gotchas",
    },
  },
  {
    key: "autoDraftRecurringGotchas",
    kind: "boolean",
    description: "Automaticky navrhnout gotchu, když se stejná LSP diagnostika opakuje ve více cyklech",
    valueHelp: {
      true: "Zapnuto — opakovaná chyba se nabídne k uložení jako gotcha (se schválením)",
      false: "Vypnuto — opakované chyby se neevidují",
    },
  },
  {
    key: "useJevEvaluation",
    kind: "boolean",
    description: "Sémantické hodnocení procedur a komentářů modelem JEV (OpenRouter)",
    valueHelp: {
      true: "Zapnuto — posuzovat styl komentářů (nový vs starý) a rizika gotchas modelem JEV",
      false: "Vypnuto — pouze deterministický linter a scorecard",
    },
  },
  {
    key: "jevModel",
    kind: "string",
    description: "Model JEV na OpenRouteru pro Decisions API (výchozí: typesafe/jev-1.13)",
  },
  {
    key: "openrouterApiKey",
    kind: "string",
    description: "Vlastní API klíč pro OpenRouter (pokud není nastaven v OPENROUTER_API_KEY)",
  },
];

export function findSetting(key: string): SettingSpec | undefined {
  return SETTING_SPECS.find((s) => s.key === key);
}

export function parseValue(
  spec: SettingSpec,
  raw: string
): { ok: true; value: boolean | number | string } | { ok: false; error: string } {
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
  if (spec.kind === "number") {
    const num = parseInt(norm, 10);
    if (!Number.isNaN(num) && num > 0) {
      return { ok: true, value: num };
    }
    return {
      ok: false,
      error: `Hodnota pro '${spec.key}' musí být kladné celé číslo (zadáno: '${raw}')`,
    };
  }
  if (spec.kind === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: false, error: `Hodnota pro '${spec.key}' nesmí být prázdná` };
    }
    return { ok: true, value: trimmed };
  }
  return { ok: false, error: `Neznámý typ nastavení: ${spec.kind}` };
}

export function formatValue(val: unknown): string {
  if (typeof val === "boolean") return val ? "true" : "false";
  return String(val ?? "");
}
