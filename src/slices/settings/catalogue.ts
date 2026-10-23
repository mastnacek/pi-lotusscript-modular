import type { ModularConfig } from "../../shared/types.js";
import { stringsFor, type SettingCopy } from "../../shared/i18n.js";

export type SettingKind = "boolean" | "number" | "string";

export interface SettingSpec {
  key: keyof ModularConfig;
  kind: SettingKind;
}

/**
 * Keys + kinds only. All prose (description / on-off help) lives in the i18n
 * string table (src/shared/i18n*.ts) — user-facing text resolves through
 * `settingCopy(key, lang)`, never through hardcoded literals (pi-plugin-dev §10).
 */
export const SETTING_SPECS: readonly SettingSpec[] = [
  { key: "enableLsp", kind: "boolean" },
  { key: "autoCheckOnEdit", kind: "boolean" },
  { key: "autoFormatOnSave", kind: "boolean" },
  { key: "versioningCheck", kind: "boolean" },
  { key: "driftCheck", kind: "boolean" },
  { key: "autoExplainLspCodes", kind: "boolean" },
  { key: "enforceKbPrompt", kind: "boolean" },
  { key: "enforceKbGate", kind: "boolean" },
  { key: "verifyKbBeforeSettle", kind: "boolean" },
  { key: "minKbSearchesPerRun", kind: "number" },
  { key: "injectGotchasSummary", kind: "boolean" },
  { key: "enforceGotchaCapture", kind: "boolean" },
  { key: "enableScorecard", kind: "boolean" },
  { key: "enforceGradingRubric", kind: "boolean" },
  { key: "injectPreflightGotchas", kind: "boolean" },
  { key: "autoDraftRecurringGotchas", kind: "boolean" },
  { key: "showTelemetryPanel", kind: "boolean" },
];

export function findSetting(key: string): SettingSpec | undefined {
  return SETTING_SPECS.find((s) => s.key === key);
}

/** Localized description + on/off help for one catalogue setting. */
export function settingCopy(key: string, lang?: string): SettingCopy {
  const copy = stringsFor(lang).settings[key];
  return copy ?? { description: key };
}

export function parseValue(
  spec: SettingSpec,
  raw: string,
  lang?: string
): { ok: true; value: boolean | number | string } | { ok: false; error: string } {
  const s = stringsFor(lang);
  const norm = raw.trim().toLowerCase();
  if (spec.kind === "boolean") {
    if (norm === "true" || norm === "on" || norm === "1" || norm === "yes" || norm === "ano") {
      return { ok: true, value: true };
    }
    if (norm === "false" || norm === "off" || norm === "0" || norm === "no" || norm === "ne") {
      return { ok: true, value: false };
    }
    return { ok: false, error: s.errors.boolExpected(spec.key, raw) };
  }
  if (spec.kind === "number") {
    const num = parseInt(norm, 10);
    if (!Number.isNaN(num) && num > 0) {
      return { ok: true, value: num };
    }
    return { ok: false, error: s.errors.numberExpected(spec.key, raw) };
  }
  if (spec.kind === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { ok: false, error: s.errors.emptyNotAllowed(spec.key) };
    }
    return { ok: true, value: trimmed };
  }
  return { ok: false, error: s.errors.unknownKind(spec.kind) };
}

export function formatValue(val: unknown): string {
  if (typeof val === "boolean") return val ? "true" : "false";
  return String(val ?? "");
}
