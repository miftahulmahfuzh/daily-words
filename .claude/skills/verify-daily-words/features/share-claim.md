# Sharing and claiming

## Sub-features

- **Share this word** / **Share this card** / **Share this line** (`POST /api/shares`): a snapshot
  `shares` row with an 80-bit slug and `<APP_URL>/s/<slug>`. Headless Chromium has no
  `navigator.share` and the clipboard is not granted, so the link lands in the always-drawn
  selectable field (`Link to this word`).
- The public pages, **no session**: `/s/<slug>` (word, card or line), `/s/<card slug>/<1..6>` (one
  word of a card), each with **Practise this word** (words) or **Start your own journal** (lines).
- **Stop sharing** -> **Tap again to stop sharing** (the two-tap arm): the row is deleted; the URL
  is the same 404 and sentence as a slug that never existed ("This link is not available / It has
  been turned off, or it was never here.").
- The claim: `/s/<slug>/claim?tz=…` sets the signed `dw_claim` cookie (HttpOnly, 10 min) and 307s
  to `/claim`; a signed-in claimer sees "Adding <term> to your words…", `ClaimRunner` submits the
  server action (one INSERT, `source = 'shared'`, the sharer's enrichment copied, zero calls) and
  lands on the word's chat. `/claim` with no cookie: "Nothing to add here".

## How to get to it (user POV)

A word, a card (`/card/<date>`) or a line -> Share -> send the link. The recipient opens it and taps
**Practise this word**.

## Driving it with verify.sh

```sh
ID=$($V sql RUN --value "select id from vocab_entries where term='lugubrious'")
$V ui RUN $S/share.mjs -- $ID
# share url: http://localhost:42711/s/q7b9rbpnb2yfdzek
# signed out /s/q7b9rbpnb2yfdzek: HTTP 200 ... / revoked: "Share this word" is back
# after revoke, signed out /s/q7b9rbpnb2yfdzek: HTTP 404 -> This link is not available It has been turned off, or it was never here.
# the seeded slugs are in evidence/00-seed.txt:
$V api RUN --anon GET /s/<word slug>          # 200: petrichor /ˈpɛtrɪkɔː/ noun ... Practise this word
$V api RUN --anon GET /s/<card slug>/3        # 200: 3 November 2026 / one word of the card
$V api RUN --anon GET /s/<card slug>/7        # 404 (a position-shaped segment reaches the share 404, not /signin)
$V api RUN --anon GET /s/<journal slug>       # 200
$V api RUN --anon GET '/s/<word slug>/claim?tz=Europe%2FLondon'
# < set-cookie: dw_claim=v1.…; Path=/; …; Max-Age=600; HttpOnly; SameSite=lax   < HTTP 307 -> http://localhost:PORT/claim
$V api RUN --anon GET /claim                  # 200: Nothing to add here / Open a shared word and tap practise.
$V ui RUN $S/claim.mjs --as stranger -- <card slug>/3
# claim page: DAILY WORDS Adding halcyon to your words… ADD THE WORD
# landed: /vocab/<new id>/chat   page: ← BACK halcyon Composing
$V sql RUN "select v.term, v.source, v.enrichment_status from vocab_entries v join users u on u.id = v.user_id where u.email like 'stranger%'"
# halcyon | shared | ready
```

Cost: 0, plus 1 when the claim lands on the chat (its opener).

## Gotchas

- **Quote URLs with a `?` in zsh** (`'/s/…/claim?tz=…'`): unquoted, zsh globs it and refuses with
  "no matches found" before verify.sh runs.
- A card share has no **Practise this word**; its words at `/s/<card slug>/<n>` do. Pass
  `<card slug>/3` to `claim.mjs`.
- Claiming a word the claimer already holds (or their own share) writes nothing and redirects
  straight on: `stranger` can claim each seeded word once per run.
- Never tap **Add the word** in a steps file: `ClaimRunner` submits on mount and the button is
  detached mid-click. Wait for the URL to leave `/claim`.
- The run is addressed as `localhost`: the claim route redirects with `new URL('/claim', req.url)`
  and `next dev` reports `req.url` as localhost (SKILL.md Gotchas).
- `api`'s text view of a share 404 shows only "Daily Words" under `next dev` (the sentence is in the
  RSC payload); `share.mjs` asserts the sentence in the browser.
- The "Practise this word" on a shared page needs the reader's zone in the claim URL; the browser
  adds it, so a signed-out `api` call must pass `?tz=` itself.
