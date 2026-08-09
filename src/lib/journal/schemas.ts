import { z } from "zod";
import {
  JOURNAL_PAGE_SIZE,
  JOURNAL_SOURCE_NOTE_MAX,
  JOURNAL_TEXT_MAX,
  JOURNAL_TEXT_MIN,
  SOURCE_NOTE_TOO_LONG_MESSAGE,
  TOO_LONG_MESSAGE,
} from "@/lib/journal/limits";

/**
 * Request and response shapes for F10's three routes, plus the one structure the
 * model is allowed to return, in one file so the two halves of each contract
 * cannot drift.
 *
 * `z.uuid()` rather than `z.string().uuid()` — ROADMAP [R2] pins zod 4.
 *
 * Route handlers import the schemas; the browser imports only the inferred
 * **types**, which erase at compile time. A value import of a schema from a
 * client component drags the whole of zod into that route's bundle — which is
 * why every number lives in `limits.ts` and not here.
 */

/* --------------------------------- Values --------------------------------- */

export const journalTextSchema = z
  .string()
  .trim()
  .min(JOURNAL_TEXT_MIN, { message: "Write something first." })
  .max(JOURNAL_TEXT_MAX, { message: TOO_LONG_MESSAGE });

/**
 * `""` is never stored. An empty source note is the expected case and it is an
 * absence, not a value — a stored empty string would draw a bare "·" separator
 * on the entry page.
 */
export const sourceNoteSchema = z
  .string()
  .trim()
  .max(JOURNAL_SOURCE_NOTE_MAX, { message: SOURCE_NOTE_TOO_LONG_MESSAGE })
  .transform((s) => (s.length > 0 ? s : null));

export const insightStatusSchema = z.enum(["none", "pending", "ready", "failed"]);

/* -------------------------------- Requests -------------------------------- */

/**
 * `POST /api/journal`
 *
 * `force` skips **the duplicate check and nothing else** (F15 [D1]). It is what
 * "Keep it anyway" sends, and it is unconditional: it never re-checks, never
 * rate-limits and never asks twice. It does not skip validation — a 1001-
 * character line is still rejected with `force: true`, asserted in
 * `journal:check`, because "force" is the kind of flag that accumulates
 * meanings.
 */
export const createEntrySchema = z.object({
  text: journalTextSchema,
  sourceNote: sourceNoteSchema.nullable().optional(),
  force: z.boolean().default(false),
});

/**
 * `PATCH /api/journal/[id]` — any subset of the two fields.
 *
 * The refine reads the *input*, so `{"sourceNote": null}` (clear it) is a real
 * update while `{}` is not.
 */
export const patchEntrySchema = z
  .object({
    text: journalTextSchema.optional(),
    sourceNote: sourceNoteSchema.nullable().optional(),
  })
  .refine((v) => v.text !== undefined || v.sourceNote !== undefined, {
    message: "Nothing to update.",
  });

/**
 * `GET /api/journal` query string.
 *
 * Total apart from the cursor: junk params degrade to page 1 rather than 400,
 * because a bookmarked URL should show the journal. An undecodable cursor is
 * the exception — ignoring it silently would restart the list at page 1 forever
 * and the user would watch the same thirty lines append themselves.
 */
export const listJournalQuerySchema = z.object({
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(50).catch(JOURNAL_PAGE_SIZE),
});

/* --------------------------------- Insight -------------------------------- */

/**
 * What the model must return, and what the `insight` jsonb column holds ([R7]).
 *
 * Both parts are bounded: `meaning` at 220 characters is one or two sentences,
 * `whenItApplies` at 2–3 × 120 is three short lines. The whole insight is under
 * ~70 words, which is what makes it fit under the entry on a 375×667 screen
 * without scrolling — that constraint produced these numbers, not the other way
 * round.
 */
export const insightSchema = z.object({
  meaning: z.string().trim().min(20).max(220),
  whenItApplies: z.array(z.string().trim().min(8).max(120)).min(2).max(3),
});

/* -------------------------------- Responses ------------------------------- */

/**
 * The one entry shape that crosses the API boundary.
 *
 * `localDate` is the user-local calendar date of `created_at`, computed on the
 * server with the profile timezone. The list groups by it with a string
 * comparison and does no date arithmetic of its own — which is both the
 * roadmap's day-boundary rule and what removes any chance of the server and the
 * client disagreeing about which group a row belongs in.
 */
export const journalEntryDtoSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  sourceNote: z.string().nullable(),
  insightStatus: insightStatusSchema,
  /** Null unless `insightStatus === 'ready'`. */
  insight: insightSchema.nullable(),
  /** 'YYYY-MM-DD' in the user's timezone. */
  localDate: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** `updated_at` more than a second past `created_at`. Draws "· edited". */
  edited: z.boolean(),
});

export const listJournalResponseSchema = z.object({
  entries: z.array(journalEntryDtoSchema),
  /** Opaque. Null on the last page. */
  nextCursor: z.string().nullable(),
});

export const journalEntryResponseSchema = z.object({
  entry: journalEntryDtoSchema,
});

/**
 * The line the user already has, as the warning draws it (F15).
 *
 * An **excerpt**, not the text, and no `insight` and no `updatedAt`: the warning
 * shows a line, not an entry. Anything more is a second entry page rendered
 * under the composer, on the screen whose premise is that nothing gets in the
 * way. Asserted by absence in `journal:check`.
 */
export const duplicateMatchDtoSchema = z.strictObject({
  id: z.uuid(),
  /** Possibly shortened, with a trailing ellipsis when it was. */
  excerpt: z.string(),
  sourceNote: z.string().nullable(),
  /** 'YYYY-MM-DD' in the user's timezone, like every other date on the wire. */
  localDate: z.string(),
  createdAt: z.iso.datetime(),
});

/**
 * What `POST /api/journal` answers, in both arms.
 *
 * A discriminated union rather than a widened object, because `saved` and
 * `duplicate` carry disjoint payloads and the composer branches on exactly this.
 * `strictObject` is what makes a body carrying **both** `entry` and `match` a
 * parse failure instead of a silently stripped key — the one malformation this
 * shape exists to make impossible.
 *
 * Both arms are a 2xx: `201` for the row that landed, `200` for the warning.
 * A duplicate is not an error, and returning one as a 4xx would put it through
 * `lib/api/client`'s failure path, where the composer would render it as a
 * problem sentence rather than as a choice.
 */
export const createEntryResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("saved"), entry: journalEntryDtoSchema }),
  z.strictObject({ status: z.literal("duplicate"), match: duplicateMatchDtoSchema }),
]);

/* ---------------------------------- Types --------------------------------- */

export type Insight = z.infer<typeof insightSchema>;
export type InsightStatus = z.infer<typeof insightStatusSchema>;
export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type PatchEntryInput = z.infer<typeof patchEntrySchema>;
export type ListJournalQuery = z.infer<typeof listJournalQuerySchema>;
export type JournalEntryDto = z.infer<typeof journalEntryDtoSchema>;
export type DuplicateMatchDto = z.infer<typeof duplicateMatchDtoSchema>;
export type CreateEntryResult = z.infer<typeof createEntryResultSchema>;
export type ListJournalResponse = z.infer<typeof listJournalResponseSchema>;
export type JournalEntryResponse = z.infer<typeof journalEntryResponseSchema>;
