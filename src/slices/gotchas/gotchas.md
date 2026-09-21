# LotusScript Gotchas

Časté chyby a jak se jim vyhnout.

---

## `Shell` je vestavěná funkce — nelze ji použít jako název proměnné

Compile error: `Unexpected: shell; Expected: Identifier`. `Shell` je vestavěná
LotusScript funkce (spuštění programu), takže `Dim shell` selže už při kompilaci.
Stejně tak nejdou další built-iny (`Dir`, `Format`, `Mid`, `Left`, `Right`...).

**Pozor i na méně známé string built-iny** — platí i pro názvy vlastních
`Function`/`Sub`, ne jen proměnných. Chyba: `Unexpected: StrRight; Expected: Identifier`.
Vestavěné jsou mj. `StrLeft`, `StrRight`, `StrLeftBack`, `StrRightBack`, `StrToken`,
`StrConv`, `StrCompare`. Vlastní funkci pojmenuj jinak (např. `NazevZCesty` místo
`StrRight`).

```lotusscript
' ŠPATNĚ:
Dim shell As Variant
Set shell = CreateObject("WScript.Shell")   ' Unexpected: shell

' SPRÁVNĚ:
Dim wsh As Variant
Set wsh = CreateObject("WScript.Shell")
```

---

## ForAll - NEDEKLARUJ alias

```lotusscript
' ŠPATNĚ:
Dim item As Variant
ForAll item In doc.Items

' SPRÁVNĚ:
ForAll item In doc.Items   ' alias se vytvoří automaticky
```

---

## Const - BEZ "As Type"

```lotusscript
' ŠPATNĚ:
Const X As Integer = 5

' SPRÁVNĚ:
Const X% = 5      ' % = Integer
Const S$ = "text" ' $ = String
Const L& = 100    ' & = Long
```

---

## Option Public/Declare - duplicita

Error: "Option can be specified only once in a module"

```lotusscript
' ŠPATNĚ: Option už je v (Globals) → (Options), a ty ji přidáš znovu
Option Public
Option Declare
Sub Click(Source As Button)
   ...
End Sub

' SPRÁVNĚ: Zkontroluj (Globals) - pokud tam jsou, NEPŘIDÁVEJ
Sub Click(Source As Button)
   ...
End Sub
```

| Kde | Option Public/Declare |
|-----|----------------------|
| Samostatný `.lss` soubor | ✅ Přidej |
| Agent/Form/Button event | ⚠️ Zkontroluj (Globals) |

---

## Otevření DB bez přístupu - přeskoč a jeď dál

Záleží JAK databázi získáš - dva různé scénáře:

### Scénář 1: `New NotesDatabase(server, file)` — konstruktor

Konstruktor se SÁM pokusí otevřít DB. Pokud selže, `IsOpen` vrátí `False`.
**Error handling NENÍ potřeba** (viz IBM dokumentace IsOpen).

```lotusscript
' SPRÁVNĚ: konstruktor + IsOpen = bezpečné bez error handleru
Dim db As New NotesDatabase("server/ORG", "mail\user.nsf")
If db.IsOpen Then
   ' DB je otevřená, pracuj s ní
Else
   ' DB se nepodařilo otevřít (ACL, neexistuje...)
End If
```

### Scénář 2: `NotesDbDirectory` iterace

`GetFirstDatabase` / `GetNextDatabase` DB **neotevírají**!
Ale nemusíš volat `Open()` — vytvoř NOVÝ objekt konstruktorem.

#### Doporučený postup: konstruktor (čistý, bez error handleru)

Viz `hledat-vsude.lss`

```lotusscript
Set currentDb = dbDir.GetFirstDatabase(DATABASE)
While Not (currentDb Is Nothing)
   ' Vytvor novy objekt konstruktorem - bezpecne otevre
   Dim tempDb As New NotesDatabase(server, currentDb.FilePath)
   If tempDb.IsOpen Then
      ' bezpečně pracuj s tempDb
   End If
   Set currentDb = dbDir.GetNextDatabase
Wend
```

#### Alternativa: Inline Resume Next (starší přístup)

Viz `seznam-db.lss`

```lotusscript
On Error Resume Next
Call db.Open("", "")
If Err = 0 Then
   ' OK - pracuj s db
Else
   ' přeskoč - nemáš přístup (Err = chybový kód)
End If
On Error GoTo 0   ' DŮLEŽITÉ: vrať error handling zpět!
```

**Pozor:** Nezapomeň `On Error GoTo 0` po bloku, jinak se ztlumí
všechny chyby v celém zbytku scriptu!

### Chybové kódy

| Situace | Chybový kód |
|---------|-------------|
| Nemáš ACL přístup | 4005 / 4060 |
| DB neexistuje | 4005 |
| DB je poškozená | 4000 |

### Shrnutí

| Jak získáš DB | Otevře se sama? | Error handling? |
|---------------|-----------------|-----------------|
| `New NotesDatabase(srv, file)` | ✅ Ano (konstruktor) | ❌ Nepotřeba — `IsOpen` stačí |
| `dbDir.GetFirstDatabase` | ❌ Ne | ✅ Nutný při `Open()` |
| `db.OpenByReplicaID(srv, rid)` | ✅ Ano | ❌ Nepotřeba — `IsOpen` stačí |

---

## Empty nelze přiřadit s Option Declare

```lotusscript
' ŠPATNĚ:
Dim folderRefs As Variant
folderRefs = Empty   ' Compile error: "Empty not declared"

' SPRÁVNĚ:
Dim folderRefs As Variant
' folderRefs je automaticky Empty po Dim - nemusíš přiřazovat
If IsEmpty(folderRefs) Then Print "je prazdny"
```

---

## doc.Created / LastModified / LastAccessed vrací Variant, NE NotesDateTime

