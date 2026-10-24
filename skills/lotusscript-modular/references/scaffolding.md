# Scaffolding Reference (Compliant Code Generation)

How to generate new LotusScript artifacts with the plugin so they pass the
Definition of Done from the first check.

---

## 1. When to Scaffold

- **`New agent / script`** → `type: "agent"` — standalone whole `.lss` with
  header, `Option Public/Declare`, error handler, `Initialize`.
- **New shared library** → `type: "library"` — Script Library skeleton (whole
  `.lss`) with version constant and sample public function.

Those are the only two types: a new procedure is an anchored edit inside the
existing whole `.lss`, and every script stays one file — a modular folder is
never created.

Never hand-write these skeletons when the scaffold tool exists — hand-written
headers drift from the conventions (missing `' Účel:`, wrong header order).

---

## 2. Slash Command

```
/ls scaffold agent <Název> [cílová-složka]
/ls scaffold library <Název> [cílová-složka]
```

The command creates the skeleton with default headers (author "AI Developer").
For parameterized generation use the tool.

---

## 3. Tool: `lotusscript_scaffold`

| Parameter | Required | Notes |
| --- | --- | --- |
| `type` | ✅ | `"agent" \| "library"` (StringEnum) |
| `name` | ✅ | Artifact name |
| `targetDir` | — | Defaults to CWD |
| `purpose` | — | Fills the header `ÚČEL:` and the `' Účel:` marker |
| `author` | — | Header `AUTOR` (default "AI Developer") |
| `date` | — | Pin `YYYY-MM-DD` for a byte-reproducible scaffold |

Failure modes (returned as errors): target file already exists, empty name.
The tool never overwrites existing code.

---

## 4. What Each Skeleton Guarantees

| Skeleton | Guarantee |
| --- | --- |
| `agent` | Rendered from the plugin's `src/slices/scaffold/template.lss`: `Option Public` + `Option Declare`, NÁZEV/ÚČEL/AUTOR/VYTVOŘENO/ZÁVISLOSTI header, `VERZE` + `CHANGELOG`, `On Error GoTo` handler with `Exit Sub`, `SendErrorEmail` notifier driven by `ERROR_NOTIFY_EMAIL$` |
| `library` | Same header, plus `Public Const LIB_VERSION` injected after `Option Declare` |

---

## 5. After Scaffolding (Definition of Done chain)

1. Fill the implementation inside the marked sections — a `' Účel: ...` comment
   above each declaration is the house style (not linted).
2. Declare globals/types in the file's declarations section, never inside
   procedure bodies (gotcha #38 for Option placement).
3. Check the whole file: `lotusscript_check(path)` or `/ls check <file.lss>`.
4. Verify the scorecard reaches the DoD (LSP clean, KB consulted).
5. On any compile error: search `lotusscript_gotchas` with the error text
   before changing code.

---

## 6. Template Sources (single source of truth)

The template sources, the fallback skeletons and the byte-reproducible `date`
rule are documented in `plugin-internals.md` (section "Template Sources").

---

## 7. Naming Convention (alias derivation)

The scaffold suggests the alias automatically per
`naming-conventions.md`:

1. Display name → ASCII (diacritics stripped), camelCase split, lowercase
2. Non-alphanumeric → `_`, collapse repeats
3. Segments capped (6 chars each, variant tokens like `save`/`mail`/`ifx` kept whole)
4. Type prefix prepended (`ag_` for agents, `lib_` for libraries)
5. Total length cap 40 chars

The result is returned as `alias` in the tool `details` and rendered in the
Designer registration notice. The user may adjust the alias — it must keep
the `<prefix>_<segments>` shape and be synced into the file header and
Designer.
