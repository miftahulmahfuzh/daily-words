import { notFound } from "next/navigation";
import { SharedCard } from "@/components/share/shared-card";
import { SharedJournal } from "@/components/share/shared-journal";
import { SharedWord } from "@/components/share/shared-word";
import { shareClaimHref } from "@/lib/share/policy";
import type {
  SharedCardPayload,
  SharedJournalPayload,
  SharedWordPayload,
} from "@/lib/share/schemas";

/**
 * The public share page under worst-case content, for review at 375px and for
 * `tests/e2e/share-frame.spec.ts` to measure.
 *
 * Not the real screen: that needs a `shares` row. What is reviewable without one
 * is the frame, which is where this page can go wrong silently — it is the only
 * screen in the app with no tab bar, no header and one pinned action, so
 * "does the CTA stay inside the viewport" has no other screen to inherit an
 * answer from.
 *
 * `?state=short` (the default) is an ordinary word; `long` is the claim under
 * test — a 21-character unbreakable term and three 134-character examples,
 * because the assertion is that **no string can make the page scroll**;
 * `noexamples` is the pending-ish shape where the heading must be absent rather
 * than standing over nothing.
 *
 * **F18 added `?kind=`.** `word` (the default) keeps every existing state and
 * every existing assertion; `card` draws the shared daily card, which is the one
 * public page with a row floor to clear and the one that must not grow a tab
 * bar; `journal` draws the shared line, its insight and the sign-up CTA.
 *
 * `?n=` sets the card's word count so the spec can drive a short card, and the
 * sixth word is deliberately left un-enriched at `n=6` so the skeleton state is
 * reviewable — a card is at its most shareable on the day it was made, which is
 * exactly when a word added minutes earlier is still being looked up.
 *
 * The claim href points at a fixture slug and goes nowhere. This page mints no
 * share and writes nothing.
 */

const FIXTURE_SLUG = "0123456789abcdef";

const SHORT: SharedWordPayload = {
  kind: "vocab",
  term: "genteel",
  pronunciation: "/dʒɛnˈtiːl/",
  partOfSpeech: "adjective",
  definition: "polite in a way that is trying too hard",
  examples: [
    "His genteel manners fooled nobody at the table.",
    "A genteel poverty, kept up for the neighbours.",
  ],
};

/**
 * The worst case, and it is deliberately worse than anything the app has
 * produced: a 21-character unbreakable term, and three examples near 190
 * characters. F2's obligation on F3 caps a *definition* at 60 characters, but
 * nothing caps an example — they come from the model — so the length that has to
 * hold is the length nobody promised not to exceed.
 *
 * It is also sized to genuinely overflow the pane at 375×667, which
 * `share-frame.spec.ts` asserts before it asserts anything else: a fixture that
 * fits makes "the page does not scroll" a claim about nothing.
 */
const LONG: SharedWordPayload = {
  kind: "vocab",
  term: "circumlocutionariness",
  pronunciation: "/ˌsɜːkəmləkjuːˈʃənərinəs/",
  partOfSpeech: "adjective",
  definition: "using far more words than the thing being said could ever need",
  examples: [
    "The quarterly report was circumlocutionary in a way that made the single number it actually contained almost impossible to find anywhere in it, which was very probably the point of writing it that way.",
    "She gave a circumlocutionary answer to a question that had been asked perfectly plainly, and every person in the room understood at once that she was not going to be answering it today or on any other day.",
    "His circumlocutionary style survived every round of editing, because each individual sentence was defensible on its own terms and it was only the whole thing, read end to end, that became unbearable.",
  ],
};

const NO_EXAMPLES: SharedWordPayload = {
  kind: "vocab",
  term: "tacit",
  pronunciation: null,
  partOfSpeech: null,
  definition: "understood without being said",
  examples: [],
};

const STATES: Record<string, SharedWordPayload> = {
  short: SHORT,
  long: LONG,
  noexamples: NO_EXAMPLES,
};

/**
 * A card whose sixth word is still enriching — `definition: null`, which draws
 * F5's skeleton rather than an empty line or the string "null".
 *
 * The terms are the same hostile lengths `/kitchen-sink/today` uses, because the
 * rows are the same component and the claim being tested is the same one: no
 * string can change a row's height.
 */
const CARD_TERMS = [
  "antidisestablishmentarianism",
  "circumlocutionariness",
  "genteel",
  "truculent",
  "perspicacious",
  "sesquipedalian",
];

const CARD_DEFINITION =
  "a way of speaking that goes all the way round the point before arriving at it, if it arrives at all";

function cardFixture(n: number): SharedCardPayload {
  return {
    kind: "card",
    cardDate: "2026-08-09",
    dateLabel: "9 August 2026",
    words: Array.from({ length: n }, (_, i) => ({
      position: i + 1,
      term: CARD_TERMS[i],
      pronunciation: "/dʒɛnˈtiːl/",
      partOfSpeech: "adjective",
      // The last row of a full card is left pending on purpose. See above.
      definition: i === 5 ? null : CARD_DEFINITION,
      examples: [],
    })),
  };
}

const JOURNAL: SharedJournalPayload = {
  kind: "journal",
  text: "Ibu used to say that a house with no rice smells of nothing at all, and I did not understand her until the year I lived alone.",
  dateLabel: "3 Aug 2026",
  insight: {
    meaning:
      "An absence is quieter than a presence, and it is usually only noticed by somebody who once had the thing and then did not.",
    whenItApplies: [
      "Moving out of a family home for the first time.",
      "Realising a habit mattered only after it stopped.",
      "Explaining to someone why a small routine is not small.",
    ],
  },
};

export default async function KitchenSinkSharePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; kind?: string; n?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { state, kind, n } = await searchParams;

  if (kind === "card") {
    const count = Math.min(Math.max(Number(n ?? 6), 1), 6);
    return (
      <SharedCard
        payload={cardFixture(count)}
        slug={FIXTURE_SLUG}
        /* Pinned, not `localDateNow()`: a fixture whose freshness line changed
           with the wall clock would make the spec flaky and the review
           unrepeatable. Two days after the card, so the label is the `older`
           arm rather than either special case. */
        today="2026-08-11"
      />
    );
  }

  if (kind === "journal") return <SharedJournal payload={JOURNAL} />;

  const payload = STATES[state ?? "short"] ?? SHORT;

  // Through the policy module, never a template literal: share URLs have exactly
  // one home, and `share:check` fails if a second file builds one.
  return <SharedWord payload={payload} claimHref={shareClaimHref(FIXTURE_SLUG)} />;
}
