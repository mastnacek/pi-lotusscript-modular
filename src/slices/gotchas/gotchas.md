# LotusScript Gotchas

Trap catalogue for IBM Notes/Domino 9.0.1 development.

---

## MANDATORY: always query the knowledge base before writing or changing LotusScript

**Do not answer from memory or from this file alone.** Before writing, reviewing
or refactoring any LotusScript, make **at least one** `kb_search` call against
the `lotus-notes` collection. This registry is a starting point, not the
authority — the KB holds 9 110 source documents and several of the traps below
were only fixed here *after* being checked against it.

```
mcp__knowledge_base -> tool: kb_search
  { "collection": "lotus-notes", "query": "<API, statement or error message>" }
```

### What is in the `lotus-notes` collection

| Layer | Files | What it is |
|---|---|---|
| `com.ibm.designer.domino.main.doc_*` | 8 243 | IBM API reference (classes, statements, compile errors) |
| `ln/designer/kapitola-01..13-*.html` | 13 | **IBM white paper "Performance basics for IBM Lotus Notes developers"** (Andre Guirard, IBM, May 2008) — the best-practices book |
| `<Title>_<UNID>.html` | 867 | **Community articles** scraped from Breaking Par "Tips & Tricks" and the OpenNTF wiki |

The two non-IBM layers are the reason for this rule: they contain material that
is **not** in the API reference and **not** in this file. A KB search is also the
only way to confirm a *negative* claim (a function that does not exist, an error
message's exact wording).

### Search recipes that pay off

| Question | Query |
|---|---|
| Any class/property/method | `GetAllDocumentsByKey return value empty collection` |
| A compile error the Designer reported | `Unexpected identifier compile-time error` (search the **exact** message text) |
| Language behaviour | `LotusScript And Or evaluation operands` |
| Performance / design | `Performance basics developers LotusScript performance best practices` |
| "Does X exist?" | search the bare name; an empty result is meaningful evidence |
| Community tips | search the concept, then read `ln/designer/<Title>_<UNID>.html` |

**Reading scraped articles:** each one opens with a ~4 000-character navigation
sidebar. `kb_read_source` truncates from the start and will return only the nav —
extract the body from the file on disk instead:

```
C:\Users\jaroslav\.claude\mcp\knowledge-base\references\ln\designer\<Title>_<UNID>.html
```

### The book, in one page — then verify with the KB

*Performance basics* (Guirard 2008). Its governing principle: *"scripts spend far
more time opening documents and views than manipulating variable values"* — an
unnecessary array reference saves a microsecond, an unnecessary view open costs
seconds. Optimise the big items first; the author explicitly dismisses micro-
optimisation of loops (`for` vs `while`, globals vs locals).

| Ch. | Topic | One-line takeaway |
|---|---|---|
| 2 | General principles | Every non-richtext field is a summary field: hundreds of fields index up to ~30 % slower **even if unused in views**. Don't split 1:N into separate documents — Notes is not relational. Deletion stubs linger 90–120 days, so never "delete all + recreate" nightly. |
| 3 | Database | Turn off what you don't need: unread marks, "Accessed (In this file)", specialised response hierarchy. Transaction logging — measure both ways. Put `Form = "…"` **first** in selection formulas (Document Table Map). NSFDB2 is usually *slower* than plain NSF. |
| 4 | Formula | `@Contains` is not an exact-match test — use `=`, `*=` or `@IsMember`. `@Unique` is O(n²). `@DbLookup` cache modes: default `Cache`, `NoCache` (overused by developers), `ReCache` (forgotten, refreshes the cache). Never look up duplicates and de-duplicate afterwards — read a categorized column. |
| 5 | Forms | Never have a Computed field that merely redisplays another field (stores two copies). `@DbColumn + 1` for sequential numbering is O(n) and not unique across users/replicas — use `@Unique`. |
| 6 | Views | `@Today`/`@Now` in selection or column formulas invalidates the view index on every open → full database scan. The common `@TextToTime("Today")` workaround is fast **but wrong**. Server-private views cost the Update task even though Designer can't show them. Multiple categorisation ≈ double the work per document. Ascending and descending are two separate re-sorts. |
| 7 | Code | Don't iterate with `GetNthDocument` — use `GetFirstDocument`/`GetNextDocument`. Hoist `GetView` out of loops. Set `view.AutoUpdate = False` for lookup views. Use collection `*All` methods. Don't `Save` unchanged documents (churn + replication conflicts). `ComputeWithForm` is slow. Action code belongs in agents (`@Command([RunAgent])`). Loading script libraries is superlinear. `Delete` no longer buys memory since 6.0. |
| 8–9 | Testing | Test on volume, never against a production replica. Use Profile documents for configuration. |

Full text: `ln/designer/kapitola-02..09-*.html`.

### Provenance of the entries below

`[KB]` — verified against the `lotus-notes` collection; the citation is inline.
No marker — observed on this server but not described by IBM (PowerShell, the
pi-lotusscript-modular toolchain, LMBCS on Linux, string collation). For those,
experience is the source, not the KB.

---

## Logical operators `And` / `Or` do NOT short-circuit  `[KB]`

Both operands are **always** evaluated. These are not C's/Java's `&&`/`||` — no
waiting for the first operand's result:

```lotusscript
' WRONG - when x Is Nothing, x.Count is still evaluated and throws error 91
If x Is Nothing Or x.Count = 0 Then ...

' WRONG - same trap with the condition inverted
If doc.HasItem("X") And doc.GetItemValue("X") <> "" Then ...

' CORRECT - split into branches; the unsafe part never runs
If x Is Nothing Then
   bEmpty = True
Else
   bEmpty = (x.Count = 0)
End If

' CORRECT - or evaluate the condition into a variable first
vCount = ""
If Not x Is Nothing Then vCount = x.Count
If vCount = 0 Then ...
```

IBM states it verbatim in *Performance basics* (ch. 6.6): *"in macro language
(and in LotusScript), logical operators don't work that way. Both parts of the
expression are always evaluated."* They even recommend writing "lazy logic" with
`@If(...)` in views despite it being slower, because skipping an expensive
function wins on net.

The Language Reference (`Logical Operators`) describes `And`/`Or` only as bit
operations over both operands — short-circuiting is never mentioned, which is
precisely why developers coming from other languages trip over it.

---

## `GetAllDocumentsByKey` returns an empty collection on no match — never `Nothing`

Per IBM docs: *"If no documents match, the collection is empty and the count is
zero."* Testing `Is Nothing` is therefore dead code, and every user gets the
wrong branch:

```lotusscript
' WRONG - second branch always runs
If dc Is Nothing Then
   MsgBox "Role: WORKER"
Else
   MsgBox "Role: SUPERVISOR - " & dc.Count
End If

' WRONG - And/Or does not short-circuit, see the entry above
If dc Is Nothing Or dc.Count = 0 Then ...

' CORRECT - two branches, the second is never reached when Nothing
If dc Is Nothing Then
   bEmpty = True
Else
   bEmpty = (dc.Count = 0)
End If
```

`Nothing` comes back only for an invalid view or an empty key — not when the
category simply doesn't exist. A further trap: `GetAllDocumentsByKey` finds
nothing if a single column mixes categories and subcategories (`\`), and a
partial match can silently miss documents across multiple keys.

---

## `List` cannot be used as a Sub/Function parameter data type

```
Function HtmlBlock(sJmeno As String, chybiMat As List, okruhy As List)
'                                                       ^^^^^^^^^^^^^^^^^^
' LSP/Notes: Unexpected: List; Expected: Data type
```

The `Sub statement` / `Declare statement` reference pages show the syntax
`[ ( ) | List ]`, but that describes `Declare` in a script library. The Notes
compiler rejects it in a procedure **definition**, and no KB page claims a list
can be passed to a procedure.

Workarounds, in order of preference:

1. Declare work maps as **globals in (Declarations)** (like `g_status`) and let
   helpers read them directly; `Erase` before each use.
2. Convert the list to arrays (`Dim keys() As String`) and pass arrays — arrays
   are fine, just don't declare them `ByVal` and don't parenthesise them in the
   call.

---

## ForAll — do NOT declare the alias variable

```
FORALL alias variable was previously declared: m
```

IBM's error text (`doc_H_STR_ITERPREVDECL`): *"You may not have a Dim statement
for the reference variable of a Forall statement. Either delete the Dim
statement for x, or use a different name in the Forall."*

```lotusscript
Dim m As Variant          ' WRONG
ForAll m In myList        ' error!
End ForAll

ForAll m In myList        ' CORRECT - the ForAll declares the alias
   sMat = ListTag(m)
End ForAll
```

Same family of errors:

- `Illegal reference to FORALL alias variable` — the alias was read **outside**
  the loop.
- `FORALL alias variable already in use` — concurrent (nested) ForAll loops
  sharing one alias.
- `FORALL alias variable is not of same data type` — the alias was reused for a
  different type.

Related, and equally invisible to the LSP: with `Option Declare`, forgetting
`Dim x() As Type` on an array produces *Variable not declared* at **every** use
site. After a refactor, check by hand: (1) no `Dim` on ForAll aliases, (2) every
array has its `Dim` in the same procedure that uses it.

---

## `Const` — syntax has no `As dataType`

```lotusscript
' WRONG:
Const X As Integer = 5

' CORRECT:
Const X% = 5      ' % = Integer
Const S$ = "text" ' $ = String
Const L& = 100    ' & = Long
```

Official syntax: `[ Public | Private ] Const constName = expr` — there is no
`As dataType` and there cannot be one. The suffix goes on `constName` (or on a
numeric literal `expr`); without it LotusScript infers the type from the value
(integer → Integer or Long by magnitude, floating point → Double), and any
suffix used later must match.

---

## `EMPTY` cannot be assigned — it is an internal value, not a constant

`EMPTY` has no literal in LotusScript: it is simply a Variant's initial state.
IBM, in *Built-in constants*: *"LotusScript also includes an internal value
named EMPTY. This is the initial value of a Variant variable. … To test a
variable for the EMPTY value, use the IsEmpty function. **You cannot assign
EMPTY as a value.**"*

So this fails regardless of `Option Declare`:

```lotusscript
' WRONG
Dim v As Variant
v = Empty

' CORRECT - Dim is enough, the variable starts out EMPTY
Dim v As Variant
If IsEmpty(v) Then Print "empty"
```

Contrast with `NULL`, which **can** be assigned — but only to a Variant that
does not hold an object reference.

---

## `doc.Created` / `LastModified` / `LastAccessed` return Variant, not NotesDateTime

```lotusscript
' WRONG: Type mismatch
Function FormatDT(dt As NotesDateTime) As String
Print FormatDT(doc.Created)

' CORRECT - Variant of subtype Date
Dim d As Variant
d = doc.Created
If Not IsEmpty(d) Then
   Print Format$(d, "yyyy-mm-dd") & "T" & Format$(d, "hh:nn:ss")
End If
```

This is IBM's own pattern — in *Examples: Created property (NotesDocument)* the
value goes into `Dim createDate As Variant` before `Messagebox`. Same for
`NotesDatabase.Created`.

Note: `NotesItem.DateTimeValue` genuinely returns a `NotesDateTime` object; only
the document/database properties behave this way.

---

## `NotesDateTime`: `GMTTime`/`LocalTime` are String, `LSGMTTime`/`LSLocalTime` are Variant Date

| Property | Returns | Use for |
|---|---|---|
| `GMTTime` | **String** (`"04/23/2026 07:19:01 GMT"`) | display only |
| `LocalTime` | **String** (`"04/23/2026 09:19:01 CEDT"`) | display only |
| `LSGMTTime` | **Variant (Date)** | arithmetic/comparison in UTC |
| `LSLocalTime` | **Variant (Date)** | arithmetic/comparison in local time |

IBM describes `LSGMTTime` as converting a `NotesDateTime` "to a LotusScript
variant of type DATE".

---

## `String(count, charCode)` is ANSI-only — use `UString` for Unicode

`String()` takes single-byte codes; a Unicode codepoint (e.g. `9644` = U+25AC)
raises **Error 5: Illegal function call**. The documented Unicode-capable
function is `UString`, which accepts a Unicode code **0–65535** or the first
character of a string:

```lotusscript
' WRONG - ANSI path, out of range throws Error 5
sep = String(40, 9644)
' STILL WRONG - String() only reads the first character, UChr doesn't help
sep = String(40, UChr(&H2500))

' CORRECT - ANSI character
sep = String(40, "-")
' CORRECT - Unicode via UString (code or character)
sep = UString(40, &H2500)
sep = UString(40, UChr(&H2500))
```

---

## `Chr` vs `UChr` — Unicode characters

`Chr(n)` accepts only 0–255 (ANSI). For codepoints above `&H00FF` use `UChr`,
which returns the Unicode character for a code (`UChr` → Variant of DataType 8,
`UChr$` → String). `Uni` is the inverse.

```lotusscript
' WRONG:
c = Chr(&H010D)   ' Error: Illegal function call

' CORRECT:
c = UChr(&H010D)  ' "č"
```

---

## `Split()` returns a Variant, not `String()` — "Illegal reference to array"

```lotusscript
' WRONG:
Dim keys() As String
keys = Split(keyNames, ",")   ' "Illegal reference to array"

' CORRECT:
Dim keys As Variant
keys = Split(keyNames, ",")
If IsArray(keys) Then
   Dim i As Long
   For i = LBound(keys) To UBound(keys)
      Print keys(i)
   Next
End If
```

IBM's own example (`Examples: Split function`) uses `Dim ret As Variant` and
`ret = split(teststr, delim)`.

---

## `CDate` does not exist — LotusScript uses `CDat`

`CDate` is VBA/VBScript syntax; with `Option Declare` it fails to compile.

```lotusscript
' WRONG:
d = CDate("01.01.2026")   ' "Variable not declared: CDATE"

' CORRECT:
d = CDat("01.01.2026")    ' raises an error if the string is not a date
```

`CDat` converts a numeric or string value to a date/time value.

---

## `InStrRev` does not exist — there is no reverse `InStr` in LotusScript

```lotusscript
' WRONG:
i = InStrRev(s, " ")      ' "Variable not declared: INSTRREV"
```

Scan backwards instead — e.g. to build a `"Příjmení Jméno"` key:

```lotusscript
Dim i As Integer
Dim iPos As Integer
iPos = 0
For i = Len(s) To 1 Step -1
   If Mid$(s, i, 1) = " " Then
      iPos = i
      Exit For
   End If
Next
```

Same trap family as `CDate` → `CDat`. Note that the plugin's LSP validation can
be disabled, so a compile-breaking call like this may go unreported by tooling —
the Designer compile (`Ctrl+Shift+F9`) is the authority.

---

## `Trim` / `Trim$` strips only SPACES

IBM defines `Trim` as "removes leading and trailing **spaces**". Tabs
(`Chr 9`), linefeeds (`Chr 10`) and carriage returns (`Chr 13`) are left alone,
so whitespace-only text evaluates as non-empty.

For general whitespace there is a **built-in `FullTrim`** ("eliminates
duplicate, trailing and leading whitespace", works on strings and arrays):

```lotusscript
s = FullTrim(s)   ' also collapses runs of inner whitespace
s = Trim$(s)      ' leading/trailing spaces only
```

---

## `Shell` is a built-in function — cannot be used as a variable name

Compile error: `Unexpected: shell; Expected: Identifier`. The restriction applies
to all built-ins (`Dir`, `Format`, `Mid`, `Left`, `Right`, `StrLeft`, `StrRight`,
`StrLeftBack`, `StrRightBack`, `StrToken`, `StrConv`, `StrCompare` …) and to your
own procedure names.

```lotusscript
' WRONG:
Dim shell As Variant
Set shell = CreateObject("WScript.Shell")

' CORRECT:
Dim wsh As Variant
Set wsh = CreateObject("WScript.Shell")
```

IBM also notes `Shell` "must be called from within an expression or an assignment
statement, so that its return value is used", and that on platforms other than
UNIX/AIX it does not wait for the program to finish.

---

## Built-in constants — do not re-declare

With `Option Declare`, redeclaring a Notes constant gives "Name already
declared":

```lotusscript
' WRONG:
Const EMBED_ATTACHMENT% = 1454

' CORRECT - just use it
If eObj.Type = EMBED_ATTACHMENT Then ...
```

The Language Reference lists the language built-ins as `NOTHING`, `NULL`, `PI`,
`TRUE`, `FALSE` (plus internal `EMPTY`, which is not assignable). Class-level
constants such as `EMBED_ATTACHMENT`, `EMBED_OBJECT`, `EMBED_OBJECTLINK`,
`DATABASE`, `TEMPLATE`, `REPLICA_CANDIDATE`, `TEMPLATE_CANDIDATE` come from the
Notes class reference.

---

## `MB_*` / `PICKLIST_*` need `%Include "lsconst.lss"` — they are not built-in

`MB_ICONSTOP`, `MB_ICONQUESTION`, `PICKLIST_NAMES` and friends live in
LSCONST.LSS, unlike `EMBED_ATTACHMENT` or `DATABASE`. Include them in **(Options)**:

```lotusscript
%Include "lsconst.lss"
```

Community alternative (`Overcoming the infamous {Public symbol is declared in
another module: V_EMPTY}`, OpenNTF): a shared **script library** starting with
`Option Public`, with constants declared neither `Public` nor `Private`, then
`Use "LsConst"` from every form, view and library. That gives complete reuse
without the `%Include` redeclaration collisions.

---

## `LSI_THREAD_*` are already defined — "Name previously declared"

`LSI_THREAD_PROC` and `LSI_THREAD_MODULE` (used with `GetThreadInfo`) are defined
in **LSPRVAL.LSS**, which Designer includes automatically. Declaring them
manually is a compile error.

---

## `Option ...` belongs in (Options), never in (Declarations)

`Option Declare`, `Option Public`, `Use`, `%Include` must sit in the **(Options)**
event. Placing them in **(Declarations)** fails compilation immediately.

Each `Option` may appear only once per module — if (Globals) already defines it,
do not repeat it in the agent body:

```
Error: "Option can be specified only once in a module"
```

| Location | `Option Public`/`Declare` |
|---|---|
| Standalone `.lss` | recommended |
| Agent / form / button event | check (Globals) first |

---

## Opening a database without access — skip safely

### Scenario 1: `New NotesDatabase(server, file)` constructor

The constructor attempts to open the database; on failure `IsOpen` returns
`False`. **No error handler is required** (per the `IsOpen` docs).

```lotusscript
Dim db As New NotesDatabase("server/ORG", "mail\user.nsf")
If db.IsOpen Then
   ' process documents
Else
   ' ACL denied, file missing, ...
End If
```

### Scenario 2: `NotesDbDirectory` iteration

`GetFirstDatabase` / `GetNextDatabase` do **not** open the database, but you
still don't need `Open()` — instantiate a new object via the constructor:

```lotusscript
Set currentDb = dbDir.GetFirstDatabase(DATABASE)
While Not (currentDb Is Nothing)
   Dim tempDb As New NotesDatabase(server, currentDb.FilePath)
   If tempDb.IsOpen Then
      ' work with tempDb
   End If
   Set currentDb = dbDir.GetNextDatabase
Wend
```

If you must call `Open()`, use `On Error Resume Next` and **always restore
handling** — otherwise every later error is silently swallowed:

```lotusscript
On Error Resume Next
Call db.Open("", "")
If Err = 0 Then
   ' OK
End If
On Error GoTo 0   ' IMPORTANT
```

| How the DB is obtained | Opens automatically? | Error handler needed? |
|---|---|---|
| `New NotesDatabase(srv, file)` | Yes (constructor) | No — `IsOpen` suffices |
| `dbDir.GetFirstDatabase` | No | Required only if you call `Open()` |
| `db.OpenByReplicaID(srv, rid)` | Yes | No — `IsOpen` suffices |

Typical error codes: ACL denied 4005 / 4060, database missing 4005, corrupt 4000.

---

## Deleting documents during view iteration → infinite loop or corrupted index

Deleting as you walk a view and then re-reading the "first document" to refresh
the iterator can loop forever or fail: Domino does not necessarily update the
view index instantly, so the next call hands you **the document you just
deleted**, and removing it again breaks the agent. Heavy index churn can also
corrupt the index. Collect first, delete afterwards:

```lotusscript
' WRONG - relies on instant index update
Do While Not (doc Is Nothing)
   Call doc.Remove
   Set doc = view.GetFirstDocument
Loop

' CORRECT - collect, then delete in a second pass
```

The same class of trap applies to `ForAll` over embedded objects: removing during
iteration skips elements. Store names first, then remove.

---

## Boolean parameters are silently coerced

LotusScript accepts almost anything in a `Boolean` parameter without complaint:
`"0"` is falsy, `"Neco"` is truthy. For generic procedures, take a default when
the incoming value isn't a Boolean:

```lotusscript
Sub DoThing(ByVal bJeVedouci As Boolean)
   If TypeName(bJeVedouci) <> "BOOLEAN" Then bJeVedouci = False
```

---

## Memory footprint: `Byte` vs `Integer` vs `Boolean`

`Byte` is 0–255 and takes **1 byte**; `Integer` is −32 768…32 767 and takes
**2 bytes**. Across arrays with thousands of elements the difference adds up.

| Type | Range | Bytes |
|---|---|---|
| `Byte` | 0 … 255 | 1 |
| `Boolean` | True/False | 1 |
| `Integer` | −32 768 … 32 767 | 2 |

Since ND6 there is also a real `Boolean` type (previously Integer/Variant was
used) and `ArrayUnique(array, comparisonMode)`.

Related: `CLng(timestampMs)` overflows immediately — millisecond epochs exceed
`Long`'s ~2.1 × 10⁹ ceiling (**Error 6**). Use `Double` for epoch arithmetic.

---

## Recursive sorts can exhaust the stack

`QuickSort` is recursive and can fail with "out of stack space" on large
collections. `BubbleSort` never does, but is slow. Run QuickSort and fall back to
BubbleSort on that error.

---

## `EmbeddedObjects` returns `EMPTY`, not an empty array

When a rich text item has no attachments, `rtitem.EmbeddedObjects` returns
`EMPTY`, and a bare `ForAll` over it fails at runtime:

```lotusscript
' WRONG - crashes when there are no attachments
ForAll o In rtitem.EmbeddedObjects
   count = count + 1
End ForAll

' CORRECT
If Not IsEmpty(rtitem.EmbeddedObjects) Then
   ForAll o In rtitem.EmbeddedObjects
      If o.Type = EMBED_ATTACHMENT Then count = count + 1
   End ForAll
End If
```

`EmbeddedObjects` returns *all* embedded items — attachments, OLE objects and
object links. Only `EMBED_ATTACHMENT` supports `Name` and `ExtractFile`, so
always check `o.Type` first.

---

## `GetFirstItem("Body")` — RICHTEXT vs TEXT → Type mismatch on `AppendRTItem`

`GetFirstItem` returns a `NotesRichTextItem` only if the stored item really is
rich text. Memos created by background agents often store `Body` as plain TEXT,
giving a generic `NotesItem`; `AppendRTItem` then throws **Type mismatch**.

```lotusscript
' WRONG if Body is plain text:
Dim body As NotesRichTextItem
Set body = doc.GetFirstItem("Body")
Call combinedRT.AppendRTItem(body)

' CORRECT
Dim item As NotesItem
Set item = doc.GetFirstItem("Body")
If Not (item Is Nothing) Then
   If item.Type = 1 Then          ' 1 = RICHTEXT
      Call combinedRT.AppendRTItem(item)
   Else                           ' 1280 = TEXT
      Call combinedRT.AppendText(item.Text)
   End If
End If
```

---

## `CopyAllItems` invalidates item references; `CopyItemToDocument` drops attachments

After `doc.CopyAllItems(targetDoc, True)` the target's items are replaced, so
references taken before the call become invalid.

**`CopyItemToDocument` on a `NotesRichTextItem` does not copy attachments** —
attachments live in separate `$FILE` items. To duplicate a document including its
attachments, use `CopyAllItems`.

---

## `ComputeWithForm` recalculates every computed field — and it is slow

`doc.ComputeWithForm(False, False)` runs all default-value, input-translation and
validation formulas across the whole form. If any of them is an `@DbLookup` into
another database, historical values on older documents can be overwritten by
current lookup results.

IBM's *Performance basics* (ch. 7.4) adds that it is "rather slow compared with
manually calculating and assigning the new field value" — in a slow agent,
replace it with a few explicit assignments.

---

## Changing "owner" is not enough when rights are computed

When document security (`Authors`, `Readers`) is computed from composite roles
(`@Unique("[admin]":Manager:Approver)`), changing an informational `Owner` field
without updating `Authors` or recalculating rights leaves the document
inaccessible to the new recipient.

---

## Changing `Form` from Memo → duplicates (zombie mail routing)

Changing `doc.Form` on an incoming memo without removing the mail-routing items
causes Notes to route the document again when the user saves, producing a
duplicate in the mail-in database:

```lotusscript
doc.Form = "CustomForm"
Call doc.RemoveItem("MailOptions")
Call doc.RemoveItem("DefaultMailSaveOptions")
Call doc.RemoveItem("SaveOptions")
```

---

## `$AssistMail` — agent processing its own error mail → infinite loop

An agent that mails on error receives that mail in the monitored database, fails
again, and loops. Mails sent by Domino agents carry `$AssistMail` (or
`SentByAgent`); always filter them:

```lotusscript
If doc.HasItem("$AssistMail") Or doc.HasItem("SentByAgent") Then Exit Sub
```

---

## `Evaluate` with user text → formula injection

Quotes or pipes in an email subject break a formula built by concatenation:

```lotusscript
' WRONG - a subject containing " or | breaks parsing
y = Evaluate(|@Contains("| & searchStr & |";"| & sourceStr & |")|)

' CORRECT - sanitise, or do the comparison in plain LotusScript
If InStr(1, sourceStr, searchStr, 5) > 0 Then ...
```

---

## `Use "SomeLibrary"` → "Variable not declared" on every function

If an agent doesn't recognise any procedure from an included script library:

1. `Use "LibraryName"` must be in **(Options)**, never inside `Sub Initialize`.
2. The library must be saved and compiled (`Ctrl+Shift+F9`).
3. The calling agent must be recompiled too.

If the error persists, the library itself may be corrupt: comment out the `Use`,
recompile, add a line to the library's (Options) to force a recompile and save.
If Designer's "Recompile all LotusScript" hangs, kill Notes, run fixup + compact
on the database, then save the library again.

---

## `NotesDXLExporter` and large attachments → hangs on base64

`NotesDXLExporter` serialises binary attachments (`$FILE` items) into base64 XML;
on documents with very large attachments this exhausts memory and takes forever.

Note that `OmitItemNames` is an **array of String**, not a scalar:

```lotusscript
' WRONG
exporter.OmitItemNames = "$FILE"

' CORRECT
exporter.OmitItemNames = Array("$FILE")
exporter.OmitRichtextAttachments = True   ' attachments inside rich text
exporter.OmitMiscFileObjects = True       ' $FILE items
exporter.OmitRichtextPictures = True
exporter.OmitOLEObjects = True
exporter.RestrictToItemNames = Array("Body")
```

`OmitItemNames` takes precedence over `RestrictToItemNames`. IBM warns that
omitting items means a later **import creates only partial copies** of the
documents.

---

## `Format$(date, mask)` is locale-dependent

LotusScript's `Format$` interprets date masks per the OS/Domino locale; on
non-English systems `"yyyy"` may not be recognised as the year. Build ISO dates
explicitly:

```lotusscript
Function IsoDate(dt As Variant) As String
   IsoDate = Right("0000" & Year(dt), 4) & "-" & _
             Right("00" & Month(dt), 2) & "-" & _
             Right("00" & Day(dt), 2)
End Function
```

---

## Workflow applications — always store date **and** time

Store the timestamp of an action (approval, dispatch, assignment) with the time
included, or audit durations are lost.

```lotusscript
' WRONG - date only, duration lost
doc.ReplaceItemValue "ApprovedDate", Date$

' CORRECT
doc.ReplaceItemValue "ApprovedDate", Now

' CORRECT alternative - portable
Dim dtNow As New NotesDateTime("")
Call dtNow.SetNow
Set doc.ReplaceItemValue("ApprovedDate", dtNow)
```

| Function | Returns |
|---|---|
| `Date$` | date only |
| `Time$` | time only |
| `Now` | date + time |
| `NotesDateTime.SetNow` | full date/time object |

---

## String comparison follows collation, not code points

Relational string operators (`>=`, `<`) use locale collation rules, so certain
control characters can compare as greater-than-space in some locales. For
binary-safe filtering use `Asc(ch) >= 32` (or `Uni(ch) >= 32`).

---

## DXL import — a bare `"` inside formula text terminates the string

In formula language `"` is the string delimiter. When hand-editing DXL, an
unescaped quote inside a formula truncates the string and breaks the import. Use
`@Char(34)` or brace-delimited `{...}` text.

---

## Formula — `@Explode` over a date range, and the input-translation trap

`@Explode([Start - End])` returns a multi-value text list of individual days in
a range. Beware that **input translation** runs on every save, whereas **default
value** formulas run only on document creation.

---

## [toolchain] A `Účel:` comment above a procedure disappears on recompile

In the pi-lotusscript-modular agent layout, a comment written **before**
`Function`/`Sub` is moved into `01_declarations.lss` during assembly and is gone
from the procedure file after the next decompile. The scorecard linter counts
comments that remain in the procedure file, so a compile→decompile cycle reports
a missing description that was actually written.

```lotusscript
' WRONG - lost from the procedure file after a recompile/decompile cycle
' Účel: Load distributed safety sheets.
Function NactiZmenyBL(ByVal apiToken As String, nacteneZmeny() As String) As Long

' CORRECT - lives in the body, survives the cycle
Function NactiZmenyBL(ByVal apiToken As String, nacteneZmeny() As String) As Long

   ' Účel: Load distributed safety sheets.
   Dim pocet As Long
```

---

## [toolchain] `' === SECTION: … ===` and `%REM … Assembled from modular source files` are generated

`compileAgent` writes two kinds of scaffolding into the assembled artifact: a
provenance header `%REM … Assembled from modular source files … %END REM`, and
`' === SECTION: <file> ===` / `' === END SECTION: <file> ===` markers.

When the artifact is also the source (`overwriteSourceLss: true`), the
decompiler strips both before parsing, and `compileAgent` strips them from each
modular file before concatenation — otherwise `01_declarations.lss` accumulates
another copy on every cycle and the artifact grows without bound.

Practical consequences:

- Section markers in `01_declarations.lss` are always a bug. Never write or copy
  them there; they belong only in the assembled artifact.
- An `' === END SECTION: … ===` without its opening marker means the file went
  through a cycle before the fix; the next compile cleans it.
- A user `%REM` documentation block is untouched — stripping only removes blocks
  containing the `Assembled from modular source files` marker.

---

## PowerShell 5.1 — `SignedCms` (PKCS#7/CMS) requires `Add-Type`

In Windows PowerShell 5.1 (.NET Framework) the assembly isn't loaded by default:

```powershell
Add-Type -AssemblyName System.Security
[System.Security.Cryptography.Pkcs.SignedCms]
```

## PowerShell 5.1 vs 7 — stdout encoding

Windows PowerShell 5.1 defaults console pipes to the OEM code page (CP852/CP1250),
which mangles UTF-8 strings:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
```

## PowerShell `switch` + `continue` doesn't stop fall-through

Inside `switch`, `continue` acts like `break` for the current condition but does
not skip outer loop iterations. Use `break` when only one case should match.

## PowerShell `ConvertFrom-Json` auto-parses ISO 8601 into `DateTime`

Strings like `"2026-04-23T09:17:17Z"` become `[DateTime]` objects and stringify
with localized formatting. Parse explicitly or use a format string if the literal
ISO form matters.

---

## Domino 9.0.1 FP4 on Linux — `REQUEST_CONTENT` is LMBCS, not UTF-8

Web agents reading `REQUEST_CONTENT` from POST bodies can decode multi-byte
characters as LMBCS. Convert at the byte level (or via a Java helper servlet)
when handling JSON payloads.

---

## ForAll vs For: no measurable difference

A community benchmark (3 000 items × 5 iterations, *Comparing Forall To For
Loops*) found **no noticeable performance difference**. Don't spend effort there
— it independently confirms the white paper's position that micro-optimisation of
loops is not where the wins are.


---

## `GetNthDocument` inside a loop is very slow — iterate with GetFirstDocument/GetNextDocument

```lotusscript
' WRONG — every call rescans the collection: O(n²)
For i = 1 To coll.Count
    Set doc = coll.GetNthDocument(i)
Next

' CORRECT — linear walk
Set doc = coll.GetFirstDocument()
Do Until doc Is Nothing
    Set nextDoc = coll.GetNextDocument(doc)
    ' process doc
    Set doc = nextDoc
Loop
```

Guirard (chap. 7.1): "Using NotesDocumentCollection.GetNthDocument to iterate
through the collection is very slow; instead, use GetFirstDocument and
GetNextDocument." NotesView has its own GetNthDocument — same advice.
Verification: KB page `kapitola-07-Code.html` (collection `lotus-notes`), section 7.1.

---

## `db.GetView` inside a document loop — hoist the call out of the loop

```lotusscript
' WRONG — 1000 documents means 1000 expensive GetView calls
Do Until docCur Is Nothing
    Set view = db.GetView("CustomersByID")
    Set docCust = view.GetDocumentByKey(docCur.CustID(0), True)
    Set docCur = coll.GetNextDocument(docCur)
Loop

' CORRECT — GetView once, look up per document
Set view = db.GetView("CustomersByID")
Do Until docCur Is Nothing
    Set docCust = view.GetDocumentByKey(docCur.CustID(0), True)
    Set docCur = coll.GetNextDocument(docCur)
Loop
```

GetView is one of the most expensive calls in the backend ("an unnecessary view
open may be more on the order of whole seconds"). The agent profiler is the
reliable way to find these.
Verification: KB page `kapitola-07-Code.html` (collection `lotus-notes`), section "GetView in a loop".

---

## Saving documents that have not changed — write-churn reindexes everything for nothing

```lotusscript
' WRONG — saves every touched document, changed or not
While Not doc Is Nothing
    ' maybe no field was actually modified
    Call doc.Save(True, False)
    Set doc = view.GetNextDocument(doc)
Wend

' CORRECT — save only when something actually changed
If changed Then Call doc.Save(True, False)
```

Every save marks the document modified: views reindex, response hierarchies
update, replicators see "churn". Guirard (chap. 7.8): avoid saving documents
that have not changed; treat "how often documents are modified" as a
first-class performance factor.
Verification: KB page `kapitola-07-Code.html` (collection `lotus-notes`), section 7.8.

---

## Locating documents — read from a sorted view when you can, search only when you must

- A **sorted view** that already contains the target set is usually the fastest
  source: `view.GetAllDocumentsByKey(key, True)` / `GetFirstDocument`+`GetNextDocument`.
- **FTSearch** is fast only with a **full-text index** on the database; without
  one it degrades and ties up the server.
- **db.Search / UnprocessedFTSearch** with a formula evaluates against every
  document — fine for scheduled maintenance, wrong inside user-facing actions.
- Building a private/sorted-on-the-fly collection per request is the slowest
  option of all.

Guirard (chap. 7.9, "Ways of searching for documents"): match the search method
to the situation before optimizing anything else.
Verification: KB page `kapitola-07-Code.html` (collection `lotus-notes`), section 7.9.


---

## NotesRichTextRange has no DocLink property; navigator has no TextRange

`Set dl = rng.DocLink` and `Set rng = nav.TextRange` are both invalid in LotusScript — the agent does not compile.

IBM docs (`NotesRichTextRange (LotusScript)`) list only these properties: **Navigator, Style, TextParagraph, TextRun, Type**. There is no `DocLink`.
`NotesRichTextNavigator (LotusScript)` exposes methods only (FindFirstElement, GetElement, GetFirstElement, …) — it has **no `TextRange` property** (in Java the same class has `getTextRange`, which is where the confusion comes from).

Correct pattern to patch an existing doclink (e.g. redirect it to a view):

```lotusscript
Set nav = rtitem.CreateNavigator
If nav.FindFirstElement(RTELEM_TYPE_DOCLINK) Then
    Set dl = nav.GetElement      ' returns NotesRichTextDocLink at current position
    dl.ViewUNID = view.UniversalID       ' ViewUNID is read-write
End If
```

Verification: KB pages `doc_H_NOTESRICHTEXTRANGE_CLASS.html` and `doc_H_NOTESRICHTEXTNAVIGATOR_CLASS.html` (collection `lotus-notes`).


---

## NotesView has no UNID property - it is UniversalID

`NotesView` has **no `UNID` property**. The documented name is `UniversalID`:

```lotusscript
' WRONG - does not compile:
dl.ViewUNID = viewSkoleni.UNID

' CORRECT:
dl.ViewUNID = viewSkoleni.UniversalID
```

Full `NotesView (LotusScript)` property list (9.0.1): Aliases, AllEntries, AutoUpdate, BackgroundColor, ColumnCount, ColumnNames, Columns, Created, EntryCount, HeaderLines, HttpURL, IsCalendar, IsCategorized, IsConflict, IsDefaultView, IsFolder, IsHierarchical, IsModified, IsPrivate, IsProhibitDesignRefresh, LastModified, LockHolders, Name, NotesURL, Parent, ProtectReaders, Readers, RowLines, SelectionFormula, Spacing, TopLevelEntryCount, **UniversalID**, ViewInheritedName.

Note the trap: `NotesDocument.UniversalID` is right, but `UNID` as a bare name is used by *some* other APIs (e.g. `NotesRichTextDocLink.DocUNID` / `.ViewUNID`, `uiview.CaretNoteID`) — so the shorthand feels plausible and Designer underlines the whole assignment statement, not just the bad token.

Verification: KB page `doc_H_NOTESVIEW_CLASS.html` (collection `lotus-notes`), property `UniversalID (NotesView - LotusScript)`.


---

## AppendDocLink takes a NotesView directly - never patch a doclink into a view link

`NotesRichTextItem.AppendDocLink` accepts a **NotesView** (or NotesDatabase) directly — you do not have to link to a document and then repair the link into a view link:

```lotusscript
' linkTo is documented as: NotesDatabase, NotesView, or NotesDocument
Call rtitem.AppendDocLink(viewSkoleni, sText, sText)   ' true view doclink
```

The usual workaround people write instead — `AppendDocLink(someDocInView, …)` then navigate to that doclink and set `ViewUNID`, blanking `DocUNID` — is ~25 lines of fragile code (navigator loop, wrong-element risk, `String$(32,"0")` blanking) doing what one call does natively.

Bonus: the link survives the view being re-created in Designer, because the UNID is resolved at runtime from the object you pass.

Signature (`AppendDocLink (NotesRichTextItem - LotusScript)`, Parameters): `linkTo` (NotesDatabase/NotesView/NotesDocument), `comment$` (String, hover text), `HotSpotText$` (String, visible clickable text — **new with R5**, optional). With `HotSpotText$` supplied it renders as boxed clickable text and "no other token appears in the text".

**Why it matters:** if you find yourself writing `dl.ViewUNID = view.UNID` anywhere, you are almost certainly doing this the hard way.

Verification: KB page `doc_H_APPENDDOCLINK_METHOD.html` (collection `lotus-notes`), section *Parameters*.


---

## `Call Messagebox(...)` se nepřeloží: Unexpected: MessageBox; Expected: Identifier

```lotusscript
' WRONG - hlasi: Unexpected: MessageBox; Expected: Identifier
Call Messagebox("Text", 48, "Nadpis")
Call Messagebox(sZprava, 64, "Souhrn")

' WRONG - taky neprelozi
Call Messagebox(a, b, c)

' OK - forma prikazu, BEZ zavorek a BEZ Call
MessageBox "Text", 48, "Nadpis"
MessageBox sZprava, 64, "Souhrn"

' OK - forma funkce, se zavorkami, ALE POUZE tam, kde potrebujeme navratnou hodnotu
If Messagebox("Otevrit?", 36, "Duplicitni cislo") = 6 Then
End If
```

`MessageBox` je v LotusScriptu **prikaz i funkce** ("MessageBox function and
statement"). Pri `Call` kompiler vyzaduje identifikator procedury, takze
prikaz s `Call` nejde prelozit — chyba se hlasi u `Messagebox`, ne u `Call`,
a text vypada jako by byl problem v retezci vedle nej (`Expected: Identifier`).
Stejne selhava i `Call Messagebox(...)` s vynechanym argumentem
(`Call Messagebox(a,,b)`), protoze vynechani argumentu jde kombinovat jen s
formou funkce.

IBM syntax (Language Reference):
`MessageBox message [ , [ buttons + icon + default + mode ] [ , boxTitle ] ]`
`MsgBox` se pouzivat smi.

Pozor na past s LSP: `lotusscript_lsp_lsp_diagnostics` na takhle postavenem
kodu vraci "No diagnostics" — tuto tridu chyby nedetekuje. Jedinou jistotou
je vlozeni do Designeru a Ctrl+Shift+F9.

Pravidlo: chces-li jen ukazat hlasku -> `MessageBox text, buttons, titulek`
(bez zavorek, bez Call). Chces-li zjistit, ktere tlactitko user stiskl ->
`If Messagebox(text, buttons, titulek) = 6 Then` (se zavorkami).


---

## `db.Open ""` bez obou parametrů: Unexpected: ""; Expected: ELSE

```lotusscript
' WRONG - neprelozi se. Chyba ukazuje na prazdny retezec, ne na Call:
If Not db.IsOpen Then Call db.Open ""
' -> "Unexpected: ""; Expected: ELSE; ( End-of-statement; End-of-line"

' OK - Open bere DVA parametry (server, soubor), u jiz prirazene databaze prazdne
If Not db.IsOpen Then
	Call db.Open("", "")
End If
```

`NotesDatabase.Open` v LotusScriptu vyzaduje **oba** parametry; u objektu,
ktery jiz ukazuje na existujici databazi, musi byt oba prazdne (jinak vrati
chybu, ze se tim da priradit jiny server/soubor). Server muze byt prazdny
(lokalni DB), **soubor nikdy**.

Dalsi past: `If ... Then Call ...` je jednoradkove tvrzeni a kompiler po
piknim prikazu ceka `Else` nebo konec radku. Jakmile je za `Call` neco
nečekaneho (chybějici prazdna retezec jako argument), chyba se hlasi jako
`Unexpected: <co zbylo>; Expected: ELSE; ( End-of-statement; End-of-line` a
ukazuje na prazdny retezec - ne na pruvni pripovnou chybu.

Obecniji pravidlo pro jednoradkove `If ... Then`: bezpecne jsou jen
prikazove/prirazove formy (`If x > 0 Then y = 1`). Method call s vice
parametry rad radsi rozloz do `Then` / `End If` na vlastni radky.

Poznamka: `lotusscript_lsp_lsp_diagnostics` ani tuto tridu chyby nehlasi -
hlasi "No diagnostics". Jedinou jistotou je Designer + Ctrl+Shift+F9.


---

## `server$ As String` se nepřeloží: Declaration may not contain type suffix and data type

```lotusscript
' WRONG - "Declaration may not contain type suffix and data type: SERVER"
Sub ZkontrolujRadu(server$ As String, cesta$ As String, pohled$ As String)

' OK - bud suffix NEBO As datatyp, nikoli oboji
Sub ZkontrolujRadu(server As String, cesta As String, pohled As String)

' Stejne plati pro Dim:
Dim x$ As String      ' WRONG
Dim x As String       ' OK
Dim x$                ' OK
```

V LotusScriptu NESMI typovy sufik (`$` String, `%` Integer, `!` Single,
`&` Long, `#` Double, `@` Currency) kombinovat s `As datatyp`. Chyba se
hlasi u **nazvu promenne bez sufixu** ("...and data type: SERVER"), takze
ukazuje na preklep v nazvu, ne na to, co je spatne - hledani chyby timhle
smerem zbytecne zdrzuje.

Typicky vzorec z veteranstvi: `Dim db As NotesDatabase` misto
`db$`; `$` se v modernim LotusScriptu skoro nepouziva, u procedur vubec ne.

Past na kontrolu: LSP (`lotusscript_lsp_lsp_diagnostics`) hlasi
"No diagnostics" i na takhle neprelozitelny kod.

DULEZITE - kaskada chyb: Designer hlasi PRVNI chybu a zastavi se. V jednom
souboru tak muze byt nekolik chyb a oprava jedne odhali dalsi. Kdyz agent
selhal na `Call Messagebox(...)` (radek X) a po oprave na `db.Open ""`
(radek Y) a pak na `server$ As String` (radek Z) - to nejsou tri ruzne
chyby v kodu, ale tri vady, ktere tam byly od zacatku. Po kazde oprave
pocitej s tim, ze dalsi chyba je ve frontce.

Jak najit dalsi chyby bez Designeru (staticky):
1. agregovany vystup prevest na DXL (Convert-LssToDxl) a projít jednotlive
   `<code>` sekce;
2. v kazde sekci porovnat `Dim ... Then$` vs `End If` (POZOR: `ElseIf ... Then`
   se NEPOCITA jako If, jinak vyjde falesna nesrovnalost);
3. vyhledat vsechny `[A-Za-z0-9_]\$ *As ` - tohle padne presne na chybu
   vyse;
4. porovnat pouzite promenne s deklarovanymi v teze procedure (Option Declare).


---

## `aDoc(i) = doc` v poli: SET required on class instance assignment

```lotusscript
' WRONG - "SET required on class instance assignment"
Dim aDoc() As Variant
aDoc(nPocet) = doc          ' doc je NotesDocument (objekt)

' WRONG - v poli pole to nepomaha, radsi to nedelej
Set aDoc(nPocet) = doc

' OK - ulozit NoteID jako text, objekt si odvodit az kdyz je potreba
Dim aId() As String
aId(nPocet) = doc.NoteID
...
Set doc = db.GetDocumentByID(aId(j))
If Not doc Is Nothing Then
	Call ws.EditDocument(False, doc)
End If
```

Kazde prirazeni **odkazu na objekt** (NotesDocument, NotesView, NotesDatabase,
NotesSession, vlastni Class, OLE, Nothing) musi mit `Set`. Plnohodnotna hodnota
(Long, Double, String, ...) se `Set` nepouziva - a naopak: `Set` u cisla je
chyba.

`EntryCount`, `NoteID`, `Title`, `IsOpen` jsou hodnoty, ne odkazy - `Set` tam
nesmi byt. Rozhodi, jestli je za teckou metoda (GetDocumentByID,
GetView, GetFirstDocument -> Set) nebo vlastnost (EntryCount, NoteID ->
bez Set). Chyba "SET required on class instance assignment" je v seznamu
IBMCompile-time i Run-time Error Messages.

Pro prenaseni seznamu dokumentu mezi temi - **ukladat NoteID do pole
retezcu**, ne pole objektu. Vyhoda i vedlejsi: v poli As Variant drzely
zive reference na vsechny nactene dokumenty, takze agent neuvolnil pamet
az do konce behu. IBM to popisuje primo jako doporuceny vzor
("Locating a document by ID"): ulozit NoteID do string array a pak
v cyklu GetDocumentByID. GetDocumentByID je na **NotesDatabase**
(nikoli NotesView) a vraci Nothing, pokud dokument neexistuje - proto
vazdy `If Not doc Is Nothing`.

Pozor na kontrolu regexem: `/^\s*(Set\s+)?\w+ = (session|db|view|doc|ws)\.\w+/`
hlasi jako chybu i `x = view.EntryCount` a `aId(i) = doc.NoteID`, protoze
sleduje jen `objekt.vlastnost`. Treba vzorec doplnit o seznam vlastnosti,
ktere jsou hodnoty.
