# Reuse ladder — find it before you build it

Domino applications are old and dense: the thing being asked for usually already
exists somewhere. Run this ladder **before** writing code, and only then open
`coding-conventions.md`.

Prime directive: the application probably already does this — find that element
and reuse it. New code is the last resort and needs a justification.

---

## Step 0 — usage profile (gate)

The cheapest correct mechanism depends on how often a human repeats the action.
Never choose a mechanism before this step.

| Regime | Friction | Therefore |
|---|---|---|
| Occasional (≤ weekly), cold start | 2–3 clicks fine | doclink/URL to the existing view or frameset — zero code |
| Weekly–daily, many users | 1 click matters | thin wrapper over an existing agent — never a copy of its logic |
| In-flow inside the app | 0 extra clicks | extend the existing view/form action |

Unknown frequency → ask. If you cannot ask, write one line
"assumption: occasional" and choose conservatively.

---

## Steps

1. **Analyse** — which document/form, what must happen, who does it with what
   rights, in which document state, at which trigger point. Derive the keywords:
   form alias, status field and its values, role names, view names, agent aliases.
2. **Search** — only by those keywords, never an inventory. Where to look and
   what each source gives you: `domino-search-and-access.md`. Report 1–5 elements.
3. **Choose** — stop at the first rung that satisfies Step 0:

   | # | Solution | Code |
   |---|---|---|
   | a | Doclink/URL to where the button already exists | none |
   | b | Existing action + minor change (hide-when, condition) | a few lines |
   | c | Existing agent triggered from an existing place | ~10–60 lines |
   | d | Small new action on an existing form/view | small |
   | e | New form/agent/integration | large — justify why a–d fail |

   Prefer (a) over (c) when Step 0 says occasional. The user asked for an
   outcome, not for a widget.
4. **Refuse** — an emailed form whose button carries its own API/business logic
   (it runs in the mail database, where your script libraries do not exist);
   copied logic; a duplicate agent; a new view where a hide-when would do;
   (d)/(e) without a recorded Step 0 profile.
5. **Verify** — access, visibility, client, deploy state: checklist in
   `domino-search-and-access.md` §3.

---

## Output shape

1. **Recommended solution** — mechanism, click count, and the regime it assumes.
2. **Reused element(s)** — name + where it lives.
3. **What must change** — "nothing" first if true.
4. **Assumption / open question** — frequency, audience, unverified access.
5. **Rejected alternatives** — one line each.
6. **Verification** — the points that matter.

Nothing suitable exists → say it in the first sentence, then argue for the new
element.

---

## Rules

- Do not invent elements you cannot see in the code or metadata.
- If it can be solved without new code, say that first.
- Smallest change, smallest impact.
- Name the navigation the user will actually perform, so the friction is visible
  before they agree.
- Never more than two questions at a time.

---

## When the answer is "write a script library"

Reuse also applies *inside* the code: if two or more elements would need the
same non-trivial logic, the reusable element is a **script library**, not a copy.
Signals, promotion rule and deployment: `libraries-and-versioning.md` §1.
