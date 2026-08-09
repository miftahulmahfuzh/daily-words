import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedCard } from "@/components/share/shared-card";
import { SharedJournal } from "@/components/share/shared-journal";
import { SharedWord } from "@/components/share/shared-word";
import { env } from "@/lib/env";
import {
  shareCardMetaDescription,
  shareCardMetaTitle,
  shareClaimHref,
  shareHref,
  shareJournalMetaDescription,
  shareJournalMetaTitle,
  SHARE_GONE_TITLE,
  SHARE_META_FALLBACK,
} from "@/lib/share/policy";
import type { SharedPayload } from "@/lib/share/schemas";
import { DEFAULT_TIMEZONE, localDateNow } from "@/lib/time/local-date";
import { readShare, SHARE_ROBOTS } from "./read";

/**
 * The three pages in this application a stranger can see, as one route.
 *
 * `/s/<slug>` carries **no entity type in its path** (F16 D5): the slug is
 * already unique across all three kinds, so a type in the URL would be redundant
 * data the database would then have to agree with, and a mismatch is a code path
 * nobody writes a test for. F18 therefore added a branch in the renderer rather
 * than two more routes — one resolver, one `generateMetadata`, one 404 path, one
 * revocation path.
 *
 * **It is a sibling of the `(app)` route group, not a member**, and that is the
 * decision most likely to be got wrong here. `app/(app)/layout.tsx` calls
 * `requireOnboardedUser()`, which redirects to `/signin`; a share page inside
 * that group is invisible to exactly the audience it exists for, and the trap is
 * that the author testing it is signed in and onboarded, so it renders
 * perfectly for them. The feature would ship broken and look fine.
 *
 * `src/middleware.ts` is the second gate and is exempted through
 * `isPublicSharePath`. Both are needed; either one alone leaves the page dead.
 *
 * **`force-dynamic`: revocation must be immediate.** A cached render outlives
 * the row, and "I turned the link off and it still works" is the one bug this
 * feature cannot have.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A text-only unfurl. **No OG image, and that is a decision rather than an
 * omission:** generating one means a satori render plus an embedded font, per
 * request, on a free tier, for a link opened a handful of times — and there is
 * nothing to draw, because [R18] is "no icons anywhere" and the app's entire
 * visual vocabulary is two typefaces and a hairline rule. A term plus a one-line
 * definition *is* the design, and F2's obligation on F3 caps a definition at 60
 * characters, which is exactly a preview subtitle.
 *
 * **`noindex`, because the URL is the secret.** Indexing converts an 80-bit
 * capability into a public one the moment a crawler finds the link in a
 * forwarded newsletter or a link shortener's preview, and it defeats revocation,
 * since a de-indexed page lingers in caches long after the row is gone. It costs
 * nothing: the app is invite-by-link with no acquisition funnel. And it does
 * **not** stop the unfurl — WhatsApp, Slack and iMessage read `og:` tags
 * directly and ignore `robots` — which is what makes this safe rather than
 * merely cautious.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const payload = await readShare(slug);

  // A revoked or unknown slug previews as nothing rather than as the app, and
  // says the same thing either way.
  if (!payload) {
    return { title: `${SHARE_GONE_TITLE} — Daily Words`, robots: SHARE_ROBOTS };
  }

  const { title, description } = metaFor(payload);

  return {
    title,
    description,
    robots: SHARE_ROBOTS,
    openGraph: {
      title,
      description,
      type: "article",
      url: `${env.APP_URL}${shareHref(slug)}`,
    },
    // `summary`, not `summary_large_image` — there is no image to be large.
    twitter: { card: "summary", title, description },
  };
}

/**
 * One unfurl per kind. **Never the sharer's name** (D8), and for the journal
 * never the insight (D14 rule 1): a machine-written paragraph in a preview card,
 * under a person's link, with no room for the "Written by the machine" line, is
 * precisely the misattribution `SharedJournal` spends its argument avoiding.
 *
 * `source_note` is not reachable from here — it is not in the snapshot at all,
 * which is a stronger guarantee than remembering the rule (D10, D14 rule 2).
 */
function metaFor(payload: SharedPayload): { title: string; description: string } {
  switch (payload.kind) {
    case "vocab":
      return {
        title: `${payload.term} — Daily Words`,
        description: payload.definition ?? SHARE_META_FALLBACK,
      };
    case "card":
      return {
        title: shareCardMetaTitle(payload.dateLabel, payload.words.length),
        description: shareCardMetaDescription(payload.words.map((w) => w.term)),
      };
    case "journal":
      return {
        title: shareJournalMetaTitle(payload.text),
        description: shareJournalMetaDescription(payload.text),
      };
  }
}

export default async function SharedEntityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const payload = await readShare(slug);
  if (!payload) notFound();

  /**
   * F18 D6's dispatch, and the whole of it. A branch in the renderer rather than
   * a second route, which is what `/s/[slug]` carrying no entity type buys.
   *
   * The `switch` is exhaustive over `SharedPayload`'s discriminant, so a fourth
   * kind added to `sharedPayloadSchema` stops this file compiling — which is the
   * same mechanism `createShareSchema`'s discriminated union uses on the write
   * side. Neither end can gain a kind the other has not been taught.
   */
  switch (payload.kind) {
    case "vocab":
      return <SharedWord payload={payload} claimHref={shareClaimHref(slug)} />;
    case "card":
      return (
        <SharedCard
          payload={payload}
          slug={slug}
          /**
           * The viewer's today, in the default zone.
           *
           * A **read**, which CLAUDE.md permits to fall back where a write may
           * not — and the snapshot deliberately does not carry the sharer's own
           * zone (D8). It reaches only the "3 days ago" line; the date beside it
           * is exact and needs no zone at all.
           */
          today={localDateNow(DEFAULT_TIMEZONE)}
        />
      );
    case "journal":
      return <SharedJournal payload={payload} />;
  }
}
