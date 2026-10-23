# versioning slice

Detects whether a LotusScript source carries a `VERZE` / `CHANGELOG` header, and
nudges the agent when a file is edited without the header being written or
bumped. Model-facing notices are English; the reference that owns the rules is
`skills/lotusscript-modular/references/libraries-and-versioning.md` §3.

## Why a slice

Versioning is a **source-shape** concern, not a compilation one: a file with a
stale version compiles perfectly. Keeping it out of the LSP/scorecard slices
means it keeps working when the check lane changes, and it can be switched off
on its own (`versioningCheck`).

## Files

| File | Role |
|---|---|
| `header.ts` | pure parsing: `extractVersionBlock`, `evaluateVersioning`, `suggestNextVersion` |
| `messages.ts` | the two notices (missing header / unchanged header), each with a paste-ready template and the reference path |
| `index.ts` | orchestration: baseline cache, once-per-run nudge, config gate |

## Triggers

| Event | Call | Effect |
|---|---|---|
| `tool_result` on **read** of a `.lss` | `observeVersionHeader` | stores the canonical header block as the baseline |
| `tool_result` on **edit/write** of a `.lss` | `checkVersioning` | compares with the baseline, returns a notice or `null` |

Wired through `PipelineDeps` in the composition root (`index.ts`); the pipeline
slice never imports this one (VSA slice isolation).

## Verdicts

- `missing` — no `' VERZE:` line or no `' CHANGELOG:` block → notice with the
  `1.0` template.
- `unchanged` — header byte-identical to the baseline while the file was edited
  → notice suggesting the next minor version, explicitly allowing
  comment-only edits to be ignored.
- `ok` — first sighting (no baseline) or a changed header.

## State

- `state.versionHeaders: Map<path, rawBlock>` — baseline, survives runs.
- `state.versioningNudged: Set<path>` — one notice per file per run, cleared in
  `beginRun()`, so a long refactor is nudged once instead of on every edit.

## Toggle

`versioningCheck` (default `true`) — `/ls versioningCheck off` disables it.

## Limits (deliberate)

- The slice cannot tell a comment-only edit from a semantic one; that is why the
  `unchanged` notice says so and can be ignored.
- It never rewrites the header itself: bump kind (patch/minor/major) is the
  author's judgement, documented in the reference.
- A first edit in a session with no prior read has no baseline and is therefore
  accepted silently.
