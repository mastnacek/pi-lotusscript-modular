# pi-lotusscript-modular

> Pi coding agent extension for virtual modularization, automatic decompilation, compilation, and optional LSP verification of IBM Notes/Domino 9.0.1 LotusScript agents and scripts.

---

## Features

- **Virtual Modularization:** Automatically decomposes monolithic `.lss` and `.dxl` Domino agents into structured modular files (`00_options.lss`, `01_declarations.lss`, `sub_*.lss`, `func_*.lss`, `99_initialize.lss`, `main.lss`, and `manifest.json`).
- **Auto-Decompile on Read:** When an agent reads a monolithic `.lss` or `.dxl` file, the extension splits it into a folder alongside the source file and redirects reading to `main.lss`.
- **Auto-Manifest Sync & Recompile on Save:** When editing or adding any procedure in the modular folder, `manifest.json` is updated and the compiled artifact is regenerated automatically.
- **Overwrite `.lss` Source:** Keeps the original `.lss` source file in sync on recompile by default (safe for git). DXL files are never overwritten with plain text.
- **LotusScript LSP Verification (Optional):** Can automatically run syntax checks via LotusScript LSP server upon compilation.
- **Mandatory Knowledge Base Reminder:** Enforces consulting the `lotus-notes` MCP collection before writing or modifying Notes 9.0.1 LotusScript code.

---

## Installation

Inside Pi:
```bash
pi install git:github.com/mastnacek/pi-lotusscript-modular
```
Or for local development:
```bash
pi install D:/01_programovani/pi/plugins/pi-lotusscript-modular
```

---

## Configuration

Settings are stored in `.pi/lotusscript-modular.json` in the target project root:

```json
{
  "enableLsp": false,
  "autoDecompileOnRead": true,
  "autoRecompileOnSave": true,
  "keepTimestampInCompiledName": false,
  "overwriteSourceLss": true,
  "enforceKbPrompt": true
}
```

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `enableLsp` | boolean | `false` | Run LotusScript LSP diagnostics check after recompile. |
| `overwriteSourceLss` | boolean | `true` | Overwrite original `.lss` file on recompile. |
| `autoDecompileOnRead` | boolean | `true` | Automatically split monoliths when read. |
| `autoRecompileOnSave` | boolean | `true` | Recompile on edit/write to modular files. |
| `enforceKbPrompt` | boolean | `true` | Prompt agent to consult `lotus-notes` knowledge base. |
| `keepTimestampInCompiledName` | boolean | `false` | Also generate `<Name>_<timestamp>_compiled.lss`. |

---

## Commands

- `/ls-lsp [on|off]` — Toggle LotusScript LSP validation on recompile.
- `/ls-overwrite [on|off]` — Toggle overwriting original `.lss` file on recompile.
- `/ls-status` — Show active settings.
- `/ls-compile [folder]` — Manually recompile a modular agent folder.
- `/ls-decompile <file>` — Manually decompile a monolithic `.lss` or `.dxl` file.

---

## Tools for LLM

- `lotusscript_compile`: Recompiles modular folder to `<AgentName>_compiled.lss` (and original `.lss` if enabled).
- `lotusscript_decompile`: Decompiles monolithic `.lss` or `.dxl`.
- `lotusscript_lsp_toggle`: Programmatically toggle LSP check on/off.

---

## License

MIT © [mastnacek](https://github.com/mastnacek)
