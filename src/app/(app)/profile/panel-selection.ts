import type { DialogSelection } from "@/components/gamification/badge-dialog";
import { BADGE_CATALOG } from "@/lib/gamification/badges";
import { LEVEL_GLOSS } from "@/lib/gamification/level-meta";
import { LEVEL_TIER_COUNT, levelArtKey, levelCondition } from "@/lib/gamification/levels";
import type { EarnedBadge, LevelProgressPayload } from "@/lib/gamification/schemas";
import type { LevelKind } from "@/lib/ui/types";

/**
 * What a tapped row hands the one dialog.
 *
 * **No `"use client"` here, deliberately.** Every export of a `"use client"`
 * module is a client *reference*, and calling one from a server component
 * throws — so these two builders cannot live in `badge-shelf.tsx` or
 * `level-blocks.tsx`. `/kitchen-sink/profile` calls them on the server to
 * resolve `?badge=` and `?level=` into an opening selection, and the two client
 * islands call them on a tap. One implementation, both sides.
 *
 * The `DialogSelection` import is **type-only**, so it is erased and this module
 * gains no runtime edge to the dialog.
 */

/** Null for an unknown key. The shelf drops unknown keys upstream anyway. */
export function badgeSelection(badges: EarnedBadge[], key: string): DialogSelection | null {
  const entry = BADGE_CATALOG.find((b) => b.key === key);
  if (!entry) return null;
  const earned = badges.find((b) => b.key === entry.key);
  return {
    kind: "badge",
    key: entry.key,
    title: entry.title,
    earned: earned
      ? {
          count: earned.count,
          firstAwardedOn: earned.firstAwardedOn,
          lastAwardedOn: earned.lastAwardedOn,
        }
      : null,
  };
}

/**
 * Null when there is no tier — the collector table at zero words ([R13]) — and
 * null when the index has no art. Neither is reachable from a rendered row: the
 * "no words yet" slot is not a button, and `levelArtKey` is total over every
 * index `resolve()` can return. Returning null rather than throwing mirrors
 * `badgeTitle` and `levelArtKey` themselves.
 */
export function levelSelection(
  kind: LevelKind,
  level: LevelProgressPayload | null,
): DialogSelection | null {
  if (!level) return null;
  const artKey = levelArtKey(kind, level.index);
  if (!artKey) return null;
  return {
    kind: "level",
    artKey,
    title: level.title,
    // 1-based at the edge, the same conversion `LevelPill` takes.
    tier: level.index + 1,
    tierCount: LEVEL_TIER_COUNT[kind],
    // Derived from the band, never typed twice.
    condition: levelCondition(kind, level.index),
    gloss: LEVEL_GLOSS[artKey],
  };
}
