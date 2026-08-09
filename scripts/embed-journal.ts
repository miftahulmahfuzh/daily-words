/**
 * F15 §5.1 — the backfill. Embeds journal entries that have no current vector.
 *
 *   npm run journal:embed -- --all [--limit=500] [--retry-failed] [--dry-run]
 *   npm run journal:embed -- --user=<uuid|email> [...]
 *
 * Three kinds of row are selected, and they are [D3]'s three states minus the
 * finished one: never attempted (no sibling row), stale (the user edited the
 * line after it was embedded), and — only under `--retry-failed` — a failure
 * below the attempt cap.
 *
 * **Idempotent and interruptible.** Every batch is committed before the next
 * starts and the upsert is `ON CONFLICT (entry_id) DO UPDATE`, so a second run
 * immediately after selects nothing and costs nothing, and a run killed halfway
 * loses only the batch in flight.
 *
 * **A batch that fails does not stop the run.** Its rows are marked `'failed'`
 * with the reason and `attempts + 1`, and the next batch goes ahead: one bad
 * line must not cost four hundred good ones. The exit code is non-zero only on
 * a configuration error or when *every* batch failed — the same discipline as
 * the dry-runs, where the exit code reports transport and nothing else.
 *
 * Journal text is sent to the embedding provider. That is [S2a], decided
 * knowingly; this script is where the largest volume of it leaves at once.
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { users } from '../src/lib/db/schema'
import {
  coverage,
  listUserIdsWithEntries,
  selectPendingForBackfill,
  upsertEmbedding,
  type PendingRow,
} from '../src/lib/db/queries/journal-embeddings'
import { embed } from '../src/lib/llm/embed'
import { EMBEDDING_DIMENSIONS, normShaFor, textShaFor } from '../src/lib/journal/similarity'

/**
 * 64 inputs per request.
 *
 * `JOURNAL_TEXT_MAX` is 1 000 characters ≈ 300 tokens, so a full batch is
 * ~19 k tokens — an order of magnitude under OpenAI's 300 k per-request ceiling
 * and well under the 2 048-input one.
 */
const BATCH_SIZE = 64
const BATCH_PAUSE_MS = 250
/** Generous: nothing is waiting on this, unlike the save path's 2.5 s. */
const BACKFILL_TIMEOUT_MS = 60_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function arg(name: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
}
function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`)
}

async function resolveUser(token: string): Promise<string> {
  if (/^[0-9a-f-]{36}$/i.test(token)) return token
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, token))
  if (!row) throw new Error(`No user with email ${token}`)
  return row.id
}

type Totals = { selected: number; embedded: number; failed: number; batches: number; batchFailures: number }

async function runForUser(userId: string, opts: { limit: number; retryFailed: boolean; dryRun: boolean }, totals: Totals) {
  const pending = await selectPendingForBackfill(userId, {
    limit: opts.limit,
    retryFailed: opts.retryFailed,
  })
  const before = await coverage(userId)
  console.log(
    `\nuser ${userId.slice(0, 8)}  coverage ${before.ready}/${before.total}  pending ${pending.length}`,
  )
  totals.selected += pending.length
  if (pending.length === 0 || opts.dryRun) return

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch: PendingRow[] = pending.slice(i, i + BATCH_SIZE)
    totals.batches++
    process.stdout.write(`  batch ${totals.batches} (${batch.length} rows)… `)

    const result = await embed(
      batch.map((r) => r.text),
      { timeoutMs: BACKFILL_TIMEOUT_MS, dimensions: EMBEDDING_DIMENSIONS },
    )

    if (!result.ok) {
      // Marked, counted, and the run continues.
      console.log(`FAILED (${result.error.kind})`)
      totals.batchFailures++
      for (const row of batch) {
        await upsertEmbedding(
          userId,
          row.id,
          {
            status: 'failed',
            textSha: textShaFor(row.text),
            normSha: normShaFor(row.text),
            reason: `${result.error.kind}: ${result.error.detail.slice(0, 200)}`,
          },
          { countAttempt: true },
        )
        totals.failed++
      }
    } else {
      for (const [j, row] of batch.entries()) {
        await upsertEmbedding(userId, row.id, {
          status: 'ready',
          textSha: textShaFor(row.text),
          normSha: normShaFor(row.text),
          model: result.model,
          embedding: result.vectors[j],
        })
        totals.embedded++
      }
      console.log('ok')
    }

    if (i + BATCH_SIZE < pending.length) await sleep(BATCH_PAUSE_MS)
  }

  const after = await coverage(userId)
  console.log(`  coverage ${before.ready}/${before.total} → ${after.ready}/${after.total}`)
}

async function main() {
  const all = flag('all')
  const userToken = arg('user')
  const dryRun = flag('dry-run')
  const retryFailed = flag('retry-failed')
  const limit = Number(arg('limit') ?? 500)

  if (all === Boolean(userToken)) {
    console.error('Pass exactly one of --all or --user=<uuid|email>.')
    process.exit(1)
  }
  if (!Number.isFinite(limit) || limit < 1) {
    console.error('--limit must be a positive integer.')
    process.exit(1)
  }
  if (!process.env.EMBEDDING_API_KEY && !dryRun) {
    console.error('EMBEDDING_API_KEY is not set. Nothing can be embedded.')
    console.error('(--dry-run works without it and reports what would be selected.)')
    process.exit(1)
  }

  const userIds = all ? await listUserIdsWithEntries() : [await resolveUser(userToken!)]
  console.log(
    `${dryRun ? 'DRY RUN — no calls, no writes. ' : ''}` +
      `${userIds.length} user(s), limit ${limit} each` +
      `${retryFailed ? ', retrying failures below the attempt cap' : ''}`,
  )

  const totals: Totals = { selected: 0, embedded: 0, failed: 0, batches: 0, batchFailures: 0 }
  for (const id of userIds) await runForUser(id, { limit, retryFailed, dryRun }, totals)

  console.log(
    `\nselected ${totals.selected}, embedded ${totals.embedded}, failed ${totals.failed}` +
      ` across ${totals.batches} batch(es)`,
  )

  // Non-zero only on a config error (handled above) or when every batch failed.
  // A partial run is a success: the rows that landed are durable and the rest
  // are selected again next time.
  if (totals.batches > 0 && totals.batchFailures === totals.batches) {
    console.error('every batch failed — check the provider and the key')
    process.exit(1)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
