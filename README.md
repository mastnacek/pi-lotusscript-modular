# pi-lotusscript-modular

> Pi coding agent extension for whole-file LotusScript work: every `.lss` is checked exactly as it is by the IBM Notes/Domino 9.0.1 compiler oracle (domino LSP), plus compliant scaffolding and a central Gotchas knowledge registry. The modular-folder workflow is gone — no compilation, no manifest, no fragments.

Built using **Vertical Slice Architecture (VSA)** with interactive **Lazy Menus**.

---

## Features

- **Whole-File 9.0.1 Compiler Check:** `lotusscript_check` (and `/ls check <file.lss>`) compiles a `.lss` exactly as it is through the domino LSP oracle — no assembly, no strict probe — and attaches help pages for the LS-* error codes. The editor lane (pi-lens) runs the same whole-script compile on open/save/change, so IDE and tool diagnostics always agree.
- **Auto-Check on Edit:** every `.lss` edit re-runs the whole-file check (compiler + scorecard) and injects the result into the conversation (`autoCheckOnEdit`). Nothing is compiled, assembled or generated behind the agent's back.
- **LotusScript LSP Verification (Optional):** Automatically runs syntax checks via LotusScript LSP server upon compilation.
- **Central Gotchas Registry (64 Rules):** Single source of truth for all LotusScript gotchas (built-in keywords as names, ForAll loop alias declarations, Const without 'As Type', ComputeWithForm side-effects, etc.). New gotchas are recorded centrally with interactive user approval.
- **Deterministic Scorecard & Definition of Done:** Every check emits a computed scorecard (LSP errors, KB consultation) with trend history — the model never self-reports.
- **Code Scaffolding:** `/ls scaffold` and `lotusscript_scaffold` generate compliant whole-file skeletons (standalone agent, script library) rendered from the shipped versioned `template.lss` with `On Error GoTo ErrorHandler` handlers, derive the convention alias (`ag_…`), and emit a ready-to-follow Designer registration notice (name, alias, description, paste steps).
- **Naming Conventions Reference:** Typed alias grammar (`ag_`, `lu_`, `frm_`, `fld_`, …) in the bundled reference docs so every new element is machine-recognizable in the design graph.
- **Bundled Skill (operator-consented):** The skill `lotusscript-modular` (`skills/lotusscript-modular/SKILL.md`) ships inside the package and routes to on-demand reference docs (`references/`: workflow, coding conventions, naming, 64-gotcha index, scaffolding, DXL/ODP, formula language). In a Domino workspace the plugin offers it at session start with a static lotus modal (`skillPrompt`: `ask` / `always` / `never`); consent injects the skill body as instructions for the first run, and "don't ask in this project" is remembered in `.pi/lotusscript-modular.json`. The extension tools provide the runtime enforcement (guards, scorecard, gotcha store).
- **Domino Project Detection:** A bounded scan (2 directory levels, dependency/VCS/plugin folders skipped, first evidence file wins) decides whether the workspace holds `.lss` / `.dxl` / `.fl` / `.ls` sources. Evidence drives two things: the consent modal, and the `resources_discover` answer — so the skill is **listed only in Domino projects** (never globally), and nothing is loaded without consent. When nothing is loaded, a one-line pointer stays in the system prompt plus an entry-skill line in every `.lss` read banner (`injectProjectSkillHint`).
- **Mandatory Knowledge Base Reminder:** Enforces consulting the `lotus-notes` MCP collection (IBM 9.0.1 reference, Guirard performance book, community articles) before writing or modifying Notes 9.0.1 LotusScript code.
- **Single HUD:** every live fact is rendered in one width-safe panel above the editor (`showTelemetryPanel`) — score and run state, the last LSP verdict, KB progress (`n/minKbSearchesPerRun`), hook counters, gate blocks and settle nudges, and the trace icon tail with the last checkpoint. The status line keeps one glyph-only badge (`🪷 LS 4/4 ✓`), so nothing is shown twice. Trace checkpoints never post a chat toast; long `/ls` output (audit table, gotcha bodies, raw diagnostics) prints a headline plus the tool that returns the full text. Subagent sessions are excluded via the recursion guard.
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
- `/ls check <soubor.lss>` — Zkontrolovat celý .lss překladačem 9.0.1
- `/ls score [soubor.lss]` — Zobrazit scorecard a trend hodnocení souboru
- `/ls gotchas [dotaz]` — Prohledat centrální bázi 64 LotusScript gotchas
- `/ls audit [slozka]` — Najít procedury duplikované mezi .lss soubory a navrhnout je do skriptové knihovny
- `/ls help` — Přehled příkazů

