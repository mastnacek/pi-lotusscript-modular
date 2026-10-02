# Formula Language Reference (Domino 9.0.1)

Best practices for `@formulas` in view selection/column formulas, form fields,
agents, actions, and DXL. Trigger: writing or reviewing any `@Function` code —
"uprav pohled", "přidej sloupec", "keyword formula", "selection formula",
hide-when, or `Evaluate` in LotusScript.

The formula performance rules below come from Guirard's *Performance basics*
(chapter 4) — "overuse and misuse of @DbLookup and @DbColumn accounts for the
vast majority of delays on forms". Verify anything you add against the KB:

```
kb_search(collection: "lotus-notes", query: "<@function or topic>")
```

Layers in that collection: IBM API reference (`com.ibm.designer…doc_*`),
the Guirard book (`kapitola-01..13-*.html`; formulas = ch. 4, views = ch. 6,
code = ch. 7), and ~850 community articles (`<Title>_<UNID>.html`).

---

## 1. @DbLookup / @DbColumn — the big one

### Cache modes (never default to NoCache)

| Mode | Behaviour |
|---|---|
| `""` (Cache, default) | First lookup hits the view, result is remembered for the session |
| `"NoCache"` | Always goes to the view; cached value is **not** updated |
| `"ReCache"` | Goes to the view **and** refreshes the cache |

- `NoCache` is overused because it "makes keywords work right" during
  development. In production a small staleness window is an acceptable trade
  for speed.
- `ReCache` is the forgotten option: refresh the cache deliberately — e.g. in
  the Postsave of the form that creates the lookup target.

```formula
' Current database: "" — not "" : "" (slower, confusing punctuation)
@DbLookup(""; ""; "CompanyByID"; CustID; "Manager")
```

### Look up once, not twice

```formula
' WRONG — two lookups where one would do:
@If(@IsError(@DbLookup(""; ""; "SomeView"; CustID; 3));
    "";
    @DbLookup(""; ""; "SomeView"; CustID; 3))

' CORRECT — either a temp:
_tmp := @DbLookup(""; ""; "SomeView"; CustID; 3);
@If(@IsError(_tmp); ""; _tmp)

' or the keyword form:
@DbLookup(""; ""; "SomeView"; CustID; 3; [FailSilent])
```

`[FailSilent]` (Notes 6+) replaces the obsolete `@IfError` pattern for
lookups. IBM also recommends a **named column** over a column number as the
lookup argument — change the column's programmatic name to something stable
and use it.

### Unique values: read them categorized, don't de-duplicate

`@Unique` compares every value with every other value — O(n²). Never
`@Unique(@DbColumn(...))` a column of duplicates; make the view column
**categorized** so the values are already unique. ("Generate unique keys in
index" is not a substitute — it has drawbacks.)

### One lookup for several fields

Instead of several `@DbColumn/@DbLookup` fields each fetching one value,
combine the values into **one column** (`CustName : StreetAddress : …`) and
pick them apart in one hidden Computed for Display field: `CustDetails[1]`.

### Never look up into a @Today/@Now view

A view using `@Today`/`@Now` in its selection or column formulas is
re-indexed on every use → full database scan. If you need "documents for a
date", `@DbLookup` a view **sorted by that date** and pass the date as the
key (see also the view rules in chapter 6).

---

## 2. Field types: don't repeat the lookup on every refresh

- **Computed** fields recalculate on **every form refresh** (keyword-refresh
  settings trigger them constantly).
- **Computed when Composed** — calculate once, stored. Best for a lookup
  that must be stored (e.g. manager's name at compose time).
- **Computed for Display** — never stored, but still recalculated on
  refresh; acceptable when the value is display-only.

Rule of thumb: lookup into a stored field only if the document must freeze
the value → Computed when Composed; otherwise Computed for Display.

### Defer keyword lookups in read mode

Checkbox/radio fields and keyword-synonym fields (`"Display|value"`) need the
choice list even in read mode; most other keyword fields don't:

```formula
_t := @If(@IsDocBeingEdited; @DbColumn(""; ""; "Customers"; 1); @Return(@Unavailable));
@If(@IsError(_t); ""; _t)
```

`@Unavailable` tells the form to re-ask when the user actually enters the
field in edit mode — eight half-second delays beat one four-second delay.

---

## 3. Lists, not loops

Nearly all string `@Functions` accept and return **lists**: `@Left(list; ",")`
lefts every element. Before writing `@For`/`@While`, check whether a
whole-list function (or `@Transform`) does it in one expression.

## 4. Exact membership, not substring

`@Contains(Cities; "Lansing")` is **true for "East Lansing"**. For exact
membership use `=`, `*=`, or `@IsMember` — they are faster (no full-string
scan) and actually correct. `@Contains` is only for genuine substring tests.

## 5. @Today / @Now in views (chapter 6 cross-ref)

`@Today`, `@Now`, and the `@TextToTime("Today")` "workaround" in **selection
or column formulas** invalidate the view index on every open. Use a
scheduled agent that writes a real date field, and select on that field.

## 6. Formulas inside LotusScript and DXL

- `Evaluate(...)` with user-controlled text is **formula injection**
  (gotcha #16) — sanitize or do the logic in LotusScript (`InStr`).
- In DXL, a straight quote `"` inside formula text terminates the string
  (gotcha #31) — use `@Char(34)` or brace-delimited `{...}` text.
- Long action code belongs in an agent; the button calls it with
  `@Command([ToolsRunMacro]; "ag_alias")` (chapter 7) — keeps button/DXL
  blobs small and lets the agent carry a header and error handling.

---

## KB verification

| Topic | Source (collection `lotus-notes`) |
|---|---|
| Cache modes, repeated lookups, field types, lists | `ln/designer/kapitola-04-Formula-performance.html` |
| View indexing / @Today selection | `ln/designer/kapitola-06-Views.html` |
| Action code → agents | `ln/designer/kapitola-07-Code.html` |
| @DbLookup syntax, named columns, [FailSilent] | `com.ibm…doc_H_DBLOOKUP_NOTES_DATABASES`, community `FailSilent Keyword In Lookups` |
