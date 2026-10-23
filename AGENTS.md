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
- `src/shared/`           kernel: `types.ts`, `config.ts`, `paths.ts`, `i18n.ts` + `i18n-cs.ts`/`i18n-en.ts` (no slice imports)
- `src/slices/lsp/`       LotusScript LSP diagnostics client
- `src/slices/gotchas/`   canonical 64 LotusScript gotchas registry, search & append
- `src/slices/settings/`  catalogue + lazy menu completions for `/ls`
- `src/slices/commands/`  `/ls` dispatch — sibling-slice capabilities arrive via `deps.ts` (`CommandsDeps`), wired in the composition root
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

## UX: Lazy Menus & i18n
- **Lazy menus** = `/ls` argument completions via `completeLsArguments(prefix, config)`.
- **Completion contract (critical):** `getArgumentCompletions(prefix)` receives the entire argument text after `/ls `, and `item.value` replaces the whole prefix (`value` = full argument string with trailing space for non-terminals, `label` = leaf token).
- **Multilingual UI (pi-plugin-dev §10):** every user-facing string (notify / input / setStatus / widgets / modals / completions / command description) resolves through `stringsFor(state.config.lang)` from `src/shared/i18n.ts` — never hardcode prose. The persisted `lang` config key (`/ls lang cs|en`, default `cs`) is the only source of truth; never sniff LANG/LC_ALL/Intl. Model-facing text (tool descriptions, tool results, injected guidelines, debriefs) stays English. Both locales must carry every key — `test/test_i18n.ts` enforces parity.
