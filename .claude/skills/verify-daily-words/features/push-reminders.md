# Card reminders (push)

## Sub-features

- `POST /api/push/subscription` (what `ReminderToggle` and `PushSync` send: a `PushSubscription`'s
  JSON) upserts a `push_subscriptions` row; `GET /api/push/key` publishes the VAPID public key.
- `POST /api/push/tick` (the hourly GitHub workflow's curl; `CRON_SECRET` compared with
  `timingSafeEqual`): per subscribed user, the zone, the local hour, quiet if today's card exists,
  `dueSlot` (07 09 11 13 15 17 19, the slot due now and never a backlog), a line from the deck no
  other slot that day used, the delivery row claimed **before** the send, `web-push` to every device.
- Outcomes per user: `sent`, `quiet` (card made), `no_slot` (this slot already delivered, or outside
  07-19), `no_active_words` (a `skipped` row), `no_timezone`, `failed`; a device answering 404/410 is
  deleted (`subscriptionsPruned`).
- `/profile/edit` "Card reminders": the switch, or the reason there is none.
- `/sw.js` served to a signed-out reader as JavaScript with no `immutable`.

## How to get to it (user POV)

Profile -> edit -> Card reminders -> the switch (on an iPhone, only from the Home-Screen install).
Then a notification at the next odd hour until today's card is made.

## Driving it with verify.sh

The run's fake push service plays the phone: `push subscribe` mints a device key pair, registers its
endpoint through the real route, and `push inbox` shows what arrived, decrypted with that key.

The outcomes depend on what the run has already done. Below, `today-card.mjs` (demo has a card)
and `claim.mjs --as stranger` (stranger owns a word) ran first; in a fresh run `demo` is `sent`
and `stranger` is `no_active_words`.

```sh
$V push RUN subscribe                   # demo (today's card made earlier in the run -> quiet)
$V push RUN subscribe --as stranger     # has a claimed word, no card -> sent
$V tick RUN --secret=wrong              # 401 {"code":"unauthenticated","message":"Not authorised."}
$V tick RUN
# "candidates": 2, "quiet": 1, "sent": 1, "notificationsSent": 1
$V push RUN inbox
# "device": "voFS2i3M5_NI", "ttl": "3600", "urgency": "normal", "topic": "daily-card", "encoding": "aes128gcm",
# "vapid": "run key", "payload": {"title": "Today is unopened", "body": "The card for it has not been made.",
# "url": "/today", "tag": "daily-card-reminder"}, "answered": 201
$V tick RUN                             # "no_slot": 1 (slot 7 already delivered), "sent": 0
# the 410 sweep, and a second slot: a gone device, and the user moved two hours east
$V push RUN subscribe --gone --as stranger
$V api RUN --as stranger POST /api/profile/timezone '{"timezone":"Asia/Tokyo","manual":true}'
$V tick RUN
# "sent": 1, "notificationsSent": 1, "subscriptionsPruned": 1  (inbox: "Two minutes" 201, gone-… 410)
$V sql RUN "select u.email, d.local_date, d.slot, d.status from push_deliveries d join users u on u.id = d.user_id order by slot"
# stranger | 2026-11-04 | 7 | sent / newcomer | 2026-11-04 | 7 | skipped / stranger | 2026-11-04 | 9 | sent
$V ui RUN $S/reminder-toggle.mjs
# before: Card reminders Notifications are turned off for Daily Words. Turn them back on in iOS Settings, ...
# Notification.permission: denied / no switch drawn (the app explained why instead)
$V api RUN --anon GET /sw.js            # < cache-control: no-cache   < HTTP 200 application/javascript
```

Cost: 0 paid calls.

## Gotchas

- **Only 07:00-19:59 in the user's zone sends.** The demo users are in Asia/Jakarta. Outside that
  window move the user to a zone where it is about noon, through the real route:
  `Z=$(python3 -c 'import datetime as d; h=d.datetime.now(d.timezone.utc).hour; o=(12-h+11)%24-11; print("Etc/GMT%+d" % -o if o else "UTC")')`
  then `$V api RUN --as stranger POST /api/profile/timezone "{\"timezone\":\"$Z\",\"manual\":true}"`
  (`Etc/GMT-5` is UTC+5: the sign is POSIX's, inverted).
- A slot is delivered once per user per day: a second tick in the same slot is `no_slot`. Move the
  zone (as above) or `down` + `up` to see `sent` again.
- `demo` is `quiet` once today's card is made in the run; `newcomer` has no words, so their devices
  are never tried (`no_active_words`): give `--gone` devices to `stranger`.
- The browser cannot subscribe: headless Chromium answers `Notification.permission === "denied"`,
  so the switch is replaced by the denied copy. That is the end state to assert for the UI; the
  subscription body is posted by `push subscribe` instead. The iOS Home-Screen requirement is a
  phone check (CLAUDE.md), outside this harness.
- Nothing here can reach a real device: the VAPID pair is minted per run, the only endpoints are
  the sink's (`doctor` fails otherwise), and `https.request` to any other host is refused. Never
  run `npm run push:send` from a verify session: it reads `.env.local` and sends to the owner's
  phone.
