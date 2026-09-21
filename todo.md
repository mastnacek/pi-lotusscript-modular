# todo.md — Self-improvement & evaluation for pi-lotusscript-modular

> Source theory: NotebookLM notebook **"Samooptimalizační agenti: Efektivní správa kontextu a nákladů"**
> (`649658fc-bbf8-4912-952b-04399d654957`, alias `selfopt`), source: YouTube *"Self-Compact Pi Agent: ZERO HYPE Agentic Coding Devlog"* (IndyDevDan).
>
> Core thesis: motivation = **harness/prompt engineering**, not vibes. Models are RLHF-trained to chase grades → give them a grade to chase, computed by the harness, never self-reported.

---

## 0. Inventory — what the plugin already does

**Prompt injections** (`before_agent_start`, gated by config):

1. Mandatory `lotus-notes` KB query before editing LotusScript.
2. Gotchas summary (top traps listed inline).
3. Mandatory gotcha recording + user modal approval.
4. Procedure limits + Czech comments + 32 KB warning.
5. Ephemeral modular workflow description.

**Tools (3):** `lotusscript_compile(folder, clean)`, `lotusscript_decompile(path, outputDir)`, `lotusscript_gotchas(action, query, title, body)`.

**Events / feedback loops:**

| Hook | Behaviour |
|---|---|
| `tool_call` (non-mutating) | decompile monolith → redirect path to `main.lss`; track `readModularDirs`. **No guard for mutating tools.** |
| `tool_result` (read `main.lss`) | inject "Modular Agent Detected" + KB mandate + gotchas summary |
| `tool_result` (edit/write) | lint → modal gate on over-limit → recompile → LSP → inject prose notice + gotcha nudge |
| `agent_settled` | final compile → overwrite `.lss` / create `.lss` from `.dxl` → delete temp folder |

**Evaluators already computed (deterministic, unused as grades):** `LspCheckResult`, `FolderLintResult`, `ProcedureLintItem {lineCount, isExceeded, hasDocComment}`.

**Key observation:** evaluation data exists, but is used only as a **blocking gate** and **prose**. Never scored, never trended, never fed back into gotchas.

---

## 1. Theory → gap map

| Video principle | Plugin today | Gap |
| --- | --- | --- |
| "How you're graded" rubric | none | ❌ no score anywhere |
| Definition of Done | implicit in linter rules | ⚠️ never stated as DoD |
| Plan → Build → Verify | decompile→edit→recompile is mechanically this | ⚠️ model not told to plan/verify |
| Instant-failure boundaries | only over-limit lint gate | ⚠️ no `main.lss` / `_compiled.lss` guard |
| Self-compact / note-to-self | `cleanupOnSettled` only | ❌ long refactors rot context, no handoff |
| Gotchas as accumulated memory | ✅ 40 traps, search + gated add | ⚠️ advisory only, not linked to evaluation |
| Learning from recurring failure | manual, model-initiated | ❌ no auto-detection |

**Central idea:** the gotchas registry already *is* the self-improvement memory. Missing piece is the **evaluator → memory** link.

---

## 2. Target closed loop

```text
  (1) PRE-FLIGHT gotcha search  ── Plan
        │
        ▼
  EDIT ─► (2) LINT GATE ─► (3) COMPILE + LSP ── Verify
        │                        │
        ▼                        ▼
  (4) SCORECARD (weighted, trended)
        │
        ▼
  (5) DEBRIEF @ agent_settled → unmet DoD items
        │
        ▼
  (6) HARNESS-GENERATED GOTCHA DRAFT → user modal
        │
        ▼
  gotchas.md ─► injected next session as rule ─► back to (1)
```

---

## Phase 1 — Definition of Done, grading rubric, scorecard

