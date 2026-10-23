# File Map — pi-lotusscript-modular

Inventory of every file the plugin and its skill use, with a description of each.
Written for a **review agent**: each entry states what the file is responsible
for, what it exports, and where the risk sits. Line counts are from the working
tree at the whole-file workflow commit.

- **Repo root:** `D:\01_programovani\pi\plugins\pi-lotusscript-modular`
- **Engine:** `@earendil-works/pi-coding-agent` (installed = npm latest, aligned)
- **Target platform:** IBM Notes/Domino 9.0.1, LotusScript
- **Architecture:** Vertical Slice Architecture (VSA) — thin composition root, `src/shared/` kernel, `src/slices/<feature>/`. Slices never import each other, only via `src/shared/`.

**One source shape.** Every `.lss` is a whole script. There is no modular
folder, no compilation, no manifest and no fragment assembly anywhere in this
repo: the decompiler left on 2026-10-23 and the compile/manifest pipeline was
deleted together with the LSP's module-aware checking.

---

## 1. Repo-level files

| File | Lines | Purpose |
|---|---:|---|
| `index.ts` | 205 | Composition root. The single entry point (`pi.extensions: ["./index.ts"]`). Wires every slice's registration into the `ExtensionAPI`, holds the subagent-recursion guard (`PI_SUBAGENT`/`PI_CHILD_SESSION` early return), and counts every hook invocation for the telemetry panel. |
| `package.json` | — | Manifest. `"type": "module"`; core packages in `peerDependencies: {"*": "*"}` (never `dependencies`); `files: [index.ts, src, skills, README.md, LICENSE, package.json]`; `test` script runs the tsx harness. |
| `tsconfig.json` | — | TypeScript config used by `npx tsc --noEmit`. |
| `AGENTS.md` | — | Repo-local agent instructions. |
| `README.md` | — | User-facing plugin documentation. |
| `FILE-MAP.md` | — | This file. |

> **Review note:** there is **no build step**. `dist/` exists on disk but is untracked, and pi loads `index.ts` (TypeScript) directly. This matters for `template.lss` — see §4.

---

## 2. Skill (`skills/lotusscript-modular/`)

Model-facing instructions. This is what the agent reads to decide what to do;
the code in §3–§6 is what actually executes.

| File | Lines | Purpose |
|---|---:|---|
| `SKILL.md` | ~205 | Frontmatter (`name: lotusscript-modular`) + the operating manual: whole-file contract, check tool, Scaffold Fast Path, Definition of Done, architecture map, language policy. Loaded by pi's skill discovery. |
| `references/workflow.md` | ~90 | Whole-file lifecycle: edit → check → Designer paste, and the CLI/tool table. |
| `references/scaffolding.md` | ~120 | Scaffolding reference: which skeleton type to use, `/ls scaffold` grammar, `lotusscript_scaffold` parameter table, per-skeleton guarantees, template-source rules. |
| `references/coding-conventions.md` | 199 | LotusScript coding conventions for Domino 9.0.1 — comment style, header shape, naming prefixes, error handling. |
| `references/gotchas-index.md` | 101 | Index of the bundled gotchas + the `lotus-notes` KB layer table and search recipes. |
| `references/naming-conventions.md` | 117 | Alias grammar and the type→prefix table (`ag_`, `lib_`, …). |
| `references/dxl-and-odp.md` | 66 | DXL/ODP design-element reference (forms, views, agents, ODP). |
| `references/formula-language.md` | 150 | Formula-language best practices (Guirard ch. 4): `@Db*` cache modes, `[FailSilent]`, field types, lists-not-loops, `@Today` in views, formula/DXL escaping. Names the KB layers and cites `kapitola-04..07`. |

---

## 3. `src/shared/` — the kernel

Imported by slices. No slice may import another slice.

| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `types.ts` | 200 | `ModularConfig`, `HookName`, `HookTelemetry`, `CommentStyle`, `CommentAnalysis`, `ScorecardItem`, `AgentScorecard`, `ScorecardInput`, `ProcedureLintItem`, `FileLintResult`, `LspCheckResult`, `GotchaItem`, `GotchaReviewResult`, `SettingsCompletion`, `ProjectFingerprint`, `SkillPromptMode`, `SkillPromptChoice` | All cross-slice type declarations. `ModularConfig` is the single knob set (20 catalogue settings); `ProjectFingerprint` is the bounded project scan result; `ProcedureLintItem` carries `filePath` + `startLine` for a procedure inside a whole file. |
| `config.ts` | 115 | `DEFAULT_CONFIG`, `GLOBAL_CONFIG_FILE`, `projectConfigPath`, `loadConfig`, `saveConfig` | Config resolution: global `~/.pi/agent/lotusscript-modular.json` merged with project `.pi/lotusscript-modular.json`, project wins. Also **drops retired modular keys** (`autoRecompileOnSave`, `cleanupOnSettled`, `keepTimestampInCompiledName`, `overwriteSourceLss`, `checkProcedureLimits`, `maxProcedureLines`, `enforceCzechComments`) so a stale file cannot revive removed behaviour. |
| `paths.ts` | 40 | `isLotusScriptSource`, `isDxlSource`, `isLotusScriptOrDxl`, `isFormulaSource`, `isLooseScript`, `sanitizeFileName` | Path protocol only — the modular-root/monolith detection helpers were deleted with the pipeline. `isFormulaSource` (`.fl`) and `isLooseScript` (`.ls`) are evidence-only: they never compile, gate or banner. |
| `state.ts` | 295 | `PluginState`, `createPluginState` | Runtime state container wiring config + session + gate objects. Owns `telemetry`, `countHook`, `lastCheckedFile` (the file the settle debrief grades) and `beginRun()` per-run resets. |
| `state-insights.ts` | 157 | `StateInsightsDeps`, `StateInsights`, `createStateInsights` | Derived session insights: scorecard build/history, `collectFileTokens(filePath)` (declarations of ONE file), pre-flight gotcha banner. |
| `state-telemetry.ts` | 126 | `createTelemetry`, `totalHookCalls`, `telemetryLines`, `TelemetryPanelComponent`, `renderTelemetryPanel`, `clearTelemetryPanel`, `TELEMETRY_WIDGET_KEY` | In-TUI telemetry panel (`setWidget` aboveEditor, Component factory, width-safe). Tracks hook usage, KB-gate blocks, whole-file checks and the last LSP outcome. |
| `i18n.ts` / `i18n-cs.ts` / `i18n-en.ts` | 263 / 327 / 327 | `Strings`, `stringsFor`, `normalizeLocale`, `LOCALES`, `STRINGS_CS`, `STRINGS_EN` | The complete user-facing string table. Every key exists in both locales (compile-time via `Record<Locale, Strings>`, test-time via `test/test_i18n.ts`). |

---

## 4. `src/slices/scaffold/` — code generation

Generates new whole-file LotusScript sources.

| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `template.lss` | 114 | *(data asset)* | **The shipped template.** Versioned header (NÁZEV/ÚČEL/AUTOR/VYTVOŘENO/ZÁVISLOSTI + VERZE + CHANGELOG), `ERROR_NOTIFY_EMAIL$`/`MAIL_SERVER$`/`MAIL_DB$` header constants, `LSI_THREAD_*` block, `SendErrorEmail` helper, `Initialize` with `On Error GoTo ErrorHandler`. |
| `templates.ts` | 185 | `ScaffoldOptions`, `formatCurrentDate`, `fillTemplate`, `agentTemplate`, `libraryTemplate` | `fillTemplate` substitutes the `<…>` placeholders (pure, no fs, no clock). The two `*Template` functions are the **fallback** skeletons used only if `template.lss` cannot be read. |
| `template-source.ts` | 24 | `getBundledTemplatePath` | Resolves the template to `template.lss` **inside the installed package**, so template and code are always the same version. |
| `index.ts` | 147 | `scaffoldLotusScriptArtifact`, `ScaffoldTargetType` (`"agent" \| "library"`), `ScaffoldResult` + re-exports | Orchestrates the two scaffold types, refuses to overwrite, derives the alias, builds the Designer notice. |
| `naming.ts` | 146 | `normalizeAscii`, `suggestAlias`, `NoticeInfo`, `buildDesignerNotice` | Alias derivation and the Czech/English Designer-registration notice. |

> **Review note:** `template.lss` declares `LSI_THREAD_*` itself. That is required for a standalone `.lss` outside Designer but is a **compile error** when pasted into a Script Library / design element (`LSPRVAL.LSS` is auto-included there). The file warns about this in Czech; nothing enforces it.

