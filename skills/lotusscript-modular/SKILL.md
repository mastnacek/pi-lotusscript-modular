---
name: lotusscript-modular
description: Working with decompiled and modularized LotusScript agents and scripts. Use when editing, navigating, scaffolding, or recompiling modular .lss files (options, declarations, sub_*.lss, func_*.lss, main.lss, manifest.json) and assembling compiled .lss output for IBM Notes/Domino 9.0.1.
---

# LotusScript Modular Agent Workflow (Virtual Modularization)

This skill guides the AI assistant when working with decompiled LotusScript
agents and scripts split into modular `.lss` files. Plugin: `pi-lotusscript-modular`.

## Core Contract (always in force)

A modular agent folder contains `manifest.json`, `main.lss` (virtual index),
`00_options.lss`, `01_declarations.lss`, `sub_<name>.lss` / `func_<name>.lss`,
`99_initialize.lss`.

1. **`main.lss` is a virtual index, not a truncated read.** Reading a monolithic
   `.lss`/`.dxl` auto-decompiles it and returns `main.lss` (~30 lines). That is
   the complete index — do not re-read the monolith.
2. **Never dump the monolith** through `bash`, `ctx_execute`, `ctx_batch_execute`,
   `cat`, `Get-Content`, `readFileSync`, … — blocked as instant failure.
   Metadata-only commands (`wc -l`, `ls`) are fine.
3. **Never edit** `main.lss`, `manifest.json`, or `*_compiled.lss` — all three
   are extension-maintained; hand edits are discarded on the next compile.
4. **Always consult `01_declarations.lss`** before touching a procedure —
   LotusScript module scope is flat.
5. **English for everything the agent reads. Czech for everything the user
   reads** (notifications, modals). The literal marker `' Účel: ...` and Czech
   sample words in JEV ground truth stay Czech inside agent text.
6. **Full language policy & regression tests:** `references/workflow.md` §6.

## Progressive Disclosure (read on demand — do not preload everything)

| Situation | Read |
| --- | --- |
| First contact with a modular folder, or anything about the lifecycle / compile / cleanup | `references/workflow.md` |
| Before writing any LotusScript code (headers, naming, error handling) | `references/coding-conventions.md` |
| Before naming any agent/view/form/library, or when creating an element | `references/naming-conventions.md` (aliases: `ag_`, `lu_`, `frm_`, …) |
| Before writing code in ANY area — quick trigger scan; on any compile/runtime error search here first | `references/gotchas-index.md` (42 entries) |
| Creating a new agent, library, procedure or modular folder | `references/scaffolding.md` |
| Editing `.form` / `.view` / `.subform` / `.folder` DXL design elements | `references/dxl-and-odp.md` |

Runtime lookups that beat any doc file:

```
lotusscript_gotchas(action: "search", query: "<keyword or error text>")
knowledge_base kb_search(collection: "lotus-notes", query: "<topic>")   # Designer HTML reference
```

## Scaffold Fast Path

New code starts from a scaffold, never hand-written headers:

```
/ls scaffold agent|library|procedure|modular <Název>
lotusscript_scaffold(type, name, targetDir?, purpose?, isFunction?, params?, ...)
```

Generates compliant skeletons: header block (NÁZEV/ÚČEL/AUTOR/CHANGELOG),
`Option Public` + `Option Declare` + `%Include "lsconst.lss"`, `On Error GoTo
Catch` handlers, synthetic `@script-member-of` headers. Every scaffold also
**derives the convention alias** (`ag_…`/`lib_…` from the name, diacritics
stripped) and emits a **Designer registration notice** — element name, alias,
suggested description, paste steps and `Ctrl+Shift+F9` — in Czech for `/ls`
notifications and in English for tool results. Details + parameter table:
`references/scaffolding.md`. Alias grammar and prefix table:
`references/naming-conventions.md`.

## Definition of Done, Scorecard & Evaluation

The extension grades every compile deterministically. **The model never
self-reports a score** — the same facts (procedure length, comments, LSP
diagnostics, manifest sync, final artifact) are computed by the plugin and
injected as a feedback signal.

**Definition of Done (per agent you touch):**

1. No procedure exceeds `maxProcedureLines` (default 300), unless the user approved an exception.
2. Every sub/function has a concise Czech purpose comment (`' Účel: ...`).
3. The compiled artifact reports 0 LSP errors.
4. `manifest.json` compilationOrder matches the files on disk.
5. The final artifact is written: original `.lss` overwritten, or `<Agent>.lss` created for `.dxl`.
6. Every newly discovered trap is proposed via `lotusscript_gotchas(action: "add")` and user-approved.

