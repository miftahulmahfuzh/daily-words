import { requireApiUser } from "@/lib/api/guards";
import { fail, ok } from "@/lib/api/respond";
import { readJson } from "@/lib/api/respond";
import { createShare } from "@/lib/db/queries/shares";
import { getEntryForUser } from "@/lib/db/queries/vocab";
import { env } from "@/lib/env";
import { shareHref } from "@/lib/share/policy";
import { createShareSchema, type CreateShareResponse } from "@/lib/share/schemas";
import { toSharedWordPayload } from "@/lib/share/serialize";

export const runtime = "nodejs";

/**
 * Mint a share. Auth, ownership, a snapshot, one INSERT. **No LLM call, ever.**
 *
 * Three properties this route has and should keep:
 *
 * 1. **Ownership is re-verified here, from the session**, never taken from the
 *    body. `getEntryForUser` puts `user_id` in the WHERE clause, so an id
 *    belonging to somebody else is a 404 rather than a 403 — a 403 would confirm
 *    the id exists.
 * 2. **The snapshot is built server-side**, by `toSharedWordPayload` and by
 *    nothing else. The client sends an id and receives a URL; it never sees or
 *    supplies the payload, so there is no path by which a phone decides what a
 *    stranger can read.
 * 3. **Idempotent.** A second POST for the same entity returns the same slug,
 *    because `createShare` catches the partial unique index rather than reading
 *    first. Two tabs cannot mint two links for one word.
 *
 * No rate limit, and that is reasoning rather than laziness (D11): creation is
 * authenticated, idempotent per entity, and structurally bounded by
 * `DAILY_ADD_LIMIT = 50` words a day. It burns no model quota and calls no
 * external service, so a best-effort in-memory counter would add a moving part
 * that protects nothing.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req, createShareSchema);
  if (!body.ok) return body.response;

  // One arm today. F18's `card` and `journal` arms land in `createShareSchema`,
  // and this switch stops compiling until they are handled here too — which is
  // the reason the request shape is a discriminated union rather than an enum
  // beside a bare uuid.
  const entry = await getEntryForUser(auth.user.id, body.data.id);
  if (!entry) return fail(404, "That word is not in your collection.", "not_found");

  /**
   * Only a `ready` word can be shared.
   *
   * The control on `/vocab/[id]` does not render until then, so reaching this is
   * a stale tab or a hand-made request — but it is enforced here because the
   * client is not the gate. Sharing a `pending` word hands a stranger a page
   * with a term and nothing under it, and F17's claim path would then have no
   * enrichment to copy and would land a brand-new user on "come back later".
   */
  if (entry.enrichmentStatus !== "ready") {
    return fail(409, "You can share a word once we've looked it up.", "not_ready");
  }

  const share = await createShare(auth.user.id, {
    entityType: body.data.entityType,
    entityId: entry.id,
    payload: toSharedWordPayload(entry),
  });

  // Absolute, because the phone puts it straight into a message. `env.APP_URL`
  // rather than the request's own Host header: a header a proxy can rewrite is
  // not something to build a shared link out of.
  return ok<CreateShareResponse>({
    slug: share.slug,
    url: `${env.APP_URL}${shareHref(share.slug)}`,
  });
}
