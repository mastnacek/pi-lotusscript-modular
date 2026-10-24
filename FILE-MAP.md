# File Map — pi-lotusscript-modular

Inventory of every file the plugin and its skill use, with a description of each.
Written for a **review agent**: each entry states what the file is responsible
for, what it exports, and where the risk sits. Line counts are from the working
tree at the whole-file workflow with the doc/sync cleanup commit.

- **Repo root:** `D:\01_programovani\pi\plugins\pi-lotusscript-modular`
- **Engine:** `@earendil-works/pi-coding-agent` (installed = npm latest, aligned)
- **Target platform:** IBM Notes/Domino 9.0.1, LotusScript
- **Architecture:** Vertical Slice Architecture (VSA) — thin composition root, `src/shared/` kernel, `src/slices/<feature>/`. Slices never import each other, and the kernel imports no slice; the composition root wires both directions.

**One source shape.** Every `.lss` is a whole script. There is no modular
folder, no compilation, no manifest and no fragment assembly anywhere in this
repo: the decompiler left on 2026-10-23 and the compile/manifest pipeline was
deleted together with the LSP's module-aware checking. `dist/` is not part of
the repo and does not exist on disk — there is no build step.

---

## 1. Repo-level files

| File | Lines | Purpose |
|---|---:|---|
| `index.ts` | 310 | Composition root. The single entry point (`pi.extensions: ["./index.ts"]`). Wires every slice onto `ExtensionAPI`, hands the kernel its three slice capabilities (`getGotchasSummary`, `searchGotchas`, `computeScorecard`), holds the subagent-recursion guard (`PI_SUBAGENT`/`PI_CHILD_SESSION` early return), and counts every hook invocation for the telemetry panel. |
| `package.json` | — | Manifest. `"type": "module"`; core packages in `peerDependencies: {"*": "*"}` (never `dependencies`); `files: [index.ts, src, skills, README.md, LICENSE, package.json]`; `test` runs the seven tsx suites. |
| `tsconfig.json` | — | TypeScript config used by `npx tsc --noEmit` (no emit, no `dist`). |
| `AGENTS.md` | 62 | Repo-local agent instructions (whole-file-only hard rules, VSA layout, UX contracts). |
| `README.md` | 124 | User-facing plugin documentation. |
| `FILE-MAP.md` | — | This file. |
| `.gitignore` | 14 | Ignores `node_modules`, `dist`, logs, `.uma/`, `runtime/`, the local `docs/archive/` and the SPAI vector cache. The SPAI backlog (`docs/spai/*.md`) **is** versioned. |

---

## 2. Skill (`skills/lotusscript-modular/`)

Model-facing instructions. This is what the agent reads to decide what to do;
the code in §3–§6 is what actually executes. Advertised **only** through
`resources_discover` (`src/slices/project/resources.ts`), never through a
`skills` entry in `package.json` — that entry would be unconditional and would
offer a LotusScript manual in every repository.

| File | Lines | Purpose |
|---|---:|---|
| `SKILL.md` | 226 | Frontmatter (`name: lotusscript-modular`) + the operating manual: context-detection table, whole-file contract, check tool, scaffold fast path, Definition of Done, self-improvement loop, architecture map, language policy. |
| `references/workflow.md` | 81 | Whole-file lifecycle: edit → check → Designer paste, and the tool/command table. |
| `references/coding-conventions.md` | 200 | Domino 9.0.1 coding conventions — comment style, header shape, naming prefixes, error handling. |
| `references/scaffolding.md` | 111 | Scaffold reference: skeleton types, `/ls scaffold` grammar, `lotusscript_scaffold` parameter table, per-skeleton guarantees, template-source rules. |
| `references/libraries-and-versioning.md` | 157 | Script libraries, `Use` rules, `VERZE`/`CHANGELOG` policy, deployment order, `Recompile All`, error 151. |
| `references/naming-conventions.md` | 116 | Alias grammar and the type→prefix table (`ag_`, `lib_`, `frm_`, …). |
| `references/reuse-ladder.md` | 85 | "Does this already exist?" ladder: doclink → button → agent → new code, and what to refuse. |
| `references/domino-search-and-access.md` | 92 | Searching an ODP/DXL export, ACL/visibility/deploy reachability, real-database pitfalls. |
| `references/object-model.md` | 77 | Notes class/member verification, back-end vs UI classes, dataset queries. |
| `references/lotus-class-index.md` | 103 | Class index into the `ls-classmap` JSON dataset (signatures). |
| `references/dxl-and-odp.md` | 62 | DXL/ODP design-element reference (forms, views, agents, ODP). |
| `references/formula-language.md` | 150 | Formula-language best practices (Guirard ch. 4): `@Db*` cache modes, `[FailSilent]`, field types, lists-not-loops, formula/DXL escaping. |
| `references/gotchas-index.md` | 106 | 64-entry one-liner index of the bundled gotchas + the `lotus-notes` KB layer table and search recipes. |

