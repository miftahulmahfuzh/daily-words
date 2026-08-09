import type { DailyCardItemView } from '@/lib/ui/types'
import type { SharedCardPayload } from '@/lib/share/schemas'
import { partOfSpeechTag } from '@/lib/vocab/format'
import { diffLocalDays, type LocalDate } from '@/lib/time/local-date'

/**
 * The **second** narrowing: snapshot → what the shared card's list page renders.
 *
 * `lib/share/serialize.ts` answers "row → what a stranger may see"; this answers
 * "of that, what does the list page need". They point in opposite directions and
 * are kept apart for that reason.
 *
 * It exists because of a fact about React Server Components that is easy to miss:
 * a server component's props are serialised into the flight stream, so handing
 * `SharedCard` the whole payload would ship all six words' pronunciations and
 * examples to a viewer who has tapped nothing. F18 D1 rejected an accordion
 * partly on that ground — "it would put all six words' full enrichment payloads
 * in the first paint whether or not anyone taps a row" — and the same argument
 * applies to a list page that merely *holds* them.
 *
 * Nothing here is a safety boundary. The payload carries no uuid and nothing
 * private; every word behind it is one tap away at `/s/<slug>/<n>` anyway. This
 * is a bandwidth decision, stated so the next reader does not mistake it for a
 * privacy one and "simplify" it back.
 *
 * Pure and dependency-light on purpose: `share:check` drives both functions with
 * no database, no clock of its own and no route.
 */

/* ----------------------------------- Rows ----------------------------------- */

/**
 * The kit's row shape, filled from a snapshot.
 *
 * **`id` is the synthetic string `"p1"`…`"p6"`, and that is belt and braces.**
 * `DailyCardRow`'s default href reads `item.id`, so a refactor that dropped
 * F18's `hrefFor` prop would silently start building `/vocab/<id>` out of
 * whatever this field holds. With a position in it the worst outcome is a broken
 * link to `/vocab/p3`; with a uuid in it the worst outcome is a leaked uuid on a
 * page served to strangers. `share:check` asserts no uuid-shaped string appears
 * anywhere in these props.
 */
export function toCardListWords(payload: SharedCardPayload): DailyCardItemView[] {
  return payload.words.map((word) => ({
    id: `p${word.position}`,
    term: word.term,
    // Null while the sharer's word was still being looked up, which draws F5's
    // skeleton — the same rule `toDailyCardItemView` applies on /today.
    definition: word.definition,
    tag: partOfSpeechTag(word.partOfSpeech),
  }))
}

/* --------------------------------- Freshness -------------------------------- */

/**
 * How old is this card? A bounded shape, never a raw timestamp (F18 D8).
 */
export type CardFreshness =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'older'; daysAgo: number }

/**
 * The one question on a shared card that genuinely needs a clock.
 *
 * **The sharer's timezone is not in the snapshot** (D8 excludes it: it is a
 * location signal about a person a stranger is not owed), so `today` is computed
 * in `DEFAULT_TIMEZONE` by the caller. That is a *read* falling back to a
 * default, which CLAUDE.md permits in as many words — "reads may fall back to a
 * default timezone; **writes may not**" — and the cost of being wrong is one word
 * on a relative-date line for a few hours a day, against a `dateLabel` beside it
 * that is exact and needs no zone at all.
 *
 * F18 D7 wrote this as `localDateNow(card.timezone ?? DEFAULT_TIMEZONE)`, which
 * would have required carrying the zone across. The date the line is *about* is
 * unaffected either way; only the word "yesterday" is.
 *
 * A card dated after the viewer's today — possible when the sharer's zone is a
 * day ahead — reads as `today` rather than as a negative number. There is no
 * honest label for a card from tomorrow.
 */
export function cardFreshness(cardDate: LocalDate, today: LocalDate): CardFreshness {
  const days = diffLocalDays(cardDate, today)
  if (days <= 0) return { kind: 'today' }
  if (days === 1) return { kind: 'yesterday' }
  return { kind: 'older', daysAgo: days }
}

/**
 * The line as drawn. Lower case, because it sits in the same mono meta row as
 * the date and is a qualifier rather than a heading.
 *
 * **Never "Today".** "Today" is the viewer's word for the viewer's day, and the
 * card is the sharer's day — so the freshness line says "today" in the same
 * breath as a date that says which one, and the page never claims the day is
 * yours.
 */
export function freshnessLabel(freshness: CardFreshness): string {
  switch (freshness.kind) {
    case 'today':
      return 'today'
    case 'yesterday':
      return 'yesterday'
    case 'older':
      return `${freshness.daysAgo} days ago`
  }
}
