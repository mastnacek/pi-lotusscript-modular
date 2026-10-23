# trace slice

Shows, in the chat, that the agent is following the skill — one short line per
checkpoint, with an emoji, a label and a tag. It is **operator information**, not
model input: emitted with `ctx.ui.notify`, never `pi.sendMessage`, so it costs no
tokens and cannot steer the agent.

```
🧩 skill · lotusscript-modular            #skill
📄 reference · libraries-and-versioning.md  #skill
📝 whole file · ag_prehled.lss             #writing
🔖 ⚠️ versioning                           #checkpoint
🧱 ⚠️ library drift                        #checkpoint
```

## Files

| File | Role |
|---|---|
| `vocab.ts` | closed vocabulary: 8 kinds → icon + label (cs/en) + tag; `traceLine`, `traceKey`, `traceTail` |
| `index.ts` | `emitTrace`: config gate, once-per-session dedupe, notify, statusline tag |

## Kinds

| kind | when |
|---|---|
| `skill` | session start — the skill is loaded |
| `reference` | a `.md` under `skills/` is opened |
| `writing` | first `.lss` edit of the session |
| `check` | whole-file check result (planned) |
| `versioning` | the version header is missing or not bumped |
| `drift` | agent re-implements library-owned logic |
| `gate` | KB edit gate blocks a write (planned) |
| `dod` | Definition of Done summary at settle (planned) |

## Behaviour

- **Gentle:** one line per `kind:detail:state` per session (`state.traceEmitted`),
  so a refactor does not produce a line per edit.
- **Persistent tail:** each shown kind also lands as an icon in the statusline
  (`state.traceTags`), fixed order, no duplicates.
- **Switchable:** `showSkillTrace` (`/ls showSkillTrace off`).

## Deliberate deviations

- Labels live in `vocab.ts` (cs/en), not in `shared/i18n.ts`: they are a closed
  mechanical vocabulary of eight nouns, and routing them through i18n would add
  a section to the parity test for no user-visible benefit. The *setting* copy is
  in i18n as usual.
- The trace is not persisted in the transcript (`pi.appendEntry` + renderer):
  `ui.notify` is enough for "is it following the skill?", and entries would need
  a renderer to be visible. Revisit only if the line must survive scrolling.
