import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { EnrichmentStatus } from "@/lib/db/types";
import type { LocalDate } from "@/lib/time/local-date";
import { LAYOUT } from "@/lib/ui/layout";

/**
 * The one definition of how six words are chosen. Nothing else selects a card.
 *
 * The rule in a sentence: words never shown fill the card first, in random
 * order; the remaining slots are drawn by weighted random sampling **without
 * replacement** from words already shown, weighted by how long ago they were
 * last shown.
 *
 *   tier(v)      = 0 if last_shown_on IS NULL else 1
 *   staleness(v) = max(D − last_shown_on, 0) days      (0 for tier 0)
 *   weight(v)    = staleness(v) + 1
 *   key(v)       = u ^ (1 / weight(v)),  u ~ Uniform(0,1) drawn per row
 *
 * Ordering by `tier` then `key` descending and taking the top six is exactly
 * Efraimidis–Spirakis: an item's probability of being drawn first is w / Σw.
 * Tier-0 items all have weight 1, so their key is plain `u` and they come out in
 * uniform random order — the roadmap's "nulls first", with the tie broken
 * randomly rather than by whatever the planner felt like.
 *
 * `staleness` is clamped at 0 so a word whose `last_shown_on` is somehow *after*
 * D — possible after a westward timezone move — gets weight 1 rather than a
 * negative exponent.
 *
 * Two things this deliberately does not do:
 *  - **No anti-repeat logic.** Seeing "genteel" every day for a week is the
 *    system working. The pressure toward variety is probabilistic and gentle,
 *    never a hard exclusion.
 *  - **No filter on `enrichment_status`.** A word the user chose to learn
 *    belongs on the card while its definition is still being generated;
 *    excluding it would silently shrink an already-small collection. The row
 *    draws a placeholder for a null definition.
 */

export type CardCandidate = {
  id: string;
  term: string;
  partOfSpeech: string | null;
  definition: string | null;
  enrichmentStatus: EnrichmentStatus;
};

/** The transaction handle `db.transaction` hands its callback. */
export type CardTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Candidates for one card, already in position order.
 *
 * Must run inside the same transaction as the card insert: between selection
 * and the `last_shown_on` update, a concurrent nudge could otherwise pick the
 * same words on stale recency.
 */
export async function selectCardCandidates(
  tx: CardTx,
  userId: string,
  cardDate: LocalDate,
  limit: number = LAYOUT.cardSize,
): Promise<CardCandidate[]> {
  const rows = await tx.execute(sql`
    SELECT
      v.id                AS "id",
      v.term              AS "term",
      v.part_of_speech    AS "partOfSpeech",
      v.definition        AS "definition",
      v.enrichment_status AS "enrichmentStatus"
    FROM vocab_entries v
    CROSS JOIN LATERAL (
      SELECT (
        CASE
          WHEN v.last_shown_on IS NULL THEN 1
          ELSE GREATEST(${cardDate}::date - v.last_shown_on, 0) + 1
        END
      )::double precision AS weight
    ) w
    WHERE v.user_id = ${userId}
      AND v.status = 'active'
    ORDER BY
      (v.last_shown_on IS NOT NULL) ASC,
      power(random(), 1.0 / w.weight) DESC
    LIMIT ${limit}
  `);

  // `random()` is volatile, so Postgres evaluates it once per row — that is what
  // makes this sort a sample rather than a fixed ranking. The whole candidate
  // set is scanned and sorted; at hobby scale that is microseconds, and it is
  // not worth making harder to reason about.
  return rows as unknown as CardCandidate[];
}
