# LotusScript Gotchas — index and KB recipes

Always scan for gotchas before writing LotusScript in an affected area. Full
bodies with WRONG/CORRECT code pairs live in the plugin catalogue — query at
runtime, the catalogue is the source of truth:

```
lotusscript_gotchas(action: "search", query: "<keyword>")
lotusscript_gotchas(action: "summary")
/ls gotchas <dotaz>
```

The full list is whatever `lotusscript_gotchas(action: "search")` returns; the
most common traps are listed in `coding-conventions.md`, section "Top traps".

On **any compile/runtime error**: search the gotcha base with the exact error
text (`lotusscript_gotchas(action: "search", query: "<error text>")`) and read
every hit before fixing. `lotusscript_check` already appends the entries it
matched for the diagnostic it just reported (`🧩 GOTCHA MATCHES`) — start there,
then widen the search yourself.

## The `lotus-notes` KB — layers and recipes

Every LotusScript/Formula change is verified against the `lotus-notes`
collection: `kb_search(collection: "lotus-notes", query: "<topic>")`. It holds
three layers — pick the query wording to hit the right one:

| Layer | Files | Use it for |
|---|---:|---|
| IBM 9.0.1 API reference (`com.ibm.designer…doc_*`) | 8 243 | Any class, property, method, statement; the **exact** error text |
| Guirard, *Performance basics for IBM Lotus Notes developers* (`kapitola-01..13-*.html`) | 13 | Performance and design — formulas ch. 4, views ch. 6, code ch. 7 |
| Community articles, Breaking Par / OpenNTF (`<Title>_<UNID>.html`) | ~850 | Patterns and tricks that are not in the IBM docs |

Recipes: compile errors → search the exact message; “does X exist?” → search
the bare name (an empty result is evidence); performance → the book chapters.
Formula work → read `formula-language.md` first.

## Recording NEW gotchas (strict protocol)

When you hit a compile/runtime error or pitfall not covered by the search:

1. Search first: `lotusscript_gotchas(action: "search", query: "<error text>")`.
2. If genuinely new, draft title (trigger-phrased) + body (WRONG/CORRECT pair
   + one-line rule) and call `lotusscript_gotchas(action: "add", title, body)`.
3. The user approves via interactive modal — never write gotchas without
   approval, never retry after rejection.
