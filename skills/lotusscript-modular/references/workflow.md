# Whole-File Workflow Reference

Deep detail for the whole-file lifecycle (edit → check → Designer paste).
The parent `SKILL.md` holds the router and the hard rules; this file holds the
"how it works" detail.

---

## 1. The Only Source Shape

A LotusScript agent or script library is a single `.lss` (or `.dxl` export)
file — the module exactly as Designer stores it: `Option …`/`Use …` header,
`(Declarations)`, then every `Sub`/`Function` in one file.

- Read with `read` offset/limit; inspect with `grep`/`bash`; edit with anchored
  edits. Nothing is split or generated alongside.
- There is no `manifest.json`, no `main.lss` index, no `sub_*.lss` fragments,
  and no compiled artifact: the modular workflow is gone end to end (decompiler
  2026-10-23, LSP module-aware checking 2026-11, plugin compile pipeline 2026-11).
  Never recreate it.

---

## 2. Rules When Reading or Editing

1. **Module scope is flat.** Before modifying a procedure, scan the file's
   `(Declarations)` section (globals, `Type`, `Class`, `Const`) — it lives at
   the top of the same `.lss` file.
2. **Adding a procedure:** insert it into the same file with an anchored edit,
   following the coding conventions (`coding-conventions.md`). A `' Účel: ...`
   comment above the declaration is the house style, not a lint rule.
3. **Deleting a procedure:** remove it from the same file; nothing else needs
   syncing.
4. **Changing global state or types:** edit the declarations section and check
   every procedure in the file that references the modified symbol.

---

## 3. Lifecycle of a Change

1. **Edit** the `.lss` in place (KB gate: a `kb_search` on `lotus-notes` must
   have run this session before the first `.lss`/`.dxl` edit —
   `enforceKbGate`).
2. **Check** the whole file:
   - tool: `lotusscript_check(path)` — runs the 9.0.1 compiler oracle on the
     file exactly as it is;
   - command: `/ls compile <soubor.lss>` — same whole-file check from the TUI;
   - editor: pi-lens runs the same whole-script compile on open/save/change.
3. **On any diagnostic:** search `lotusscript_gotchas` with the error text
   before changing code; recurring identical diagnostics make the harness draft
   a gotcha for user approval.
4. **Paste into Designer** (see §4) when the file is clean.

---

## 4. Pasting into Domino Designer 9.0.1

- Tell the user to open the agent / script library in Domino Designer.
- Copy the entire contents of the `.lss` file.
- Paste into the Programmer's Pane (agent: into the script editor; library:
  into the library body).
- Save and recompile: **Ctrl+Shift+F9**.
- When pasting into any Designer element, delete the scaffold's
  `Const LSI_THREAD_*` block first — `LSPRVAL.LSS` is auto-included there and
  the symbols would collide (see SKILL.md §Scaffold Fast Path).

---

## 5. CLI & Tool Reference

| Command / Tool | Purpose |
| --- | --- |
| `/ls status` | Show live plugin configuration |
| `/ls config get\|set <key>` | Read/write a setting |
| `/ls scaffold <agent\|library> [name]` | Create a compliant whole-file skeleton (see `scaffolding.md`) |
| `/ls check <soubor.lss>` | Whole-file 9.0.1 compiler check |
| `/ls score <soubor.lss>` | Scorecard + trend |
| `/ls gotchas [query]` | Search the gotcha base |
| `lotusscript_check` | Tool: whole-file 9.0.1 compiler diagnostics (+ error-code help) |
| `lotusscript_scaffold` | Tool: generate agent/library whole-file skeletons |
| `lotusscript_gotchas` | Tool: search / summary / propose new gotcha |
