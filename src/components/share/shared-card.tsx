import { Screen, ScreenBody } from "@/components/layout/screen";
import { DailyCard } from "@/components/daily/daily-card";
import { Eyebrow, Meta } from "@/components/ui/text";
import { cardFreshness, freshnessLabel, toCardListWords } from "@/lib/share/card-view";
import { sharedCardWordHref, SHARE_BRAND_EYEBROW } from "@/lib/share/policy";
import type { SharedCardPayload } from "@/lib/share/schemas";
import type { LocalDate } from "@/lib/time/local-date";

/**
 * A day, as a stranger sees it. Six words, and each one opens.
 *
 * Server-safe and fixture-drivable, like `SharedWord`: it takes a payload, a
 * slug and a date, and reads nothing else — which is what lets
 * `/kitchen-sink/share` drive it with no database.
 *
 * ## The vertical budget here is not /today's
 *
 * `/today`'s six rows are `flex: 1 1 0` inside a `flex-1` card inside a
 * **non-scrolling** pane; that is [R19]'s structural no-scroll guarantee, and it
 * only works because the pane's height is bounded. This page has no tab bar
 * (+61px), no day strip (+91.8px) and no `ScreenHeader` — and it is allowed to
 * scroll.
 *
 * So the card is given `min-h-[396px] flex-none`. Both halves matter:
 *
 *   - `flex-none` and `flex-1` are the same `tailwind-merge` group, so this
 *     genuinely *replaces* the card's `flex-1` rather than sitting beside it.
 *   - inside a scroll container, `flex-1` against `min-h-0` gives rows their
 *     content height, which is unpredictable; `min-h-[396px]` restores a
 *     deterministic ~65px per row, which is what the row floor was measured at.
 *
 * That is arithmetic where [R19] preferred structure, and it is a deliberate
 * narrow exception (F18 R8): if the card looks wrong on a tall device the fix is
 * a `min-h`/`max-h` pair, **not** a return to `flex-1` inside a scroll container.
 *
 * ## Three absences, all decisions
 *
 * - **No tab bar.** Four tabs that all bounce to /signin are a trap, not
 *   navigation. `share-frame.spec.ts` asserts it is not in the DOM.
 * - **No `BackLink`.** The viewer arrived from a message; there is nowhere back.
 * - **No sharer.** No name, no avatar, no "shared by" (F18 Q2). The sharer's
 *   name is in the message they sent alongside the link, which is enough.
 *
 * ## And no CTA of its own, which is the fourth
 *
 * `SharedWord` pins **Practise this word** to the foot of its pane because that
 * page is about one word and there is exactly one thing to offer. A card is six
 * words, so the same button here would have to mean "practise… which?" — and the
 * answer is the row the viewer taps. The rows *are* the call to action, and the
 * CTA lives one level down at `/s/<slug>/<n>`, where it names a word.
 *
 * The alternative — inventing a "Start your own list" button for this page — is
 * copy nobody asked for on a page whose job the user stated plainly: "viewers
 * can also click the row to show the detailed vocab and click practise this
 * word". The roadmap forbids filler, and a button that goes somewhere a stranger
 * cannot use is worse than no button.
 */
export function SharedCard({
  payload,
  slug,
  /**
   * The viewer's today, computed by the route in `DEFAULT_TIMEZONE`.
   *
   * Passed in rather than read here, because a component that called
   * `localDateNow()` itself would be a clock inside a fixture-driven view and
   * `/kitchen-sink/share` could not pin it. See `cardFreshness` for why the
   * sharer's own zone is not available to use instead.
   */
  today,
}: {
  payload: SharedCardPayload;
  slug: string;
  today: LocalDate;
}) {
  const words = toCardListWords(payload);
  const freshness = cardFreshness(payload.cardDate, today);

  return (
    <Screen>
      <ScreenBody scroll padded={false} className="px-6 pb-7">
        {/* The only branding on the page, and the only answer a stranger has to
            "what is this?" */}
        <Eyebrow>{SHARE_BRAND_EYEBROW}</Eyebrow>

        {/* Never "Today". "Today" is the viewer's word for the viewer's day, and
            this is the sharer's day — already formatted at share time, pinned to
            UTC, so a viewer in Los Angeles and a viewer in Jakarta read the same
            string (D7). */}
        <h1 className="m-0 pt-2 text-2xl font-normal tracking-title text-pretty">
          {payload.dateLabel}
        </h1>

        <div className="flex items-baseline gap-2 pt-1.5 pb-4">
          <Meta className="tracking-[0.1em]">{freshnessLabel(freshness)}</Meta>
        </div>

        <DailyCard
          items={words}
          /* The one caller that overrides the row href. `/vocab/[id]` is inside
             the `(app)` group and would bounce this visitor to /signin;
             `/s/<slug>/<n>` is the same share, one level down.

             Keyed off `payload.words[i].position` rather than `i + 1`: the
             position is what the slug authorises, and the two agree today only
             because `daily_card_items.position` is contiguous by contract. */
          hrefFor={(_item, i) => sharedCardWordHref(slug, payload.words[i].position)}
          className="min-h-[396px] flex-none"
        />
      </ScreenBody>
    </Screen>
  );
}
