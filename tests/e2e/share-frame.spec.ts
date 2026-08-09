import { test, expect, type Page } from "@playwright/test";

/**
 * The public share page's frame.
 *
 * This is the only screen in the app with no tab bar, no `ScreenHeader` and one
 * action pinned to the foot of the pane — so "does the CTA stay inside the
 * viewport" has no other screen to inherit an answer from, and the person it
 * fails for is a stranger the author will never hear from.
 *
 * Three claims, and they are independent:
 *
 *   1. **The page does not scroll; the pane does.** The invariant
 *      `chat-frame.spec.ts` states, and the reason nothing on this page may set
 *      `height: 100vh`, `position: fixed` or `overflow` on `<body>` — those
 *      belong to `Screen`.
 *   2. **"Practise this word" is inside the viewport.** The `viewport-fit=cover`
 *      failure ([R16]): without the safe-area padding the one control the whole
 *      feature exists for sits under the home indicator.
 *   3. **There is no tab bar.** Four tabs that all bounce to /signin are a trap,
 *      not navigation, and their absence is a decision rather than an oversight.
 *
 * The `long` fixture carries a 17-character unbreakable term and three
 * 134-character examples, because the claim under test is that **no string can
 * make the page scroll**.
 *
 * The fixture route is dev-only and unauthenticated — the real page needs a
 * `shares` row, and a spec that seeds one would be testing the database rather
 * than the frame. `share:db -- --keep` is how the real page gets looked at.
 */

const STATES = ["short", "long", "noexamples"] as const;
const SCHEMES = ["light", "dark"] as const;

async function pageDoesNotScroll(page: Page) {
  const { scrollHeight, clientHeight } = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  });
  // +1 absorbs sub-pixel rounding at fractional device pixel ratios.
  expect(scrollHeight, "the page scrolls").toBeLessThanOrEqual(clientHeight + 1);
}

for (const scheme of SCHEMES) {
  test.describe(`${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    for (const state of STATES) {
      test(`the shared word holds: ${state}`, async ({ page }) => {
        await page.goto(`/kitchen-sink/share?state=${state}`);

        const cta = page.getByRole("link", { name: "Practise this word" });
        await expect(cta).toBeVisible();

        await pageDoesNotScroll(page);

        // A stranger has nowhere to go back to and no session to navigate with.
        await expect(page.locator("nav[aria-label='Primary']")).toHaveCount(0);

        const innerHeight = await page.evaluate(() => window.innerHeight);
        const box = (await cta.boundingBox())!;
        expect(
          box.y + box.height,
          "the CTA is below the fold",
        ).toBeLessThanOrEqual(innerHeight + 1);

        // The pane is what takes the overflow, and it is the only thing that may.
        const panes = page.locator(".dw-pane-scroll");
        await expect(panes).toHaveCount(1);

        // Never a "Usage" heading over nothing.
        await expect(page.getByText("Usage", { exact: true })).toHaveCount(
          state === "noexamples" ? 0 : 1,
        );
      });
    }
  });
}

test("the long fixture genuinely overflows, so the no-scroll claim is not vacuous", async ({
  page,
}) => {
  await page.goto("/kitchen-sink/share?state=long");

  const scrollable = await page
    .locator(".dw-pane-scroll")
    .evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  expect(scrollable, "the fixture is too short to test anything").toBe(true);
});
