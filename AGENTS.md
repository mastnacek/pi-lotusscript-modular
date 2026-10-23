# pi-lotusscript-modular — build guide

Pi extension for **opt-in** virtual modularization of LotusScript, modular compilation, LSP
verification, and a central Gotchas registry for IBM Notes/Domino 9.0.1.

**Decompilation was removed on 2026-10-23.** A monolithic `.lss`/`.dxl` is the
source shape this plugin works with; nothing is split on read and no hook rewrites
`input.path`. The removed pipeline (decompile-lss/-dxl, the `lotusscript_decompile`
tool, `/ls decompile`, the read-time interception and the shell content-dump guard)
is archived with its documentation in
`D:\01_programovani\pi\plugins\_archiv\lotusscript-dekompilace` — restore from
there if it is ever wanted again, do not re-grow a second copy in `src/`.

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
- No modularization of monoliths: `tool_call` must not rewrite `input.path`, no hook may block
  shell inspection of a source file, and `guidelines.ts` must not offer decompilation as an
  option. `test/fixtures/` keeps the archived decompiler for compile-side fixtures only.
- Single source of truth for gotchas: all newly discovered gotchas must be recorded in `src/slices/gotchas/gotchas.md` (via `/ls gotchas add` or tool `lotusscript_gotchas`).

## UX: Lazy Menus & i18n
- **Lazy menus** = `/ls` argument completions via `completeLsArguments(prefix, config)`.
- **Completion contract (critical):** `getArgumentCompletions(prefix)` receives the entire argument text after `/ls `, and `item.value` replaces the whole prefix (`value` = full argument string with trailing space for non-terminals, `label` = leaf token).
- **Multilingual UI (pi-plugin-dev §10):** every user-facing string (notify / input / setStatus / widgets / modals / completions / command description) resolves through `stringsFor(state.config.lang)` from `src/shared/i18n.ts` — never hardcode prose. The persisted `lang` config key (`/ls lang cs|en`, default `cs`) is the only source of truth; never sniff LANG/LC_ALL/Intl. Model-facing text (tool descriptions, tool results, injected guidelines, debriefs) stays English. Both locales must carry every key — `test/test_i18n.ts` enforces parity.
