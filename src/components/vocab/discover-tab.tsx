import { EmptyState } from "@/components/ui/empty-state";

/**
 * F4 contract — F8 replaces the body. Do not change the path, the props, or the
 * default export. See plans/F4-vocab-detail.md §9.1 and ROADMAP [R17].
 *
 * What F4 guarantees:
 *
 * 1. `/vocab?tab=discover` routes here. F8 adds no route, no `page.tsx` and no
 *    `layout.tsx` under `app/(app)/vocab/`.
 * 2. It renders as an async server component inside the shell's scroll pane,
 *    below the header and tab strip. It may render client components beneath it.
 * 3. `userId` is authenticated and non-null. F8 does not re-check the session
 *    for identity; the route group's layout already redirected.
 * 4. F8 gets the pane's full width, inside the design's gutter, and unbounded
 *    height. It supplies its own vertical rhythm.
 * 5. The shell reserves `top: 0` inside the pane for the Mine tab's search
 *    field. Discover renders no sticky element there.
 * 6. Bottom inset for the tab bar and the safe area is the shell's; do not
 *    repeat it.
 * 7. Query params other than `tab` are not cleared when Discover is active. F8
 *    may use its own, provided none is named `tab` or `q` — Mine owns those.
 *
 * F8 links to a word it has kept with `vocabDetailHref(id)` from
 * `@/lib/vocab/links`, and must dedup its suggestions against **every** row of
 * `vocab_entries` for the user, mastered ones included — a suggestion matching
 * a term already held violates `UNIQUE (user_id, lower(term))` on accept.
 * [R1] removed tombstones, so there is nothing invisible to reason about.
 */
export interface DiscoverTabProps {
  /** Authenticated user id, already resolved by the shell. */
  userId: string;
}

export default async function DiscoverTab({ userId }: DiscoverTabProps) {
  void userId;

  return (
    <EmptyState
      title="Discover is on the way"
      body="Until then, add a word you met today."
      action={{ label: "Add a word", href: "/vocab/new" }}
    />
  );
}
