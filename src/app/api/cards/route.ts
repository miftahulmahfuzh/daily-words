import { requireApiUser } from "@/lib/api/guards";
import { fail, noStore, ok } from "@/lib/api/respond";
import {
  countActiveWords,
  createCard,
  getCardContext,
} from "@/lib/db/queries/cards";
import { onCardCreated, type CardCreatedEvent } from "@/lib/cards/hooks";
import {
  createCardRequestSchema,
  type CreateCardRequest,
  type CreateCardResponse,
} from "@/lib/cards/schemas";
import { toDailyCardPayload } from "@/lib/cards/serialize";
import { localDateNow, localDayOfWeek, localHour } from "@/lib/time/local-date";
import { LAYOUT } from "@/lib/ui/layout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The nudge. **The only path in the entire app that creates a card.**
 *
 * No cron, no `revalidate`, no creation on page load, no "make it for them if
 * they haven't by 9pm". Product principle 5: the deliberate act is the exercise,
 * so if this handler is not called, no card exists. If you find yourself writing
 * a scheduler, stop.
 *
 * The client sends no date, ever. `card_date` comes from this server's clock and
 * the profile's timezone, and nothing else.
 */

/**
 * `POST /api/cards` with no body at all is the normal case — the button sends
 * `{}`, and `curl -X POST` sends nothing. `readJson` would 400 the second, and
 * that endpoint has to stay curl-testable.
 */
async function readNudgeBody(
  req: Request,
): Promise<{ ok: true; data: CreateCardRequest } | { ok: false; response: Response }> {
  const raw = await req.text().catch(() => "");
  if (raw.trim() === "") return { ok: true, data: {} };

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, response: fail(400, "Body must be JSON", "invalid_json") };
  }

  const parsed = createCardRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: fail(400, "Could not read that request.", "invalid_body"),
    };
  }
  return { ok: true, data: parsed.data };
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const body = await readNudgeBody(req);
  if (!body.ok) return body.response;

  // Reads may fall back to a default zone; writes may not. A card written under
  // a guessed timezone is a wrong date in a permanent record and a wrong streak
  // forever after.
  const { timezone } = await getCardContext(userId);
  if (!timezone.ok) {
    return noStore(
      fail(409, "Set your timezone to start a card.", "timezone_missing"),
    );
  }

  const tz = timezone.timezone;
  const today = localDateNow(tz);

  const activeWordCount = await countActiveWords(userId);
  if (activeWordCount === 0) {
    // No `daily_cards` row, so the day stays a cross on the calendar. Nothing
    // happened, and the record says so.
    return noStore(fail(409, "No words yet. Add one to make a card.", "no_active_words"));
  }

  let outcome;
  try {
    outcome = await createCard(userId, today, tz);
  } catch (err) {
    console.error("[api/cards] create failed", { userId, today, err });
    return noStore(fail(500, "Couldn't make the card. Try again.", "internal"));
  }

  if (outcome.status === "no_active_words") {
    return noStore(fail(409, "No words yet. Add one to make a card.", "no_active_words"));
  }

  const card = outcome.card;

  if (outcome.status === "created") {
    const event: CardCreatedEvent = {
      userId,
      cardId: card.id,
      cardDate: card.cardDate,
      timezone: tz,
      createdAt: card.createdAt.toISOString(),
      localCreatedAtHour: localHour(card.createdAt, tz),
      // From the date string, not the instant: a weekday is a property of the
      // local calendar date, and deriving it this way is exact in every zone.
      localWeekday: localDayOfWeek(card.cardDate),
      itemCount: card.items.length,
      vocabEntryIds: card.items.map((item) => item.entryId),
      isFirstCardEver: outcome.isFirstCardEver,
    };

    // After the commit, and only on a genuine creation. Failure here must never
    // fail the request: the card exists and a streak can be recomputed, while
    // the reverse is not recoverable.
    try {
      await onCardCreated(event);
    } catch (err) {
      console.error("[api/cards] onCardCreated failed", { cardId: card.id, err });
    }
  }

  return noStore(
    ok<CreateCardResponse>({
      created: outcome.status === "created",
      card: toDailyCardPayload(card),
      underSupplied: card.items.length < LAYOUT.cardSize,
      activeWordCount,
      timezone: tz,
      timezoneMismatch:
        body.data.clientTimezone !== undefined && body.data.clientTimezone !== tz,
    }),
  );
}
