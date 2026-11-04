# The no-scroll layout guarantee

## Sub-features

- [R19]: `/today` never scrolls at 375x667 (iPhone SE 3) and degrades without scrolling at
  320x568; rows hold the 52px floor at the design target; one header row even with a three-digit
  streak. Asserted by `tests/e2e/no-scroll.spec.ts` against `/kitchen-sink/*` fixtures that carry
  worst-case strings.
- `chat-frame.spec.ts`, `share-frame.spec.ts`: the chat and share frames, same budget.
- `journal-duplicate.spec.ts` (signed in, writes, se3 only): the warning, **Keep it anyway**, the
  draft surviving a tab discard.
- `onboarding.spec.ts` (signed in as a user who has not onboarded): five screens fit, the footer
  clears the safe area.

## How to get to it (user POV)

Every screen, on a small phone.

## Driving it with verify.sh

```sh
$V layout RUN                                   # everything; ~45 s
# > playwright test (all but onboarding.spec) as demo   ... 3 skipped / 99 passed (43.6s)
# > playwright test onboarding.spec as newcomer          ... 4 passed (2.7s)
# result: PASS
$V layout RUN tests/e2e/no-scroll.spec.ts       # one spec, as demo
$V ui RUN $S/today-card.mjs                     # the same guarantee on the real /today, not a fixture
```

Cost: 0. The suite's own report and traces go to `<run>/pw-results` (deleted by `down`; the list
output is the evidence file).

## Gotchas

- `layout` writes `playwright.verify.config.ts` into the run's snapshot: the repo's config with
  `baseURL` set to the run and **no `webServer`**, so CLAUDE.md's trap (a stray production
  `next start` on 3200 reused, `/kitchen-sink` 404ing, 18 misleading timeouts) cannot happen here.
- The 3 skips are `journal-duplicate.spec.ts` at `se1`, skipped by design (behaviour, not layout).
- Run it before `onboarding.mjs`: once `newcomer` has onboarded, `onboarding.spec.ts` is redirected
  to `/today` and fails.
- WebKit (`PW_WEBKIT=1`) is not installed on this machine; the suite runs Chromium only, as it does
  for the owner.
- Its browser is Playwright's own, not the fenced `ui` one; the pages it loads fetch nothing
  off-origin.
