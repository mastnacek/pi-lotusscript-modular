/**
 * Diagnostics text handling for the automation lane: error-code extraction and
 * the "does this help page say anything?" filter.
 *
 * The filter exists because a help page that is only its own heading used to be
 * attached verbatim, printing `📚 Help for LS-0xd028:` followed by nothing —
 * which reads as a broken feature instead of missing upstream catalogue data
 * (notes-sys SPAI-006: EN/CZ pages exist for FORMULA-0x… only).
 */

import { extractLspErrorCodes, hasExplainBody } from "../src/slices/lsp/index.js";

let failures = 0;

function check(label: string, ok: boolean, detail?: unknown): void {
  console.log(
    `${ok ? "PASS" : "FAIL"} — ${label}${ok || detail === undefined ? "" : ` :: ${JSON.stringify(detail)}`}`
  );
  if (!ok) failures++;
}

// 1. Code extraction: normalized, distinct, capped.
const diagText = [
  "Checked C:\\x\\a.lss as a whole script (LotusScript)",
  "  ERROR C:\\x\\a.lss:21:1 [LS-0xD028] Not a member: NOSUCHMETHOD",
  "  ERROR C:\\x\\a.lss:23:1 [LS-0xD001] Unexpected: END SUB; Expected: NEXT",
  "  WARN C:\\x\\a.lss:1:1 [ls-0xd028] duplicate mention of the same code",
].join("\n");

const codes = extractLspErrorCodes(diagText);
check("extracts codes in encounter order", codes[0] === "LS-0xd028" && codes[1] === "LS-0xd001", codes);
check("deduplicates by normalized code", codes.length === 2, codes);
check("normalizes prefix upper + hex lower", codes.every((c) => /^(LS|FORMULA)-0x[0-9a-f]{4}$/.test(c)), codes);

const many = extractLspErrorCodes(
  "[LS-0xd001] [LS-0xd002] [LS-0xd003] [LS-0xd004] [LS-0xd005]"
);
check("caps the lookup at three codes", many.length === 3, many);
check("returns nothing for a clean text", extractLspErrorCodes("✔ Clean: no compiler diagnostics").length === 0);
check(
  "extracts FORMULA codes",
  extractLspErrorCodes("ERROR x.fl:1:1 [FORMULA-0x051B] Unknown @Function")[0] === "FORMULA-0x051b"
);

// 2. Help-page filter: a heading-only page carries no information.
check(
  "rejects the oracle's LS-* stub (heading only)",
  hasExplainBody("# Diagnostic Code [LS-0xd028]") === false
);
check(
  "rejects a stub with trailing blank lines",
  hasExplainBody("# Diagnostic Code [LS-0xd001]\n\n\n") === false
);
check("rejects an empty page", hasExplainBody("") === false);
check(
  "accepts a real FORMULA page",
  hasExplainBody(
    [
      "# Diagnostic Error [FORMULA-0x051b]",
      "",
      "- **English**: Unknown @Function",
      "- **Czech**: Neznámá @funkce",
      "- **Numeric Code**: 1307",
    ].join("\n")
  ) === true
);
check(
  "accepts a page whose heading is followed by prose",
  hasExplainBody("# Diagnostic Code [LS-0xd028]\n\nMember does not exist on the object.") === true
);
check(
  "accepts a page with a nested heading and a body",
  hasExplainBody("## Example\n\n```lotusscript\nSet db = s.CurrentDatabase\n```") === true
);

if (failures > 0) {
  console.log(`\n${failures} diagnostics-text test(s) failed`);
  process.exit(1);
}
console.log("\n=== All diagnostics-text tests passed ===");
