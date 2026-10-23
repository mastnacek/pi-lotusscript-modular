# pi-lotusscript-modular

> Pi coding agent extension for whole-file LotusScript work: every `.lss` is checked exactly as it is by the IBM Notes/Domino 9.0.1 compiler oracle (domino LSP), plus compliant scaffolding and a central Gotchas knowledge registry. The modular-folder workflow is gone — no compilation, no manifest, no fragments.

Built using **Vertical Slice Architecture (VSA)** with interactive **Lazy Menus**.

---

## Features

- **Whole-File 9.0.1 Compiler Check:** `lotusscript_check` (and `/ls check <file.lss>`) compiles a `.lss` exactly as it is through the domino LSP oracle — no assembly, no strict probe — and attaches help pages for the LS-* error codes. The editor lane (pi-lens) runs the same whole-script compile on open/save/change, so IDE and tool diagnostics always agree.
- **Auto-Check on Edit:** every `.lss` edit re-runs the whole-file check (compiler, purpose comments, scorecard) and injects the result into the conversation (`autoCheckOnEdit`). Nothing is compiled, assembled or generated behind the agent's back.
- **LotusScript LSP Verification (Optional):** Automatically runs syntax checks via LotusScript LSP server upon compilation.
- **Central Gotchas Registry (64 Rules):** Single source of truth for all LotusScript gotchas (built-in keywords as names, ForAll loop alias declarations, Const without 'As Type', ComputeWithForm side-effects, etc.). New gotchas are recorded centrally with interactive user approval.
- **Deterministic Scorecard & Definition of Done:** Every check emits a computed scorecard (Czech purpose comments, LSP errors, KB consultation) with trend history — the model never self-reports.
- **Code Scaffolding:** `/ls scaffold` and `lotusscript_scaffold` generate compliant whole-file skeletons (standalone agent, script library) rendered from the shipped versioned `template.lss` with `On Error GoTo ErrorHandler` handlers, derive the convention alias (`ag_…`), and emit a ready-to-follow Designer registration notice (name, alias, description, paste steps).
- **Naming Conventions Reference:** Typed alias grammar (`ag_`, `lu_`, `frm_`, `fld_`, …) in the bundled reference docs so every new element is machine-recognizable in the design graph.
- **Bundled Skill (auto-loaded):** The skill `lotusscript-modular` (`skills/lotusscript-modular/SKILL.md`) IS registered — pi auto-discovers the conventional `skills/` directory even without a `pi` manifest entry, so the skill loads in every session and routes to on-demand reference docs (`references/`: workflow, coding conventions, naming, 64-gotcha index, scaffolding, DXL/ODP, formula language). The extension tools provide the runtime enforcement (guards, scorecard, gotcha store).
- **Mandatory Knowledge Base Reminder:** Enforces consulting the `lotus-notes` MCP collection (IBM 9.0.1 reference, Guirard performance book, community articles) before writing or modifying Notes 9.0.1 LotusScript code.
- **In-TUI Telemetry Panel:** Live counters above the editor (`showTelemetryPanel`): hook usage, KB-gate blocks, whole-file checks, and code length (procedure count, longest vs limit, LSP outcome). Subagent sessions are excluded via the recursion guard.
- **Hard KB Edit Gate:** The KB rule is ENFORCED — `edit`/`write` calls on `.lss`/`.dxl` files are rejected (`block: true`) until `kb_search` (collection `lotus-notes`) has been called this session. Gate re-arms on every new session; disable with `"enforceKbGate": false`.

---

## Lazy Menus (`/ls`)

Type `/ls ` and press Tab to see interactive autocomplete suggestions:

- `/ls status` — Zobrazit aktuální konfiguraci pluginu
- `/ls lang [cs|en]` — Přepnout jazyk rozhraní (výchozí `cs`; zdroj pravdy je perzistentní klíč `lang`, nikdy proměnné prostředí)
- `/ls config get <klíč>` — Vypsat hodnotu nastavení
- `/ls <nastavení> [on|off]` — Přímé zobrazení nebo nastavení libovolného přepínače z katalogu (totéž co `/ls config set`, kratší zápis)
- `/ls config set <klíč> <hodnota>` — Uložit novou hodnotu nastavení (u přepínačů `on` / `off`, v pickeru označená `✓` jako aktivní)
- `/ls scaffold <agent|library> [název]` — Vytvořit kostru LotusScript kódu (celý .lss soubor)
- `/ls lsp [on|off]` — Přepnout kontrolu syntaxe přes LotusScript LSP
- `/ls overwrite [on|off]` — Přepnout přepisování původního .lss souboru
- `/ls check <soubor.lss>` — Zkontrolovat celý .lss překladačem 9.0.1
- `/ls lint [složka]` — Zkontrolovat délku procedur (max 300 řádků) a komentáře
- `/ls score [složka]` — Zobrazit scorecard a trend hodnocení agenta
- `/ls gotchas [dotaz]` — Prohledat centrální bázi 64 LotusScript gotchas

---

## Configuration

Stored in `.pi/lotusscript-modular.json`:

```json
{
  "enableLsp": false,
  "autoCheckOnEdit": true,
  "overwriteSourceLss": true,
  "enforceKbPrompt": true,
  "enforceKbGate": true,
  "injectGotchasSummary": true
}
```

---

## Tools for LLM

- `lotusscript_check`: Whole-file 9.0.1 compiler diagnostics for a `.lss`/`.lsa` (checked exactly as it is) + error-code help pages.
- `lotusscript_scaffold`: Generates compliant whole-file code skeletons (agent, library) with StringEnum-typed parameters.
- `lotusscript_lsp_toggle`: Programmatically toggle LSP check on/off.
- `lotusscript_gotchas`: Search 64 gotchas, view summary, or add newly discovered gotchas to the central registry (interactive modal approval).

---

## Bundled Skill & Reference Docs

`skills/lotusscript-modular/` — the session skill (`SKILL.md` router, auto-loaded by pi from the conventional `skills/` directory) plus the on-demand reference docs it routes to. The router gives the core contract and Definition of Done; the references carry the detail:

- `workflow.md` — whole-file lifecycle (edit → check → Designer paste), CLI/tool reference, language policy detail
- `coding-conventions.md` — Domino 9.0.1 coding standards, error handling, forbidden names
- `gotchas-index.md` — 64-entry one-liner index + recording protocol
- `scaffolding.md` — scaffold command/tool usage, guarantees and alias derivation
- `naming-conventions.md` — element naming/alias convention (`ag_`, `lu_`, `frm_`, …) and why
- `dxl-and-odp.md` — DXL design-element editing rules (forms, views, ODP)

---

## VSA Architecture

- `index.ts` — Composition root: wires slices and Pi hooks.
- `src/shared/` — Kernel types, config, and path utilities.
- `src/slices/lsp/` — LotusScript LSP client diagnostics.
- `src/slices/gotchas/` — Central 64-gotcha registry, search, and dynamic append.
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
