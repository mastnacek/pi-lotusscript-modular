# File Map — pi-lotusscript-modular

Inventory of every file the plugin and its skill use, with a description of each.
Written for a **review agent**: each entry states what the file is responsible
for, what it exports, and where the risk sits. Line counts are from the working
tree at commit `f684b55`.

- **Repo root:** `D:\01_programovani\pi\plugins\pi-lotusscript-modular`
- **Engine:** `@earendil-works/pi-coding-agent` 1.0.0 (installed = npm latest, aligned)
- **Target platform:** IBM Notes/Domino 9.0.1, LotusScript
- **Architecture:** Vertical Slice Architecture (VSA) — thin composition root, `src/shared/` kernel, `src/slices/<feature>/`. Slices never import each other, only via `src/shared/`.

Totals: 60 TypeScript modules, 7 Markdown docs, 2 data assets, 13 test files.

---

## 1. Repo-level files

| File | Lines | Purpose |
|---|---:|---|
| `index.ts` | 90 | Composition root. The single entry point (`pi.extensions: ["./index.ts"]`). Wires every slice's registration into the `ExtensionAPI` and holds the subagent-recursion guard. |
| `package.json` | — | Manifest. `"type": "module"`; core packages in `peerDependencies: {"*": "*"}` (never `dependencies`); `files: [index.ts, src, skills, README.md, LICENSE, package.json]`; `test` script runs the tsx harness. |
| `tsconfig.json` | — | TypeScript config used by `npx tsc --noEmit`. |
| `AGENTS.md` | — | Repo-local agent instructions. |
| `README.md` | — | User-facing plugin documentation. |
| `todo.md` | — | Working notes. |
| `FILE-MAP.md` | — | This file. |

> **Review note:** there is **no build step**. `dist/` exists on disk but is untracked, and pi loads `index.ts` (TypeScript) directly. This matters for `template.lss` — see §4.

---

## 2. Skill (`skills/lotusscript-modular/`)

Model-facing instructions. This is what the agent reads to decide what to do;
the code in §4–§6 is what actually executes.

| File | Lines | Purpose |
|---|---:|---|
| `SKILL.md` | 191 | Frontmatter (`name: lotusscript-modular`) + the operating manual: Scaffold Fast Path, Definition of Done, file-map table of `src/slices/*`. Loaded by pi's skill discovery. |
| `references/workflow.md` | 122 | Modular workflow reference — the decompile → edit → compile lifecycle and when the plugin intervenes. |
| `references/scaffolding.md` | 124 | Scaffolding reference: which skeleton type to use, `/ls scaffold` grammar, `lotusscript_scaffold` parameter table, per-skeleton guarantees, and the template-source rules. |
| `references/coding-conventions.md` | 199 | LotusScript coding conventions for Domino 9.0.1 — comment style, header shape, naming prefixes, error handling. |
| `references/gotchas-index.md` | 74 | Index of the 48 bundled gotchas, pointing at `gotchas.md`. |
| `references/naming-conventions.md` | 117 | Alias grammar and the type→prefix table (`ag_`, `lib_`, …). |
| `references/dxl-and-odp.md` | 62 | DXL/ODP design-element reference for the decompile path. |

> **Review note:** `SKILL.md` was stale until commit `f684b55` — it still promised `%Include "lsconst.lss"` and an `On Error GoTo Catch` label, neither of which the template emits. Worth re-reading `SKILL.md` §"Scaffold Fast Path" against `template.lss` on any future template change; the two are kept in sync by hand.

---

## 3. `src/shared/` — the kernel

Imported by slices. No slice may import another slice.

| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `types.ts` | 168 | `ModularConfig`, `CommentStyle`, `CommentAnalysis`, `JevProcedureEval`, `JevFolderEvalResult`, `ScorecardItem`, `AgentScorecard`, `ScorecardInput`, `ProcedureLintItem`, `FolderLintResult`, `CodeBlock`, `AgentManifest`, `LspCheckResult`, `GotchaItem`, `SettingsCompletion` | All cross-slice type declarations. `ModularConfig` is the single knob set (18 settings). |
| `config.ts` | 94 | `DEFAULT_CONFIG`, `GLOBAL_CONFIG_FILE`, `projectConfigPath`, `loadConfig`, `saveConfig` | Config resolution: global `~/.pi/agent/lotusscript-modular.json` merged with project `.pi/lotusscript-modular.json`, project wins. |
| `paths.ts` | 235 | `sanitizeFileName`, `getTimestamp`, `decodeXml`, `makeUniqueFileNames`, `detectProcPrefix`, `findModularRoot`, `getExistingModularDir`, `isMonolithicLss`, `isMonolithicDxl`, `MonolithicReadHit`, `findMonolithicScriptReads` | Path/protocol kernel: modular-root discovery, monolithic-vs-modular detection, DXL entity decoding, unique-name suffixing, timestamp format. |
| `state.ts` | 255 | `PluginState`, `createPluginState` | Runtime state container wiring config + session + gate objects. |
| `state-insights.ts` | 170 | `StateInsightsDeps`, `StateInsights`, `createStateInsights` | Derived session insights (what has been decompiled, touched, compiled). |
| `state-procedure-limits.ts` | 117 | `ProcedureLimitDeps`, `VerifyLimitsResult`, `ProcedureLimitGate`, `createProcedureLimitGate` | Anti-loop gate: enforces `maxProcedureLines` and prevents repeated lint prompts within a session. |

---

## 4. `src/slices/scaffold/` — code generation

Generates new LotusScript files. Most recently reworked in this session.

| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `template.lss` | 114 | *(data asset)* | **The shipped template.** Versioned header (NÁZEV/ÚČEL/AUTOR/VYTVOŘENO/ZÁVISLOSTI + VERZE + CHANGELOG), `ERROR_NOTIFY_EMAIL$`/`MAIL_SERVER$`/`MAIL_DB$` header constants, `LSI_THREAD_*` block, `SendErrorEmail` helper, `Initialize` with `On Error GoTo ErrorHandler`. |
| `templates.ts` | 317 | `ScaffoldOptions`, `formatCurrentDate`, `fillTemplate`, `agentTemplate`, `libraryTemplate`, `procedureTemplate`, `ModularFolderFiles`, `modularFolderTemplate` | `fillTemplate` substitutes the `<…>` placeholders (pure, no fs, no clock). The four `*Template` functions are the **fallback** skeletons used only if `template.lss` cannot be read. |
| `template-source.ts` | 24 | `getBundledTemplatePath` | Resolves the template to `template.lss` **inside the installed package**, so template and code are always the same version. |
| `index.ts` | 220 | `scaffoldLotusScriptArtifact`, `ScaffoldTargetType`, `ScaffoldResult` + re-exports | Orchestrates the four scaffold types, refuses to overwrite, derives the alias, builds the Designer notice. |
| `naming.ts` | 156 | `normalizeAscii`, `suggestAlias`, `NoticeInfo`, `buildDesignerNotice` | Alias derivation and the Czech/English Designer-registration notice. |

> **Review targets in this slice:**
> - `templates.ts` is **317 lines** — over the 300-line soft target the tooling warns about (hard limit 400). Split candidate: the four fallback skeletons into `templates/`.
> - `naming.ts` **diverges from the project's own naming convention** (see §8). Known issues: no domain segment, 6-char per-segment truncation, and an explicit allow-list that preserves trailing `save`/`mail`/`ifx`/`z`/`do` tokens — the convention calls that a copy-smell.
> - `template.lss` declares `LSI_THREAD_*` itself. That is required for a standalone `.lss` outside Designer but is a **compile error** when pasted into a Script Library / design element (`LSPRVAL.LSS` is auto-included there). The file warns about this in Czech; nothing enforces it.

---

## 5. `src/slices/` — the other features

### parser — decompile / compile round trip
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `decompile-lss.ts` | 234 | `decompileLss` | Splits a monolithic `.lss` into a modular folder (`00_options`, `01_declarations`, `sub_*`, `func_*`, `manifest.json`, `main.lss`). |
| `decompile-dxl.ts` | 128 | `decompileDxl` | Same for a `.dxl` form/script element. |
| `compile-agent.ts` | 124 | `compileAgent` | Reassembles a modular folder into one compiled `.lss`. |
| `agent-parser.ts` | 41 | `AgentParser` | Low-level block extraction from LotusScript source. |
| `scaffolding.ts` | 84 | `ASSEMBLED_HEADER_MARKER`, `isSectionTagLine`, `sectionTag`, `endSectionTag`, `buildArtifactHeader`, `stripArtifactScaffolding` | Generated provenance markers and their removal, so recompiles stay idempotent. |
| `sync-manifest.ts` | 97 | `syncManifest` | Keeps `manifest.json` consistent with files actually on disk. |
| `emitters.ts` | 66 | `writeModuleFile`, `writeManifest`, `writeMainLss`, `rewriteMainLssFromManifest` | Filesystem writers for the modular layout. |
| `index.ts` | 1 | re-export | Barrel. |

