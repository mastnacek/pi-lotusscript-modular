# LotusScript Gotchas — Index (59 entries)

Always scan this list before writing LotusScript in an affected area. Full
bodies with WRONG/CORRECT code pairs live in the plugin catalogue
(`src/slices/gotchas/gotchas.md`, 59 entries) — query at runtime with:

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
| 6 | Writing `v = Empty` | `EMPTY` has no literal at all — it is a Variant's initial state; use `IsEmpty` |
| 7 | Reading `doc.Created` / `LastModified` / `LastAccessed` | Returns Variant DATE, NOT NotesDateTime — assign to a Variant, then `Format$` |
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
| 19 | `String(count, charCode)` outside ASCII | Unicode code → `Illegal function call` (Error 5); use `UString(count, code)` — `String$(n, UChr(x))` is still wrong |
| 20 | Reading `NotesDateTime.GMTTime/LocalTime` | Returns STRING; `LSGMTTime/LSLocalTime` return Variant DATE |
| 21 | `Format$(date, ...)` | Locale-dependent — dates may render per server/user locale |
| 22 | `CLng(timestamp ms since 1970)` | Overflow (Error 6) — LotusScript Long is 32-bit; use Double or scale down |
| 23 | Agent `Use "DominoApiLib"` | `Variable not declared` on all DApi_ functions — Use belongs in (Options), check library scope |
| 24 | Changing `Form` from Memo | Duplicates zombie mail-routing fields — remove `MailOptions`, `DefaultMailSaveOptions`, `SaveOptions` |
| 25 | `Chr(&H010D)` for Unicode | Illegal function call — use `UChr` for >255 codepoints |
| 26 | PowerShell 5.1 PKCS#7/CMS signing | `SignedCms` requires `Add-Type -AssemblyName System.Security` |
| 27 | PowerShell 5.1 vs 7 mixed stdout | Encoding differs (UTF-16 vs UTF-8) — pin executable + `[Console]::OutputEncoding` |
| 28 | PowerShell `switch` + `continue` | `continue` does not stop fall-through without `break` |
| 29 | PowerShell `ConvertFrom-Json` on ISO 8601 | Auto-parses into DateTime — use `-AsHashtable`/raw parse when string needed |
| 30 | Domino 9.0.1 FP4 Linux `REQUEST_CONTENT` | Encodes via LMBCS, not UTF-8 — convert explicitly |
| 31 | Straight quote `"` inside Formula in DXL | Terminates the string — use `@Char(34)` or brace-delimited `{...}` text |
| 32 | Formula listing days + "compute once" | Input translation with compute-once flag freezes stale list |
| 33 | `Trim`/`Trim$` expecting all whitespace | Strips SPACES only — use the built-in `FullTrim` for tabs/CR/LF |
| 34 | `If ch >= " "` to filter control chars | Unreliable collation — compare `Asc(ch)` against explicit ranges |
| 35 | `NotesDXLExporter.Export(doc)` with big attachments | Hangs serialising base64 — set `OmitRichtextAttachments` / `OmitMiscFileObjects`; `OmitItemNames` is an **array**, not a scalar |
| 36 | `MB_*` / `PICKLIST_*` constants | Not built-in — add `%Include "lsconst.lss"` or compile fails |
| 37 | `Const LSI_THREAD_*` in Designer | Designer auto-includes them → `Name previously declared` |
| 38 | `Option ...` in (Declarations) | Compile error — Option statements belong in (Options) |
| 39 | `ComputeWithForm` on existing docs | Recalculates ALL computed form fields — may overwrite data |
| 40 | Changing "owner" field for permissions | Insufficient when ACL/roles key on other fields — check all auth fields |
| 41 | Comment `' Účel:` above procedure declaration | Moves into `01_declarations.lss` on decompile — put the comment **inside the procedure body** |
| 42 | Comment above declarations | Gets moved into `01_declarations.lss` on decompile |
| 43 | Writing `If x Is Nothing Or x.Count = 0` | `And`/`Or` do **not** short-circuit — both operands always evaluate (error 91); split into branches |
| 44 | Passing a `List` to a Sub/Function | `Unexpected: List; Expected: Data type` — make work maps globals in (Declarations) |
| 45 | Testing `GetAllDocumentsByKey` result with `Is Nothing` | No match returns an **empty collection**, never `Nothing` — test `Count = 0` |
| 46 | Deleting documents while iterating a view | Can infinite-loop or corrupt the index — collect first, delete in a second pass |
| 47 | Boolean parameter in a generic procedure | LotusScript silently coerces (`"0"` false, `"Neco"` true) — `TypeName` guard for a default |
| 48 | Recursive `QuickSort` on big collections | "out of stack space" — fall back to `BubbleSort` on that error |
| 49 | `coll.GetNthDocument(i)` inside a loop | O(n²) — walk with `GetFirstDocument`/`GetNextDocument` instead (Guirard 7.1) |
| 50 | `db.GetView(...)` inside a document loop | GetView is expensive — hoist it out, call once per loop (Guirard 7) |
| 51 | `doc.Save` on every processed document | Save only changed docs — churn reindexes views and replicators (Guirard 7.8) |
| 52 | Choosing how to locate documents | Sorted view read is fastest; FTSearch needs full-text index; `db.Search` scans everything (Guirard 7.9) |
| 53 | `rng.DocLink` / `nav.TextRange` | Invalid — NotesRichTextRange has no DocLink, navigator has no TextRange; use `nav.GetElement` |
| 54 | `view.UNID` | NotesView property is `UniversalID`; UNID exists only on doclinks (`DocUNID`/`ViewUNID`) |
| 55 | Building a view doclink via doc + patch | `AppendDocLink` accepts a NotesView directly — one call, no navigator patching |
| 56 | `Call Messagebox(...)` | MessageBox is statement **and** function — statement form without Call/parens; Call form does not compile |
| 57 | `db.Open ""` one-liner | Open takes both args — `Call db.Open("", "")`; multi-arg calls don't fit one-line `If … Then` |
| 58 | `server$ As String` declaration | Type suffix + `As` datatype is illegal — use one or the other |
| 59 | `aDoc(i) = doc` object into array | SET required on class instance assignment — store NoteID strings, `db.GetDocumentByID` |

## Recording NEW gotchas (strict protocol)

When you hit a compile/runtime error or pitfall not covered by this index:

1. Search first: `lotusscript_gotchas(action: "search", query: "<error text>")`.
2. If genuinely new, draft title (trigger-phrased) + body (WRONG/CORRECT pair
   + one-line rule) and call `lotusscript_gotchas(action: "add", title, body)`.
3. The user approves via interactive modal — never write gotchas without
   approval, never retry after rejection.