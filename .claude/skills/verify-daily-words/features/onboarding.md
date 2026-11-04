# Onboarding

## Sub-features

- The `(app)` layout's first gate, `requireOnboardedUser()`: a user with `onboarded_at` null is sent
  from any app route to `/onboarding`.
- Five questions ("What do you do?", "What are you into?", "Reading or watching anything right
  now?", "Where do you use English?", "How should the chat talk to you?"), **Skip all** on the first,
  **Next** / **Skip**, **Done** on the fifth -> `POST /api/profile/complete` (answers, the detected
  zone, `onboarded_at`).
- The second gate: `needsBirthdayPrompt` sends the user to `/birthday` exactly once ("One question /
  When is your birthday?", **Save**); answering or skipping stamps `birthday_asked_at`.
- A user with no words lands on `/today`'s empty state: "No words yet." with **Add a word** and
  **Discover**.

## How to get to it (user POV)

The first sign-in.

## Driving it with verify.sh

```sh
$V ui RUN $S/onboarding.mjs --as newcomer             # [occupation] [birthday | skip]
# /today sent this user to /onboarding / birthday gate: /birthday
# landed: /today: WEDNESDAY 4 NOVEMBER Today’s card No words yet. ADD A WORD DISCOVER ...
$V sql RUN "select p.occupation, p.birthday, p.timezone, p.onboarded_at is not null, p.birthday_asked_at is not null from profiles p join users u on u.id = p.user_id where u.email like 'newcomer%'"
# nurse | 1990-05-17 | Asia/Jakarta | t | t
```

Cost: 0. `layout` runs `onboarding.spec.ts` as `newcomer` (4 passed) for the layout half.

## Gotchas

- One-shot per run: `newcomer` is onboarded afterwards. Run `layout` **before** this journey, since
  `onboarding.spec.ts` needs an un-onboarded user, and `down` + `up` for another pass.
- Done pushes `/today` and the layout redirects again to `/birthday`, which compiles on first use:
  wait for a screen, never for a URL (an early recipe ended on a blank page mid-redirect).
- The zone comes from the browser (`ui --tz`, default Asia/Jakarta); the run never guesses one.
- The claim path can also onboard (five nulls plus the cookie's zone); that is a stranger with no
  session, which needs Google sign-in and is not drivable here.
