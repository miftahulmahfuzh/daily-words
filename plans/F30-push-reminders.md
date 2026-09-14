# F30 — Push reminders to make today's card

**Plan set:** `PUSH_CARD_REMINDERS_PLAN.md`, five phases, 2026-09-14. Branch
`feature/push-card-reminders`.

The user's words, verbatim: *"make sure the app send a different reminder as a
push notification in my xs max to generate today's card. start from 7 am in the
morning, then send a new one every 2 hours until 8 pm."*

**Supersedes, in part.** This plan is the first in the repository to build a
scheduled job or a notification of any kind, and eleven earlier plans forbid
one. §8 is the table of which of those sentences moved and which are simply
still true — it is the most useful section in this file, because a reader who
finds a prohibition in `plans/F9` needs to know which kind it is. In summary
it supersedes: `plans/F1-foundation.md:93` (as to the service worker and push,
**not** as to offline caching), `plans/F5-daily-card.md:87`,
`plans/F7-onboarding.md:76` (as to reminders, **not** as to the nag),
`plans/F8-discovery.md:105` (as to notifications, **not** as to scheduled
discovery or auto-adding), `plans/F9-gamification.md:69` (as to push, **not** as
to loss aversion), and `plans/F16-share-infra.md:219`'s `expires_at` paragraph.
It supersedes nothing in `plans/F3:76`, `F6:76`, `F10:77`, `F13:213` or
`F17:277`, all of which remain true as written.

**Binding context:** `ROADMAP_v0.1.0.md` **[R24]**, which is what authorises any
of this and which was written before a line of code (phase 1), because
`CLAUDE.md`'s authority order makes the roadmap win over any plan and building
four phases against a document that forbids the feature is the contradiction the
order exists to prevent.

---

## 1. What was asked, and the two words it turns on

Two phrases in the request are load-bearing beyond the obvious.

**"a different reminder."** The thing being asked against is the same sentence
seven times a day. That is a requirement about *copy*, and it is the one part of
this feature that a user experiences directly and repeatedly. R2.

**"to generate today's card."** The notification's job is to bring a person to
the button. It is not to press it. Everything in §2 follows from that reading,
and the reading is not strained: the app's central claim, in the README's second
paragraph and in `POST /api/cards`'s own header comment, is that nothing is
generated until you press.

The third requirement is arithmetic. R3: 07:00, every two hours, until 20:00.

## 2. The ruling that had to come first

`ROADMAP_v0.1.0.md` forbade this feature twice:

> § Explicitly out of scope — *"Push notifications or reminders of any kind"*
>
> **[R11]** — *"No cron job — a scheduled job is the first step toward the
> notifications this roadmap forbids, and recomputation is trivially cheap at
> one user."*

The precedent for what to do about that is `[R23]`, which amended `[R21]` on a
direct user request recorded in the session that asked for it, and `[R22]`,
which says out loud that the table *"is authoritative; it is also amendable, and
this is what an amendment looks like."* This request has exactly that
provenance. So the roadmap was **amended, not ignored**, and `[R24]` was written
first, in phase 1, before any schema or any route.

Two things about `[R24]` matter more than the ruling itself.

**`[R11]`'s actual ruling is untouched.** `user_stats` is still a cache, still
recomputed on read at every consumer, still never displayed from the row. This
feature does not read that table and does not write it. What `[R24]` supersedes
is only the generalisation hung off the end of `[R11]` — that *any* scheduled
job is the first step toward notifications. The step was taken deliberately,
once, for one thing, by the person who wrote the prohibition.

**The prohibition is replaced, not removed.** The invariant that took its place
is narrower and stronger, and every phase in the set was checked against it:

> **Nothing scheduled may create a card.**

## 3. What was built

