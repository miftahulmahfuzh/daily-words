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
import { inflateSync } from 'node:zlib'
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

/**
 * Python's rounding, which is round-half-to-even and not JavaScript's
 * round-half-up. It matters for one input in about two hundred thousand — the
 * channel means below are sums of ~198k bytes over the same count — and a
 * one-level disagreement there would be a red run with no defect behind it,
 * which is the worst kind of check. Three lines is cheaper than that debugging
 * session.
 */
function roundHalfEven(value: number): number {
  const floor = Math.floor(value)
  const rest = value - floor
  if (rest > 0.5) return floor + 1
  if (rest < 0.5) return floor
  return floor % 2 === 0 ? floor : floor + 1
}

/**
 * A truecolour 8-bit PNG, decoded to raw RGB with nothing but `node:zlib`.
 *
 * `sharp` is not in this project and this script must stay offline and
 * dependency-free like its neighbours, so the deck's own narrow shape is the
 * decoder's scope: every master is 1024², bit depth 8, colour type 2, not
 * interlaced (asserted below rather than assumed — the style contract's FULL
 * BLEED rule is what makes an alpha channel impossible, and if one ever appears
 * this should stop rather than average it in).
 */
function decodePng(png: Buffer): { width: number; height: number; rgb: Buffer } {
  const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')

  let width = 0
  let height = 0
  const idat: Buffer[] = []

  for (let at = 8; at + 8 <= png.length; ) {
    const length = png.readUInt32BE(at)
    const type = png.toString('ascii', at + 4, at + 8)
    const data = png.subarray(at + 8, at + 8 + length)
    at += 12 + length // length + type + data + crc

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const [depth, colourType, , , interlace] = [data[8], data[9], data[10], data[11], data[12]]
      if (depth !== 8 || colourType !== 2 || interlace !== 0) {
        throw new Error(
          `unsupported PNG: depth ${depth}, colour type ${colourType}, interlace ${interlace} ` +
            `(this decoder handles the deck's own shape only: 8-bit truecolour, no alpha, not interlaced)`,
        )
      }
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  const raw = inflateSync(Buffer.concat(idat))
  const bpp = 3
  const stride = width * bpp
  const rgb = Buffer.alloc(height * stride)

  // Un-filter. Every filter but None references the pixel to the left and/or the
  // row above, which is why a decode cannot start at the frame and skip the
  // middle: row N is only meaningful once row N-1 has been reconstructed.
  for (let y = 0, at = 0; y < height; y++) {
    const filter = raw[at++]
    const line = raw.subarray(at, at + stride)
    at += stride
    const cur = rgb.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? rgb.subarray((y - 1) * stride, y * stride) : null

    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0
      const b = prev ? prev[i] : 0
      const c = prev && i >= bpp ? prev[i - bpp] : 0
      let value = line[i]
      if (filter === 1) value += a
      else if (filter === 2) value += b
      else if (filter === 3) value += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) {
        throw new Error(`unknown PNG filter ${filter} on row ${y}`)
      }
      cur[i] = value & 0xff
    }
  }

  return { width, height, rgb }
}

/**
 * Mean RGB of the master's outer 5% frame, as `#rrggbb`.
 *
 * A deliberate second implementation of `tools/make_badge_assets.py`'s
 * `plate_hex` — not a shared module, because there is no shared language here.
 * The point of the assertion is that two independent readings of the same file
 * agree; importing the producer's arithmetic into the checker would assert
 * nothing at all.
 *
 * It takes the bytes rather than a path so that it reads exactly the buffer the
 * SHA-256 above was taken over: one read, and both assertions provably describe
 * the same bytes.
 */
function plateHex(png: Buffer): string {
  const { width, height, rgb } = decodePng(png)
  const band = Math.max(1, roundHalfEven(Math.min(width, height) * 0.05))
  let r = 0
  let g = 0
  let b = 0
  let n = 0

  for (let y = 0; y < height; y++) {
    const edgeRow = y < band || y >= height - band
    for (let x = 0; x < width; x++) {
      if (!(edgeRow || x < band || x >= width - band)) {
        x = width - band - 1 // skip the interior; the loop's ++ lands on the right strip
        continue
      }
      const i = (y * width + x) * 3
      r += rgb[i]
      g += rgb[i + 1]
      b += rgb[i + 2]
      n++
    }
  }

  const hex = (total: number) => roundHalfEven(total / n).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

for (const key of keys) {
  const art = BADGE_ART[key]
  const master = join(masterDir, `${key}.png`)

  if (!existsSync(master)) {
    failures++
    console.error(`  FAIL ${key}: no master at assets/badges/${key}.png`)
    continue
  }

  const bytes = readFileSync(master)
  const sha = createHash('sha256').update(bytes).digest('hex')
  check(`${key}: manifest sha256 equals the master’s`, art.sha256, sha)

  // The same recomputation the hash assertion makes, for the same reason. The
  // plate is a property of the master's bytes, so a hand-edit to the generated
  // manifest — or a regenerated badge whose paper shifted and whose manifest was
  // not rebuilt — is a red run rather than a seam somebody eventually notices
  // beside the art in F21's hero.
  check(`${key}: manifest plate equals the master’s`, art.plate, plateHex(bytes))

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
