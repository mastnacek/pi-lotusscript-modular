# Naming Conventions for Design Elements (aliases)

Binding naming convention for design elements (agents, views, forms, libraries,
fields). Source of truth for the scaffold (`lotusscript_scaffold`) and for manual
element creation. If the user requires something else, their word wins — but new
elements are created this way.

---

## 1. Why aliases carry a type prefix

1. **Machine-readable type.** Link analysis (ln-graph, `mapa-databazi.md` §9)
   read short view aliases (`kopsp`, `csp`, `ci`, `czap`) as database names —
   487 false edges in the graph. A prefix (`lu_`, `ag_`) makes the element type
   recognisable from the alias by regex, even in `views.csv` / `forms.csv`.
2. **No diacritics, no spaces.** Display names carry accents, spaces and
   parentheses (`(dleOkruhuOsoby)`, `"1 - Lidské zdroje\1 - Dle vedoucího"`).
   An alias is ASCII, lowercase, underscores — safe in formulas, `@DbLookup`,
   `GetView`, scripts and URLs.
3. **Stability.** The display name may be renamed (readability for users); the
   alias stays the same, so calls from formulas and agents keep working.
4. **Name ≠ alias.** The display name describes the purpose readably (Czech);
   the alias is the machine identifier. Both have their place.

---

## 2. Alias composition

```text
<prefix>_<domain>_<object/purpose>_<target/action>
```

- **prefix** — element type (table below)
- **segments** — lowercase ASCII, separated by `_`, shortened to 2–6 characters,
  the whole alias ideally ≤ 32 characters
- order: general → specific (domain before object)

### Prefixes

| Prefix | Element | Example |
| --- | --- | --- |
| `ag_` | Agent (all) | `ag_ak_pr_ifx_save` |
| `lu_` | Lookup view (read via `@DbLookup`/`GetView`) | `lu_bl_dle_okruhu` |
| `vw_` | Other views (non-lookup) | `vw_bl_nepotvrzene` |
| `frm_` | Form | `frm_memo_bl` |
| `sfm_` | Subform | `sfm_hlavicka` |
| `fld_` | Shared field | `fld_datum_schvaleni` |
| `lib_` | Script Library | `lib_vebaapi` |
| `btn_` | (in code) button / action | `btn_aktualizace_prac_ifx` |
| `outl_` | Outline | `outl_hlavni` |

### Segment abbreviations (domain / object / action / target)

| Abbreviation | Meaning | Abbreviation | Meaning |
| --- | --- | --- | --- |
| `bl` | bezpečnostní listy (safety data sheets) | `lz` | lidské zdroje (HR) |
| `ak` | aktualizace (update) | `pr` | pracovníků (of employees) |
| `nep` | nepotvrzené (unconfirmed) | `prehled` | přehled (overview, whole word) |
| `ifx` | Informix (VebaCore API) | `save` | PostSave variant |
| `cis` | číselník (code list) | `mail` | e-mail / notification |

### Rules

1. **Every agent and view has an alias.** Element created → alias created.
2. **Display name** = a readable Czech name
   (`Aktualizace pracovníků okruhů (save)`). **Alias** = the convention above.
   Code and formulas ALWAYS use the alias.
3. Variants of the same agent share the base and differ in the last segment:
   `ag_ak_pr_ifx` (manual) → `ag_ak_pr_ifx_save` (PostSave variant).
4. Paired agents (in/out): same base, direction at the end — `…_do_ifx` /
   `…_z_ifx`.
5. When the display name is renamed, the alias does NOT change — just document
   it in the header.

---

## 3. Files on disk (development outside Designer)

| Element | File example |
| --- | --- |
| Agent | `<Název>.lss` (the scaffold writes exactly this) |
| Button / action | `button_<Název>.lss` |
| Library | `lib_<Název>.lss` |

One rule keeps code and disk together: **the file name equals the Designer
element name**. The scaffold (`lotusscript_scaffold`, `/ls scaffold`) therefore
names an agent without a prefix — an `agent_` prefix in the file name would mean
an element named `agent_X`, which the convention does not allow. The alias
(`ag_…`) carries the type, not the file name. Libraries keep the `lib_` prefix
because it is part of the element name.

---

## 4. Element header (documentation standard)

Every agent/library starts with a header carrying the alias and the purpose:

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

A view in DXL carries the alias in the attribute:

```xml
<view name='(dleOkruhuOsoby)' alias='lu_bl_dle_okruhu' … />
```

---

## 5. Deriving the alias with the tool

The scaffold (`lotusscript_scaffold`) derives the alias automatically:

1. display name → ASCII (ě→e, š→s, č→c, …), lowercase
2. everything except `a-z0-9` → `_`, repeated `_` → one, trim `_`
3. segments are shortened and joined under the type prefix (`ag_`, `lib_`)
4. length cap 40 characters

Editing the alias by hand after scaffolding is legal — it only has to keep the
`<prefix>_<segments>` shape and be carried into the file header and Designer.
