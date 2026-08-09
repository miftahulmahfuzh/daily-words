/**
 * Executable assertions for the badge art manifest and the files it points at.
 *
 * Run with:  npm run badges:check
 *
 * There is no test runner in this project, so these are plain assertions in a
 * file that exits non-zero — the same shape as `check-nav.ts`, `check-dates.ts`
 * and `check-gamification.ts`. Nothing here touches the database, the network or
 * the environment.
 *
 * This covers the half a type cannot. `BADGE_ART` is a total
 * `Record<BadgeKey, BadgeArt>`, so `npm run typecheck` already refuses a badge
 * key with no art — that is F12 D9 and it is the stronger guarantee. What a type
 * cannot see is the disk: whether the files are actually there, whether they are
 * the right size, whether the bytes they were promoted from are the bytes still
 * sitting in `assets/badges/`, and whether a superseded generation left orphans
 * behind.
 *
 * The hash assertion is the one worth understanding. Each shipped filename
 * carries the first 8 hex of its master's SHA-256, and this script recomputes
 * that SHA-256 from `assets/badges/<key>.png`. That is what turns "the shipped
 * file is the approved master" from a hope into a checked statement — and it is
 * what licenses `next.config.ts` to serve /badges/* as `immutable`.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BADGE_ART, BADGE_ART_SIZE, BADGE_ART_SMALL_SIZE } from '../src/lib/gamification/badge-art'
import { BADGE_CATALOG } from '../src/lib/gamification/badges'

let failures = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ok   ${label}`)
  } else {
    failures++
    console.error(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

const root = join(import.meta.dirname, '..')
const publicDir = join(root, 'public', 'badges')
const masterDir = join(root, 'assets', 'badges')
const keys = BADGE_CATALOG.map((b) => b.key)

/* ------------------------- §1 the manifest is total ------------------------- */

section('§1 the manifest covers the catalog, in the catalog’s order')

// Belt to typecheck's braces, and the one that survives a `Partial<>`
// regression — a change that would make the compiler stop caring.
check('BADGE_ART key order matches BADGE_CATALOG', Object.keys(BADGE_ART), keys)

check(
  'no catalog key missing art',
  keys.filter((k) => !BADGE_ART[k]),
  [],
)

/* --------------------------- §2 one style version --------------------------- */

section('§2 the deck is one style version')

// A mixed set is a failure, not a surprise. The version rides from style.md
// through gen_badge_art.py's sidecar into the manifest precisely so that this
// line can be written.
const versions = [...new Set(keys.map((k) => BADGE_ART[k].styleVersion))].sort()
check('exactly one styleVersion across the deck', versions.length, 1)
check('no entry is "unknown" (its sidecar was lost in promotion)', versions.includes('unknown'), false)

/* ------------------- §3 the shipped bytes are the approved bytes ------------- */

section('§3 the shipped file is the approved master')

for (const key of keys) {
  const art = BADGE_ART[key]
  const master = join(masterDir, `${key}.png`)

  if (!existsSync(master)) {
    failures++
    console.error(`  FAIL ${key}: no master at assets/badges/${key}.png`)
    continue
  }

  const sha = createHash('sha256').update(readFileSync(master)).digest('hex')
  check(`${key}: manifest sha256 equals the master’s`, art.sha256, sha)

  const h8 = sha.slice(0, 8)
  check(`${key}: panel filename carries that hash`, art.src, `/badges/${key}.${h8}.webp`)
  check(`${key}: shelf filename carries that hash`, art.small, `/badges/${key}.${h8}.sm.webp`)
}

/* ------------------------- §4 the files exist, at size ---------------------- */

section('§4 both derivatives exist at exactly the right size')

/**
 * WebP dimensions from the header, with no decode — the plan asked for a header
 * read and a decode would pull the whole deck through Node for four numbers.
 *
 * RIFF....WEBP then a fourcc naming the codec. Three shapes exist and this tool
 * can emit two of them: VP8 (lossy, the default) and VP8L (lossless, D7's
 * fallback if the hairline rule rings). VP8X is handled because a future Pillow
 * could wrap either in an extended container.
 */
