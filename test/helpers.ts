/**
 * Shared fixtures for the modular workflow test phases. Every phase file stays
 * under the plugin's own per-file line limit, so cross-phase state (temp dir,
 * monolith source, theme stub, modular-root factory) lives here.
 */

import fs from "node:fs";
import path from "node:path";

/** Single temp workspace shared by all phases; recreated by the runner. */
export const TEST_DIR = path.resolve("./temp_modular_test");

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

/** Canonical sample monolith used by decompile/compile/ephemeral phases. */
export const MONOLITH_CODE = `%REM
    Agent: SampleAgent
%END REM
Option Public
Option Declare

Dim g_session As NotesSession
Dim g_db As NotesDatabase

Sub Initialize
    Set g_session = New NotesSession
    Set g_db = g_session.CurrentDatabase
    Call ProcessNotes()
End Sub

Sub ProcessNotes()
    Dim doc As NotesDocument
    Print "Processing..."
End Sub

Function GetStatus() As String
    GetStatus = "OK"
End Function
`;

/** Minimal Theme stub for TUI component rendering tests (structural any —
 * full Theme surface is irrelevant to rendering assertions). */
export const MOCK_THEME: any = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
};

/** Creates a modular agent folder with manifest.json + the given files. */
export function makeRoot(name: string, files: Record<string, string>): string {
  const dir = path.join(TEST_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "main.lss"), "' main\n", "utf-8");
  for (const [file, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, file), body, "utf-8");
  }
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      {
        formatVersion: "1.0",
        agentName: name,
        decompileTimestamp: new Date().toISOString(),
        compilationOrder: ["00_options.lss", "01_declarations.lss", ...Object.keys(files).filter((f) => f !== "00_options.lss" && f !== "01_declarations.lss")],
      },
      null,
      2
    ),
    "utf-8"
  );
  return dir;
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
