# Plugin internals — `pi-lotusscript-modular`

This file is for modifying the plugin itself, not for writing LotusScript. For
LotusScript work read `SKILL.md` and the task reference it routes to.

## Architecture Map (source of truth for changes)

| Concern | Location |
| --- | --- |
| Composition root (pure wiring) | `index.ts` |
| Event translation (tool_call/tool_result/settled/before_settle) | `src/slices/pipeline/` |
| Instant-failure guard (KB edit gate) | `src/slices/guards/` |
| `/ls` command switch (ls-config, ls-inspect, ls-check, ls-gotchas, ls-audit) | `src/slices/commands/` |
| Model tools (check/gotchas/scaffold/library-audit) | `src/slices/tools/` |
| Session state kernel (config, score history, banners) + the single HUD | `src/shared/state.ts` + `state-insights.ts` + `state-hud.ts` |
| Bounded project detection + entry-skill consent (the only skill advertisement) | `src/slices/project/` |
| Duplicated-procedure audit (`lotusscript_library_audit`, `/ls audit`) | `src/slices/audit/` |
| Version header nudge (`VERZE`/`CHANGELOG`) | `src/slices/versioning/` |
| Library-drift nudge (agent re-implements a `lib_` routine) | `src/slices/drift/` |
| Visible skill trace (chat checkpoints, never model context) | `src/slices/trace/` |
| Code templates (scaffolds) | `src/slices/scaffold/template.lss` (shipped, versioned with the plugin); `templates.ts` holds the built-in fallbacks |
| LSP diagnostics — MCP lane to notes-sys `domino-mcp.exe` (whole-file check + explain/format) | `src/slices/lsp/` |
| LSP refusal handling — `domino-mcp.exe` rejects files outside its compiler lanes by name (`.dxl`, `.form`, …): `Error: X is not a Domino script (expected .lss, .lsa, .fl or .formula)`. The check lane classifies that as *skipped* (`ok: true`, `skipped: true`, 0 errors), never as a compilation failure; the pipeline auto-check never even submits `.dxl` (design export, not a script) | `classifyDiagnostics` in `src/slices/lsp/lsp-check.ts` |
| Gotcha catalogue + review modal | `src/slices/gotchas/` |
| Scorecard, rubric, recurring drafts | `src/slices/scorecard/` |
| `/ls` completions + settings catalogue | `src/slices/settings/` |
| Tests (one file per phase under the per-file line limit) | `test/test_workflow.ts` + `test/phases/`, plus `test_i18n` / `test_versioning` / `test_drift` / `test_trace` / `test_audit` / `test_gotchas` |

## CLI & Tool Reference

| Command / Tool | Purpose |
| --- | --- |
| `/ls status` | Show live plugin configuration |
| `/ls lang [cs\|en]` | Switch the UI language (persisted; never sniffed from the OS) |
| `/ls lsp [on\|off]` | Toggle the whole-file compiler check |
| `/ls config get\|set <key>` | Read/write a setting (`/ls <key> [value]` also works) |
| `/ls --global <key> <value>` | Persist a setting to `~/.pi/agent/` instead of the project |
| `/ls scaffold <agent\|library> [name]` | Create a compliant whole-file skeleton (see `scaffolding.md`) |
| `/ls check <soubor.lss>` | Whole-file 9.0.1 compiler check |
| `/ls score <soubor.lss>` | Scorecard + trend |
| `/ls gotchas [query]` | Search the gotcha base |
| `/ls audit [slozka]` | Rank procedures duplicated across `.lss` files (library candidates) |
| `lotusscript_check` | Tool: whole-file 9.0.1 compiler diagnostics (+ error-code help) |
| `lotusscript_scaffold` | Tool: generate agent/library whole-file skeletons |
| `lotusscript_gotchas` | Tool: search / summary / propose new gotcha |
| `lotusscript_library_audit` | Tool: duplicate-procedure audit + optional promotion plan |

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
   bump policy and wording: `libraries-and-versioning.md` §3.

The scorecard has exactly two graded items, `+2` each: LSP clean (`0 errors`)
and KB consulted (`minKbSearchesPerRun` reached). There is no line-length rule
and no comment lint — the plugin grades what the 9.0.1 compiler says plus
whether you actually consulted the knowledge base. DoD items 3 and 4 (gotcha
capture, version/changelog) are surfaced as nudges and debrief text, not as
scorecard weight.

Instant failure condition: creating a modular folder (`manifest.json`,
`main.lss`, `sub_*.lss`, `*_compiled.lss`) — every `.lss` is one whole script.

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
approves → stored in `src/slices/gotchas/gotchas.md` → surfaced pre-flight next session.**

## Language Policy (hard rule)

**English for everything the agent reads. Czech for everything the user reads.**

| Surface | Language | Why |
| --- | --- | --- |
| `promptGuidelines` / system prompt | **English** | Instruction-following and prompt-cache stability |
| Tool-result content (`event.content`) | **English** | It is model input, not UI |
| Block reasons / instant-failure text | **English** | Read by the model to correct course |
| Scorecard and DoD rubric | **English** | Injected into tool results |
| `/ls` notifications, modals, HUD lines | **Czech** | Rendered by the extension; no translator sees them |
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

## Template Sources (single source of truth)

**Primary — the template shipped in the plugin.** `src/slices/scaffold/template.lss`
is versioned with the code, so `pi update` delivers template improvements
together with the release. Edit it in the plugin repo and push; never edit it in
the installed checkout, which is a git working tree that `pi update` reconciles.
Placeholders filled: `<nazev-souboru>.lss`, `<Stručný popis>`, `<Jméno>`,
`<YYYY-MM-DD>` (all occurrences). `agent` and `library` scaffold from it;
`library` additionally gets `Public Const LIB_VERSION` after `Option Declare`.

**Fallback — built-in skeletons.** If the shipped `template.lss` cannot be read,
`templates.ts` supplies `agentTemplate` and `libraryTemplate`. Alias derivation
and the Designer registration notice live in `naming.ts` (`suggestAlias`,
`buildDesignerNotice`).

Pass `date: "YYYY-MM-DD"` to make a scaffold byte-reproducible; omit it for
today. Change any of this in code, never by patching generated output in skill
docs, otherwise scaffolds and docs drift apart.
