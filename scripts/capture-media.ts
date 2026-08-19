/**
 * The README's screenshots and GIFs, captured from the running app.
 *
 *   npm run demo:seed          seed the account (once)
 *   npm run dev                the app must be up on 3200
 *   npm run demo:capture       write docs/media/*
 *
 * Takes `--only=<name,name>` to redo one file without re-shooting the set.
 *
 * **Everything here is the real app at the design target**, 375×667 — the
 * iPhone SE 3rd gen the layout budget was measured against, which is also
 * `playwright.config.ts`'s `se3` project. Not the kitchen sink: those fixtures
 * carry deliberately hostile strings (a 35-character term, a 140-character
 * definition) because their job is to prove no string can change a row's
 * height. They are the right thing to measure and the wrong thing to photograph.
 *
 * Stills are `deviceScaleFactor: 2`, so a 375pt screen lands as 750px and stays
 * sharp at the ~300px the README draws it at. Videos are DPR 1 because the
 * recorder's size is CSS pixels either way and a 2× frame only costs bytes.
 *
 * The GIFs record real interaction — a real click on a real button, a real
 * `POST /api/cards`. Playwright draws no pointer, so `tap()` below moves a
 * visible ring to the target first: without it every GIF looks like the screen
 * changing by itself, which is exactly what this app's one product principle
 * says it must not do.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, devices, type BrowserContext, type Page } from '@playwright/test'
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { dailyCards, journalEntries, shares, users, vocabEntries } from '../src/lib/db/schema'

const BASE = 'http://localhost:3200'
const OUT = join(process.cwd(), 'docs/media')
const TMP = join(process.cwd(), '.media-tmp')
const SESSION_TOKEN = 'dw-demo-session-0000000000000000'
const EMAIL = 'barnaby@demo.invalid'

/** The design target. `playwright.config.ts` explains why not `devices['iPhone SE']`. */
const VIEWPORT = { width: 375, height: 667 }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { viewport: _drop, ...PHONE } = devices['iPhone SE']

const only = process.argv
  .find((a) => a.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const want = (name: string) => !only || only.includes(name)

/**
 * A pointer, because Playwright's is invisible.
 *
 * Added as an init script so it survives client-side navigation, and drawn on
 * `<html>` rather than in the app's DOM so no layout assertion could ever see
 * it. `pointer-events: none` is what keeps it from eating the click it exists to
 * illustrate.
 */
const CURSOR = `
(() => {
  const draw = () => {
    if (document.getElementById('__dw_cursor')) return;
    const el = document.createElement('div');
    el.id = '__dw_cursor';
    el.style.cssText = [
      'position:fixed','left:0','top:0','width:26px','height:26px',
      'margin:-13px 0 0 -13px','border-radius:999px','z-index:2147483647',
      'pointer-events:none','opacity:0','transition:opacity .15s, transform .12s',
      'background:rgba(120,120,120,.22)',
      'box-shadow:0 0 0 1.5px rgba(90,90,90,.55) inset, 0 1px 6px rgba(0,0,0,.25)',
    ].join(';');
    document.documentElement.appendChild(el);
    let shown = false;
    addEventListener('mousemove', (e) => {
      el.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
      if (!shown) { shown = true; el.style.opacity = '1'; }
    }, true);
    addEventListener('mousedown', () => {
      el.style.transform += ' scale(.62)';
      el.style.background = 'rgba(120,120,120,.42)';
    }, true);
    addEventListener('mouseup', () => {
      el.style.transform = el.style.transform.replace(' scale(.62)', '');
      el.style.background = 'rgba(120,120,120,.22)';
    }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', draw);
  else draw();
})();
`

/**
 * Next's dev overlay, hidden.
 *
 * `nextjs-portal` is a custom element the dev server injects; it draws a badge
 * over the bottom-left of every screen, which is exactly where the tab bar's
 * first destination is. `devIndicators: false` in `next.config.ts` would also do
 * it and is the wrong place — that file carries production behaviour, and this
 * is a property of one capture run.
 */
const HIDE_DEV = `
(() => {
  const add = () => {
    const s = document.createElement('style');
    s.textContent = 'nextjs-portal{display:none!important}';
    document.head.appendChild(s);
  };
  if (document.head) add();
  else addEventListener('DOMContentLoaded', add);
})();
`

/** Kills entrance fades so a still is never caught half-drawn. Stills only. */
const FREEZE = `
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-delay: 0s !important;
    transition-duration: .001ms !important;
  }
`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function settle(page: Page, ms = 450) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await sleep(ms)
}

