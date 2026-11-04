// node ui.mjs <base-url> <steps.mjs> <evidence-dir> <cookie|-> [width] [height] [theme] [tz] [tag]
// Steps module: `export default async ({ page, context, base, shot, log, allow, args }) => { ... }`.
//   args       the words after `--` on the verify.sh ui command line
//   allow(re)  a console error matching `re` is expected (a 404 the steps visit on purpose)
//   shot(name) viewport screenshot into evidence (every screen is one phone viewport; none scroll)
//   log(text)  line into the run's ui transcript
// Signed in with the session cookie verify.sh passes (`-` = signed out). Records a video of the
// whole drive and a final screenshot, pass or fail. Fails on a page error, a console error, an
// unexpected landing on /signin, or horizontal scroll.
//
// The browser's network is fenced like the server's: loopback passes, every other host is aborted
// and logged (Google sign-in included). No permission is granted, so Notification.permission stays
// "default", no PushManager subscription is ever made, and the browser never contacts a push
// service. Run from the run's snapshot (resolves @playwright/test from its node_modules).
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { appendFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'

const [
  base,
  stepsPath,
  evidence,
  cookie,
  width = '375',
  height = '667',
  theme = 'light',
  tz = 'Asia/Jakarta',
  tagArg,
] = process.argv.slice(2)
if (!base || !stepsPath || !evidence || !cookie) {
  console.error(
    'usage: node ui.mjs <base> <steps.mjs> <evidence> <cookie|-> [width] [height] [theme] [tz] [tag]',
  )
  process.exit(2)
}

const require = createRequire(path.join(process.cwd(), 'package.json'))
const { chromium } = require('@playwright/test')

const n = readdirSync(evidence).filter(
  (f) => /^\d\d-.*\.txt$/.test(f) && !f.startsWith('00-'),
).length
const tag = tagArg || `${String(n + 1).padStart(2, '0')}-ui-${path.basename(stepsPath, '.mjs')}`
const transcript = path.join(evidence, `${tag}.txt`)
const log = (text) => {
  appendFileSync(transcript, `${text}\n`)
  console.log(text)
}

const signedOut = cookie === '-'
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const size = { width: Number(width), height: Number(height) }
const context = await browser.newContext({
  viewport: size,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  colorScheme: theme === 'dark' ? 'dark' : 'light',
  // The demo profile's zone. TimezoneSync re-detects a 'detected' zone from the browser, so a
  // browser in another zone would silently move the user's day boundary mid-journey.
  timezoneId: tz,
  locale: 'en-GB',
  recordVideo: { dir: path.join(evidence, '.video'), size },
  permissions: [],
})
if (!signedOut) {
  await context.addCookies([
    {
      name: 'authjs.session-token',
      value: cookie,
      domain: new URL(base).hostname,
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ])
}

const blocked = new Set()
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url())
  if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
  if (!blocked.has(url.host)) {
    blocked.add(url.host)
    log(`egress BLOCKED (browser) ${route.request().method()} ${url.origin}`)
  }
  return route.abort('blockedbyclient')
})

// Next's dev-tools badge exists only under `next dev` and sits over the bottom-left of the screen,
// where the tab bar is, swallowing taps. Hide it; the app is untouched.
await context.addInitScript(() => {
  const hide = () => {
    const st = document.createElement('style')
    st.textContent = 'nextjs-portal { display: none !important; }'
    document.head.appendChild(st)
  }
  if (document.head) hide()
  else document.addEventListener('DOMContentLoaded', hide)
})
const page = await context.newPage()
page.setDefaultTimeout(30_000)
const problems = []
const allowed = []
const allow = (re) => allowed.push(re)
page.on('console', (m) => {
  if (m.type() !== 'error') return
  if (/ERR_BLOCKED_BY_CLIENT/.test(m.text())) return // logged above as egress
  if (allowed.some((re) => re.test(m.text()))) return log(`console.error (expected): ${m.text()}`)
  problems.push(m.text())
  log(`console.error: ${m.text()}`)
})
page.on('pageerror', (e) => {
  problems.push(e.message)
  log(`pageerror: ${e.message}`)
})
let shots = 0
const shot = async (name) => {
  const file = path.join(evidence, `${tag}-${++shots}-${name}.png`)
  // caret: 'initial' -- the default hides the caret by injecting a style, which races hydration
  // and is reported as a hydration mismatch the app does not have.
  await page.screenshot({ path: file, caret: 'initial' })
  log(`screenshot: ${file}`)
}

let failed = null
try {
  log(`steps: ${stepsPath}  (${width}x${height}, ${theme}, ${tz}, ${signedOut ? 'signed out' : 'signed in'})`)
  const { default: steps } = await import(pathToFileURL(stepsPath).href)
  await steps({ page, context, base, shot, log, allow, args: JSON.parse(process.env.DW_VERIFY_ARGS ?? '[]') })
  const here = new URL(page.url())
  if (!signedOut && here.pathname === '/signin')
    throw new Error('ended on /signin: the session was rejected')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  if (overflow > 0)
    throw new Error(`horizontal scroll: ${overflow}px wider than the ${width}px viewport`)
  if (problems.length) throw new Error(`${problems.length} console/page error(s)`)
  log('result: PASS')
} catch (err) {
  failed = err
  log(`result: FAIL ${err?.stack ?? err}`)
} finally {
  await shot(failed ? 'failure' : 'final').catch(() => {})
  const video = page.video()
  await context.close()
  await browser.close()
  if (video) {
    const file = path.join(evidence, `${tag}.webm`)
    renameSync(await video.path(), file)
    rmSync(path.join(evidence, '.video'), { recursive: true, force: true })
    log(`video: ${file}`)
  }
  console.error(`[evidence: ${transcript}]`)
}
process.exit(failed ? 1 : 0)