---

## 5. `src/slices/` — the other features

### guards — instant-failure prevention
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 35 | `GuardBlock`, `guardKbBeforeEdit` | Hard-gates `.lss`/`.dxl` edits behind a `kb_search` on the `lotus-notes` collection. No protected-file guard remains: the plugin generates nothing behind the agent's back. |

### commands — `/ls` slash commands
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 90 | `RegisteredLsCommand`, `createLsCommand` | `/ls` dispatcher (`status` / `check` / `lint` / `score` / `scaffold` / `gotchas` / `config` / `help`, direct setting access, `--global`). |
| `ls-check.ts` | 64 | `lsCheck` | `/ls check <file.lss>` — whole-file 9.0.1 check + scorecard. |
| `ls-inspect.ts` | 115 | `lsScaffold`, `lsLint`, `lsScore` | Scaffold + per-file lint/score inspection. |
| `ls-config.ts` | 154 | `LsParts`, `lsStatus`, `lsLsp`, `lsDirectSetting`, `lsConfig`, `lsHelp` | Config menu with current-value annotation. |
| `ls-gotchas.ts` | 48 | `lsGotchas` | Gotcha query. |
| `deps.ts` | 85 | `CommandsDeps` + structural option/result types | Slice-isolation seam (no compile/lint capabilities at all — the command slice only asks the LSP and the scorecard). |

### tools — model tools
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 17 | `registerModelTools` | Registers the three tools. |
| `compile-tool.ts` | 66 | `registerCompileTools` | `lotusscript_check` — whole-file IBM 9.0.1 compiler-oracle check (+ `lsp_explain` help pages). Kept under the historical file name. |
| `scaffold-tool.ts` | 78 | `registerScaffoldTool` | `lotusscript_scaffold`. TypeBox schema with `StringEnum(["agent","library"])`; `date` pins the header date for a reproducible scaffold. |
| `gotchas-tool.ts` | 142 | `registerGotchasTool` | `lotusscript_gotchas`. |
| `deps.ts` | 62 | `ToolsDeps`, `ScaffoldOptionsFull`, `ScaffoldResultFull` | Slice-isolation seam (LSP / gotchas / scaffold only). |

### pipeline — event translation
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `tool-call.ts` | 45 | `handleToolCall` | KB edit gate + KB-search telemetry. Reads pass through untouched. |
| `tool-result.ts` | 253 | `handleToolResult` | Read banner for `.lss`; on edit: whole-file auto-check (lint → LSP → scorecard → recurring gotchas), notices, telemetry. Sets `lastCheckedFile`. |
| `settled.ts` | 66 | `handleAgentSettled`, `SettledDeps` | At settle: final whole-file check of `lastCheckedFile`, scorecard, and the debrief for unmet DoD items. Nothing is written or deleted. |
| `before-settle.ts` | 50 | `handleAgentBeforeSettle` | One-shot KB verification turn when a run mutated sources below `minKbSearchesPerRun`. |
| `guidelines.ts` | 60 | `buildPromptGuidelines` | System-prompt text: KB protocol, gotchas, purpose-comment rule, rubric, whole-file source shape. |
| `recurring-gotcha.ts` | 70 | `draftRecurringGotcha` | Auto-drafts a gotcha when the same diagnostic signature repeats across checks of the same file. |
| `read-banner.ts` | 62 | `readBanner`, `suggestedKbQueries` | Banner on reading a `.lss`: whole-file orientation, LSP state, KB protocol, pre-flight gotchas. |
| `mutating-tools.ts` | 12 | `MUTATING_TOOL_NAMES` | `edit` / `write` — the only mutating tools left. |
| `shared.ts` | 19 | `ToolResultEventResultShape`, `baseToolName` | Small shared helpers. |
| `index.ts` | 11 | re-export | Barrel. |
| `deps.ts` | 66 | `PipelineDeps`, `GuardBlockLite` | Slice-isolation seam. |

