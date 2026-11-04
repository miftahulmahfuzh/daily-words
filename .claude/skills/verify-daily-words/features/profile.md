# Profile

## Sub-features

- `/profile`: the name, two level blocks ("Margin Scribbler, streak level 4 of 9", "Shelf of
  Odds, collector level 3 of 8") with the distance to the next, four stats (current and longest
  streak, cards made, words collected; recomputed from `daily_cards` on read, [R11]), "Keeping a
  card since …", the badge shelf (earned with ×N, then not yet earned).
- The app's one modal: tapping a badge or level row opens the single `<dialog>` (showModal): the
  art hero (329x184 at 375px), the condition, the gloss, ×N with first and latest dates; **Close**
  returns focus to the row.
- `/profile/edit`: the five answers, the birthday, the time zone ("Asia/Jakarta ( detected )",
  **Change**), "Card reminders" (see push-reminders.md), **Save**.
- `POST /api/profile/timezone {"timezone", "manual": true}` stores `timezone_source = 'manual'`,
  which re-detection then leaves alone.

## How to get to it (user POV)

Profile tab -> tap a badge or a level. Profile -> edit.

## Driving it with verify.sh

```sh
$V api RUN GET /profile
# [Margin Scribbler, streak level 4 of 9] ... 13 Current streak 21 Longest streak 39 Cards made 26 Words collected
# [Friday Blessing, earned 5 times] Friday Blessing ×5 ... [Burning the Midnight Oil, not yet earned]
$V ui RUN $S/profile-badge.mjs
# dialogs on the page: 1
# badge "Friday Blessing, earned 5 times": EARNED Friday Blessing A card made on a Friday. … ×5 · first 25 September 2026 · latest 30 October 2026 CLOSE
#   hero 329x184; focused: Close / closed; focus returned to: Friday Blessing, earned 5 times
# level "Margin Scribbler, streak level 4 of 9": LEVEL 4 OF 9 Margin Scribbler A longest streak of 14 days. … CLOSE
$V api RUN GET /profile/edit        # Time zone / Asia/Jakarta ( detected ) / Change / Card reminders Checking…
$V api RUN --as stranger POST /api/profile/timezone '{"timezone":"Asia/Tokyo","manual":true}'
# 200 {"timezone":"Asia/Tokyo","source":"manual","updated":true}
```

Cost: 0.

## Gotchas

- `profile-badge.mjs` asserts focus returns to the row that opened the dialog; that is the
  `autoFocus`/`showModal()` trap CLAUDE.md describes, so a failure there is a real regression.
- The stats move when today's card is made (13 -> 14 current); read them in the same run as the
  journey that changed them.
- `api`'s text of `/profile/edit` shows every chat-tone option with a ✓ (the unselected marks are
  hidden by CSS) and no input values; use `ui` or `sql` for what is selected.
