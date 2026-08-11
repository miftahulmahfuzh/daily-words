import { expect, test, type Page } from "@playwright/test";
import { DESIGN_TARGET_PROJECTS } from "../../playwright.config";

/**
 * F15's duplicate warning, as gestures rather than as code paths.
 *
 * Everything about this feature that is a *function* is asserted offline by
 * `npm run journal:check` — the normaliser, the threshold, the verdict table,
 * the excerpt — and everything that is a *query* by `npm run journal:db`. What
 * is left is the handful of things that only exist as a sequence of taps across
 * an async round trip, and one of them was wrong until this spec was written:
 * **"Keep it anyway" used to wipe a line the user had started typing while the
 * warning was on screen.** No offline assertion could have caught that, because
 * nothing was wrong with any single function.
 *
 * `DW_TEST_SESSION` is your own `authjs.session-token`, copied out of devtools
 * after signing in locally — the same convention as `onboarding.spec.ts`.
 * Without it this **skips** rather than fails, so it is inert in CI and on a
 * fresh clone.
 *
 *     DW_TEST_SESSION=… npm run test:layout
 *
 * It writes into the real journal of whoever owns that session and deletes
 * everything it wrote in an `afterEach`, including on failure. It never touches
 * a row it did not create.
 *
 * **The session's profile must have been asked its birthday**, or the `(app)`
 * layout redirects every route in this spec to `/birthday` and each test fails on
 * a missing composer — the misleading-timeout failure CLAUDE.md warns about.
 * `openJournal` below turns that into one legible message. Answer the question
 * once in the app, or stamp the column with
 *
 *     tsx --conditions=react-server --env-file=.env.local \
 *       scripts/profile-peek.ts birthday skip
 */

const TOKEN = process.env.DW_TEST_SESSION;

test.skip(!TOKEN, "needs DW_TEST_SESSION — see the note at the top of this file");

/**
 * **Serial, and one viewport only.** This is the one spec in the suite that
 * *writes*, and every test in it counts rows in a single shared journal — so
 * `fullyParallel` running three tests at once, across two viewport projects,
 * would have them deleting each other's fixtures and miscounting. Nothing here
 * depends on the viewport; the layout questions belong in `no-scroll.spec.ts`.
 */
test.describe.configure({ mode: "serial" });
test.skip(
  () => !DESIGN_TARGET_PROJECTS.includes(test.info().project.name),
  "behaviour, not layout — runs once, at the design target",
);

/** Unique per run, so a crashed run leaves rows that are obviously not real. */
const STAMP = `f15-spec-${Date.now()}`;
const LINE = `${STAMP} — a fall in a pit, a gain in one’s wit.`;
/** Folds onto LINE under `normalizeForCompare`: quote glyph, case, spacing. */
const REPASTE = `  ${STAMP} — A Fall In A Pit, A Gain In One's Wit  `;
const TYPED_MEANWHILE = `${STAMP} — something typed while it was thinking.`;

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "authjs.session-token", value: TOKEN!, url: baseURL! }]);
});

/**
 * Delete every row this spec created, by id, through the real route.
 *
 * Paged rather than assumed: the entries land at the top of the list, but the
 * user's own journal is underneath and must not be touched.
 */
test.afterEach(async ({ page }) => {
  await page.evaluate(async (stamp: string) => {
    const res = await fetch("/api/journal?limit=50");
    if (!res.ok) return;
    const { entries } = (await res.json()) as { entries: { id: string; text: string }[] };
    for (const entry of entries) {
      if (entry.text.includes(stamp)) {
        await fetch(`/api/journal/${entry.id}`, { method: "DELETE" });
      }
    }
  }, STAMP);
});

/**
 * `/journal`, or a sentence saying why not.
 *
 * The birthday gate lives in the `(app)` layout, so it applies to every route
 * this spec drives and it fires exactly once per profile. Checked here rather
 * than hoped for: the symptom without this is three tests timing out on
 * `getByLabel`, which reads as a broken composer.
 */
async function openJournal(page: Page) {
  await page.goto("/journal");
  expect(
    new URL(page.url()).pathname,
    "the session's profile has never been asked its birthday — see the note at the top of this file",
  ).toBe("/journal");
}

