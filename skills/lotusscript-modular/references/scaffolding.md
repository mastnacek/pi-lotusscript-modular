# Scaffolding Reference (Compliant Code Generation)

How to generate new LotusScript artifacts with the plugin so they pass the
linter and the Definition of Done from the first compile.

---

## 1. When to Scaffold

- **`New agent / script`** → `type: "agent"` — standalone `.lss` with header,
  `Option Public/Declare`, error handler, `Initialize`.
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
| `agent` | Rendered from the plugin's `src/slices/scaffold/template.lss`: `Option Public` + `Option Declare`, NÁZEV/ÚČEL/AUTOR/VYTVOŘENO/ZÁVISLOSTI header, `VERZE` + `CHANGELOG`, `On Error GoTo` handler with `Exit Sub`, `SendErrorEmail` notifier driven by `ERROR_NOTIFY_EMAIL$` |
| `library` | Same header, plus `Public Const LIB_VERSION` injected after `Option Declare` |
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

## 6. Template Sources (single source of truth)

**Primary — the template shipped in the plugin.** `src/slices/scaffold/template.lss`
is versioned with the code, so `pi update` delivers template improvements
together with the release. Edit it in the plugin repo and push; never edit it in
the installed checkout, which is a git working tree that `pi update` reconciles.
Placeholders filled: `<nazev-souboru>.lss`, `<Stručný popis>`, `<Jméno>`,
`<YYYY-MM-DD>` (all occurrences). `agent` and `library` scaffold from it;
`library` additionally gets `Public Const LIB_VERSION` after `Option Declare`.

**Fallback — built-in skeletons.** If the shipped `template.lss` cannot be read,
`templates.ts` supplies `agentTemplate`, `libraryTemplate`, `procedureTemplate`,
`modularFolderTemplate`. Alias derivation and the Designer registration
notice live in `naming.ts` (`suggestAlias`, `buildDesignerNotice`).

`procedure` and `modular` always use the built-ins: their synthetic
`@script-member-of` headers are part of the compiler's import contract and must
not carry a file-level header.

Pass `date: "YYYY-MM-DD"` to make a scaffold byte-reproducible; omit it for
today. Change any of this in code, never by patching generated output in skill
docs, otherwise scaffolds and docs drift apart.

---

## 7. Naming Convention (alias derivation)

The scaffold suggests the alias automatically per
`references/naming-conventions.md`:

1. Display name → ASCII (diacritics stripped), camelCase split, lowercase
2. Non-alphanumeric → `_`, collapse repeats
3. Segments capped (6 chars each, variant tokens like `save`/`mail`/`ifx` kept whole)
4. Type prefix prepended (`ag_` for agents/modular, `lib_` for libraries)
5. Total length cap 40 chars

The result is returned as `alias` in the tool `details` and rendered in the
Designer registration notice. The user may adjust the alias — it must keep
the `<prefix>_<segments>` shape and be synced into the file header and
Designer.