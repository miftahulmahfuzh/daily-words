# Today's card

## Sub-features

- `/today` with no card: "No card yet. Six words are waiting to be written out.", the streak pill
  ("13 day run"), the seven-day strip, and **Make today’s card** ("Nothing is generated until you
  press it.").
- `POST /api/cards` (the only thing that makes a card, F5): six rows (`data-testid="daily-card-row"`,
  term + definition), chosen by `selectCardCandidates`; a reload shows the same six.
- The F9 hook on creation: `user_stats` recomputed, badges awarded for today, the reward toast
  (`role="status"`), the streak pill moving.
- The no-scroll guarantee ([R19]) on the real screen, not only on `/kitchen-sink`.
- `/calendar` and `/card/[date]`: ticks for days with a card, the date eyebrow linking to the day.

## How to get to it (user POV)

Open the app -> Today -> **Make today’s card**. The date eyebrow opens the calendar.

## Driving it with verify.sh

```sh
$V api RUN GET /today
# 13 day run / No card yet. Six words are waiting to be written out. / Make today’s card
$V ui RUN $S/today-card.mjs
# 2026-11-04: card rows: 6 -> gossamer, susurrus, perfunctory, bucolic, penumbra, cantankerous
#   toast: BADGE Full Week Ration / vertical overflow of the page: 0px / after reload: same six
$V sql RUN "select current_streak, longest_streak, total_cards from user_stats; select badge_key from badges_awarded where awarded_for_date = current_date"
# 14 | 21 | 40   and   full_week, three_in_a_week
$V api RUN GET /calendar
# [4 November 2026, card made] 4 ✓
```

Cost: 0. Read `NN-ui-today-card-2-card.png`: six rows, "14 DAY RUN", the toast over the strip.

## Gotchas

- One-shot per run: the seeder leaves today empty on purpose, and once made the card is made. A
  second `today-card.mjs` fails on `no-card-yet`; `down` + `up` for another.
- The words drawn differ per run (selection rotates `last_shown_on`); assert on six rows and on
  the reload showing the same six, not on which words.
- The demo user's zone is Asia/Jakarta and `ui` runs the browser in that zone (`--tz`). A browser
  in another zone would move the user's day through `TimezoneSync` mid-journey.
- `sql` against `current_date` is the container's UTC date; the card is dated in Asia/Jakarta. Near
  midnight UTC they differ by a day: read `card_date` instead.
