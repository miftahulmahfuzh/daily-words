import "server-only";
import { z } from "zod";

/**
 * The journal's keyset cursor.
 *
 * Keyset, never `OFFSET`, for the reason `lib/vocab/cursor.ts` states: the list
 * mutates under the user — a line is saved while page two is on screen — and an
 * offset then skips or repeats exactly as many rows as the list shifted by.
 *
 * The key is `(created_at, id)` descending, which is the list's `ORDER BY` and
 * the shape of `journal_entries_user_created_idx`. `id` is in it only as a
 * tiebreaker, guaranteeing a total order so two entries saved in the same
 * millisecond cannot make pagination loop or skip.
 *
 * Opaque on purpose: the client holds the string and returns it, never reads it.
 *
 * `createdAt` is carried as an **ISO string, not a Date**, and that is
 * load-bearing. The cursor is interpolated into a raw `sql` template, and a JS
 * `Date` inside one is handed to postgres.js as an unmapped parameter — the
 * query fails at bind time with `ERR_INVALID_ARG_TYPE`. `queries/profiles.ts`
 * documents the same trap from the other direction. The conversion happens here,
 * once, in `cursorFor`.
 */

export type JournalCursor = {
  /** An ISO 8601 instant, cast to `timestamptz` at the query. */
  createdAt: string;
  id: string;
};

/** The last row of a page, as the cursor that follows it. */
export function cursorFor(row: { createdAt: Date; id: string }): JournalCursor {
  return { createdAt: row.createdAt.toISOString(), id: row.id };
}

const payloadSchema = z.tuple([z.string(), z.uuid()]);

export function encodeCursor(cursor: JournalCursor): string {
  const json = JSON.stringify([cursor.createdAt, cursor.id]);
  return Buffer.from(json, "utf8").toString("base64url");
}

/** Null for anything that is not a cursor this function wrote. */
export function decodeCursor(raw: string): JournalCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const result = payloadSchema.safeParse(parsed);
  if (!result.success) return null;

  const [createdAt, id] = result.data;
  // A timestamp Postgres cannot cast would be a 500; here it is a 400 on an
  // undecodable cursor, which is what the route already answers for junk.
  if (Number.isNaN(Date.parse(createdAt))) return null;

  return { createdAt, id };
}
