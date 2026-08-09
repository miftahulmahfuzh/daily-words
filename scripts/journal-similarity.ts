/**
 * F15 §6.4 — the calibration corpus. **The numbers are the deliverable.**
 *
 * Run with:
 *   npm run journal:similarity                          # the whole corpus
 *   npm run journal:similarity -- --group=C             # one group
 *   npm run journal:similarity -- "line one" "line two" # an ad-hoc pair
 *
 * A threshold decides whether a user is interrupted, and it cannot be chosen
 * from an armchair. This embeds a fixed corpus of pairs, prints the cosine
 * distance for each, and prints the window a safe threshold could sit in.
 *
 * **It writes nothing** — no database, no `NEAR_DUPLICATE_MAX_DISTANCE`, no
 * files. It exits non-zero only when the transport failed, exactly as
 * `journal:dry-run` does: read the table against §6.4's procedure rather than
 * trusting an exit code that only reports whether the network worked.
 *
 * Distinct strings are embedded once and reused across pairs, so a full run is
 * one batched call of ~30 inputs.
 */
import 'dotenv/config'
import { embed } from '../src/lib/llm/embed'
import { EMBEDDING_DIMENSIONS, NEAR_DUPLICATE_MAX_DISTANCE } from '../src/lib/journal/similarity'

type Group = 'A' | 'B' | 'C' | 'D'
type Pair = { n: number; group: Group; a: string; b: string; why?: string }

const GODOT_PASSAGE =
  'Estragon, sitting on a low mound, is trying to take off his boot. He pulls at it with both hands, panting. ' +
  'He gives up, exhausted, rests, tries again. As before. Enter Vladimir. Estragon giving up again: Nothing to be done. ' +
  'Vladimir advancing with short, stiff strides, legs wide apart: I am beginning to come round to that opinion. ' +
  'All my life I have tried to put it from me, saying, Vladimir, be reasonable, you have not yet tried everything. ' +
  'And I resumed the struggle. So there you are again. Am I? I am glad to see you back. I thought you were gone for ever. ' +
  'Me too. Together again at last! We will have to celebrate this. But get up first, let me embrace you.'

const COMPOUND_PASSAGE =
  'The mechanism people underrate is not the rate but the exponent. A sum left alone earns a return, and the return ' +
  'itself then earns a return, and it is the second of those that does the work. Over one year the difference between ' +
  'simple and compound growth is a rounding error; over forty years it is the whole of the outcome. This is why the ' +
  'single most valuable variable in a long horizon is time in the market rather than the size of the contribution, and ' +
  'why an early small sum outperforms a late large one. The arithmetic is unremarkable. What is remarkable is how ' +
  'consistently it is discounted, because the early years look flat and the graph only bends where most people have ' +
  'already stopped watching it. Patience is not a virtue here; it is a term in the equation.'

/**
 * Twenty pairs over ~30 distinct strings, and each group has a different job.
 *
 * A — must be at or near zero. If any of these exceeds the threshold, the
 *     threshold is wrong. (Layer 1 already catches all four; they are here to
 *     establish the floor and prove the two layers agree.)
 * B — the feature's actual purpose. Should be below the threshold; if the data
 *     says otherwise we accept under-warning and say so.
 * C — the dangerous false positives. Every one must sit ABOVE the threshold,
 *     and the threshold is chosen from the smallest number in this group.
 * D — short vs long, and the floor.
 */
