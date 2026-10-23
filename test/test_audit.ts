/**
 * Audit slice test — the "should this be a library?" analysis.
 *
 * 1. Procedure extraction finds name + line count; comments and formatting do
 *    not change the comparison key (otherwise duplicates would never match).
 * 2. A body repeated in TWO files is a candidate; the same body twice in ONE
 *    file is an overload, not drift.
 * 3. Procedures below MIN_LINES (8) are ignored — trivial wrappers are not
 *    library material.
 * 4. `saved` is lines × (files − 1); three copies therefore save twice as much
 *    as two.
 * 5. The report renders in both languages, is clean for a missing folder, and
 *    names the next step.
 *
 * Run: npx tsx test/test_audit.ts
 */

import { auditProject, extractProcedures, findDuplicates, renderAudit } from "../src/slices/audit/index.js";

let failures = 0;
function check(label: string, ok: boolean): void {
  if (ok) console.log(`${label}: PASS`);
  else {
    failures++;
    console.log(`${label}: FAIL`);
  }
}

/** 9-line procedure body: above the 8-line threshold, indented with real tabs. */
function body(extra = ""): string {
  return [
    "Sub VolejApi(x As String)",
    "\tDim http As Variant",
    "\tDim sUrl As String",
    '\tSet http = CreateObject("WinHttp.WinHttpRequest.5.1")',
    '\tsUrl = "https://example"',
    ...(extra ? [extra] : []),
    "\tPrint x",
    "\tPrint sUrl",
    '\tPrint "konec"',
    "End Sub",
  ].join("\n") + "\n";
}

const BODY_LINES = body().split("\n").length - 1; // trailing newline removed

// 1. extraction
const procs = extractProcedures(`Option Public\n${body()}\nSub Short()\nEnd Sub\n`);
check("1. two procedures found", procs.length === 2);
check("1b. name + line count", procs[0].name === "VolejApi" && procs[0].lines === BODY_LINES);
check("1c. body is above the threshold", BODY_LINES >= 9);

// 1d. comments do not change the comparison key
const plain = extractProcedures(body())[0].normalized;
const commented = extractProcedures(body("' jiny komentar"))[0].normalized;
check("1d. comment lines ignored in the key", plain === commented);

// 2. duplicate across two files, but not within one
const dup = findDuplicates([
  { file: "ag_a.lss", text: body() },
  { file: "ag_b.lss", text: body() },
]);
check("2. duplicate across files detected", dup.length === 1 && dup[0].files.length === 2);
check("2b. saved = lines x (files-1)", dup[0].saved === dup[0].lines);

check("2c. same file twice is not a duplicate", findDuplicates([{ file: "ag_a.lss", text: body() + body() }]).length === 0);

// 3. threshold
check(
  "3. trivial procedures ignored",
  findDuplicates([
    { file: "a.lss", text: "Sub X()\nEnd Sub\n" },
    { file: "b.lss", text: "Sub X()\nEnd Sub\n" },
  ]).length === 0
);

// 4. ranking
const ranked = findDuplicates([
  { file: "a.lss", text: body() },
  { file: "b.lss", text: body() },
  { file: "c.lss", text: body() },
]);
check("4. three files -> saved = 2 x lines", ranked[0]?.saved === ranked[0]?.lines * 2);

// 5. report
const empty = auditProject("D:/neexistuje");
check("5. missing folder -> clean empty report", empty.filesScanned === 0 && empty.groups.length === 0);
// The "next step" line belongs to a report that HAS candidates.
const csWithGroups = renderAudit({ ...empty, groups: dup, savedLines: dup[0].saved }, "cs");
check("5b. cs report names the next step", csWithGroups.includes("/ls scaffold library"));
check("5d. empty report says there is nothing to promote", renderAudit(empty, "cs").includes("není co povýšit"));
check("5c. en report renders with groups", renderAudit({ ...empty, groups: dup, savedLines: dup[0].saved }, "en").includes("Library audit"));

if (failures > 0) {
  console.log(`\n${failures} audit test(s) FAILED`);
  process.exit(1);
}
console.log("\n=== All audit tests passed ===");
