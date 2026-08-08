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
