# drift slice

Warns when an **agent** file re-implements logic the project already keeps in a
script library — the failure mode that produced three different error reporters
and 19 copies of the same HTTP block in one database.

Model-facing notice (English); the rule itself lives in
`skills/lotusscript-modular/references/libraries-and-versioning.md`.

## Files

| File | Role |
|---|---|
| `signals.ts` | pure: signal table + `findDrift(text)` + `isLibraryFile(path)` |
| `index.ts` | orchestration: config gate, "project has a library" gate, once-per-run nudge, notice |

## Signals

| id | Detects | Belongs to |
|---|---|---|
| `http-com` | `CreateObject("WinHttp…")` / `CreateObject("MSXML2.ServerXMLHTTP…")` | the transport library |
| `endpoint` | a literal `"/api/…"` path | the endpoint constants |
| `error-report` | `Sub|Function *SendError* / *SendDiagnostic* / *PosliChybovyReport*` | the diagnostics library |
| `notes-url` | a literal `"notes://"` prefix builder | a shared helper |

Comment lines are ignored; at most three line numbers are reported per signal.

## Gates (why it stays quiet)

1. `driftCheck` off → silent.
2. The file is a library (`lib_*`) → silent: that is where the code belongs.
3. No `lib_*.lss` in the same folder → silent: nothing to reuse yet, so the
   advice would be noise (first occurrence is allowed to be local).
4. Already nudged in this run → silent (cleared by `beginRun()`).

## Toggle

`/ls driftCheck off` — disables the slice.
