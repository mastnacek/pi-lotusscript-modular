/**
 * Classification of raw `lsp_diagnostics` text: clean vs. compiler diagnostics
 * vs. harness failure vs. "not a Domino script" refusals.
 *
 * The "not a Domino script" branch exists because notes-sys `domino-mcp.exe`
 * rejects files outside its compiler lanes BY NAME — a `.dxl` design export or
 * a `.form` handed to the check lane answers
 * `Error: X is not a Domino script (expected .lss, .lsa, .fl or .formula)`.
 * That is a domain refusal, not a compile verdict: without the branch the
 * unmarked text fell into the catch-all `errorCount = 1` and read as a
 * compilation failure.
 */

import { classifyDiagnostics } from "../src/slices/lsp/index.js";

let failures = 0;

function check(label: string, ok: boolean, detail?: unknown): void {
  console.log(
    `${ok ? "PASS" : "FAIL"} — ${label}${ok || detail === undefined ? "" : ` :: ${JSON.stringify(detail)}`}`
  );
  if (!ok) failures++;
}

// 1. Not-a-Domino-script refusal (.dxl submitted to the check lane): skipped,
//    ok-shaped, never an error count.
const dxlRefusal = "Error: D:\\x\\button.dxl is not a Domino script (expected .lss, .lsa, .fl or .formula)";
const dxl = classifyDiagnostics(dxlRefusal);
check(".dxl refusal is notApplicable", dxl.notApplicable, dxl);
check(".dxl refusal counts 0 errors", dxl.errorCount === 0 && dxl.warningCount === 0, dxl);
check(".dxl refusal is not harnessFailed", !dxl.harnessFailed && !dxl.isClean, dxl);

// 2. Same refusal in lowercase / different path shape.
const lowerRefusal = "error: c:/x/form.form is not a domino script (expected .lss, .lsa, .fl or .formula)";
check("refusal matches case-insensitively", classifyDiagnostics(lowerRefusal).notApplicable, lowerRefusal);

// 3. Compiler diagnostics still count by line-leading markers.
const compileDiag = [
  "  ERROR D:\\x\\a.lss:21:1 [LS-0xD028] Not a member: NOSUCHMETHOD",
  "  WARN D:\\x\\a.lss:1:1 [LS-0xD002] Something warnable",
].join("\n");
const compile = classifyDiagnostics(compileDiag);
check("ERROR/WARN markers count", compile.errorCount === 1 && compile.warningCount === 1, compile);
check("compiler diagnostics are not notApplicable", !compile.notApplicable, compile);

// 4. A message that merely MENTIONS a refusal mid-line must not trigger the
//    branch — wait, it must: the refusal text is the whole payload shape.
//    But a diagnostic whose message contains the phrase must still be counted
//    by its own marker, and the notApplicable branch wins only for refusal
//    payloads. Keep the contract explicit: marker counting is skipped for
//    notApplicable payloads, so a diagnostic quoting the phrase would be
//    masked — acceptable, because the phrase only originates from the strip.
const mentionsRefusal = "  ERROR D:\\x\\a.lss:9:1 [LS-0xD001] Unexpected: not a Domino script marker";
const mentions = classifyDiagnostics(mentionsRefusal);
check("marker-diagnostic mentioning the phrase still counts as 1 error", mentions.errorCount === 1, mentions);

// 5. Clean markers unchanged.
check("clean text is isClean", classifyDiagnostics("✔ Clean: no compiler diagnostics").isClean);
check("empty text is isClean", classifyDiagnostics("").isClean);

// 6. Harness failure unchanged — and a refusal is never harnessFailed.
//    (checkOnce zeroes the counts when harnessFailed; the classifier returns
//    the raw fallback count.)
const harness = "Error compiling file: worker crashed";
const h = classifyDiagnostics(harness);
check("harness failure detected", h.harnessFailed && h.errorCount === 1, h);

// 7. Unmarked non-empty text still falls back to errorCount = 1.
check("unmarked text counts as 1 error", classifyDiagnostics("something odd happened").errorCount === 1);

if (failures) {
  console.log(`\n${failures} classify test(s) failed`);
  process.exit(1);
}
console.log("\nAll classifyDiagnostics tests passed");
