# LotusScript Gotchas

Common traps and how to avoid them in IBM Notes/Domino 9.0.1.

---

## `Shell` is a built-in function — cannot be used as variable name

Compile error: `Unexpected: shell; Expected: Identifier`. `Shell` is a built-in
LotusScript function (for executing external programs), so `Dim shell` fails at compilation.
The same restriction applies to other built-in functions (`Dir`, `Format`, `Mid`, `Left`, `Right`, etc.).

**Beware of less obvious string built-ins** — this also applies to your own
`Function`/`Sub` names, not just variables. Error: `Unexpected: StrRight; Expected: Identifier`.
Built-ins include `StrLeft`, `StrRight`, `StrLeftBack`, `StrRightBack`, `StrToken`,
`StrConv`, `StrCompare`. Name custom procedures differently (e.g. `ExtractPathFileName` instead
of `StrRight`).

```lotusscript
' WRONG:
Dim shell As Variant
Set shell = CreateObject("WScript.Shell")   ' Unexpected: shell

' CORRECT:
Dim wsh As Variant
Set wsh = CreateObject("WScript.Shell")
```

---

## ForAll - DO NOT declare loop alias variable

```lotusscript
' WRONG:
Dim item As Variant
ForAll item In doc.Items

' CORRECT:
ForAll item In doc.Items   ' Alias is declared automatically by compiler
```

---

## Const - WITHOUT "As Type"

```lotusscript
' WRONG:
Const X As Integer = 5

' CORRECT:
Const X% = 5      ' % = Integer
Const S$ = "text" ' $ = String
Const L& = 100    ' & = Long
```

---

## Option Public/Declare - duplicate occurrences

Error: "Option can be specified only once in a module"

```lotusscript
' WRONG: Option is already defined in (Globals) -> (Options), and you add it again
Option Public
Option Declare
Sub Click(Source As Button)
   ...
End Sub

' CORRECT: Check (Globals) - if already present, DO NOT re-add
Sub Click(Source As Button)
   ...
End Sub
```

| Location | Option Public/Declare |
|---|---|
| Standalone `.lss` file | Recommended |
| Agent/Form/Button event | Check (Globals) |

---

## Opening DB without access - skip safely

Depends on HOW you obtain the database — two distinct scenarios:

### Scenario 1: `New NotesDatabase(server, file)` constructor

The constructor automatically attempts to open the database. If it fails, `IsOpen` returns `False`.
**Error handling is NOT required** (per IBM `IsOpen` documentation).

```lotusscript
' CORRECT: constructor + IsOpen = safe without error handler
Dim db As New NotesDatabase("server/ORG", "mail\user.nsf")
If db.IsOpen Then
   ' DB is open, process documents
Else
   ' DB could not be opened (ACL denied, file does not exist, etc.)
End If
```

### Scenario 2: `NotesDbDirectory` iteration

`GetFirstDatabase` / `GetNextDatabase` DO NOT open the database!
However, you do not need to call `Open()` — instantiate a NEW object via constructor.

#### Recommended pattern: constructor (clean, no error handler required)

```lotusscript
Set currentDb = dbDir.GetFirstDatabase(DATABASE)
While Not (currentDb Is Nothing)
   ' Create new object via constructor - opens safely
   Dim tempDb As New NotesDatabase(server, currentDb.FilePath)
   If tempDb.IsOpen Then
      ' Safely work with tempDb
   End If
   Set currentDb = dbDir.GetNextDatabase
Wend
```

#### Alternative: Inline Resume Next (legacy approach)

```lotusscript
On Error Resume Next
Call db.Open("", "")
If Err = 0 Then
   ' OK - work with db
Else
   ' Skip - no access (Err contains error code)
End If
On Error GoTo 0   ' IMPORTANT: restore error handling!
```

**Warning:** Do not forget `On Error GoTo 0` after the block, otherwise all errors
in the remainder of the script will be silenced!

### Error Codes

| Situation | Error Code |
|---|---|
| ACL access denied | 4005 / 4060 |
| Database does not exist | 4005 |
| Database corrupted | 4000 |

### Summary

