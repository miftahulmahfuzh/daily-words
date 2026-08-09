import { DiscoverPanel } from "@/components/vocab/discover-panel";
import { listKeptFromDiscover } from "@/lib/db/queries/vocab-suggestions";

/**
 * F4 contract — the path, the props and the default export are frozen. See
 * `plans/F4-vocab-detail.md` §9.1 and ROADMAP [R17].
 *
 * What F4 guarantees, and what F8 relies on:
 *
 * 1. `/vocab?tab=discover` routes here. F8 adds no route, no `page.tsx` and no
 *    `layout.tsx` under `app/(app)/vocab/`.
 * 2. This is an async server component inside the shell's scroll pane, below the
 *    header and tab strip. It may render client components beneath it — and does:
 *    everything with state is `DiscoverPanel`.
 * 3. `userId` is authenticated and non-null. The route group's layout already
 *    redirected, so nothing here re-checks the session for identity.
 * 4. The pane is a flex column with the design's gutter and a 20px gap, so the
 *    three blocks below are direct children and set no margins of their own.
 * 5. `top: 0` inside the pane belongs to the Mine tab's search field. Discover
 *    renders no sticky element.
 * 6. The bottom inset for the tab bar and the safe area is the shell's.
 *
 * The kept list is read here rather than fetched on mount: the first paint of a
 * returning user's Discover tab should be their own words, not a spinner. The
 * panel prepends anything kept in the current session on top of it.
 */
export interface DiscoverTabProps {
  /** Authenticated user id, already resolved by the shell. */
  userId: string;
}

export default async function DiscoverTab({ userId }: DiscoverTabProps) {
  const kept = await listKeptFromDiscover(userId);
  return <DiscoverPanel initialKept={kept} />;
}
