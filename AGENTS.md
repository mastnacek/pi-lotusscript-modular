# pi-lotusscript-modular — build guide

Pi extension for **whole-file** LotusScript work: every `.lss` is checked exactly as it is
by the domino LSP (IBM Notes/Domino 9.0.1 compiler oracle), plus compliant scaffolding and
a central Gotchas registry.

**The modular workflow is gone.** Decompilation was removed on 2026-10-23 and the domino
LSP dropped all module-aware checking (sibling assembly, strict-mode probe) on 2026-11:
every `.lss` compiles as a whole script. The model tools are `lotusscript_check` (whole-file
compiler diagnostics), `lotusscript_scaffold` (agent/library skeletons only) and
`lotusscript_gotchas`. The parser slice (`src/slices/parser/`) stays only so legacy
pre-2026-11 modular folders on disk can still be compiled by `/ls compile [složka]` —
never create new ones. The removed decompile pipeline is archived in
`D:\01_programovani\pi\plugins\_archiv\lotusscript-dekompilace`.

## Layout (VSA — Vertical Slice Architecture)
- `index.ts`              composition root — Pi adapter only, no domain computation
- `src/shared/`           kernel: `types.ts`, `config.ts`, `paths.ts`, `i18n.ts` + `i18n-cs.ts`/`i18n-en.ts` (no slice imports)
- `src/slices/parser/`    recompilation, manifest.json synchronization
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
- No modularization, ever: `tool_call` must not rewrite `input.path`, no hook may block
  shell inspection of a source file, `guidelines.ts` must not offer decompilation or
  modular folders as an option, and scaffolding emits whole `.lss` files only.
  `test/fixtures/` keeps the archived decompiler for compile-side fixtures only.
- Single source of truth for gotchas: all newly discovered gotchas must be recorded in `src/slices/gotchas/gotchas.md` (via `/ls gotchas add` or tool `lotusscript_gotchas`).

## UX: Lazy Menus & i18n
- **Lazy menus** = `/ls` argument completions via `completeLsArguments(prefix, config)`.
- **Completion contract (critical):** `getArgumentCompletions(prefix)` receives the entire argument text after `/ls `, and `item.value` replaces the whole prefix (`value` = full argument string with trailing space for non-terminals, `label` = leaf token).
- **Multilingual UI (pi-plugin-dev §10):** every user-facing string (notify / input / setStatus / widgets / modals / completions / command description) resolves through `stringsFor(state.config.lang)` from `src/shared/i18n.ts` — never hardcode prose. The persisted `lang` config key (`/ls lang cs|en`, default `cs`) is the only source of truth; never sniff LANG/LC_ALL/Intl. Model-facing text (tool descriptions, tool results, injected guidelines, debriefs) stays English. Both locales must carry every key — `test/test_i18n.ts` enforces parity.
