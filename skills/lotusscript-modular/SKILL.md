---
name: lotusscript-modular
description: LotusScript and IBM Notes/Domino 9.0.1 development as whole .lss/.dxl files — writing, editing, scaffolding, checking with the 9.0.1 compiler oracle, designing script libraries, verifying the Notes object model, and finding the existing Domino element before building a new one. Use for any LotusScript, @formula, agent, view/form action, script library, or Notes application question.
---

# LotusScript Whole-File Workflow

This skill guides the AI assistant when working with LotusScript agents and
script libraries. Plugin: `pi-lotusscript-modular`.

## Which reference? (context detection)

| You are looking at / asked for | Read first |
|---|---|
| "how do I get X done in this application?" — before any code | `reuse-ladder.md`, then `domino-search-and-access.md` |
| a `.lss` **agent** or button | `workflow.md` → `coding-conventions.md` |
| a `.lss` **script library** | `libraries-and-versioning.md` |
| a class or member you are about to call | `object-model.md` → `lotus-class-index.md` (signatures: the JSON dataset) |
| a compile or run-time error | `gotchas-index.md`, then the `lotus-notes` KB by the exact error text |
| a `.dxl` form / view / subform / folder | `dxl-and-odp.md` |
| an `@formula` | `formula-language.md` |
| creating a new element | `scaffolding.md` |

## One source shape: the whole file

**Every `.lss` file is a whole script — the only supported shape.** Read it
with `read` offset/limit, inspect it with `grep`/`bash`, edit it with anchored
edits. Nothing is created, nothing is split, nothing is rewritten behind your
back.

The modular-folder workflow (manifest.json, main.lss, `sub_*.lss`/`func_*.lss`
fragments assembled before compiling) **was removed**: the decompiler went away
on 2026-10-23, and on 2026-11 the domino LSP dropped all module-aware handling.
The LSP compiles every `.lss` exactly as it is — no sibling assembly, no
strict-mode probe, and every diagnostic position refers to the file itself.

- **Never** split an existing `.lss`/`.dxl` into a modular folder, and never
  propose that as an option to the user.
- **Never** create `manifest.json`, `main.lss`, `00_options.lss`,
  `01_declarations.lss`, `sub_*.lss` or `func_*.lss` for a new script — a new
  agent or library is a single `.lss` from `lotusscript_scaffold`.
- A legacy modular folder (pre-2026-11) is read-only archaeology: the plugin no
  longer compiles, syncs or guards it. Work with the whole `.lss` instead — and
  do not "restore" the folder workflow.

## Checking a file

To verify a file, call the tool:

```
lotusscript_check(path: "<file>.lss")
```

It runs the IBM Notes 9.0.1 compiler oracle (via the domino LSP / MCP lane) on
the **whole file exactly as it is** and returns compiler diagnostics. On errors,
help pages for the LS-* error codes are attached when `autoExplainLspCodes` is
on. The editor lane (pi-lens) runs the same whole-script compile on
open/save/change, so diagnostics in the IDE and from the tool always agree.

## Progressive Disclosure (read on demand — do not preload everything)

