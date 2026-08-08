import "server-only";
import { z } from "zod";

/**
 * The collection's keyset cursor.
 *
 * Keyset, never `OFFSET`. The list mutates under the user — a word is added on
 * another tab, one is deleted, one is mastered — and an offset re-scans from the
 * top and then skips or repeats exactly as many rows as the list shifted by.
 * A cursor carrying the last row's sort key cannot do that.
 *
 * The key is `(lower(term), id)`, matching the list's `ORDER BY` and the
 * `UNIQUE (user_id, lower(term))` index that serves it. `id` is in the key only
 * as a tiebreaker; it guarantees a total order so pagination can neither loop
 * nor skip even if two rows compare equal.
 *
 * Opaque on purpose: the client stores and returns the string and never reads
 * it, so the key can change shape without a client change.
 */

export type VocabCursor = {
  /** `lower(term)` as Postgres produced it, not as JS would. */
  term: string;
  id: string;
};

const payloadSchema = z.tuple([z.string(), z.uuid()]);

export function encodeCursor(cursor: VocabCursor): string {
  const json = JSON.stringify([cursor.term, cursor.id]);
  return Buffer.from(json, "utf8").toString("base64url");
}

/** Null for anything that is not a cursor this function wrote. */
export function decodeCursor(raw: string): VocabCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const result = payloadSchema.safeParse(parsed);
  if (!result.success) return null;

  const [term, id] = result.data;
  return { term, id };
}