---

## 3. `src/shared/` — the kernel

Imported by slices. Contains **no** import from `src/slices/` — anything a
helper needs from a slice arrives as a capability object from the composition
root (`InsightsCapabilities`).

| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `types.ts` | 160 | `ModularConfig`, `SkillPromptMode`, `SkillPromptChoice`, `ProjectEvidenceKind`, `ProjectFingerprint`, `HookName`, `HookTelemetry`, `ScorecardItem`, `AgentScorecard`, `ScorecardInput`, `LspCheckResult`, `GotchaItem`, `GotchaReviewResult`, `SettingsCompletion` | All cross-slice type declarations. `ModularConfig` is the single knob set (21 catalogue settings); `ProjectFingerprint` is the bounded project scan result. |
| `config.ts` | 116 | `DEFAULT_CONFIG`, `GLOBAL_CONFIG_FILE`, `projectConfigPath`, `loadConfig`, `saveConfig` | Config resolution: global `~/.pi/agent/lotusscript-modular.json` merged with project `.pi/lotusscript-modular.json`, project wins. Also **drops retired modular keys** (`autoRecompileOnSave`, `cleanupOnSettled`, `keepTimestampInCompiledName`, `overwriteSourceLss`, `checkProcedureLimits`, `maxProcedureLines`, `enforceCzechComments`) so a stale file cannot revive removed behaviour. |
| `paths.ts` | 43 | `isLotusScriptSource`, `isDxlSource`, `isLotusScriptOrDxl`, `isFormulaSource`, `isLooseScript`, `sanitizeFileName` | Extension predicates for one whole file — no folder/part resolution exists. |
| `i18n.ts` | 239 | `LOCALES`, `Locale`, `DEFAULT_LOCALE`, `SettingCopy`, `Strings`, `normalizeLocale`, `stringsFor` | The string-table contract. Every key resolves from a locale row; parity is enforced by `test_i18n.ts`. |
| `i18n-cs.ts` / `i18n-en.ts` | 311 each | `STRINGS_CS`, `STRINGS_EN` | The two complete locale tables (user-facing text only). |
| `state.ts` | 305 | `PluginState`, `createPluginState` | Session kernel: config, cwd, scorecard history, pre-flight banner cache, diagnostics history, version/drift/trace bookkeeping, KB flags, banner + statusline rendering. `createPluginState(capabilities)` takes the slice capabilities the kernel may not import. |
| `state-insights.ts` | 160 | `InsightsCapabilities`, `StateInsightsDeps`, `StateInsights`, `createStateInsights` | Scorecard building/recording, file-token collection and the pre-flight gotcha banner. Pure over `deps` — gotchas and scorecard arrive as injected functions. |
| `state-telemetry.ts` | 121 | `TELEMETRY_WIDGET_KEY`, `createTelemetry`, `totalHookCalls`, `telemetryLines`, `TelemetryPanelComponent`, `renderTelemetryPanel`, `clearTelemetryPanel` | In-TUI telemetry panel; width-safe (`visibleWidth`/`truncateToWidth`), localized through the string table. |

---