| How DB is obtained | Opens automatically? | Error handler required? |
|---|---|---|
| `New NotesDatabase(srv, file)` | Yes (constructor) | No — `IsOpen` is sufficient |
| `dbDir.GetFirstDatabase` | No | Required if calling `Open()` |
| `db.OpenByReplicaID(srv, rid)` | Yes | No — `IsOpen` is sufficient |

---

## Empty cannot be assigned when Option Declare is active

```lotusscript
' WRONG:
Dim folderRefs As Variant
folderRefs = Empty   ' Compile error: "Empty not declared"

' CORRECT:
Dim folderRefs As Variant
' folderRefs is automatically Empty after Dim - no need to assign
If IsEmpty(folderRefs) Then Print "is empty"
```

---

## doc.Created / LastModified / LastAccessed return Variant DATE, NOT NotesDateTime

```lotusscript
' WRONG:
Function FormatDT(dt As NotesDateTime) As String  ' Type mismatch!
Print FormatDT(doc.Created)

' CORRECT: doc.Created returns a Variant of subtype DATE
Dim dateVar As Variant
dateVar = doc.Created
If Not IsEmpty(dateVar) Then
    Print Format$(dateVar, "yyyy-mm-dd") & "T" & Format$(dateVar, "hh:nn:ss")
End If
```

**Note:** `NotesItem.DateTimeValue` returns a `NotesDateTime` object — that is fine.
However, `NotesDocument.Created / LastModified / LastAccessed` return a `Variant (Date)`!

---

## Built-in constants — do not re-declare

Notes provides pre-defined constants. When `Option Declare` is on, you MUST NOT redeclare them:

```lotusscript
' WRONG:
Const EMBED_ATTACHMENT% = 1454   ' "Name already declared"

' CORRECT:
' EMBED_ATTACHMENT (1454) is a built-in constant - simply use it directly
If eObj.Type = EMBED_ATTACHMENT Then ...
```

Other built-ins include: `EMBED_OBJECT`, `EMBED_OBJECTLINK`, `DATABASE`, `TEMPLATE`,
`REPLICA_CANDIDATE`, `TEMPLATE_CANDIDATE`.

---

## Workflow applications — date fields MUST include time

When storing the timestamp of an action (approval, dispatch, assignment), **always store the time alongside the date**. Otherwise, audit duration tracking is lost.

```lotusscript
' WRONG: date only without time — duration information lost
doc.ReplaceItemValue "ApprovedDate", Date$   ' Returns only date e.g. "11.02.2026"

' CORRECT: date + time — exact audit trail
doc.ReplaceItemValue "ApprovedDate", Now     ' Returns "11.02.2026 20:53:14"

' CORRECT alternative: via NotesDateTime (recommended for portability)
Dim dtNow As New NotesDateTime("")
Call dtNow.SetNow
Set doc.ReplaceItemValue("ApprovedDate", dtNow)
```

| Function | Return Value |
|---|---|
| `Date$` | Date only (`"11.02.2026"`) |
| `Time$` | Time only (`"20:53:14"`) |
| `Now` | Date + Time (`11.02.2026 20:53:14`) |
| `NotesDateTime.SetNow` | Full Notes date/time object |

---

## CDate does not exist — in LotusScript it is CDat

`CDate` is VBA/VBScript syntax. LotusScript uses `CDat` (without the "e").

```lotusscript
' WRONG:
Dim d As Variant
d = CDate("01.01.2026")   ' "Variable not declared: CDATE"

' CORRECT:
Dim d As Variant
d = CDat("01.01.2026")    ' OK
```

---

## Split() returns Variant, not String() — "Illegal reference to array"

In LotusScript, `Split()` returns a `Variant` wrapping an array of strings. Assigning it to `Dim x() As String` fails.

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

---

## EmbeddedObjects returns EMPTY, not empty array — ForAll will crash

`rtitem.EmbeddedObjects` returns `EMPTY` (not an empty array) when the richtext item has no attachments. Running `ForAll` over `EMPTY` throws a runtime error.

```lotusscript
' WRONG: crashes if body has no attachments
ForAll o In rtitem.EmbeddedObjects
    count = count + 1
End ForAll

' CORRECT: guard with IsEmpty before looping
If Not IsEmpty(rtitem.EmbeddedObjects) Then
    ForAll o In rtitem.EmbeddedObjects
        If o.Type = EMBED_ATTACHMENT Then count = count + 1
    End ForAll
End If
```