const CORPUS: Pair[] = [
  { n: 1, group: 'A', a: "a fall in a pit, a gain in one's wit", b: "a fall in a pit, a gain in one's wit" },
  { n: 2, group: 'A', a: "a fall in a pit, a gain in one's wit", b: "A Fall In A Pit, A Gain In One's Wit" },
  { n: 3, group: 'A', a: 'Nothing to be done.', b: '  Nothing   to be\ndone ' },
  { n: 4, group: 'A', a: 'a fall in a pit, a gain in one’s wit', b: "a fall in a pit, a gain in one's wit" },

  { n: 5, group: 'B', a: "a fall in a pit, a gain in one's wit", b: 'Every time you fall into a pit you come out a little wiser.' },
  { n: 6, group: 'B', a: 'Sedikit demi sedikit, lama-lama menjadi bukit.', b: 'Little by little, it eventually becomes a hill.', why: 'cross-lingual' },
  { n: 7, group: 'B', a: 'Sedikit demi sedikit, lama-lama menjadi bukit.', b: 'Many a little makes a mickle.', why: 'cross-lingual' },
  { n: 8, group: 'B', a: 'The past is a foreign country: they do things differently there.', b: 'The past is a foreign country; they do things differently there.' },
  { n: 9, group: 'B', a: 'The past is a foreign country: they do things differently there.', b: 'People in the past did things differently — it is almost another country.' },
  { n: 10, group: 'B', a: 'Nothing to be done.', b: '— Estragon, in Waiting for Godot: "Nothing to be done."' },

  { n: 11, group: 'C', a: 'Nothing to be done.', b: 'Nothing to be gained.', why: 'two characters apart, different claim' },
  { n: 12, group: 'C', a: 'Time heals all wounds.', b: 'Time wounds all heels.', why: 'near-identical tokens, unrelated meaning' },
  { n: 13, group: 'C', a: 'Failure is the best teacher.', b: 'Success has many fathers; failure is an orphan.', why: 'same topic, different claim' },
  { n: 14, group: 'C', a: 'The unexamined life is not worth living.', b: 'The examined life is painful.', why: 'same topic, opposed claim' },
  { n: 15, group: 'C', a: 'Do not go gentle into that good night.', b: 'Rage, rage against the dying of the light.', why: 'adjacent lines of one poem — a user will save both' },
  { n: 16, group: 'C', a: 'Sedikit demi sedikit, lama-lama menjadi bukit.', b: 'Air beriak tanda tak dalam.', why: 'two unrelated Indonesian proverbs — measures language clustering' },
  { n: 17, group: 'C', a: "a fall in a pit, a gain in one's wit", b: 'Chinese proverb, heard in a film', why: 'a line vs its own source note' },

  { n: 18, group: 'D', a: 'Carpe diem.', b: 'Seize the day, boys. Make your lives extraordinary.' },
  { n: 19, group: 'D', a: 'Nothing to be done.', b: GODOT_PASSAGE, why: 'a 900-char passage containing the sentence' },
  { n: 20, group: 'D', a: "a fall in a pit, a gain in one's wit", b: COMPOUND_PASSAGE, why: 'a 900-char passage about compound interest' },
]

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 1 : 1 - dot / denom
}