## 4. `src/slices/project/` — bounded detection + entry-skill consent

| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `detect.ts` | 161 | `MAX_DEPTH`, `MAX_ENTRIES`, `BUDGET_MS`, `DetectOptions`, `detectLotusScriptProject`, `ProjectDetector`, `createProjectDetector` | Shallowest-first BFS for the first evidence file (`.lss`/`.lsa`/`.dxl`/`.fl`/`.ls`). Skips `.git`, `node_modules`, `bin`, `obj`, `dist`, `target`, caches and hidden directories; stops at the first hit; reports `truncated` when a cap ended the scan. Memoizes one scan per session root. **Never a repository walk.** |
| `resources.ts` | 45 | `SkillResources`, `discoverSkillResources` | **The only advertisement of the skill.** Answers `resources_discover`: `{ skillPaths: [SKILL.md] }` in a Domino project, `{}` otherwise and on `skillPrompt: never`. |
| `policy.ts` | 60 | `SkillPromptDecision`, `skillPromptDecision`, `SkillChoiceOutcome`, `skillChoiceOutcome`, `wrapSkillMessage` | Pure consent policy: evidence + `skillPrompt` → `ask`/`load`/`skip`; modal answer → load + optional persisted `never`. |
| `prompt-modal.ts` | 173 | `LotusSkillPromptComponent`, `promptSkillConsent` | The lotus consent modal: one static glyph (no timer), evidence line, three choices, width-safe, `undefined` outside the TUI. |
| `skill-source.ts` | 53 | `getEntrySkillPath`, `hasEntrySkill`, `readEntrySkillBody` | Absolute path of the bundled SKILL.md + existence/read guards, so a trimmed package degrades to "nothing loaded". |
| `hints.ts` | 58 | `buildProjectSkillGuideline`, `buildReadSkillNotice` | Pure model-facing English text: the system-prompt routing paragraph and the entry-skill block in every `.lss` read banner. |
| `index.ts` | 31 | barrel | Slice exports; no logic. |

> **Review note:** detection is deliberately *shallow*. `.pi/tmp/…/main.lss` and vendored fixtures can match — the result therefore only decides whether to *ask* or to *point* at the skill, never what the code should look like.

---

## 5. `src/slices/pipeline/` — event translation

| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `tool-call.ts` | 48 | `handleToolCall` | KB edit gate + KB-search telemetry. Reads pass through untouched. |
| `tool-result.ts` | 242 | `handleToolResult` | Read banner for `.lss`; on edit: whole-file auto-check (LSP → scorecard → recurring gotchas), versioning/drift nudges, telemetry. Sets `lastCheckedFile`. |
| `settled.ts` | 70 | `SettledDeps`, `handleAgentSettled` | At settle: final whole-file check of `lastCheckedFile`, scorecard, and the debrief for unmet DoD items. Writes and deletes nothing. |
| `before-settle.ts` | 44 | `handleAgentBeforeSettle` | One-shot KB verification turn when a run mutated sources below `minKbSearchesPerRun`. |
| `guidelines.ts` | 65 | `buildPromptGuidelines` | System-prompt text: KB protocol, gotchas, whole-file source shape, rubric. |
| `read-banner.ts` | 68 | `readBanner`, `suggestedKbQueries` | Banner on reading a `.lss`: whole-file orientation, LSP state, KB protocol, pre-flight gotchas, entry-skill pointer. |
| `recurring-gotcha.ts` | 72 | `draftRecurringGotcha` | Auto-drafts a gotcha when the same diagnostic signature repeats across checks of one file. |
| `mutating-tools.ts` | 11 | `MUTATING_TOOL_NAMES` | `edit` / `write` — the only mutating tools. |
| `shared.ts` | 19 | `ToolResultEventResultShape`, `baseToolName` | Structural event mirror + `mcp__server__tool` name helper. |
| `deps.ts` | 81 | `GuardBlockLite`, `PipelineDeps` | Slice-isolation seam. |
| `index.ts` | 14 | barrel | Slice exports; no logic. |

---

