---
name: lotusscript-modular
description: LotusScript and IBM Notes/Domino 9.0.1 development as whole .lss/.dxl files — writing, editing, scaffolding, checking with the 9.0.1 compiler oracle, designing script libraries, verifying the Notes object model, and finding the existing Domino element before building a new one. Use for any LotusScript, @formula, agent, view/form action, script library, or Notes application question.
---

# LotusScript whole-file workflow

Every `.lss` is one whole file, edited in place with anchored edits. Never create
`manifest.json`, `main.lss`, `sub_*.lss` or any modular folder (instant failure).

## Always
1. Before the first `.lss`/`.dxl` edit: `kb_search(collection: "lotus-notes", …)`.
   Run ≥3 searches per run, one per layer: IBM API reference, Guirard book,
   community articles / exact error text (layers and recipes: references/gotchas-index.md).
2. New agent or library: `lotusscript_scaffold`, never hand-written headers.
   Pasting into Designer: references/coding-conventions.md, section "Pasting into Designer".
3. After each edit: `lotusscript_check(path)` until 0 errors. On an error, run
   `lotusscript_gotchas(action: "search", query: "<exact error text>")` before changing code.
4. Record the change in the `VERZE`/`CHANGELOG` header.
5. Newly found trap → `lotusscript_gotchas(action: "add")` (the user approves).
6. The harness grades LSP-clean and KB-consulted. Never self-report a score.

## Read on demand — one task, one file; never preload

| Task | Read |
|---|---|
| "How do I get X done in this app?" (before any code) | references/reuse-ladder.md → references/domino-search-and-access.md |
| Write or edit an agent or button | references/coding-conventions.md |
| New element, naming, alias | references/scaffolding.md, references/naming-conventions.md |
| Script library, `Use`, versioning, deploy order | references/libraries-and-versioning.md |
| Unsure a class/member exists | references/object-model.md |
| Compile/runtime error | gotchas search (Always #3), then references/gotchas-index.md |
| `.form`/`.view`/`.subform`/`.folder` DXL | references/dxl-and-odp.md |
| `@formula` | references/formula-language.md |
| Changing the plugin itself | references/plugin-internals.md |