---

## GetFirstItem("Body") - RICHTEXT vs TEXT -> Type mismatch on AppendRTItem

`GetFirstItem` returns a `NotesRichTextItem` only if the item in NSF is actually rich text.
Emails sent by background agents frequently store `Body` as plain `TEXT` -> `GetFirstItem` returns a generic `NotesItem`.
Calling `rtitem.AppendRTItem(item)` with a plain `NotesItem` throws **Type mismatch**.

```lotusscript
' WRONG: throws Type mismatch if Body is plain Text
Dim body As NotesRichTextItem
Set body = doc.GetFirstItem("Body")
Call combinedRT.AppendRTItem(body)

' CORRECT: verify item.Type == 1 (RICHTEXT)
Dim item As NotesItem
Set item = doc.GetFirstItem("Body")
If Not (item Is Nothing) Then
    If item.Type = 1 Then   ' 1 = RICHTEXT
        Call combinedRT.AppendRTItem(item)
    Else                    ' 1280 = TEXT
        Call combinedRT.AppendText(item.Text)
    End If
End If
```

---

## Removing embedded object DURING ForAll iteration -> skips objects

Deleting embedded objects from a collection while iterating over it via `ForAll` results in skipped elements.
Store references/names first, then delete in a separate pass.

```lotusscript
' WRONG: deleting during iteration skips every second object
ForAll o In rtitem.EmbeddedObjects
    Call o.Remove
End ForAll

' CORRECT: collect names first, then remove
Dim names List As String
If Not IsEmpty(rtitem.EmbeddedObjects) Then
    ForAll o In rtitem.EmbeddedObjects
        If o.Type = EMBED_ATTACHMENT Then names(o.Name) = o.Name
    End ForAll
    ForAll n In names
        Dim obj As NotesEmbeddedObject
        Set obj = rtitem.GetEmbeddedObject(n)
        If Not (obj Is Nothing) Then Call obj.Remove
    End ForAll
End If
```

---

## CopyAllItems invalidates existing item references

After `doc.CopyAllItems(targetDoc, True)`, items in the target document are replaced.
References obtained prior to `CopyAllItems` (`Set item = doc.GetFirstItem(...)`) become invalid.

**CRITICAL:** `CopyItemToDocument` on a `RichTextItem` **DOES NOT COPY ATTACHMENTS!** (IBM documentation).
Attachments reside as separate internal `$FILE` items in the document.
To duplicate a document including attachments, use `CopyAllItems`.

---

## Evaluate(@Contains) - formula injection via special characters

If an email Subject contains quotes `"` or pipes `|`, embedding it into a formula string breaks parsing.

```lotusscript
' WRONG: Subject with quotes -> syntax error in formula
y = Evaluate(|@Contains("| & searchStr & |";"| & sourceStr & |")|)

' CORRECT: sanitize input or perform comparison in pure LotusScript
If InStr(1, sourceStr, searchStr, 5) > 0 Then ...
```

---

## $AssistMail - agent processing its own error emails -> infinite loop

If an agent sends an error notification email -> the email lands in the monitored database -> the agent picks it up -> crashes -> sends another error email -> infinite loop.

Emails sent by Domino agents carry item `$AssistMail = "1"` (or `SentByAgent = "1"`). Always filter them out:

```lotusscript
If doc.HasItem("$AssistMail") Or doc.HasItem("SentByAgent") Then Exit Sub
```

---

## EmbeddedObjects - check o.Type before ExtractFile

`EmbeddedObjects` returns ALL embedded items: file attachments, OLE objects, and object links.
Only file attachments (`EMBED_ATTACHMENT = 1454`) support `Name` and `ExtractFile`.

```lotusscript
' WRONG: assumes everything is a file
ForAll o In rtitem.EmbeddedObjects
    Call o.ExtractFile("C:\temp\" & o.Name)   ' Error on OLE objects
End ForAll

' CORRECT:
ForAll o In rtitem.EmbeddedObjects
    If o.Type = EMBED_ATTACHMENT Then
        Call o.ExtractFile("C:\temp\" & o.Name)
    End If
End ForAll
```

