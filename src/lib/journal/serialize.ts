import type { JournalEntry } from "@/lib/db/types";
import type { DuplicateMatchRow } from "@/lib/db/queries/journal-embeddings";
import { toLocalDate } from "@/lib/time/local-date";
import { excerptFor } from "@/lib/journal/format";
import { INSIGHT_STALE_MS } from "@/lib/journal/limits";
import {
  insightSchema,
  type DuplicateMatchDto,
  type Insight,
  type JournalEntryDto,
} from "@/lib/journal/schemas";

/**
 * Row → wire.
 *
 * `toISOString()` here is a sanctioned use, alongside `lib/cards/serialize.ts`
 * and `lib/chat/serialize.ts`: it serialises an **instant**. The *day* an entry
 * belongs to is `localDate`, computed through `toLocalDate` in the user's zone,
 * and it never comes from an ISO string's date part.
 */

/**
 * Read the `insight` column defensively.
 *
 * The column is `jsonb` ([R7]) so it is already parsed, but nothing guarantees
 * its *shape*: a hand-edited row, a schema tightened after a write, a value
 * written by an older version. On any mismatch this returns null and the caller
 * renders as if there were no insight. It never rewrites `insight_status` and
 * never clears the column — a display bug must not destroy what the model
 * produced.
 */
export function parseStoredInsight(raw: unknown, id?: string): Insight | null {
  if (raw == null) return null;
  const parsed = insightSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  console.warn(`[journal] unreadable insight on entry ${id ?? "?"}`);
  return null;
}

/**
 * `edited` is a second of slack past `created_at`, not a strict `>`.
 *
 * Both columns default to `now()` in the same statement, and Postgres gives the
 * whole transaction one timestamp — but a row created through two statements, or
 * migrated, can differ by microseconds. A brand-new entry must never say
 * "edited".
 */
const EDITED_SLACK_MS = 1000;

/**
 * What the UI should draw, which is not always what the column says.
 *
 * Two readings, both deliberate, and neither writes to the database:
 *
 * - A `pending` row older than the stale window is reported as **failed**. The
 *   function that claimed it died — a deploy, a timeout, a closed tab — and
 *   nothing will ever finish it, because the roadmap forbids sweepers. Left as
 *   `pending` the entry page would say "Thinking…" for ever and the user could
 *   never retry, while the server would happily re-claim it on the next tap.
 *   F3 draws a stalled enrichment the same way, for the same reason.
 * - A `ready` row whose stored insight will not parse is reported as **none**.
 *   "Ready with nothing to show" is the one combination the UI has no rendering
 *   for — neither a panel nor a button. Saying `none` hands back a working
 *   Insight button.
 *
 * The row is untouched in both cases. A display bug must not destroy what the
 * model produced, and a rewrite here would be a write on a GET.
 */
function wireStatus(
  row: JournalEntry,
  insight: Insight | null,
  now: number,
): JournalEntryDto["insightStatus"] {
  if (row.insightStatus === "ready") return insight ? "ready" : "none";
  if (
    row.insightStatus === "pending" &&
    (!row.insightRequestedAt || now - row.insightRequestedAt.getTime() >= INSIGHT_STALE_MS)
  ) {
    return "failed";
  }
  return row.insightStatus;
}

export function toJournalEntryDto(
  row: JournalEntry,
  timezone: string,
  now: number = Date.now(),
): JournalEntryDto {
  const insight = row.insightStatus === "ready" ? parseStoredInsight(row.insight, row.id) : null;

  return {
    id: row.id,
    text: row.text,
    sourceNote: row.sourceNote,
    insightStatus: wireStatus(row, insight, now),
    insight,
    localDate: toLocalDate(row.createdAt, timezone),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    edited: row.updatedAt.getTime() - row.createdAt.getTime() > EDITED_SLACK_MS,
  };
}

/**
 * The matched line → the wire, for F15's warning.
 *
 * Deliberately **not** `toJournalEntryDto`. The warning needs to answer one
 * question — "is this the one you already kept?" — and everything a full entry
 * DTO carries beyond that is either useless here (`insight`, `insightStatus`) or
 * actively misleading (`edited`, which is a fact about the *entry* and would
 * read as a fact about the line being saved). The text is an excerpt for the
 * same reason. Asserted by absence in `journal:check`.
 */
export function toDuplicateMatchDto(
  row: DuplicateMatchRow,
  timezone: string,
): DuplicateMatchDto {
  return {
    id: row.id,
    excerpt: excerptFor(row.text),
    sourceNote: row.sourceNote,
    localDate: toLocalDate(row.createdAt, timezone),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toJournalEntryDtos(
  rows: JournalEntry[],
  timezone: string,
): JournalEntryDto[] {
  // One clock reading for the page, so two rows claimed a millisecond apart
  // cannot land on opposite sides of the stale window.
  const now = Date.now();
  return rows.map((row) => toJournalEntryDto(row, timezone, now));
}