```lotusscript
' ŠPATNĚ:
Function FormatDT(dt As NotesDateTime) As String  ' Type mismatch!
Print FormatDT(doc.Created)

' SPRÁVNĚ: doc.Created vrací Variant of type DATE
Dim dateVar As Variant
dateVar = doc.Created
If Not IsEmpty(dateVar) Then
    Print Format$(dateVar, "yyyy-mm-dd") & "T" & Format$(dateVar, "hh:nn:ss")
End If
```

Pozor: `NotesItem.DateTimeValue` vrací `NotesDateTime` - to je OK. Ale `NotesDocument.Created/LastModified/LastAccessed` vrací `Variant of DATE`!

---

## Vestavěné konstanty - nedeklarovat znovu

Notes má předdefinované konstanty, které s `Option Declare` NESMÍŠ deklarovat:

```lotusscript
' ŠPATNĚ:
Const EMBED_ATTACHMENT% = 1454   ' "Name already declared"

' SPRÁVNĚ:
' EMBED_ATTACHMENT (1454) je vestavěná konstanta - prostě ji použij
If eObj.Type = EMBED_ATTACHMENT Then ...
```

Další vestavěné: `EMBED_OBJECT`, `EMBED_OBJECTLINK`, `DATABASE`, `TEMPLATE`, `REPLICA_CANDIDATE`, `TEMPLATE_CANDIDATE`

---

## Workflow aplikace - datumová pole VŽDY s časem

Když ukládáš datum akce (schválení, odeslání, přiřazení...), **vždy ukládej i čas**. Jinak přijdeš o klíčový údaj — kdo jak dlouho co dělal.

```lotusscript
' ŠPATNĚ: jen datum bez času — ztráta informace o délce zpracování
doc.ReplaceItemValue "ApprovedDate", Date$   ' vrátí jen "11.02.2026"

' SPRÁVNĚ: datum + čas — víš přesně kdy se to stalo
doc.ReplaceItemValue "ApprovedDate", Now     ' vrátí "11.02.2026 20:53:14"

' SPRÁVNĚ alternativa: přes NotesDateTime (doporučeno pro přenositelnost)
Dim dtNow As New NotesDateTime("")
Call dtNow.SetNow
Set doc.ReplaceItemValue("ApprovedDate", dtNow)
```

**Proč:** Bez času nevíš, jestli schválení trvalo 5 minut nebo 8 hodin. U workflow auditů a SLA je to kritické.

| Funkce | Vrací |
|--------|-------|
| `Date$` | jen datum (`"11.02.2026"`) |
| `Time$` | jen čas (`"20:53:14"`) |
| `Now` | datum + čas (`11.02.2026 20:53:14`) |
| `NotesDateTime.SetNow` | plný timestamp (doporučeno) |

---

## CDate neexistuje - v LotusScriptu je to CDat

`CDate` je VBA/VBScript syntax. LotusScript má `CDat` (bez "e").

```lotusscript
' ŠPATNĚ:
Dim d As Variant
d = CDate("01.01.2026")   ' "Variable not declared: CDATE"

' SPRÁVNĚ:
Dim d As Variant
d = CDat("01.01.2026")    ' OK
```

| VBA/VBScript | LotusScript |
|-------------|-------------|
| `CDate()` | `CDat()` |
| `CBool()` | `CBool()` (stejné) |
| `CInt()` | `CInt()` (stejné) |

---

## Split() vrací Variant, ne String() — "Illegal reference to array"

`Split()` v LotusScriptu vrací `Variant` (obsahující pole stringů). Přiřadit ho do `Dim x() As String` nejde.

```lotusscript
' ŠPATNĚ:
Dim keys() As String
keys = Split(keyNames, ",")   ' "Illegal reference to array"

' SPRÁVNĚ:
Dim keys As Variant
keys = Split(keyNames, ",")   ' OK - Variant pojme pole ze Split
Print keys(0)                  ' funguje
Print UBound(keys)             ' funguje
```

| Funkce | Vrací | Přiřadit do |
|--------|-------|-------------|
| `Split()` | `Variant` (pole stringů) | `Dim x As Variant` |
| `Join()` | `String` | `Dim s As String` |

---

## EmbeddedObjects vrací EMPTY, ne prázdné pole — ForAll spadne

`rtitem.EmbeddedObjects` vrátí `EMPTY` (ne prázdné pole) když richtext nemá žádné přílohy. `ForAll` na `EMPTY` vyhodí runtime error.

```lotusscript
' ŠPATNĚ: spadne pokud body nemá přílohy
ForAll o In rtitem.EmbeddedObjects
    count = count + 1
End ForAll

' SPRÁVNĚ: nejdřív ověř že je to pole
If IsArray(rtitem.EmbeddedObjects) Then
    ForAll o In rtitem.EmbeddedObjects
        count = count + 1
    End ForAll
End If
```

---

## GetFirstItem("Body") - RICHTEXT vs TEXT → Type mismatch na AppendRTItem

`GetFirstItem` vrátí `NotesRichTextItem` jen pokud je položka skutečně RICHTEXT.
Emaily z agentů (SendErrorEmail) mají Body jako plain TEXT → `GetFirstItem` vrátí `NotesItem`.
Volání `AppendRTItem` s `NotesItem` parametrem vyhodí **Chyba #13: Type mismatch**.

```lotusscript
' ŠPATNĚ: předpokládá že Body je vždy RICHTEXT
Dim rtBody As Variant
Set rtBody = doc.GetFirstItem("Body")
Call rtPopis.AppendRTItem(rtBody)     ' PADNE pokud Body je TEXT!

' SPRÁVNĚ: zkontroluj typ položky
Dim bodyItem As NotesItem
Set bodyItem = doc.GetFirstItem("Body")
If bodyItem.Type = RICHTEXT Then
    Call rtPopis.AppendRTItem(bodyItem)
Else
    Call rtPopis.AppendText(bodyItem.Text)
End If
```

---

## Remove embedded object BĚHEM ForAll iterace → přeskočení objektů

Mazání embedded objektů z kolekce přes kterou iteruješ `ForAll` je nepředvídatelné.
Nejdřív si zapamatuj jména, pak smaž v samostatném cyklu.

