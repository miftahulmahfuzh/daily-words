import type { LocalDate } from '@/lib/time/local-date'

/**
 * Every URL into the **card** surface, in one file — the same rule
 * `lib/vocab/links.ts` states for `/vocab/[id]` and `lib/share/policy.ts` states
 * for `/s/[slug]`. A template literal in a second file is how it drifts.
 *
 * It is separate from `lib/share/policy.ts` deliberately, even though F18 D2's
 * `/card/[date]` exists *because* of sharing. `policy.ts` holds the URLs a
 * stranger can reach and is imported by the Edge middleware; this is an
 * authenticated app route behind `requireOnboardedUser()`. Putting an `(app)`
 * href in the module the middleware reads would blur the one distinction that
 * matters there.
 *
 * No imports beyond a type, because `calendar/month-view.tsx` is a client
 * component.
 */

/**
 * `/card/<YYYY-MM-DD>` — the owner's view of a day that happened (F18 D2).
 *
 * Before F18 the calendar had no destination for a past card:
 * `month-view.tsx` said so, and only `today_card` was ever a link. A past card is
 * the more interesting thing to share — it is a record of a day, which is what
 * [R1] protects — and the app could not display one.
 *
 * The segment is a `LocalDate` and nothing else. The route validates its shape
 * with a regex **before** anything calls `parseLocalDate`, which throws
 * `Not a LocalDate` and would turn a typo in the URL bar into a 500 where the
 * honest answer is a 404.
 */
export function cardPermalinkHref(date: LocalDate): string {
  return `/card/${date}`
}
