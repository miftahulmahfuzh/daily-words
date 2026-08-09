import { notFound } from "next/navigation";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { BackLink } from "@/components/layout/back-link";
import { DailyCard } from "@/components/daily/daily-card";
import { ShareButton } from "@/components/share/share-button";
import { Eyebrow } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/session";
import { toDailyCardItemView } from "@/lib/cards/serialize";
import { getCardForDate } from "@/lib/db/queries/cards";
import { getShareForEntity } from "@/lib/db/queries/shares";
import { env } from "@/lib/env";
import { shareHref, SHARE_CARD_ACTION_LABEL } from "@/lib/share/policy";
import { formatLocalDateLong, isLocalDate, type LocalDate } from "@/lib/time/local-date";

/**
 * A day that happened — **the app's first owner-side view of a past card**.
 *
 * Before F18 the calendar had nowhere to send one. `month-view.tsx` said so in a
 * comment: "there is no /calendar/[date] route in the roadmap's route map, so
 * every other day is a mark rather than a destination." A past card turned out
 * to be the more interesting thing to share — it is a record of a day, which is
 * exactly what [R1] protects — and the app could not display one.
 *
 * ## It scrolls, and that is what keeps it cheap
 *
 * `ScreenBody scroll` puts this screen **outside the no-scroll budget entirely**,
 * so it needs no new layout assertions and cannot regress the eighteen that
 * exist. It also means the Share control here is a full 44px target — which is
 * why it ended up being the *only* place a card is shared from: F18 D3 wanted a
 * 32px pill in `/today`'s header, the header was measured, and it wrapped. The
 * date on `/today` links here instead.
 *
 * ## What it deliberately does not have
 *
 * No streak pill, no day strip, no Delete (F18 Q3). It is a record of a day that
 * happened, and the only write it offers is Share/Unshare. Stated here so that a
 * later session does not "complete" it into a second `/today`.
 *
 * The rows keep `DailyCardRow`'s default href, which carries the `today`
 * origin, because the user *is* signed in here and the word they tap is their
 * own. Only the public card overrides it.
 *
 * That origin is a small lie on a *past* card, and a deliberate one: F11's
 * whitelist is a closed four-member union and back-from-a-word has to resolve to
 * a real destination. Adding a fifth origin for this screen means adding a row
 * to `BACK_TARGETS` in `lib/vocab/links.ts`, not a template literal here —
 * recorded so the next reader knows it was seen rather than missed.
 */
export const dynamic = "force-dynamic";

export default async function CardPermalinkPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const user = await requireUser();
  const { date } = await params;

  /**
   * Validated **before** the string reaches the database. The same discipline
   * `/journal/[id]` keeps with `z.uuid().safeParse(id)`, for the same reason: a
   * malformed id must never reach a typed column, where it is a cast error and a
   * 500 rather than the honest 404.
   *
   * `isLocalDate`, **not** a `/^\d{4}-\d{2}-\d{2}$/` test. This route shipped
   * with the regex and `2026-13-99` walked straight through it into a `date`
   * comparison and a 500 — a shape is not a date. See that function for the
   * round trip that makes the difference.
   */
  if (!isLocalDate(date)) notFound();
  const cardDate: LocalDate = date;

  // Scoped to the session user, so one user cannot see another's day — and a
  // well-formed date with no card is the same 404 as a malformed one.
  const card = await getCardForDate(user.id, cardDate);
  if (!card) notFound();

  const share = await getShareForEntity(user.id, "card", card.id);

  return (
    <Screen>
      <ScreenBody scroll padded={false} className="px-[var(--gutter)] pb-7">
        <BackLink href="/calendar" label="Calendar" />

        <div className="pt-3">
          <Eyebrow>{formatLocalDateLong(cardDate)}</Eyebrow>
          <h1 className="m-0 pt-[3px] text-2xl font-normal tracking-title">
            {card.items.length === 1 ? "One word" : `${card.items.length} words`}
          </h1>
        </div>

        {/* `flex-none` with a floor, not `flex-1`: inside a scrolling pane
            `flex-1` against `min-h-0` gives rows their content height, which is
            unpredictable. The same reasoning as the public card, and the same
            number, so the two views of one day cannot drift apart. */}
        <DailyCard
          items={card.items.map(toDailyCardItemView)}
          className="mt-4 min-h-[396px] flex-none"
        />

        <ShareButton
          entityType="card"
          entityId={card.id}
          /* The date, never a name. It is what a share sheet shows above the
             link, and it is the only honest one-line description of a day. */
          title={formatLocalDateLong(cardDate)}
          label={SHARE_CARD_ACTION_LABEL}
          initialSlug={share?.slug ?? null}
          initialUrl={share ? `${env.APP_URL}${shareHref(share.slug)}` : null}
        />
      </ScreenBody>
    </Screen>
  );
}
