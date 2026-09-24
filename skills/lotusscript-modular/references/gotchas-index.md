# LotusScript Gotchas — Index (42 entries)

Always scan this list before writing LotusScript in an affected area. Full
bodies with ŠPATNĚ/SPRÁVNĚ code pairs live in the plugin catalogue
(`src/slices/gotchas/gotchas.md`, 42 entries) — query at runtime with:

```
lotusscript_gotchas(action: "search", query: "<keyword>")
/ls gotchas <dotaz>
```

On **any compile/runtime error**: search the gotcha base with the exact error
text (`lotusscript_gotchas(action: "search", query: "<error text>")`) and read
every hit before fixing.

| # | Trigger / when it bites | Rule (one-liner) |
| --- | --- | --- |
| 1 | Using `Shell`, `Dir`, `StrRight`… as identifier | Built-ins are reserved — rename your var/function (`Unexpected: Identifier`) |
| 2 | Writing `ForAll x In …` after `Dim x` | ForAll alias self-declares — never Dim it |
| 3 | `Const X As Integer = 5` | Const has no `As Type` — use suffix `%` `$` `&` |
| 4 | Adding `Option Public/Declare` to agent/form event | Check (Globals)(Options) first — duplicate Option = compile error |
| 5 | Opening DB you may lack access to | `New NotesDatabase` + `IsOpen` = no error handler; `dbDir.Get*Database` needs handler; ACL err 4005/4060 |
| 6 | `folderRefs = Empty` under Option Declare | Variant is Empty after Dim — assigning Empty = compile error |
| 7 | Reading `doc.Created` / `LastModified` / `LastAccessed` | Returns Variant DATE, NOT NotesDateTime — wrap with `New NotesDateTime(dt)` |
| 8 | Re-declaring built-in constants (`TRUE`, `PI`, …) | Built-in constants exist — do not re-declare |
| 9 | Workflow app date fields | Date fields MUST include time — date-only fields break sorting/workflow |
| 10 | Writing `CDate(...)` | Does not exist — use `CDat` |
| 11 | Treating `Split()` result as `String()` | Returns Variant — `Illegal reference to array` on typed arrays |
| 12 | ForAll over `EmbeddedObjects` expecting array | Returns EMPTY variant, not empty array — ForAll crashes; guard with `IsEmpty` |
| 13 | `GetFirstItem("Body")` then `AppendRTItem` | RichText vs TEXT item mismatch → Type mismatch; check item type first |
| 14 | Removing embedded object during ForAll | Iteration skips objects — collect first, delete after loop |
| 15 | Using item references after `CopyAllItems` | CopyAllItems invalidates existing item references — re-fetch items |
| 16 | `Evaluate(|@Contains(...)|)` with user input | Formula injection via quotes/special chars — sanitize or use pure LotusScript `InStr` |
| 17 | Agent mailing errors with `$AssistMail` field | Agent processes its own error email → infinite loop; use a marker field to skip |
| 18 | `ExtractFile` on every `EmbeddedObject` | Check `o.Type = EMBED_ATTACHMENT` first — OLE objects throw |
| 19 | `String(count, charCode)` outside ASCII | Unicode code → `Illegal function call` (Error 5); use `String$(count, UChr(...))` |
| 20 | Reading `NotesDateTime.GMTTime/LocalTime` | Returns STRING; `LSGMTTime/LSLocalTime` return Variant DATE |
| 21 | `Format$(date, ...)` | Locale-dependent — dates may render per server/user locale |
| 22 | `CLng(timestamp ms since 1970)` | Overflow (Error 6) — LotusScript Long is 32-bit; use Double or scale down |
| 23 | Agent `Use "DominoApiLib"` | `Variable not declared` on all DApi_ functions — Use belongs in (Options), check library scope |
| 24 | Changing `Form` from Memo | Duplicates zombie mail-routing fields (`$AssistMail`, `PostedDate`…) — strip routing fields on form change |
| 25 | `Chr(&H010D)` for Unicode | Illegal function call — use `UChr` for >255 codepoints |
| 26 | PowerShell 5.1 PKCS#7/CMS signing | `SignedCms` requires `Add-Type -AssemblyName System.Security` |
| 27 | PowerShell 5.1 vs 7 mixed stdout | Encoding differs (UTF-16 vs UTF-8) — pin executable + `[Console]::OutputEncoding` |
| 28 | PowerShell `switch` + `continue` | `continue` does not stop fall-through without `break` |
| 29 | PowerShell `ConvertFrom-Json` on ISO 8601 | Auto-parses into DateTime — use `-AsHashtable`/raw parse when string needed |
| 30 | Domino 9.0.1 FP4 Linux `REQUEST_CONTENT` | Encodes via LMBCS, not UTF-8 — convert explicitly |
| 31 | Straight quote `"` inside Formula in DXL | Terminates the string — escape or use `&quot;` / alternate delimiters |
| 32 | Formula listing days + "compute once" | Input translation with compute-once flag freezes stale list |
| 33 | `Trim`/`Trim$` expecting all whitespace | Strips SPACES only — handle tab/CR/LF explicitly |
| 34 | `If ch >= " "` to filter control chars | Unreliable collation — compare `Asc(ch)` against explicit ranges |
| 35 | `NotesDXLExporter.Export(doc)` with big attachments | Hangs — serializes base64; extract attachments separately first |
| 36 | `MB_*` / `PICKLIST_*` constants | Not built-in — add `%Include "lsconst.lss"` or compile fails |
| 37 | `Const LSI_THREAD_*` in Designer | Designer auto-includes them → `Name previously declared` |
| 38 | `Option ...` in (Declarations) | Compile error — Option statements belong in (Options) |
| 39 | `ComputeWithForm` on existing docs | Recalculates ALL computed form fields — may overwrite data |
| 40 | Changing "owner" field for permissions | Insufficient when ACL/roles key on other fields — check all auth fields |
| 41 | Comment `' Účel:` above procedure declaration | May vanish during recompile/decompile — keep it in the synthetic header block or inside procedure |
| 42 | Comment above declarations | Gets moved into `01_declarations.lss` on decompile |

## Recording NEW gotchas (strict protocol)

When you hit a compile/runtime error or pitfall not covered by this index:

1. Search first: `lotusscript_gotchas(action: "search", query: "<error text>")`.
2. If genuinely new, draft title (trigger-phrased) + body (ŠPATNĚ/SPRÁVNĚ pair
   + one-line rule) and call `lotusscript_gotchas(action: "add", title, body)`.
3. The user approves via interactive modal — never write gotchas without
   approval, never retry after rejection.