| Situation | Read |
| --- | --- |
| Lifecycle of a whole-file change: edit → check → Designer paste; CLI & tool table | `references/workflow.md` |
| Before writing any LotusScript code (headers, naming, error handling) | `references/coding-conventions.md` |
| Before naming any agent/view/form/library, or when creating an element | `references/naming-conventions.md` (aliases: `ag_`, `lu_`, `frm_`, …) |
| Before writing code in ANY area — quick trigger scan; on any compile/runtime error search here first | `references/gotchas-index.md` (64 entries) |
| Creating a new agent or script library | `references/scaffolding.md` |
| Creating/changing a **script library**, versioning (`VERZE`/`CHANGELOG`), `Use` rules, deployment order + `Recompile All`, error 151, promoting shared code out of agents | `references/libraries-and-versioning.md` |
| "How do I get this done in this app?" — before writing anything, choosing doclink vs. button vs. agent, what to refuse | `references/reuse-ladder.md` |
| Searching an ODP/DXL export (AppProperties CSVs, greps), checking ACL/visibility/client/deploy reachability, real-database pitfalls | `references/domino-search-and-access.md` |
| Verifying a Notes class or member name, back-end vs. UI classes, dataset queries | `references/object-model.md` + `references/lotus-class-index.md` |
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
/ls scaffold agent|library <Název>
lotusscript_scaffold(type, name, targetDir?, purpose?, author?, date?)
```

Both render the shipped `src/slices/scaffold/template.lss` as a **single whole
`.lss`**: header block (NÁZEV/ÚČEL/AUTOR/VYTVOŘENO/ZÁVISLOSTI), `VERZE` +
`CHANGELOG`, `Option Public` + `Option Declare`, an `On Error GoTo ErrorHandler`
block and a `SendErrorEmail` helper whose recipient comes from
`ERROR_NOTIFY_EMAIL$` in the file header. Every scaffold also **derives the
convention alias** (`ag_…`/`lib_…` from the name, diacritics stripped) and emits
a **Designer registration notice** — element name, alias, suggested description,
paste steps and `Ctrl+Shift+F9` — in Czech for `/ls` notifications and in
English for tool results. Pass `date` to pin `YYYY-MM-DD` and get a
byte-reproducible scaffold. Details + parameter table:
`references/scaffolding.md`. Alias grammar and prefix table:
`references/naming-conventions.md`.

Do not add `%Include "lsconst.lss"` to a scaffolded agent: the template already
declares `LSI_THREAD_*` itself, and the include would collide (gotcha #39). The
whole `Const LSI_THREAD_*` block must be deleted when pasting into a Script
Library or any Designer element, because `LSPRVAL.LSS` is auto-included there.

## Definition of Done, Scorecard & Evaluation

The extension grades every check deterministically. **The model never
self-reports a score** — the facts (LSP diagnostics, KB consultation) are
computed by the plugin and injected as a feedback signal.

**Definition of Done (per `.lss` file you touch):**

1. The whole file reports 0 LSP errors (verified with `lotusscript_check`).
2. The `lotus-notes` knowledge base was consulted at least `minKbSearchesPerRun`× this run (`kb_search`, default 3) — once per layer: IBM API reference, Guirard book, community/error text.
3. Every newly discovered trap is proposed via `lotusscript_gotchas(action: "add")` and user-approved.
4. The file carries a `VERZE`/`CHANGELOG` header and this change is recorded in it — the
   `versioningCheck` slice nudges once per file per run with a paste-ready template;
   bump policy and wording: `references/libraries-and-versioning.md` §3.

The scorecard has exactly two graded items, `+2` each: LSP clean (`0 errors`)
and KB consulted (`minKbSearchesPerRun` reached). There is no line-length rule
and no comment lint — the plugin grades what the 9.0.1 compiler says plus
whether you actually consulted the knowledge base. DoD items 3 and 4 (gotcha
capture, version/changelog) are surfaced as nudges and debrief text, not as
scorecard weight.

Instant failure condition: creating a modular folder (`manifest.json`,
`main.lss`, `sub_*.lss`, `*_compiled.lss`) — the modular workflow is gone and
every `.lss` is a whole script.

Manual inspection: `/ls score <soubor.lss>` (scorecard + trend).

## Self-Improvement Loop (pre-flight, debrief, recurring failures)

1. **Instant-failure guard:** an `edit`/`write` to a `.lss`/`.dxl` is blocked
   until a `kb_search` on `lotus-notes` has run this session.
2. **Proactive KB verification:** the `before_agent_start` guideline is a
   task→layer query protocol (API member → IBM reference; performance →
   Guirard chapters; error → exact text) plus a quality bar (On Error
   coverage, object state, NoCache discipline). KB calls are plural by rule:
   at least `minKbSearchesPerRun` (default 3) per run, one per layer. The
   scorecard grades the per-run query count as DoD 2 with a `(1/3)` progress
   label.
3. **No forced restructuring:** reading a script returns the file as it is.
   `bash` / `grep` inspection is allowed; prefer `read` with offset/limit only
   to keep the context window small.
4. **Debrief (note-to-self):** when `agent_settled` finalises work on an agent,
   if any Definition of Done item is unmet the harness records a debrief. It is
   injected as a message at the start of the next turn and consumed exactly once.
5. **Recurring failures → gotcha draft:** every LSP diagnostic is normalised to
   a location-free signature (line, column and file paths stripped). If the same
   signature appears in two check cycles, the harness drafts a gotcha and asks
   the user to approve it — the model is not trusted to notice its own repeats.
   Toggle: `autoDraftRecurringGotchas`.
6. **Verify-before-done (`agent_before_settle`):** when a run mutated any
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
| Event translation (tool_call/tool_result/settled/before_settle) | `src/slices/pipeline/` |
| Instant-failure guard (KB edit gate) | `src/slices/guards/` |
| `/ls` command switch (ls-config, ls-inspect, ls-check, ls-gotchas, ls-audit) | `src/slices/commands/` |
| Model tools (check/gotchas/scaffold/library-audit) | `src/slices/tools/` |
| Session state kernel (config, score history, banners, telemetry) | `src/shared/state.ts` + `state-insights.ts` + `state-telemetry.ts` |
| Bounded project detection + entry-skill consent (the only skill advertisement) | `src/slices/project/` |
| Duplicated-procedure audit (`lotusscript_library_audit`, `/ls audit`) | `src/slices/audit/` |
| Version header nudge (`VERZE`/`CHANGELOG`) | `src/slices/versioning/` |
| Library-drift nudge (agent re-implements a `lib_` routine) | `src/slices/drift/` |
| Visible skill trace (chat checkpoints, never model context) | `src/slices/trace/` |
| Code templates (scaffolds) | `src/slices/scaffold/template.lss` (shipped, versioned with the plugin); `templates.ts` holds the built-in fallbacks |
| LSP diagnostics — MCP lane to notes-sys `domino-mcp.exe` (whole-file check + explain/format) | `src/slices/lsp/` |
| Gotcha catalogue + review modal | `src/slices/gotchas/` |
| Scorecard, rubric, recurring drafts | `src/slices/scorecard/` |
| `/ls` completions + settings catalogue | `src/slices/settings/` |
| Tests (one file per phase under the per-file line limit) | `test/test_workflow.ts` + `test/phases/`, plus `test_i18n` / `test_versioning` / `test_drift` / `test_trace` / `test_audit` / `test_gotchas` |

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

1. The house-style code marker `' Účel: ...` — it is data, not an instruction.
2. Czech sample words used for classification (e.g. `zpracování`, `pomocná
   funkce`), and the Czech text of a comment being judged.

**Do not rely on `pi-prompt-translate` for extension text.** That extension
translates the user's prompt into English on the way in and the final assistant
briefing back to Czech on the way out. It never sees `ctx.ui.notify(...)`,
modal labels, or extension-emitted tool-result content — so those must be
authored in the correct language at the source. Runtime translation of static
strings would only add cost, latency and a failure mode.

Regression guard: `test/test_i18n.ts` asserts every agent-facing surface is
Czech-free (with the two exceptions above), and its negative case proves the
guard is not vacuous.
