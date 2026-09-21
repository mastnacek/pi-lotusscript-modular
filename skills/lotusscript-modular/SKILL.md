---
name: lotusscript-modular
description: Working with decompiled and modularized LotusScript agents and scripts. Use when editing, navigating, or recompiling modular .lss files (options, declarations, sub_*.lss, func_*.lss, main.lss, manifest.json) and assembling compiled .lss output.
---

# LotusScript Modular Agent Workflow (Virtual Modularization)

This skill guides the AI assistant when working with decompiled LotusScript agents and scripts split into modular `.lss` files.

## 1. Recognizing Modular Scripts

A modular agent folder contains:
- `manifest.json` — Machine-readable compilation order and metadata.
- `main.lss` — Root entry point with synthetic `' %pi-import "..."` directives.
- `00_options.lss` — `Option Public`, `Option Declare`, `Option Compare`, `Use "..."`.
- `01_declarations.lss` — Shared constants, global variables (`Dim g_...`), `Type`, `Class` definitions.
- `sub_<name>.lss` / `func_<name>.lss` — Individual procedures with `@script-member-of` and `@parent-declarations` headers.
- `99_initialize.lss` — `Sub Initialize` runtime entrypoint.
- `99_terminate.lss` — Optional `Sub Terminate`.

## 2. Rules When Reading or Editing Procedures

1. **Always consult `01_declarations.lss`**:
   - LotusScript has flat module scope. Subroutines and functions rely on global variables, user-defined types, classes, and constants declared in `01_declarations.lss`.
   - Before modifying a procedure in `sub_*.lss` or `func_*.lss`, inspect `01_declarations.lss` to understand shared state and signatures.

2. **Adding a New Subroutine or Function**:
   - Create `sub_<Name>.lss` (for `Sub`) or `func_<Name>.lss` (for `Function`).
   - Add header comments:
     ```lotusscript
     ' @script-member-of: <AgentName>
     ' @procedure: <Name>
     ' @parent-declarations: 01_declarations.lss
     ```
   - Register the file in `manifest.json` inside the `compilationOrder` array (before `99_initialize.lss`).
   - Add virtual import line to `main.lss`:
     ```lotusscript
     ' %pi-import "sub_<Name>.lss"
     ```

3. **Deleting a Subroutine or Function**:
   - Delete the `.lss` file from disk.
   - Remove its entry from `manifest.json` and `main.lss`.

4. **Changing Global State or Types**:
   - Edit `01_declarations.lss`.
   - Check all procedures that reference the modified variable or type.

## 3. Recompiling & Automation via Pi Extension (Ephemeral Modularization)

The extension automates the full ephemeral modularization lifecycle:
1. **Auto-Decompile on Read:** Reading a monolithic `.lss` or `.dxl` automatically splits it into a temporary `<ScriptName>/` folder and redirects reading to `main.lss`.
2. **Auto-Manifest Sync & Incremental Recompile on Edit:** When editing `sub_*.lss` / `func_*.lss` / `01_declarations.lss`, the extension automatically reconciles `manifest.json` and syncs the code.
3. **Automatic Cleanup on Completion (`cleanupOnSettled`):** Once the agent finishes modifications (`agent_settled`):
   - For `.lss` files: overwrites the source `.lss` file with the final compiled code.
   - For `.dxl` files: creates `<AgentName>.lss` alongside the `.dxl` file.
   - Completely deletes the temporary modular folder, leaving no clutter.
4. **Manual Pack & Clean (fallback / on-demand):**
   - Command: `/ls pack [složka]`
   - Tool: `lotusscript_compile(folder: "...", clean: true)`
   - Assembles final `.lss` file, verifies LSP, and deletes modular folder.
5. **Interactive Gotchas Approval:**
   - Proposing gotchas via `lotusscript_gotchas(action: "add")` displays an interactive modal window with Save, Cancel, and Rewrite options before writing anything to disk.

## 4. Pasting into Domino Designer 9.0.1

- Tell the user to open the agent in Domino Designer.
- Copy entire contents of the generated `<AgentName>_compiled.lss` (or `<AgentName>_<timestamp>_compiled.lss`).
- Paste into `(Declarations)` or `(Options)` in Programmer's Pane.
- Save and recompile: **Ctrl+Shift+F9**.
