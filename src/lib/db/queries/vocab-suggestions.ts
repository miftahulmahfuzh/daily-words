import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vocabEntries } from "@/lib/db/schema";
import type { EnrichmentStatus } from "@/lib/db/types";

/**
 * F8's two reads. Its own module rather than three more functions in
 * `queries/vocab.ts`, because the first of them carries a constraint that must
 * survive every later edit to that file, and a comment is easier to delete than
 * a file boundary.
 *
 * F8 issues no other statement: the accept path writes through F3's existing
 * insert, and `profiles` is read only through F7's `getProfileContext`.
 */

/**
 * Every term the user holds — **NO status filter**.
 *
 * A `where status = 'active'` here is the single most likely mistake in F8. It
 * would compile, pass every test that does not have a mastered word in it, and
 * then propose `genteel` to somebody who told the app last month that they had
 * mastered `genteel`. Mastered means retired from daily cards; it does not mean
 * forgotten.
 *
 * Newest first: the AVOID list is capped at 300 and recency is what correlates
 * with the user's current level and current reading, which is exactly where the
 * model is most likely to collide. Everything past the cap is still enforced
 * server-side, so the cap trades prompt weight for a slightly higher drop rate
 * and never for a wrong result.
 *
 * One indexed single-column read on `user_id`. At 500 words it is tens of
 * kilobytes.
 */
export async function listAllUserTerms(userId: string): Promise<string[]> {
  const rows = await db
    .select({ term: vocabEntries.term })
    .from(vocabEntries)
    .where(eq(vocabEntries.userId, userId))
    .orderBy(desc(vocabEntries.createdAt));
  return rows.map((row) => row.term);
}

export type KeptWord = {
  id: string;
  term: string;
  definition: string | null;
  enrichmentStatus: EnrichmentStatus;
};

/**
 * The design's "Kept from Discover" strip — words this user accepted here,
 * newest first.
 *
 * `source = 'suggested'` is the only place in the app that reads that column
 * (F9 will read it too, to count *manually* added words for the collector
 * level). It is what makes the provenance visible without a schema addition.
 */
export async function listKeptFromDiscover(
  userId: string,
  limit = 3,
): Promise<KeptWord[]> {
  return db
    .select({
      id: vocabEntries.id,
      term: vocabEntries.term,
      definition: vocabEntries.definition,
      enrichmentStatus: vocabEntries.enrichmentStatus,
    })
    .from(vocabEntries)
    .where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.source, "suggested")))
    .orderBy(desc(vocabEntries.createdAt))
    .limit(limit);
}