```lotusscript
' ŠPATNĚ: mazání během iterace
ForAll o In rtitem.EmbeddedObjects
    Call o.ExtractFile(path & o.Name)
    Call o.Remove                     ' Modifikuje kolekci během iterace!
End ForAll

' SPRÁVNĚ: dvouprůchodový přístup
Dim names() As String
Dim cnt As Integer
cnt = 0
ForAll o In rtitem.EmbeddedObjects
    ReDim Preserve names(0 To cnt)
    names(cnt) = o.Name
    Call o.ExtractFile(path & o.Name)
    cnt = cnt + 1
End ForAll
' Teprve teď smaž
Dim i As Integer
For i = 0 To cnt - 1
    Dim obj As NotesEmbeddedObject
    Set obj = rtitem.GetEmbeddedObject(names(i))
    If Not obj Is Nothing Then Call obj.Remove
Next
```

---

## CopyAllItems invaliduje existující reference na položky

Po `CopyAllItems(doc, True)` se všechny položky v `doc` přepíší.
Reference získané před CopyAllItems (`Set item = doc.GetFirstItem(...)`) mohou být neplatné.

**POZOR:** `CopyItemToDocument` na RichTextItem **NEKOPÍRUJE přílohy!** (IBM docs: "file attachments, embedded objects, and object links are NOT copied")

```lotusscript
' ŠPATNĚ: reference na Body se stane neplatnou po CopyAllItems
Set rtBody = doc.GetFirstItem("Body")
Call template.CopyAllItems(doc, True)    ' Přepíše Body!
Call rtPopis.AppendRTItem(rtBody)         ' rtBody je neplatný!

' ŠPATNĚ: CopyItemToDocument ztratí přílohy z RichText!
Call bodyItem.CopyItemToDocument(docTemp, "BodyBackup")

' SPRÁVNĚ: CopyToDatabase → plná kopie dokumentu včetně příloh
Set docTemp = doc.CopyToDatabase(db)     ' Uloží se do DB!
Call template.CopyAllItems(doc, True)
Set rtBody = docTemp.GetFirstItem("Body")
If rtBody.Type = RICHTEXT Then
    Call rtPopis.AppendRTItem(rtBody)     ' Včetně příloh
Else
    Call rtPopis.AppendText(rtBody.Text)
End If
Call docTemp.Remove(True)                 ' Ukliď temp dokument
```

---

## Evaluate(@Contains) - formula injection přes speciální znaky

Pokud Subject emailu obsahuje `"` nebo `|`, vložený řetězec rozbije Notes formuli.

```lotusscript
' ŠPATNĚ: Subject s uvozovkami → syntax error ve formuli
y = Evaluate(|@Contains("| & searchStr & |";"| & sourceStr & |")|)
' Pokud sourceStr = 'Chyba "timeout"' → @Contains("key";"Chyba "timeout"")

' SPRÁVNĚ: použij InStr místo Evaluate
If InStr(1, searchStr, sourceStr, 5) > 0 Then
    ' nalezeno
End If
```

---

## $AssistMail - agent zpracovává vlastní chybové emaily → nekonečná smyčka

Agent odesílá chybové emaily přes `SendErrorEmail` → email se doručí do databáze → agent ho najde → spadne → odešle další chybový email → nekonečná smyčka.

Emaily odeslané agenty mají `$AssistMail = "1"` (a/nebo `SentByAgent` položku).

```lotusscript
' ŠPATNĚ: agent zpracuje i své vlastní chybové emaily
Set doc = view.GetFirstDocument
While Not (doc Is Nothing)
    ' ... zpracování → spadne na chybovém emailu → SendErrorEmail → smyčka

' SPRÁVNĚ: přeskoč emaily odeslané agenty
If doc.HasItem("$AssistMail") Then
    If doc.GetItemValue("$AssistMail")(0) = "1" Then
        GoTo NextEmail  ' přeskoč
    End If
End If
```

---

## EmbeddedObjects - kontroluj o.Type před ExtractFile

`EmbeddedObjects` vrací VŠECHNY embedded objekty: přílohy, OLE objekty i object linky. Jen přílohy (`EMBED_ATTACHMENT = 1454`) mají `Name` a `ExtractFile`.

```lotusscript
' ŠPATNĚ: předpokládá že všechno je příloha
ForAll o In rtitem.EmbeddedObjects
    Call o.ExtractFile(path & o.Name)   ' Spadne na OLE objektu!
End ForAll

' SPRÁVNĚ: kontroluj typ
ForAll o In rtitem.EmbeddedObjects
    If o.Type = EMBED_ATTACHMENT Then
        Call o.ExtractFile(path & o.Name)
    End If
End ForAll
```

| Konstanta | Hodnota | Popis |
|-----------|---------|-------|
| `EMBED_ATTACHMENT` | 1454 | Souborová příloha |
| `EMBED_OBJECT` | 1453 | OLE embedded objekt |
| `EMBED_OBJECTLINK` | 1452 | OLE object link |

---

## String(count, charCode) vyžaduje ASCII range — Unicode spadne na "Illegal function call"

`String(count, asciicharcode)` — druhý parametr musí být **0-255** (single byte).
Unicode hodnoty jako `9644` (box-drawing `─`) hodí runtime **chyba 5 Illegal function call**.

```lotusscript
' ŠPATNĚ:
separator = String(48, 9644)   ' U+25AC ─
' → runtime: Illegal function call

' SPRÁVNĚ — zůstat v ASCII:
separator = String$(48, 45)    ' 48× "-" (ASCII pomlčka)
separator = String$(48, "-")   ' taky OK — vezme první znak
separator = String$(48, 95)    ' 48× "_"
```

Pokud **fakt** potřebuješ Unicode znak v output stringu, musíš buď:
- Použít rich text a `AppendText` s Unicode string literal
- Sestavit string přes `Replace$(Space$(48), " ", Chr(9644))` — ale `Chr(9644)` taky nemusí vrátit co čekáš v některých verzích LS
- Pro JSON output prostě ASCII (spolehlivé napříč codepage)

