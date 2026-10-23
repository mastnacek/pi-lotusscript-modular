/**
 * Czech locale — the plugin's original UI language. Strings here are the
 * verbatim copy that used to be hardcoded at the call sites.
 */

import type { Strings } from "./i18n.js";

export const STRINGS_CS: Strings = {
  cmdDescription: "Správa modulárních LotusScript agentů, LSP a Gotchas báze",
  on: "ZAPNUTO",
  off: "VYPNUTO",
  onF: "ZAPNUTA",
  offF: "VYPNUTA",

  status: {
    title: "⚙️ [LotusScript Modular — Stav konfigurace]:",
    lspCheck: "LSP kontrola",
    scorecard: "Scorecard (hodnocení)",
    rubric: "Rubrika Definition of Done",
    preflight: "Předletová kontrola gotchas",
    autoDraft: "Auto-návrh gotchy z opakované chyby",
    autoCheck: "Auto-kontrola celého souboru po úpravě",
    kbPrompt: "Vynucovat lotus-notes KB prompt",
    kbGate: "Vynucovat tvrdou lotus-notes KB bránu",
    kbSettle: "Ověřit KB před ukončením běhu",
    kbMin: "Min. počet KB dotazů za běh",
    gotchaCapture: "Vynucovat zápis gotchas",
    gotchasSummary: "Vkládat gotchas souhrn",
    langLabel: "Jazyk rozhraní",
    gotchasFile: "Centrální Gotchas soubor",
    configFile: "Konfigurační soubor",
  },

  set: {
    lspToggled: (on, isGlobal) =>
      `LSP kontrola syntaxe je nyní ${on ? "ZAPNUTA" : "VYPNUTA"} (uloženo ${isGlobal ? "globálně" : "do projektu"}).`,
    savedKV: (isGlobal, key, value) =>
      `Uloženo (${isGlobal ? "globálně" : "do projektu"}): ${key} = ${value}`,
    currentValue: (key, value, description) => `${key} = ${value} (${description})`,
    unknownSetting: (key) => `Neznámé nastavení: ${key}`,
    usageConfigGet: "Použití: /ls config get <klíč>",
    usageConfigSet: "Použití: /ls config set <klíč> <hodnota>",
    usageConfig: "Použití: /ls config [get|set] ... nebo přímo /ls <nastavení> <hodnota>",
  },

  errors: {
    boolExpected: (key, raw) =>
      `Hodnota pro '${key}' musí být 'true' nebo 'false' (zadáno: '${raw}')`,
    numberExpected: (key, raw) =>
      `Hodnota pro '${key}' musí být kladné celé číslo (zadáno: '${raw}')`,
    emptyNotAllowed: (key) => `Hodnota pro '${key}' nesmí být prázdná`,
    unknownKind: (kind) => `Neznámý typ nastavení: ${kind}`,
  },

  lang: {
    description: "Přepnout jazyk rozhraní: cs | en",
    current: (lang) => `Aktuální jazyk rozhraní: ${lang}`,
    set: (lang, isGlobal) =>
      `Jazyk rozhraní nastaven na '${lang}' (uloženo ${isGlobal ? "globálně" : "do projektu"}).`,
    unknown: (raw) => `Neznámý jazyk: '${raw}'. Podporované: cs, en`,
    localeCs: "Čeština",
    localeEn: "Angličtina",
  },

  check: {
    usage: (p) => `Použití: /ls check <soubor.lss>${p ? ` (soubor nenalezen: ${p})` : ""}`,
    clean: (name) => `✓ ${name}: celý soubor zkontrolován, 0 chyb`,
    errors: (diagnostics) => `⚠ Chyby překladače:
${diagnostics}`,
    lspDisabled: "LSP kontrola je vypnutá (/ls lsp on) — nebylo co ověřit.",
  },

  scaffoldCmd: {
    usage: "Použití: /ls scaffold <agent|library> [název] [cílová složka]",
    error: (msg) => `Chyba při vytváření kostry: ${msg}`,
  },

  score: {
    history: (n) => `Historie (${n}): `,
  },

  gotchasCmd: {
    addUsage: "Použití: /ls gotchas add <název gotchy>",
    bodyPrompt: "Zadejte popis / tělo gotchy:",
    bodyPlaceholder: "Popište problém a řešení...",
    cancelled: "Zadání zrušeno.",
    saved: (title) => `✓ Gotcha uložena do báze: ${title}`,
    notSaved: "Gotcha nebyla uložena (zrušeno uživatelem).",
    noneFound: (query) => `Žádné gotchas nenalezeny pro výraz: "${query}"`,
  },

  gotchaModal: {
    header: "Schválení nového záznamu 💡",
    titleLabel: "📌 Návrh názvu:",
    bodyLabel: "📋 Návrh popisu / těla gotchy:",
    moreLines: (n) => `... (+ ${n} dalších řádků)`,
    inputPlaceholder: " (napište pokyny pro AI)",
    instructionsEmpty: "Pokyny: (Enter pro zadání)",
    instructionsPrefix: "Pokyny: ",
    actionSave: "💾 [Uložit gotchu]",
    actionSaveHint: "— schválit a zapsat do registru",
    actionCancel: "❌ [Zrušit návrh]",
    actionCancelHint: "— odmítnout a neukládat do báze",
    actionRewrite: "✏️ [Přepsat]",
    choose: "🎯 Zvolte akci (vyberte šipkami ↑ / ↓ a potvrďte klávesou Enter):",
    footer: "💡 ↑↓ navigace • Enter potvrdit • Esc zrušit • psaním píšete pokyny",
    rewritePrompt: "✏️ Instrukce pro přepsání gotchy AI:",
    rewritePlaceholder: "Napište, co má AI v návrhu upravit, doplnit nebo přepsat...",
  },

  skillModal: {
    badge: "🪷 LotusScript projekt",
    question: "detekován — načíst entry skill?",
    detectedLabel: "📁 Doklad o Domino projektu:",
    actionLoad: "🌱 [Načíst skill]",
    actionLoadHint: "— SKILL.md dostane agent jako instrukce hned na startu",
    actionSkip: "⏭️  [Přeskočit]",
    actionSkipHint: "— v promptu zůstane jen ukazatel, skill si přečte sám",
    actionNever: "🚫 [Neptat se v tomto projektu]",
    actionNeverHint: "— uloží skillPrompt=never do .pi/lotusscript-modular.json",
    choose: "🎯 ↑↓ a Enter, nebo y / n / v:",
    footer: "🪷 Esc = přeskočit",
    loaded: (path) => `🪷 Entry skill načten: ${path}`,
    skipped: "🪷 Entry skill přeskočen — ukazatel zůstává v promptu.",
    remembered: "🪷 V tomto projektu se už nezeptám (skillPrompt=never).",
    missing: "🪷 SKILL.md nenalezen — skill nelze načíst.",
  },

  settled: {
    score: (s, m) => ` [skóre: ${s}/${m}]`,
    done: (file, tail) => `🪷 [LotusScript Modular] Hotovo: ${file} ${tail}`,
  },

  recurring: {
    saved: (title) => `✓ Opakovaná chyba uložena jako gotcha: ${title}`,
    declined: "Opakovaná chyba nebyla uložena jako gotcha.",
  },

  toolGotchas: {
    approved: (title) => `✓ Gotcha schválena a zapsána do centrální báze: ${title}`,
    rewritePassed: "Požadavek na přepsání gotchy předán AI...",
    rejected: "Gotcha nebyla uložena (zamítnuto uživatelem).",
  },

  telemetry: {
    hooks: (total, calls, results, settled) =>
      `🪷 LS haky ${total}: volání ${calls} · výsledky ${results} · dokončení ${settled}`,
    reads: (kb) => `   KB dotazy ${kb}`,
    gates: (kb, checks, kbNudges) =>
      `   brány: KB ${kb} · kontroly ${checks} · settle-nudges ${kbNudges}`,
    suffix: (lsp) => `📏 LSP ${lsp}`,
  },

  statusline: {
    checking: (badge) => `🪷 LS${badge}: kontroluji...`,
    clean: (badge) => `🪷 LS${badge}: zkontrolováno ✓`,
    error: (badge) => `🪷 LS${badge}: LSP chyba ⚠`,
  },

  completions: {
    subStatus: "Zobrazit aktuální konfiguraci pluginu",
    subGlobal: "Uložit následující nastavení globálně (~/.pi/agent/)",
    subScaffold: "Vytvořit kostru LotusScript kódu (agent, library)",
    subLsp: "Přepnout LotusScript LSP kontrolu: on | off",
    subCheck: "Zkontrolovat celý .lss soubor překladačem 9.0.1",
    subScore: "Zobrazit scorecard a trend hodnocení souboru",
    subGotchas: "Vyhledat v databázi LotusScript Gotchas (64 pravidel)",
    subConfig: "Zobrazit nebo změnit nastavení (get/set, legacy)",
    subHelp: "Zobrazit nápovědu příkazů",
    configGet: "Vypsat aktuální hodnotu nastavení",
    configSet: "Uložit novou hodnotu nastavení",
    scaffoldAgent: "Samostatný LotusScript agent (.lss) s ošetřením chyb",
    scaffoldLibrary: "Knihovna skriptů (Script Library .lss)",
    gotchasSummary: "Zobrazit souhrn klíčových chyb",
    gotchasAdd: "Přidat novou gotchu se schvalovacím dialogem",
    topicShell: "Shell jako název proměnné (vyhrazené slovo)",
    topicForall: "ForAll a alias proměnná",
    topicConst: "Deklarace Const bez As Type",
    topicOption: "Option Declare a Option Public duplicity",
    topicVariant: "Variant vs Integer u Notes API",
    topicComputewithform: "Chování ComputeWithForm u formulářů",
    topicReplaceall: "Replace vs ReplaceAll a prázdné řetězce",
    turnOn: "Zapnout",
    turnOff: "Vypnout",
    markActive: " · ● AKTIVNÍ",
    markInactive: " · ○ VYPNUTO",
    markOn: " · ● ZAPNUTO",
    markOff: " · ○ VYPNUTO",
    now: (value) => `(nyní: ${value})`,
    kbQueries: (n) => `${n}× kb_search za běh`,
    kbQueriesDefault: (n) => `${n}× kb_search za běh (výchozí)`,
  },

  settings: {
    enableLsp: {
      description: "Spouštět kontrolu celého .lss souboru překladačem 9.0.1",
      on: "Zapnuto — ověřovat syntaxi přes LotusScript LSP server",
      off: "Vypnuto — přeskočit kontrolu LSP",
    },
    autoCheckOnEdit: {
      description: "Po každé úpravě .lss automaticky zkontrolovat celý soubor překladačem 9.0.1",
      on: "Zapnuto — po úpravě proběhne kontrola celého souboru (limit procedur, LSP, scorecard)",
      off: "Vypnuto — kontrolovat jen ručně přes /ls check nebo lotusscript_check",
    },
    showSkillTrace: {
      description: "Zobrazovat v chatu stopu skillu (checkpointy s emoji, nikdy nejde do kontextu modelu)",
      on: "Zapnuto — jednou za session se ukáže načtení skillu, otevřená reference, první zápis, kontrola, verzování a drift",
      off: "Vypnuto — jen statusline",
    },
    driftCheck: {
      description: "Upozornit, když agent znovu implementuje to, co už v projektu dělá skriptová knihovna",
      on: "Zapnuto — HTTP objekt, literál cesty API, vlastní chybový report nebo notes:// URL v agentovi vyvolá hlášku s odkazem na pravidla",
      off: "Vypnuto — žádná kontrola driftu",
    },
    versioningCheck: {
      description: "Po úpravě .lss ověřit, že soubor má hlavičku VERZE/CHANGELOG a že se změnila",
      on: "Zapnuto — úprava bez hlavičky (nebo bez bumpu) dostane hlášku se šablonou a odkazem na referenci",
      off: "Vypnuto — žádný dohled nad verzováním",
    },
    autoFormatOnSave: {
      description: "Před kontrolou automaticky naformátovat editovaný .lss přes LSP (jen ASCII soubory)",
      on: "Zapnuto — LSP formátování proběhne při uložení před kontrolou",
      off: "Vypnuto — formátovat jen na výslovnou žádost (lsp_format)",
    },
    autoExplainLspCodes: {
      description: "K novým chybovým kódům automaticky doplnit nápovědu lsp_explain",
      on: "Zapnuto — každý nový kód LS-0x… / FORMULA-0x… dostane blok nápovědy",
      off: "Vypnuto — kódy se hlásí bez vysvětlení, nápověda na žádost",
    },
    enforceKbPrompt: {
      description: "Vynucovat dotaz do lotus-notes MCP znalostní báze před úpravami",
      on: "Zapnuto — vkládat pravidlo do promptu a výstupů nástrojů",
      off: "Vypnuto — nevkládat připomínku",
    },
    enforceKbGate: {
      description: "Tvrdě blokovat úpravy .lss/.dxl, dokud se v této session neproběhne dotaz do lotus-notes znalostní báze",
      on: "Zapnuto — zamítat úpravy, dokud neproběhne kb_search",
      off: "Vypnuto — pouze připomínat v promptu, neblokovat",
    },
    verifyKbBeforeSettle: {
      description: "Před ukončením běhu vyžadovat dotazy do lotus-notes KB, pokud běh měnil .lss/.dxl zdroje",
      on: "Zapnuto — vložit jedno ověřovací kolo, když běh změnil LotusScript zdroje bez dostatečného počtu kb_search",
      off: "Vypnuto — bez ověření před ukončením",
    },
    minKbSearchesPerRun: {
      description: "Minimální počet kb_search dotazů za běh, který se dotýká LotusScript zdrojů — jeden za každou KB vrstvu (IBM reference, Guirard kniha, community) (výchozí: 3)",
    },
    injectGotchasSummary: {
      description: "Vkládat přehled klíčových LotusScript Gotchas do kontextu",
      on: "Zapnuto — vložit souhrn gotchas při čtení modulárních skriptů",
      off: "Vypnuto — gotchas dostupné pouze přes /ls gotchas",
    },
    enforceGotchaCapture: {
      description: "Vynucovat zaznamenávání nově objevených chyb a gotchas",
      on: "Zapnuto — připomínat povinnost uložit nový gotcha po vyřešení problému",
      off: "Vypnuto — nepovinné",
    },
    enableScorecard: {
      description: "Počítat a vkládat deterministický scorecard po každé kontrole souboru",
      on: "Zapnuto — vkládat hodnocení (scorecard) do výsledku kompilace",
      off: "Vypnuto — pouze prose hlášení bez skóre",
    },
    enforceGradingRubric: {
      description: "Vkládat do system promptu Definition of Done a hodnotící rubriku",
      on: "Zapnuto — model dostane DoD a způsob hodnocení",
      off: "Vypnuto — rubrika se nevkládá",
    },
    injectPreflightGotchas: {
      description:
        "Vkládat místo obecného souhrnu gotchas cílené nálezy podle identifikátorů agenta",
      on: "Zapnuto — předletová kontrola gotchas podle vlastních identifikátorů agenta",
      off: "Vypnuto — vkládat obecný souhrn top gotchas",
    },
    injectProjectSkillHint: {
      description:
        "Ukázat agentovi na entry skill, když pracovní složka obsahuje Domino zdroje (.lss/.dxl/.fl/.ls)",
      on: "Zapnuto — odkaz na SKILL.md v systémovém promptu i v banneru při čtení .lss",
      off: "Vypnuto — skill se nepřipomíná, agent ho musí najít sám",
    },
    skillPrompt: {
      description:
        "Nabídka entry skillu na startu session v Domino projektu: ask = zeptat se, always = načíst bez ptaní, never = nenabízet (volba „neptat se“ se ukládá sem)",
    },
    autoDraftRecurringGotchas: {
      description:
        "Automaticky navrhnout gotchu, když se stejná LSP diagnostika opakuje ve více cyklech",
      on: "Zapnuto — opakovaná chyba se nabídne k uložení jako gotcha (se schválením)",
      off: "Vypnuto — opakované chyby se neevidují",
    },
    showTelemetryPanel: {
      description: "Zobrazovat telemetrický panel nad editorem (haky, čtení, brány, délka kódu)",
      on: "Zapnuto — panel se živými počítadly nad editorem",
      off: "Vypnuto — skrýt panel",
    },
  },

  help: {
    lines: [
      "📖 [Příkazy /ls — LotusScript Modular]:",
      "  /ls status                      — Zobrazit konfiguraci pluginu",
      "  /ls lang [cs|en]                — Přepnout jazyk rozhraní",
      "  /ls <nastavení> [hodnota]       — Přímé zobrazení nebo nastavení volby",
      "  /ls --global <nastavení> <hodn> — Uložit nastavení globálně (~/.pi/agent/)",
      "  /ls scaffold <typ> [název]      — Vytvořit kostru (agent, library)",
      "  /ls lsp [on|off]                — Zapnout/vypnout LSP kontrolu",
      "  /ls check <soubor.lss>          — Zkontrolovat celý .lss překladačem 9.0.1",
      "  /ls score <soubor.lss>          — Zobrazit scorecard a trend souboru",
      "  /ls gotchas [dotaz]             — Prohledat centrální bázi 64 gotchas",
    ],
  },
};
