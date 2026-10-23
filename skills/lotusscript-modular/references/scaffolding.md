# Scaffolding Reference (Compliant Code Generation)

How to generate new LotusScript artifacts with the plugin so they pass the
linter and the Definition of Done from the first check.

---

## 1. When to Scaffold

- **`New agent / script`** → `type: "agent"` — standalone whole `.lss` with
  header, `Option Public/Declare`, error handler, `Initialize`.
- **New shared library** → `type: "library"` — Script Library skeleton (whole
  `.lss`) with version constant and sample public function.

Those are the only two types. `procedure` and `modular` were retired with the
modular workflow (2026-11): a new procedure is an anchored edit inside the
existing whole `.lss`, and a modular folder must never be created.

Never hand-write these skeletons when the scaffold tool exists — hand-written
headers drift from the linter contract (missing `%Include "lsconst.lss"`,
missing `' Účel:`, wrong header order).

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

1. Fill the implementation inside the marked sections — every procedure needs
   a `' Účel: ...` comment above its declaration (there is no line-length rule:
   the compiler reports a genuinely oversized procedure itself).
2. Declare globals/types in the file's declarations section, never inside
   procedure bodies (gotcha #38 for Option placement).
3. Check the whole file: `lotusscript_check(path)` or `/ls compile <file.lss>`.
4. Verify the scorecard reaches the DoD (LSP clean, comments present, KB
   consulted).
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
`templates.ts` supplies `agentTemplate` and `libraryTemplate`. Alias derivation
and the Designer registration notice live in `naming.ts` (`suggestAlias`,
`buildDesignerNotice`).

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
4. Type prefix prepended (`ag_` for agents, `lib_` for libraries)
5. Total length cap 40 chars

The result is returned as `alias` in the tool `details` and rendered in the
Designer registration notice. The user may adjust the alias — it must keep
the `<prefix>_<segments>` shape and be synced into the file header and
Designer.