---

## NotesDateTime.GMTTime/LocalTime vrací STRING, LSGMTTime/LSLocalTime vrací Variant DATE

Snadná past při manipulaci s datumem:

| Property | Návratový typ | Použití |
|---------|---------------|---------|
| `GMTTime` | **String** ("04/23/2026 07:19:01 GMT") | Jen pro display |
| `LocalTime` | **String** (locale format) | Jen pro display |
| `LSGMTTime` | **Variant of DATE** v GMT | Pro LS date ops (`Year`, `Month`...) |
| `LSLocalTime` | **Variant of DATE** v local | Pro LS date ops |

```lotusscript
' ŠPATNĚ: Year() na String → Type mismatch (chyba 13)
Dim n As New NotesDateTime(Now)
Print Year(n.GMTTime)      ' PADNE na Type mismatch

' SPRÁVNĚ: použij LSGMTTime (Variant DATE)
Print Year(n.LSGMTTime)    ' → 2026, funguje
Print Month(n.LSGMTTime)   ' → 4
Print Day(n.LSGMTTime)     ' → 23
Print Hour(n.LSGMTTime)    ' → 7 (UTC)
```

**Rule of thumb:** pokud chceš číselné části data (`Year()`, `Month()`...)
nebo `Format$` s auto-locale, použij **`LS*Time`** varianty. `GMTTime` /
`LocalTime` jsou už předformátované strings.

---

## Format$(date, "yyyy-mm-dd...") je LOCALE-dependent

LotusScript `Format$` neakceptuje ISO-style date patterny jako v jiných
jazycích. Pattern `"yyyy"` se chová **podle locale** systému:

```lotusscript
' Ceska locale — nerozumi "yyyy", vrati locale-default formatting
Print Format$(Now, "yyyy-mm-ddThh:nn:ss")
' → "23.04.2026 10:15:30" nebo podobny czech fallback

' SPRAVNE — sestav ISO 8601 rucne:
Dim d As Variant
d = Now
Dim iso As String
iso = CStr(Year(d)) & "-" & _
      Right$("0" & CStr(Month(d)), 2) & "-" & _
      Right$("0" & CStr(Day(d)), 2) & "T" & _
      Right$("0" & CStr(Hour(d)), 2) & ":" & _
      Right$("0" & CStr(Minute(d)), 2) & ":" & _
      Right$("0" & CStr(Second(d)), 2)
' → "2026-04-23T10:15:30"
```

Funkce `Year()`, `Month()`, `Day()`, `Hour()`, `Minute()`, `Second()`
vracejí čísla — zero-padding přes `Right$("0" & ..., 2)`.

**Kde na tohle narazíš:** JSON API kde formát musí byt stabilní
(optimistic lock), logování v ISO 8601, CSV exports pro strojové zpracování.

**Alternativa** pro některé case: `Cstr(Format(Now, "General Date"))` —
vrací locale format ale v predictable podobě.

---

## CLng(timestamp ms od 1970) → Overflow (chyba 6)

Milliseconds od Unix epoch je v roce 2026+ ~1,7 × 10¹², ale `Long` v
LotusScriptu má max ~2,1 × 10⁹. `CLng(msTimestamp)` → runtime **Overflow**.

```lotusscript
' ŠPATNĚ:
Dim expiresAt As Double
expiresAt = (CDbl(Now) - CDbl(DateSerial(1970, 1, 1))) * 86400000#
' ~1.7e12 — přesahuje Long
Print "expires: " & CStr(CLng(expiresAt))   ' Chyba 6: Overflow

' SPRÁVNĚ: Format$ pro integer string bez desetinky
Print "expires: " & Format$(expiresAt, "0")
```

| Typ | Max | Epoch ms dneska |
|-----|-----|-----------------|
| Integer | 32 767 | ❌ overflow |
| Long | 2 147 483 647 (~2.1e9) | ❌ overflow (~1.7e12) |
| Double | ~1.8e308 | ✅ OK |
| Currency | ~9.2e14 | ✅ OK (přesné na 4 dec) |

**Kde na tohle narazíš:** JSON API odpovědi s timestampy, logging epoch času,
porovnání s JavaScript `Date.now()`.

---

## Agent Use "DominoApiLib" → Variable not declared na VŠECHNY DApi_ funkce

Pokud agent nevidí **žádné** funkce ze Script Library (červené podtržení
u `DApi_RequireToken`, `DApi_GetQueryParam` atd.), problém je skoro vždy
v jedné ze 3 věcí:

```lotusscript
' ŠPATNĚ: Use uvnitř Sub Initialize
Sub Initialize
    Use "DominoApiLib"   ' Compile error - Use patří do (Options)
    ...

' ŠPATNĚ: Use v (Declarations)
' (Declarations) event obsahuje Dim globálních proměnných, ne Use

' SPRÁVNĚ: Use v (Options) event
' V Designer Objects pane → agent → (Options) MUSÍ obsahovat:
Option Public
Option Declare
Use "DominoApiLib"
```

### Checklist když agent hlásí "Variable not declared: DAPI_XXX"

1. **Kde je `Use`?** V Designeru Objects pane klikni na **(Options)**
   pod agentem. `Use "DominoApiLib"` musí být tam (ne v Initialize, ne
   v Declarations).

2. **Má library buildnuto?** Klikni na Script Library samotnou, F9,
   Errors panel musí být prázdný. Pokud má library syntax error, žádný
   agent její funkce neuvidí.

3. **Build order:** Library MUSÍ být uložená+buildnutá PŘED tím, než
   buildíš agent. Pořadí:
   - Library: Ctrl+S → F9 → ověř Errors prázdné
   - Pak teprve: Agent → Ctrl+S → F9

4. **Case-sensitivity v error hlášce:** Designer zobrazuje identifikátory
   **uppercased** v errorech (`DAPI_GETQUERYPARAM`). LotusScript samotný
   je case-insensitive, takže `DApi_GetQueryParam` = `dapi_getqueryparam`
   — nemusíš měnit styl.

