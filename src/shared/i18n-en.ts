/**
 * English locale — full translation of the Czech table. Every key must stay
 * in sync with STRINGS_CS; the Strings type and test/test_i18n.ts enforce it.
 */

import type { Strings } from "./i18n.js";

export const STRINGS_EN: Strings = {
  cmdDescription: "Manage LotusScript whole-file checks, LSP and the Gotchas registry",
  on: "ON",
  off: "OFF",
  onF: "ON",
  offF: "OFF",

  status: {
    title: "⚙️ [LotusScript Modular — Configuration status]:",
    lspCheck: "LSP check",
    procLimits: "Procedure limit check",
    maxLines: "Max lines per procedure",
    czechComments: "Enforce Czech comments",
    scorecard: "Scorecard (grading)",
    rubric: "Definition of Done rubric",
    preflight: "Pre-flight gotchas check",
    autoDraft: "Auto-draft gotcha from recurring errors",
    autoCheck: "Auto-check whole file on edit",
    kbPrompt: "Enforce lotus-notes KB prompt",
    kbGate: "Enforce lotus-notes KB hard gate",
    kbSettle: "Verify KB before settle",
    kbMin: "Min KB searches per run",
    gotchaCapture: "Enforce gotcha recording",
    gotchasSummary: "Inject gotchas summary",
    langLabel: "UI language",
    gotchasFile: "Central Gotchas file",
    configFile: "Config file",
  },

  set: {
    lspToggled: (on, isGlobal) =>
      `LSP syntax check is now ${on ? "ON" : "OFF"} (saved ${isGlobal ? "globally" : "to the project"}).`,
    savedKV: (isGlobal, key, value) =>
      `Saved (${isGlobal ? "globally" : "to the project"}): ${key} = ${value}`,
    currentValue: (key, value, description) => `${key} = ${value} (${description})`,
    unknownSetting: (key) => `Unknown setting: ${key}`,
    usageConfigGet: "Usage: /ls config get <key>",
    usageConfigSet: "Usage: /ls config set <key> <value>",
    usageConfig: "Usage: /ls config [get|set] ... or directly /ls <setting> <value>",
  },

  errors: {
    boolExpected: (key, raw) =>
      `Value for '${key}' must be 'true' or 'false' (got: '${raw}')`,
    numberExpected: (key, raw) =>
      `Value for '${key}' must be a positive integer (got: '${raw}')`,
    emptyNotAllowed: (key) => `Value for '${key}' must not be empty`,
    unknownKind: (kind) => `Unknown setting type: ${kind}`,
  },

  lang: {
    description: "Switch UI language: cs | en",
    current: (lang) => `Current UI language: ${lang}`,
    set: (lang, isGlobal) =>
      `UI language set to '${lang}' (saved ${isGlobal ? "globally" : "to the project"}).`,
    unknown: (raw) => `Unknown language: '${raw}'. Supported: cs, en`,
    localeCs: "Czech",
    localeEn: "English",
  },

  check: {
    usage: (p) => `Usage: /ls check <file.lss>${p ? ` (file not found: ${p})` : ""}`,
    clean: (name) => `✓ ${name}: whole file checked, 0 errors`,
    errors: (diagnostics) => `⚠ Compiler errors:
${diagnostics}`,
    lspDisabled: "LSP checking is off (/ls lsp on) — nothing to verify.",
  },

  scaffoldCmd: {
    usage: "Usage: /ls scaffold <agent|library> [name] [target folder]",
    error: (msg) => `Scaffold error: ${msg}`,
  },

  lint: {
    title: (name) => `🔍 [LotusScript Linter — ${name}]:`,
    total: (n) => `- Total procedures: ${n}`,
    exceeding: (limit, n) => `- Exceeds the ${limit}-line limit: ${n}`,
    missingComment: (n) => `- Missing Czech comment: ${n}`,
    missingDesc: "⚠️ missing description",
    linesCount: (n) => `${n} lines`,
  },

  score: {
    history: (n) => `History (${n}): `,
  },

  gotchasCmd: {
    addUsage: "Usage: /ls gotchas add <gotcha title>",
    bodyPrompt: "Enter the gotcha description / body:",
    bodyPlaceholder: "Describe the problem and the fix...",
    cancelled: "Input cancelled.",
    saved: (title) => `✓ Gotcha saved to the registry: ${title}`,
    notSaved: "Gotcha was not saved (cancelled by the user).",
    noneFound: (query) => `No gotchas found for: "${query}"`,
  },

  gotchaModal: {
    header: "New entry approval 💡",
    titleLabel: "📌 Proposed title:",
    bodyLabel: "📋 Proposed gotcha description / body:",
    moreLines: (n) => `... (+ ${n} more lines)`,
    inputPlaceholder: " (type instructions for the AI)",
    instructionsEmpty: "Instructions: (Enter to type)",
    instructionsPrefix: "Instructions: ",
    actionSave: "💾 [Save gotcha]",
    actionSaveHint: "— approve and write to the registry",
    actionCancel: "❌ [Cancel proposal]",
    actionCancelHint: "— reject, do not save",
    actionRewrite: "✏️ [Rewrite]",
    choose: "🎯 Choose an action (select with ↑ / ↓ arrows and confirm with Enter):",
    footer: "💡 ↑↓ navigate • Enter confirm • Esc cancel • typing enters instructions",
    rewritePrompt: "✏️ Instructions for the AI gotcha rewrite:",
    rewritePlaceholder: "Describe what the AI should change, add or rewrite in the proposal...",
  },

  limitModal: {
    header: "Procedure length limit exceeded 📏",
    procedureLabel: "📌 Procedure:",
    lineCountLabel: "📊 Line count:",
    limitLabel: "/ limit:",
    overBy: (n) => `(+${n} lines over the limit)`,
    riskLabel: "⚠️  Risk:",
    riskText: "LotusScript 32 KB procedure bytecode limit ('Script structure too large')",
    commentsLabel: "ℹ️  Comments:",
    choose: "🎯 Choose an action (arrow keys ↑ / ↓, confirm with Enter):",
    approve: "✅ [Allow exception]",
    approveHint: "— approve a minor excess and continue",
    reject: "✂️ [Reject and split]",
    rejectHint: "— send the AI a directive to split into smaller subs/functions",
    instructions: "✏️ [Split instructions]",
    instructionsEmpty: "Instructions: (Enter to type)",
    instructionsPrefix: "Instructions: ",
    inputPlaceholder: " (type split instructions here)",
    footer: "💡 ↑↓ actions • Enter confirm • Esc reject • PageUp/PageDown scroll",
    moreRows: (parts) => `… ${parts} rows (PageUp/PageDown) …`,
    inputPrompt: (file) => `✏️ Instructions for splitting procedure '${file}':`,
    inputDialogPlaceholder:
      "Describe how the AI should split the procedure (e.g. extract HTTP calls or database queries)...",
  },

  limits: {
    exceptionApproved: (file, lines) =>
      `✓ Length exception approved for ${file} (${lines} lines)`,
  },

  settled: {
    score: (s, m) => ` [score: ${s}/${m}]`,
    done: (file, tail) => `🪷 [LotusScript Modular] Done: ${file} ${tail}`,
  },

  recurring: {
    saved: (title) => `✓ Recurring failure saved as a gotcha: ${title}`,
    declined: "The recurring failure was not saved as a gotcha.",
  },

  toolGotchas: {
    approved: (title) => `✓ Gotcha approved and written to the central registry: ${title}`,
    rewritePassed: "Gotcha rewrite request handed to the AI...",
    rejected: "Gotcha was not saved (rejected by the user).",
  },

  telemetry: {
    hooks: (total, calls, results, settled) =>
      `🪷 LS hooks ${total}: calls ${calls} · results ${results} · settled ${settled}`,
    reads: (kb) => `   KB queries ${kb}`,
    gates: (kb, checks, kbNudges) =>
      `   gates: KB ${kb} · checks ${checks} · settle-nudges ${kbNudges}`,
    codeNone: "code: no check yet",
    code: (procs, longest, max) => `code: ${procs} procs · longest ${longest}/${max}`,
    suffix: (code, lsp) => `📏 ${code} · LSP ${lsp}`,
  },

  statusline: {
    checking: (badge) => `🪷 LS${badge}: checking...`,
    clean: (badge) => `🪷 LS${badge}: clean ✓`,
    error: (badge) => `🪷 LS${badge}: LSP error ⚠`,
  },

  completions: {
    subStatus: "Show current plugin configuration",
    subGlobal: "Save the following setting globally (~/.pi/agent/)",
    subScaffold: "Create a LotusScript code skeleton (agent, library)",
    subLsp: "Toggle LotusScript LSP check: on | off",
    subCheck: "Check a whole .lss file with the 9.0.1 compiler",
    subLint: "Check procedure length (max 300 lines) and comments",
    subScore: "Show the agent scorecard and grading trend",
    subGotchas: "Search the LotusScript Gotchas database (40+ rules)",
    subConfig: "Show or change settings (get/set, legacy)",
    subHelp: "Show command help",
    configGet: "Print the current setting value",
    configSet: "Save a new setting value",
    scaffoldAgent: "Standalone LotusScript agent (.lss) with error handling",
    scaffoldLibrary: "Script library (.lss)",
    gotchasSummary: "Show a summary of key pitfalls",
    gotchasAdd: "Add a new gotcha with an approval dialog",
    topicShell: "Shell as a variable name (reserved word)",
    topicForall: "ForAll and the alias variable",
    topicConst: "Const declaration without As Type",
    topicOption: "Option Declare and Option Public duplicates",
    topicVariant: "Variant vs Integer in the Notes API",
    topicComputewithform: "ComputeWithForm behavior on forms",
    topicReplaceall: "Replace vs ReplaceAll and empty strings",
    turnOn: "Turn on",
    turnOff: "Turn off",
    markActive: " · ● ACTIVE",
    markInactive: " · ○ OFF",
    markOn: " · ● ON",
    markOff: " · ○ OFF",
    now: (value) => `(now: ${value})`,
    lines: (n) => `${n} lines`,
    linesDefault: (n) => `${n} lines (default limit)`,
  },

  settings: {
    enableLsp: {
      description: "Run the whole-file LotusScript LSP syntax check after each edit",
      on: "On — verify syntax via the LotusScript LSP server",
      off: "Off — skip the LSP check",
    },
    autoCheckOnEdit: {
      description: "Check the whole .lss file with the 9.0.1 compiler after every edit",
      on: "On — every edit triggers a whole-file check (procedure limits, LSP, scorecard)",
      off: "Off — check manually with /ls check or lotusscript_check",
    },
    autoFormatOnSave: {
      description: "Auto-format the edited .lss via the LSP formatter before the check (ASCII-only files)",
      on: "On — LSP formatting runs on save before the check",
      off: "Off — format only on explicit request (lsp_format)",
    },
    autoExplainLspCodes: {
      description: "Auto-attach lsp_explain help pages for new LSP error codes after a failed check",
      on: "On — every new LS-0x… / FORMULA-0x… code gets a help block",
      off: "Off — error codes are reported bare, explain on demand",
    },
    enforceKbPrompt: {
      description: "Enforce querying the lotus-notes MCP knowledge base before edits",
      on: "On — inject the rule into the prompt and tool outputs",
      off: "Off — do not inject the reminder",
    },
    enforceKbGate: {
      description: "Hard-block .lss/.dxl edits until the lotus-notes knowledge base is queried this session",
      on: "On — reject edits until kb_search has run",
      off: "Off — only remind via the prompt, never block",
    },
    verifyKbBeforeSettle: {
      description: "Require lotus-notes KB queries before the agent settles after mutating .lss/.dxl sources",
      on: "On — inject one verification turn when a run mutated LotusScript sources without enough kb_search calls",
      off: "Off — no settle-time verification",
    },
    minKbSearchesPerRun: {
      description: "Minimum kb_search calls per run touching LotusScript sources — one per KB layer (IBM reference, Guirard book, community) (default: 3)",
    },
    injectGotchasSummary: {
      description: "Inject an overview of key LotusScript Gotchas into the context",
      on: "On — inject the gotchas summary when reading a .lss file",
      off: "Off — gotchas available only via /ls gotchas",
    },
    enforceGotchaCapture: {
      description: "Enforce recording newly discovered pitfalls and gotchas",
      on: "On — remind to save a new gotcha after solving a problem",
      off: "Off — optional",
    },
    checkProcedureLimits: {
      description: "Check the maximum procedure (sub/function) length and comment presence",
      on: "On — watch the line limit and comments",
      off: "Off — do not check",
    },
    maxProcedureLines: {
      description: "Maximum allowed lines per procedure / function (default: 300)",
    },
    enforceCzechComments: {
      description: "Enforce concise Czech purpose comments on every procedure",
      on: "On — require a Czech description on procedures",
      off: "Off — optional",
    },
    enableScorecard: {
      description: "Compute and inject a deterministic scorecard after every agent compile",
      on: "On — include the scorecard in the compile result",
      off: "Off — plain reporting without a score",
    },
    enforceGradingRubric: {
      description: "Inject the Definition of Done and grading rubric into the system prompt",
      on: "On — the model receives the DoD and grading scheme",
      off: "Off — the rubric is not injected",
    },
    injectPreflightGotchas: {
      description:
        "Inject targeted findings based on the agent's own identifiers instead of the generic gotchas summary",
      on: "On — pre-flight gotchas check based on the agent's own identifiers",
      off: "Off — inject the generic top-gotchas summary",
    },
    autoDraftRecurringGotchas: {
      description:
        "Automatically propose a gotcha when the same LSP diagnostic recurs across cycles",
      on: "On — a recurring error is offered to save as a gotcha (with approval)",
      off: "Off — recurring errors are not tracked",
    },
    showTelemetryPanel: {
      description: "Show the telemetry panel above the editor (hooks, reads, gates, code length)",
      on: "On — panel with live counters above the editor",
      off: "Off — hide the panel",
    },
  },

  help: {
    lines: [
      "📖 [/ls commands — LotusScript Modular]:",
      "  /ls status                      — Show plugin configuration",
      "  /ls lang [cs|en]                — Switch UI language",
      "  /ls <setting> [value]           — Show or set an option directly",
      "  /ls --global <setting> <value>  — Save the setting globally (~/.pi/agent/)",
      "  /ls scaffold <type> [name]      — Create a skeleton (agent, library)",
      "  /ls lsp [on|off]                — Turn the LSP check on/off",
      "  /ls check <file.lss>            — Check the whole .lss with the 9.0.1 compiler",
      "  /ls lint <file.lss>             — Check procedure length and comments",
      "  /ls score <file.lss>            — Show the file scorecard and trend",
      "  /ls gotchas [query]             — Search the central registry of 40+ gotchas",
    ],
  },
};
