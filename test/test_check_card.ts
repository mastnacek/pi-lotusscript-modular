/**
 * Bordered check card: pure row building, width-clipped painting and the
 * parse-back of a stored tool result.
 *
 * The card exists because the operator asked for a nicer verdict surface than
 * a flat report; the model keeps reading the unchanged plain text `content`.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { CheckCardComponent, checkCardRows, parseCheckCardData } from "../src/slices/tools/check-card.js";
import { stringsFor } from "../src/shared/i18n.js";
import { visibleWidth } from "@earendil-works/pi-tui";

let failures = 0;

function check(label: string, ok: boolean, detail?: unknown): void {
  console.log(
    `${ok ? "PASS" : "FAIL"} — ${label}${ok || detail === undefined ? "" : ` :: ${JSON.stringify(detail)}`}`
  );
  if (!ok) failures++;
}

const cs = stringsFor("cs");
const en = stringsFor("en");
/** Identity theme: colour tags paint nothing, so plain-text asserts are exact. */
const theme = { fg: (_c: string, t: string) => t } as unknown as Theme;

const clean: Parameters<typeof checkCardRows>[0] = {
  ok: true,
  skipped: false,
  path: "D:\\x\\a.lss",
  errorCount: 0,
  diagnostics: [],
};

const failed: Parameters<typeof checkCardRows>[0] = {
  ok: false,
  skipped: false,
  path: "D:\\x\\a.lss",
  errorCount: 2,
  diagnostics: [
    "  ERROR D:\\x\\a.lss:21:1 [LS-0xD028] Not a member: NOSUCHMETHOD",
    "  ERROR D:\\x\\a.lss:23:1 [LS-0xD001] Unexpected: END SUB",
    "🌼 gotcha hint",
  ],
};

const skipped: Parameters<typeof checkCardRows>[0] = {
  ok: true,
  skipped: true,
  path: "D:\\x\\button.dxl",
  errorCount: 0,
  diagnostics: ["Error: D:\\x\\button.dxl is not a Domino script"],
};

// 1. Pure rows: verdict + path, diagnostics capped at 8 with a "+N" overflow.
const cleanRows = checkCardRows(clean, cs);
check("clean verdict uses 🌸", cleanRows[0]!.text.includes("🌸"), cleanRows[0]);
check("clean rows carry the path", cleanRows.some((r) => r.text === "D:\\x\\a.lss"), cleanRows);

const failedRows = checkCardRows(failed, cs);
check("failed verdict uses 🥀 and localizes the count", failedRows[0]!.text.includes("🥀") && failedRows[0]!.text.includes("2 chyby"), failedRows[0]);
check("failed rows include diagnostics, capped at 8", failedRows.length === 2 + 3, failedRows.length);

const many: Parameters<typeof checkCardRows>[0] = { ...failed, diagnostics: Array.from({ length: 12 }, (_, i) => `line ${i}`) };
const manyRows = checkCardRows(many, cs);
check("12 diagnostics cap to 8 + overflow row", manyRows.length === 2 + 8 + 1 && manyRows[manyRows.length - 1]!.text.includes("(+4)"), manyRows.length);

const skippedRows = checkCardRows(skipped, cs);
check("skipped verdict uses 💮", skippedRows[0]!.text.includes("💮"), skippedRows[0]);

// 2. Locales: cs and en both produce a readable verdict (i18n parity keys).
check("en verdict reads in English", checkCardRows(failed, en)[0]!.text.includes("2 compiler errors"), checkCardRows(failed, en)[0]);
check("cs skipped reads in Czech", checkCardRows(skipped, cs)[0]!.text.includes("není Domino skript"), checkCardRows(skipped, cs)[0]);

// 3. Painting: borders, exact fit at the given width, verdict colour kept.
const card = new CheckCardComponent(failed, theme, cs);
const lines = card.render(60);
check("card has top and bottom border", lines[0]!.startsWith("╭") && lines[lines.length - 1]!.startsWith("╰"), lines);
check("every line fits the width exactly", lines.every((l) => visibleWidth(l) === 60), lines.map((l) => visibleWidth(l)));
check("card carries the lotus title", lines.some((l) => l.includes("🪷")), lines);
check("card carries the verdict glyph", lines.some((l) => l.includes("🥀")), lines);

const narrow = new CheckCardComponent(failed, theme, cs).render(20);
check("narrow width still fits exactly", narrow.every((l) => visibleWidth(l) === 20), narrow.map((l) => visibleWidth(l)));
const tooNarrow = new CheckCardComponent(failed, theme, cs).render(6);
check("width < 10 draws nothing", tooNarrow.length === 0, tooNarrow);

// 4. Parse-back: a stored tool result reconstructs the data without details.
const stored =
  "Checked: D:\\x\\a.lss\nLSP Diagnostics: 🥀\n" +
  "  ERROR D:\\x\\a.lss:21:1 [LS-0xD028] Not a member\n" +
  "  ERROR D:\\x\\a.lss:23:1 [LS-0xD001] Unexpected";
const parsed = parseCheckCardData(stored, { ok: false, checkedPath: "D:\\x\\a.lss", errorCount: 2 });
check("parse: ok/errorCount come from details", parsed.ok === false && parsed.errorCount === 2, parsed);
check("parse: diagnostics are the post-header lines", parsed.diagnostics.length === 2 && parsed.diagnostics[0]!.includes("LS-0xD028"), parsed.diagnostics);

const cleanStored = "Checked: D:\\x\\a.lss\nLSP Diagnostics: 🌸 0 errors (clean)";
const parsedClean = parseCheckCardData(cleanStored, { ok: true, checkedPath: "D:\\x\\a.lss" });
check("parse: clean result has no diagnostics", parsedClean.diagnostics.length === 0 && parsedClean.errorCount === 0, parsedClean);
const legacy = parseCheckCardData(cleanStored, undefined);
check("parse: missing details fall back to text verdicts", legacy.ok === true && legacy.errorCount === 0, legacy);

if (failures) {
  console.log(`\n${failures} check-card test(s) failed`);
  process.exit(1);
}
console.log("\nAll check-card tests passed");
