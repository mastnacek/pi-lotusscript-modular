/**
 * LotusScript code templates & skeletons for IBM Notes/Domino 9.0.1.
 * Complies with strict coding standards:
 * - Option Public & Option Declare in options/globals
 * - %Include "lsconst.lss" for MB_*, PICKLIST_* constants
 * - Structured error handling (On Error GoTo Catch with Err, Error$, Erl, GetThreadInfo(1))
 * - Mandatory Czech purpose comments (' Účel: ...)
 * - Synthetic modular headers for modular files (@script-member-of, @procedure, @parent-declarations)
 */

export interface ScaffoldOptions {
  name: string;
  author?: string;
  purpose?: string;
  agentName?: string; // For modular procedures
  returnType?: string; // For functions
  params?: string; // Procedure parameters
}

export function formatCurrentDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Standalone Agent Skeleton (.lss)
 */
export function agentTemplate(options: ScaffoldOptions): string {
  const name = options.name.replace(/\.lss$/i, "");
  const author = options.author || "AI Developer";
  const purpose = options.purpose || "Popis účelu agenta.";
  const date = formatCurrentDate();

  return `' POZOR: Option Public/Declare nepatří do jednotlivých eventů, pokud už jsou v (Globals) -> (Options)!
Option Public
Option Declare
%Include "lsconst.lss"

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
    On Error GoTo Catch

    Set g_session = New NotesSession
    Set g_db = g_session.CurrentDatabase

    Print "Agent [${name}] zahájen: " & g_db.Title

    ' Hlavní aplikační logika
    Call ProcessData()

    Print "Agent [${name}] úspěšně dokončen."
    Exit Sub

Catch:
    Dim errMsg As String
    errMsg = "CHYBA v agentu [${name}] (Sub Initialize, řádek " & CStr(Erl) & "): " & CStr(Err) & " - " & Error$
    Print errMsg
    ' V produkci lze doplnit odeslání notifikačního e-mailu správci
    Exit Sub
End Sub

' Účel: Výkonná pracovní procedura pro zpracování dokumentů.
Sub ProcessData()
    On Error GoTo Catch

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

Catch:
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
  const date = formatCurrentDate();

  return `Option Public
Option Declare
%Include "lsconst.lss"

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
    On Error GoTo Catch

    ${name}_FormatString = Trim$(inputVal)
    Exit Function

Catch:
    Error Err, "${name}_FormatString (řádek " & CStr(Erl) & "): " & Error$
End Function
`;
}

/**
 * Modular Subroutine or Function file (.lss)
 */
export function procedureTemplate(options: ScaffoldOptions & { isFunction?: boolean }): string {
  const procName = options.name.replace(/^(sub_|func_)/i, "").replace(/\.lss$/i, "");
  const agentName = options.agentName || "MainAgent";
  const isFunc = options.isFunction ?? false;
  const returnType = options.returnType || "String";
  const params = options.params || "";
  const purpose = options.purpose || (isFunc ? `Pomocná funkce pro výpočet hodnoty ${procName}.` : `Procedura pro zpracování ${procName}.`);

  if (isFunc) {
    return `' @script-member-of: ${agentName}
' @procedure: ${procName}
' @parent-declarations: 01_declarations.lss
' Účel: ${purpose}
Function ${procName}(${params}) As ${returnType}
    On Error GoTo Catch

    ' Implementace
    ${procName} = ""
    Exit Function

Catch:
    Error Err, "${procName} (řádek " & CStr(Erl) & "): " & Error$
End Function
`;
  }

  return `' @script-member-of: ${agentName}
' @procedure: ${procName}
' @parent-declarations: 01_declarations.lss
' Účel: ${purpose}
Sub ${procName}(${params})
    On Error GoTo Catch

    ' Implementace

    Exit Sub

Catch:
    Error Err, "${procName} (řádek " & CStr(Erl) & "): " & Error$
End Sub
`;
}

/**
 * Complete Modular Directory Skeleton
 */
export interface ModularFolderFiles {
  "00_options.lss": string;
  "01_declarations.lss": string;
  "sub_Process.lss": string;
  "99_initialize.lss": string;
  "manifest.json": string;
  "main.lss": string;
}

export function modularFolderTemplate(agentName: string, purpose?: string): ModularFolderFiles {
  const cleanAgent = agentName.replace(/[\\/:\*\?"<>\|]/g, "_").replace(/\.lss$/i, "");
  const desc = purpose || `Modulární agent ${cleanAgent}`;
  const now = new Date().toISOString();

  const optionsLss = `Option Public
Option Declare
%Include "lsconst.lss"
`;

  const declarationsLss = `' @script-member-of: ${cleanAgent}
' Globální proměnné a sdílené instance
Dim g_session As NotesSession
Dim g_db As NotesDatabase
`;

  const subProcessLss = `' @script-member-of: ${cleanAgent}
' @procedure: Process
' @parent-declarations: 01_declarations.lss
' Účel: Zpracování hlavní logiky agenta ${cleanAgent}.
Sub Process()
    On Error GoTo Catch

    Print "Zpracovávám logiku v agentu ${cleanAgent}..."

    Exit Sub

Catch:
    Error Err, "Process (řádek " & CStr(Erl) & "): " & Error$
End Sub
`;

  const initializeLss = `' @script-member-of: ${cleanAgent}
' @procedure: Initialize
' @parent-declarations: 01_declarations.lss
' Účel: Inicializace runtime prostředí agenta a spuštění procesů.
Sub Initialize
    On Error GoTo Catch

    Set g_session = New NotesSession
    Set g_db = g_session.CurrentDatabase

    Print "Start agenta ${cleanAgent}: " & g_db.Title

    Call Process()

    Print "Konec agenta ${cleanAgent}."
    Exit Sub

Catch:
    Print "Kritická chyba v Sub Initialize: " & CStr(Err) & " - " & Error$ & " (řádek " & CStr(Erl) & ")"
    Exit Sub
End Sub
`;

  const compilationOrder = [
    "00_options.lss",
    "01_declarations.lss",
    "sub_Process.lss",
    "99_initialize.lss",
  ];

  const manifestJson = JSON.stringify(
    {
      formatVersion: "1.0",
      agentName: cleanAgent,
      description: desc,
      decompileTimestamp: now,
      compilationOrder,
    },
    null,
    2
  );

  const mainLss = `' %pi-import "00_options.lss"
' %pi-import "01_declarations.lss"
' %pi-import "sub_Process.lss"
' %pi-import "99_initialize.lss"
`;

  return {
    "00_options.lss": optionsLss,
    "01_declarations.lss": declarationsLss,
    "sub_Process.lss": subProcessLss,
    "99_initialize.lss": initializeLss,
    "manifest.json": manifestJson,
    "main.lss": mainLss,
  };
}