async function main() {
  const args = process.argv.slice(2)
  const groupArg = args.find((a) => a.startsWith('--group='))?.split('=')[1]?.toUpperCase() as Group | undefined
  const positional = args.filter((a) => !a.startsWith('--'))

  const pairs: Pair[] =
    positional.length === 2
      ? [{ n: 0, group: 'A', a: positional[0], b: positional[1], why: 'ad hoc' }]
      : groupArg
        ? CORPUS.filter((p) => p.group === groupArg)
        : CORPUS

  if (pairs.length === 0) {
    console.error(`No pairs for group ${groupArg}. Groups are A, B, C, D.`)
    process.exit(1)
  }

  // One batched call: every distinct string, embedded once.
  const strings = [...new Set(pairs.flatMap((p) => [p.a, p.b]))]
  console.log(`Embedding ${strings.length} distinct strings across ${pairs.length} pairs…\n`)

  // A generous budget: nothing is waiting on this, unlike the save path.
  const result = await embed(strings, { timeoutMs: 60_000, dimensions: EMBEDDING_DIMENSIONS })
  if (!result.ok) {
    console.error(`Transport failed: ${result.error.kind} — ${result.error.detail}`)
    process.exit(1)
  }

  const byString = new Map(strings.map((s, i) => [s, result.vectors[i]]))
  const rows = pairs
    .map((p) => ({ ...p, distance: cosineDistance(byString.get(p.a)!, byString.get(p.b)!) }))
    .sort((x, y) => x.distance - y.distance)

  console.log(`model: ${result.model}   dimensions: ${result.vectors[0].length}\n`)
  const short = (s: string) => (s.length > 46 ? `${s.slice(0, 45)}…` : s)
  console.log('  dist   grp  #   pair')
  console.log('  -----  ---  --  ' + '-'.repeat(96))
  for (const r of rows) {
    console.log(
      `  ${r.distance.toFixed(4)}  ${r.group}    ${String(r.n).padStart(2)}  ` +
        `${short(r.a).padEnd(47)}| ${short(r.b)}${r.why ? `   (${r.why})` : ''}`,
    )
  }

  if (positional.length === 2) return

  /* --------------------------- §6.4's procedure --------------------------- */

  const of = (g: Group) => rows.filter((r) => r.group === g).map((r) => r.distance)
  const groupA = of('A')
  const groupB = of('B')
  const groupC = of('C')

  console.log('\n  groups')
  for (const g of ['A', 'B', 'C', 'D'] as Group[]) {
    const d = of(g)
    if (d.length === 0) continue
    console.log(`    ${g}: n=${d.length}  min=${Math.min(...d).toFixed(4)}  max=${Math.max(...d).toFixed(4)}`)
  }

  if (groupA.length === 0 || groupC.length === 0) {
    console.log('\n  (a full run is needed to choose a threshold)')
    return
  }

  const maxA = Math.max(...groupA)
  const minC = Math.min(...groupC)
  const minCPair = rows.find((r) => r.group === 'C' && r.distance === minC)!

  console.log('\n  §6.4 procedure')
  console.log(`    maxA = ${maxA.toFixed(4)}   minC = ${minC.toFixed(4)}  (pair ${minCPair.n}: ${minCPair.why})`)

  // Step 2. If the floor of the identical group is not below the ceiling the
  // dangerous group imposes, no threshold separates them and the model is
  // unusable for this.
  if (!(maxA < minC)) {
    console.error(`\n  SANITY GATE FAILED: maxA (${maxA.toFixed(4)}) >= minC (${minC.toFixed(4)}).`)
    console.error('  No threshold separates "the same line" from "a dangerous false positive".')
    console.error('  Phase B stops here — see §6.4 step 2.')
    process.exit(1)
  }

  // Steps 3 and 4. The 20% margin is because seventeen pairs are not a
  // distribution: minC is the smallest dangerous distance *observed*, and the
  // real one is smaller. The clamp is because beyond 0.25 the warning is
  // guessing regardless of what the corpus said.
  const raw = minC * 0.8
  const rounded = Math.floor(raw * 100) / 100
  const T = Math.min(rounded, 0.25)

  console.log(`    T = minC × 0.8 = ${raw.toFixed(4)} → floor to 2dp = ${rounded.toFixed(2)}${rounded > 0.25 ? ' → clamped to 0.25' : ''}`)
  console.log(`\n    RECOMMENDED NEAR_DUPLICATE_MAX_DISTANCE = ${T.toFixed(2)}`)
  console.log(`    currently in similarity.ts: ${NEAR_DUPLICATE_MAX_DISTANCE}`)

  // Step 5. Few is an acceptable outcome, not a failure: Layer 1 still catches
  // the re-paste, and [D5] says a quiet feature beats a crying-wolf one.
  const caught = groupB.filter((d) => d < T).length
  console.log(`\n    Group B caught at T: ${caught}/${groupB.length}`)
  if (caught === 0) {
    console.log('    (none — semantic paraphrase is not detectable at a safe threshold on this model.')
    console.log('     That is an acceptable outcome per §6.4 step 5, not a failure. Say so in the comment.)')
  }

  console.log(`\n  Record beside the constant: ${new Date().toISOString().slice(0, 10)}, ${result.model}, minC=${minC.toFixed(4)} from pair ${minCPair.n}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
