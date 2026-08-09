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
 *  - **No "5 / 13" counter.** That is a completion metric, and it turns a shelf
 *    into a checklist.
 *  - **No padlock, no `???`, no blur** on the unearned rows. They are empty
 *    places on a shelf, not locked content — a user should be able to read
 *    "Leap Year Lexicographer" and work out that a leap day will do it.
 *  - **No filter, no sort control.** The shelf is a shelf.
 *
 * Tapping a row does nothing in v0.1.0.
 */
export function BadgeShelf({ badges }: { badges: EarnedBadge[] }) {
  const earnedKeys = new Set(badges.map((b) => b.key));
  const unearned = BADGE_CATALOG.filter((b) => !earnedKeys.has(b.key));

  return (
    <>
      <Eyebrow size="sm">Badges</Eyebrow>
      <ul className="flex shrink-0 list-none flex-col p-0 pt-2">
        {/* Earned first, most recent achievement at the top — the thing a
            returning user actually came to look at. Ordering is done in
            `getProfileStats`, on `lastAwardedOn`. */}
        {badges.map((badge) => (
          <li
            key={badge.key}
            aria-label={`${badge.title}, earned ${badge.count} ${
              badge.count === 1 ? "time" : "times"
            }`}
          >
            <BadgeRow label={badge.title} count={badge.count} />
          </li>
        ))}
        {unearned.map((badge) => (
          <li key={badge.key} aria-label={`${badge.title}, not yet earned`}>
            <BadgeRow label={badge.title} />
          </li>
        ))}
      </ul>
    </>
  );
}
