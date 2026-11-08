/**
 * Phase: DXL import oracle — the empirical check lane for DXL sources.
 *
 * The compiler oracle refuses `.dxl` by name, so `checkLotusScriptDiagnostics`
 * routes DXL sources to `checkDxlImport` (dxl-check.ts), which runs
 * `dxl_check.py` — the headless LS lane importing the file into the sandbox
 * DB with NotesDXLImporter. This phase unit-tests the JSON→verdict mapping
 * and proves the real oracle end to end (accepts a valid document, rejects
 * broken XML, no `.dxl` extension required).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkLotusScriptDiagnostics } from "../../src/slices/lsp/lsp-check.js";
import { classifyOracleOutput } from "../../src/slices/lsp/dxl-check.js";

function assert(label: string, ok: boolean, detail = ""): void {
  console.log(`${label}: ${ok ? "PASS" : "FAIL"}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) throw new Error(label);
}

const GOOD_DXL =
  "<?xml version='1.0'?>\n" +
  "<!DOCTYPE document SYSTEM 'xmlschemas/domino_9_0_1.dtd'>\n" +
  "<document xmlns='http://www.lotus.com/dxl' version='9.0' form='T'>\n" +
  "<item name='R'><richtext><par>probe</par></richtext></item>\n" +
  "</document>\n";

const BROKEN_DXL =
  "<?xml version='1.0'?>\n" +
  "<form name='Broken' xmlns='http://www.lotus.com/dxl' version='9.0'>\n" +
  "<body><richtext><par>unterminated\n";

export async function phaseDxl(): Promise<void> {
  // 1. All-OK JSON → clean verdict.
  const allOk = classifyOracleOutput(
    JSON.stringify({
      ok: true,
      results: [{ file: "a.dxl", status: "OK", err: 0, errText: "", imported: "imported=1", items: "FORM,R" }],
    })
  );
  assert("1. all-OK oracle JSON maps to a clean verdict", allOk.ok && allOk.errorCount === 0);

  // 2. An ERR row is a hard error with the importer's own code in the text.
  const rejected = classifyOracleOutput(
    JSON.stringify({
      ok: false,
      results: [{ file: "b.txt", status: "ERR", err: 4522, errText: "DXL importer operation failed", imported: "imported=0" }],
    })
  );
  assert(
    "2. importer rejection maps to ok:false + err code in diagnostics",
    !rejected.ok && rejected.errorCount === 1 && /err 4522/.test(rejected.diagnostics)
  );

  // 3. Empty results are never a pass.
  const empty = classifyOracleOutput(JSON.stringify({ ok: true, results: [] }));
  assert("3. empty oracle results count as an error", !empty.ok && empty.errorCount === 1);

  // 4. Harness failure surfaces its own message.
  const harness = classifyOracleOutput(JSON.stringify({ ok: false, results: [], error: "runner failed rc=1" }));
  assert("4. oracle harness failure is reported as such", !harness.ok && /harness failed/.test(harness.diagnostics));

  // 5. Non-JSON output never reads as clean.
  const garbage = classifyOracleOutput("Traceback (most recent call last): ...");
  assert("5. non-JSON oracle output is an error, not clean", !garbage.ok && garbage.errorCount === 1);

  // 6. Routing: a .dxl path goes to the DXL lane without touching the MCP
  //    server — a missing file must come back as a plain file-not-found, not
  //    an LSP/MCP spawn error.
  const routed = await checkLotusScriptDiagnostics("D:/definitely/not/here.dxl");
  assert("6. .dxl paths route to the import lane (no MCP spawn)", /File not found/.test(routed.diagnostics));

  // 7-8. Real end-to-end oracle run: one valid + one broken DXL (the broken
  //      one carries a .txt extension — the manifest passes absolute paths).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dxl-oracle-"));
  try {
    const good = path.join(tmp, "check_good.dxl");
    fs.writeFileSync(good, GOOD_DXL, "utf-8");
    const bad = path.join(tmp, "check_broken.txt");
    fs.writeFileSync(bad, BROKEN_DXL, "utf-8");
    const goodRes = await checkLotusScriptDiagnostics(good);
    assert(
      "7. real oracle accepts a valid DXL document",
      goodRes.ok && goodRes.errorCount === 0 && /accepted by the importer/.test(goodRes.diagnostics),
      goodRes.diagnostics
    );
    const badRes = await checkLotusScriptDiagnostics(bad);
    assert(
      "8. real oracle rejects broken XML regardless of extension",
      !badRes.ok && badRes.errorCount === 1 && /rejected the file/.test(badRes.diagnostics),
      badRes.diagnostics
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
