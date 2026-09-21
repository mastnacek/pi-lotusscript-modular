# pi-lotusscript-modular

> Pi coding agent extension for virtual modularization, automatic decompilation, compilation, optional LSP verification, and central Gotchas knowledge registry for IBM Notes/Domino 9.0.1 LotusScript.

Built using **Vertical Slice Architecture (VSA)** with interactive **Lazy Menus**.

---

## Features

- **Virtual Modularization:** Decomposes monolithic `.lss` and `.dxl` Domino agents into structured modular files (`00_options.lss`, `01_declarations.lss`, `sub_*.lss`, `func_*.lss`, `99_initialize.lss`, `main.lss`, and `manifest.json`).
- **Auto-Decompile on Read:** When an agent reads a monolithic `.lss` or `.dxl` file, the extension automatically splits it into a folder alongside the source file and redirects reading to `main.lss`.
- **Auto-Manifest Sync & Recompile on Save:** When editing or adding any procedure in the modular folder, `manifest.json` is updated and the compiled artifact is regenerated automatically.
- **Overwrite `.lss` Source:** Keeps the original `.lss` source file in sync on recompile by default (safe for git). DXL files are never overwritten with plain text.
- **LotusScript LSP Verification (Optional):** Automatically runs syntax checks via LotusScript LSP server upon compilation.
- **Central Gotchas Registry (40+ Rules):** Single source of truth for all LotusScript gotchas (built-in keywords as names, ForAll loop alias declarations, Const without 'As Type', ComputeWithForm side-effects, etc.). New gotchas are recorded centrally.
- **Mandatory Knowledge Base Reminder:** Enforces consulting the `lotus-notes` MCP collection before writing or modifying Notes 9.0.1 LotusScript code.

---

## Lazy Menus (`/ls`)

Type `/ls ` and press Tab to see interactive autocomplete suggestions:

- `/ls status` — Zobrazit aktuální konfiguraci pluginu
- `/ls config get <klíč>` — Vypsat hodnotu nastavení
- `/ls config set <klíč> <hodnota>` — Uložit novou hodnotu nastavení
- `/ls lsp [on|off]` — Přepnout kontrolu syntaxe přes LotusScript LSP
- `/ls overwrite [on|off]` — Přepnout přepisování původního .lss souboru
- `/ls compile [složka]` — Sestavit modulární složku do `_compiled.lss`
- `/ls decompile <soubor>` — Rozložit monolitický `.lss` nebo `.dxl` do podsložky
- `/ls gotchas [dotaz]` — Prohledat centrální bázi 40+ LotusScript gotchas

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
  "injectGotchasSummary": true
}
```

---

## Tools for LLM

- `lotusscript_compile`: Recompiles modular folder to `<AgentName>_compiled.lss` (and original `.lss` if enabled).
- `lotusscript_decompile`: Decompiles monolithic `.lss` or `.dxl`.
- `lotusscript_lsp_toggle`: Programmatically toggle LSP check on/off.
- `lotusscript_gotchas`: Search 40+ gotchas, view summary, or add newly discovered gotchas to the central registry.

---

## VSA Architecture

- `index.ts` — Composition root: wires slices and Pi hooks.
- `src/shared/` — Kernel types, config, and path utilities.
- `src/slices/parser/` — Decompilation, recompilation, manifest synchronization.
- `src/slices/lsp/` — LotusScript LSP client diagnostics.
- `src/slices/gotchas/` — Central 40+ gotchas registry, search, and dynamic append.
- `src/slices/settings/` — Setting specs catalogue and lazy menu completion engine.

---

## Installation

Inside Pi:
```bash
pi install git:github.com/mastnacek/pi-lotusscript-modular
```
Or from local directory:
```bash
pi install D:/01_programovani/pi/plugins/pi-lotusscript-modular
```

---

## License

MIT © [mastnacek](https://github.com/mastnacek)