5. **Library path typo:** `Use "DominoApiLib"` (v uvozovkách) je přesný
   název knihovny (case-insensitive, ale musí sedět). Pokud jsi knihovnu
   pojmenoval jinak, Use selže.

---

## Změna Form z Memo na jiný → DUPLIKÁTY (zombie mail-routing fieldy)

Když agent změní `doc.Form = "IN"` na dokumentu, který přišel jako email (Memo),
**musíš smazat mail-routing položky**! Jinak Notes při uživatelském Save vidí
`DefaultMailSaveOptions = "1"` a doručí kopii zpět do mail-in DB.

```lotusscript
' ŠPATNĚ:
doc.Form = "IN"
Call doc.Save(True, False)
' → při dalším Save v UI: Notes odešle kopii přes CopyTo/SendTo = DUPLIKÁT!

' SPRÁVNĚ:
doc.Form = "IN"
' Odstraň VŠECHNY mail-routing fieldy:
Dim removeFields As Variant
removeFields = Split("DefaultMailSaveOptions,MailOptions,SaveOptions," & _
    "SendTo,CopyTo,BlindCopyTo,INetSendTo,INetCopyTo,INetBlindCopyTo," & _
    "Recipients,Encrypt,Sign,$Mailer,$MessageID," & _
    "RouteServers,RouteTimes,DeliveredDate,PostedDate", ",")
Dim tmpItem As NotesItem
ForAll fld In removeFields
    Set tmpItem = doc.GetFirstItem(fld)
    If Not (tmpItem Is Nothing) Then Call tmpItem.Remove()
End ForAll
Call doc.Save(True, False)
```

Kritické fieldy (způsobují re-odeslání):
- `DefaultMailSaveOptions = "1"` → Notes nabídne/provede odeslání při Save
- `SendTo`, `CopyTo`, `BlindCopyTo` → příjemci (CopyTo může být ta samá mail-in DB!)
- `MailOptions`, `SaveOptions` → flagy pro mail processing

---

## UChr vs Chr — Unicode v LotusScript

`Chr(n)` akceptuje jen 0-255 (ANSI), pro Unicode code pointy nad U+00FF hodí
"Illegal function call". Pro české znaky (`č` = U+010D = 269) použij `UChr`.

```lotusscript
' ŠPATNĚ — padne na "Illegal function call":
Dim c As String
c = Chr(&H010D)   ' č, ale 269 > 255

' SPRÁVNĚ:
c = UChr(&H010D)  ' č — Unicode, akceptuje 0-65535
```

Pozn.: v LS se to jmenuje **`UChr`** (ne `ChrW` jako ve VBA / VB.NET).

---

## PowerShell 5.1 — SignedCms (PKCS#7/CMS) potřebuje `Add-Type`

