/**
 * Phase: `/ls` completions, settings catalogue and config loading.
 * The modular subcommands and settings must be gone; retired keys in a config
 * file must never resurrect a removed behaviour.
 */

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG, loadConfig } from "../../src/shared/config.js";
import { completeLsArguments } from "../../src/slices/settings/complete.js";
import { stringsFor } from "../../src/shared/i18n.js";
import { lsAudit } from "../../src/slices/commands/ls-audit.js";
import { auditForCommand } from "../../src/slices/audit/index.js";
import type { CommandsDeps } from "../../src/slices/commands/deps.js";
import { createTestState, mockCtx } from "../helpers.js";
import { SETTING_SPECS, findSetting, parseValue, formatValue } from "../../src/slices/settings/catalogue.js";
import { ensureTestDir, TEST_DIR } from "../helpers.js";

export async function phaseCommands(): Promise<void> {
  ensureTestDir();
  const cfg = DEFAULT_CONFIG;

  // 1. Subcommand menu carries the whole-file commands.
  const subs = completeLsArguments("", cfg) ?? [];
  const labels = subs.map((s) => s.label);
  const okSubs = ["status", "check", "score", "scaffold", "gotchas", "config", "help"].every((s) =>
    labels.includes(s)
  );
  console.log("1. /ls offers status/check/score/scaffold/gotchas/config/help:", okSubs ? "PASS" : "FAIL");
  if (!okSubs) throw new Error(`Menu: ${JSON.stringify(labels)}`);

  // 2. The modular subcommands are gone.
  const gone = ["overwrite", "compile", "pack", "clean", "lint"].filter((s) => labels.includes(s));
  console.log(`2. modular + lint subcommands removed (found: ${gone.join(",") || "none"}):`, gone.length === 0 ? "PASS" : "FAIL");
  if (gone.length > 0) throw new Error(`Still offered: ${JSON.stringify(gone)}`);

  // 3. Scaffold offers exactly the two whole-file types, with trailing space.
  const types = completeLsArguments("scaffold ", cfg) ?? [];
  const typeLabels = types.map((t) => t.label);
  const okTypes =
    typeLabels.length === 2 &&
    typeLabels.includes("agent") &&
    typeLabels.includes("library") &&
    types.every((t) => t.value === `scaffold ${t.label} `);
  console.log("3. scaffold completions expose agent + library with trailing space:", okTypes ? "PASS" : "FAIL");
  if (!okTypes) throw new Error(`Types: ${JSON.stringify(types)}`);

  // 4. Direct setting completions never advertise a retired key.
  const retired = [
    "overwriteSourceLss",
    "keepTimestampInCompiledName",
    "cleanupOnSettled",
    "autoRecompileOnSave",
    "checkProcedureLimits",
    "maxProcedureLines",
    "enforceCzechComments",
  ];
  const settingValues = subs.map((s) => s.value);
  const leaked = retired.filter((k) => settingValues.includes(k));
  console.log("4. retired settings are not offered as subcommands:", leaked.length === 0 ? "PASS" : "FAIL");
  if (leaked.length > 0) throw new Error(`Leaked: ${JSON.stringify(leaked)}`);

  // 5. Catalogue keys: all real config keys, none retired, autoCheckOnEdit present.
  const keys = SETTING_SPECS.map((s) => s.key as string);
  const okCatalogue =
    keys.every((k) => k in cfg) &&
    keys.includes("autoCheckOnEdit") &&
    retired.every((k) => !keys.includes(k));
  console.log("5. catalogue matches the live config (autoCheckOnEdit, no retired):", okCatalogue ? "PASS" : "FAIL");
  if (!okCatalogue) throw new Error(`Catalogue keys: ${JSON.stringify(keys)}`);

  // 6. boolean/number parsing still validates.
  const boolSpec = findSetting("enableLsp")!;
  const numSpec = findSetting("minKbSearchesPerRun")!;
  const okParse =
    (parseValue(boolSpec, "on") as { ok: true; value: boolean }).value === true &&
    (parseValue(boolSpec, "off") as { ok: true; value: boolean }).value === false &&
    (parseValue(numSpec, "5") as { ok: true; value: number }).value === 5 &&
    parseValue(numSpec, "abc").ok === false &&
    parseValue(boolSpec, "maybe").ok === false;
  console.log("6. settings parse/validate booleans and numbers:", okParse ? "PASS" : "FAIL");
  if (!okParse) throw new Error("parseValue contract broken");
  const okFormat = formatValue(true) === "true" && formatValue(false) === "false" && formatValue(7) === "7";
  console.log("7. formatValue renders booleans and numbers:", okFormat ? "PASS" : "FAIL");
  if (!okFormat) throw new Error("formatValue contract broken");

  // 8. A stale config file cannot revive removed modular settings.
  const projectDir = path.join(TEST_DIR, "proj");
  const configDir = path.join(projectDir, ".pi");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "lotusscript-modular.json"),
    JSON.stringify({
      enableLsp: true,
      autoCheckOnEdit: false,
      overwriteSourceLss: true,
      cleanupOnSettled: true,
      keepTimestampInCompiledName: true,
      autoRecompileOnSave: true,
      checkProcedureLimits: true,
      maxProcedureLines: 300,
    }),
    "utf-8"
  );
  const loaded = loadConfig(projectDir) as unknown as Record<string, unknown>;
  const okRetired =
    loaded.enableLsp === true &&
    loaded.autoCheckOnEdit === false &&
    !("overwriteSourceLss" in loaded) &&
    !("cleanupOnSettled" in loaded) &&
    !("keepTimestampInCompiledName" in loaded) &&
    !("autoRecompileOnSave" in loaded) &&
    !("checkProcedureLimits" in loaded) &&
    !("maxProcedureLines" in loaded);
  console.log("8. retired settings are dropped when a config is loaded:", okRetired ? "PASS" : "FAIL");
  if (!okRetired) throw new Error(`Loaded config kept retired keys: ${JSON.stringify(loaded)}`);

  // 9. An unknown setting stays unknown (no silent acceptance).
  const okUnknown = findSetting("noSuchSetting") === undefined && findSetting("overwriteSourceLss") === undefined;
  console.log("9. unknown and retired settings are rejected:", okUnknown ? "PASS" : "FAIL");
  if (!okUnknown) throw new Error("unknown/retired setting was accepted");

  // 10. `/ls audit` is discoverable: offered by completion and listed in help.
  // `audit` takes a free-text folder, so its own menu entry is the leaf: the
  // contract being tested is discoverability (present in the menu, matched by
  // prefix), not a parameter picker.
  const okAuditOffered =
    labels.includes("audit") &&
    (completeLsArguments("audi", cfg) ?? []).some((s) => s.label === "audit");
  console.log("10. audit is offered in the /ls menu and prefix-filtered:", okAuditOffered ? "PASS" : "FAIL");
  if (!okAuditOffered) throw new Error("audit missing from completions");
  const helpText = stringsFor("cs").help.lines.join("\n");
  const helpEn = stringsFor("en").help.lines.join("\n");
  const okAuditHelp = helpText.includes("/ls audit") && helpEn.includes("/ls audit");
  console.log("10b. audit appears in both help tables:", okAuditHelp ? "PASS" : "FAIL");
  if (!okAuditHelp) throw new Error("audit missing from help");

  // 11. Enum-like string settings reject a typo instead of persisting it.
  const promptSpec = findSetting("skillPrompt")!;
  const okPrompt =
    (parseValue(promptSpec, "never") as { ok: true; value: string }).value === "never" &&
    (parseValue(promptSpec, "ALWAYS") as { ok: true; value: string }).value === "always" &&
    parseValue(promptSpec, "banana").ok === false;
  console.log("11. skillPrompt validates ask|always|never:", okPrompt ? "PASS" : "FAIL");
  if (!okPrompt) throw new Error("skillPrompt accepted an invalid mode");

  // 12. A fully typed --global already yields the subcommand list (lazy menu).
  const okGlobal =
    (completeLsArguments("--global", cfg) ?? []).some((s) => s.label === "status") &&
    (completeLsArguments("--global ", cfg) ?? []).some((s) => s.label === "status");
  console.log("12. --global completes before and after the trailing space:", okGlobal ? "PASS" : "FAIL");
  if (!okGlobal) throw new Error("--global stranded the picker");

  // 13. `/ls audit` prints a headline + tool pointer, never the table: a toast
  //     cannot be scrolled and wraps a markdown table into noise.
  const auditDir = path.join(TEST_DIR, "audit_compact");
  fs.mkdirSync(auditDir, { recursive: true });
  const dupBody = (name: string) =>
    `Sub ${name}\n    Dim i As Integer\n    Dim total As Long\n    For i = 1 To 10\n        total = total + i\n    Next\n    Print total\nEnd Sub\n`;
  fs.writeFileSync(path.join(auditDir, "a.lss"), dupBody("VebaDataPole"), "utf-8");
  fs.writeFileSync(path.join(auditDir, "b.lss"), dupBody("VebaDataPole"), "utf-8");

  const auditCtx = mockCtx(true);
  await lsAudit(createTestState(), ["audit", auditDir], auditCtx, {
    auditLibraries: (dir: string, lang: string) => auditForCommand(dir, lang),
  } as unknown as CommandsDeps);
  const auditText = (auditCtx.notices[0]?.text ?? "") as string;
  const okCompact =
    auditText.includes("skupin duplicit") &&
    auditText.includes("lotusscript_library_audit") &&
    !auditText.includes("|---") &&
    !auditText.includes("| Procedura");
  console.log("13. /ls audit prints a headline + tool pointer, not the table:", okCompact ? "PASS" : "FAIL");
  if (!okCompact) throw new Error(`Audit toast: ${JSON.stringify(auditText)}`);
}
