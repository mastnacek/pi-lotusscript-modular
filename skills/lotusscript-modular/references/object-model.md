# Notes/Domino object model — verify names, never invent them

The Notes back-end classes are large and full of near-misses
(`GetFirstDocument` vs `GetFirstEntry`, `NotesView` vs `NotesViewEntry`). Two
local sources make guessing unnecessary:

| Source | Use it for |
|---|---|
| `lotus-class-index.md` (this folder) | does the class exist, how many methods/props/events, is it UI-only |
| `~/.pi/agent/skills/lotus-script/ls_classes.json` | exact member names, signatures, descriptions, per-member `docUrl` (help.hcl-software.com) |

## 1. Order of consultation

1. **`lotus-class-index.md`** — confirm the class exists and is not
   `[UI]`-only when the code must run on a server.
2. **`ls_classes.json`** — pull the exact members before writing the call.
3. **knowledge base (`lotus-notes`)** — when behaviour matters (does it reload
   the document, is it cached, what happens on a server).
4. Only then write code.

Do **not** invent methods or properties. If neither source has it, it does not
exist.

## 2. Querying the dataset

```bash
J=~/.pi/agent/skills/lotus-script/ls_classes.json

# classes matching a fragment
jq -r 'keys[]' "$J" | grep -i 'NotesView'

# members of one class, with kinds
jq -r '."NotesView" | (.methods // {} | keys[] | "M " + .), (.properties // {} | keys[] | "P " + .)' "$J"

# does a member exist anywhere, and where is its doc?
jq -r 'to_entries[] | .key as $c | (.value.methods // {}) | to_entries[]
       | select(.key|test("GetAllDocumentsByKey";"i"))
       | "\($c).\(.key)  \(.value.docUrl // "")"' "$J"
```

## 3. Back-end before UI

Prefer `NotesSession`, `NotesDatabase`, `NotesDocument`, `NotesView`,
`NotesDocumentCollection`, `NotesViewEntry`. UI classes (`NotesUIWorkspace`,
`NotesUIDocument`, `NotesUIView`) work **only in the rich client** — never in a
background/server agent, never on the web. A server agent that constructs one
fails before your first line of logic runs.

## 4. Language specifics that bite

- `Set` for objects; `Dim x As New ClassName` is the short form.
- Dynamic arrays must be `ReDim`'d before any element access; `ReDim Preserve`
  may only grow the **last** dimension's upper bound.
- Arrays, lists and objects are passed **by reference** — `ByVal` on them is
  illegal (`Illegal pass by value`, or a run-time `Type mismatch 13`).
- `Err`/`Erl`/`Error$` are **procedure-local**: pass them into helpers.
- `Option Declare` is mandatory in new code; it makes every typo a compile error
  (except that unknown *cross-module* names are still accepted — verify library
  symbols yourself).
- `ForAll` declares its own alias; a `Dim` for the alias is a compile error.

## 5. Refreshing the dataset

The index and the JSON come from the OpenNTF `ls-classmap` project. When the
dataset is regenerated, update both files here and keep the header note in
`lotus-class-index.md` in sync:

```
https://github.com/OpenNTF/ls-classmap
```

## 6. When the KB wins

The dataset describes *signatures*, the knowledge base describes *behaviour*.
For anything with side effects — `ComputeWithForm`, `FTSearch`, `GetView`
caching, `NotesDocument.Save` options, date/locale handling — trust the
`lotus-notes` collection, not the signature list.
