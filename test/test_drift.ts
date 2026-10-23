/**
 * Drift slice test — the four signals, comment immunity, and the gates that
 * keep the notice quiet when there is nothing to reuse.
 *
 * 1. HTTP COM / endpoint literal / local error report / notes:// are detected.
 * 2. Comment lines never count (documentation is not drift).
 * 3. A `lib_*` file is the library itself -> never drift.
 * 4. Orchestrator gate: an agent with drift in a folder WITHOUT `lib_*.lss`
 *    stays silent; the same file in a folder WITH a library is reported once.
 *
 * Run: npx tsx test/test_drift.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkDrift } from "../src/slices/drift/index.js";
import { findDrift, isLibraryFile } from "../src/slices/drift/signals.js";
import { createPluginState } from "../src/shared/state.js";

let failures = 0;

function check(label: string, ok: boolean): void {
  if (ok) console.log(`${label}: PASS`);
  else {
    failures++;
    console.log(`${label}: FAIL`);
  }
}

const ids = (text: string) => findDrift(text).map((h) => h.signal.id);

// 1. each signal
check(
  "1. HTTP COM detected",
  ids('Set http = CreateObject("WinHttp.WinHttpRequest.5.1")').includes("http-com")
);
check(
  "1b. MSXML fallback detected",
  ids('Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")').includes("http-com")
);
check(
  "1c. endpoint literal detected",
  ids('Const EP = "/api/v1/informix/tables/h04zmeny-bl"').includes("endpoint")
);
check(
  "1d. local error report detected",
  ids("Sub PosliChybovyReport(text As String)\nEnd Sub").includes("error-report")
);
check(
  "1e. notes:// builder detected",
  ids('url = "notes://" & server & "/__" & repid').includes("notes-url")
);

// 2. comments are ignored
check(
  "2. commented-out drift is not drift",
  ids("' CreateObject(\"WinHttp.WinHttpRequest.5.1\")").length === 0
);

// 3. library file detection
check("3. lib_ file is a library", isLibraryFile("D:/x/lib_vebaapi.lss"));
check("3b. agent file is not a library", !isLibraryFile("D:/x/ag_prehled.lss"));

// 4. orchestrator gates
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-"));
const agentPath = path.join(dir, "ag_test.lss");
const body = 'Option Public\nSub Initialize\n\tSet h = CreateObject("WinHttp.WinHttpRequest.5.1")\nEnd Sub\n';
fs.writeFileSync(agentPath, body);

const state = createPluginState();
state.beginRun();
check("4. no library in folder -> silent (first occurrence allowed)", checkDrift(state, agentPath) === null);

fs.writeFileSync(path.join(dir, "lib_vebaapi.lss"), "Option Public\n");
check("4b. library present -> notice", (checkDrift(state, agentPath) ?? "").includes("Library drift"));
check("4c. once per run -> silent again", checkDrift(state, agentPath) === null);

state.beginRun();
fs.writeFileSync(path.join(dir, "lib_vebaapi.lss"), "Option Public\n' changed\n");
check("4d. new run -> reports again", (checkDrift(state, agentPath) ?? "").includes("Library drift"));

const libPath = path.join(dir, "lib_other.lss");
fs.writeFileSync(libPath, body);
state.beginRun();
check("4e. the library itself is never drift", checkDrift(state, libPath) === null);

fs.rmSync(dir, { recursive: true, force: true });

if (failures > 0) {
  console.log(`\n${failures} drift test(s) FAILED`);
  process.exit(1);
}
console.log("\n=== All drift tests passed ===");
