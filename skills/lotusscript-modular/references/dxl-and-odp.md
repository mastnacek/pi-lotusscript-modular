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

## 3. Monolith → Modular for DXL Agents

Agents exported as `.dxl` (`<agent>` with `<code event="initialize">` etc.)
are handled by the same pipeline as `.lss`:

- Reading a `.dxl` auto-decompiles into `<AgentName>/` and returns `main.lss`.
- Compiling creates `<AgentName>.lss` next to the `.dxl`
  (`createLssForDxl: true`); the `.dxl` itself is never overwritten.
- Same instant-failure rules apply (no monolith dumps, no `main.lss` edits).

---

## 4. Big Attachments

`NotesDXLExporter.Export(doc)` hangs on documents with large attachments
(base64 serialization) — gotcha #35. Extract attachments to disk first, export
the stripped doc, then process files.

---

## 5. Related Assets

- Full DXL form/view skill (legacy, richer examples):
  `~/.claude/skills/notes-dxl/SKILL.md`
- Designer HTML reference: `knowledge_base` MCP collection `lotus-notes`
  (`kb_search(collection: "lotus-notes", query: "<topic>")`)