- [x] `src/shared/types.ts`: add `ScorecardItem`, `AgentScorecard`, `ScorecardInput`; add config keys `enableScorecard`, `enforceGradingRubric`.
- [x] `src/shared/config.ts`: defaults (`true`, `true`).
- [x] `src/slices/settings/catalogue.ts`: specs for both keys.
- [x] New slice `src/slices/scorecard/` (imports `src/shared` only):
  - `compute.ts`: `computeScorecard(input)`, `formatScorecard(sc, prev?)`, `trendLabel(sc, prev?)`, `buildGradingRubric(config)`.
  - `index.ts`: barrel.
  - **Deviation:** no `history.ts`. The AGENTS.md rule says slices are pure functions, so session history is a plain `Map<string, AgentScorecard[]>` owned by the composition root (`index.ts`), with `recordScorecard()` there. The slice exposes only pure helpers.
- [x] `index.ts`: inject DoD + grading rubric in `before_agent_start` (gated by `enforceGradingRubric`).
- [x] `index.ts`: compute scorecard on every successful recompile in `tool_result`; emit compact block + trend line.
- [x] `index.ts`: scorecard in `/ls lint`, `/ls compile`, `/ls pack`.
- [x] `/ls status` + `/ls help` updated; `/ls score` command added (+ completion entry).
- [x] `skills/lotusscript-modular/SKILL.md`: document DoD + rubric (new section 3b).
- [x] Tests 29–34: `computeScorecard` (fail/clean), `trendLabel`, `formatScorecard`, `buildGradingRubric`, rubric injection, scorecard emission in recompile result.

**Acceptance met:** scorecard block appears in recompile output; score changes when a violation is fixed (0/8 → 10/10); trend line shows delta vs previous compile; rubric injected once per turn.

**Supporting refactor:** `verifyProcedureLimits()` now always returns `lint: FolderLintResult`, so the scorecard reuses the same lint pass instead of re-reading the folder.

---

## Phase 2 — Instant-failure guards

Enforced in `tool_call` for `edit` / `write` (including `*__edit` / `*__write` proxy names) inside a modular root:

- [x] Block `edit`/`write` to `main.lss` — synthetic `%pi-import` index, regenerated on every compile.
- [x] Block `edit`/`write` to `*_compiled.lss` — generated artifact.
- [x] Block `edit`/`write` to `manifest.json` inside a modular root — auto-synced from disk on every compile.
- [x] Advisory (non-blocking) note when a LotusScript `.lss`/`.dxl` file is written outside the active modular root(s).
- [x] Block reasons worded as the rubric's *instant failure* condition.
- [x] `buildGradingRubric` instant-failure lines aligned with the actually-enforced guards.
- [x] `SKILL.md` corrected — remove stale "add virtual import to `main.lss`" and "register in `manifest.json`" instructions (both are auto-maintained).
- [x] Tests 35–39: all three guards block; legitimate modular files still pass; outside-root advisory fires.

**Acceptance met:** blocked calls return `{ block: true, reason }`; no false positives on `00_options.lss`, `01_declarations.lss`, `sub_*.lss`, `func_*.lss`, `99_initialize.lss`.

**Deviation from original proposal:** the planned "delete a procedure file without updating manifest.json" guard is dropped. `syncManifest()` already auto-repairs that case, so blocking it would be unenforceable noise. Replaced by the `manifest.json` hand-edit guard, which is genuinely harmful and trivially enforceable.

---

## Phase 3 — Pre-flight gotchas, history, settled debrief

- [x] Config `injectPreflightGotchas` (default `true`).
- [x] `index.ts`: on first read of a root's `main.lss`, extract identifiers from `01_declarations.lss` + procedure file names, run `searchGotchas` over them, and surface up to 3 matches confirmed against the hit's own text. Falls back to `getGotchasSummary(8)`. Result cached per root for the session.
- [x] `index.ts`: score history per root (`Map<string, AgentScorecard[]>`, capped at 20); `▲/▼` delta shown in the scorecard. (Delivered in Phase 1.)
- [x] `agent_settled`: debrief listing unmet DoD items + final score, queued and injected as a message on the next `before_agent_start`, consumed exactly once.
- [x] Tests 40, 41, 42, 42b, 43.

