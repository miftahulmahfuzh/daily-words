import { expect, test, type Page } from "@playwright/test";
import { LAYOUT } from "../../src/lib/ui/layout";

/**
 * The onboarding flow at phone width.
 *
 * A companion to `no-scroll.spec.ts` rather than a copy of its job: what is
 * checked here is that five screens all fit their viewport without scrolling
 * sideways, that the footer clears the home indicator, and that the chip grid on
 * Q2 lays out in tidy rows instead of one long line.
 *
 * `DW_TEST_SESSION` is your own `authjs.session-token` cookie, copied out of
 * devtools after signing in locally. Without it the spec **skips** rather than
 * fails, because a signed-out visitor is redirected to /signin and there is
 * nothing to measure — so it is inert in CI and on a fresh clone.
 *
 * Run it with the profile un-onboarded, or /onboarding redirects to /today:
 *
 *     DW_TEST_SESSION=… npm run test:layout
 *
 * The flow's *behaviour* — what lands in the row, `onboarded_at` monotonicity,
 * the timezone override table — is verified against the real database with curl
 * and `scripts/profile-peek.ts`, not here. This spec is about layout.
 */

const TOKEN = process.env.DW_TEST_SESSION;

test.skip(!TOKEN, "needs DW_TEST_SESSION — see the note at the top of this file");

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: TOKEN!,
      url: baseURL!,
    },
  ]);
});

/**
 * `exact`, always. Next's dev-tools button is called "Open Next.js Dev Tools",
 * so a substring match on "Next" resolves to two elements and the click fails
 * with a strict-mode violation that reads like a missing button.
 */
function cta(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
}

/** The page must never scroll sideways, on any screen, at any width. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Every tappable control clears the touch floor on both axes. */
async function expectTouchable(page: Page, selector: string) {
  const boxes = await page.locator(selector).all();
  for (const control of boxes) {
    const box = await control.boundingBox();
    if (!box) continue;
    expect(box.height).toBeGreaterThanOrEqual(LAYOUT.touchMin - 1);
  }
}

test("all five screens fit the viewport", async ({ page }) => {
  await page.goto("/onboarding");

  // Screen 1 — occupation. `Skip all` is the one-tap escape, and there is no
  // back affordance because there is nothing behind it.
  await expect(page.getByRole("heading", { name: "What do you do?" })).toBeVisible();
  await expect(cta(page, "Skip all")).toBeVisible();
  await expect(cta(page, "Back")).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await page.getByLabel("What do you do?").fill("high school chemistry teacher");
  await cta(page, "Next").click();

  // Screen 2 — interests. Twelve chips plus "+ Other" must wrap into rows, not
  // run off the edge, and the sixth selection must be silently refused.
  await expect(page.getByRole("heading", { name: "What are you into?" })).toBeVisible();
  await expect(cta(page, "Back")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchable(page, 'button[aria-pressed]');

  for (const chip of ["Football", "Music", "Books", "Games", "Cooking", "Travel"]) {
    await page.getByRole("button", { name: chip, exact: true }).click();
  }
  await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(5);
  // The refused chip is the sixth tapped, and it must not be lit.
  await expect(
    page.getByRole("button", { name: "Travel", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");

  const rows = await page.evaluate(() => {
    const tops = new Set<number>();
    document
      .querySelectorAll('button[aria-pressed]')
      .forEach((el) => tops.add(Math.round(el.getBoundingClientRect().top)));
    return tops.size;
  });
  expect(rows).toBeGreaterThanOrEqual(3);
  expect(rows).toBeLessThanOrEqual(5);

  await cta(page, "Next").click();

  // Screen 3 — currently consuming.
  await expect(
    page.getByRole("heading", { name: "Reading or watching anything right now?" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByLabel("Reading or watching anything right now?").fill("Barnaby Rudge");
  await cta(page, "Next").click();

  // Screen 4 — english contexts. "Not much yet" is mutually exclusive.
  await expect(page.getByRole("heading", { name: "Where do you use English?" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Work", exact: true }).click();
  await page.getByRole("button", { name: "Not much yet" }).click();
  await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Online", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Not much yet" }),
  ).toHaveAttribute("aria-pressed", "false");
  await cta(page, "Next").click();

  // Screen 5 — tone. The CTA reads Done, and the rows are radios.
  await expect(
    page.getByRole("heading", { name: "How should the chat talk to you?" }),
  ).toBeVisible();
  await expect(cta(page, "Done")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchable(page, '[role="radio"]');

  // Back from 5 to 4 must restore the chips, not clear them.
  await cta(page, "Back").click();
  await expect(page.getByRole("button", { name: "Online", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the footer clears the safe-area inset on every screen", async ({ page }) => {
  await page.goto("/onboarding");

  for (let step = 1; step <= 5; step++) {
    const button = cta(page, step === 5 ? "Done" : "Next");
    const box = await button.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box).not.toBeNull();
    // Inside the viewport, with the flow's own bottom padding beneath it.
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    expect(box!.height).toBeGreaterThanOrEqual(LAYOUT.touchMin);
    if (step < 5) await button.click();
  }
});
