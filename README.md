# pi-lotusscript-modular

> Pi coding agent extension for virtual modularization, automatic decompilation, compilation, optional LSP verification, and central Gotchas knowledge registry for IBM Notes/Domino 9.0.1 LotusScript.

Built using **Vertical Slice Architecture (VSA)** with interactive **Lazy Menus**.

---

## Features

- **Virtual Modularization:** Decomposes monolithic `.lss` and `.dxl` Domino agents into structured modular files (`00_options.lss`, `01_declarations.lss`, `sub_*.lss`, `func_*.lss`, `99_initialize.lss`, `main.lss`, and `manifest.json`).
- **Auto-Decompile on Read:** When an agent reads or inspects a monolithic `.lss` or `.dxl` file (via `read`, `read_all`, `ctx_execute_file`, etc.), the extension automatically splits it into a folder alongside the source file and redirects reading to `main.lss`.
- **Auto-Manifest Sync & Recompile on Save:** When editing or adding any procedure in the modular folder, `manifest.json` is updated and the compiled artifact is regenerated automatically.
- **Overwrite `.lss` Source:** Keeps the original `.lss` source file in sync on recompile by default (safe for git). DXL files are never overwritten with plain text.
- **LotusScript LSP Verification (Optional):** Automatically runs syntax checks via LotusScript LSP server upon compilation.
- **Central Gotchas Registry (42 Rules):** Single source of truth for all LotusScript gotchas (built-in keywords as names, ForAll loop alias declarations, Const without 'As Type', ComputeWithForm side-effects, etc.). New gotchas are recorded centrally with interactive user approval.
- **Deterministic Scorecard & Definition of Done:** Every recompile emits a computed scorecard (procedure limits, Czech purpose comments, LSP errors, manifest sync, artifact) with trend history — the model never self-reports.
- **Code Scaffolding:** `/ls scaffold` and `lotusscript_scaffold` generate compliant skeletons (standalone agent, script library, modular procedure, full modular folder) with protected headers, `%Include "lsconst.lss"` and error handlers, derive the convention alias (`ag_…`), and emit a ready-to-follow Designer registration notice (name, alias, description, paste steps).
- **Naming Conventions Reference:** Typed alias grammar (`ag_`, `lu_`, `frm_`, `fld_`, …) in the skill so every new element is machine-recognizable in the design graph.
- **Comprehensive Skill:** Progressive-disclosure skill (`skills/lotusscript-modular/`) with `references/` for workflow, coding conventions, 42-gotcha index, scaffolding and DXL/ODP editing.
- **Mandatory Knowledge Base Reminder:** Enforces consulting the `lotus-notes` MCP collection before writing or modifying Notes 9.0.1 LotusScript code.
- **Hard KB Edit Gate:** The KB rule is ENFORCED — `edit`/`write` calls on `.lss`/`.dxl` files are rejected (`block: true`) until `kb_search` (collection `lotus-notes`) has been called this session. Gate re-arms on every new session; disable with `"enforceKbGate": false`.

---

## Lazy Menus (`/ls`)

Type `/ls ` and press Tab to see interactive autocomplete suggestions:

- `/ls status` — Zobrazit aktuální konfiguraci pluginu
- `/ls config get <klíč>` — Vypsat hodnotu nastavení
- `/ls config set <klíč> <hodnota>` — Uložit novou hodnotu nastavení
- `/ls scaffold <agent|library|procedure|modular> [název]` — Vytvořit kostru LotusScript kódu
- `/ls lsp [on|off]` — Přepnout kontrolu syntaxe přes LotusScript LSP
- `/ls overwrite [on|off]` — Přepnout přepisování původního .lss souboru
- `/ls compile [složka]` — Sestavit modulární složku do `_compiled.lss`
- `/ls pack [složka]` — Sestavit do .lss a smazat modulární složku
- `/ls lint [složka]` — Zkontrolovat délku procedur (max 300 řádků) a komentáře
- `/ls score [složka]` — Zobrazit scorecard a trend hodnocení agenta
- `/ls jev [on|off|složka]` — Sémantické hodnocení komentářů a rizik modelem JEV
- `/ls decompile <soubor>` — Rozložit monolitický `.lss` nebo `.dxl` do podsložky
- `/ls gotchas [dotaz]` — Prohledat centrální bázi 42 LotusScript gotchas

---

## Configuration

Stored in `.pi/lotusscript-modular.json`:

```json
{
  "enableLsp": false,
  "autoDecompileOnRead": true,
  "autoRecompileOnSave": true,
  "keepTimestampInCompiledName": false,
  "overwriteSourceLss": true,
  "enforceKbPrompt": true,
  "enforceKbGate": true,
  "injectGotchasSummary": true
}
```

---

## Tools for LLM

- `lotusscript_compile`: Recompiles modular folder to `<AgentName>_compiled.lss` (and original `.lss` if enabled).
- `lotusscript_decompile`: Decompiles monolithic `.lss` or `.dxl`.
- `lotusscript_scaffold`: Generates compliant code skeletons (agent, library, procedure, modular folder) with StringEnum-typed parameters.
- `lotusscript_lsp_toggle`: Programmatically toggle LSP check on/off.
- `lotusscript_gotchas`: Search 42 gotchas, view summary, or add newly discovered gotchas to the central registry (interactive modal approval).

---

## Skill (Progressive Disclosure)

`skills/lotusscript-modular/` — lean router `SKILL.md` + on-demand `references/`:

- `workflow.md` — modular lifecycle, CLI/tool reference, language policy detail
- `coding-conventions.md` — Domino 9.0.1 coding standards, error handling, forbidden names
- `gotchas-index.md` — 42-entry one-liner index + recording protocol
- `scaffolding.md` — scaffold command/tool usage, guarantees and alias derivation
- `naming-conventions.md` — element naming/alias convention (`ag_`, `lu_`, `frm_`, …) and why
- `dxl-and-odp.md` — DXL design-element editing rules (forms, views, ODP)

---

## VSA Architecture

- `index.ts` — Composition root: wires slices and Pi hooks.
- `src/shared/` — Kernel types, config, and path utilities.
- `src/slices/parser/` — Decompilation, recompilation, manifest synchronization.
- `src/slices/lsp/` — LotusScript LSP client diagnostics.
- `src/slices/gotchas/` — Central 42-gotcha registry, search, and dynamic append.
- `src/slices/scaffold/` — LotusScript code templates and scaffold engine.
- `src/slices/settings/` — Setting specs catalogue and lazy menu completion engine.

---

## Installation

Inside Pi:
```bash
pi install git:github.com/mastnacek/pi-lotusscript-modular
```

---

## License

MIT © [mastnacek](https://github.com/mastnacek)
