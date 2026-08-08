import type { CardWithItems } from "@/lib/db/queries/cards";
import type { DailyCardPayload } from "@/lib/cards/schemas";
import type { DailyCardItemView } from "@/lib/ui/types";
import { partOfSpeechTag } from "@/lib/vocab/format";

/** Row → wire, and row → view. The client never sees `user_id` or the row ids. */

export function toDailyCardPayload(card: CardWithItems): DailyCardPayload {
  return {
    id: card.id,
    cardDate: card.cardDate,
    // The only `toISOString` in the app outside the tz module, and it serialises
    // an *instant*, never a day. `cardDate` beside it is the day, computed in
    // the user's zone. Slicing ten characters off this string would give the UTC
    // date, which is a different day for most of the world for most of the day.
    createdAt: card.createdAt.toISOString(),
    items: card.items.map((item) => ({
      position: item.position,
      entryId: item.entryId,
      term: item.term,
      partOfSpeech: item.partOfSpeech,
      definition: item.definition,
      enrichmentStatus: item.enrichmentStatus,
    })),
  };
}

/**
 * Card row → the kit's view shape.
 *
 * `id` is the **vocab entry** id, because that is what the row links to and what
 * `/vocab/[id]` expects — the `daily_card_items` id is bookkeeping and never
 * leaves the server.
 *
 * `definition` is passed through as null when enrichment has not landed. The row
 * draws a placeholder inside the same line box rather than collapsing, so a word
 * still being looked up does not resize its own row.
 */
export function toDailyCardItemView(item: CardWithItems["items"][number]): DailyCardItemView {
  return {
    id: item.entryId,
    term: item.term,
    definition: item.enrichmentStatus === "ready" ? item.definition : null,
    tag: partOfSpeechTag(item.partOfSpeech),
  };
}
