"use client";

import { useState } from "react";
import { BadgeDialog, type BadgeSelection } from "@/components/gamification/badge-dialog";
import { BadgeRow } from "@/components/ui/badge-row";
import { Eyebrow } from "@/components/ui/text";
import { BADGE_CATALOG } from "@/lib/gamification/badges";
import type { EarnedBadge } from "@/lib/gamification/schemas";

/**
 * The shelf: what has been earned, then what is still out there.
 *
 * A ruled list rather than F9 §10.3's 3-column chip grid — [R18] and F2's kit
 * settled that, and for the reason F2 gave: the roadmap's titles run to "No
 * Weekend Without Ration Card", which stops being a chip somewhere around the
 * third word.
 *
 * Three things are deliberately absent:
 *
 *  - **No "5 / 14" counter.** That is a completion metric, and it turns a shelf
 *    into a checklist.
 *  - **No padlock, no `???`, no blur** on the unearned rows. They are empty
 *    places on a shelf, not locked content — a user should be able to read
 *    "Leap Year Lexicographer" and work out that a leap day will do it.
 *  - **No filter, no sort control.** The shelf is a shelf.
 *
 * **Tapping a row opens its medal** (F13). The three absences above survive that
 * change and are strengthened by it: the dialog states the rule in the present
 * tense and stops — no countdown, no "come back on 2 September", no link to
 * /today, no progress toward anything. A shelf you walk over to and read is not
 * a checklist; a list that comes and finds you is, and F9 already removed the
 * pressure that would make one.
 *
 * The rows are `<button>`s wrapping the kit's `BadgeRow` rather than a new
 * `onClick` prop on it: the kit is frozen, and exactly one caller needs this
 * (F13 D6). `BadgeRow` is a full-width flex row and survives inside a
 * block-level button unchanged, at ~52px against LAYOUT.touchMin's 44.
 *
 * This is a client component, and it is the smallest unit that can be. Pushing
 * the boundary down to the rows would send the same prose through the RSC
 * payload on every request instead of into one cacheable chunk. `EarnedBadge` is
 * imported as a **type** — a value import of `earnedBadgeSchema` here is the
 * 73 kB mistake CLAUDE.md documents.
 */
export function BadgeShelf({
  badges,
  initialBadgeKey,
}: {
  badges: EarnedBadge[];
  /** /kitchen-sink only: opens one badge on load so the panel is reviewable. */
  initialBadgeKey?: string;
}) {
  const earnedByKey = new Map(badges.map((b) => [b.key, b]));
  const unearned = BADGE_CATALOG.filter((b) => !earnedByKey.has(b.key));

  const select = (key: string): BadgeSelection | null => {
    const entry = BADGE_CATALOG.find((b) => b.key === key);
    if (!entry) return null;
    const earned = earnedByKey.get(entry.key);
    return {
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
  };

  const [selection, setSelection] = useState<BadgeSelection | null>(() =>
    initialBadgeKey ? select(initialBadgeKey) : null,
  );

  return (
    <>
      <Eyebrow size="sm">Badges</Eyebrow>
      <ul className="flex shrink-0 list-none flex-col p-0 pt-2">
        {/* Earned first, most recent achievement at the top — the thing a
            returning user actually came to look at. Ordering is done in
            `getProfileStats`, on `lastAwardedOn`. */}
        {badges.map((badge) => (
          <li key={badge.key}>
            {/* The aria-label lives on the button, because that is now the thing
                with a role. */}
            <button
              type="button"
              className="w-full text-left"
              aria-label={`${badge.title}, earned ${badge.count} ${
                badge.count === 1 ? "time" : "times"
              }`}
              onClick={() => setSelection(select(badge.key))}
            >
              <BadgeRow label={badge.title} count={badge.count} />
            </button>
          </li>
        ))}
        {unearned.map((badge) => (
          <li key={badge.key}>
            <button
              type="button"
              className="w-full text-left"
              aria-label={`${badge.title}, not yet earned`}
              onClick={() => setSelection(select(badge.key))}
            >
              <BadgeRow label={badge.title} />
            </button>
          </li>
        ))}
      </ul>

      {/* One dialog instance, its content driven by the selected key — not
          fourteen, one per badge. Fourteen would put fourteen <img> elements in
          /profile's DOM whose fetch behaviour under `display: none` differs by
          engine. */}
      <BadgeDialog selection={selection} onClose={() => setSelection(null)} />
    </>
  );
}