const composer = (page: Page) => page.getByLabel("A line worth keeping");
const sourceNote = (page: Page) => page.getByLabel("Where from");
const saveButton = (page: Page) => page.getByRole("button", { name: "Save" });
const warning = (page: Page) => page.getByText("You kept this already");
/** The warning carries its own `/journal/<id>` link; it is not a list row. */
const listRows = (page: Page) => page.locator('a[href^="/journal/"]:not([role="status"] a)');

async function saveAndSettle(page: Page) {
  await saveButton(page).click();
  // The route may embed, so allow the full budget plus the round trip.
  await page.waitForTimeout(3500);
}

test("a re-paste is warned about, and Never mind gives the line back", async ({ page }) => {
  await openJournal(page);
  await composer(page).fill(LINE);
  await saveAndSettle(page);
  const rowsAfterFirst = await listRows(page).count();

  await composer(page).fill(REPASTE);
  await saveAndSettle(page);

  await expect(warning(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep it anyway" })).toBeVisible();
  // A block under the composer, never the app's one modal.
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  // The optimistic row is withdrawn, and only it: the matched entry is already
  // in the list and must not be drawn a second time.
  expect(await listRows(page).count()).toBe(rowsAfterFirst);

  await page.getByRole("button", { name: "Never mind" }).click();
  await expect(warning(page)).toBeHidden();
  expect((await composer(page).inputValue()).trim()).toBe(REPASTE.trim());
  expect(await listRows(page).count()).toBe(rowsAfterFirst);
});

test("the draft survives the tab being discarded, before and after a warning", async ({ page }) => {
  await openJournal(page);
  await composer(page).fill(LINE);
  await saveAndSettle(page);

  await composer(page).fill(REPASTE);
  await sourceNote(page).fill("Chinese proverb");
  // The composer debounces its write to sessionStorage by 300 ms.
  await page.waitForTimeout(600);

  // sessionStorage, not localStorage: "a draft is the state of one visit to one
  // tab", and iOS Safari discarding a backgrounded tab is a reload.
  expect(await page.evaluate(() => localStorage.getItem("journal:draft"))).toBeNull();
  await page.reload();
  expect((await composer(page).inputValue()).trim()).toBe(REPASTE.trim());
  expect(await sourceNote(page).inputValue()).toBe("Chinese proverb");

  await saveAndSettle(page);
  await expect(warning(page)).toBeVisible();
  await page.getByRole("button", { name: "Never mind" }).click();
  await page.waitForTimeout(600);

  // The restore must also re-arm the draft, or the *next* discard loses it
  // silently — the failure that leaves no trace at all.
  await page.reload();
  expect((await composer(page).inputValue()).trim()).toBe(REPASTE.trim());
});

test("Keep it anyway saves the line that collided, not what is on screen", async ({ page }) => {
  await openJournal(page);
  await composer(page).fill(LINE);
  await saveAndSettle(page);
  const rowsAfterFirst = await listRows(page).count();

  // Hold the response open, or the race this is about never happens.
  await page.route("**/api/journal", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((r) => setTimeout(r, 2500));
    return route.continue();
  });

  await composer(page).fill(REPASTE);
  await saveButton(page).click();
  await page.waitForTimeout(400);
  // The tap is acknowledged in the same frame; nothing on screen waits.
  expect(await composer(page).inputValue()).toBe("");

  // The user starts their next paste while the first is still in the air.
  await composer(page).fill(TYPED_MEANWHILE);
  await page.waitForTimeout(3500);

  await expect(warning(page)).toBeVisible();
  // The `current === ""` guard, and the whole of what it buys.
  expect(await composer(page).inputValue()).toBe(TYPED_MEANWHILE);

  await page.getByRole("button", { name: "Keep it anyway" }).click();
  await page.waitForTimeout(4000);

  const texts = (await listRows(page).allInnerTexts()).join(" | ");
  expect(texts).toContain("gain in one");
  // The regression this spec exists for: the half-typed line must neither be
  // saved instead of the collided one, nor destroyed by the save.
  expect(texts).not.toContain("something typed while");
  expect(await composer(page).inputValue()).toBe(TYPED_MEANWHILE);
  expect(await listRows(page).count()).toBe(rowsAfterFirst + 1);
});
