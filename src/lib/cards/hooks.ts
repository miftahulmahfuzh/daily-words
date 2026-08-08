import "server-only";

/**
 * The seam F9 attaches to. ROADMAP [R15]: this hook is F5's, and F9 replaces the
 * body of `onCardCreated` rather than touching card creation.
 *
 * F5 never imports F9; F9 never imports F5's creation logic. That is the whole
 * contract, and it is what keeps "the card was made" independent of "the streak
 * was counted" — the first is a fact about a day, the second is arithmetic over
 * facts, and arithmetic can always be redone.
 */

export type CardCreatedEvent = {
  userId: string;
  cardId: string;
  /**
   * User-local calendar date of the card, 'YYYY-MM-DD'. The authoritative date
   * for streaks and every date-triggered badge. **Never re-derive this from
   * `createdAt`** — a card made at 00:05 in Auckland on 1 January was created at
   * 11:05 UTC on 31 December, and UTC arithmetic would award `year_end` where
   * the correct badge is `new_year`.
   */
  cardDate: string;
  /** IANA zone actually used to compute `cardDate`. */
  timezone: string;
  /** ISO instant, UTC, of the insert. */
  createdAt: string;
  /** 0–23 in the user's zone. Drives `midnight_oil` (local hour < 4, [R12]). */
  localCreatedAtHour: number;
  /** 0 = Sunday … 6 = Saturday, in the user's zone. Drives `sunday`, `fathers_day`. */
  localWeekday: number;
  /** Number of daily_card_items written (1–6). */
  itemCount: number;
  /** Entry ids placed on the card, in position order. */
  vocabEntryIds: string[];
  /** True when this is the user's first card ever. Drives `first_card`. */
  isFirstCardEver: boolean;
};

/**
 * Called exactly once per genuinely created card, AFTER the transaction commits.
 * NOT called when the nudge hits an existing card (`created: false`).
 *
 * Contract for F9, which replaces this body:
 *  - Must not throw. The call site wraps this in try/catch and swallows, but a
 *    hook that throws on every card is silent breakage — handle your own errors.
 *  - Must be idempotent per `cardId`. Retries and duplicate delivery are possible.
 *  - Must not mutate `daily_cards` or `daily_card_items`.
 *  - May add OPTIONAL fields to `CardCreatedEvent`. May not remove or repurpose
 *    existing ones.
 *
 * Everything except `full_week` is decidable from this payload alone; that one
 * queries card history itself.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- F9 fills this in.
export async function onCardCreated(_event: CardCreatedEvent): Promise<void> {
  // no-op in F5. Streaks, levels and badges are F9's.
}
