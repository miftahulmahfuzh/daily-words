/**
 * Every URL into the vocab surface, in one place.
 *
 * F4 contract — F5's daily-card rows, F6's chat page and F8's Discover results
 * all link through these. Do not hand-build `/vocab/${id}` anywhere else: the
 * detail route is the one URL four features share, and a template literal in a
 * fifth file is how it drifts.
 *
 * No `server-only` — client components import these too.
 */

export type VocabTab = "mine" | "discover";

/** `?tab=`, not a `/vocab/discover` segment: [R17] and F4 §7.1. */
export function vocabListHref(params?: { tab?: VocabTab; q?: string }): string {
  const search = new URLSearchParams();
  if (params?.tab === "discover") search.set("tab", "discover");
  if (params?.q) search.set("q", params.q);
  const qs = search.toString();
  return qs ? `/vocab?${qs}` : "/vocab";
}

export const vocabDetailHref = (id: string) => `/vocab/${id}`;

export const vocabChatHref = (id: string) => `/vocab/${id}/chat`;
