import { z } from "zod";
import { BADGE_KEYS } from "@/lib/gamification/badges";

/**
 * Every shape that crosses an API boundary in F9.
 *
 * `z.uuid()` over `z.string().uuid()` — [R2]. As everywhere else in this app,
 * client components import the inferred **types** from here and never the
 * schemas as values: one value import drags the whole of zod into that route's
 * bundle.
 *
 * Neither F9 route takes a request body. The session check *is* the input
 * validation, and there is deliberately no `userId` parameter on either — no
 * social features means no reading another user's profile, ever.
 */

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isoDateSchema = z.string().regex(LOCAL_DATE);

export const badgeKeySchema = z.enum(BADGE_KEYS as unknown as [string, ...string[]]);

export const levelProgressSchema = z.object({
  index: z.number().int().nonnegative(),
  title: z.string(),
  bandMin: z.number().int().nonnegative(),
  value: z.number().int().nonnegative(),
  nextTitle: z.string().nullable(),
  nextAt: z.number().int().nullable(),
  remaining: z.number().int().nullable(),
  progress: z.number().min(0).max(1),
});

export const earnedBadgeSchema = z.object({
  key: badgeKeySchema,
  title: z.string(),
  /** Badges repeat across years, so this is a count, not a boolean. */
  count: z.number().int().positive(),
  firstAwardedOn: isoDateSchema,
  lastAwardedOn: isoDateSchema,
});

export const profileStatsSchema = z.object({
  user: z.object({
    name: z.string().nullable(),
    email: z.string(),
  }),
  timezone: z.string(),
  todayLocal: isoDateSchema,
  /** Drives the quiet "today's card is not made yet" caption, and nothing else. */
  hasCardToday: z.boolean(),
  /** True iff `totalCards === 0`. The whole empty-state branch hangs off it. */
  isEmpty: z.boolean(),
  /** Null with zero cards; the since-line then reads "no card yet". */
  sinceDate: isoDateSchema.nullable(),
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  totalCards: z.number().int().nonnegative(),
  totalManualWords: z.number().int().nonnegative(),
  /** Never null — the first streak band starts at 0. */
  streakLevel: levelProgressSchema,
  /** Null at zero manual words, per [R13]. */
  collectorLevel: levelProgressSchema.nullable(),
  /** Earned only. `BADGE_CATALOG` supplies the unearned slots on the shelf. */
  badges: z.array(earnedBadgeSchema),
});

export const awardedBadgeSchema = z.object({
  key: badgeKeySchema,
  title: z.string(),
  awardedForDate: isoDateSchema,
});

export const levelUpSchema = z.object({
  kind: z.literal("streak"),
  previousTitle: z.string(),
  title: z.string(),
});

/**
 * What the card-created hook hands back for `POST /api/cards` to carry to the
 * reveal toast. `awardedBadges` contains only rows the INSERT genuinely created,
 * so a duplicate award is silent by construction.
 */
export const cardCreatedRewardsSchema = z.object({
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  totalCards: z.number().int().nonnegative(),
  awardedBadges: z.array(awardedBadgeSchema),
  levelUp: levelUpSchema.nullable(),
});

export const recomputeReportSchema = z.object({
  userId: z.uuid(),
  timezone: z.string(),
  before: z
    .object({
      currentStreak: z.number().int(),
      longestStreak: z.number().int(),
      totalCards: z.number().int(),
      firstCardOn: isoDateSchema.nullable(),
      lastCardOn: isoDateSchema.nullable(),
    })
    .nullable(),
  after: z.object({
    currentStreak: z.number().int(),
    longestStreak: z.number().int(),
    totalCards: z.number().int(),
    firstCardOn: isoDateSchema.nullable(),
    lastCardOn: isoDateSchema.nullable(),
  }),
  badgesInserted: z.array(z.object({ key: z.string(), awardedForDate: isoDateSchema })),
  badgesPruned: z.array(z.object({ key: z.string(), awardedForDate: isoDateSchema })),
  warnings: z.array(z.string()),
  dryRun: z.boolean(),
});

export type LevelProgressPayload = z.infer<typeof levelProgressSchema>;
export type EarnedBadge = z.infer<typeof earnedBadgeSchema>;
export type ProfileStats = z.infer<typeof profileStatsSchema>;
export type AwardedBadge = z.infer<typeof awardedBadgeSchema>;
export type LevelUp = z.infer<typeof levelUpSchema>;
export type CardCreatedRewards = z.infer<typeof cardCreatedRewardsSchema>;
export type RecomputeReport = z.infer<typeof recomputeReportSchema>;
