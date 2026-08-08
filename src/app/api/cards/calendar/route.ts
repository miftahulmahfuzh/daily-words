import { requireApiUser } from "@/lib/api/guards";
import { fail, noStore, ok } from "@/lib/api/respond";
import {
  buildMonthDays,
  isCardDay,
  isMarkable,
  resolveAnchor,
} from "@/lib/cards/calendar";
import { calendarQuerySchema, type CalendarResponse } from "@/lib/cards/schemas";
import {
  getCardContext,
  getCardDatesBetween,
  getFirstCardDate,
} from "@/lib/db/queries/cards";
import { localDateNow, localMonthRange } from "@/lib/time/local-date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One month of ticks and crosses. Exists only because month navigation is a
 * client interaction — `/calendar` renders its first month server-side.
 *
 * An empty month is never a 404 and never an error: a month with no cards is a
 * month of crosses, or of nothing at all if it predates the user. Only a
 * malformed `?month=` fails, because silently reinterpreting one would show a
 * different month than the arrows say.
 */
export async function GET(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const params = new URL(req.url).searchParams;
  const query = calendarQuerySchema.safeParse({ month: params.get("month") ?? "" });
  if (!query.success) return noStore(fail(400, "Could not read that month.", "bad_month"));
  const month = query.data.month;

  // Reads fall back to the default zone rather than refusing: a wrong-looking
  // date for one session beats a blank screen. Historical `card_date` values are
  // already stored and are displayed as they were written.
  const { timezone, profileCreatedAt } = await getCardContext(userId);
  const tz = timezone.timezone;
  const today = localDateNow(tz);

  const { start, end } = localMonthRange(month);
  const [firstCardDate, cardDates] = await Promise.all([
    getFirstCardDate(userId),
    getCardDatesBetween(userId, start, end),
  ]);

  const anchor = resolveAnchor(firstCardDate, profileCreatedAt, tz);
  const days = buildMonthDays(month, { today, anchor, cardDates: new Set(cardDates) });

  return noStore(
    ok<CalendarResponse>({
      month,
      timezone: tz,
      today,
      anchor,
      cardCount: days.filter((d) => isCardDay(d.state)).length,
      // Derived from the states rather than re-deriving the predicate: the two
      // could otherwise disagree, and the ratio under the grid is the one number
      // on that screen a user might feel judged by.
      markableCount: days.filter((d) => isMarkable(d.state)).length,
      days,
    }),
  );
}
