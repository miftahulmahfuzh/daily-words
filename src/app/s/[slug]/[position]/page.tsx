import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedWord } from "@/components/share/shared-word";
import { env } from "@/lib/env";
import {
  parseSharePosition,
  sharedCardWordHref,
  shareClaimHref,
  SHARE_GONE_TITLE,
  SHARE_META_FALLBACK,
} from "@/lib/share/policy";
import type { SharedCardPayload, SharedCardWord } from "@/lib/share/schemas";
import { readShare, SHARE_ROBOTS } from "../read";

/**
 * One word of a shared card. **The only new public segment F18 adds.**
 *
 * ## What the slug authorises, and how that is enforced
 *
 * `/s/<slug>` is a `daily_cards` row; `/s/<slug>/<1..6>` is one of the at-most-six
 * words on it. One tap on Share mints exactly one `shares` row and exposes seven
 * URLs, and one `DELETE` kills all seven.
 *
 * The bound is structural rather than a check somebody could forget:
 *
 *   1. **The position is parsed before it reaches anything.**
 *      `parseSharePosition` accepts exactly `"1"`…`"6"` and rejects `"0"`, `"7"`,
 *      `"01"`, `"+1"`, `" 1"`, `"1.5"`, `"1e0"`, `""` and anything uuid-shaped.
 *      A rejected position is `notFound()`, the same discipline
 *      `/journal/[id]`'s `z.uuid().safeParse(id)` keeps for the same reason.
 *   2. **There is no function in this path that can express a vocab uuid.** The
 *      word is looked up by index into a snapshot that has no uuids in it, so
 *      "pass the wrong id" is not a mistake this code is capable of making.
 *   3. **It reads no user-owned table.** `readShare` goes through
 *      `getShareBySlug`, whose file `share:check` greps for the names of
 *      user-owned tables. The words are on the share row.
 *
 * A slug plus a raw vocab uuid would have been the obvious alternative and was
 * rejected outright: it turns a card share into a capability to *name* a word,
 * and the only thing between that and reading arbitrary words is a join the next
 * refactor can drop. A bounded index into a specific card cannot be pointed
 * anywhere.
 *
 * ## The middleware
 *
 * `isPublicSharePath` had to be widened for this route, and forgetting to would
 * have failed invisibly: every row of a shared card would bounce a stranger to
 * `/signin` while rendering perfectly for the signed-in author. That widening
 * stays an enumeration — `claim` or a position — because "any fourth segment"
 * is how the exemption stops meaning anything.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string; position: string }> };

/**
 * Resolve to the one word, or to nothing. Three ways to get nothing, and they
 * are the same 404 on purpose (F16 D13): the slug is unknown or revoked, the
 * share is not a card, or the card is shorter than the position asked for.
 *
 * A card share whose fifth word is requested when only four exist is not an
 * error worth distinguishing — telling those apart tells a slug-guesser how many
 * words are behind a link they have not seen.
 */
async function readCardWord(
  slug: string,
  rawPosition: string,
): Promise<{ payload: SharedCardPayload; word: SharedCardWord } | null> {
  const position = parseSharePosition(rawPosition);
  if (position === null) return null;

  const payload = await readShare(slug);
  if (!payload || payload.kind !== "card") return null;

  // Found by its own `position` field rather than by array index. They agree
  // today because `daily_card_items.position` is 1-based and contiguous by
  // contract, and this does not depend on that continuing to be true.
  const word = payload.words.find((w) => w.position === position);
  return word ? { payload, word } : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, position } = await params;
  const found = await readCardWord(slug, position);

  if (!found) {
    return { title: `${SHARE_GONE_TITLE} — Daily Words`, robots: SHARE_ROBOTS };
  }

  const title = `${found.word.term} — Daily Words`;
  const description = found.word.definition ?? SHARE_META_FALLBACK;

  return {
    title,
    description,
    robots: SHARE_ROBOTS,
    openGraph: {
      title,
      description,
      type: "article",
      // Through the policy module, never a template literal: share URLs have
      // exactly one home and `share:check` fails if a second file builds one.
      url: `${env.APP_URL}${sharedCardWordHref(slug, found.word.position)}`,
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function SharedCardWordPage({ params }: Params) {
  const { slug, position } = await params;
  const found = await readCardWord(slug, position);
  if (!found) notFound();

  const { payload, word } = found;

  return (
    <SharedWord
      /**
       * The card's word narrowed to the vocab payload's five fields — the same
       * component `/s/<slug>` renders for a vocab share, not a copy of it. Two
       * near-identical word pages would drift, and only one of them would be the
       * one `share-frame.spec.ts` measures.
       */
      payload={{
        term: word.term,
        pronunciation: word.pronunciation,
        partOfSpeech: word.partOfSpeech,
        definition: word.definition,
        examples: word.examples,
      }}
      /* Which day this word came from, so a forwarded `/s/<slug>/3` still says
         what it is. Never the sharer's name. */
      eyebrow={payload.dateLabel}
      claimHref={shareClaimHref(slug)}
      /**
       * The whole of F18's ask on F17. The index rides to the claim route as
       * `?w=`, which moves it inside the signed `dw_claim` cookie — never onto
       * `/claim`, whose path F17 froze to a literal so that no user-derived
       * string is ever concatenated into a redirect target.
       */
      position={word.position}
    />
  );
}
