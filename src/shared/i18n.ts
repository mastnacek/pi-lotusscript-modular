/**
 * i18n kernel — every user-facing string lives here (pi-plugin-dev §10).
 *
 * Contract:
 * - Text the USER reads (notify / select / confirm / input / setStatus /
 *   widgets / modals / command description / completion descriptions) comes
 *   from `stringsFor(state.config.lang)`.
 * - Text the MODEL reads (tool descriptions, tool result content, injected
 *   guidelines, debriefs) stays English and never enters this table.
 * - The persisted `lang` config key is the only source of truth — never
 *   sniff LANG / LC_ALL / Intl (absent on Windows, unreliable in containers).
 * - Both locales MUST carry every key; `Record<Locale, Strings>` enforces it
 *   at compile time and test/test_i18n.ts asserts it at test time.
 */

export const LOCALES = ["cs", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Historical default: the plugin shipped Czech-only, so cs stays default. */
export const DEFAULT_LOCALE: Locale = "cs";

/** Per-setting completion/status copy (`on`/`off` only for booleans). */
export interface SettingCopy {
  description: string;
  on?: string;
  off?: string;
}

export interface Strings {
  /** registerCommand description — completion-menu copy. */
  cmdDescription: string;
  /** ZAPNUTO / ON — status report state words. */
  on: string;
  off: string;
  /** Feminine forms for "LSP kontrola je ZAPNUTA" (cs grammar). */
  onF: string;
  offF: string;

  status: {
    title: string;
    lspCheck: string;
    scorecard: string;
    rubric: string;
    preflight: string;
    autoDraft: string;
    autoCheck: string;
    kbPrompt: string;
    kbGate: string;
    kbSettle: string;
    kbMin: string;
    gotchaCapture: string;
    gotchasSummary: string;
    langLabel: string;
    gotchasFile: string;
    configFile: string;
  };

  set: {
    lspToggled: (on: boolean, isGlobal: boolean) => string;
    savedKV: (isGlobal: boolean, key: string, value: string) => string;
    currentValue: (key: string, value: string, description: string) => string;
    unknownSetting: (key: string) => string;
    usageConfigGet: string;
    usageConfigSet: string;
    usageConfig: string;
  };

  /** parseValue() validation errors — surfaced to the user via notify. */
  errors: {
    boolExpected: (key: string, raw: string) => string;
    numberExpected: (key: string, raw: string) => string;
    emptyNotAllowed: (key: string) => string;
    unknownKind: (kind: string) => string;
  };

  lang: {
    description: string;
    current: (lang: string) => string;
    set: (lang: string, isGlobal: boolean) => string;
    unknown: (raw: string) => string;
    localeCs: string;
    localeEn: string;
  };

  check: {
    usage: (target: string) => string;
    clean: (name: string) => string;
    errors: (diagnostics: string) => string;
    lspDisabled: string;
  };

  scaffoldCmd: {
    usage: string;
    error: (msg: string) => string;
  };

  score: {
    history: (n: number) => string;
  };

  gotchasCmd: {
    addUsage: string;
    bodyPrompt: string;
    bodyPlaceholder: string;
    cancelled: string;
    saved: (title: string) => string;
    notSaved: string;
    noneFound: (query: string) => string;
  };

  gotchaModal: {
    header: string;
    titleLabel: string;
    bodyLabel: string;
    moreLines: (n: number) => string;
    inputPlaceholder: string;
    instructionsEmpty: string;
    instructionsPrefix: string;
    actionSave: string;
    actionSaveHint: string;
    actionCancel: string;
    actionCancelHint: string;
    actionRewrite: string;
    choose: string;
    footer: string;
    rewritePrompt: string;
    rewritePlaceholder: string;
  };

  settled: {
    score: (s: number, m: number) => string;
    done: (file: string, tail: string) => string;
  };

  recurring: {
    saved: (title: string) => string;
    declined: string;
  };

  /** notify() calls inside the model tool (user reads them, model does not). */
  toolGotchas: {
    approved: (title: string) => string;
    rewritePassed: string;
    rejected: string;
  };

  telemetry: {
    hooks: (total: number, calls: number, results: number, settled: number) => string;
    reads: (kb: number) => string;
    gates: (kb: number, checks: number, kbNudges: number) => string;
    suffix: (lsp: string) => string;
  };

  statusline: {
    checking: (badge: string) => string;
    clean: (badge: string) => string;
    error: (badge: string) => string;
  };

  completions: {
    subStatus: string;
    subGlobal: string;
    subScaffold: string;
    subLsp: string;
    subCheck: string;
    subScore: string;
    subGotchas: string;
    subConfig: string;
    subHelp: string;
    configGet: string;
    configSet: string;
    scaffoldAgent: string;
    scaffoldLibrary: string;
    gotchasSummary: string;
    gotchasAdd: string;
    topicShell: string;
    topicForall: string;
    topicConst: string;
    topicOption: string;
    topicVariant: string;
    topicComputewithform: string;
    topicReplaceall: string;
    turnOn: string;
    turnOff: string;
    markActive: string;
    markInactive: string;
    markOn: string;
    markOff: string;
    now: (value: string) => string;
    kbQueries: (n: number) => string;
    kbQueriesDefault: (n: number) => string;
  };

  /** Copy for every catalogue setting, keyed by ModularConfig key. */
  settings: Record<string, SettingCopy>;

  help: {
    lines: string[];
  };
}

import { STRINGS_CS } from "./i18n-cs.js";
import { STRINGS_EN } from "./i18n-en.js";

const STRINGS: Record<Locale, Strings> = {
  cs: STRINGS_CS,
  en: STRINGS_EN,
};

/** A typo is the default locale, never a crash. */
export function normalizeLocale(raw: string | undefined): Locale {
  const token = (raw ?? "").trim().toLowerCase();
  if (token === "en" || token === "eng") return "en";
  if (token === "cs" || token === "cz" || token === "cze") return "cs";
  return DEFAULT_LOCALE;
}

export function stringsFor(locale: string | undefined): Strings {
  return STRINGS[normalizeLocale(locale)];
}
