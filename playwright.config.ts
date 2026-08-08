import { defineConfig, devices } from "@playwright/test";

/**
 * One job: prove the daily card never scrolls.
 *
 * Two viewports, and they are asked different questions.
 *
 * `se3` — 375×667, the iPhone SE 3rd gen. This is the roadmap's stated test
 * width and F2's binding case; every other device in the ledger has more slack,
 * so a layout that holds here holds everywhere. Both the no-scroll guarantee and
 * [R19]'s 52px row floor are enforced here.
 *
 * `se1` — 320×568, the 2016 first-generation SE. Below the design target and
 * deliberately so: it is the smallest screen iOS Safari still runs on, and what
 * is being checked is that the layout *degrades* rather than breaks. Rows
 * compress past the floor (49px, measured) and the page still does not scroll,
 * which is exactly what [R19]'s flex structure promises. The floor is not
 * asserted here.
 *
 * Do NOT use Playwright's `devices['iPhone SE']` for the primary project — it is
 * the 2016 model at 320×568, and reaching for the familiar name silently tests a
 * screen two sizes below the one the budget was designed against.
 *
 * The fixture route is dev-only and unauthenticated; see
 * src/app/kitchen-sink/today/page.tsx.
 *
 * WebKit is the engine that actually matters, since the product targets iOS
 * Safari and `dvh` behaviour is engine-specific. It is behind PW_WEBKIT=1
 * because this machine cannot install its system libraries without root:
 *
 *     sudo npx playwright install-deps webkit && npx playwright install webkit
 *     PW_WEBKIT=1 npm run test:layout
 *
 * Chromium's iPhone SE emulation still catches everything deterministic — row
 * heights, content versus client height, where the tab bar's bottom edge lands.
 */
const withWebkit = process.env.PW_WEBKIT === "1";

/**
 * Phone emulation minus the viewport, which each project sets itself. Borrowed
 * from a named device so touch, DPR and the mobile user agent stay realistic.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { viewport, ...PHONE } = devices["iPhone SE"];

/** Projects whose viewport is at or above the design target. */
export const DESIGN_TARGET_PROJECTS = ["se3", "se3-webkit"];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3200",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "se3",
      use: { ...PHONE, viewport: { width: 375, height: 667 }, browserName: "chromium" },
    },
    {
      name: "se1",
      use: { ...PHONE, viewport: { width: 320, height: 568 }, browserName: "chromium" },
    },
    ...(withWebkit
      ? [
          {
            name: "se3-webkit",
            use: {
              ...PHONE,
              viewport: { width: 375, height: 667 },
              browserName: "webkit" as const,
            },
          },
        ]
      : []),
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3200/kitchen-sink/today",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
