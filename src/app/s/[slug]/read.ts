import { cache } from "react";
import { getShareBySlug } from "@/lib/db/queries/shares";
import { isShareSlug } from "@/lib/share/policy";
import { sharedPayloadSchema, type SharedPayload } from "@/lib/share/schemas";

/**
 * The one read behind every public page, and the `robots` block every one of
 * them sets.
 *
 * Extracted from `page.tsx` when F18 added `/s/[slug]/[position]`. Next calls
 * `generateMetadata` and the page separately, so a route with no `cache()` pays
 * two identical lookups per request — and with two routes sharing one slug, a
 * copy of this in each file would be four places for the parse to drift.
 *
 * `cache()` is per-request, so the nested word route's metadata and render share
 * a single query (F18 R11, closed here rather than deferred).
 */
export const readShare = cache(
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
     * keys, which is the second, independent net under the write-side allowlist
     * in `lib/share/serialize.ts`.
     *
     * **`entity_type` is deliberately not consulted.** The payload's own `kind`
     * is the discriminant the renderer switches on, so a row whose column and
     * whose snapshot disagreed would render as whatever the snapshot actually
     * holds rather than as whatever the column claims — the safer of the two,
     * because the snapshot is what the allowlist was applied to.
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
 * **`noindex` on every share route, including the nested one** (F18 D14 rule 3).
 *
 * The URL is the secret. Indexing converts an 80-bit capability into a public one
 * the moment a crawler finds the link in a forwarded newsletter or a link
 * shortener's preview, and it defeats revocation, since a de-indexed page lingers
 * in caches long after the row is gone. It costs nothing: the app is
 * invite-by-link with no acquisition funnel. And it does **not** stop the unfurl —
 * WhatsApp, Slack and iMessage read `og:` tags directly and ignore `robots` —
 * which is what makes this safe rather than merely cautious.
 */
export const SHARE_ROBOTS = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
} as const;