function webpSize(path: string): { width: number; height: number } | null {
  const buf = readFileSync(path)
  if (buf.length < 30) return null
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    return null
  }
  const fourcc = buf.toString('ascii', 12, 16)

  if (fourcc === 'VP8X') {
    // 4 bytes flags/reserved, then canvas width-1 and height-1 as 24-bit LE.
    return {
      width: buf.readUIntLE(24, 3) + 1,
      height: buf.readUIntLE(27, 3) + 1,
    }
  }
  if (fourcc === 'VP8 ') {
    // Key-frame start code 0x9D 0x01 0x2A at chunk offset 3, then two 16-bit LE
    // values whose low 14 bits are the dimensions.
    const s = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20)
    if (s < 0) return null
    return {
      width: buf.readUInt16LE(s + 3) & 0x3fff,
      height: buf.readUInt16LE(s + 5) & 0x3fff,
    }
  }
  if (fourcc === 'VP8L') {
    // 0x2F signature, then 14 bits width-1 and 14 bits height-1, packed LE.
    if (buf[20] !== 0x2f) return null
    const bits = buf.readUInt32LE(21)
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    }
  }
  return null
}

for (const key of keys) {
  const art = BADGE_ART[key]
  for (const [label, url, want] of [
    ['panel', art.src, BADGE_ART_SIZE],
    ['shelf', art.small, BADGE_ART_SMALL_SIZE],
  ] as const) {
    const path = join(root, 'public', url.replace(/^\//, ''))
    if (!existsSync(path)) {
      failures++
      console.error(`  FAIL ${key} ${label}: no file at public${url}`)
      continue
    }
    check(`${key} ${label}: ${want}×${want}`, webpSize(path), { width: want, height: want })
  }
}

/* ------------------------------ §5 no orphans ------------------------------- */

section('§5 no orphan files in public/badges')

/**
 * A stale hash left behind by a regeneration. This is the drift that the
 * content-hashed filename scheme makes *harmless* — an old file is never served
 * once the manifest stops naming it — but harmless is not the same as tidy, and
 * an orphan is the visible trace of a `make_badge_assets.py` run that was never
 * committed.
 */
const expected = new Set(keys.flatMap((k) => [BADGE_ART[k].src, BADGE_ART[k].small].map((u) => u.split('/').pop()!)))
const orphans = existsSync(publicDir)
  ? readdirSync(publicDir)
      .filter((n) => n.endsWith('.webp') && !expected.has(n))
      .sort()
  : []

check('unreferenced .webp files under public/badges', orphans, [])

/* --------------------- §6 the key never reached the app --------------------- */

section('§6 OPENAI_API_KEY never reached application code')

/**
 * [S1], asserted rather than trusted. The badge-art key is a different key from
 * `LLM_API_KEY` — the app's model access is GLM via z.ai — and no application
 * code may read it. `src/lib/env.ts` has no entry, `src/lib/llm/client.ts` does
 * not look for it, and the only files in the repository that name the variable
 * are `tools/gen_badge_art.py` and `CLAUDE.md`.
 *
 * The same shape as `check-nav.ts` §6's `from=` scan, and trips on a comment
 * mentioning the variable too. That is deliberate rather than tolerated: the
 * cheap check is the one that gets kept.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else if (/\.(ts|tsx|js|mjs|css)$/.test(entry.name)) out.push(path)
  }
  return out
}

const leaks = walk(join(root, 'src'))
  .filter((p) => readFileSync(p, 'utf8').includes('OPENAI_API_KEY'))
  .map((p) => p.slice(root.length + 1).replaceAll('\\', '/'))
  .sort()

check('files under src/ naming OPENAI_API_KEY', leaks, [])

/* ---------------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`)
  process.exit(1)
}
console.log(`\nAll badge-art assertions passed (${keys.length} badges, style ${versions[0]}).`)
