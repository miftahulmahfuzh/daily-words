import { test, expect, type Page } from "@playwright/test";

/**
 * The mechanical half of F6 §13.10.
 *
 * Nine of that checklist's boxes need a real iPhone and a real keyboard, and
 * this file does not pretend otherwise — Playwright cannot raise the software
 * keyboard, so `visualViewport` never shrinks and the `--vvh` path is untested
 * here by construction. What it does cover is everything true with the keyboard
 * *down*, which is where the frame is either right or wrong before the keyboard
 * is ever involved:
 *
 *   1. The page itself does not scroll. Only the transcript does.
 *   2. The composer's bottom edge is inside the viewport — the failure that
 *      `viewport-fit=cover` and the safe-area padding exist to prevent.
 *   3. The transcript's own bottom edge stops above the composer, so the newest
 *      message is never behind it.
 *   4. There is no tab bar. At 375×667 with a keyboard there is no room for
 *      one, and its absence is a decision (F6 §9.1) rather than an oversight.
 *   5. The input is at least 16px, or iOS zooms the viewport on focus and
 *      cascades into every other problem on this screen.
 *
 * The fixture serves the tallest transcript a round can produce and a term long
 * enough to overflow the header.
 */

const STATES = [
  { name: "mid-round", query: "?state=open" },
  { name: "mid-round with a previous round above", query: "?state=open&rounds=2" },
  { name: "closed, with the verdict and Practise again", query: "?state=closed" },
] as const;

async function pageDoesNotScroll(page: Page) {
  const { scrollHeight, clientHeight } = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  });
  // +1 absorbs sub-pixel rounding at fractional device pixel ratios.
  expect(scrollHeight, "the page scrolls").toBeLessThanOrEqual(clientHeight + 1);
}

for (const { name, query } of STATES) {
  test(`the chat frame holds: ${name}`, async ({ page }) => {
    await page.goto(`/kitchen-sink/chat${query}`);
    await expect(page.getByRole("img", { name: /turns used/ })).toBeVisible();

    await pageDoesNotScroll(page);

    // The tab bar is deliberately absent on this route.
    await expect(page.locator("nav[aria-label='Primary']")).toHaveCount(0);

    const innerHeight = await page.evaluate(() => window.innerHeight);

    // The transcript is the pane that scrolls, and it is the ONLY one.
    const pane = page.locator(".dw-pane-scroll").first();
    const paneBox = await pane.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { bottom: r.bottom, scrollable: el.scrollHeight > el.clientHeight + 1 };
    });
    expect(paneBox.scrollable, "the transcript does not scroll").toBe(true);

    // The footer: the composer while the round is live, the "practise again"
    // block once it is closed. Selected positionally on purpose — "the last row
    // of the flex column" IS the contract being asserted. Anything pinned with
    // `position: fixed` instead would not be a child here, and on iOS a fixed
    // element plus an on-screen keyboard is the exact combination Safari gets
    // wrong.
    const footer = page.locator(".dw-screen > div > *").last();
    const footerTop = await footer.evaluate((el) => el.getBoundingClientRect().top);
    const footerBottom = await footer.evaluate(
      (el) => el.getBoundingClientRect().bottom,
    );

    expect(footerBottom, "the footer is below the fold").toBeLessThanOrEqual(
      innerHeight + 1,
    );
    expect(
      paneBox.bottom,
      "the transcript runs underneath the footer",
    ).toBeLessThanOrEqual(footerTop + 1);
  });
}

test("the composer input cannot trigger iOS zoom-on-focus", async ({ page }) => {
  await page.goto("/kitchen-sink/chat?state=open");

  const input = page.getByLabel("Your reply");
  const fontSize = await input.evaluate((el) =>
    parseFloat(getComputedStyle(el).fontSize),
  );
  // Anything under 16px zooms the layout viewport on focus in iOS Safari.
  expect(fontSize).toBeGreaterThanOrEqual(16);

  // The send button carries the app's 44px touch floor.
  const send = page.getByRole("button", { name: "Send" });
  const box = await send.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("a previous round is divided and labelled, not hidden", async ({ page }) => {
  await page.goto("/kitchen-sink/chat?state=open&rounds=2");

  // The date is formatted in the profile's zone (Asia/Jakarta in the fixture),
  // not UTC and not the runner's local time.
  await expect(page.getByText("Round 2 · 2 August")).toBeVisible();

  // Round 1's verdict is still on screen. The transcript is the only record the
  // user has of what they produced, and a reset must not bury it.
  await expect(page.getByText("How it went")).toBeVisible();
});
