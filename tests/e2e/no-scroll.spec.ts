import { test, expect, type Page } from "@playwright/test";
import { LAYOUT } from "../../src/lib/ui/layout";
import { DESIGN_TARGET_PROJECTS } from "../../playwright.config";

/**
 * The one mechanical guard on the roadmap's hardest constraint: "The card must
 * never scroll. This is a hard layout constraint, tested at 375px width."
 *
 * Three things are asserted, and they are independent on purpose:
 *
 *   1. The page does not scroll. If it does, the budget is blown outright.
 *      Asserted on every viewport, including ones below the design target.
 *   2. Every row clears the 52px floor from [R19]. Rows are `flex: 1 1 0`, so
 *      they compress silently; without this the page could stop scrolling by
 *      squeezing six rows into unreadable slivers and still "pass". Asserted
 *      only at the design target — below it, compression is the intended
 *      degradation rather than a failure, and measured 49px on a 2016 SE.
 *   3. The tab bar's bottom edge is inside the viewport. A tab bar pushed under
 *      the home indicator is the specific failure `viewport-fit=cover` and the
 *      safe-area padding exist to prevent.
 *
 * The fixture serves a 21-character term and a 134-character definition on
 * every row, because the claim being tested is that no string can change a
 * row's height.
 *
 * F13 added a fourth job, at the other end of the file: proving that the badge
 * dialog is genuinely outside the budget rather than merely believed to be. It
 * is the one thing in the app that draws over a screen, and the argument for
 * letting it — the top layer contributes zero document height — is exactly the
 * kind of claim that is true until someone gives the panel a `position` and
 * nothing throws.
 */

const COUNTS = [0, 1, 3, 6] as const;
const SCHEMES = ["light", "dark"] as const;

async function pageDoesNotScroll(page: Page) {
  const { scrollHeight, clientHeight } = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  });
  // +1 absorbs sub-pixel rounding at fractional device pixel ratios.
  expect(scrollHeight, "the page scrolls").toBeLessThanOrEqual(clientHeight + 1);
}

async function tabBarIsOnScreen(page: Page) {
  const bottom = await page
    .locator("nav[aria-label='Primary']")
    .evaluate((el) => el.getBoundingClientRect().bottom);
  const innerHeight = await page.evaluate(() => window.innerHeight);
  expect(bottom, "the tab bar is below the fold").toBeLessThanOrEqual(
    innerHeight + 1,
  );
}

for (const scheme of SCHEMES) {
  test.describe(`${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    for (const n of COUNTS) {
      test(`/today holds with ${n} word${n === 1 ? "" : "s"}`, async ({ page }) => {
        await page.goto(`/kitchen-sink/today?n=${n}`);

        await pageDoesNotScroll(page);
        await tabBarIsOnScreen(page);

        // The day strip is the last thing in the budget. If it is clipped, the
        // card has taken space it was not given.
        await expect(page.getByTestId("day-strip")).toBeInViewport();

        if (n === 0) {
          await expect(page.getByTestId("no-card-yet")).toBeVisible();
          return;
        }

        const card = page.getByTestId("daily-card");
        await expect(card).toBeVisible();

        const cardScrolls = await card.evaluate(
          (el) => el.scrollHeight > el.clientHeight + 1,
        );
        expect(cardScrolls, "the card scrolls internally").toBe(false);

        const rows = page.getByTestId("daily-card-row");
        await expect(rows).toHaveCount(n);

        if (!DESIGN_TARGET_PROJECTS.includes(test.info().project.name)) return;

        const heights = await rows.evaluateAll((els) =>
          els.map((el) => (el as HTMLElement).offsetHeight),
        );
        for (const height of heights) {
          expect(
            height,
            `row is ${height}px, below the ${LAYOUT.rowMinH}px floor`,
          ).toBeGreaterThanOrEqual(LAYOUT.rowMinH);
        }
      });
    }
  });
}

/**
 * F5's other card-region state, and the widest one: two buttons side by side
 * where every other state has at most one. It occupies the same `flex-1` slot
 * as the card, so it cannot push the strip or the tab bar off the screen — this
 * asserts that rather than assuming it.
 */
for (const scheme of SCHEMES) {
  test(`/today holds with the empty state (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/kitchen-sink/today?state=empty");

    await expect(page.getByTestId("card-empty")).toBeVisible();
    await pageDoesNotScroll(page);
    await tabBarIsOnScreen(page);
    await expect(page.getByTestId("day-strip")).toBeInViewport();
  });
}