/**
 * A visible tap: glide the ring in, press, release. `page.click()` teleports the
 * pointer, which reads as a jump cut in a 12fps GIF.
 */
async function tap(page: Page, selector: string, opts: { steps?: number } = {}) {
  const el = page.locator(selector).first()
  await el.waitFor({ state: 'visible' })
  await el.scrollIntoViewIfNeeded()
  await sleep(120)
  const box = await el.boundingBox()
  if (!box) throw new Error(`no box for ${selector}`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: opts.steps ?? 22,
  })
  await sleep(160)
  await page.mouse.down()
  await sleep(110)
  await page.mouse.up()
}

async function newContext(opts: {
  dark?: boolean
  video?: boolean
  cookie?: boolean
}): Promise<BrowserContext> {
  const context = await browser.newContext({
    ...PHONE,
    viewport: VIEWPORT,
    deviceScaleFactor: opts.video ? 1 : 2,
    colorScheme: opts.dark ? 'dark' : 'light',
    reducedMotion: 'no-preference',
    ...(opts.video ? { recordVideo: { dir: TMP, size: VIEWPORT } } : {}),
  })
  if (opts.cookie !== false) {
    await context.addCookies([
      {
        name: 'authjs.session-token',
        value: SESSION_TOKEN,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ])
  }
  await context.addInitScript(HIDE_DEV)
  // The pointer is for the GIFs only. On a still there is no mouse to follow, so
  // it would be a ring parked at the origin in the corner of every screenshot.
  if (opts.video) await context.addInitScript(CURSOR)
  return context
}

/** One still, from a fresh context so no earlier click can have moved the page. */
async function still(
  name: string,
  path: string,
  opts: { dark?: boolean; cookie?: boolean; prepare?: (page: Page) => Promise<void> } = {},
) {
  if (!want(name)) return
  const context = await newContext({ dark: opts.dark, cookie: opts.cookie })
  const page = await context.newPage()
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.addStyleTag({ content: FREEZE })
  await settle(page)
  if (opts.prepare) {
    await opts.prepare(page)
    await settle(page, 250)
  }
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  console.log(`  ${name}.png`)
  await context.close()
}

/**
 * One GIF. `body` is the interaction; everything before `mark()` is trimmed off
 * the front, because a video starts when the context does and the first second
 * of every one of these is a blank page loading.
 */
async function gif(
  name: string,
  path: string,
  body: (page: Page, mark: () => void) => Promise<void>,
  opts: { fps?: number; width?: number; colors?: number } = {},
) {
  if (!want(name)) return
  const context = await newContext({ video: true })
  const page = await context.newPage()
  const t0 = Date.now()
  let offset = 0
  const mark = () => {
    offset = (Date.now() - t0) / 1000
  }
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await settle(page, 700)
  await body(page, mark)
  await sleep(900) // a beat on the last frame, so the loop does not snap
  const video = page.video()
  await context.close()
  const src = await video!.path()

  const fps = opts.fps ?? 12
  const width = opts.width ?? VIEWPORT.width
  const colors = opts.colors ?? 128
  const dest = join(OUT, `${name}.gif`)
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      ...(offset > 0.2 ? ['-ss', String(Math.max(0, offset - 0.25))] : []),
      '-i',
      src,
      '-vf',
      `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`,
      '-loop',
      '0',
      dest,
    ],
    { stdio: 'inherit' },
  )
  rmSync(src, { force: true })
  console.log(`  ${name}.gif`)
}

let browser: Awaited<ReturnType<typeof chromium.launch>>