`powershell.exe` (Windows PS 5.1, .NET Framework) nemá assembly se SignedCms
načtenou by default → `New-Object System.Security.Cryptography.Pkcs.SignedCms`
padne na `Cannot find type [...SignedCms]: verify that the assembly ... is loaded`.
Týká se čtení `.zfo` z datových schránek (PKCS#7 kontejner).

```powershell
# ŠPATNĚ — SignedCms není dostupný:
$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms

# SPRÁVNĚ — nejdřív načti assembly (PS 5.1; PS 7 typ už má):
try { Add-Type -AssemblyName System.Security -ErrorAction Stop } catch { }
$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms
```

Při volání z LotusScriptu se tahle chyba projeví jako návratový kód 1 a žádný
výstupní soubor (skript spadne do `catch` a zapíše chybu jen na stderr).

---

## PowerShell 5.1 vs 7 — stdout kódování

Windows PowerShell 5.1 (`powershell.exe`) při redirectu stdout do pipe/souboru
překóduje UTF-8 stringy na **system OEM codepage** (CP852 na CZ Windows), což
rozbije diakritiku pro následný bash/jq.

```bash
# ŠPATNĚ — CP852 bytes v souboru, mojibake při jq:
powershell -File script.ps1 > result.json

# SPRÁVNĚ — pwsh (PS 7) má stdout defaultně UTF-8:
pwsh -File script.ps1 > result.json
```

Nebo v .ps1 skriptu explicitně:
```powershell
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
```

PS 5.1 má navíc občas rozbité moduly (konflikt s PS 7 instalací —
`ConvertFrom-SecureString` hlásí "module could not be loaded"). Pro produkční
skripty používej `pwsh`, ne `powershell.exe`.

---

## PowerShell `switch` + `continue` nezastaví fall-through

V PS `switch` uvnitř `foreach`, `continue` v match clause **NESKOČÍ** na další
iteraci foreach. Kód za switchem se vykoná. Pokud máš víc switch bloků + `if`
za sebou, znak spadne do všech větví, kde passne podmínku.

```powershell
# ŠPATNĚ — backslash '\' se escapuje 3x:
foreach ($c in $s.ToCharArray()) {
    $code = [int]$c
    switch ($c) {
        '\' { $sb.Append('\\'); continue }   # pridano '\\'
    }
    # tady pokracujem i pro '\'!
    if ($code -ge 0x20 -and $code -le 0x7E) {
        $sb.Append($c)                        # pridano dalsi '\'
    }
}
# Output pro '\': "\\\" (3 chars)

# SPRÁVNĚ — čisté if/elseif, jen jedna větev:
foreach ($c in $s.ToCharArray()) {
    if ($c -eq '\')       { $sb.Append('\\') }
    elseif ($c -eq '"')   { $sb.Append('\"') }
    elseif ($code -ge 0x20 -and $code -le 0x7E) { $sb.Append($c) }
    else { $sb.AppendFormat('\u{0:x4}', $code) }
}
```

---

## PowerShell `ConvertFrom-Json` auto-parsuje ISO 8601 na DateTime

Stringové pole vypadající jako `"2026-04-23T09:17:17Z"` se v PS automaticky
převede na `[DateTime]`. Pak `[string]$cast` vrátí **lokalizovaný** formát
("23.04.2026 9:17:17" na CZ), který už neodpovídá původnímu ISO.

```powershell
# ŠPATNĚ:
$d = $jsonText | ConvertFrom-Json
$date = [string]$d.expected_modified_date
# $date = "23.04.2026 9:17:17" — nefunguje pro optimistic lock porovnání!

# SPRÁVNĚ — extract přímo z raw JSON přes regex:
if ($jsonText -match '"expected_modified_date"\s*:\s*"([^"]+)"') {
    $date = $Matches[1]   # "2026-04-23T09:17:17Z" — původní
}
```

`-AsHashtable` **nepomůže**, parse se provede stejně.

---

## Domino 9.0.1 FP4 Linux — REQUEST_CONTENT kóduje přes LMBCS, ne UTF-8

Web agent na Linux Domino 9.0.1 FP4 při čtení `REQUEST_CONTENT` z POST body
ignoruje `charset=utf-8` v Content-Type headeru a interpretuje bytes přes
**LMBCS/CP852** (server OEM codepage). UTF-8 multi-byte sekvence (`č` = `C4
8D`) se rozpadnou na 2 samostatné CP852 znaky (`─ì`) → double-encoded mojibake
v DB.

Výstup (Print) naopak UTF-8 respektuje — asymetrie in vs out.

Řešení bez zásahu do HTTP stacku: klient posílá non-ASCII jako `\uXXXX` escape
(ASCII-only body), server `DApi_JsonUnescape` rozbalí přes `UChr()`:

```lotusscript
' V DApi_JsonUnescape (DominoApiLib v0.4+):
Case "u"
    If i + 5 <= n Then
        hexStr = Mid$(txt, i + 2, 4)
        codePoint = CLng("&H" & hexStr)
        result = result & UChr(codePoint)  ' UChr, ne Chr!
        i = i + 6
    End If
```

```powershell
# Na klientovi — escape non-ASCII na \uXXXX:
foreach ($c in $s.ToCharArray()) {
    $code = [int]$c
    if ($code -ge 0x20 -and $code -le 0x7E) { $sb.Append($c) }
    else { $sb.AppendFormat('\u{0:x4}', $code) }
}
```

---

## DXL import — rovná uvozovka `"` uvnitř textu ve Formuli ukončí řetězec

Při ruční úpravě `.form`/`.view` DXL: ve Formula jazyce je `"` oddělovač
řetězce. Když do textu napíšeš rovnou `"` (typicky při psaní českých uvozovek
„…" zůstane závěrečná jako rovná `"`), řetězec se **předčasně ukončí** a zbytek
věty visí jako neplatné tokeny.

Importér hlásí `id='1291' Chybějící operátor nebo středník` a ukazuje na
**začátek `<formula>`** (ne na konkrétní místo v textu) — proto se chyba hledá blbě.

```text
' ŠPATNĚ — rovná " po "ručně" ukončí řetězec:
"... zaškrtněte „Upravit ručně" a níže si to připočtěte."
                            ^ Formula tady vidí konec stringu

' SPRÁVNĚ — uvnitř textu rovné uvozovky vůbec nepoužívej:
"... zaškrtněte volbu Upravit ručně a níže si to připočtěte."

' SPRÁVNĚ (když fakt potřebuješ " v textu) — zdvoj ji:
"... řekl ""ahoj""."
```

Pozn.: `&`, `<`, `>` uvnitř `<formula>` v DXL musí být `&amp;` `&lt;` `&gt;`
(XML escaping), jinak nevalidní XML. Po editaci ověř well-formedness
(`XmlReader` s `DtdProcessing=Ignore` + `XmlResolver=$null` — DOCTYPE odkazuje
na externí DTD, kterou nemáš).

---

## Formula — výpis konkrétních dnů z rozsahu + past „compute once" v input translation

**Jednotlivé dny z datového rozsahu:** `@Explode` nad time-date *rozsahem* vrátí
textový seznam, kde 1 prvek = 1 den. Rozsah z dvou polí se poskládá přes
`@TextToTime` (string ze `@Text` musí být skutečný rozsah, ne text):

```text
d1 := @Date(Od); d2 := @Date(Do);
dny := @TextToTime(@Explode(@TextToTime(@Text(d1) + " - " + @Text(d2))));
```

**KRITICKÉ — `@If` NEFILTRUJE seznam po prvcích!** `@If(seznam_podmínek; a; b)`
vrátí celou větev `a`, když je podmínka splněna aspoň pro jeden prvek (ne prvek
po prvku). `@Trim(@If(@Weekday(dny) = 1 | @Weekday(dny) = 7; @Text(dny); ""))` tedy
vrátí VŠECHNY dny, ne jen víkendy. Na transformaci/filtr po prvcích slouží
**`@Transform`** (R6+) + **`@Nothing`** (vyhodí prvek; uvnitř je proměnná SKALÁR,
takže `@If` funguje správně):

```text
REM konkrétní víkendová data:
vikendy := @Transform(dny; "x"; @If(@Weekday(x) = 1 | @Weekday(x) = 7; @Text(x); @Nothing));
REM svátky v rozsahu na všední den:
svatkyVRng := @Transform(svatky; "y"; @If(y >= d1 & y <= d2 & @Weekday(y) != 1 & @Weekday(y) != 7; @Text(y); @Nothing));
```

**Pozor — `@Unique`/`@Trim`/`@Implode` berou jen TEXT.** `@Unique(time-date list)`
hodí runtime *„Nesprávný typ údajů… byl očekáván text"*. Dedup až na **textovém**
výstupu (`@Unique(@Transform(... ; @Text(datum) ...))`), ne na seznamu time-date.

**Počty** radši aritmetikou — spolehlivější než `@Elements` (chování `@Elements("")` je ošemetné):

```text
celkem := @Elements(@Explode(rozsah));
poVik  := celkem - @BusinessDays(d1; d2; 1:7; dummy);   REM 1:7 = list {neděle, sobota}, ne rozsah!
poSv   := @BusinessDays(d1;d2;1:7;dummy) - @BusinessDays(d1;d2;1:7;svatky);
```

Pozor: `:` je spojení seznamu, takže `1:7` = dvouprvkový seznam {1,7}, NE 1 až 7.

**Past v input translation:** `@If(Pole=""; spočítej; Pole)` spočítá hodnotu
**jen jednou** (než pole dostane hodnotu), pak ji „zamrazí" — při změně vstupů
se už nepřepočítá. Pro auto-přepočet + ruční override použij explicitní příznak:

```text
' ŠPATNĚ — spočítá jednou, pak nikdy:
@If(PocetDni = ""; <spočítej>; PocetDni)

' SPRÁVNĚ — checkbox UpravitRucne řídí režim:
@If(UpravitRucne = "ano"; PocetDni; <vždy přepočítej>)
```

Input translation běží při každém refreshi i save; `recalconchange='true'` na
ovládacím keyword poli zajistí přepočet hned po jeho změně.

---

## `Trim`/`Trim$` maže jen MEZERY, ne tab/CR/LF — "prázdný" text projde jako neprázdný

LotusScript `Trim`/`LTrim`/`RTrim` odstraňují jen znak **mezera (Chr 32)**, NErozeznají
tabulátor (`Chr 9`), LF (`Chr 10`) ani CR (`Chr 13`). Typicky kousne při parsování
odsazeného XML/DXL: „prázdný" element dá `"\n\n"`, `Trim` to nechá být a `text <> ""`
projde jako by tam obsah byl.

```lotusscript
' ŠPATNĚ: prázdný odstavec z odsazeného DXL projde jako neprázdný nadpis
headText = Trim(StripTags(chunk))       ' vrátí "\n  \n" -> <> "" je True!
If headText <> "" Then buffer.Add(headText)   ' přidá prázdný nadpis

' SPRÁVNĚ: nejdřív bílé znaky na mezery, sloučit, pak Trim
Function NormalizeText(inp As String) As String
    Dim s As String
    s = ReplaceAll(inp, Chr(9), " ")
    s = ReplaceAll(s, Chr(10), " ")
    s = ReplaceAll(s, Chr(13), " ")
    While Instr(s, "  ") > 0 : s = ReplaceAll(s, "  ", " ") : Wend
    NormalizeText = Trim(s)
End Function
```

Projev: přebytečné/prázdné položky, dvojité oddělovače (`" - - "`), názvy začínající/
končící oddělovačem, „bez_nazvu" složky.

---

## `If ch >= " "` NEfiltruje řídící znaky spolehlivě — LS řetězce porovnává dle locale collation

Oblíbený trik „nech jen tisknutelné znaky" přes `If ch >= " "` **v LotusScriptu
nefunguje podle kódu znaku**. Relační porovnání řetězců (`>=`, `<`, `>`) používá
**locale collation** (ICU), ne code point. V české kolaci `-` (pomlčka) a další
interpunkce řadí **PŘED mezeru**, takže `"-" >= " "` vyjde **False** a znak se
zahodí.

```lotusscript
' ŠPATNĚ: zahodí pomlčky, tečky a další interpunkci (řadí před mezeru)
For i = 1 To Len(raw)
    ch = Mid(raw, i, 1)
    If ch >= " " Then res = res & ch   ' "-" >= " " je False! -> "podzim-zima" -> "podzimzima"
Next

' SPRÁVNĚ: explicitně jen známé řídící znaky, zbytek zachovej
For i = 1 To Len(raw)
    ch = Mid(raw, i, 1)
    If ch = Chr(9) Or ch = Chr(10) Or ch = Chr(13) Then ch = " "
    res = res & ch
Next
```

**Projev:** názvy složek/souborů sanitizované tímhle filtrem přijdou o pomlčky —
`" - "` se scvrkne na `" "`, `"2022-2023"` na `"20222023"`.

Pro číselné porovnání kódu znaku použij `Uni(ch)` (Unicode code point), NE relační
operátor: `If Uni(ch) >= 32 Then ...`.

---

## NotesDXLExporter.Export(doc) na dokumentu s velkými přílohami → hang (serializuje base64)

`exporter.Export(doc)` defaultně vloží VŠECHNY přílohy (`$FILE` položky) do DXL
jako base64. U dokumentu s GB příloh (viz „nafouklý" dokument 2,5 GB) běží export
minuty a sežere disk/paměť.

```lotusscript
' ŠPATNĚ: serializuje i binárku příloh -> běží věčně na velkém dokumentu
Dim exporter As NotesDXLExporter
Set exporter = session.CreateDXLExporter()
Dim dxl As String
dxl = exporter.Export(doc)   ' HANG na 2,5GB dokumentu

' SPRÁVNĚ: zahoď binární $FILE bloby, pozice+jméno přílohy zůstane
Dim exporter As NotesDXLExporter
Set exporter = session.CreateDXLExporter()
Dim omit(0) As String
omit(0) = "$FILE"
exporter.OmitItemNames = omit          ' Array of String (přes Variant)
dxl = exporter.Export(doc)             ' rychlé, malé DXL
```

**Klíčový rozdíl dvou property (dle IBM docs):**

| Property | Co udělá |
|----------|----------|
| `OmitItemNames = "$FILE"` | zahodí jen `<item name='$FILE'>` bloby; `<attachmentref name='..'/>` v richtextu **ZŮSTANE** (pozice + jméno přílohy) |
| `OmitRichtextAttachments = True` | zahodí `$FILE` **I** `<attachmentref>` → ztratíš pozici i jméno přílohy |

Když potřebuješ mapovat přílohu na místo v textu (který nadpis), použij
**`OmitItemNames`**, NE `OmitRichtextAttachments`. `attachmentref` je součást
richtext položky, ne samostatný `<item>`, takže ho `OmitItemNames` nesmaže.

Pozn.: `rtItem.EmbeddedObjects` navíc nevrací přílohy v zaručeném **pozičním**
pořadí — poziční mapování ber z DXL `<attachmentref>`, ne z `EmbeddedObjects`.

---

---

## MB_* / PICKLIST_* konstanty nejsou vestavěné — bez %Include "lsconst.lss" selže kompilace

`MB_ICONSTOP`, `MB_ICONINFORMATION`, `PICKLIST_NAMES` apod. NEJSOU vestavěné
konstanty LotusScriptu (na rozdíl od `EMBED_ATTACHMENT`, `DATABASE` nebo
`LSI_THREAD_*` z LSPRVAL.LSS, který se vkládá automaticky). Jsou definované
v `LSCONST.LSS` a vyžadují `%Include` — **ALE záleží kde skript běží**:
v (Globals)/(Options) view, formuláře či agenta Designer konstanty lsconst
poskytuje implicitně (bez include), zatímco v **Script Library** chybí a
bez `%Include "lsconst.lss"` kompilace hlásí "Variable not declared:
MB_ICONSTOP". Zdroj: "Constants in LotusScript" → "use the %Include
directive"; auto-include chování v design elementech pozorováno za běhu.

```lotusscript
' ŠPATNĚ:
Option Public
Option Declare
Sub Initialize
    Messagebox "text", MB_ICONSTOP, "Chyba"      ' Variable not declared!
    picklist = ws.PickListStrings( PICKLIST_NAMES )  ' taky selže
End Sub

' SPRÁVNĚ:
%Include "lsconst.lss"   ' MB_*, PICKLIST_*, PROMPT_*... (LOTUS OBJECTS > Constants in LotusScript)
Option Public
Option Declare
Sub Initialize
    Messagebox "text", MB_ICONSTOP, "Chyba"      ' OK
End Sub
```

---

---

## Const LSI_THREAD_* v Designeru → "Name previously declared"

`LSI_THREAD_PROC` a `LSI_THREAD_MODULE` (konstanty pro `GetThreadInfo`) jsou
definované v `LSPRVAL.LSS`, který Designer **vkládá automaticky** (KB:
"Constants in LotusScript" → "Constants defined in LSPRVAL.LSS ... which is
automatically included"). Vlastní `Const LSI_THREAD_PROC = 1` v Script
Library / agentu tedy skončí chybou `Name previously declared: LSI_THREAD_PROC`.

Šablona `template.lss` je píše kvůli samostatným .lss skriptům mimo Designer —
při vkládání do Script Library je VYPUSŤ (na rozdíl od `%Include "lsconst.lss"`,
který naopak chybět nesmí).

```lotusscript
' ŠPATNĚ (v Script Library / agentu):
Const LSI_THREAD_PROC = 1       ' Name previously declared!
Const LSI_THREAD_MODULE = 10    ' Name previously declared!

' SPRÁVNĚ:
' LSI_THREAD_* z LSPRVAL.LSS — automaticky, jen použij:
procName = GetThreadInfo(LSI_THREAD_PROC)
```

---

---

## `Option ...` v (Declarations) → kompilační chyba; patří do (Options)

Duplicita `Option Public/Declare` není jediná past — stejně tak **umístění**.
Když se hotový `.lss` vkládá do design elementu „celý najednou“, `Option`
skončí v (Declarations) a překlad spadne. `Option*` (a `Use`, a `%Include`)
patří VÝHRADNĚ do (Options); (Declarations) je na `Const`, `Dim` globálních
proměnných a vlastní `Sub`/`Function`.

Praktický důsledek pro dodávaný `.lss`: buď `Option` v těle souboru vůbec
nemít a v hlavičce popsat instalaci ve dvou krocích ((Options) zvlášť,
(Declarations) zvlášť), nebo počítat s tím, že to uživatel ručně rozdělí.

```lotusscript
' ŠPATNĚ: celý soubor včetně Option vložený do (Globals) → (Declarations)
Option Declare              ' kompilační chyba - Option v (Declarations)
Const POLE$ = "majitel"
Sub Neco()
End Sub

' SPRÁVNĚ:
' (Globals) → (Options):
Option Declare
' (Globals) → (Declarations):
Const POLE$ = "majitel"
Sub Neco()
End Sub
```

---

## ComputeWithForm přepočítá VŠECHNA computed pole formuláře

`doc.ComputeWithForm(dodatatypes, raiseerror)` spustí value/translation/
validation formule celého formuláře, ne jen toho, co jsi změnil. U formulářů
s `@DbLookup` do číselníků to znamená, že se hodnoty přetáhnou z dnešního
stavu číselníku. Většinou je to žádoucí (proto se to volá), ale skript pak
nesmí v hlavičce tvrdit „mění výhradně jedno pole“.

První parametr (`dodatatypes`) se podle IBM dokumentace **ignoruje**;
`raiseerror=False` znamená „vrať False místo vyhození chyby“.

```lotusscript
' Rozhodni se vědomě, co při neúspěšné validaci:
validaceOk = doc.ComputeWithForm( True, False )
Call doc.Save( True, True )        ' uložit i tak (parita se starým kódem)
' ...nebo...
If doc.ComputeWithForm( True, False ) Then Call doc.Save( True, True )
```

---

## Změna „vlastníka“ nestačí, když práva jedou přes jiné pole

Klasika ve VEBA DB: Authors pole je `computed` a počítá se z **jiné**
položky, např.

```
documentAuthors := @Unique("LocalDomainDesigners":"LocalDomainAdmins":"[admin]":ZapisPovolen)
```

Skript, který změní jen `majitelMeridla`, tedy práva zápisu nepředá —
`ComputeWithForm` sice `documentAuthors` přepočítá, ale ze starého
`ZapisPovolen`. Před psaním hromadné změny osoby si vždy vygrepuj, co je
na formuláři/subformu `type='authors'` a z čeho se to počítá.

Pozor i na stav workflow: pokud je právo zápisu **dočasné** (nastaví se při
odeslání, maže se při převzetí), přenášej ho jen v tom stavu — jinak ho
u už převzatých dokumentů omylem obnovíš.

---
