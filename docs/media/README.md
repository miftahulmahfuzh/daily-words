# docs/media

The README's screenshots and GIFs. Everything here is generated; nothing in this
directory is hand-edited.

```bash
npm run dev                # 3200, and it must stay up
npm run demo:seed          # the account these were shot against
npm run demo:capture       # writes every file beside this one
npm run demo:capture -- --only=today,07-profile    # redo two of them
npm run demo:seed -- --clean                       # delete the account
```

`scripts/seed-demo.ts` and `scripts/capture-media.ts` carry the long version in
their headers. Four things about them are worth knowing before touching either.

**The captures are of the real app, not of `/kitchen-sink`.** Those fixtures
exist to prove no string can change a row's height, so they carry a
35-character term and a 140-character definition on every row. That is the right
content to measure and the wrong content to photograph.

**The account is seeded through the app's own paths wherever one exists.**
`createCard` picks the six words, so `last_shown_on` rotates exactly as it does
in production; `recomputeUserGamification` derives the streaks, the two levels
and every badge award from the card rows. Nothing writes `user_stats`
by hand — a screenshot of a state the app cannot produce is worse than no
screenshot.

**375×667, and `deviceScaleFactor: 2` for the stills.** That is the iPhone SE
3rd gen, the width the layout budget was measured against and
`playwright.config.ts`'s `se3` project. The README draws them at ~230–300px, so
the 2× frame is what keeps them sharp; the videos are 1× because the recorder's
size is CSS pixels either way.

**The GIFs record real interaction, and the pointer is drawn in.** `today.gif` is
one real `POST /api/cards`. Playwright renders no cursor, so the capture script
injects a ring that follows the mouse and pulses on press — without it every GIF
reads as the screen changing by itself, which is the one thing this app's
`/today` must never look like. The same script hides Next's dev overlay, which
otherwise sits over the first tab-bar destination in every frame.

Two things are visible in the stills and are not mistakes:

- **Share URLs read `http://localhost:3200/s/…`.** They were captured from the
  dev server, and the alternative was to fake a `dword.site` origin in a
  screenshot of a page that was never served from there.
- **Today's date is 19 August 2026** and the seed dates everything relative to
  it. Re-running `demo:seed` moves the whole history forward, which is why the
  calendar's crosses and the streak numbers change between captures.

Re-shooting the set costs one `npm run demo:seed` and about ninety seconds. Do
that rather than editing a PNG.
