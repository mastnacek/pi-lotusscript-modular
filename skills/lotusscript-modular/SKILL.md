---
name: lotusscript-modular
description: Working with LotusScript agents and scripts — monolithic .lss/.dxl sources as well as modular folders (options, declarations, sub_*.lss, func_*.lss, main.lss, manifest.json). Use when editing, navigating, scaffolding, or recompiling for IBM Notes/Domino 9.0.1.
---

# LotusScript Modular Agent Workflow (Virtual Modularization)

This skill guides the AI assistant when working with LotusScript agents and
scripts — either as a monolithic `.lss`/`.dxl` or as a modular folder.
Plugin: `pi-lotusscript-modular`.

## Two source shapes

**A monolithic script is the normal shape.** Read it with `read` offset/limit,
inspect it with `grep`, edit it with anchored edits. Nothing is created, nothing
is rewritten. The plugin no longer decompiles monoliths (removed 2026-10-23):
never split an existing `.lss`/`.dxl` into a modular folder, and never propose
that as an option to the user.

**A modular folder exists only when it was created deliberately** — by
`lotusscript_scaffold` (`type: "modular"`) or before 2026-10-23 by the retired
decompiler. There the rules below apply, and `lotusscript_compile` reassembles
the artifact.

## Core Contract (inside a modular folder)

A modular folder contains `manifest.json`, `main.lss` (index),
`00_options.lss`, `01_declarations.lss`, `sub_<name>.lss` / `func_<name>.lss`,
`99_initialize.lss`.

1. **`main.lss` is an index, not the script.** ~30 lines naming the parts. The
   monolithic source is still on disk and remains readable when the whole-file
   view is more useful.
2. **Never edit** `main.lss`, `manifest.json`, or `*_compiled.lss` — all three
   are extension-maintained; hand edits are discarded on the next compile.
3. **Always consult `01_declarations.lss`** before touching a procedure —
   LotusScript module scope is flat.
4. **English for everything the agent reads. Czech for everything the user
   reads** (notifications, modals). The literal marker `' Účel: ...` and Czech
   sample words in code stay Czech inside agent text.
5. **Full language policy & regression tests:** `references/workflow.md` §6.

## Progressive Disclosure (read on demand — do not preload everything)

| Situation | Read |
| --- | --- |
| First contact with a modular folder, or anything about the lifecycle / compile / cleanup | `references/workflow.md` |
| Before writing any LotusScript code (headers, naming, error handling) | `references/coding-conventions.md` |
| Before naming any agent/view/form/library, or when creating an element | `references/naming-conventions.md` (aliases: `ag_`, `lu_`, `frm_`, …) |
| Before writing code in ANY area — quick trigger scan; on any compile/runtime error search here first | `references/gotchas-index.md` (64 entries) |
| Creating a new agent, library, procedure or modular folder | `references/scaffolding.md` |
| Editing `.form` / `.view` / `.subform` / `.folder` DXL design elements | `references/dxl-and-odp.md` |
| Writing or reviewing `@formulas` (view selection/columns, form fields, agents, DXL, `Evaluate`) | `references/formula-language.md` |

Runtime lookups that beat any doc file:

```
lotusscript_gotchas(action: "search", query: "<keyword or error text>")
knowledge_base kb_search(collection: "lotus-notes", query: "<topic>")
# 3 layers: IBM 9.0.1 API reference (8 243 docs), Guirard "Performance basics"
# book (kapitola-01..13: formulas ch.4, views ch.6, code ch.7), ~850 community
# articles. Layers, recipes and per-chapter map: references/gotchas-index.md §KB.
```

## Scaffold Fast Path

New code starts from a scaffold, never hand-written headers:

```
/ls scaffold agent|library|procedure|modular <Název>
lotusscript_scaffold(type, name, targetDir?, purpose?, author?, isFunction?, params?, date?, ...)
```

`agent` and `library` render the shipped `src/slices/scaffold/template.lss`:
header block (NÁZEV/ÚČEL/AUTOR/VYTVOŘENO/ZÁVISLOSTI), `VERZE` + `CHANGELOG`,
`Option Public` + `Option Declare`, an `On Error GoTo ErrorHandler` block and a
`SendErrorEmail` helper whose recipient comes from `ERROR_NOTIFY_EMAIL$` in the
file header. `procedure` and `modular` emit synthetic `@script-member-of` headers
instead. Every scaffold also **derives the convention alias** (`ag_…`/`lib_…`
from the name, diacritics stripped) and emits a **Designer registration
notice** — element name, alias, suggested description, paste steps and
`Ctrl+Shift+F9` — in Czech for `/ls` notifications and in English for tool
results. Pass `date` to pin `YYYY-MM-DD` and get a byte-reproducible scaffold.
Details + parameter table: `references/scaffolding.md`. Alias grammar and prefix
table: `references/naming-conventions.md`.

