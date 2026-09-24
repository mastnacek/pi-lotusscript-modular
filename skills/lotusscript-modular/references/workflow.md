# Modular Workflow Reference (Virtual Modularization)

Deep detail for the ephemeral modularization lifecycle. The parent `SKILL.md`
holds the router and the hard rules; this file holds the "how it works" detail.

---

## 1. Recognizing Modular Scripts

A modular agent folder contains:
- `manifest.json` — Machine-readable compilation order and metadata.
- `main.lss` — Root entry point with synthetic `' %pi-import "..."` directives.
- `00_options.lss` — `Option Public`, `Option Declare`, `Option Compare`, `Use "..."`.
- `01_declarations.lss` — Shared constants, global variables (`Dim g_...`), `Type`, `Class` definitions.
- `sub_<name>.lss` / `func_<name>.lss` — Individual procedures with `@script-member-of`
  and `@parent-declarations` headers.
- `99_initialize.lss` — `Sub Initialize` runtime entrypoint.
- `99_terminate.lss` — Optional `Sub Terminate`.

### ⚠️ `main.lss` is a virtual index, not a truncated read

When you ask to read a monolithic `.lss` / `.dxl`, the extension intercepts the call, splits the
file into the modular folder above, and returns `main.lss` instead. That response is the **complete**
index — its line count (often ~30) is the size of the index, **not** the size of the original script.

- Do **not** conclude the read failed, was truncated, or returned a "stub".
- Do **not** re-read the original monolith to "get the full content".
- Read `01_declarations.lss` first, then only the specific `sub_*.lss` / `func_*.lss` file you need.

### ⛔ Never dump the monolith through a shell or code tool

`bash`, `ctx_execute`, `ctx_batch_execute` and similar tools bypass read-time auto-decompilation.
Dumping the original file (`cat`, `sed`, `head`, `tail`, `more`, `less`, `Get-Content`, `python`,
`node`, `readFileSync`, …) pulls thousands of lines into the context window and is **blocked** as an
instant failure. Metadata-only commands (`wc -l`, `ls`, `git status`) remain allowed.

---

## 2. Rules When Reading or Editing Procedures

1. **Always consult `01_declarations.lss`**:
   - LotusScript has flat module scope. Subroutines and functions rely on global variables,
     user-defined types, classes, and constants declared in `01_declarations.lss`.
   - Before modifying a procedure in `sub_*.lss` or `func_*.lss`, inspect `01_declarations.lss`
     to understand shared state and signatures.

2. **Adding a New Subroutine or Function**:
   - Create `sub_<Name>.lss` (for `Sub`) or `func_<Name>.lss` (for `Function`).
   - Add header comments:
     ```lotusscript
     ' @script-member-of: <AgentName>
     ' @procedure: <Name>
     ' @parent-declarations: 01_declarations.lss
     ```
   - `manifest.json` (the `compilationOrder` array) and `main.lss` are **maintained automatically**
     by the extension on every compile — do not edit them.
     - `main.lss` is a synthetic index of `' %pi-import` directives regenerated from `manifest.json`.
     - Hand edits to either file are discarded on the next recompile.
   - Faster path: use `/ls scaffold procedure <Name>` or the `lotusscript_scaffold` tool —
     it creates the file with the correct header and a compliant skeleton (see `scaffolding.md`).

3. **Deleting a Subroutine or Function**:
   - Delete the `.lss` file from disk. The next recompile drops it from `manifest.json`
     and `main.lss` automatically.

4. **Changing Global State or Types**:
   - Edit `01_declarations.lss`.
   - Check all procedures that reference the modified variable or type.

---

## 3. Recompiling & Automation (Ephemeral Modularization)

The extension automates the full ephemeral modularization lifecycle:

1. **Auto-Decompile on Read:** Reading a monolithic `.lss` or `.dxl` automatically splits it into a
   temporary `<ScriptName>/` folder and redirects reading to `main.lss`.
2. **Auto-Manifest Sync & Incremental Recompile on Edit:** When editing `sub_*.lss` /
   `func_*.lss` / `01_declarations.lss`, the extension automatically reconciles `manifest.json`
   and syncs the code.
3. **Automatic Cleanup on Completion (`cleanupOnSettled`):** Once the agent finishes modifications
   (`agent_settled`):
   - For `.lss` files: overwrites the source `.lss` file with the final compiled code.
   - For `.dxl` files: creates `<AgentName>.lss` alongside the `.dxl` file.
   - Completely deletes the temporary modular folder, leaving no clutter.
4. **Manual Pack & Clean (fallback / on-demand):**
   - Command: `/ls pack [složka]`
   - Tool: `lotusscript_compile(folder: "...", clean: true)`
   - Assembles final `.lss` file, verifies LSP, and deletes modular folder.
5. **Interactive Gotchas Approval:**
   - Proposing gotchas via `lotusscript_gotchas(action: "add")` displays an interactive modal
     window with Save, Cancel, and Rewrite options before writing anything to disk.

---

## 4. Pasting into Domino Designer 9.0.1

- Tell the user to open the agent in Domino Designer.
- Copy entire contents of the generated `<AgentName>_compiled.lss`
  (or `<AgentName>_<timestamp>_compiled.lss`).
- Paste into `(Declarations)` or `(Options)` in Programmer's Pane.
- Save and recompile: **Ctrl+Shift+F9**.

---

## 5. CLI & Tool Reference

| Command / Tool | Purpose |
| --- | --- |
| `/ls status` | Show live plugin configuration |
| `/ls config get\|set <key>` | Read/write a setting |
| `/ls scaffold <type> [name]` | Create compliant code skeleton (see `scaffolding.md`) |
| `/ls decompile <file>` | Decompose monolith `.lss`/`.dxl` into modular folder |
| `/ls compile [složka]` | Manually recompile modular folder to `_compiled.lss` |
| `/ls pack [složka]` | Compile, write artifact, delete modular folder |
| `/ls lint [složka]` | Per-procedure line counts + Czech comment check |
| `/ls score [složka]` | Scorecard + trend |
| `/ls jev [on\|off\|složka]` | Semantic comment/risk evaluation (JEV) |
| `/ls gotchas [query]` | Search the 42-entry gotcha base |
| `lotusscript_compile` | Tool: recompile modular folder (+LSP) |
| `lotusscript_decompile` | Tool: decompose monolith |
| `lotusscript_scaffold` | Tool: generate agent/library/procedure/modular skeletons |
| `lotusscript_gotchas` | Tool: search / summary / propose new gotcha |