### gotchas — trap catalogue
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `gotchas.md` | 939 | *(data asset)* | 48 traps, `##`-delimited. Parsed at runtime. |
| `catalogue.ts` | 159 | `getEffectiveGotchasPath`, `getAllGotchas`, `searchGotchas`, `getGotchasSummary`, `addGotcha` | **User-owned global copy** at `~/.pi/lotusscript/gotchas.md`, seeded from the bundled file on first use and never overwritten. `addGotcha` writes to both global and bundled. mtime-cached. |
| `review-modal.ts` | 295 | `GotchaReviewResult`, `GotchaReviewComponent`, `promptGotchaReview` | TUI approval modal for a newly drafted gotcha. |
| `index.ts` | 13 | re-export | Barrel. |

> **Review note:** `gotchas.md` is user-owned by design — the opposite case from `template.lss`. Its 48 entries have **zero heading overlap** with the 40 real-world traps in `D:\01_programovani\pi\plugins` … precisely, with `E:\Z_DECKA_MALO_MISTA\fakutry-ln\howto\gotchas.md`. See §8.

### pipeline — event translation
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `tool-call.ts` | 101 | `handleToolCall` | Redirects reads of monolithic scripts into ephemeral decompilation. |
| `tool-result.ts` | 245 | `handleToolResult` | Post-edit recompile, lint gate, scorecard injection. |
| `settled.ts` | 97 | `handleAgentSettled` | Cleanup when the agent finishes — deletes the ephemeral folder. |
| `guidelines.ts` | 48 | `buildPromptGuidelines` | Builds the system-prompt text: DoD, rubric, top gotchas, KB prompt. |
| `recurring-gotcha.ts` | 70 | `draftRecurringGotcha` | Auto-drafts a gotcha when the same diagnostic repeats. |
| `read-banner.ts` | 52 | `readBanner` | Banner shown when a monolithic script is read. |
| `shared.ts` | 19 | `ToolResultEventResultShape`, `baseToolName` | Small shared helpers. |
| `index.ts` | 11 | re-export | Barrel. |

### linter — procedure limits and comments
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `checker.ts` | 152 | `lintProcedureFile`, `lintModularFolder` | The **only two rules**: per-procedure line count vs `maxProcedureLines`, and presence of a doc/`Účel:` comment. |
| `modal.ts` | 284 | `ProcedureReviewResult`, `ProcedureLimitComponent` | TUI modal for over-limit procedures. |
| `prompt-review.ts` | 58 | `promptProcedureLineReview` | Single-shot review gate. |
| `instructions-input.ts` | 71 | `InstructionsInput` | Text input widget for pasting instructions. |
| `index.ts` | 15 | re-export | Barrel. |

> **Review note:** the linter has **no performance or correctness rules** — nothing from `best_practices.md` is enforced. See §8.

### guards — instant-failure prevention
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 148 | `MUTATING_TOOL_NAMES`, `SHELL_LIKE_TOOL_NAMES`, `collectShellLikeSources`, `GuardBlock`, `guardProtectedFiles`, `guardMonolithDump`, `guardKbBeforeEdit` | Blocks edits to protected files, blocks dumping a monolith into chat, and hard-gates `.lss`/`.dxl` edits behind a `kb_search` on the `lotus-notes` collection. |

### commands — `/ls` slash commands
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 96 | `RegisteredLsCommand`, `createLsCommand` | `/ls` dispatcher. |
| `ls-inspect.ts` | 159 | `lsScaffold`, `lsLint`, `lsScore`, `lsJev` | Inspect/act commands, including the scaffold path. |
| `ls-compile.ts` | 121 | `lsCompile`, `lsPack`, `lsDecompile` | Compile/pack/decompile. |
| `ls-config.ts` | 142 | `LsParts`, `lsStatus`, `lsLsp`, `lsOverwrite`, `lsDirectSetting`, `lsConfig`, `lsHelp` | Config menu with current-value annotation. |
| `ls-gotchas.ts` | 48 | `lsGotchas` | Gotcha query. |

