# DXL & ODP Design Elements Reference

Editing Notes/Domino design elements (forms, subforms, views, folders) in DXL
(`domino_9_0_1.dtd` schema). Trigger: user says "uprav formulář", "přidej pole/
akci/sloupec", "změň popisek", "doplň hide-when", "uprav view", or hands over a
`.form` / `.view` / `.subform` / `.folder` ODP file.

---

## 1. File Types

- **`.form` / `.subform`** — `<body><richtext>` containing structure (`<par>`,
  `<field>`, `<run>`, `<table>`, `<action>`, `<formula>`) interleaved with
  binary `<compositedata>` blocks (base64). Preserve them — they carry layout.
- **`.view` / `.folder`** — NOT richtext: `<view>` with selection formula
  (`<code event='selection'>`), columns (`<column>` + `<code event='value'>`),
  actions, and view formulas.
- Schema is `domino_9_0_1.dtd` — Notes 9.0.1 On-Disk Project format.

---

## 2. Hard Rules

1. **Never reformat or re-serialize the whole XML** — attributes, element order
   and `<compositedata>` placement must survive byte-identical where untouched.
2. **Formula text escaping:** a straight quote `"` inside formula text
   terminates the string and breaks DXL import (gotcha #31). Escape or use
   alternate formula delimiters.
3. **Hide-when formulas** live on `<action>`/`<par>`/`<run>` nodes as
   `<code event="hide">` — check `hide` flag combinations (`hidewhen`,
   `hideweb`, `hidenotes`) before assuming a bug.
4. **Columns:** value code sits in `<column><code event='value'>`; changing
   only `<columnheader>` does not change the column data.
5. Keep `@formula` line endings consistent with the original file.

---

## 3. DXL Agents

Agents exported as `.dxl` (`<agent>` with `<code event="initialize">` etc.) are
edited as DXL, in place. When the code needs its own file, hand-write a whole
`.lss` for it.

---

## 4. Big Attachments

`NotesDXLExporter.Export(doc)` hangs on documents with large attachments
(base64 serialization) — gotcha #35. Extract attachments to disk first, export
the stripped doc, then process files.

---

## 5. Related Assets

- Column/value/hide-when formulas: `formula-language.md`
- Knowledge base: `kb_search(collection: "lotus-notes", query: "<topic>")` —
  layers and recipes: `gotchas-index.md` §KB.
- Full DXL form/view skill (richer examples):
  `~/.claude/skills/notes-dxl/SKILL.md`

---

## 6. Validating before Designer import — the DXL import oracle

The 9.0.1 compiler oracle refuses `.dxl` by name, so DXL design exports get a
**second, empirical oracle**: the file is imported into the sandbox database
(`env/com-sandbox/data/AgentRunner.nsf`) with the real `NotesDXLImporter`
through the headless LotusScript lane — no Notes client, no ID file.

`lotusscript_check(path)` routes there automatically for `.dxl`, ODP design
elements, and any file whose *content* sniffs as DXL (extension does not
matter). Verdict semantics:

| Result | Meaning |
|---|---|
| `OK … imported=N` | the importer accepted the file — Designer will too |
| `ERR [err 4522]` | importer raised: malformed DXL, Designer would reject |
| `ERR 0 no note imported` | silent no-op (e.g. a `<form>` missing required DTD attributes) — treated as a failure, never a pass |

The imported note is removed afterwards; repeated checks leave no garbage.

Standalone use (any agent with a shell tool, no pi plugin needed):

```
python D:/01_programovani/LN_REA/docs/re/dxltests/dxl_check.py <file> [file…]
# → {"ok": bool, "results": [{file, status, err, errText, imported, items}]}
```

Overrides: `DOMINO_DXL_PY32` (32-bit python driving lsrun.py),
`DOMINO_DXL_ORACLE` (the driver script). Bulk RE variants live beside it:
`dxl_matrix.lss` + `dxl_matrix.py` (imports a whole manifest and re-exports
each note as normalization evidence).