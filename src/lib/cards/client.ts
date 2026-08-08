import { request, type ApiResult } from "@/lib/api/client";
import type { CalendarResponse, CreateCardResponse } from "@/lib/cards/schemas";
import { detectTimeZone } from "@/lib/profile/timezone";

/**
 * The browser half of F5's two routes. Types only — the zod schemas stay on the
 * server; see the note in `@/lib/api/client`.
 *
 * There are exactly two client interactions in this feature: pressing the nudge,
 * and stepping the calendar a month. Everything else on /today and /calendar is
 * rendered server-side from `lib/db/queries/cards.ts`, so no page fetches its
 * own first paint.
 */

/**
 * Press the button. The only way a card is ever created.
 *
 * `clientTimezone` is advisory: the server computes `card_date` from the
 * profile zone and its own clock, and only reports back whether the browser
 * disagrees. Sending it costs nothing and makes "why is my card on the wrong
 * day?" answerable.
 */
export function createCard(
  clientTimezone?: string,
): Promise<ApiResult<CreateCardResponse>> {
  return request("/api/cards", "POST", clientTimezone ? { clientTimezone } : {});
}

/** `month` is 'YYYY-MM'. The server decides what "today" means, not the caller. */
export function fetchCalendarMonth(month: string): Promise<ApiResult<CalendarResponse>> {
  return request(`/api/cards/calendar?month=${encodeURIComponent(month)}`, "GET");
}

/**
 * The browser's own guess at its zone. Advisory input to `createCard` only.
 *
 * Delegates to F7's `detectTimeZone()` rather than repeating the try/catch: two
 * copies of "what does this browser think its zone is" is two answers waiting to
 * disagree. The `undefined` return is kept because `createCardRequestSchema`
 * treats the field as optional, not nullable.
 */
export function detectTimezone(): string | undefined {
  return detectTimeZone() ?? undefined;
}
