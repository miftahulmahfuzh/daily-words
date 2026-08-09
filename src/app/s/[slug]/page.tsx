import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedWord } from "@/components/share/shared-word";
import { getShareBySlug } from "@/lib/db/queries/shares";
import { env } from "@/lib/env";
import {
  isShareSlug,
  shareClaimHref,
  shareHref,
  SHARE_GONE_TITLE,
  SHARE_META_FALLBACK,
} from "@/lib/share/policy";
import { sharedPayloadSchema, type SharedPayload } from "@/lib/share/schemas";

/**
 * The one page in this application a stranger can see.
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
 * One query per request, shared by `generateMetadata` and the render.
 *
 * Next calls the two separately, so without `cache()` every unfurl and every
 * page view would cost two identical reads.
 */
const readShare = cache(
  async (slug: string): Promise<SharedPayload | null> => {
    // A malformed slug must never reach the database. Cheap, and it also means a
    // hand-typed link and a revoked one take the same path to the same 404.
    if (!isShareSlug(slug)) return null;

    const row = await getShareBySlug(slug);
    if (!row) return null;

    /**
     * Parsed, not cast. The column is `jsonb` and the database guarantees it
     * nothing; a row written by an older serializer must degrade to the 404
     * rather than crash a page a stranger is looking at. zod strips unknown
     * keys, which is the second, independent net under the write-side
     * allowlist in `lib/share/serialize.ts`.
     */
    const parsed = sharedPayloadSchema.safeParse(row.payload);
    if (!parsed.success) {
      console.error(`[share] slug ${slug} holds an unreadable payload`);
      return null;
    }
    return parsed.data;
  },
);

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

  const robots = { index: false, follow: false, googleBot: { index: false, follow: false } };
  if (!payload) return { title: `${SHARE_GONE_TITLE} — Daily Words`, robots };

  const title = `${payload.term} — Daily Words`;
  // Never the sharer's name (D8). The definition, or nothing that identifies
  // anyone.
  const description = payload.definition ?? SHARE_META_FALLBACK;

  return {
    title,
    description,
    robots,
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

export default async function SharedWordPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const payload = await readShare(slug);
  if (!payload) notFound();

  // One member today. F18 adds `card` and `journal` arms here — a branch in the
  // renderer, not a second route, which is the whole point of `/s/[slug]`
  // carrying no entity type in the path.
  return <SharedWord payload={payload} claimHref={shareClaimHref(slug)} />;
}
