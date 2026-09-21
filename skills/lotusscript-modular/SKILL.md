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
   - `manifest.json` (the `compilationOrder` array) and `main.lss` are **maintained automatically** by the extension on every compile — do not edit them.
     - `main.lss` is a synthetic index of `' %pi-import` directives regenerated from `manifest.json`.
     - Hand edits to either file are discarded on the next recompile.

3. **Deleting a Subroutine or Function**:
   - Delete the `.lss` file from disk. The next recompile drops it from `manifest.json` and `main.lss` automatically.

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

## 3b. Definition of Done, Scorecard & Evaluation

The extension grades every compile deterministically. **The model never self-reports a score** — the same facts (procedure length, comments, LSP diagnostics, manifest sync, final artifact) are computed by the plugin and injected as a feedback signal.

**Definition of Done (per agent you touch):**

1. No procedure exceeds `maxProcedureLines` (default 300), unless the user approved an exception.
2. Every sub/function has a concise Czech purpose comment (`' Účel: ...`).
3. The compiled artifact reports 0 LSP errors.
4. `manifest.json` compilationOrder matches the files on disk.
5. The final artifact is written: original `.lss` overwritten, or `<Agent>.lss` created for `.dxl`.
6. Every newly discovered trap is proposed via `lotusscript_gotchas(action: "add")` and user-approved.

**Scorecard** is attached to every recompile result:

```text
📊 SCORECARD  tlacitko_v2  7/10  ▲ +3 since last compile
  ✅ procedures ≤ 300 lines
  ✅ Czech purpose comments (11/11)
  ❌ LSP diagnostics (2 errors)
  ✅ manifest.json in sync
  ⬜ final artifact written
  Remaining:
    - LSP diagnostics (2 errors): <first lines of the diagnostic output>
```

Weights: `+2` per satisfied DoD item, `-5` per remaining LSP error, `-5` per over-limit procedure without an approved exception, `-3` per procedure missing its Czech purpose comment.

Instant failure conditions: editing `main.lss` or `*_compiled.lss` directly; writing outside the modular root; deleting a procedure file without updating `manifest.json`.

Manual inspection: `/ls score [složka]` (scorecard + trend), `/ls lint [složka]` (per-procedure line counts and comment status), `/ls jev [složka]` (semantic comment style & gotcha risk evaluation via JEV Decisions API).

## 3c. Self-improvement loop (pre-flight, debrief, recurring failures)

1. **Pre-flight gotchas (the Plan step):** on the first read of a modular agent's `main.lss`, the extension extracts identifiers from `01_declarations.lss` plus the procedure file names, then surfaces up to 3 registered gotchas matching **this agent's own** declarations. Falls back to the generic top-8 summary when nothing matches. Toggle: `injectPreflightGotchas`.
2. **Instant-failure guards:** `edit`/`write` to `main.lss`, `manifest.json`, or `*_compiled.lss` is blocked — all three files are maintained by the extension, so hand edits are always lost.
3. **Debrief (note-to-self):** when `agent_settled` finalises an agent folder, if any Definition of Done item is unmet the harness records a debrief. It is injected as a message at the start of the next turn and consumed exactly once.
4. **Recurring failures → gotcha draft:** every LSP diagnostic is normalised to a location-free signature (line, column and file paths stripped). If the same signature appears in two compile cycles, the harness drafts a gotcha and asks the user to approve it — the model is not trusted to notice its own repeats. Toggle: `autoDraftRecurringGotchas`.

The loop is closed: **evaluate → detect gap → harness drafts gotcha → user approves → stored in `gotchas.md` → surfaced pre-flight next session.**

## 4. Pasting into Domino Designer 9.0.1

- Tell the user to open the agent in Domino Designer.
- Copy entire contents of the generated `<AgentName>_compiled.lss` (or `<AgentName>_<timestamp>_compiled.lss`).
- Paste into `(Declarations)` or `(Options)` in Programmer's Pane.
- Save and recompile: **Ctrl+Shift+F9**.
