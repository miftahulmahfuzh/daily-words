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

export type LevelBand = { readonly min: number; readonly title: string };

/** By **longest** streak ever achieved. A title, once earned, is never taken away. */
export const STREAK_LEVELS: readonly LevelBand[] = [
  { min: 0, title: "Blank Card" },
  { min: 3, title: "Pocket Fuzz" },
  { min: 7, title: "The Small Scribe" },
  { min: 14, title: "Margin Scribbler" },
  { min: 30, title: "Keeper of the Pocket" },
  { min: 60, title: "The Uncle’s Apprentice" },
  { min: 100, title: "Lexicon Smuggler" },
  { min: 200, title: "Walking Errata" },
  { min: 365, title: "Dickens Would Nod" },
] as const;

/**
 * By count of **manually added** words — `source = 'manual'`, every status.
 *
 * Starts at 1, not 0: [R13] says there is no title at zero words and the profile
 * shows "no words yet" rather than inventing one. `resolveCollectorLevel(0)`
 * returning null is that decision, in code.
 */
export const COLLECTOR_LEVELS: readonly LevelBand[] = [
  { min: 1, title: "Word Picker" },
  { min: 10, title: "Jam Jar of Words" },
  { min: 25, title: "Shelf of Odds" },
  { min: 50, title: "Bag Man of Nouns" },
  { min: 100, title: "Private Collector" },
  { min: 250, title: "Hoarder of Rare Speech" },
  { min: 500, title: "Curator of Forgotten Tongues" },
  { min: 1000, title: "Barnaby’s Ghost" },
] as const;

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
