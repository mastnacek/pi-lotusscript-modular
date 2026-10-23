# Domino — where the answer hides, and whether it is reachable

Companion to `reuse-ladder.md`. Read this when you are searching an application
or checking whether the solution is actually reachable by the person who needs it.

## 1. Metadata before code

An ODP/DXL export ships `AppProperties/` next to the design. Read those first —
they answer most questions without opening a single element.

| File | Gives you |
|---|---|
| `agents.csv` | name, **alias**, trigger, target, `aktivovatelny` (= can `NotesAgent.Run` it from a client), owner, `bezi_za` (signer), last run |
| `views.csv` | view names, aliases, folders, categorised flag, selection formula |
| `view-columns.csv` | which view shows which field — answers "where does this document already appear" |
| `forms.csv`, `design-index.csv` | element inventory, aliases, timestamps |
| `acl.csv` | who may open/run it |

`agents.csv` is usually the whole answer: an agent with `aktivovatelny = true`
is runnable from anywhere, which makes a thin wrapper or a `runagent` action
viable.

## 2. Greps that pay off

Search the design for the *verb* of the task, not for its name.

| Pattern | Finds |
|---|---|
| `simpleaction action='runagent' agent='…'` | an existing action that already calls an existing agent — cheapest find of all |
| `action title='…'` + `<code event='click'>` | what a view action really does (often just `@Command`) |
| `<code event='click'><formula>@Command([OpenFrameset]; "…")` | the report already exists behind a frameset |
| `<code event='hidewhen'><formula>` | whether a button is reachable for the given person |
| the status field and its values (`stav = "3 - Kompletní"`) | which views already work with this document state |
| role names in `@UserNamesList` / `@IsNotMember` | who is meant to see the action |
| the field name in `view-columns.csv` | the view that already lists these documents |

Then confirm in the element itself. Report the 1–5 elements that matter.

## 3. Verification checklist

- **Access** — ACL, roles, reader/author fields. Can the named person open the
  target database by the path you use (`server` + `data\x.nsf` by name, or by
  replica ID)? Is the agent `aktivovatelny` and does its signer have the rights?
- **Visibility** — hide-when formulas: role, `@UserNamesList`, document state.
  An action with `showinbar='false' showinmenu='false'` **cannot be reached by a
  doclink**; do not promise it. A doclink can only open a *view or document*, not
  a specific action.
- **Client** — `notes://server/__replica.nsf/…` opens in the Notes client, not in
  a browser or Verse. `mshta`, `Shell` and ActiveX are Notes-client-only. For web
  and mobile, prefer a view or a form action over a desktop helper.
- **Deploy state** — when you delegate to an existing agent, confirm the deployed
  element matches the fixed source. A fixed `.lss` in `01_scripts/` proves
  nothing about the agent in the database: check the entry in `agents.csv` and
  grep the deployed `.dxl` for the fix before routing users to it.
- **Copies of the same element** — a fix in a shared script library does not
  reach elements that cannot load that library: mailed forms, buttons inside
  `Memo_*` forms, agents in other databases.

## 4. Pitfalls seen in real databases

- **Two agents, one alias.** `agents.csv` can list the same alias for two
  elements. `GetAgent` by alias then resolves to whichever Domino picks — use the
  full name.
- **A source file is not a design element.** A newer fixed `.lss` sitting next to
  an older deployed agent is the normal state of an export. Always distinguish
  "in the repo" from "in the database".
- **A button in a mailed form runs in the mail database.** `Use "<library>"`
  fails there ("Error loading USE or USELSX module"). That is the structural
  reason such buttons end up carrying a private copy of everything — the
  anti-pattern, not a coincidence.
- **Mailed forms travel only with `Send(True)`** (attachForm). Without it the
  recipient sees a plain memo and the buttons vanish.
- **Test switches left on.** `Const ODESILAT_EMAIL = False`,
  `TEST_USER_OVERRIDE$`, `RUCNE_ZADAT_VEDOUCIHO = True` inside a deployed form
  silently change behaviour. Grep for them when the requirement mentions
  "should be sent / should be written".
- **`MsgBox` in a background agent** blocks an unattended run. Prefer `Print` to
  the log.
- **`Show in action bar`** — a single action in a view that is also embedded
  elsewhere appears in both places; check every place the view is used before
  changing a hide-when.

## 5. Tooling notes for reading an export

- Every `.lss`/`.dxl` is a **whole file** (the modular folder workflow is gone):
  read it with offsets, or grep it — never look for `sub_*.lss` fragments.
- Language-server diagnostics are orientation only; a clean check does not mean
  the code is right in Designer (unknown identifiers pass), and a parser error
  can be a false positive of the grammar.
- When the requirement is about *behaviour*, the authority is the field names and
  formulas you can see, plus the deployed element — not your memory of how Notes
  "usually" works.
