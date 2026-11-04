# Daily Words feature map

What the app does, from the user's side, and what proves each feature works. One file per feature,
each with the same four sections: `Sub-features`, `How to get to it (user POV)`,
`Driving it with verify.sh`, `Gotchas`. A plan's **Proof** section cites entries by file name.
`V=.claude/skills/verify-daily-words/scripts/verify.sh` and `S=.claude/skills/verify-daily-words/features/steps`
throughout. Paid calls are z.ai calls against the run's budget (default 20). Ids and slugs come from
the run's `evidence/00-seed.txt`.

| Feature | File | Surfaces | Paid calls |
| --- | --- | --- | --- |
| Today's card: "Make today's card", six rows, the streak pill, badges and the reward toast, the calendar | [today-card.md](today-card.md) | ui, api, sql | 0 |
| Adding a word: English enrichment, the non-English lookup, exact and near duplicates | [vocab-add.md](vocab-add.md) | ui, api, sql | 1 per word |
| Practising a word: the chat scene, replies, the 8-turn cap and the verdict | [chat.md](chat.md) | ui, sql, budget | 1 per turn; 9 per round |
| Discover: a suggestion batch, Another, Keep | [discover.md](discover.md) | ui, sql | 2 |
| The journal: a line, the near-duplicate warning, the insight | [journal.md](journal.md) | ui, sql, logs | 0; insight 1 |
| Sharing and claiming: create, the signed-out pages, revoke, the 404, claiming as another user | [share-claim.md](share-claim.md) | ui, api, sql | 0; 1 if the claim lands on a chat |
| Profile: stats, levels, the badge shelf and its one dialog, editing answers and the zone | [profile.md](profile.md) | ui, api, sql | 0 |
| Onboarding: the five questions, the birthday gate | [onboarding.md](onboarding.md) | ui, sql | 0 |
| Card reminders: subscription, the hourly tick, delivery, the 410 sweep, the switch's copy | [push-reminders.md](push-reminders.md) | push, tick, ui, api, sql | 0 |
| The no-scroll layout guarantee: the repo's own Playwright suite against the run | [layout.md](layout.md) | layout | 0 |

Add an entry when a change ships a new user-facing feature; fix an entry when the app's behavior
changed on purpose. A journey that fails because the app is broken is a product bug: report it,
do not edit the entry to match.
