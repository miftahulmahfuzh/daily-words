import { notFound } from "next/navigation";
import { SharedWord } from "@/components/share/shared-word";
import { shareClaimHref } from "@/lib/share/policy";
import type { SharedWordPayload } from "@/lib/share/schemas";

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

export default async function KitchenSinkSharePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { state } = await searchParams;
  const payload = STATES[state ?? "short"] ?? SHORT;

  // Through the policy module, never a template literal: share URLs have exactly
  // one home, and `share:check` fails if a second file builds one.
  return <SharedWord payload={payload} claimHref={shareClaimHref(FIXTURE_SLUG)} />;
}
