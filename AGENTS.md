# pi-lotusscript-modular — build guide

Pi extension for **whole-file** LotusScript work: every `.lss` is checked exactly as it is
by the domino LSP (IBM Notes/Domino 9.0.1 compiler oracle), plus compliant scaffolding and
a central Gotchas registry.

**The modular workflow is gone — completely.** Decompilation was removed on 2026-10-23, the
domino LSP dropped module-aware checking on 2026-11, and this plugin's compile/manifest
pipeline (`src/slices/parser/`, `compileAgent`, `sync-manifest`, `emitters`, `_compiled.lss`,
`/ls compile|pack`) was deleted with it. No folder shape is supported any more: every
`.lss` is a whole script. The model tools are `lotusscript_check` (whole-file compiler
diagnostics), `lotusscript_scaffold` (agent/library skeletons only) and
`lotusscript_gotchas`. The removed decompile pipeline is archived in
`D:\01_programovani\pi\plugins\_archiv\lotusscript-dekompilace` — restore from there if it
is ever wanted again, do not re-grow a second copy in `src/`.

## Layout (VSA — Vertical Slice Architecture)
- `index.ts`              composition root — Pi adapter only, no domain computation
- `src/shared/`           kernel: `types.ts`, `config.ts`, `paths.ts`, `i18n.ts` + `i18n-cs.ts`/`i18n-en.ts`, `state.ts` + `state-insights.ts`/`state-hud.ts` (no slice imports)
- `src/slices/project/`   bounded project detection → entry-skill hint AND the lotus consent modal (`skillPrompt`); `resources.ts` is the only skill advertisement
- `src/slices/pipeline/`  event translation: tool_call, tool_result, settled, before_settle, guidelines, read-banner, recurring-gotcha
- `src/slices/guards/`    KB edit gate for `.lss`/`.dxl`
- `src/slices/lsp/`       MCP client for notes-sys `domino-mcp.exe` (whole-file diagnostics, explain, format)
- `src/slices/gotchas/`   canonical 64 LotusScript gotchas registry, search, seed-sync & append
- `src/slices/scaffold/`  whole-file templates, alias derivation, `template.lss`
- `src/slices/scorecard/` deterministic scorecard, rubric, recurring-diagnostic drafts
- `src/slices/settings/`  catalogue + lazy menu completions for `/ls`
- `src/slices/commands/`  `/ls` dispatch — sibling-slice capabilities arrive via `deps.ts` (`CommandsDeps`), wired in the composition root
- `src/slices/tools/`     model tools — `ToolsDeps`, wired in the composition root
- `src/slices/audit/`     duplicated-procedure audit + library-promotion plan
- `src/slices/versioning/` `VERZE`/`CHANGELOG` header nudge
- `src/slices/drift/`     library-drift nudge
- `src/slices/trace/`     visible skill trace in the chat (never model context)
- `skills/`               bundled skill (`skills/lotusscript-modular/SKILL.md`)
- `test/`                 test suites

**Rule: slices never import each other.** They depend on `src/shared` only; `index.ts` wires them.

## Hard Rules
- Node built-ins only, plus `typebox` for tool schemas.
- `src/**` imports use explicit `.js` extensions (NodeNext).
- Pure functions in slices.
- No modularity, ever: `tool_call` must not rewrite `input.path`, no hook may block
  shell inspection of a source file, `guidelines.ts` must not offer decompilation or
  modular folders as an option, scaffolding emits whole `.lss` files only, and no code
  may create a `manifest.json` / `main.lss` / `_compiled.lss` / `sub_*.lss` again.
  If a modular feature is ever wanted back, restore it from the archive — do not
  re-grow it in `src/`.
- Single source of truth for gotchas: all newly discovered gotchas must be recorded in `src/slices/gotchas/gotchas.md` (via `/ls gotchas add` or tool `lotusscript_gotchas`).
- Project detection stays bounded: never walk the repository at startup (depth/entry/time limits in
  `src/slices/project/detect.ts`), never treat "no evidence" as proof of absence, and never load the
  entry skill without operator consent (`skillPrompt`). The consent modal is the only startup dialog
  and must degrade to silence outside the TUI (RPC / print / json).
- Advertise the skill ONLY through `resources_discover` (`src/slices/project/resources.ts`). Never add
  a `skills` entry for it to `settings.json` `packages[]` or to this package's `pi` manifest: a
  package-level skill entry is unconditional, so it offers a LotusScript manual in every repository
  and collides with the discovery answer (`name "lotusscript-modular" collision`).

## UX: one surface per fact (the HUD)

Every live fact is rendered in ONE place: the HUD widget above the editor
(`src/shared/state-hud.ts`). The plugin writes NOTHING to the footer/status
line: `setRunState()` only records the state and re-renders the HUD, because a
status entry renders as `<key>: <value>` (eldritch-footer's full preset printed
`lotusscript: 🪷 LS 4/4 ✓`) — the same fact in a second, worse place.
`emitTrace` updates the HUD instead of posting a chat toast; `/ls` handlers print a headline plus the tool that returns the full
text instead of pushing tables or diagnostics into a transient toast. Before
adding output, decide which single surface owns it — adding a second place for a
number that already exists is a bug, not a feature.

Panel shape (four lines, colour-coded per segment, progress bars, braille spinner
in the LSP cell while a check compiles):

```
🪷 LS ▰▰▱▱ 2/4 · ⠹ kontroluji… · LSP ⠋ · KB ▰▰▱ 2/3
🔧 haky 47: volání 12 · výsledky 9 · dokončení 2
⚡ brány: 0 blokováno · 1 settle-nudge
🧩📄📝 naposled: kontrolní běh · ag_x.lss
```

`hudSegments()` is the ONE layout owner (pure, colour-tagged, i18n fragments);
`LotusHudComponent` only paints tags with the live theme and clips each line.
Bars round down (a half-met requirement never reads as met), colours come from
theme roles — never raw ANSI — and the repaint timer runs **only** while a check
is in flight (`stopHudAnimation()` is drained on `session_shutdown`).

## UX: Lazy Menus & i18n
- **Lazy menus** = `/ls` argument completions via `completeLsArguments(prefix, config)`.
- **Completion contract (critical):** `getArgumentCompletions(prefix)` receives the entire argument text after `/ls `, and `item.value` replaces the whole prefix (`value` = full argument string with trailing space for non-terminals, `label` = leaf token).
- **Multilingual UI (pi-plugin-dev §10):** every user-facing string (notify / input / setStatus / widgets / modals / completions / command description) resolves through `stringsFor(state.config.lang)` from `src/shared/i18n.ts` — never hardcode prose. The persisted `lang` config key (`/ls lang cs|en`, default `cs`) is the only source of truth; never sniff LANG/LC_ALL/Intl. Model-facing text (tool descriptions, tool results, injected guidelines, debriefs) stays English. Both locales must carry every key — `test/test_i18n.ts` enforces parity.
