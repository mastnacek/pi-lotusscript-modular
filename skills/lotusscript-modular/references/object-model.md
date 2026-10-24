# Notes/Domino object model — verify names, never invent them

The Notes back-end classes are large and full of near-misses
(`GetFirstDocument` vs `GetFirstEntry`, `NotesView` vs `NotesViewEntry`). The
local dataset makes guessing unnecessary:

| Source | Use it for |
|---|---|
| `~/.pi/agent/skills/lotus-script/ls_classes.json` | every class (97) with `isUI` / `notSupportedByCOM` flags and `docUrl`; exact member names, signatures, descriptions, per-member `docUrl` (help.hcl-software.com) |

## 1. Order of consultation

1. **`ls_classes.json`** — list the classes, confirm the class exists and is not
   UI-only when the code must run on a server:

   ```bash
   node -e "const J=require('os').homedir()+'/.pi/agent/skills/lotus-script/ls_classes.json';
   const d=require(J);console.log(d.nodes.map(n=>n.id).join('\n'))" | grep -i '^NotesView'
   ```

2. **`ls_classes.json`** — pull the exact members (section 2) before writing the
   call.
3. **knowledge base (`lotus-notes`)** — when behaviour matters (does it reload
   the document, is it cached, what happens on a server).
4. Only then write code.

Do **not** invent methods or properties. If neither source has it, it does not
exist.

## 2. Querying the dataset

The JSON is `{ "nodes": [ … ], "links": [ … ] }` — one node per class, one link
per inheritance/member relation. Every node carries `id`, `isUI`,
`notSupportedByCOM`, `docUrl`, `props`, `methods`, `events`.

```bash
# classes matching a fragment
node -e "const d=require(require('os').homedir()+'/.pi/agent/skills/lotus-script/ls_classes.json');
console.log(d.nodes.map(n=>n.id).filter(i=>/NotesView/i.test(i)).join('\n'))"

# members of one class, with kinds
node -e "const d=require(require('os').homedir()+'/.pi/agent/skills/lotus-script/ls_classes.json');
const c=d.nodes.find(n=>n.id==='NotesView');
console.log([...c.methods.map(m=>'M '+m.name),...c.props.map(p=>'P '+p.name)].join('\n'))"

# does a member exist anywhere, and where is its doc?
node -e "const d=require(require('os').homedir()+'/.pi/agent/skills/lotus-script/ls_classes.json');
for(const n of d.nodes)for(const m of [...n.methods,...n.props])
if(/GetAllDocumentsByKey/i.test(m.name))console.log(n.id+'.'+m.name+' '+(m.docUrl||''))"

# classes that exist only in the rich client
node -e "const d=require(require('os').homedir()+'/.pi/agent/skills/lotus-script/ls_classes.json');
console.log(d.nodes.filter(n=>n.isUI).map(n=>n.id).join(' '))"
```

## 3. Back-end before UI

Prefer `NotesSession`, `NotesDatabase`, `NotesDocument`, `NotesView`,
`NotesDocumentCollection`, `NotesViewEntry`. A class flagged `isUI: true` works
**only in the rich client** — never in a background/server agent, never on the
web. A server agent that constructs one fails before your first line of logic
runs, so check the flag before you write the call.

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

The dataset comes from the OpenNTF `ls-classmap` project; regenerate and
download it there:

```
https://github.com/OpenNTF/ls-classmap
```

## 6. When the KB wins

The dataset describes *signatures*, the knowledge base describes *behaviour*.
For anything with side effects — `ComputeWithForm`, `FTSearch`, `GetView`
caching, `NotesDocument.Save` options, date/locale handling — trust the
`lotus-notes` collection, not the signature list.
