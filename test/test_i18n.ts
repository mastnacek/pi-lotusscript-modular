/**
 * i18n conformance test (pi-plugin-dev §10 checklist items 5 + 6):
 * 1. Every locale carries every key — deep parity walk, no empty strings.
 * 2. Every catalogue setting key has copy in every locale.
 * 3. Render assertions in BOTH locales (the non-default locale must not be
 *    theoretical — a regression must be visible).
 * 4. normalizeLocale: aliases resolve, typos fall back to the default locale.
 *
 * Run: npx tsx test/test_i18n.ts
 */

import { DEFAULT_CONFIG } from "../src/shared/config.js";
import {
  DEFAULT_LOCALE,
  LOCALES,
  normalizeLocale,
  stringsFor,
} from "../src/shared/i18n.js";
import { SETTING_SPECS } from "../src/slices/settings/catalogue.js";
import { completeLsArguments } from "../src/slices/settings/complete.js";
import { createTelemetry, hudLines, type HudView } from "../src/shared/state-hud.js";

let failures = 0;

function check(label: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}`);
  if (!ok) failures++;
}

/** Deep-walks two objects: identical key shape, functions↔functions, no empty strings. */
function walkParity(path: string, a: unknown, b: unknown): string[] {
  const problems: string[] = [];
  if (typeof a === "function" || typeof b === "function") {
    if (typeof a !== typeof b) problems.push(`${path}: function/value mismatch`);
    return problems;
  }
  if (typeof a === "string" || typeof b === "string") {
    if (typeof a !== typeof b) problems.push(`${path}: string/non-string mismatch`);
    if (typeof a === "string" && a.trim() === "") problems.push(`${path}: empty string (left)`);
    if (typeof b === "string" && b.trim() === "") problems.push(`${path}: empty string (right)`);
    return problems;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      problems.push(`${path}: array shape mismatch`);
      return problems;
    }
    a.forEach((v, i) => problems.push(...walkParity(`${path}[${i}]`, v, b[i])));
    return problems;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    for (const k of ka) if (!kb.includes(k)) problems.push(`${path}.${k}: missing in right locale`);
    for (const k of kb) if (!ka.includes(k)) problems.push(`${path}.${k}: missing in left locale`);
    for (const k of ka) {
      if (kb.includes(k)) {
        problems.push(
          ...walkParity(`${path}.${k}`, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
        );
      }
    }
    return problems;
  }
  if (a !== b && (a === undefined || b === undefined)) problems.push(`${path}: defined/undefined mismatch`);
  return problems;
}

console.log("=== i18n string-table conformance ===");

// 1. Locale parity across every pair of locales.
for (const left of LOCALES) {
  for (const right of LOCALES) {
    if (left >= right) continue;
    const problems = walkParity("strings", stringsFor(left), stringsFor(right));
    check(`locale parity ${left} ↔ ${right} (${problems.length} problems)`, problems.length === 0);
    for (const p of problems) console.log(`    ${p}`);
  }
}

// 2. Every catalogue setting has copy in every locale.
for (const spec of SETTING_SPECS) {
  for (const locale of LOCALES) {
    const copy = stringsFor(locale).settings[spec.key];
    check(`settings.${spec.key} exists in ${locale}`, Boolean(copy && copy.description.trim()));
    if (spec.kind === "boolean") {
      check(`settings.${spec.key} has on/off help in ${locale}`, Boolean(copy?.on && copy?.off));
    }
  }
}

// 3a. HUD render: cs (default) keeps the historical Czech markers.
const hudView: HudView = {
  telemetry: createTelemetry(),
  state: "idle",
  score: null,
  kbQueries: 0,
  kbRequired: 3,
  traceTail: "",
  lastTrace: null,
};
const csLines = hudLines(hudView, { ...DEFAULT_CONFIG, lang: "cs" });
check("hud cs renders the state word", csLines[0]!.includes("nečinný"));
check("hud cs renders the LSP marker", csLines[0]!.includes("LSP 🌱"));
check("hud cs renders hooks line", csLines[1]!.includes("haky"));
check("hud cs renders the KB gate line", csLines[2]!.includes("brány"));

// 3b. HUD render: en (non-default locale — regression must be visible).
const enLines = hudLines(hudView, { ...DEFAULT_CONFIG, lang: "en" });
check("hud en renders the state word", enLines[0]!.includes("idle"));
check("hud en renders hooks line", enLines[1]!.includes("hooks"));
check("hud en renders the KB gate line", enLines[2]!.includes("gates"));

// 3c. The trace row appears only once a checkpoint fired, and names it.
const traced = hudLines(
  { ...hudView, traceTail: " 🧩", lastTrace: { label: "verzování", detail: "a.lss", ok: false } },
  { ...DEFAULT_CONFIG, lang: "cs" }
);
check("hud adds the trace row with the last checkpoint", traced.length === 4 && traced[3]!.includes("naposled") && traced[3]!.includes("verzování") && traced[3]!.includes("⚠"));
check("hud has no trace row before the first checkpoint", csLines.length === 3);

// 3c. Completion descriptions follow the locale.
const csComp = completeLsArguments("", { ...DEFAULT_CONFIG, lang: "cs" });
const enComp = completeLsArguments("", { ...DEFAULT_CONFIG, lang: "en" });
check(
  "completions cs describe status in Czech",
  Boolean(csComp?.find((c) => c.value === "status")?.description.includes("konfiguraci"))
);
check(
  "completions en describe status in English",
  Boolean(enComp?.find((c) => c.value === "status")?.description.includes("configuration"))
);

// 3d. The lang subcommand offers both locales and marks the active one.
const langComp = completeLsArguments("lang ", { ...DEFAULT_CONFIG, lang: "cs" });
check("lang completion offers cs + en", Boolean(
  langComp?.some((c) => c.value === "lang cs") && langComp?.some((c) => c.value === "lang en")
));
check("lang completion marks cs active", Boolean(langComp?.find((c) => c.value === "lang cs")?.label.includes("✓")));

// 4. normalizeLocale contract.
check("normalizeLocale('en') → en", normalizeLocale("en") === "en");
check("normalizeLocale('CZ') → cs (alias)", normalizeLocale("CZ") === "cs");
check("normalizeLocale(typo) → default", normalizeLocale("klingon") === DEFAULT_LOCALE);
check("normalizeLocale(undefined) → default", normalizeLocale(undefined) === DEFAULT_LOCALE);

// 5. Help text parity (same line count in both locales).
check(
  "help.lines parity",
  stringsFor("cs").help.lines.length === stringsFor("en").help.lines.length
);

console.log(failures === 0 ? "\nALL i18n CHECKS PASSED" : `\n${failures} i18n CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
