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
    overwriteSource: "Přepisovat .lss zdroják",
    cleanup: "Uklízet složku po dokončení",
    procLimits: "Kontrola limitů procedur",
    maxLines: "Max řádků na proceduru",
    czechComments: "Vynucovat české komentáře",
    scorecard: "Scorecard (hodnocení)",
    rubric: "Rubrika Definition of Done",
    preflight: "Předletová kontrola gotchas",
    autoDraft: "Auto-návrh gotchy z opakované chyby",
    autoDecompile: "Auto-dekompilace při čtení",
    autoRecompile: "Auto-rekompilace při uložení",
    kbPrompt: "Vynucovat lotus-notes KB prompt",
    kbGate: "Vynucovat tvrdou lotus-notes KB bránu",
    gotchaCapture: "Vynucovat zápis gotchas",
    gotchasSummary: "Vkládat gotchas souhrn",
    timestamp: "Zachovat timestamp v názvu",
    langLabel: "Jazyk rozhraní",
    gotchasFile: "Centrální Gotchas soubor",
    configFile: "Konfigurační soubor",
  },

  set: {
    lspToggled: (on, isGlobal) =>
      `LSP kontrola syntaxe je nyní ${on ? "ZAPNUTA" : "VYPNUTA"} (uloženo ${isGlobal ? "globálně" : "do projektu"}).`,
    overwriteToggled: (on, isGlobal) =>
      `Přepisování původního .lss souboru je nyní ${on ? "ZAPNUTO" : "VYPNUTO"} (uloženo ${isGlobal ? "globálně" : "do projektu"}).`,
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

  compile: {
    notModular: (target) => `Není modulární složka LotusScriptu: ${target}`,
    compiledClean: (name) => `Sestaveno ${name} (LSP čisté)`,
    compiledLspErrors: (diagnostics) => `Sestaveno s LSP chybami:\n${diagnostics}`,
    compiled: (p) => `Sestaveno: ${p}`,
    compileError: (msg) => `Chyba kompilace: ${msg}`,
    packedClean: (name) => `Sestaveno a uklizeno: ${name} (LSP čisté)`,
    packedLspErrors: (diagnostics) => `Sestaveno s chybami LSP:\n${diagnostics}`,
    packedDone: (p) => `Sestaveno do: ${p} a modulární složka byla smazána.`,
    packError: (msg) => `Chyba při úklidu: ${msg}`,
    decompileUsage: "Použití: /ls decompile <cesta k souboru .lss nebo .dxl>",
    fileNotFound: (p) => `Soubor nenalezen: ${p}`,
    decompiled: (dir) => `Dekompilováno do: ${dir}`,
    decompileError: (msg) => `Chyba dekompilace: ${msg}`,
  },

  scaffoldCmd: {
    usage: "Použití: /ls scaffold <agent|library|procedure|modular> [název] [cílová složka]",
    error: (msg) => `Chyba při vytváření kostry: ${msg}`,
  },

  lint: {
    title: (name) => `🔍 [LotusScript Linter — ${name}]:`,
    total: (n) => `- Celkem procedur: ${n}`,
    exceeding: (limit, n) => `- Překračuje limit ${limit} řádků: ${n}`,
    missingComment: (n) => `- Chybějící český komentář: ${n}`,
    missingDesc: "⚠️ chybí popis",
    linesCount: (n) => `${n} řádků`,
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

  limitModal: {
    header: "Překročení limitu délky procedury 📏",
    procedureLabel: "📌 Procedura:",
    lineCountLabel: "📊 Počet řádků:",
    limitLabel: "/ limit:",
    overBy: (n) => `(+${n} řádků nad limit)`,
    riskLabel: "⚠️  Riziko:",
    riskText: "LotusScript 32 KB bytecode limit procedury ('Script structure too large')",
    commentsLabel: "ℹ️  Komentáře:",
    choose: "🎯 Zvolte akci (šipkami ↑ / ↓, potvrďte Enter):",
    approve: "✅ [Povolit výjimku]",
    approveHint: "— schválit mírné překročení a pokračovat",
    reject: "✂️ [Odmítnout a rozdělit]",
    rejectHint: "— vrátit AI pokyn k rozdělení na menší sub/funkce",
    instructions: "✏️ [Pokyny k rozdělení]",
    instructionsEmpty: "Pokyny: (Enter pro zadání)",
    instructionsPrefix: "Pokyny: ",
    inputPlaceholder: " (zde napište pokyny k rozdělení)",
    footer: "💡 ↑↓ akce • Enter potvrdit • Esc zamítnout • PageUp/PageDown posun",
    moreRows: (parts) => `… ${parts} řádků (PageUp/PageDown) …`,
    inputPrompt: (file) => `✏️ Pokyny pro rozdělení procedury '${file}':`,
    inputDialogPlaceholder:
      "Napište, jak má AI proceduru rozdělit (např. vyčleň HTTP volání nebo databázové dotazy)...",
  },

  limits: {
    exceptionApproved: (file, lines) =>
      `✓ Schválena výjimka délky pro ${file} (${lines} řádků)`,
  },

  settled: {
    score: (s, m) => ` [skóre: ${s}/${m}]`,
    tailKept: (score) =>
      `sestaven${score}. Modulární složka ponechána — zdrojový .lss se nepřepisuje.`,
    tailDeleted: (score) => `sestaven${score} a dočasná složka smazána.`,
    done: (file, tail) => `🪷 [LotusScript Modular] Hotovo: ${file} ${tail}`,
    retained: (n, names) =>
      `🪷 [LotusScript Modular] Ponecháno ${n} složek s obsahem, který plugin nevytvořil: ${names}`,
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
    reads: (redirected, modular, kb) =>
      `   čtení: monolit→modul ${redirected} · modulární ${modular} · KB ${kb}`,
    gates: (kb, dumps, protectedB, compiles) =>
      `   brány: KB ${kb} · monolit ${dumps} · chráněné ${protectedB} · kompilace ${compiles}`,
    codeNone: "kód: zatím žádná kompilace",
    code: (procs, longest, max) => `kód: ${procs} proc. · nejdelší ${longest}/${max}`,
    suffix: (code, lsp) => `📏 ${code} · LSP ${lsp}`,
  },

  statusline: {
    compiling: (badge) => `🪷 LS${badge}: kompiluji...`,
    clean: (badge) => `🪷 LS${badge}: sestaveno ✓`,
    error: (badge) => `🪷 LS${badge}: LSP chyba ⚠`,
  },

  completions: {
    subStatus: "Zobrazit aktuální konfiguraci pluginu",
    subGlobal: "Uložit následující nastavení globálně (~/.pi/agent/)",
    subScaffold: "Vytvořit kostru LotusScript kódu (agent, library, procedure, modular)",
    subLsp: "Přepnout LotusScript LSP kontrolu: on | off",
    subOverwrite: "Přepnout přepisování .lss souboru: on | off",
    subCompile: "Sestavit modulární složku do _compiled.lss",
    subPack: "Sestavit do .lss a smazat modulární složku",
    subLint: "Zkontrolovat délku procedur (max 300 řádků) a komentáře",
    subScore: "Zobrazit scorecard a trend hodnocení agenta",
    subDecompile: "Rozložit monolitický .lss nebo .dxl do podsložky",
    subGotchas: "Vyhledat v databázi LotusScript Gotchas (40+ pravidel)",
    subConfig: "Zobrazit nebo změnit nastavení (get/set, legacy)",
    subHelp: "Zobrazit nápovědu příkazů",
    configGet: "Vypsat aktuální hodnotu nastavení",
    configSet: "Uložit novou hodnotu nastavení",
    scaffoldAgent: "Samostatný LotusScript agent (.lss) s ošetřením chyb",
    scaffoldLibrary: "Knihovna skriptů (Script Library .lss)",
    scaffoldProcedure: "Procedura (sub_ nebo func_) do modulární složky",
    scaffoldModular: "Kompletní modulární složka (manifest, options, declarations, subs)",
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
    lines: (n) => `${n} řádků`,
    linesDefault: (n) => `${n} řádků (výchozí limit)`,
  },

  settings: {
    enableLsp: {
      description: "Spouštět LotusScript LSP kontrolu syntaxe po rekompilaci",
      on: "Zapnuto — ověřovat syntaxi přes LotusScript LSP server",
      off: "Vypnuto — přeskočit kontrolu LSP",
    },
    overwriteSourceLss: {
      description:
        "Při rekompilaci přepsat původní .lss soubor na disku (pro .dxl se ignoruje)",
      on: "Zapnuto — synchronizovat zdrojový .lss soubor",
      off: "Vypnuto — zapisovat pouze do modular/<Nazev>_compiled.lss; složka zůstane na disku",
    },
    autoDecompileOnRead: {
      description: "Automaticky dekompilovat monolit při čtení (read)",
      on: "Zapnuto — rozložit monolit do podsložky a číst main.lss",
      off: "Vypnuto — číst původní monolit beze změn",
    },
    autoRecompileOnSave: {
      description: "Automaticky rekompilovat při editaci procedurálních .lss souborů",
      on: "Zapnuto — při uložení sub_*.lss sestavit kód",
      off: "Vypnuto — kompilovat pouze ručně přes /ls compile",
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
    keepTimestampInCompiledName: {
      description: "Vytvářet navíc soubory s časovou značkou (<Nazev>_<timestamp>_compiled.lss)",
      on: "Zapnuto — ukládat timestamp kopie",
      off: "Vypnuto — pouze stabilní <Nazev>_compiled.lss",
    },
    cleanupOnSettled: {
      description:
        "Po dokončení práce agenta sestavit výsledný .lss a smazat dočasnou dekompilovanou složku",
      on: "Zapnuto — automaticky uklidit a smazat dekompilovanou složku po dokončení úkolu",
      off: "Vypnuto — ponechat dekompilovanou složku na disku",
    },
    checkProcedureLimits: {
      description: "Kontrolovat maximální délku procedur (sub/funkcí) a přítomnost komentářů",
      on: "Zapnuto — hlídat limit řádků a komentáře",
      off: "Vypnuto — nekontrolovat",
    },
    maxProcedureLines: {
      description: "Maximální povolený počet řádků na jednu proceduru / funkci (výchozí: 300)",
    },
    enforceCzechComments: {
      description: "Vynucovat stručné české komentáře s popisem účelu u každé procedury",
      on: "Zapnuto — vyžadovat český popis u procedur",
      off: "Vypnuto — nepovinné",
    },
    enableScorecard: {
      description: "Počitovat a vkládat deterministický scorecard po každé kompilaci agenta",
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
      "  /ls scaffold <typ> [název]      — Vytvořit kostru (agent, library, procedure, modular)",
      "  /ls lsp [on|off]                — Zapnout/vypnout LSP kontrolu",
      "  /ls overwrite [on|off]          — Zapnout/vypnout přepis .lss souboru",
      "  /ls compile [složka]            — Ručně sestavit modulárního agenta",
      "  /ls lint [složka]               — Zkontrolovat délku procedur a komentáře",
      "  /ls score [složka]              — Zobrazit scorecard a trend agenta",
      "  /ls pack [složka]               — Sestavit do .lss a smazat modulární složku",
      "  /ls decompile <soubor>          — Rozložit monolit .lss/.dxl",
      "  /ls gotchas [dotaz]             — Prohledat centrální bázi 40+ gotchas",
    ],
  },
};