## 6. `src/slices/` — the remaining features

### commands — `/ls`
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 98 | `RegisteredLsCommand`, `createLsCommand` | Dispatcher: `status` / `config` / `lsp` / `lang` / `scaffold` / `score` / `check` / `gotchas` / `audit` / `help`, direct setting access, `--global`. |
| `ls-config.ts` | 151 | `LsParts`, `lsStatus`, `lsLang`, `lsLsp`, `lsDirectSetting`, `lsConfig`, `lsHelp` | Config menu + help, current value annotated in the picker. |
| `ls-inspect.ts` | 71 | `lsScaffold`, `lsScore` | Scaffold execution and scorecard/trend rendering. |
| `ls-check.ts` | 52 | `lsCheck` | `/ls check <file.lss>` — whole-file 9.0.1 check + scorecard. |
| `ls-gotchas.ts` | 54 | `lsGotchas` | Gotcha query. |
| `ls-audit.ts` | 39 | `lsAudit` | Duplicated-procedure audit for a folder. |
| `deps.ts` | 82 | `SettingSpecLite`, `ParseValueResult`, `SettingCopyLite`, `AuditResultLite`, `ScaffoldOptionsLite`, `ScaffoldResultLite`, `CommandsDeps` | Slice-isolation seam. |

### tools — model tools
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 28 | `registerModelTools` | Registers the four tools (check / scaffold / gotchas / library-audit). |
| `compile-tool.ts` | 58 | `registerCompileTools` | `lotusscript_check` — whole-file 9.0.1 compiler-oracle check (+ `lsp_explain` help pages). Kept under the historical file name. |
| `scaffold-tool.ts` | 71 | `registerScaffoldTool` | `lotusscript_scaffold`; `StringEnum(["agent","library"])`; `date` pins the header date for a reproducible scaffold. |
| `gotchas-tool.ts` | 142 | `registerGotchasTool` | `lotusscript_gotchas` — search / summary / add with modal approval. |
| `audit-tool.ts` | 41 | `registerAuditTool` | `lotusscript_library_audit` — duplicate-procedure ranking (+ optional promotion plan). |
| `deps.ts` | 66 | `AuditResultFull`, `ScaffoldOptionsFull`, `ScaffoldResultFull`, `ToolsDeps` | Slice-isolation seam. |

### gotchas — trap catalogue
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `gotchas.md` | 1346 | *(data asset)* | The 64 seeded traps, `---`-delimited `##` entries. Parsed at runtime. |
| `catalogue.ts` | 272 | `getEffectiveGotchasPath`, `getAllGotchas`, `searchGotchas`, `getGotchasSummary`, `addGotcha` | **User-owned global copy** at `~/.pi/lotusscript/gotchas.md` (override: `LOTUSSCRIPT_GOTCHAS_DIR`). Seeds from the bundled file on first use, then keeps it in sync: superseded titles are dropped, bundled entries missing from the copy are appended, operator entries are never touched. `addGotcha` appends only to the global file. Parses `## ` as an entry boundary **only after a `---` separator**, so `## Sub-heading` inside a body stays body text. mtime-cached. |
| `review-modal.ts` | 297 | `GotchaReviewComponent`, `promptGotchaReview` | TUI approval modal for a newly drafted gotcha. |
| `index.ts` | 13 | barrel | Slice exports; no logic. |

### scorecard — deterministic evaluation
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `compute.ts` | 237 | `computeScorecard`, `trendLabel`, `formatScorecard`, `buildGradingRubric`, `normalizeDiagnostics`, `findRecurringSignatures`, `buildRecurringGotchaDraft` | Two weighted items only (`lsp-clean`, `kb-consulted`, `+2` each) plus rubric and recurring-draft helpers. `normalizeDiagnostics` masks line **and column** numbers. |
| `index.ts` | 8 | barrel | Slice exports; no logic. |