---

## Configuration

Stored in `.pi/lotusscript-modular.json`:

```json
{
  "enableLsp": false,
  "autoCheckOnEdit": true,
  "enforceKbPrompt": true,
  "enforceKbGate": true,
  "injectGotchasSummary": true
}
```

---

## Tools for LLM

- `lotusscript_check`: Whole-file 9.0.1 compiler diagnostics for a `.lss`/`.lsa` (checked exactly as it is) + error-code help pages.
- `lotusscript_scaffold`: Generates compliant whole-file code skeletons (agent, library) with StringEnum-typed parameters.
- `lotusscript_gotchas`: Search 64 gotchas, view summary, or add newly discovered gotchas to the central registry (interactive modal approval).
- `lotusscript_library_audit`: Read-only duplicate-procedure audit across a folder of `.lss` files, ranked by saved lines, with an optional promotion plan.

LSP checking is toggled with `/ls lsp on|off` or the `enableLsp` setting — there is no tool for it.

---

## Bundled Skill & Reference Docs

`skills/lotusscript-modular/` — the session skill (`SKILL.md` router) plus the on-demand reference docs it routes to. The router gives the core contract and Definition of Done; the references carry the detail:

- `workflow.md` — whole-file lifecycle (edit → check → Designer paste), CLI/tool reference, language policy detail
- `coding-conventions.md` — Domino 9.0.1 coding standards, error handling, forbidden names
- `libraries-and-versioning.md` — script libraries, `Use` rules, `VERZE`/`CHANGELOG` headers, deployment order, error 151
- `reuse-ladder.md` — check whether the element already exists before writing code
- `domino-search-and-access.md` — ODP/DXL export search, ACL/visibility/deploy reachability
- `object-model.md` + `lotus-class-index.md` — verifying Notes classes and members
- `gotchas-index.md` — 64-entry one-liner index + recording protocol
- `scaffolding.md` — scaffold command/tool usage, guarantees and alias derivation
- `naming-conventions.md` — element naming/alias convention (`ag_`, `lu_`, `frm_`, …) and why
- `dxl-and-odp.md` — DXL design-element editing rules (forms, views, ODP)
- `formula-language.md` — `@formula` best practices

**How it is advertised:** the package declares no `skills` entry. The plugin answers pi's `resources_discover` hook with this one path, and only when the bounded project scan finds Domino evidence — so an unrelated repository is never offered a LotusScript manual. Session start offers it through a consent modal (`skillPrompt`: `ask` / `always` / `never`); "don't ask in this project" is remembered in `.pi/lotusscript-modular.json`.

---

## VSA Architecture

- `index.ts` — Composition root: wires slices and Pi hooks.
- `src/shared/` — Kernel: types, config, paths, i18n (cs/en), session state, HUD, insights.
- `src/slices/project/` — Bounded project detection + entry-skill consent (the only skill advertisement).
- `src/slices/pipeline/` — Event translation: tool_call, tool_result, settled, before_settle, guidelines.
- `src/slices/guards/` — KB edit gate.
- `src/slices/lsp/` — domino LSP/MCP lane: whole-file diagnostics, explain, format.
- `src/slices/gotchas/` — Central 64-gotcha registry, search, sync and dynamic append.
- `src/slices/scaffold/` — LotusScript code templates and scaffold engine.
- `src/slices/scorecard/` — Deterministic scorecard, rubric, recurring-diagnostic drafts.
- `src/slices/settings/` — Setting specs catalogue and lazy menu completion engine.
- `src/slices/commands/` — `/ls` dispatch (`status`, `config`, `lsp`, `lang`, `scaffold`, `score`, `check`, `gotchas`, `audit`, `help`).
- `src/slices/tools/` — Model tools (`lotusscript_check`, `_scaffold`, `_gotchas`, `_library_audit`).
- `src/slices/audit/` — Duplicated-procedure audit and library-promotion plan.
- `src/slices/versioning/` — `VERZE`/`CHANGELOG` header nudge.
- `src/slices/drift/` — Library-drift nudge.
- `src/slices/trace/` — Visible skill trace in the chat.

---

## Installation

Inside Pi:
```bash
pi install git:github.com/mastnacek/pi-lotusscript-modular
```

---

## License

MIT © [mastnacek](https://github.com/mastnacek)
