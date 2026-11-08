---
type: Todo
title: "Code review 2026-10-27 (známka 3): chybí gating na Lotus projekt, chyba RPC hlásí čistý kód"
timestamp: 2026-10-27 17:04:38
status: todo
source: pi-spai
tags: [review, code-review, review-2026-10]
facets:
  priority: high
  project: pi-lotusscript-modular
  project_path: D:/01_programovani/pi/plugins/pi-lotusscript-modular
spai_symbol: '.'
---

# SPAI-029: Code review 2026-10-27 (známka 3): chybí gating na Lotus projekt, chyba RPC hlásí čistý kód

. Code review 2026-10-27 (známka 3): chybí gating na Lotus projekt, chyba RPC hlásí čistý kód

**Zdroj review:** nainstalovaná verze ~/.pi/agent/git/github.com/mastnacek/pi-lotusscript-modular @ 61f9cac, stav v pi: zapnutý. Čísla řádků platí pro tento commit (HEAD na D: je shodný, 61f9cac). Známka 3.

## Co to dělá

Podpora LotusScriptu (Notes 9.0.1): po editaci `.lss` spustí formátování a kontrolu přes `domino-mcp.exe` (JSON-RPC), vynucuje kb_search a gotchas, k tomu scorecard, HUD a modál pro načtení entry skillu.

## Silné stránky

* Čistý composition root (`index.ts`) se závislostmi předávanými jako parametry, takže slices jdou testovat.
* Ohraničená detekce projektu (`src/slices/project/detect.ts:76`: hloubka, počet položek, časový rozpočet).
* Auto-format jen u ASCII souborů kvůli Cp1250 (`src/slices/pipeline/tool-result.ts:126`), promyšlené.
* Testy existují: 11 skriptů plus `test/phases`, pouštěné přes `tsx` (bez test runneru).

## Problémy (seřazené dle závažnosti, s `soubor:řádek`)

1. Plete se do všech sessions: `before_agent_start` (`index.ts:308`) vkládá do každého system promptu „MANDATORY … KB PROTOCOL“, rubriku, gotchas a „SOURCE SHAPE“ (`src/slices/pipeline/guidelines.ts:24-62`). Detektorem projektu je podmíněný jen hint na skill (`guidelines.ts:19`). HUD se kreslí přes `countHook` při každém hooku, taky bez ohledu na projekt (`src/shared/state.ts:210`). Detektor existuje, jen se na to nepoužívá.
2. Chybný výsledek kontroly: JSON-RPC odpověď s `error` dá `rawText=""` (`src/slices/lsp/lsp-check.ts:~236`), `classifyDiagnostics("")` to vyhodnotí jako `isClean`, takže výsledek je `ok:true` a „No diagnostics.“. Selhaná kontrola se tváří jako čistý kód. Chybí i obsluha `exit`/`close` procesu, pád serveru se projeví až po 30 s timeoutu.
3. Blokující `tool_result`: format (10 s), check (30 s, při timeoutu retry dalších 30 s) a explain (15 s); jedna editace může čekat přes minutu (`src/slices/pipeline/tool-result.ts:150-200`).
4. `src/slices/pipeline/guidelines.ts:59` modelu tvrdí „nothing is … rewritten behind your back“, ale default `autoFormatOnSave: true` soubor po editaci přepíše (`src/slices/pipeline/tool-result.ts:152`).
5. Natvrdo zadaná osobní cesta `D:/01_programovani/LN_REA/...domino-mcp.exe` jako `DEFAULT_MCP_SERVER` (`src/slices/lsp/mcp-client.ts`).
6. `index.ts:236` ukládá do projektového configu celý sloučený config, takže zamrazí i globální hodnoty. Projektový config se nesanitizuje (na rozdíl od pi-uma), `src/shared/config.ts:78`.
7. Dva duplicitní JSON-RPC klienti (`src/slices/lsp/lsp-check.ts` a `src/slices/lsp/mcp-client.ts`); `chunk.toString()` může rozdělit vícebajtové UTF-8 znaky na hranici chunku.

## Doporučení

. Guidelines, HUD a pipeline hooky podmínit `projectFingerprint().hasLotusScript`.
. Na `res.error` vracet `ok:false`, sjednotit JSON-RPC klienta do jednoho modulu a reagovat na `exit` procesu.
. Default cestu k MCP serveru brát z configu nebo env, ne natvrdo z disku D:.

## Verdikt

Pro Lotus práci užitečné. Globálně zapnuté ale zbytečně znečišťuje každou session, takže buď doplnit gating, nebo zapínat jen v Lotus projektech.