### lsp — domino oracle
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `lsp-check.ts` | 264 | `checkLotusScriptDiagnostics` | Whole-file diagnostics through the notes-sys `domino-mcp.exe` MCP lane; parses the Rust output (`Checked … as a whole script`, `✔ Clean: no compiler diagnostics`) and classifies oracle failures as harness problems, never as code verdicts. |
| `mcp-client.ts` | 220 | `DEFAULT_MCP_SERVER`, `mcpServerCommand`, `extractLspErrorCodes`, `explainLotusScriptCodes`, `formatLotusScriptFile` | Automation lane: `lsp_explain`, `lsp_format`. `mcpServerCommand` runs a `.js` path under Node and any other path (the Rust exe) directly. |
| `index.ts` | 5 | barrel | Slice exports; no logic. |

### scaffold — code generation
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 147 | `ScaffoldTargetType`, `ScaffoldResult`, `scaffoldLotusScriptArtifact` | Whole-file scaffold driver: template → substitution → alias → Designer notice. Refuses to overwrite. |
| `templates.ts` | 169 | `ScaffoldOptions`, `formatCurrentDate`, `fillTemplate`, `agentTemplate`, `libraryTemplate` | Built-in fallbacks for the shipped template. |
| `template-source.ts` | 24 | `getBundledTemplatePath` | Resolves the shipped `template.lss` next to the source (works from the git checkout and a package install). |
| `template.lss` | 114 | *(data asset)* | The versioned template (header, `VERZE`/`CHANGELOG`, `Option Public`/`Declare`, `On Error GoTo` + `SendErrorEmail`). |
| `naming.ts` | 146 | `normalizeAscii`, `suggestAlias`, `NoticeInfo`, `buildDesignerNotice` | Alias derivation and the paste-ready Designer registration notice. |

### settings — catalogue + completions
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `catalogue.ts` | 85 | `SettingKind`, `SettingSpec`, `SETTING_SPECS`, `findSetting`, `settingCopy`, `parseValue`, `formatValue` | Declarative catalogue of every `ModularConfig` setting (retired keys removed). All prose lives in the i18n table. |
| `complete.ts` | 278 | `completeLsArguments` | Multi-level autocompletion with the trailing-space contract. |
| `index.ts` | 8 | barrel | Slice exports; no logic. |

### guards
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 36 | `GuardBlock`, `guardKbBeforeEdit` | Hard-gates `.lss`/`.dxl` edits behind a `kb_search` on `lotus-notes`. No plugin-generated files exist to protect. |

### audit — duplication → library
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 258 | `ProcFact`, `DupGroup`, `AuditReport`, `extractProcedures`, `findDuplicates`, `auditProject`, `renderAudit`, `AuditResultLite`, `auditForCommand`, `suggestLibraryName`, `renderPlan`, `auditForTool` | Read-only scan of `.lss` files: identical procedure bodies across files, ranked by saved lines (`lines × (files−1)`), plus a promotion plan. |

### versioning — `VERZE`/`CHANGELOG`
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 62 | `observeVersionHeader`, `checkVersioning` | Per-file baseline and once-per-file-per-run nudge. |
| `header.ts` | 102 | `VersionBlock`, `extractVersionBlock`, `VersioningVerdict`, `evaluateVersioning`, `suggestNextVersion` | Pure header parsing/verdict logic. |
| `messages.ts` | 49 | `VERSIONING_REFERENCE`, `missingNotice`, `unchangedNotice` | Paste-ready English notices. |

### drift — library re-implementation
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 68 | `checkDrift` | Once per file per run: warn when an agent re-implements what a sibling `lib_` file already owns. |
| `signals.ts` | 80 | `DriftSignal`, `DRIFT_SIGNALS`, `DriftHit`, `findDrift`, `isLibraryFile` | Signal table (HTTP COM, MSXML fallback, endpoint literal, local error report, `notes://` builder) and the detector. |

### trace — visible skill trace
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 35 | `TraceSink`, `emitTrace` | Emits a checkpoint to the UI (`notify`), deduped per session; never enters model context. |
| `vocab.ts` | 107 | `TraceKind`, `TraceEvent`, `traceLine`, `traceKey`, `traceTag`, `traceTail` | Locale-aware rendering, dedupe keys, statusline tail. |

