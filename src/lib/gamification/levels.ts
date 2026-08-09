import type { LevelKind } from "@/lib/ui/types";

/**
 * The two level tables, and the resolver both share.
 *
 * Titles are ROADMAP_v0.1.0.md § "Gamification content", copied rather than
 * retyped. The one edit is the apostrophe: the roadmap is a markdown file and
 * writes `The Uncle's Apprentice` with an ASCII quote, while every string the
 * app draws uses the typographic one — "Today’s card", "Make today’s card", and
 * `sample-data.ts`, which F2 already checked against the same tables. A straight
 * quote beside them in the same serif reads as a typo, so ’ it is. Nothing else
 * about any title differs by a character.
 *
 * Pure. No database, no clock, no React — the profile page, the reveal toast and
 * `scripts/check-gamification.ts` all call these same functions.
 */

export type LevelBand = {
  readonly min: number;
  readonly title: string;
  /**
   * This tier's stable identity, and the only thing about a level that must
   * never change.
   *
   * A badge key arrives ready-made — it is the value in
   * `badges_awarded.badge_key`. A level is derived from a number and has no row
   * anywhere, so this string was invented for it (F22 D2), and it is what the
   * art filename carries: `public/levels/<key>.<hash8>.webp`. Renaming it
   * orphans two files, fails `npm run badges:check`, and — because that
   * directory is served `immutable` for a year — leaves every client that
   * already fetched the old URL showing the old picture. Rename is a
   * regeneration, not a refactor.
   *
   * Semantic, never positional. `streak_5` looks stable and is not: insert one
   * band in the middle and every key above it names the tier below its own
   * picture, with the manifest still total, every hash still matching and
   * nothing failing anywhere.
   *
   * The title is display and costs nothing to change; this does not follow it.
   * Same rule as `ibu` in `badges.ts`.
   */
  readonly key: string;
};

/**
 * By **longest** streak ever achieved. A title, once earned, is never taken away.
 *
 * `as const satisfies`, never `: readonly LevelBand[]`. The annotation would
 * widen every `key` to `string` and `LevelArtKey` below would resolve to
 * `string` — which silently destroys the totality guard that makes a tier with
 * no art a `tsc` error. `satisfies` keeps the literals *and* still checks the
 * shape.
 */
export const STREAK_LEVELS = [
  { min: 0, title: "Blank Card", key: "streak_blank_card" },
  { min: 3, title: "Pocket Fuzz", key: "streak_pocket_fuzz" },
  { min: 7, title: "The Small Scribe", key: "streak_small_scribe" },
  { min: 14, title: "Margin Scribbler", key: "streak_margin_scribbler" },
  { min: 30, title: "Keeper of the Pocket", key: "streak_keeper_of_the_pocket" },
  { min: 60, title: "The Uncle’s Apprentice", key: "streak_uncles_apprentice" },
  { min: 100, title: "Lexicon Smuggler", key: "streak_lexicon_smuggler" },
  { min: 200, title: "Walking Errata", key: "streak_walking_errata" },
  { min: 365, title: "Dickens Would Nod", key: "streak_dickens_would_nod" },
] as const satisfies readonly LevelBand[];

/**
 * By count of **manually added** words — `source = 'manual'`, every status.
 *
 * Starts at 1, not 0: [R13] says there is no title at zero words and the profile
 * shows "no words yet" rather than inventing one. `resolveCollectorLevel(0)`
 * returning null is that decision, in code.
 */
export const COLLECTOR_LEVELS = [
  { min: 1, title: "Word Picker", key: "collector_word_picker" },
  { min: 10, title: "Jam Jar of Words", key: "collector_jam_jar_of_words" },
  { min: 25, title: "Shelf of Odds", key: "collector_shelf_of_odds" },
  { min: 50, title: "Bag Man of Nouns", key: "collector_bag_man_of_nouns" },
  { min: 100, title: "Private Collector", key: "collector_private_collector" },
  { min: 250, title: "Hoarder of Rare Speech", key: "collector_hoarder_of_rare_speech" },
  { min: 500, title: "Curator of Forgotten Tongues", key: "collector_curator_of_forgotten_tongues" },
  { min: 1000, title: "Barnaby’s Ghost", key: "collector_barnabys_ghost" },
] as const satisfies readonly LevelBand[];

/**
 * The union `LEVEL_ART` and `LEVEL_GLOSS` are keyed on. Derived from the tables
 * rather than restated, which is what makes adding a tier a `tsc` error on both
 * of those files in the same session — the same guarantee `BadgeKey` gives
 * `BADGE_ART` (F12 D9).
 */