### tools — model tools
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `index.ts` | 17 | `registerModelTools` | Registers all four tools. |
| `scaffold-tool.ts` | 78 | `registerScaffoldTool` | `lotusscript_scaffold`. TypeBox schema with `StringEnum` for `type`; `date` pins the header date for a reproducible scaffold. |
| `compile-tool.ts` | 92 | `registerCompileDecompileTools` | `lotusscript_compile` / `lotusscript_decompile`. |
| `gotchas-tool.ts` | 136 | `registerGotchasTool` | `lotusscript_gotchas`. |

### settings — slash-command completion
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `catalogue.ts` | 218 | `SettingKind`, `SettingSpec`, `SETTING_SPECS`, `findSetting`, `parseValue`, `formatValue` | Declarative catalogue of every `ModularConfig` setting. |
| `complete.ts` | 193 | `LS_SUBCOMMANDS`, `completeLsArguments` | Multi-level autocompletion with the trailing-space contract. |
| `index.ts` | 10 | re-export | Barrel. |

### scorecard / evaluator / lsp
| File | Lines | Exports | Purpose |
|---|---:|---|---|
| `scorecard/compute.ts` | 294 | `computeScorecard`, `trendLabel`, `formatScorecard`, `buildGradingRubric`, `normalizeDiagnostics`, `findRecurringSignatures`, `buildRecurringGotchaDraft` | Deterministic per-agent DoD scorecard + rubric. |
| `scorecard/index.ts` | 8 | re-export | Barrel. |
| `evaluator/jev.ts` | 281 | `buildJevPayload`, `createFallbackEval`, `parseJevResponse`, `buildFolderSummary` | JEV semantic comment/gotcha evaluation. |
| `evaluator/comment-parser.ts` | 209 | `isSyntheticDirective`, `scanLotusScriptComments`, `extractProcedureSnippet` | Deterministic comment extraction, immune to string literals. |
| `evaluator/client.ts` | 189 | `getOpenRouterApiKey`, `evaluateProcedureWithJev`, `evaluateFolderWithJev` | OpenRouter transport + auth resolution. |
| `evaluator/index.ts` | 18 | re-export | Barrel. |
| `lsp/lsp-check.ts` | 216 | `checkLotusScriptDiagnostics` | LotusScript LSP diagnostics; distinguishes measured / unmeasured / pending. |
| `lsp/index.ts` | 1 | re-export | Barrel. |

---

## 6. Tests

Harness: `test/test_modular_workflow.ts` (56 lines) runs numbered assertions across phases. `npm test` → 84 assertions.

| File | Lines | Covers |
|---|---:|---|
| `test/helpers.ts` | 105 | Temp-dir fixtures and a `mockPi` ExtensionAPI double. |
| `test/phases/phase1.ts` | 284 | Phases 1–4: gotchas catalogue, menu completions, core decompile→compile→LSP, gotcha review modal + approval gate. |
| `test/phases/phase5.ts` | 100 | Phase 5 (20–22): ephemeral modularization and cleanup on `agent_settled`. |
| `test/phases/phase6.ts` | 187 | Phases 6 (23–28): procedure line-limit + comment linter, modal, tool_result lint gate, anti-loop gate, sizing. |
| `test/phases/phase7.ts` | 80 | Phases 7 (29–34): scorecard / grading — compute, trend, format, rubric, prompt injection, recompile integration. |
| `test/phases/phase8.ts` | 112 | Phases 8 (35–39): instant-failure guards — protected files, KB edit gate, legitimate files pass, outside-root advisory. |
| `test/phases/phase9.ts` | 97 | Phases 9 (40–43): pre-flight gotcha banners + debrief handoff. |
| `test/phases/phase10.ts` | 132 | Phase 10 (44–47): recurring-failure gotcha drafting. |
| `test/phases/phase11.ts` | 186 | Phases 11a (48–54): JEV evaluator — comment parsing, string-literal immunity, payload, parsing, fallback, scorecard integration. |
| `test/phases/phase12.ts` | 223 | Phases 12a/12b (55–62): shell/code-execution read guards, English language guard, unmeasured-LSP pending semantics. |
| `test/phases/phase13.ts` | 204 | Phases 13a/13b (63–75): scaffold slice + naming conventions. Includes 63b (determinism + placeholder substitution). |
| `test/phases/phase14.ts` | 136 | Phase 14 (76–79): artifact-scaffolding round-trip idempotency. Regression guard for the scaffolding-accumulation bug. |
| `test/phases/phase15.ts` | 198 | Phase 15 (80–84): repeated-event module names. Regression guard for the lost-button bug. |

