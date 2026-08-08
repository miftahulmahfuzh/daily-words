import { Screen, ScreenBody } from "@/components/layout/screen";
import {
  buildMonthDays,
  isCardDay,
  isMarkable,
  resolveAnchor,
} from "@/lib/cards/calendar";
import type { CalendarResponse } from "@/lib/cards/schemas";
import { requireUser } from "@/lib/auth/session";
import {
  getCardContext,
  getCardDatesBetween,
  getFirstCardDate,
} from "@/lib/db/queries/cards";
import { localDateNow, localMonthOf, localMonthRange } from "@/lib/time/local-date";
import { MonthView } from "./month-view";

/**
 * The month of ticks and crosses.
 *
 * The current local month is rendered server-side — no page in this app fetches
 * its own first paint — and `MonthView` takes over from there. `/calendar` may
 * scroll; the no-scroll rule is /today's alone.
 */
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await requireUser();

  const { timezone, profileCreatedAt } = await getCardContext(user.id);
  const tz = timezone.timezone;
  const today = localDateNow(tz);
  const month = localMonthOf(today);

  const { start, end } = localMonthRange(month);
  const [firstCardDate, cardDates] = await Promise.all([
    getFirstCardDate(user.id),
    getCardDatesBetween(user.id, start, end),
  ]);

  const anchor = resolveAnchor(firstCardDate, profileCreatedAt, tz);
  const days = buildMonthDays(month, { today, anchor, cardDates: new Set(cardDates) });

  // The same shape the route returns, so the first paint and every later month
  // go through one code path in the client.
  const initial: CalendarResponse = {
    month,
    timezone: tz,
    today,
    anchor,
    cardCount: days.filter((d) => isCardDay(d.state)).length,
    markableCount: days.filter((d) => isMarkable(d.state)).length,
    days,
  };

  return (
    <Screen tabs>
      <ScreenBody scroll>
        <MonthView initial={initial} />
      </ScreenBody>
    </Screen>
  );
}