export type LevelArtKey =
  | (typeof STREAK_LEVELS)[number]["key"]
  | (typeof COLLECTOR_LEVELS)[number]["key"];

export const LEVEL_KEYS: Record<LevelKind, readonly LevelArtKey[]> = {
  streak: STREAK_LEVELS.map((b) => b.key),
  collector: COLLECTOR_LEVELS.map((b) => b.key),
};

export type LevelProgress = {
  /** 0-based band index. `LevelPill` wants it 1-based — add one at the edge. */
  index: number;
  title: string;
  bandMin: number;
  /** The number that resolved this band: longest streak, or manual word count. */
  value: number;
  nextTitle: string | null;
  nextAt: number | null;
  remaining: number | null;
  /** 0..1 within the current band; 1 at the top band. */
  progress: number;
};

/**
 * The roadmap states bands as inclusive ranges (`0–2`, `3–6`, …). They are
 * contiguous, so storing only `min` is equivalent and removes the one place an
 * off-by-one could hide — a duplicated upper bound that disagrees with the next
 * band's lower one.
 */
function resolve(bands: readonly LevelBand[], value: number): LevelProgress | null {
  const v = Math.max(0, Math.trunc(value));

  let i = -1;
  for (let k = 0; k < bands.length; k++) if (v >= bands[k].min) i = k;
  if (i === -1) return null; // below the first band — collector at 0 words

  const band = bands[i];
  const next = bands[i + 1];
  if (!next) {
    return {
      index: i,
      title: band.title,
      bandMin: band.min,
      value: v,
      nextTitle: null,
      nextAt: null,
      remaining: null,
      progress: 1,
    };
  }

  const span = next.min - band.min;
  return {
    index: i,
    title: band.title,
    bandMin: band.min,
    value: v,
    nextTitle: next.title,
    nextAt: next.min,
    remaining: next.min - v,
    progress: Math.min(1, Math.max(0, (v - band.min) / span)),
  };
}

/**
 * Never null: the first streak band starts at 0, so a user who has never made a
 * card is `Blank Card`, which is both true and the best joke in the roadmap.
 *
 * Fed the **longest** streak, never the current one. A user who kept a card for
 * 200 days and then stopped is still `Walking Errata`; the current streak is
 * reported separately and honestly, but it does not demote anyone.
 */
export function resolveStreakLevel(longestStreak: number): LevelProgress {
  // Non-null by construction — STREAK_LEVELS[0].min is 0 and `resolve` clamps
  // its input to >= 0.
  return resolve(STREAK_LEVELS, longestStreak)!;
}

/** Null at 0 manual words. [R13]: the profile renders "no words yet". */
export function resolveCollectorLevel(manualWords: number): LevelProgress | null {
  return resolve(COLLECTOR_LEVELS, manualWords);
}

export const LEVEL_TIER_COUNT: Record<LevelKind, number> = {
  streak: STREAK_LEVELS.length,
  collector: COLLECTOR_LEVELS.length,
};

/**
 * The line under a level.
 *
 * "N more days →" and not "N days until": there is no deadline anywhere in this
 * feature, and "until" invents one. At the top band the line is dry and true.
 */
export function levelCaption(level: LevelProgress, kind: LevelKind): string {
  if (level.remaining === null || level.nextTitle === null) return "nothing above this";
  const unit = kind === "streak" ? "day" : "word";
  const n = level.remaining;
  return `${n} more ${unit}${n === 1 ? "" : "s"} → ${level.nextTitle}`;
}

/**
 * The art key for a band index, or null.
 *
 * Null rather than a throw, mirroring `badgeTitle` exactly.
 *
 * `index` reaches this having crossed `levelProgressSchema`, where it is a plain
 * non-negative integer — the schema cannot know how many bands there are, and
 * pinning it there would put a second copy of the table's length in a second
 * file. A missing illustration draws nothing; it does not 500 the profile page.
 */
export function levelArtKey(kind: LevelKind, index: number): LevelArtKey | null {
  return LEVEL_KEYS[kind][index] ?? null;
}

/**
 * The rule, in one sentence, derived from the table rather than written out
 * seventeen times. Seventeen hand-typed thresholds is seventeen chances for a
 * number to disagree with the band beside it.
 */
export function levelCondition(kind: LevelKind, index: number): string {
  const bands = kind === "streak" ? STREAK_LEVELS : COLLECTOR_LEVELS;
  const band: LevelBand | undefined = bands[index];
  if (!band) return "";
  if (kind === "collector") {
    return `${band.min} word${band.min === 1 ? "" : "s"} added by hand.`;
  }
  if (band.min === 0) return `Held until a streak reaches ${STREAK_LEVELS[1].min} days.`;
  return `A longest streak of ${band.min} days.`;
}