Do not add `%Include "lsconst.lss"` to a scaffolded agent: the template already
declares `LSI_THREAD_*` itself, and the include would collide (gotcha #39). The
whole `Const LSI_THREAD_*` block must be deleted when pasting into a Script
Library or any Designer element, because `LSPRVAL.LSS` is auto-included there.

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
7. The `lotus-notes` knowledge base was consulted at least `minKbSearchesPerRun`× this run (`kb_search`, default 3) — once per layer: IBM API reference, Guirard book, community/error text.

Scorecard is attached to every recompile result:

```text
📊 SCORECARD  tlacitko_v2  8/10  ▲ +3 since last compile
  ✅ procedures ≤ 300 lines
  ✅ Czech purpose comments (11/11)
  ❌ LSP diagnostics (2 errors)
  ✅ manifest.json in sync
  ⬜ final artifact written
  ✅ lotus-notes KB consulted (3/3)
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
(per-procedure line counts and comment status).

## Self-Improvement Loop (pre-flight, debrief, recurring failures)

1. **Pre-flight gotchas (the Plan step):** on the first read of a modular
   agent's `main.lss`, the extension extracts identifiers from
   `01_declarations.lss` plus the procedure file names, then surfaces up to 3
   registered gotchas matching **this agent's own** declarations. Falls back to
   the generic top-8 summary when nothing matches. Toggle: `injectPreflightGotchas`.
2. **Instant-failure guards:** `edit`/`write` to `main.lss`, `manifest.json`,
   or `*_compiled.lss` is blocked — all three files are maintained by the
   extension, so hand edits are always lost.
2b. **Proactive KB verification:** the `before_agent_start` guideline is a
   task→layer query protocol (API member → IBM reference; performance →
   Guirard chapters; error → exact text) plus a quality bar (On Error
   coverage, object state, NoCache discipline). KB calls are plural by rule:
   at least `minKbSearchesPerRun` (default 3) per run, one per layer. The
   main.lss read banner derives concrete `kb_search` suggestions from the
   agent's own `Notes*` declarations, and the scorecard grades the per-run
   query count as DoD item 7 (`(1/3)` progress label).
2b. **No forced modularization:** reading a monolith returns the file as it is.
   `bash` / `grep` inspection is allowed; there is no read redirect and no dump
   guard any more — prefer `read` with offset/limit only to keep the context
   window small.
3. **Debrief (note-to-self):** when `agent_settled` finalises an agent folder,
   if any Definition of Done item is unmet the harness records a debrief. It is
   injected as a message at the start of the next turn and consumed exactly once.
4. **Recurring failures → gotcha draft:** every LSP diagnostic is normalised to
   a location-free signature (line, column and file paths stripped). If the same
   signature appears in two compile cycles, the harness drafts a gotcha and asks
   the user to approve it — the model is not trusted to notice its own repeats.
   Toggle: `autoDraftRecurringGotchas`.
5. **Verify-before-done (`agent_before_settle`):** when a run mutated any
   `.lss`/`.dxl` source with fewer than `minKbSearchesPerRun` `kb_search`
   calls on the `lotus-notes` collection, the harness injects exactly one
   verification turn (`continue: true` + a hidden `custom_message` reporting
   the 1/3 progress and the layers still to cover) instead of letting the
   agent settle. One-shot per run; per-run flags reset at
   `before_agent_start`. Toggles: `verifyKbBeforeSettle`,
   `minKbSearchesPerRun`.

The loop is closed: **evaluate → detect gap → harness drafts gotcha → user
approves → stored in `gotchas.md` → surfaced pre-flight next session.**

## Architecture Map (source of truth for changes)

| Concern | Location |
| --- | --- |
| Composition root (pure wiring) | `index.ts` |
| Compile/manifest (sync-manifest, compile-agent, emitters, scaffolding) | `src/slices/parser/` |
| Event translation (tool_call/tool_result/settled/before_settle) | `src/slices/pipeline/` |
| Instant-failure guards (protected files, KB edit gate) | `src/slices/guards/` |
| `/ls` command switch (ls-config, ls-inspect, ls-compile, ls-gotchas) | `src/slices/commands/` |
| Model tools (compile/gotchas/scaffold) | `src/slices/tools/` |
| Session state kernel (config, score history, banners, limit gate) | `src/shared/state.ts` |
| Code templates (scaffolds) | `src/slices/scaffold/template.lss` (shipped, versioned with the plugin); `templates.ts` holds the built-in fallbacks |
| LSP diagnostics | `src/slices/lsp/` |
| Gotcha catalogue + review modal | `src/slices/gotchas/` |
| Linter + procedure-limit modal (checker, modal, instructions-input, prompt-review) | `src/slices/linter/` |
| Scorecard, rubric, recurring drafts | `src/slices/scorecard/` |
| `/ls` completions + settings catalogue | `src/slices/settings/` |
| Tests (79 checks, one file per phase under the per-file line limit) | `test/test_modular_workflow.ts` + `test/phases/` |

## Language Policy (hard rule)

**English for everything the agent reads. Czech for everything the user reads.**

| Surface | Language | Why |
| --- | --- | --- |
| `promptGuidelines` / system prompt | **English** | Instruction-following and prompt-cache stability |
| Tool-result content (`event.content`) | **English** | It is model input, not UI |
| Block reasons / instant-failure text | **English** | Read by the model to correct course |
| Scorecard and DoD rubric | **English** | Injected into tool results |
| `/ls` notifications, modals, statusline | **Czech** | Rendered by the extension; no translator sees them |
| Setting descriptions, autocompletions | **Czech** | User-facing only |

Two things stay Czech **inside** English agent text, because they are data
rather than instructions:

1. The required code marker `' Účel: ...` — it is the literal string the linter matches.
2. Czech sample words used for classification (e.g. `zpracování`, `pomocná
   funkce`), and the Czech text of a comment being judged.

**Do not rely on `pi-prompt-translate` for extension text.** That extension
translates the user's prompt into English on the way in and the final assistant
briefing back to Czech on the way out. It never sees `ctx.ui.notify(...)`,
modal labels, or extension-emitted tool-result content — so those must be
authored in the correct language at the source. Runtime translation of static
strings would only add cost, latency and a failure mode.

Regression guard: test 60 asserts every agent-facing surface is Czech-free
(with the two exceptions above), and test 61 proves that guard is not vacuous.