Scorecard is attached to every recompile result:

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

Weights: `+2` per satisfied DoD item, `-5` per remaining LSP error, `-5` per
over-limit procedure without an approved exception, `-3` per procedure missing
its Czech purpose comment.

Instant failure conditions: editing `main.lss` or `*_compiled.lss` directly;
writing outside the modular root; deleting a procedure file without updating
`manifest.json`.

Manual inspection: `/ls score [složka]` (scorecard + trend), `/ls lint [složka]`
(per-procedure line counts and comment status), `/ls jev [složka]` (semantic
comment style & gotcha risk evaluation via JEV Decisions API).

## Self-Improvement Loop (pre-flight, debrief, recurring failures)

1. **Pre-flight gotchas (the Plan step):** on the first read of a modular
   agent's `main.lss`, the extension extracts identifiers from
   `01_declarations.lss` plus the procedure file names, then surfaces up to 3
   registered gotchas matching **this agent's own** declarations. Falls back to
   the generic top-8 summary when nothing matches. Toggle: `injectPreflightGotchas`.
2. **Instant-failure guards:** `edit`/`write` to `main.lss`, `manifest.json`,
   or `*_compiled.lss` is blocked — all three files are maintained by the
   extension, so hand edits are always lost.
2b. **Monolith read guard:** dumping the original `.lss` / `.dxl` through
   `bash`, `ctx_execute`, `ctx_batch_execute` or any other content-read tool is
   blocked. Read the modular files instead; the guard resolves `cd <dir>` and
   `--cwd` before matching, so relative paths cannot slip through.
3. **Debrief (note-to-self):** when `agent_settled` finalises an agent folder,
   if any Definition of Done item is unmet the harness records a debrief. It is
   injected as a message at the start of the next turn and consumed exactly once.
4. **Recurring failures → gotcha draft:** every LSP diagnostic is normalised to
   a location-free signature (line, column and file paths stripped). If the same
   signature appears in two compile cycles, the harness drafts a gotcha and asks
   the user to approve it — the model is not trusted to notice its own repeats.
   Toggle: `autoDraftRecurringGotchas`.

The loop is closed: **evaluate → detect gap → harness drafts gotcha → user
approves → stored in `gotchas.md` → surfaced pre-flight next session.**

## Architecture Map (source of truth for changes)

| Concern | Location |
| --- | --- |
| Composition root (events, commands, tools) | `index.ts` |
| Decompile/compile/manifest | `src/slices/parser/` |
| Code templates (scaffolds) | `src/slices/scaffold/templates.ts` |
| LSP diagnostics | `src/slices/lsp/` |
| Gotcha catalogue + review modal | `src/slices/gotchas/` |
| Linter + procedure-limit modal | `src/slices/linter/` |
| Scorecard, rubric, recurring drafts | `src/slices/scorecard/` |
| `/ls` completions + settings catalogue | `src/slices/settings/` |
| JEV semantic evaluation | `src/slices/evaluator/` |
| Tests (62 checks) | `test/test_modular_workflow.ts` |

## Language Policy (hard rule)

**English for everything the agent reads. Czech for everything the user reads.**

| Surface | Language | Why |
| --- | --- | --- |
| `promptGuidelines` / system prompt | **English** | Instruction-following and prompt-cache stability |
| Tool-result content (`event.content`) | **English** | It is model input, not UI |
| Block reasons / instant-failure text | **English** | Read by the model to correct course |
| Scorecard, DoD rubric, JEV verdicts | **English** | Injected into tool results |
| `/ls` notifications, modals, statusline | **Czech** | Rendered by the extension; no translator sees them |
| Setting descriptions, autocompletions | **Czech** | User-facing only |

Two things stay Czech **inside** English agent text, because they are data
rather than instructions:

1. The required code marker `' Účel: ...` — it is the literal string the linter matches.
2. Czech sample words used for classification (e.g. `zpracování`, `pomocná
   funkce` in the JEV ground-truth state), and the Czech text of a comment being judged.

**Do not rely on `pi-prompt-translate` for extension text.** That extension
translates the user's prompt into English on the way in and the final assistant
briefing back to Czech on the way out. It never sees `ctx.ui.notify(...)`,
modal labels, or extension-emitted tool-result content — so those must be
authored in the correct language at the source. Runtime translation of static
strings would only add cost, latency and a failure mode.

Regression guard: test 60 asserts every agent-facing surface is Czech-free
(with the two exceptions above), and test 61 proves that guard is not vacuous.