async function fixtures() {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, EMAIL))
    .limit(1)
  if (!user) throw new Error(`no demo account — run \`npm run demo:seed\` first`)

  const byTerm = async (term: string) => {
    const [row] = await db
      .select({ id: vocabEntries.id })
      .from(vocabEntries)
      .where(and(eq(vocabEntries.userId, user.id), eq(vocabEntries.term, term)))
      .limit(1)
    if (!row) throw new Error(`demo account has no "${term}"`)
    return row.id
  }

  const slug = async (kind: 'vocab' | 'card' | 'journal') => {
    const [row] = await db
      .select({ slug: shares.slug })
      .from(shares)
      .where(and(eq(shares.userId, user.id), eq(shares.entityType, kind)))
      .limit(1)
    if (!row) throw new Error(`demo account has no ${kind} share`)
    return row.slug
  }

  const [lastCard] = await db
    .select({ cardDate: dailyCards.cardDate })
    .from(dailyCards)
    .where(eq(dailyCards.userId, user.id))
    .orderBy(desc(dailyCards.cardDate))
    .limit(1)

  const [insight] = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, user.id), eq(journalEntries.insightStatus, 'ready')))
    .orderBy(asc(journalEntries.createdAt))
    .limit(1)

  return {
    petrichor: await byTerm('petrichor'),
    genteel: await byTerm('genteel'),
    smear: await byTerm('smear'),
    wordSlug: await slug('vocab'),
    cardSlug: await slug('card'),
    journalSlug: await slug('journal'),
    lastCardDate: lastCard.cardDate,
    insightId: insight.id,
  }
}

async function main() {
  const f = await fixtures()
  mkdirSync(OUT, { recursive: true })
  mkdirSync(TMP, { recursive: true })
  browser = await chromium.launch()

  /* ------------------------------- the GIFs -------------------------------- */
  /* First, because the middle one makes today's card and every still after it
     wants that card to exist. The order here is load-bearing. */

  await gif('today', '/today', async (page, mark) => {
    mark()
    await sleep(900)
    await tap(page, '[data-testid="no-card-yet"] button')
    // The POST, the six rows, and F9's reveal toast if a badge landed.
    await page.locator('[data-testid="daily-card"]').waitFor()
    await sleep(2600)
  })

  await gif('search', '/vocab', async (page, mark) => {
    const field = page.locator('input[type="search"]').first()
    await field.waitFor()
    mark()
    await sleep(600)
    await tap(page, 'input[type="search"]')
    for (const ch of 'shadow') {
      await page.keyboard.type(ch)
      await sleep(150)
    }
    await sleep(1500)
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Backspace')
      await sleep(90)
    }
    for (const ch of 'polite') {
      await page.keyboard.type(ch)
      await sleep(150)
    }
    await sleep(1600)
  })

  await gif('profile', '/profile', async (page, mark) => {
    mark()
    await sleep(700)
    await tap(page, 'button[aria-label*="streak level"]')
    await sleep(2200)
    await page.keyboard.press('Escape')
    await sleep(700)
    await page.mouse.wheel(0, 620)
    await sleep(900)
    await tap(page, 'button[aria-label^="National Speaker"]')
    await sleep(2400)
    await page.keyboard.press('Escape')
    await sleep(500)
  })

  /* ------------------------------ the stills ------------------------------- */

  await still('01-today', '/today')
  await still('02-calendar', '/calendar')
  await still('03-vocab', '/vocab')
  await still('04-word', `/vocab/${f.petrichor}`)
  await still('05-chat', `/vocab/${f.genteel}/chat`)
  await still('06-journal', `/journal/${f.insightId}`)
  await still('07-profile', '/profile')
  await still('08-discover', '/vocab?tab=discover')
  await still('09-share', `/s/${f.wordSlug}`, { cookie: false })
  await still('10-card', `/card/${f.lastCardDate}`)
  await still('11-today-dark', '/today', { dark: true })
  await still('12-share-card', `/s/${f.cardSlug}`, { cookie: false })
  await still('13-lookup', `/vocab/${f.smear}`)

  await browser.close()
  // Playwright writes the video only on context close; anything left is a stray.
  for (const leftover of readdirSync(TMP)) rmSync(join(TMP, leftover), { force: true })
  rmSync(TMP, { recursive: true, force: true })
  console.log(`\n  ${OUT}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
