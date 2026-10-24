/**
 * LotusScript code templates & skeletons for IBM Notes/Domino 9.0.1.
 * Fallback skeletons, used only when the shipped template.lss is unreadable.
 * They mirror its conventions:
 * - Option Public & Option Declare in options/globals
 * - No %Include "lsconst.lss" (it pulls in LSPRVAL.LSS, whose LSI_THREAD_*
 *   constants collide — see template.lss and gotcha #37)
 * - Structured error handling (On Error GoTo ErrorHandler with Err, Error$, Erl)
 * - Mandatory Czech purpose comments (' Účel: ...)
 */

export interface ScaffoldOptions {
  name: string;
  author?: string;
  purpose?: string;
  returnType?: string; // For functions
  /** Fixed YYYY-MM-DD; omit to use today. Set it to make scaffolds byte-reproducible. */
  date?: string;
}

export function formatCurrentDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Fills the template.lss shipped inside the plugin with header values.
 * Pure: no filesystem access, so the same inputs always produce the same
 * output.
 */
export function fillTemplate(raw: string, options: ScaffoldOptions & { libraryVersion?: string }): string {
  const date = options.date || formatCurrentDate();
  let out = raw
    // Replace the bare placeholder — the template supplies the ".lss" suffix
    // itself, so the NÁZEV header keeps it (the fallbacks write "Name.lss").
    .replace("<nazev-souboru>", options.name.replace(/\.lss$/i, ""))
    .replace("<Stručný popis>", options.purpose || "Stručný popis účelu skriptu.")
    .replace("<Jméno>", options.author || "AI Developer")
    .replaceAll("<YYYY-MM-DD>", date);

  if (options.libraryVersion) {
    out = out.replace(
      /^Option Declare.*$/m,
      (m) => `${m}\n\n' (Declarations) - Verze knihovny\nPublic Const LIB_VERSION = "${options.libraryVersion}"`,
    );
  }
  return out;
}

/**
 * Turns a whole-file scaffold into the variant you paste into Designer.
 *
 * Two edits, both required by the same fact — Designer auto-includes
 * `LSPRVAL.LSS`, which already declares `LSI_THREAD_*`:
 * 1. the `Const LSI_THREAD_*` block and its warning comments are removed
 *    (keeping them is `Name previously declared`, gotcha #37);
 * 2. every `GetThreadInfo(LSI_THREAD_*)` call is inlined with the same
 *    numeric index, because the whole-file checker does not model Designer's
 *    auto-include and would report `Variable not declared`.
 *
 * Pure: same input, same output.
 */
export function toDesignerVariant(raw: string): string {
  const withoutBlock = raw
    .replace(/^' GetThreadInfo indexy[\s\S]*?^Const LSI_THREAD_CALLMODULE = 12[^\n]*\n?/m, "")
    .replace(/\n{3,}/g, "\n\n");

  const inlineIndexes = {
    LSI_THREAD_PROC: "1",
    LSI_THREAD_MODULE: "10",
    LSI_THREAD_CALLPROC: "11",
    LSI_THREAD_CALLMODULE: "12",
  } as const;
  return Object.entries(inlineIndexes).reduce(
    (out, [name, value]) => out.replaceAll(`GetThreadInfo(${name})`, `GetThreadInfo(${value})`),
    withoutBlock,
  );
}

/**
 * Standalone Agent Skeleton (.lss)
 */
export function agentTemplate(options: ScaffoldOptions): string {
  const name = options.name.replace(/\.lss$/i, "");
  const author = options.author || "AI Developer";
  const purpose = options.purpose || "Popis účelu agenta.";
  const date = options.date || formatCurrentDate();

  return `' POZOR: Option Public/Declare nepatří do jednotlivých eventů, pokud už jsou v (Globals) -> (Options)!
Option Public
Option Declare

'**********************************************************************
' NÁZEV: ${name}.lss
' ÚČEL: ${purpose}
' AUTOR: ${author}
' VYTVOŘENO: ${date}
'
' VERZE: 0.1
' CHANGELOG:
'   0.1 (${date}) - Základní implementace
'**********************************************************************

' Globální deklarace
Dim g_session As NotesSession
Dim g_db As NotesDatabase

' Účel: Vstupní bod běhu agenta, inicializace prostředí a zpracování.
Sub Initialize
    On Error GoTo ErrorHandler

    Set g_session = New NotesSession
    Set g_db = g_session.CurrentDatabase

    Print "Agent [${name}] zahájen: " & g_db.Title

    ' Hlavní aplikační logika
    Call ProcessData()

    Print "Agent [${name}] úspěšně dokončen."
    Exit Sub

ErrorHandler:
    Dim errMsg As String
    errMsg = "CHYBA v agentu [${name}] (Sub Initialize, řádek " & CStr(Erl) & "): " & CStr(Err) & " - " & Error$
    Print errMsg
    ' V produkci lze doplnit odeslání notifikačního e-mailu správci
    Exit Sub
End Sub

' Účel: Výkonná pracovní procedura pro zpracování dokumentů.
Sub ProcessData()
    On Error GoTo ErrorHandler

    ' Příklad: procházení dokumentů v pohledu
    Dim view As NotesView
    Dim doc As NotesDocument
    Dim nextDoc As NotesDocument

    ' Set view = g_db.GetView("MainView")
    ' If Not view Is Nothing Then
    '     Set doc = view.GetFirstDocument()
    '     While Not doc Is Nothing
    '         Set nextDoc = view.GetNextDocument(doc)
    '         ' Zpracování doc
    '         Set doc = nextDoc
    '     Wend
    ' End If

    Exit Sub

ErrorHandler:
    Error Err, "ProcessData (řádek " & CStr(Erl) & "): " & Error$
End Sub
`;
}

/**
 * Script Library Skeleton (.lss)
 */
export function libraryTemplate(options: ScaffoldOptions): string {
  const name = options.name.replace(/\.lss$/i, "");
  const author = options.author || "AI Developer";
  const purpose = options.purpose || "Knihovna sdílených funkcí.";
  const date = options.date || formatCurrentDate();

  return `Option Public
Option Declare

'**********************************************************************
' KNIHOVNA: ${name}.lss
' ÚČEL: ${purpose}
' AUTOR: ${author}
' VYTVOŘENO: ${date}
'
' VERZE: 0.1
' CHANGELOG:
'   0.1 (${date}) - Výchozí struktura knihovny
'**********************************************************************

' (Declarations) - Veřejné konstanty a typy
Public Const LIB_VERSION = "0.1"

' Účel: Ukázková veřejná funkce vracející normalizovaný text.
Public Function ${name}_FormatString(ByVal inputVal As String) As String
    On Error GoTo ErrorHandler

    ${name}_FormatString = Trim$(inputVal)
    Exit Function

ErrorHandler:
    Error Err, "${name}_FormatString (řádek " & CStr(Erl) & "): " & Error$
End Function
`;
}