---

## String(count, charCode) requires ASCII range — Unicode causes "Illegal function call"

`String(count, asciiCharCode)` — the second parameter must be in range **0-255** (single byte).
Supplying Unicode codepoints like `9644` throws runtime **Error 5: Illegal function call**.

```lotusscript
' WRONG:
separator = String(40, 9644)   ' Error 5

' CORRECT:
separator = String(40, "-")
' Or for Unicode:
separator = String(40, UChr(&H2500))
```

---

## NotesDateTime.GMTTime/LocalTime return STRING, LSGMTTime/LSLocalTime return Variant DATE

| Property | Return Type | Purpose |
|---|---|---|
| `GMTTime` | **String** (`"04/23/2026 07:19:01 GMT"`) | Display only |
| `LocalTime` | **String** (`"04/23/2026 09:19:01 CEDT"`) | Display only |
| `LSGMTTime` | **Variant (Date)** | Mathematical date comparisons in UTC |
| `LSLocalTime` | **Variant (Date)** | Mathematical date comparisons in local time |

---

## Format$(date, "yyyy-mm-dd...") is LOCALE-dependent

LotusScript `Format$` interprets date masks according to the Windows/Domino system locale.
On non-English operating systems (e.g. Czech locale), mask `"yyyy"` may not be recognized as year.

```lotusscript
' Safe, locale-independent ISO date assembly:
Function IsoDate(dt As Variant) As String
    IsoDate = Right("0000" & Year(dt), 4) & "-" & _
              Right("00" & Month(dt), 2) & "-" & _
              Right("00" & Day(dt), 2)
End Function
```

---

## CLng(timestamp ms since 1970) -> Overflow (error 6)

Millisecond timestamps since Unix epoch exceed 1.7 x 10^12, whereas LotusScript `Long` has a maximum value of ~2.1 x 10^9.
Calling `CLng(msTimestamp)` immediately causes a runtime **Overflow (Error 6)**. Use `Double` for epoch arithmetic.

---

## Agent Use "DominoApiLib" -> Variable not declared on ALL DApi_ functions

If an agent fails to recognize any procedure from an included Script Library, check:
1. `Use "LibraryName"` must be placed in **(Options)**, never inside `Sub Initialize`.
2. The Script Library must be compiled with **Save + Ctrl+Shift+F9**.
3. In the calling agent, run **Ctrl+Shift+F9** to recompile all dependencies.

---

## Changing Form from Memo to another -> DUPLICATES (zombie mail-routing fields)

When an agent changes `doc.Form = "CustomForm"` on an incoming email (Memo),
you **must delete mail routing items**! Otherwise, Notes sees `DefaultMailSaveOptions = "1"` or `MailOptions` upon user Save and routes a duplicate back into the mail-in database.

```lotusscript
doc.Form = "CustomForm"
Call doc.RemoveItem("MailOptions")
Call doc.RemoveItem("DefaultMailSaveOptions")
Call doc.RemoveItem("SaveOptions")
```

---

## UChr vs Chr — Unicode in LotusScript

`Chr(n)` only accepts values 0-255 (ANSI). For Unicode codepoints above `&H00FF`, use `UChr`.
For string lengths, use `Len` or `UArray`.

```lotusscript
' WRONG:
c = Chr(&H010D)   ' Error: Illegal function call

' CORRECT:
c = UChr(&H010D)  ' "č"
```

---

## PowerShell 5.1 — SignedCms (PKCS#7/CMS) requires `Add-Type`

In Windows PowerShell 5.1 (.NET Framework), the assembly containing `SignedCms` is not loaded by default.
Always execute:
```powershell
Add-Type -AssemblyName System.Security
```
before calling `[System.Security.Cryptography.Pkcs.SignedCms]`.

---

## PowerShell 5.1 vs 7 — stdout encoding

Windows PowerShell 5.1 defaults console pipes to OEM codepage (e.g. CP852/CP1250), breaking UTF-8 strings.
To ensure pure UTF-8 output:
```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
```

---

## PowerShell `switch` + `continue` does not stop fall-through

