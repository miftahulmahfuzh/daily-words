import { requireApiUser } from "@/lib/api/guards";
import { fail, ok } from "@/lib/api/respond";
import { deleteShare } from "@/lib/db/queries/shares";
import { isShareSlug } from "@/lib/share/policy";
import type { DeleteShareResponse } from "@/lib/share/schemas";

export const runtime = "nodejs";

/**
 * Revoke. [S3]: revoking is deleting the row, and it is immediate — `/s/[slug]`
 * is `force-dynamic`, so the next reload in the stranger's open tab is the 404.
 *
 * Scoped by `userId` in the WHERE clause, which makes this the one authenticated
 * authorisation decision the feature makes. Someone else's live slug and a slug
 * that never existed both answer 404: a 403 would confirm the slug exists, which
 * is exactly the oracle the entropy in D6 exists to deny.
 *
 * Deleting an already-deleted share is also a 404 rather than a 200. The user's
 * intent is satisfied either way and the client treats it as success, so the
 * distinction costs nothing and keeps the response honest about what happened.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { slug } = await params;
  // A malformed slug must never reach the database, and it must not read
  // differently from a real one that is not yours.
  if (!isShareSlug(slug)) return fail(404, "That link is not available.", "not_found");

  const outcome = await deleteShare(auth.user.id, slug);
  if (outcome === "not_found") {
    return fail(404, "That link is not available.", "not_found");
  }

  return ok<DeleteShareResponse>({ deleted: true });
}
