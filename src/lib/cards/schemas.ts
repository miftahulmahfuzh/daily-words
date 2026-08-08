import { z } from "zod";
import { LAYOUT } from "@/lib/ui/layout";

/**
 * Request and response shapes for F5's two routes, in one file so the two
 * halves of each contract cannot drift.
 *
 * `z.uuid()` rather than `z.string().uuid()` — ROADMAP [R2].
 *
 * As in F3/F4: the browser imports only the inferred **types**, which erase at
 * compile time. A value import of any schema below from a client component
 * drags the whole of zod into that route's bundle.
 */

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/* ------------------------------- POST /api/cards ---------------------------- */

/**
 * The nudge takes no meaningful input, and `.strict()` says so out loud.
 *
 * `clientTimezone` is **advisory telemetry only**. It sets `timezoneMismatch`
 * in the response so a later feature can offer to update the profile; it is
 * never used to compute `card_date`. The client does not get a vote on what day
 * it is — a phone with a wrong clock or a VPN's zone would write a wrong date
 * into a permanent record.
 */
export const createCardRequestSchema = z
  .object({
    clientTimezone: z.string().min(1).max(64).optional(),
  })
  .strict();

export const cardItemSchema = z.object({
  /** 1-based, contiguous from 1. */
  position: z.number().int().min(1).max(LAYOUT.cardSize),
  entryId: z.uuid(),
  term: z.string(),
  partOfSpeech: z.string().nullable(),
  definition: z.string().nullable(),
  enrichmentStatus: z.enum(["pending", "ready", "failed"]),
});

export const dailyCardSchema = z.object({
  id: z.uuid(),
  cardDate: z.string().regex(LOCAL_DATE),
  /** ISO instant, UTC. The card's *date* is `cardDate` — never re-derive it. */
  createdAt: z.string(),
  /** 1..6, ascending position. A zero-item card is never created. */
  items: z.array(cardItemSchema),
});

export const createCardResponseSchema = z.object({
  /** false = the card already existed. That is a success, not an error. */
  created: z.boolean(),
  card: dailyCardSchema,
  underSupplied: z.boolean(),
  activeWordCount: z.number().int().min(0),
  /** The IANA zone actually used to compute `card.cardDate`. */
  timezone: z.string(),
  timezoneMismatch: z.boolean(),
});

/* --------------------------- GET /api/cards/calendar ------------------------ */

export const calendarQuerySchema = z.object({
  month: z.string().regex(LOCAL_MONTH),
});

/**
 * The six states a day can be in.
 *
 * `today_none` and `pre_start` are the two that keep the calendar from reading
 * as a punishment chart: today is not a failure until it is over, and a user
 * who joined on the 8th must not find seven crosses waiting for the 1st–7th.
 */
export const dayStateSchema = z.enum([
  "card", // past day, card exists                    → tick
  "miss", // past day, at or after anchor, no card     → cross
  "today_card", // today, card exists                        → tick, ringed
  "today_none", // today, no card yet                        → open ring
  "future", // after today                               → number only
  "pre_start", // before the user's first recorded day      → number only
]);

export const calendarDaySchema = z.object({
  date: z.string().regex(LOCAL_DATE),
  state: dayStateSchema,
});

export const calendarResponseSchema = z.object({
  month: z.string().regex(LOCAL_MONTH),
  timezone: z.string(),
  /** The user's local 'YYYY-MM-DD' at the moment of the request. */
  today: z.string().regex(LOCAL_DATE),
  /** First day the calendar may mark. Null for a user with no history at all. */
  anchor: z.string().regex(LOCAL_DATE).nullable(),
  cardCount: z.number().int(),
  /** Days in this month at or after `anchor` and not after `today`. */
  markableCount: z.number().int(),
  /** Exactly the days of that month, ascending. */
  days: z.array(calendarDaySchema),
});

/* ---------------------------------- Types ----------------------------------- */

export type CreateCardRequest = z.infer<typeof createCardRequestSchema>;
export type CardItem = z.infer<typeof cardItemSchema>;
export type DailyCardPayload = z.infer<typeof dailyCardSchema>;
export type CreateCardResponse = z.infer<typeof createCardResponseSchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
export type DayState = z.infer<typeof dayStateSchema>;
export type CalendarDay = z.infer<typeof calendarDaySchema>;
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;