> **Review note:** test 63b reads `getBundledTemplatePath()` — the file the scaffolder actually uses. That was deliberately changed when the global seed was removed; previously the tests validated the bundled copy while a stale global file did the work.

---

## 7. Data assets

| Asset | Location | Owner | Update path |
|---|---|---|---|
| `template.lss` | `src/slices/scaffold/template.lss` (shipped, git-tracked) | **Developer** | Edit in the repo → push → `pi update`. Never edit the installed checkout — it is a git working tree that `pi update` reconciles. |
| `gotchas.md` | bundled + seeded to `~/.pi/lotusscript/gotchas.md` | **User** | Tool/appended entries persist across `pi update`. Delete the global file to re-seed from the bundled copy. |

---

## 8. External sources of truth (not in this repo)

These govern the plugin's conventions but live outside it. A reviewer should
read them before judging whether a slice is correct.

| Path | Lines | Governs | Current state |
|---|---:|---|---|
| `E:\Z_DECKA_MALO_MISTA\fakutry-ln\howto\template.lss` | — | Origin of the shipped `template.lss` | Copied in `30a83ce`, then refined. |
| `E:\Z_DECKA_MALO_MISTA\fakutry-ln\howto\gotchas.md` | 40 entries | Real-world LotusScript traps | **Zero heading overlap** with the bundled 48. |
| `E:\Z_DECKA_MALO_MISTA\fakutry-ln\howto\sablona-ls-konvence.md` | 397 B | Conventions v0.2 — header shape, versioning, forbidden variable names | Source of the `ZÁVISLOSTI` header line. |
| `E:\Z_DECKA_MALO_MISTA\fakutry-ln\howto\sablona-ls.md` | 28 KB | "Vzorový kód pro nové skripty" — Try/Catch/Finally, central ErrorLog, `OpenMail()` | Largely **not** implemented (see below). |
| `D:\01_programovani\konvence_jmena_prvku.md` | 397 | Alias convention: `typ_domena_entita`, prefix table, příležky, 64-char limit | **Partially** implemented — prefixes and snake_case only. |
| `D:\01_programovani\best_practices.md` | 458 | Performance/correctness rules from Guirard's IBM handbook | **Almost entirely unimplemented.** |

### Known gaps (highest-value review targets)

1. **`best_practices.md` has no enforcement.** All six of its "do this first" priorities are absent from `src/` and `skills/`: `@Max(@DbColumn)+1` ID generation, lookup-view indexing, `On Error Goto BubbleError`, `":""` → `""`, `@Unique` over lookups, cache-choice review. The linter (`checker.ts`) has two rules, neither of them performance-related.
2. **`naming.ts` contradicts the alias convention** — no domain segment, 6-char truncation, and an allow-list that preserves exactly the suffix tokens the convention calls a copy-smell.
3. **The 40 real-world gotchas are not in the plugin.** Merging them needs de-duplication against the existing 48.
4. **`sablona-ls.md` recommends `OpenMail()`** rather than the hardcoded `MAIL_SERVER$` + `mail.box` the template uses. A deliberate choice was made to use constants; it is still a divergence worth a decision.
5. **Recipient address is inconsistent across sources** — `sluzbyict@veba.cz` in `template.lss` and the conventions doc, `jaroslav.havel@veba.cz` in `sablona-ls.md`. The template ships the former.
6. **Error-handler label differs** — `template.lss` uses `ErrorHandler`; `best_practices.md` §7 standardises on `BubbleError`.

---

## 9. Operational state

- Installed copy: `~/.pi/agent/git/github.com/mastnacek/pi-lotusscript-modular` (a git working tree).
- As of writing, the installed checkout is **behind** the repo — it predates the `template.lss` work entirely. Run `pi update` to reconcile.
- Repo is clean and in sync with `origin/main` at `f684b55`.
- Verification commands: `npx tsc --noEmit`, `npm test` (84 assertions).