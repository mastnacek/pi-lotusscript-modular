# pi-lotusscript-modular — build guide

Pi extension for virtual modularization, automatic decompilation, compilation, LSP verification, and central Gotchas registry for IBM Notes/Domino 9.0.1 LotusScript.

## Layout (VSA — Vertical Slice Architecture)
- `index.ts`              composition root — Pi adapter only, no domain computation
- `src/shared/`           kernel: `types.ts`, `config.ts`, `paths.ts`, `i18n.ts` + `i18n-cs.ts`/`i18n-en.ts` (no slice imports)
- `src/slices/parser/`    decompilation, recompilation, manifest.json synchronization
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
- Single source of truth for gotchas: all newly discovered gotchas must be recorded in `src/slices/gotchas/gotchas.md` (via `/ls gotchas add` or tool `lotusscript_gotchas`).

## UX: Lazy Menus & i18n
- **Lazy menus** = `/ls` argument completions via `completeLsArguments(prefix, config)`.
- **Completion contract (critical):** `getArgumentCompletions(prefix)` receives the entire argument text after `/ls `, and `item.value` replaces the whole prefix (`value` = full argument string with trailing space for non-terminals, `label` = leaf token).
- **Multilingual UI (pi-plugin-dev §10):** every user-facing string (notify / input / setStatus / widgets / modals / completions / command description) resolves through `stringsFor(state.config.lang)` from `src/shared/i18n.ts` — never hardcode prose. The persisted `lang` config key (`/ls lang cs|en`, default `cs`) is the only source of truth; never sniff LANG/LC_ALL/Intl. Model-facing text (tool descriptions, tool results, injected guidelines, debriefs) stays English. Both locales must carry every key — `test/test_i18n.ts` enforces parity.