---

## 7. Tests

`npm test` runs seven suites; every check prints PASS/FAIL and the file exits
non-zero on failure (no log-only assertions).

| File | Lines | Covers |
|---|---:|---|
| `test/helpers.ts` | 123 | Temp workspace, `SAMPLE_LSS` fixture, `writeLss`, `mockCtx`, `mockPi`, `MOCK_THEME`, `createTestState` (a `PluginState` wired like the composition root). |
| `test/test_i18n.ts` | 134 | Deep locale parity, catalogue copy, telemetry/completion rendering in both locales, `normalizeLocale`, help parity, Czech-free model surface. |
| `test/test_workflow.ts` | 35 | Phase runner + cleanup. |
| `test/test_versioning.ts` | 102 | `VERZE`/`CHANGELOG` detection, bump suggestions, paste-ready notices. |
| `test/test_drift.ts` | 94 | Drift signals, commented-out code, library-vs-agent, once-per-run latch. |
| `test/test_trace.ts` | 68 | Trace rendering in both locales, dedupe keys, statusline tail, switch. |
| `test/test_audit.ts` | 106 | Procedure extraction, duplicate grouping, saved-lines ranking, stable library name, promotion plan. |
| `test/test_gotchas.ts` | 141 | Registry parsing (sub-heading is body text), supersede + re-seed sync, operator entries preserved, idempotency, seeding, no removed tool names. |
| `test/phases/phase-scorecard.ts` | 109 | Full-marks clean file, failure rendering, trend, pending LSP semantics, rubric, normalisation, recurring draft. |
| `test/phases/phase-pipeline.ts` | 201 | KB gate, auto-check on edit + telemetry, `.dxl` tracking, oversized procedure not blocked, read banner, entry-skill pointer, settle nudge + latch. |
| `test/phases/phase-commands.ts` | 117 | `/ls` menu, absence of modular subcommands, scaffold completions, catalogue ↔ config parity, parse/format, retired-key dropping. |
| `test/phases/phase-tools.ts` | 147 | `lotusscript_check` + `lotusscript_scaffold` + `lotusscript_gotchas` registration and execution, pinned date, overwrite refusal. |
| `test/phases/phase-project.ts` | 282 | Detection (root/nested/formula/DXL/loose `.ls`, skip list, caps, caching), path protocol, bundled skill presence, hint builders, consent policy + typo fallback, modal width safety, `resources_discover` matrix. |
| `test/phases/phase-extension.ts` | 163 | Composition root: tools, command, every hook, subscription draining, injected guidelines, consent flow (modal → skill injected once → discovery advertises → `never` persisted → next session silent). |

---

## 8. Data assets

| Asset | Location | Owner | Update path |
|---|---|---|---|
| `template.lss` | `src/slices/scaffold/template.lss` (shipped, git-tracked) | **Developer** | Edit in the repo → push → `pi update`. Never edit the installed checkout — it is a git working tree that `pi update` reconciles. |
| `gotchas.md` | `src/slices/gotchas/gotchas.md` (bundled seed) → `~/.pi/lotusscript/gotchas.md` | **Split:** seed by the developer, user copy by the operator | Approved gotchas are appended to the global copy only. Seed corrections reach an existing copy through the load-time sync (superseded titles dropped, missing bundled entries appended); user entries are never overwritten. |

---

## 9. Known gaps

- `naming.ts` **diverges from the project's own naming convention**: no domain segment, 6-char per-segment truncation, and an allow-list that preserves trailing `save`/`mail`/`ifx`/`z`/`do` tokens — the convention calls that a copy-smell.
- No code-quality lint remains: the plugin reports compiler diagnostics + KB usage only.
- Plugin/package/skill names still say "modular" while the feature set no longer is — deliberate (SPAI-009 cancelled), not an oversight.
- `compile-tool.ts` keeps the historical file name although the tool is `lotusscript_check` (renaming it is cosmetic churn).
- The drift signals are heuristics over source text; they nudge, they never block.