### project — bounded detection + entry-skill consent
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `detect.ts` | 175 | `detectLotusScriptProject`, `createProjectDetector`, `ProjectDetector`, `DetectOptions`, `MAX_DEPTH` (2), `MAX_ENTRIES`, `BUDGET_MS` | Shallowest-first BFS for the first evidence file (`.lss`/`.lsa`/`.dxl`/`.fl`/`.ls`). Skips `.git`, `node_modules`, `bin`, `obj`, `dist`, `target`, caches and hidden directories; stops at the first hit; reports `truncated` when a cap ended the scan. The detector memoizes one scan per session root. **Never a repository walk** — it runs on the first run / first `.lss` read. |
| `skill-source.ts` | 50 | `getEntrySkillPath`, `hasEntrySkill`, `readEntrySkillBody` | Absolute path of the bundled `skills/lotusscript-modular/SKILL.md` (same versioning rule as `scaffold/template.lss`), plus existence/read guards so a trimmed package degrades to "nothing loaded" instead of a dead path or a thrown error. |
| `hints.ts` | 58 | `buildProjectSkillGuideline`, `buildReadSkillNotice` | Pure model-facing English text: the system-prompt routing paragraph (only with evidence) and the entry-skill block injected into every `.lss` read banner. |
| `resources.ts` | 50 | `discoverSkillResources`, `SkillResources` | **The only advertisement of the skill.** Answers pi's `resources_discover` hook: `{ skillPaths: [SKILL.md] }` in a Domino project, `{}` otherwise — and `{}` when the operator opted out (`skillPrompt: never`). The package deliberately declares no `skills` entry in `settings.json` `packages[]`: that entry is unconditional (a LotusScript manual offered in every repository) and pi would report a name collision. |
| `policy.ts` | 60 | `skillPromptDecision`, `skillChoiceOutcome`, `wrapSkillMessage`, `SkillPromptDecision`, `SkillChoiceOutcome` | Pure consent policy: evidence + `skillPrompt` → `ask`/`load`/`skip` (a non-Domino tree or a typo never auto-loads); modal answer → load + optional persisted `never`; body → context message naming the reference directory. |
| `prompt-modal.ts` | 173 | `LotusSkillPromptComponent`, `promptSkillConsent` | The lotus consent modal: one static 🪷 glyph (no timer, no per-frame animation — the overlay host centres the box from the rendered line count, so a ticking frame made the window jump and resize), the evidence line, and three choices (`load` / `skip` / `never ask here`). Width-safe via `truncateToWidth`; keys ↑↓/Tab, Enter, `y`/`n`/`v`, Esc. Returns undefined outside the TUI. |
| `index.ts` | 25 | barrel | Slice exports; no logic. |

> **Review note:** detection is deliberately *shallow*. `.pi/tmp/…/main.lss`, `func_*.lss` and vendored test fixtures can and do match — the result therefore only decides whether to *ask* or to *point* at the skill, never what the code should look like.

### settings — slash-command completion
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `catalogue.ts` | 96 | `SettingKind`, `SettingSpec`, `SETTING_SPECS`, `findSetting`, `settingCopy`, `parseValue`, `formatValue` | Declarative catalogue of every `ModularConfig` setting (retired keys removed). |
| `complete.ts` | 275 | `completeLsArguments` | Multi-level autocompletion with the trailing-space contract. |
| `index.ts` | 10 | re-export | Barrel. |

### scorecard / lsp
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `scorecard/compute.ts` | 273 | `computeScorecard`, `trendLabel`, `formatScorecard`, `buildGradingRubric`, `normalizeDiagnostics`, `findRecurringSignatures`, `buildRecurringGotchaDraft` | Deterministic per-file DoD scorecard (comments, LSP, KB — no size item) + rubric. `normalizeDiagnostics` masks line **and column** numbers. |
| `scorecard/index.ts` | 8 | re-export | Barrel. |
| `lsp/lsp-check.ts` | 225 | `checkLotusScriptDiagnostics` | Whole-file diagnostics through the notes-sys `domino-mcp.exe` MCP lane; parses the Rust output (`Checked … as a whole script`, `✔ Clean: no compiler diagnostics`) and classifies oracle failures as harness problems, never as code verdicts. |
| `lsp/mcp-client.ts` | 225 | `DEFAULT_MCP_SERVER`, `mcpServerCommand`, MCP-over-stdio helpers | Automation lane (SPAI-008): `lsp_explain`, `lsp_format`. `mcpServerCommand` runs a `.js` path under Node and any other path (the Rust exe) directly. |
| `lsp/index.ts` | 1 | re-export | Barrel. |

