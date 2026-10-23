/**
 * Shared fixtures for the whole-file workflow test phases. Every phase file
 * stays under the plugin's own per-file line limit, so cross-phase helpers
 * (temp dir, sample script, theme stub, mock ExtensionAPI) live here.
 */

import fs from "node:fs";
import path from "node:path";

/** Single temp workspace shared by all phases; recreated by the runner. */
export const TEST_DIR = path.resolve("./temp_ls_test");

export function ensureTestDir(): string {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
  return TEST_DIR;
}

export function cleanupTestDir(): void {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

/**
 * Canonical whole-file sample: header, declarations and two procedures, one
 * of which lacks a Czech purpose comment (so the linter has something to say).
 */
export const SAMPLE_LSS = `%REM
    Agent: SampleAgent
%END REM
Option Public
Option Declare

Dim g_session As NotesSession
Dim g_db As NotesDatabase

' Účel: inicializace agenta a spuštění zpracování
Sub Initialize
    Set g_session = New NotesSession
    Set g_db = g_session.CurrentDatabase
    Call ProcessNotes()
End Sub

Sub ProcessNotes()
    Dim doc As NotesDocument
    Print "Processing..."
End Sub

' Účel: vrátí stav zpracování
Function GetStatus() As String
    GetStatus = "OK"
End Function
`;

/** Writes a `.lss` file into the temp dir and returns its absolute path. */
export function writeLss(name: string, body: string = SAMPLE_LSS): string {
  const file = path.join(TEST_DIR, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf-8");
  return file;
}

/** Minimal Theme stub for TUI component rendering tests. */
export const MOCK_THEME: any = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
};

/** Minimal UI context stub (non-TUI: modals degrade, notify is recorded). */
export function mockCtx(hasUI = false): any {
  const notices: Array<{ text: string; level: string }> = [];
  return {
    cwd: TEST_DIR,
    hasUI,
    mode: hasUI ? "tui" : "json",
    notices,
    ui: {
      notify: (text: string, level: string) => notices.push({ text, level }),
      setStatus: () => {},
      setWidget: () => {},
      theme: MOCK_THEME,
    },
  };
}

/**
 * Mock ExtensionAPI that captures event handlers (and optionally one named
 * tool definition) so phases can drive the extension imperatively.
 */
export function mockPi(events: string[] = [], captureTool?: string): {
  pi: any;
  handlers: Record<string, any>;
  /** Live binding — resolves the captured tool at access time. */
  readonly tool: any;
} {
  const handlers: Record<string, any> = {};
  const captured = { tool: null as any };
  const pi: any = {
    on: (evt: string, handler: any) => {
      if (events.includes(evt)) handlers[evt] = handler;
    },
    registerCommand: () => {},
    registerTool: (def: any) => {
      if (captureTool && def.name === captureTool) captured.tool = def;
    },
  };
  return { pi, handlers, get tool() { return captured.tool; } };
}