test("both card lines are clamped to exactly one line", async ({ page }) => {
  await page.goto("/kitchen-sink/today?n=6");

  for (const testId of ["row-term", "row-definition"]) {
    const spans = page.getByTestId(testId);
    await expect(spans).toHaveCount(6);

    const measured = await spans.evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el as HTMLElement);
        return {
          height: (el as HTMLElement).getBoundingClientRect().height,
          lineHeight: parseFloat(cs.lineHeight),
          scrollWidth: (el as HTMLElement).scrollWidth,
          clientWidth: (el as HTMLElement).clientWidth,
        };
      }),
    );

    for (const m of measured) {
      // The fixture must actually be too long. Without this the clamp
      // assertion below is vacuous — a string that fits is never truncated,
      // and removing `truncate` from the component would still pass.
      expect(
        m.scrollWidth,
        `${testId} fits its box (${m.scrollWidth} ≤ ${m.clientWidth}); the fixture is not hostile enough to test truncation`,
      ).toBeGreaterThan(m.clientWidth);

      // One line box, exactly. A wrap adds a whole further line-height.
      expect(
        m.height,
        `${testId} occupies ${m.height}px against a ${m.lineHeight}px line box — it wrapped`,
      ).toBeLessThanOrEqual(m.lineHeight + 1);
    }
  }

  // And the rows are therefore all the same height. `flex: 1 1 0` divides the
  // card six ways and the remainder lands on one row, so a 1px spread is
  // arithmetic; anything larger means a row grew.
  const heights = await page
    .getByTestId("daily-card-row")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).offsetHeight));
  const spread = Math.max(...heights) - Math.min(...heights);
  expect(spread, `row heights differ too much: ${heights.join(", ")}`).toBeLessThanOrEqual(1);
});

/**
 * F10's version of the same claim, one screen down.
 *
 * `/journal` is a scrolling screen, so the no-scroll invariant does not apply to
 * it — but the promise that makes the list scannable does: a 1000-character
 * paste must occupy exactly the same three clamped lines as a six-word proverb.
 * Without the clamp one entry can be twenty screens tall, and nothing throws.
 *
 * The fixture at `/kitchen-sink/journal` carries both, in that order.
 */
test("a long paste is clamped to three lines in the journal list", async ({ page }) => {
  await page.goto("/kitchen-sink/journal");

  const titles = page.locator("a, div").getByText(/It was the best of times/).first();
  await expect(titles).toBeVisible();

  const measured = await titles.evaluate((el) => {
    const cs = getComputedStyle(el as HTMLElement);
    return {
      height: (el as HTMLElement).getBoundingClientRect().height,
      lineHeight: parseFloat(cs.lineHeight),
      scrollHeight: (el as HTMLElement).scrollHeight,
    };
  });

  // The fixture must actually overflow, or the clamp assertion is vacuous.
  expect(
    measured.scrollHeight,
    "the fixture is not long enough to test the clamp",
  ).toBeGreaterThan(measured.height);

  // Three line boxes, and not a fourth.
  expect(
    measured.height,
    `the long entry occupies ${measured.height}px against a ${measured.lineHeight}px line box`,
  ).toBeLessThanOrEqual(measured.lineHeight * 3 + 1);
});

/**
 * F13's badge dialog, and the claim that earns it its exemption from the layout
 * budget.
 *
 * The roadmap says every feature must assume routes, and its strongest reason
 * against a modal is that one "breaks fixed-height layout math when the URL bar
 * collapses". A native `<dialog>` opened with `showModal()` inverts that: the
 * top layer sits outside `.dw-screen`'s flex column and contributes zero height
 * to the document. That is an assertion, not a belief, so it is asserted here —
 * with the dialog OPEN, `/profile` must not have grown by a pixel.
 *
 * `?badge=` opens it on load. A Playwright click would work too, but it puts one
 * more moving part between the assertion and the claim.
 */