```
GitHub Actions, hourly ──► POST /api/push/tick   (CRON_SECRET, timingSafeEqual)
                                 │
                  per subscribed user:
                    resolveTimezone      ──► !ok ? send nothing, write nothing
                    localDateNow + localHour       (lib/time/local-date.ts)
                    getCardForDate       ──► card exists ? quiet for the rest of the day
                    dueSlot({ localHour, delivered })  ──► 7 9 11 13 15 17 19, or none
                    reminderFor(date, slot)
                    claim the slot, send, record the outcome
                                 │
                    web-push ──► the vendor's push service ──► public/sw.js
                                      'push'              ──► showNotification
                                      'notificationclick' ──► /today
```

| Phase | What it owns |
|---|---|
| 1 | `[R24]`; `push_subscriptions`, `push_deliveries`, migration 0010; `lib/push/schedule.ts`; `lib/push/reminders.ts`; `push:check` |
| 2 | the four environment variables; `web-push`; `lib/db/queries/push.ts`; `lib/push/{send,schemas,client}.ts`; `GET /api/push/key`; `POST`/`DELETE /api/push/subscription` |
| 3 | `public/sw.js`; the middleware exemption and `badges:check` §12; the `/sw.js` no-cache header; `<PushSync />`; the `/profile/edit` switch |
| 4 | `lib/push/tick.ts`; `POST /api/push/tick`; `.github/workflows/push-reminders.yml`; `push:send`; `push:db` |
| 5 | this file, and the doc sweep |

## 4. The schedule is three constants, and the slots are derived

`src/lib/push/schedule.ts`:

```ts
REMINDER_FIRST_HOUR  = 7
REMINDER_EVERY_HOURS = 2
REMINDER_UNTIL_HOUR  = 20
```

`REMINDER_SLOTS` is computed from them and comes out as
`[7, 9, 11, 13, 15, 17, 19]`.

**"until 8 pm" is a window bound, not a slot.** No two-hour step from 07:00
lands on 20:00, so the last reminder is at 19:00. That reading is an
interpretation of a sentence and is written down here as one — but it is encoded
as three numbers rather than as a hand-written array of seven precisely so that
if the reading is wrong, the fix is one digit and the slots follow. A literal
array would have made the sentence and the code two separate things that agree
by coincidence.

Every hour and every day boundary goes through `src/lib/time/local-date.ts`,
which is the only file in the app allowed to construct `Intl.DateTimeFormat` or
do date arithmetic. `localHour` already existed — it drives the `midnight_oil`
badge — and is exactly the function a slot resolver needs.

`dueSlot({ localHour, delivered })` is the catch-up rule: given the current
local hour and the set of slots already delivered today, it answers with the one
slot that is due **now**, or none. It never returns a backlog. That is what
makes a late scheduler survivable rather than a burst of four notifications at
teatime — see D5.

## 5. Why a deck and not a model call

The copy lives in `src/lib/push/reminders.ts` as a curated list, and
`reminderFor(date, slot)` is deterministic in `(local date, slot)`.

A fan-out through `lib/llm/` was rejected on four counts, and the first alone
would have decided it. An hourly unattended path is the worst place in the app
to put a network call that can fail, because nobody is watching and the failure
mode is silence — which is indistinguishable from "no card is due". It would be
billable, on a schedule, forever. It would be non-deterministic, so
`npm run push:check` could assert nothing about the copy, where against a deck
it asserts that no two lines share a body and that a whole day's seven are
pairwise distinct across four hundred consecutive dates. And R2 does not ask for
generated copy — it asks for *different* copy, which a deck delivers exactly.

## 6. Where the scheduler lives

**`.github/workflows/push-reminders.yml`, hourly.** One `curl` at
`POST /api/push/tick`, one secret. It is the repository's first `.github/`
directory; there is still no CI.

**Not `vercel.json`.** That file is two lines with one purpose —
`regions: ["sin1"]`, so the functions run beside Neon in `ap-southeast-1` — and
`CLAUDE.md` has a section about why that one purpose is the whole of it. A
`crons` entry finer than once a day is rejected at deploy time on a Hobby plan:
the *deployment* fails, not the cron. Trading "the scheduler lives in a second
file" for "a config change can take the whole app down" is not a trade.

