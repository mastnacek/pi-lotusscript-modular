# audit slice

Answers the bigger version of the `drift` question: **which of these agents
should share a script library?** `drift` watches one edited file; `audit`
measures the whole mirror folder.

```
📚 Audit knihoven: .../01_scripts
   42 souborů · 471 procedur · 2 knihoven v adresáři

| Procedura      | Řádků | Souborů | Ušetří |
| VebaDataPole   | 45    | 11      | 450    |
| VolejApi       | 39    | 7       | 234    |
```

## Files

| File | Role |
|---|---|
| `index.ts` | `extractProcedures`, `findDuplicates`, `auditProject`, `renderAudit` (cs/en), `auditForCommand` |
| `../commands/ls-audit.ts` | `/ls audit [dir]`, default `01_scripts` |

## How it decides

1. Every `*.lss` in the folder (backups `*.bak-*` skipped) is split into
   procedures by `Sub`/`Function` … `End Sub`/`End Function`.
2. The body is **normalised**: comment tails and all whitespace removed. Two
   copies that differ only in comments or formatting therefore collide — which
   is what makes the report useful.
3. Bodies shorter than **8 lines** are ignored: a three-line wrapper is not
   library material.
4. A normalised body present in **≥2 different files** is a candidate. Twice in
   one file is an overload, not drift.
5. Ranked by `saved = lines × (files − 1)`, capped at 10 rows.

## What it deliberately does not do

- **No construct detection.** HTTP COM objects, endpoint literals and local
  error reports are the `drift` slice's job, on every edit. Keeping the two
  apart means this report stays about *size and duplication*, not policy.
- **No rewriting.** It proposes; `libraries-and-versioning.md` §1 and §5 hold
  the promotion rule and the migration steps, and `lotusscript_scaffold`
  creates the library.
- **No cross-folder scan.** One folder per call, because an ODP export has one
  design mirror per database and mixing databases would compare unrelated code.

## Next increment

A model-callable `lotusscript_library_audit` tool (the command is user-invoked
only), with `--plan` output: proposed interface, scaffold command, and the
per-element `Use` migration checklist.