Inside PowerShell `switch`, `continue` acts like `break` for the current condition but does NOT skip outer iterations in a loop. Use `break` explicitly if matching only one case.

---

## PowerShell `ConvertFrom-Json` auto-parses ISO 8601 into DateTime

Strings formatted like `"2026-04-23T09:17:17Z"` are automatically converted by PowerShell to `[DateTime]` objects, which later stringify using localized system formatting. To preserve literal ISO format, use custom regex parsing or format strings explicitly.

---

## Domino 9.0.1 FP4 Linux — REQUEST_CONTENT encodes via LMBCS, not UTF-8

Web agents running on Linux Domino 9.0.1 FP4 reading `REQUEST_CONTENT` from POST bodies can interpret multi-byte characters as LMBCS rather than raw UTF-8. Convert bytes using byte-level stream processing or Java helper servlets when handling JSON payloads.

---

## DXL import — straight quote `"` inside Formula text terminates string

In Notes Formula Language, double quote `"` is the string delimiter.
When editing form/view DXL XML representations, unescaped double quotes inside formulas prematurely terminate the string and cause invalid DXL import errors. Use `@Char(34)` or balance braces `{...}`.

---

## Formula — listing specific days from range + "compute once" trap in input translation

To list each day in a date range, `@Explode([Start - End])` returns a multi-value text list of individual days.
Beware that Input Translation formulas execute on document save, whereas default value formulas execute only on document creation.

---

## `Trim`/`Trim$` strips only SPACES, not tab/CR/LF

LotusScript `Trim`, `LTrim`, and `RTrim` remove only the **ASCII space character (Chr 32)**.
They do not remove tabs (`Chr 9`), linefeeds (`Chr 10`), or carriage returns (`Chr 13`).
Text consisting solely of tabs or newlines will evaluate as non-empty.

```lotusscript
Function FullTrim(ByVal s As String) As String
    s = Replace(s, Chr$(9), " ")
    s = Replace(s, Chr$(10), " ")
    s = Replace(s, Chr$(13), " ")
    FullTrim = Trim$(s)
End Function
```

---

## `If ch >= " "` does NOT reliably filter control characters

Relational string comparisons in LotusScript (`>=`, `<`) follow **locale collation** rules (ICU), not binary codepoint values. Certain control characters can evaluate as greater than space in specific locales. Use `Asc(ch) >= 32` or `Uni(ch) >= 32` for binary safety.

---

## NotesDXLExporter.Export(doc) on documents with large attachments -> hangs (serializes base64)

By default, `NotesDXLExporter` serializes all binary attachments (`$FILE` items) into base64 XML.
On documents with multi-gigabyte attachments, this causes memory exhaustion and long hangs.
Set `exporter.OmitItemNames = "$FILE"` or export design elements only.

---

## MB_* / PICKLIST_* constants are not built-in — fails compilation without %Include "lsconst.lss"

Constants such as `MB_ICONSTOP`, `MB_ICONINFORMATION`, and `PICKLIST_NAMES` are defined in `lsconst.lss`.
Unlike `EMBED_ATTACHMENT` or `DATABASE`, they are not hardcoded into the compiler runtime.
Include `%Include "lsconst.lss"` in **(Options)** if referencing them.

---

## Const LSI_THREAD_* in Designer -> "Name previously declared"

`LSI_THREAD_PROC` and `LSI_THREAD_MODULE` (used with `GetThreadInfo`) are already defined in `LSPRVAL.LSS`, which Domino Designer includes automatically. Declaring them manually causes compile error `"Name previously declared"`.

---

## `Option ...` in (Declarations) -> compile error; belongs in (Options)

When copying monolithic LotusScript into Domino Designer, ensure compiler directives (`Option Declare`, `Option Public`, `Use`, `%Include`) are placed in the **(Options)** event. Placing them in **(Declarations)** causes immediate syntax compilation failure.

---

## ComputeWithForm recalculates ALL computed form fields

`doc.ComputeWithForm(False, False)` executes all default values, translation formulas, and validation formulas across the entire form.
If the form contains `@DbLookup` calls into external databases or dynamic tables, existing historical values on older documents may be overwritten by current lookup results.

---

## Changing "owner" is insufficient when permissions rely on other fields