for (const scheme of SCHEMES) {
  test(`the badge dialog stays inside the viewport (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    // `tolkien` carries the longest gloss in `badge-meta.ts`. If any badge
    // overruns the panel it is this one.
    await page.goto("/kitchen-sink/profile?badge=tolkien");

    const dialog = page.locator("dialog");
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((el: HTMLDialogElement) => el.open),
      "the dialog is not in the modal top layer",
    ).toBe(true);

    // 1 — the top layer costs the document nothing. This is the whole exemption.
    await pageDoesNotScroll(page);

    // 2 — and it did not push the frame either.
    await tabBarIsOnScreen(page);

    // 3 — the panel is inside the viewport on all four edges. `toBeInViewport`
    //     would pass on a partially visible element, and a gloss clipped at the
    //     bottom is exactly the failure being ruled out.
    const box = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
    });
    const viewport = page.viewportSize()!;
    expect(box.top, "the panel is off the top").toBeGreaterThanOrEqual(-1);
    expect(box.left, "the panel is off the left").toBeGreaterThanOrEqual(-1);
    expect(box.bottom, "the panel is below the fold").toBeLessThanOrEqual(
      viewport.height + 1,
    );
    expect(box.right, "the panel is off the right").toBeLessThanOrEqual(
      viewport.width + 1,
    );

    // 4 — the UA focus trap is doing its job. Nothing in the app implements
    //     this; if it stops being true, `showModal()` was not called.
    expect(
      await page.evaluate(() => document.querySelector("dialog")!.contains(document.activeElement)),
      "focus escaped the dialog",
      ).toBe(true);

    // 5 — Escape closes it, and the shelf is still behind it. `onCancel` is
    //     what keeps React state and DOM state from diverging here; without it
    //     the element shuts and the component still believes it is open.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Leap Year Lexicographer")).toBeVisible();
  });
}

/**
 * The panel scrolls its own body rather than clipping, and only when it must.
 * At the design target the longest gloss fits outright; below it, the documented
 * degradation takes over. Both halves matter — a panel that always scrolls has
 * hidden the earned-on date from every user on every badge.
 */
test("the badge panel does not scroll internally at the design target", async ({ page }) => {
  await page.goto("/kitchen-sink/profile?badge=tolkien");
  await expect(page.locator("dialog")).toBeVisible();

  const overflow = await page
    .locator(".dw-badge-dialog-body")
    .evaluate((el) => el.scrollHeight - el.clientHeight);

  if (!DESIGN_TARGET_PROJECTS.includes(test.info().project.name)) return;
  expect(overflow, "the badge panel scrolls at the design target").toBeLessThanOrEqual(1);
});

/**
 * F21's hero, and the two properties that make it more than a bigger picture.
 *
 * The first is the user's actual ask: the art's colour reaches both edges of the
 * panel. That is invisible to every other assertion here — a hero inset by 20px
 * of `--card` looks correct in a screenshot at a glance and is exactly the thing
 * being removed.
 *
 * The second is the size rule. The band's height comes from its width through a
 * fixed aspect ratio and from nothing else, so it is a number this test can
 * state: at 375 the dialog's content box is 329px and 329 * 9/16 = 185.06.
 * Asserting the number rather than "it is tall" is what catches a well-meaning
 * dvh clamp being added later — see the note in globals.css for why there is
 * none. It also catches the failure this feature actually shipped with once: an
 * in-flow `<img>` inflating the band to 330px while `aspect-ratio` still read
 * `16 / 9` in the computed style, which a ratio-only assertion would have
 * passed.
 */
test("the badge hero bleeds to both edges of the panel", async ({ page }) => {
  await page.goto("/kitchen-sink/profile?badge=tolkien");
  await expect(page.locator("dialog")).toBeVisible();

  const { hero, panel, ratio } = await page.evaluate(() => {
    const d = document.querySelector("dialog")!.getBoundingClientRect();
    const h = document.querySelector(".dw-badge-hero")!.getBoundingClientRect();
    return {
      hero: { l: h.left, r: h.right, h: h.height, w: h.width },
      panel: { l: d.left, r: d.right },
      ratio: h.width / h.height,
    };
  });

  // Flush to the border on both sides — the 1px border is the only gap allowed.
  expect(hero.l - panel.l, "the hero is inset on the left").toBeLessThanOrEqual(1.5);
  expect(panel.r - hero.r, "the hero is inset on the right").toBeLessThanOrEqual(1.5);

  // 16 / 9 = 1.7778, and it must not be a dvh clamp in disguise.
  expect(ratio, "the hero is not 16/9").toBeCloseTo(16 / 9, 2);

  if (!DESIGN_TARGET_PROJECTS.includes(test.info().project.name)) return;
  expect(hero.w, "the dialog content box is not 329px at 375").toBeCloseTo(329, 0);
  expect(hero.h, "the hero is not 185px at the design target").toBeCloseTo(185.06, 0);
});

test("the journal list does not scroll sideways and keeps its tab bar", async ({ page }) => {
  await page.goto("/kitchen-sink/journal");

  await tabBarIsOnScreen(page);

  const overflows = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return el.scrollWidth > el.clientWidth + 1;
  });
  expect(overflows, "the page scrolls horizontally").toBe(false);
});

/**
 * F18's two additions.
 *
 * The eighteen assertions above now measure a `/kitchen-sink/today` fixture that
 * carries **both** header controls by default — that is the real guard on D3, and
 * it is why the fixture changed rather than gaining an opt-in flag. These two
 * cover what those eighteen structurally cannot.
 */

/**
 * **The header must stay one row**, and the existing spec cannot catch a wrap.
 *
 * A two-line header costs each row ~4.8px, and 60.8px still clears the 52px
 * floor — so all eighteen would stay green while the screen got visibly worse.
 * Driven at a three-digit streak, which is the widest the row can ever be:
 * "Today's card" at `text-2xl`, `gap-3` and "365 day run" inside a 331px content
 * box at 375px.
 *
 * **This assertion has already earned itself.** F18 D3 proposed a Share pill
 * beside the streak pill and estimated ~33px of slack; measured here, the header
 * went to 117px and the title wrapped. The pill was dropped for D3's own
 * fallback — the date links to `/card/[date]` — and this is what stops the next
 * person re-adding it on a calculation.
 *
 * Asserted two ways, because either alone is weak. The height bound catches a
 * wrap outright; the shared-baseline check catches the case where the trailing
 * block has dropped below the title without the header growing (a `flex-wrap`
 * on a container that happened to have room).
 */
for (const scheme of SCHEMES) {
  test(`/today's header is one row with a three-digit streak (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/kitchen-sink/today?n=6&streak=365");

    const header = page.locator("header").first();
    await expect(header).toBeVisible();

    if (!DESIGN_TARGET_PROJECTS.includes(test.info().project.name)) return;

    const measured = await header.evaluate((el) => {
      const h = el as HTMLElement;
      const title = h.querySelector("h1")!.getBoundingClientRect();
      const trailing = h.lastElementChild!.getBoundingClientRect();
      return {
        height: h.offsetHeight,
        titleBottom: title.bottom,
        trailingTop: trailing.top,
      };
    });

    expect(measured.height, "the header wrapped to two lines").toBeLessThanOrEqual(72);
    expect(
      measured.trailingTop,
      "the trailing block dropped below the title's baseline row",
    ).toBeLessThan(measured.titleBottom);
  });
}

