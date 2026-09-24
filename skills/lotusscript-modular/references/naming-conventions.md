# Naming Conventions for Design Elements (aliases)

Závazná konvence pojmenování design elementů (agentů, pohledů, formulářů,
knihoven, polí). Zdroj pravdy pro scaffold (`lotusscript_scaffold`) i pro
ruční tvorbu elementů. Vyžaduje-li uživatel jinak, platí jeho slovo — ale
nové elementy vznikají takhle.

---

## 1. Proč aliasy s prefixem typu

1. **Stroji čitelný typ.** Analýza vazeb (ln-graph, `mapa-databazi.md` §9)
   brala krátké aliasy pohledů (`kopsp`, `csp`, `ci`, `czap`) jako názvy
   databází — 487 falešných hran v grafu. Prefix (`lu_`, `ag_`) umožní
   rozpoznat typ elementu z aliasu regexem i v `views.csv`/`forms.csv`.
2. **Bez diakritiky a mezer.** Display názvy nesou háčky, mezery a závorky
   (`(dleOkruhuOsoby)`, `"1 - Lidské zdroje\1 - Dle vedoucího"`). Alias je
   ASCII, lowercase, podtržítka — bezpečný ve formulích, `@DbLookup`,
   `GetView`, skriptech i v URL.
3. **Stabilita.** Display název se smí přejmenovat (čitelnost pro uživatele);
   alias zůstává stejný, takže se nerozbijí volání z formulí a agentů.
4. **Název ≠ alias.** Display název popisuje účel česky čitelně; alias je
   strojový identifikátor. Obojí má smysl.

---

## 2. Skladba aliasu

```
<prefix>_<doména>_<objekt/účel>_<cíl/akce>
```

- **prefix** — typ elementu (tabulka níže)
- **segmenty** — lowercase ASCII, oddělené `_`, zkrácené na 2–6 znaků,
  celý alias ideálně ≤ 32 znaků
- pořadí: obecné → specifické (doména před objektem)

### Prefixy

| Prefix | Element | Příklad |
| --- | --- | --- |
| `ag_` | Agent (všechny) | `ag_ak_pr_ifx_save` |
| `lu_` | Lookup pohled (čtení přes `@DbLookup`/`GetView`) | `lu_bl_dle_okruhu` |
| `vw_` | Ostatní pohledy (non-lookup) | `vw_bl_nepotvrzene` |
| `frm_` | Formulář | `frm_memo_bl` |
| `sfm_` | Subform | `sfm_hlavicka` |
| `fld_` | Shared field | `fld_datum_schvaleni` |
| `lib_` | Script Library | `lib_vebaapi` |
| `btn_` | (v kódu) tlačítko / akce | `btn_aktualizace_prac_ifx` |
| `outl_` | Outline | `outl_hlavni` |

### Segmentové zkratky (doména / objekt / akce / cíl)

| Zkratka | Význam | Zkratka | Význam |
| --- | --- | --- | --- |
| `bl` | bezpečnostní listy | `lz` | lidské zdroje |
| `ak` | aktualizace | `pr` | pracovníků |
| `nep` | nepotvrzené | `prehled` | přehled (celé) |
| `ifx` | Informix (VebaCore API) | `save` | varianta PostSave |
| `cis` | číselník | `mail` | e-mail/notifikace |

### Pravidla

1. **Každý agent a pohled má alias.** Vzniká element → vzniká alias.
2. **Display name** = čitelný český název (`Aktualizace pracovníků okruhů (save)`).
   **Alias** = konvence výše. Do kódu/formulí patří VŽDY alias.
3. Varianty téhož agenta sdílejí základ, liší se posledním segmentem:
   `ag_ak_pr_ifx` (ruční) → `ag_ak_pr_ifx_save` (PostSave varianta).
4. Párové agenty (do/z): stejný základ, směr v závěru — `…_do_ifx` / `…_z_ifx`.
5. Při přejmenování display názvu alias NEMĚNIT — jen dokumentovat v hlavičce.

---

## 3. Soubory na disku (vývoj mimo Designer)

| Element | Příklad souboru |
| --- | --- |
| Agent | `agent_<Název>.lss` |
| Tlačítko/akce | `button_<Název>.lss` |
| Knihovna | `lib_<Název>.lss` |
| Modulární složka | `<NázevAgenta>/` (manifest.json uvnitř) |

---

## 4. Hlavička elementu (dokumentační standard)

Každý agent/knihovna začíná hlavičkou s aliasem a účelem:

```lotusscript
' ========================================================================
' BL_akt_prac_cis_okruhy_save   (alias ag_ak_pr_ifx_save)
' Databaze: nakupovaci_dokumentace.nsf
'
' UCEL:
'   <1-3 věty: co dělá, odkdy se spouští, kam zapisuje>
'   ZAPOJENI: @Command([ToolsRunMacro]; "ag_ak_pr_ifx_save")
' ========================================================================
```

Pohled ve DXL nese alias v atributu:

```xml
<view name='(dleOkruhuOsoby)' alias='lu_bl_dle_okruhu' … />
```

---

## 5. Odvození aliasu nástrojem

Scaffold (`lotusscript_scaffold`) odvozuje alias automaticky:

1. display název → ASCII (ě→e, š→s, č→c, …), lowercase
2. vše kromě `a-z0-9` → `_`, opakovaná `_` → jedna, trim `_`
3. segmenty se zkrátí a spojí pod prefixem typu (`ag_`, `lib_`)
4. délka cap 40 znaků

Ruční úprava aliasu po scaffoldu je legální — jen musí zůstat ve tvaru
`<prefix>_<segmenty>` a musí se propsat do hlavičky souboru i do Designeru.