### gotchas — trap catalogue
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `gotchas.md` | 1358 | *(data asset)* | The traps, `##`-delimited. Parsed at runtime. |
| `catalogue.ts` | 153 | `getEffectiveGotchasPath`, `getAllGotchas`, `searchGotchas`, `getGotchasSummary`, `addGotcha` | **User-owned global copy** at `~/.pi/lotusscript/gotchas.md`, seeded from the bundled file on first use and never overwritten. `addGotcha` appends **only** to the global file. mtime-cached. |
| `review-modal.ts` | 297 | `GotchaReviewResult`, `GotchaReviewComponent`, `promptGotchaReview` | TUI approval modal for a newly drafted gotcha. |
| `index.ts` | 13 | re-export | Barrel. |

---

## 6. Tests

Harness: `test/test_workflow.ts` — `npm test` runs `test/test_i18n.ts` + the
workflow phases. Every check throws on failure (no log-only assertions).

| File | Lines | Covers |
|---|---:|---|
| `test/helpers.ts` | 105 | Temp workspace, `SAMPLE_LSS` whole-file fixture, `writeLss`, `mockCtx`, `mockPi`. |
| `test/test_i18n.ts` | 134 | Deep locale parity, catalogue copy, telemetry/completion rendering in both locales, `normalizeLocale`, help parity. |
| `test/test_workflow.ts` | 39 | Phase runner + cleanup. |
| `test/phases/phase-scorecard.ts` | 135 | Full-marks clean file, absence of manifest/artifact items, failure rendering, check-based trend, pending LSP semantics, whole-file rubric, diagnostic normalisation, recurring draft. |
| `test/phases/phase-pipeline.ts` | 207 | KB gate, auto-check on edit + telemetry, auto-check off, `.dxl` tracking, oversized procedure not blocked, comment warning, read banner, entry-skill pointer (+ setting gate), settle nudge + latch. |
| `test/phases/phase-commands.ts` | 108 | `/ls` menu, removal of modular subcommands, scaffold completions, catalogue ↔ config parity, parse/format, retired-key dropping on load. |
| `test/phases/phase-tools.ts` | 147 | `lotusscript_check` registration + clean/failing execution, scaffold tool params, agent/library artifacts, pinned date, overwrite refusal, gotcha registry. |
| `test/phases/phase-project.ts` | 270 | Detection (root/nested/formula/DXL/loose `.ls`, skip list, depth + entry caps, detector caching), path protocol, bundled skill presence, hint builders, the `injectProjectSkillHint` gate, consent policy + typo fallback, modal render width safety and key paths, and the `resources_discover` matrix (evidence only, never on opt-out). |
| `test/phases/phase-extension.ts` | 215 | Composition root: tools, command, every hook (`resources_discover` included), subscription draining, injected whole-file guidelines, and the consent flow (modal opened → skill injected once → discovery advertises → `never` persisted → next session silent and unadvertised). |
| `test/phases/phase-extension.ts` | 190 | Composition root: tools, command, hooks, subscription draining, injected whole-file guidelines, and the consent flow (modal opened → skill injected once → `never` persisted → next session silent). |

---

## 7. Data assets

| Asset | Location | Owner | Update path |
|---|---|---|---|
| `template.lss` | `src/slices/scaffold/template.lss` (shipped, git-tracked) | **Developer** | Edit in the repo → push → `pi update`. Never edit the installed checkout — it is a git working tree that `pi update` reconciles. |
| `gotchas.md` | `src/slices/gotchas/gotchas.md` (bundled seed) | **User** once seeded to `~/.pi/lotusscript/gotchas.md` | Approved gotchas are appended to the global copy only. |

---

## 8. Known gaps

- `naming.ts` **diverges from the project's own naming convention**: no domain segment, 6-char per-segment truncation, and an explicit allow-list that preserves trailing `save`/`mail`/`ifx`/`z`/`do` tokens — the convention calls that a copy-smell.
- No code-quality lint remains: the plugin reports compiler diagnostics + KB usage only. Performance rules from `best_practices.md` are unenforced by design.
- Plugin/package/skill names still say "modular" while the feature set no longer is — deliberate deferral, not an oversight.
- `compile-tool.ts` keeps the historical file name although the tool is `lotusscript_check` (renaming it is cosmetic churn).
