# F27 — The journal's green dot, and what "edited" means

Card: [daily-words#7](https://github.com/miftahulmahfuzh/daily-words/issues/7) · round 1 · 2026-09-01

## The complaint, and what is actually wrong

> in journal list, right now i see every single item has a green dot because i
> asked for insight for every journal item i added.

Two asks, and reading the code turns them into one bug plus one inversion.

**The bug.** `edited` is derived in `lib/journal/serialize.ts` as

```ts
edited: row.updatedAt.getTime() - row.createdAt.getTime() > EDITED_SLACK_MS,
```

and `completeInsight` / `failInsight` in `lib/db/queries/journal.ts` both do
`.set({ …, updatedAt: NOW })`. So **generating an insight marks the entry
"edited"**, on a line the user never touched. `edited` today reads as "something
happened to this row", not "a human changed this" — which is the flag's whole
purpose. `claimInsight` is innocent: it writes `insight_requested_at` only.

**The inversion.** `entry-row.tsx` draws the dot for `insightStatus === "ready"`,
so a user who explains every line sees a dot on every line and the mark carries
no information. The user wants it to mark what still *needs* an insight.

## The approaches

### A — chosen: unhook the insight writes from `updated_at`, then gate `edited` on the insight

Two edits and one derivation:

1. `completeInsight` and `failInsight` stop writing `updatedAt`. The column then
   means exactly *the user changed something*, which is what `edited` reads.
2. `edited` becomes `updated_at` past `created_at` **and**
   `insightStatus !== 'ready'` — so an edit marks the row until an insight covers
   the new text, and clears when one does.
3. The dot becomes `insightStatus !== "ready"`.

Both halves of (1) and (2) are needed, and neither alone is enough. Without (1),
a never-edited entry whose insight **failed** reads "edited" — `failInsight`
bumped the clock and `'failed'` is not `'ready'`, so the gate does not catch it.
Without (2), an edit would mark the row "edited" for ever, which is not what the
card asks for.

`updateEntry` already resets `insight_status` to `'none'` when the text actually
changed, so (2) needs no new state: *"edited and not yet re-explained"* is
already expressible, and this plan only reads it.

A consequence worth naming rather than discovering: **`edited` now implies the
dot**, because `edited` is only true when the status is not `ready`. That is
coherent and not redundant — the dot says *this one needs an insight*, and
"edited" says *because you changed it*.

Scored: convention (derived in the serialiser, where every other display fact is
derived, and `case when` already carries the text-changed test) ✓; scope (three
files of behaviour, no schema change) ✓; verifiability (`journal:check` drives
`toJournalEntryDto` and `entryMeta` purely — every case below is an offline
assertion) ✓; reversibility (one commit) ✓.

### B — rejected: a `text_updated_at` column

Add a column that `updateEntry` writes only when the text changed, and derive
`edited` from it. It is the only approach that also gets the source-note case
below exactly right.

Lost on scope and on reversibility, but really on the **backfill**: for every
existing row we cannot know whether its past `updated_at` came from a text edit,
a note edit or an insight, so the backfill is a guess whichever value it picks.
A migration whose seed data is a guess is worse than a derivation with one known
edge.

### C — rejected: leave the insight writes alone, gate `edited` on the status only

The one-line version of A. Rejected on the `failed` hole above, and because it
leaves `updated_at` meaning two things — which is what caused this bug in the
first place.

## The ambiguity call (narrow reading)

The card's body says a **source-note-only edit must not set "edited"**, by parity
with the insight rule ("the note is not part of what was explained"). Under A it
does, but only in one case: an entry that has **no insight at all** and whose
note was edited. With an insight present the gate suppresses it either way.

Built narrow, on the user's own words — *"if user edited a journal content, we
set the status as Edited"*. Editing the note is editing the entry, it is what
this flag has always said, and the regression being reported is insight
generation polluting it, not note edits. The wider reading is approach B, which
costs a migration with an unknowable backfill to fix a case that lasts only until
the entry's first insight. If the user wants it, one comment reopens this.

## The card's open question: `pending` and `failed` are dotted

`entry-row.tsx`'s comment argues today that `pending` and `failed` go unmarked
because "the action lives on the entry page; marking them in the list would be a
notification the user cannot act on from where they are standing."

**That argument inverts with the polarity and does not survive.** Under the old
rule the dot was a reward, and marking a failure with it would have been a
notification with nowhere to go. Under the new rule the dot means *this one still
needs an insight*, and tapping the row is exactly the action — the entry page is
one tap away and holds the Retry button. So the rule is the simple one:

| `insightStatus` | Dot | Why |
|---|---|---|
| `none` | ● | never explained |
| `failed` | ● | not explained, and the row is the way to retry |
| `pending` | ● | not explained *yet*; momentary, and self-corrects on the next render |
| `ready` | — | explained |

One condition, `insightStatus !== "ready"`, and it is literally "hasn't had an
insight yet". Note that `wireStatus` already reports a stalled `pending` as
`failed` and an unparseable `ready` as `none`, so both of those land on the dot
side without a special case.

## The change

| File | Change |
|---|---|
| `lib/db/queries/journal.ts` | drop `updatedAt: NOW` from `completeInsight` and `failInsight`; say in both comments why the column is left alone |
| `lib/journal/serialize.ts` | `edited` gains the `insightStatus !== 'ready'` gate; rewrite the `EDITED_SLACK_MS` comment |
| `lib/journal/schemas.ts` | the `edited` field's doc comment |
| `components/journal/entry-row.tsx` | invert the dot, rewrite the comment and the `sr-only` label |
| `lib/journal/format.ts` | `entryMeta`'s doc comment only — the code is unchanged |
| `scripts/check-journal.ts` | the `edited` cases below, and the dot rule |
| `app/kitchen-sink/journal/page.tsx` | fixtures that exercise both dot states |

`edited` and `insightStatus` do not cross into a public share
(`lib/share/serialize.ts`), so nothing a stranger sees changes.

One thing that gets quietly **better**: `entry-view.tsx` keys its `ShareButton`
on `entry.updatedAt`, so that an edit which revoked the share resets the control.
Today a completing insight bumps that key and remounts the control for no reason.
After (1) it does not.

## Verification

- `npm run journal:check` — the offline owner of `edited` and `entryMeta`. New
  cases: fresh/ready/failed/pending × edited/unedited, and the dot predicate.
- `npm run journal:db` — asserts `completeInsight` leaves `updated_at` where it
  was, and that `updateEntry` still moves it.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:layout`.