**Acceptance met:** a root declaring `Dim shell As Variant` surfaces the `Shell` gotcha pre-flight (test 40); an inert root falls back to the generic summary (test 41); the debrief fires only when DoD is unmet and is consumed once (42/42b/43).

**Note:** no separate test for the 20-entry history cap — trend behaviour is covered by tests 30 and 42.

---

## Phase 4 — Recurring-failure → auto-drafted gotcha

- [x] Config `autoDraftRecurringGotchas` (default `true`).
- [x] `scorecard/compute.ts`: `normalizeDiagnostics(text)` → stable signatures (absolute paths, file names, line/column numbers stripped; harness-noise lines dropped).
- [x] `scorecard/compute.ts`: `findRecurringSignatures(current, history, minCycles)` + `buildRecurringGotchaDraft(agent, sigs, editedFiles)`.
- [x] `index.ts`: per-root diagnostic history (last 10 cycles); on recurrence (≥2 cycles) build the draft and route it through the **existing** `promptGotchaReview` modal.
- [x] Gated by `${root}:${signature}` in a `recurringGotchaReported` set — cannot spam (lesson from the `sub_Click` modal loop).
- [x] Tests 44–47, including a real end-to-end run against a stub LSP server.

**Acceptance met:** tests 44/45/46 cover normalisation, recurrence vs one-off, and draft content; test 47 proves the modal opens exactly once across three compile cycles with a randomly-varying line number (so normalisation, not luck, drives the detection).

**Note:** on a `rewrite` verdict the harness cannot reply inline from a `tool_result` hook, so it emits instructions telling the model to call `lotusscript_gotchas(action: "add", ...)` with the revised text — keeping a single approved write path.

---

## What NOT to do (hard constraints)

- **No self-reported scores.** Scorecard is computed by the plugin only.
- **No modal on every compile.** Gate by content signature (existing `verifyProcedureLimits` pattern).
- **No full self-compact implementation.** pi owns compaction; the plugin only supplies root-scoped durable state.
- **No stale numbers in the system prompt.** Rubric = static rules; live score = `tool_result` only.
- **Czech for user UI, English for agent-facing text** (established split).
- **No new tool if an `action` on `lotusscript_gotchas` suffices** — tool count is prompt-cache cost.
- **Slices never import each other.** All cross-slice orchestration happens in `index.ts`.

---

## Verification log

_Filled after each phase is implemented and tested._

| Phase | Implemented | Tested | Notes |
| --- | --- | --- | --- |
| 1 | ✅ | ✅ | Scorecard + DoD/grading rubric; tests 29–34 |
| 2 | ✅ | ✅ | Instant-failure guards + outside-root advisory; tests 35–39 |
| 3 | ✅ | ✅ | Pre-flight gotchas + debrief handoff; tests 40–43 |
| 4 | ✅ | ✅ | Recurring-failure gotcha drafting; tests 44–47 |
| 5 | ✅ | ✅ | JEV semantic evaluation (OpenRouter Decisions API) + comment style parser; tests 48–54 |

**Final verification:** `npm test` — **54 test phases, all PASS** (`=== All VSA Modular Workflow Tests Passed! ===`), covering VSA layout, decompile/compile, LSP, ephemeral cleanup, gotcha modal, procedure-limit modal, scorecard, guards, pre-flight, debrief, recurring-failure detection, comment style scanner (new vs old style), JEV Decisions API payload & response parsing, and scorecard integration.

**New config keys:** `enableScorecard`, `enforceGradingRubric`, `injectPreflightGotchas`, `autoDraftRecurringGotchas` — all default `true`, all settable via `/ls config set <key> <value>` and listed in `/ls status`.

**New surface:** `/ls score [složka]`; new slice `src/slices/scorecard/`; `tool_result` now takes `ctx` for the recurring-failure modal.

**Deliberately not implemented:** full self-compact (pi owns compaction); agent self-reported scores; blocking guards on non-LotusScript files; a 4th tool (all new behaviour rides existing tools/commands).