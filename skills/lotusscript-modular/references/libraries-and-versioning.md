# Script libraries, versioning and deployment

Shared procedures belong in a **script library**, not in every agent. This
reference covers when to promote code into a library, how to name and version it,
how to ship a change without breaking callers, and what the compiler cannot
verify. Read it before creating a `lib_*.lss`, before changing a library that
other elements `Use`, and before bumping a `VERZE`.

---

## 1. When code belongs in a library

Promote to a library when **any** of these is true:

- two or more elements need the same non-trivial logic (transport, token
  handling, JSON, error reporting, HTML shell, date formatting);
- the logic encodes a contract others depend on (status codes, retry rules,
  response decoding);
- a copy would drift: the same block existing twice is a bug waiting for one
  side to be fixed.

Keep in the agent: business logic, HTML/UI text specific to that report, and
constants that configure *that* run (group names, limits, switches).

A library must not know about a specific report. Direction of dependency is
one-way — if library A `Use`s B, B must never `Use` A (cyclic `Use` does not
compile).

---

## 2. Naming, alias and `Use`

- Element name: `lib_<Name>` (`naming-conventions.md` §2). Keep the file name and
  the element name identical, so the mirror on disk is unambiguous.
- `Use "lib_x"` belongs in **(Options)**, never inside a procedure. Designer
  matches the element **name or alias** — a missing library surfaces at compile
  time as `Error loading USE or USELSX module`.
- `Use` is **transitive**: if `lib_a` does `Use "lib_b"`, an agent doing
  `Use "lib_a"` also sees `lib_b`'s public names. Rely on that deliberately and
  document it in the header, or a reader will wonder where a symbol comes from.
- `Option Public` makes module-level declarations public by default — constants,
  globals and procedures. Anything you do not want to export must be `Private`.

---

## 3. Versioning in the file header

Both libraries and agents carry the block from the scaffold template
(`src/slices/scaffold/template.lss`):

```
' VERZE: 1.8
' CHANGELOG:
'   1.8 - + VebaApi_DatumCz: ISO date from the API -> Czech display for reports.
'         Display only; matching keys stay ISO.
'   1.7 - FIX: VebaApi_Call failed on every response with error 13 (Type mismatch)
'         ...
```

Rules:

- **patch** — new public procedure/constant or a behaviour fix; existing callers
  change nothing;
- **minor** — behaviour a caller can notice (return contract, retry policy) with
  signatures intact;
- **major** — renaming or removing a public name; callers must migrate (§5);
- the changelog line states **the impact on callers** ("signatures unchanged",
  "returns -1 instead of an empty string", "+ new constant"), never "fixes and
  improvements";
- keep the interface list in the header up to date — it is what a caller reads
  before grepping the file;
- before a risky edit, copy the file to `<file>.lss.bak-<UTC>`; do not rely on
  "the last version".

---

## 4. Deployment order and stale bindings

Ship a library change in this order, and say the order out loud when handing it
over:

1. dependent library first (`Use`d one), save, `Ctrl+Shift+F9`;
2. the library that uses it, save, `Ctrl+Shift+F9`;
3. the agents, save, `Ctrl+Shift+F9`;
4. **`Tools → Recompile All LotusScript`**.

Why step 4 is not optional: a caller stores a reference to the library
procedure as it existed **when the caller was compiled**. IBM's run-time error
page for *Cannot find external name* (`151`) says exactly that: *"That name has
been changed in the target module since the currently executing module was
compiled."* The agent then runs fine and dies on the first call with error 151.
Re-saving the agent fixes it; Recompile All fixes the whole database at once.

Two more symptoms worth recognising instantly:

- **`Not a sub or function name: X`** where `X` is a *new* library procedure →
  the library element in that database is an older revision (or the library has
  its own compile error, which makes it invisible to `Use`). Fix the library,
  then the caller.
- **`Error loading USE or USELSX module`** → the element name/alias does not
  match the `Use` string, or the library itself does not compile.

---

## 5. Migrating callers to a new library revision

- Keep the public **names and arities** of procedures callers already use;
  change behaviour inside. That turns a migration into a `Use` line change.
- When a name must go, remove it in a **major** bump and enumerate it in the
  changelog so callers can grep for it.
- Two revisions of the same library may coexist as two elements while the
  migration runs. Do **not** give the new element the old name as an alias:
  an element carrying both `Use` lines then sees duplicate public names
  (`Name previously declared`).
- Switching one element: change the `Use` line, then check the body for any
  symbol the target library does not have. A call to a removed procedure is a
  compile error for that element only — which is exactly the point of doing it
  per element.

---

## 6. Verification the compiler cannot do

The 9.0.1 whole-file checker validates **syntax**, and it silently accepts calls
to procedures, constants and globals that do not exist anywhere. "0 errors" is
therefore *not* proof that a `Use`-based refactor is correct.

Before shipping a library-based change:

1. list every identifier the caller uses from the library
   (`VebaApi_*`, `Diag_*`, project prefixes, public globals);
2. parse the library for declarations and parameter counts;
3. compare name + arity per call site.

Also check the invariants that keep the design honest, e.g. "no agent creates an
HTTP object", "no agent contains an endpoint literal":

```bash
grep -rnE 'CreateObject\("(WinHttp\.WinHttpRequest|MSXML2\.ServerXMLHTTP)' --include=*.lss .
```

Finally, the only real proof is Designer: compile the element there
(`Ctrl+Shift+F9`) and then `Tools → Recompile All LotusScript`.

---

## 7. Traps that only appear with libraries

| Trap | Symptom | Fix |
|---|---|---|
| `ByVal` on an array (or a Variant carrying one) | run-time `Type mismatch 13`, compiler is silent | never pass arrays by value; move the array work into the procedure that owns it, or pass it by reference without parentheses |
| `Err`/`Erl`/`Error$` read inside the library | empty values, "0" line numbers | the values are procedure-local — pass them as arguments from the handler that trapped the error |
| status globals not reset in the library's error handler | message claims success ("HTTP 200") next to an exception | zero the status variable before setting the message |
| a fixed array passed to a `results() As String` parameter | compile or run-time mismatch | declare the caller's array dynamic and pass it without parentheses |
| a library with one compile error | every dependent element reports the *library's* symbol as unknown | fix and compile the library first, then the callers |
| `CLng`/`CDat` on library-provided strings | error 13, or locale-dependent dates | guard with `IsNumeric`; parse ISO dates by substrings, never with `CDat` |
