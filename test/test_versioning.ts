/**
 * Versioning slice test — header detection, verdicts and notice content.
 *
 * 1. The header block is found in a scaffolded agent (VERZE + CHANGELOG).
 * 2. A file without the header is reported as "missing".
 * 3. A first sighting (no baseline) is accepted silently — otherwise every
 *    agent would be nudged on the first edit of a session.
 * 4. An identical header after an edit is "unchanged" (the nudge case).
 * 5. Any change inside the block (bump OR changelog line) counts as "ok".
 * 6. Both notices carry a paste-ready template and the reference path, so the
 *    agent never has to guess the format or hunt for the rules.
 *
 * Run: npx tsx test/test_versioning.ts
 */

import {
  evaluateVersioning,
  extractVersionBlock,
  suggestNextVersion,
} from "../src/slices/versioning/header.js";
import { missingNotice, unchangedNotice, VERSIONING_REFERENCE } from "../src/slices/versioning/messages.js";

let failures = 0;

function check(label: string, ok: boolean): void {
  if (ok) {
    console.log(`${label}: PASS`);
  } else {
    failures++;
    console.log(`${label}: FAIL`);
  }
}

const WITH_HEADER = `Option Public
Option Declare

'**********************************************************************
' NÁZEV: ag_test.lss
' VERZE: 1.4
' CHANGELOG:
'   1.4 (2026-10-23) - + něco nového
'   1.3 (2026-10-22) - oprava
'**********************************************************************

Sub Initialize
End Sub
`;

const WITHOUT_HEADER = `Option Public
Option Declare

Sub Initialize
End Sub
`;

// 1. extraction
const block = extractVersionBlock(WITH_HEADER);
check("1. version parsed from header", block.version === "1.4");
check(
  "1b. changelog body captured",
  block.changelog !== null && block.changelog.includes("1.3 (2026-10-22)")
);

// 2. missing header
const empty = extractVersionBlock(WITHOUT_HEADER);
check("2. missing header -> verdict missing", evaluateVersioning(empty, undefined).kind === "missing");

// 3. first sighting without baseline
check("3. first sighting is ok (no nag)", evaluateVersioning(block, undefined).kind === "ok");

// 4. unchanged header
const verdictUnchanged = evaluateVersioning(block, block.raw);
check(
  "4. identical header -> unchanged + version",
  verdictUnchanged.kind === "unchanged" && verdictUnchanged.version === "1.4"
);

// 5. a bump or a new changelog line counts as changed
const bumped = extractVersionBlock(WITH_HEADER.replace("VERZE: 1.4", "VERZE: 1.5"));
check("5. bumped version -> ok", evaluateVersioning(bumped, block.raw).kind === "ok");
const appended = extractVersionBlock(
  WITH_HEADER.replace("'   1.3 (2026-10-22)", "'   1.5 (2026-10-23) - nová věta\n'   1.3 (2026-10-22)")
);
check("5b. new changelog line -> ok", evaluateVersioning(appended, block.raw).kind === "ok");

// 6. notices carry the template + reference
const miss = missingNotice("ag_test.lss");
check("6. missing notice has VERZE template", miss.includes("' VERZE: 1.0") && miss.includes("' CHANGELOG:"));
check("6b. missing notice links the reference", miss.includes(VERSIONING_REFERENCE));
const unchanged = unchangedNotice("ag_test.lss", "1.4");
check("6c. unchanged notice suggests next version", unchanged.includes("' VERZE: 1.5"));
check("6d. unchanged notice links the reference", unchanged.includes(VERSIONING_REFERENCE));

// 7. suggestion keeps the major, bumps the minor
check("7. suggest 1.8 -> 1.9", suggestNextVersion("1.8") === "1.9");
check("7b. suggest 0.1 -> 0.2", suggestNextVersion("0.1") === "0.2");

if (failures > 0) {
  console.log(`\n${failures} versioning test(s) FAILED`);
  process.exit(1);
}
console.log("\n=== All versioning tests passed ===");