/**
 * The shared card is the one public page with rows to measure.
 *
 * Vertical scrolling is expected here and is deliberately **not** asserted
 * against: a public page has no tab bar, no day strip and no `ScreenHeader`, so
 * it gets a different budget from `/today` and says so structurally (F18 D16).
 * What must hold is that the rows still clear the floor — the card is
 * `min-h-[396px] flex-none` rather than `flex-1`, which is arithmetic where
 * [R19] preferred structure, and this is what keeps that honest.
 *
 * And **no tab bar**: four tabs that all bounce to /signin are a trap, not
 * navigation. Its absence is a decision, so it is asserted rather than assumed.
 */
for (const scheme of SCHEMES) {
  test(`the shared card holds its rows and grows no tab bar (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/kitchen-sink/share?kind=card&n=6");

    const rows = page.getByTestId("daily-card-row");
    await expect(rows).toHaveCount(6);

    // A stranger has no session; four tabs that all bounce to /signin are worse
    // than none.
    await expect(page.locator("nav[aria-label='Primary']")).toHaveCount(0);

    // Sideways is still a bug, on every page in the app.
    const scrollsSideways = await page.evaluate(() => {
      const el = document.scrollingElement!;
      return el.scrollWidth > el.clientWidth + 1;
    });
    expect(scrollsSideways, "the page scrolls horizontally").toBe(false);

    // The sixth word is left un-enriched in the fixture, because a card is at
    // its most shareable on the day it was made — which is exactly when a word
    // added minutes earlier is still being looked up.
    await expect(page.getByTestId("row-definition")).toHaveCount(5);

    if (!DESIGN_TARGET_PROJECTS.includes(test.info().project.name)) return;

    const heights = await rows.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).offsetHeight),
    );
    for (const height of heights) {
      expect(
        height,
        `shared row is ${height}px, below the ${LAYOUT.rowMinH}px floor`,
      ).toBeGreaterThanOrEqual(LAYOUT.rowMinH);
    }
  });
}

/**
 * The shared journal entry. No rows to measure, so the claims are the two a
 * public page can get wrong: the CTA has to be reachable, and there must be no
 * tab bar.
 */
for (const scheme of SCHEMES) {
  test(`the shared journal entry offers its CTA and no tab bar (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/kitchen-sink/share?kind=journal");

    await expect(
      page.getByRole("button", { name: "Start your own journal" }),
    ).toBeVisible();
    // The line the design specified verbatim, reused rather than rewritten, so a
    // public-page rewrite cannot drop it.
    await expect(page.getByText("Written by the machine. Keep or discard.")).toBeVisible();
    await expect(page.locator("nav[aria-label='Primary']")).toHaveCount(0);
  });
}