The workflow ticks hourly and the slots are two hours apart, so roughly half the
ticks find nothing due and answer immediately. That is the intended shape: an
hourly tick is what makes `dueSlot`'s catch-up cheap, because the worst case for
a missed run is one hour of lateness rather than two.

## 7. iOS, and the four honest states

**iOS grants Web Push only to a Home-Screen install.** Safari on iOS 16.4+
exposes `pushManager` exclusively to a web app launched from the Home Screen; in
an ordinary tab `navigator.serviceWorker` exists and `registration.pushManager`
does not. The app already shipped `public/manifest.webmanifest` with
`display: standalone` and `start_url: /today`, so nothing about the install had
to be built — only said.

The switch on `/profile/edit` therefore has four states rather than two: on, off,
"your browser cannot do this", and "add Daily Words to your Home Screen first,
then come back". The fourth is the one that matters, and the reason it is copy
rather than a disabled control is that a dead toggle is a bug report. Two
further constraints shaped it: `Notification.requestPermission()` must be called
from a user gesture on iOS or it is refused silently, so the tap asks and
nothing else may; and permission, once denied, cannot be re-requested by the
page, so the denied state has to name the Settings app rather than offer a
button that does nothing.

It is on `/profile/edit` and not on `/profile`, which is the pride screen and
holds no settings ([R11]'s neighbours, F9 §10.3, F13), and not on `/today`,
which has no vertical budget for it — F18 D3 measured what one extra header
control costs there and the answer was a wrapped title at 375px.

## 8. What `[R24]` moved, and what it did not

This is the table to read before citing any earlier plan's prohibition.

| Where | What it says | Status |
|---|---|---|
| `ROADMAP:422` | "Push notifications or reminders of any kind" | **Amended** by [R24], for the daily-card reminder only |
| `ROADMAP:562` ([R11]) | "No cron job — a scheduled job is the first step toward the notifications this roadmap forbids" | **Amended** by [R24]. [R11]'s ruling on `user_stats` is untouched |
| `plans/F1:93` | "Service worker, offline caching, push notifications" | **Amended** as to the service worker and push. **Offline caching is still out of scope and still absent** — `sw.js` has no `fetch` handler |
| `plans/F5:87` | "Notifications or reminders of any kind" | **Amended.** This is the feature |
| `plans/F7:76` | "Push notifications, reminders, or a 'finish your profile' nag anywhere in the app" | **Amended** as to reminders. The nag clause stands, and F17 §"Is the user ever prompted to finish?" relies on it |
| `plans/F8:105` | "Notifications, scheduled discovery, or auto-adding words" | **Amended** as to notifications. Scheduled discovery and auto-adding remain forbidden, and roadmap principle 5 — *the user nudges, always* — is untouched: the reminder nudges the **user**, not the app |
| `plans/F9:69` | "Notifications, reminders, push, email of any kind" | **Amended** as to push, for one message type. **Email is still forbidden.** The loss-aversion clause immediately below it — no "your streak is at risk", no countdown, no red warning states — is **not** amended and constrains this feature's copy directly |
| `plans/F16:219` | "Shares never expire… there is no cron in this app and none is coming" | **Amended** as to the premise. `expires_at` is still correctly absent — see `schema.ts`'s amended comment |
| `plans/F3:76` | "Any background job, queue, cron, or `waitUntil`" | **Stands.** F3's enrichment path is still synchronous inside the request that starts it |
| `plans/F6:76` | "Push notifications or nudges to resume a chat" | **Stands.** One notification type, one destination |
| `plans/F10:77` | "Background jobs, queues, cron, or webhooks" for the journal | **Stands.** The insight call is still synchronous inside an explicit tap |
| `plans/F13:213` | "No notification, no reminder, no calendar marker, no badge dot on the Profile tab" | **Stands, entirely.** Badges notify nobody |
| `plans/F17:277` | "Is the user ever prompted to finish? No, and deliberately" | **Stands** |

Four moved in part, two moved outright, seven stand. The point of writing it out
is that "the roadmap forbids notifications" is no longer a sentence anyone can
use without checking which clause they mean.

## 9. Decisions

### D1 — The roadmap is amended, not ignored.

`[R24]` is written in `[R23]`'s shape, and for `[R22]`'s stated reason: the
table is authoritative and amendable, and an amendment is what a direct user
request against a locked decision produces. It was written in **phase 1**,
before the schema, because the authority order makes the roadmap win over any
plan and four phases built against a document that forbids them is the exact
contradiction this workflow exists to surface.

### D2 — The scheduler sends a message. It does not press the button.

`POST /api/cards` is unchanged and its comment — *"If you find yourself writing
a scheduler, stop"* — is unchanged, byte for byte. It was never relaxed and
never needed to be: it is a rule about **card creation**, and the tick has no
write path into `daily_cards`.

The alternative was obvious and was rejected on the app's central claim rather
than on difficulty. A scheduled job that made the card would mean waking up to a
card you did not make, which is the state the README's second paragraph
promises does not exist, and which would quietly turn a daily exercise into a
daily feed.

### D3 — Three constants, not an array of seven.

§4. The sentence the user wrote is what the code says, and a re-reading of the
window bound is a one-digit change.

### D4 — A curated deterministic deck, not a model call.

§5. The first of its four reasons — an unattended hourly network call whose
failure is indistinguishable from "nothing is due" — would have decided it
alone.

### D5 — `dueSlot` answers with the slot due now, never a backlog.

GitHub Actions' cron is a best-effort queue, not a guarantee, and a run can land
well behind its stamp. Without a catch-up rule, lateness becomes either a lost
reminder or a burst. `dueSlot` takes the current local hour and the set of slots
already delivered today and returns at most one slot. A tick that misses 11:00
and arrives after 13:00 sends one line.

The burst is the failure worth naming: four notifications in a row is how a
person learns to ignore the lock screen, and after that the feature is worse
than not shipping it.

### D6 — The delivery row is claimed before the send, not written after it.

Enforced by a unique index on `(user, local date, slot)` rather than by
application code — the `chat_messages` opener precedent, where a second opener
in a round is refused by a partial unique index. Two overlapping ticks (a late
run beside the next scheduled one) would otherwise both find the slot
undelivered and both send.

**The cost, stated plainly:** a send that fails leaves a failed row rather than
retrying, so a transient failure is a missed reminder. With seven slots a day
that is cheap, and it is the correct direction to fail — a duplicate two hours
later trains the user to stop reading, and a missed one costs nothing they will
notice.

### D7 — `push_deliveries` is a record, not a queue.

No retry, no backoff, no job table, no `waitUntil`. One user and single-digit
devices; the tick iterates every subscription in one request. The ceiling is
named rather than engineered around, which is the same call
`lib/vocab/suggestion-rate-limit.ts` made and defended: *"Revisit only if quota
is actually exhausted."* Past it, the honest fix is a queue, not a bigger
timeout.

### D8 — An unresolvable timezone means send nothing.

`resolveTimezone` returns `{ ok: false, timezone: DEFAULT }` for a missing or
invalid zone, and the app's rule is that **reads may fall back and writes may
not**. A reminder sits awkwardly between the two: it is a read, but it produces
a durable artefact on someone's lock screen at an hour chosen by a guess. A
guessed zone means a 07:00 reminder arriving at 02:00, repeatedly, silently, and
the person cannot tell why. So `!ok` is treated as a write: no send, no row.
`POST /api/cards` refuses with a 409 in the same situation for the same reason.

### D9 — The switch is on `/profile/edit`.

§7. Not `/profile`, which is the pride screen and holds no settings; not
`/today`, which has no room. It writes on tap rather than through the Save
button, the way the timezone is its own request — because a reminder toggle that
silently needs a Save is a toggle that does not work.

### D10 — One notification type, one destination.

No badge news, no chat nudge, no journal prompt, no digest, no email. `[R24]`
amended a clause, not a category, and the clause it amended names the daily
card. F9's loss-aversion ban constrains the copy directly: the deck contains no
"your streak is at risk", no countdown and no warning register, because that ban
was never about the delivery mechanism.

## 10. What is touched

| File | Change | Phase |
|---|---|---|
| `ROADMAP_v0.1.0.md` | `[R24]`; the out-of-scope bullet and `[R11]`'s closing paragraph, amended | 1 |
| `src/lib/db/schema.ts` | `push_subscriptions`, `push_deliveries`; the `shares` comment amended | 1, 5 |
| `src/lib/db/types.ts`, `drizzle/0010_*` | the inferred types and the additive migration | 1 |
| `src/lib/push/schedule.ts`, `reminders.ts` | new — the slots and the deck | 1 |
| `src/lib/env.ts` | four optional variables | 2 |
| `src/lib/db/queries/push.ts` | new — CRUD, plus `listReminderCandidates()` | 2 |
| `src/lib/push/{send,schemas,client}.ts` | new | 2 |
| `src/app/api/push/{key,subscription}/route.ts` | new | 2 |
| `public/sw.js` | new — `push` and `notificationclick`, no `fetch` | 3 |
| `src/middleware.ts`, `scripts/check-badge-art.ts` §12, `next.config.ts` | the exemption, its guard, and the no-cache header | 3 |
| `src/components/push/{push-sync,reminder-toggle}.tsx` | new | 3 |
| `src/app/(app)/layout.tsx`, `src/components/profile/profile-edit-form.tsx` | mount and section | 3 |
| `src/lib/push/tick.ts`, `src/app/api/push/tick/route.ts` | new | 4 |
| `.github/workflows/push-reminders.yml` | new — the scheduler | 4 |
| `scripts/{push-send,check-push,check-push-db}.ts`, `package.json` | three scripts | 1, 4 |
| `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `.env.example`, this file | the doc sweep | 5 |

## 11. How it is verified

- **`npm run push:check`** — offline, no environment, no network. Slot
  derivation from the three constants; the catch-up matrix over all 24 local
  hours against every subset of already-delivered slots; no two deck lines
  sharing a body; a whole day's seven pairwise distinct across 400 consecutive
  dates; the same `(date, slot)` always yielding the same line; and the secret
  property — **every file under `src/` naming `VAPID_PRIVATE_KEY` or
  `CRON_SECRET` begins with `import 'server-only'`**, so neither literal can
  reach a client bundle. Not a list of sanctioned filenames: `lib/push/send.ts`
  and the tick route each name one legitimately.
- **`npm run push:db`** — the unique index, delivery idempotence, the 410 sweep
  deleting rather than retrying, and a user with today's card getting nothing
  and no row. Seeds and deletes a fixture user.
- **`npm run push:send`** — one real notification at your own subscriptions. No
  schedule, no rows. The equivalent of `chat:dry-run`, and the only thing that
  proves the phone half.
- **`curl -sI http://localhost:3200/sw.js` with no cookie jar** — 200,
  `application/javascript`, and a cache header that is not `immutable`. A 307
  means the matcher exemption is gone, and the author, who is signed in, will
  never see it.
- **The phone.** Add to Home Screen, open from the icon, turn the switch on,
  `npm run push:send`. Nothing on a desktop can tell you whether this works.
- **`npm run badges:check`** — §12 with `sw` in its excluded-prefix regex.
- **`npm run test:layout`** — the eighteen no-scroll assertions, unchanged and
  green, because nothing was added to `/today`.
- **`npm run typecheck`, `npm run lint`, `npm run build`**, and every
  pre-existing check script.
