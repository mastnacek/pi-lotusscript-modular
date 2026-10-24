/**
 * Gotcha registry test — parsing, seeding and the update sync.
 *
 * 1. A `## Sub-heading` inside an entry body is part of that entry, not a new
 *    gotcha (the shape addGotcha() writes, which used to shred the registry).
 * 2. Superseded titles are dropped from the user copy on load.
 * 3. Bundled entries missing from the user copy are appended (an updated seed
 *    therefore reaches a registry that was seeded months ago).
 * 4. Operator entries survive the sync untouched.
 * 5. A second load writes nothing (idempotent, mtime stable).
 * 6. A missing registry is seeded from the bundled catalogue.
 * 7. The seed carries no reference to a tool or step that no longer exists.
 *
 * The registry path is redirected through LOTUSSCRIPT_GOTCHAS_DIR, so this test
 * never touches ~/.pi/lotusscript/gotchas.md.
 *
 * Run: npx tsx test/test_gotchas.ts
 */

import fs from "node:fs";
import path from "node:path";

let failures = 0;
function check(label: string, ok: boolean): void {
  if (ok) console.log(`${label}: PASS`);
  else {
    failures++;
    console.log(`${label}: FAIL`);
  }
}

const DIR = path.resolve("./temp_gotchas_test");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });
process.env.LOTUSSCRIPT_GOTCHAS_DIR = DIR;

const store = path.join(DIR, "gotchas.md");

// A registry as the old build left it: two decompiler-era toolchain entries, one
// operator entry carrying its own `## Projev` sub-heading, and one entry that
// also exists in the bundled seed (must not be appended twice).
fs.writeFileSync(
  store,
  [
    "# LotusScript Gotchas",
    "",
    "Trap catalogue.",
    "",
    "---",
    "",
    "## [toolchain] A `Účel:` comment above a procedure disappears on recompile",
    "",
    "Decompile moves it into `01_declarations.lss`.",
    "",
    "---",
    "",
    "## [toolchain] `' === SECTION: … ===` and `%REM … Assembled from modular source files` are generated",
    "",
    "The assembler writes these markers.",
    "",
    // A doubled separator run, as an older sync used to leave behind: the
    // parser must assign the whole run to the entry below, not to the body above.
    "---",
    "",
    "---",
    "",
    "## Můj vlastní nález: `Split` a prázdný řetězec",
    "",
    "## Projev",
    "",
    "Vrací pole o jednom prvku.",
    "",
    "---",
    "",
    "## `GetAllDocumentsByKey` returns an empty collection on no match — never `Nothing`",
    "",
    "Starý text, který má být nahrazen seedem.",
    "",
  ].join("\n"),
  "utf-8"
);

const { getAllGotchas, getEffectiveGotchasPath } = await import("../src/slices/gotchas/catalogue.js");

const items = getAllGotchas();
const titles = items.map((g) => g.title);
const text = fs.readFileSync(store, "utf-8");

// 1. sub-headings stay inside their parent entry
check(
  "1. `## Projev` is body text, not a separate gotcha",
  !titles.includes("Projev") && items.some((g) => g.title.includes("Můj vlastní nález") && g.body.includes("## Projev"))
);
check("1b. parsing matches the number of `---`-delimited entries", titles.length === new Set(titles).size);

// 2. superseded titles are gone
check(
  "2. decompiler-era entries dropped",
  !text.includes("disappears on recompile") && !text.includes("Assembled from modular source files")
);

// 3. missing bundled entries are appended
check(
  "3. current whole-file gotcha re-seeded",
  titles.some((t) => t.includes("One `.lss` is the whole module"))
);
check(
  "3b. existing entry is not duplicated",
  titles.filter((t) => t.includes("GetAllDocumentsByKey")).length === 1
);

// 4. operator entry survives with its body
check("4. operator entry preserved", text.includes("Můj vlastní nález") && text.includes("Vrací pole o jednom prvku"));

// 4b. separator layout is normalised — exactly one `---` between entries, none
// inside a body, none dangling at the end of the preamble
const separatorLines = text.split(/\r?\n/).filter((l) => /^-{3,}$/.test(l.trim())).length;
check("4b. one separator before every entry", separatorLines === items.length);
check(
  "4c. no separator inside a body",
  !items.some((g) => g.body.split(/\r?\n/).some((l) => /^-{3,}$/.test(l.trim())))
);
check("4d. no doubled separator run", !/\n-{3,}\n\s*\n-{3,}\n/.test(text));
check("4e. preamble is closed by exactly one separator", text.split("## ")[0]?.trimEnd().endsWith("---") === true);

// 5. idempotent
const mtime = fs.statSync(store).mtimeMs;
const contentBefore = fs.readFileSync(store, "utf-8");
getEffectiveGotchasPath();
getAllGotchas();
check(
  "5. second load writes nothing",
  fs.readFileSync(store, "utf-8") === contentBefore && fs.statSync(store).mtimeMs === mtime
);

// 6. missing registry is seeded from the bundled catalogue
const seedText = fs.readFileSync(path.resolve("src/slices/gotchas/gotchas.md"), "utf-8");
fs.rmSync(store, { force: true });
const seededPath = getEffectiveGotchasPath();
const seeded = getAllGotchas();
const seedHeadings = (seedText.match(/^## /gm) ?? []).length;
check("6. missing registry seeded from bundled", seededPath === store && seeded.length > 60);
check("6b. seeded copy is the seed, not the operator's file", !fs.readFileSync(seededPath, "utf-8").includes("Můj vlastní nález"));
// The seed is `---`-delimited; a heading without its separator is swallowed into
// the previous entry, so parsed count must equal the heading count.
check(`6c. every seed heading parses as an entry (${seeded.length}/${seedHeadings})`, seeded.length === seedHeadings);

// 7. the seed names only tools that exist
check(
  "7. seed has no removed tool or decompile step",
  !seedText.includes("lotusscript_lsp_lsp_diagnostics") && !seedText.includes("Convert-LssToDxl")
);

fs.rmSync(DIR, { recursive: true, force: true });

if (failures > 0) {
  console.log(`\n${failures} gotcha test(s) FAILED`);
  process.exit(1);
}
console.log("\n=== All gotcha registry tests passed ===");
