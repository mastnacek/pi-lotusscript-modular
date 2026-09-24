# Scaffolding Reference (Compliant Code Generation)

How to generate new LotusScript artifacts with the plugin so they pass the
linter, the JEV evaluator and the Definition of Done from the first compile.

---

## 1. When to Scaffold

- **New agent / script** → `type: "agent"` — standalone `.lss` with header,
  `Option Public/Declare`, `%Include "lsconst.lss"`, error handler, `Initialize`.
- **New shared library** → `type: "library"` — Script Library skeleton with
  version constant and sample public function.
- **New procedure inside an existing modular folder** → `type: "procedure"` —
  creates `sub_<Name>.lss` / `func_<Name>.lss` with the synthetic header
  (`@script-member-of`, `@procedure`, `@parent-declarations`) and `' Účel:` line.
  Manifest + `main.lss` are reconciled automatically on the next compile.
- **Whole new modular agent folder** → `type: "modular"` — full folder:
  `manifest.json`, `main.lss`, `00_options.lss`, `01_declarations.lss`,
  `sub_Process.lss`, `99_initialize.lss`.

Never hand-write these skeletons when the scaffold tool exists — hand-written
headers drift from the linter contract (missing `%Include "lsconst.lss"`,
missing `' Účel:`, wrong header order).

---

## 2. Slash Command

```
/ls scaffold agent <Název> [cílová-složka]
/ls scaffold library <Název> [cílová-složka]
/ls scaffold procedure <Název> [cílová-složka]
/ls scaffold modular <Název> [cílová-složka]
```

The command creates the skeleton with default headers (author "AI Developer").
For parameterized generation use the tool.

---

## 3. Tool: `lotusscript_scaffold`

| Parameter | Required | Notes |
| --- | --- | --- |
| `type` | ✅ | `"agent" \| "library" \| "procedure" \| "modular"` (StringEnum) |
| `name` | ✅ | Artifact name. `sub_`/`func_` prefixes are stripped for procedures |
| `targetDir` | — | Defaults to CWD |
| `purpose` | — | Fills the header `ÚČEL:` and the `' Účel:` marker |
| `author` | — | Header `AUTOR` (default "AI Developer") |
| `isFunction` | — | For `procedure`: generate `Function` instead of `Sub` |
| `parentAgent` | — | For `procedure`: `@script-member-of` value (defaults to folder name) |
| `returnType` | — | For `procedure` + `isFunction`: e.g. `"String"`, `"Long"` |
| `params` | — | Parameter list, e.g. `"doc As NotesDocument"` |

Failure modes (returned as errors): target file/folder already exists,
empty name. The tool never overwrites existing code.

---

## 4. What Each Skeleton Guarantees

| Skeleton | Guarantee |
| --- | --- |
| `agent` | `Option Public` + `Option Declare` + `%Include "lsconst.lss"`, full NÁZEV/ÚČEL/AUTOR header + CHANGELOG, `On Error GoTo Catch` in `Initialize`, chained `Error Err` in workers |
| `library` | Same header contract + `Public Const LIB_VERSION` + sample `Public Function` |
| `procedure` | Synthetic `@script-member-of`/`@procedure`/`@parent-declarations` header, `' Účel:` line, `Catch:` re-raise with `Erl` context |
| `modular` | Complete folder: `00_options.lss`, `01_declarations.lss` (`g_session`/`g_db`), `sub_Process.lss`, `99_initialize.lss`, synced `manifest.json` + `main.lss` |

---

## 5. After Scaffolding (Definition of Done chain)

1. Fill the implementation inside the marked sections — keep every procedure
   ≤ `maxProcedureLines` (300).
2. Edit `01_declarations.lss` for any new globals/types; declare them there,
   never inside procedure files (gotcha #38 for Option placement).
3. Compile: `/ls compile [složka]` or `lotusscript_compile(folder, clean)`.
4. Verify the scorecard reaches the DoD (LSP clean, comments present,
   manifest synced, artifact written).
5. On any compile error: search `lotusscript_gotchas` with the error text
   before changing code.

---

## 6. Template Constants (single source of truth)

Templates live in `src/slices/scaffold/templates.ts`:
`agentTemplate`, `libraryTemplate`, `procedureTemplate`,
`modularFolderTemplate`. Change them there — never patch generated output
by hand in skill docs, otherwise the scaffolds and the docs drift apart.