In Domino workflow applications, document security (`Authors` and `Readers` fields) is often computed from composite security roles (e.g. `@Unique("[admin]":Manager:Approver)`).
Simply changing an informational field like `Owner` without updating the underlying `Authors` item or recalculating rights leaves the document inaccessible to the new recipient.


---

## Komentář ' Účel: před deklarací procedury zmizí při recompile/decompile

## Komentář nad deklarací se přesune do 01_declarations.lss

V modulární složce LotusScript agenta (pi-lotusscript-modular) se komentář
napsaný **před** `Function`/`Sub` v souboru procedury při sestavení přesune do
`01_declarations.lss` (jako blok `' === SECTION: ... ===`) a v souboru procedury
po dalším decompile zmizí.

Důsledek: linter ve scorecardu ("Czech purpose comments") počítá jen komentáře,
které v souboru procedury zůstanou. Po cyklu compile → decompile se proto hlásí
chybějící popis, i když byl napsán — a scorecard spadne o 2 body.

```lotusscript
' WRONG - po recompile/decompile zmizí ze souboru procedury
' Účel: Načte rozeslané bezpečnostní listy.
Function NactiZmenyBL(ByVal apiToken As String, nacteneZmeny() As String) As Long

' CORRECT - zůstává v těle procedury a linter ho vidí i po cyklu
Function NactiZmenyBL(ByVal apiToken As String, nacteneZmeny() As String) As Long

	' Účel: Načte rozeslané bezpečnostní listy.
	Dim pocet As Long
```

Platí i pro komentáře uvnitř těla obecně - ty se v monolitu i po decompile drží.

---

## `' === SECTION: … ===` a `%REM … Assembled from modular source files` v .lss jsou generované

`compileAgent` zapisuje do sestaveného artefaktu dva druhy vlastního scaffolding:
provenance hlavičku `%REM … Assembled from modular source files … %END REM`
a markery `' === SECTION: <soubor> ===` / `' === END SECTION: <soubor> ===`.

Když je artefakt zároveň zdrojem (`overwriteSourceLss: true`, `manifest.sourceDxl`
míří na tentýž `.lss`), čte ho při dalším cyklu zpátky `decompileLss`. Dekompilátor
proto oba druhy markerů **odstraňuje ještě před parsováním** a `compileAgent` je
navíc odstraní z každého modulárního souboru před slepením — jinak se do
`01_declarations.lss` přidala další kopie hlavičky a pár markerů při každém cyklu
a artefakt rostl donekonečna.

Praktické důsledky:

- Markery v `01_declarations.lss` jsou vždy chyba. Nikdy je tam nepiš ani
  nekopíruj — patří výhradně do sestaveného artefaktu.
- `' === END SECTION: … ===` bez odpovídajícího `' === SECTION: … ===` znamená, že
  soubor prošel cyklem před opravou; další compile ho sám vyčistí.
- Uživatelský `%REM` blok s dokumentací zůstává nedotčený — stripping maže jen
  bloky obsahující marker `Assembled from modular source files`.

```lotusscript
' WRONG - scaffolding zkopírovaný z artefaktu do modulárního souboru
' === SECTION: 01_declarations.lss ===
Dim g_status As Long

' CORRECT - jen skutečný obsah souboru
Dim g_status As Long
```

---

## InStrRev does not exist in LotusScript — "Variable not declared: INSTRREV"

`InStrRev` is a VBA/VBScript function. LotusScript (including Domino 9.0.1) has **no** reverse `InStr`, so with `Option Declare` it fails to compile:

```lotusscript
' WRONG:
i = InStrRev(s, " ")      ' Compile error: "Variable not declared: INSTRREV"
```

**Workaround** — find the last occurrence by scanning backwards:

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
' iPos = pozice posledni mezery (0 = nenalezena)
```

Practical use: building the "Příjmení Jméno" key from a CN name (`@RightBack(x,' ')` equivalent) — the first word comes from `InStr`, the last word must be found this way.

Same trap family as `CDate` → `CDat` (VBA name that LotusScript doesn't have). Note the plugin's LSP validation can be **disabled**, so a compile-breaking call like this may not be reported by tooling — the Designer compile (`Ctrl+Shift+F9`) is the authority.
