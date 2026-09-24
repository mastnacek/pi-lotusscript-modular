# LotusScript Coding Conventions (Domino 9.0.1)

Coding standards enforced by the plugin linter (`maxProcedureLines`,
`enforceCzechComments`) and expected by the JEV semantic evaluator.

---

## 1. File Structure

```lotusscript
Option Public
Option Declare
%Include "lsconst.lss"

'**********************************************************************
' NÁZEV: nazev-souboru.lss
' ÚČEL: Stručný popis (1-2 věty)
' AUTOR: Jméno
' VYTVOŘENO: YYYY-MM-DD
' ZÁVISLOSTI: Seznam závislostí
'
' VERZE: 1.0
' CHANGELOG:
'   1.0 (YYYY-MM-DD) - Popis změny
'**********************************************************************

'===== KONSTANTY =====

'===== POMOCNÉ FUNKCE =====

'===== HLAVNÍ RUTINA =====
Sub Initialize
End Sub
```

---

## 2. Comments

### Rules
- **Only apostrophe `'`** — never `REM`
- **Explain WHY, not WHAT**
- **Sections:** `'===== NÁZEV SEKCE =====`
- Every procedure carries a purpose line right above the declaration:
  `' Účel: <1 sentence in Czech>`. The linter matches this literal marker.

### Function header block
```lotusscript
Function MojeFunkce(param1 As String) As Boolean
	'**********************************************************************
	' Stručný popis co funkce dělá
	' PARAMETRY:
	'   param1 (String) - Popis parametru
	' NÁVRATOVÁ HODNOTA: Boolean - Kdy vrací True/False
	' POZNÁMKY: Důležité informace, omezení
	'**********************************************************************
```

---

## 3. Constants

- At the **top**, under the file header
- **UPPERCASE** with underscores
- Type suffix (`$` String, `%` Integer, `&` Long)

```lotusscript
Const ERROR_EMAIL$ = "admin@firma.cz"
Const MAX_ITEMS% = 1000

' GetThreadInfo constants (required with Option Declare)
Const LSI_THREAD_PROC = 1
Const LSI_THREAD_MODULE = 10
```

⚠️ `LSI_THREAD_*` is auto-included by Domino Designer — declaring it manually
causes `Name previously declared` (see gotchas #37).

---

## 4. Variable Declarations

- At the **beginning** of the procedure/function (never inside loops)
- **Grouped** by type (Notes objects first, then primitives)

```lotusscript
Sub Initialize
	' Notes objects
	Dim session As New NotesSession
	Dim db As NotesDatabase
	Dim doc As NotesDocument

	' Primitives
	Dim userName As String
	Dim counter As Integer
```

### Forbidden variable names (built-in collisions)

**NEVER** name variables/`Function`/`Sub` after built-ins:

| Forbidden | Why | Use instead |
|----------|-----|-------------|
| `dir` | Function (file listing) | `dirPath`, `folderPath` |
| `name` | Statement (rename) | `userName`, `docName` |
| `date` / `time` | Functions (current date/time) | `dateValue`, `timeStr` |
| `len` | Function (length) | `strLen`, `textLength` |
| `str` / `val` | Conversion functions | `strValue`, `numValue` |
| `type` | Keyword | `docType`, `itemType` |
| `input` / `print` | Statements | `inputText`, `printOutput` |
| `open` / `close` | Statements | `isOpen`, `shouldClose` |
| `error` | Keyword | `errMsg`, `errorText` |
| `shell` | Function (run program) | `wsh`, `shellCmd` |
| `token` | Reserved | `tokenValue`, `authToken` |
| `StrLeft`, `StrRight`, `StrToken`… | String built-ins | different name |

Compile error signature: `Unexpected: <name>; Expected: Identifier`.

---

## 5. Error Handling

### Handler skeleton
```lotusscript
Sub Initialize
	Dim session As New NotesSession
	Dim db As NotesDatabase

	On Error GoTo ErrorHandler

	' ... main code ...

	Exit Sub  ' IMPORTANT - prevents fall-through into handler

ErrorHandler:
	Call SendErrorEmail(ERROR_NOTIFY_EMAIL)
	Exit Sub
End Sub
```

### Complete SendErrorEmail function
```lotusscript
Sub SendErrorEmail(notifyEmail As String)
	On Error Resume Next  ' protect against error inside the handler

	Dim errNum As Integer, errLine As Long
	Dim errMsg As String, procName As String, moduleName As String

	' Capture info IMMEDIATELY (before it is overwritten)
	errNum = Err
	errLine = Erl
	errMsg = Error$
	procName = GetThreadInfo(LSI_THREAD_PROC)
	moduleName = GetThreadInfo(LSI_THREAD_MODULE)

	Dim mailDb As New NotesDatabase("domino/VEBA", "mail.box")
	Dim memo As New NotesDocument(mailDb)

	memo.Form = "Memo"
	memo.SendTo = notifyEmail
	memo.Subject = "CHYBA: " & moduleName & " - " & procName
	memo.Body = "Čas: " & Now & Chr(10) & _
	            "Modul: " & moduleName & Chr(10) & _
	            "Procedura: " & procName & Chr(10) & _
	            "Řádek: " & errLine & Chr(10) & _
	            "Chyba #" & errNum & ": " & errMsg

	Call memo.Send(False)
End Sub
```

### Chained procedures
In called procedures re-raise with context instead of swallowing:
```lotusscript
Catch:
	Error Err, "ProcessData (řádek " & CStr(Erl) & "): " & Error$
```

---

## 6. Procedure Size & Comments (Linter Contract)

1. No procedure exceeds `maxProcedureLines` (default **300**) unless the user
   approves an exception in the interactive modal.
2. Every `Sub`/`Function` carries a Czech purpose comment `' Účel: ...`.
3. Purpose comments sit **above the procedure declaration** — but see gotcha
   #41: comments directly above a procedure declaration can be lost during
   recompile/decompile cycles; prefer placing them inside the synthetic header
   block (`@script-member-of` block) or the first line inside the procedure.

---

## 7. Date/Time & Locale Hard Rules (short list)

- Date fields in workflow apps **MUST include time** (gotcha #9).
- `doc.Created` / `LastModified` return `Variant DATE`, not `NotesDateTime` (#7).
- `CDat`, not `CDate` (#10). `UChr`, not `Chr`, for Unicode (#25).
- `Format$(date, ...)` is locale-dependent (#21) — prefer explicit patterns.

Full list: `references/gotchas-index.md` or `lotusscript_gotchas(action: "search", query: "...")`.