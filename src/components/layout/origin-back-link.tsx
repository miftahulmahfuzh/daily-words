"use client";

import { useSearchParams } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { backTarget, parseOrigin } from "@/lib/vocab/links";

/**
 * A `BackLink` that reads the word's origin from the URL on the client.
 *
 * It exists for exactly one caller: `vocab/[id]/loading.tsx`. A `loading.tsx`
 * is a special file and receives no props, so it cannot see `searchParams` on
 * the server — and left alone it would draw `← COLLECTION` pointing at
 * `/vocab` for as long as the RSC payload is in flight, which is precisely the
 * window in which a user taps back. The real page keeps its plain server-side
 * `BackLink`: it parses `searchParams` anyway for the chat button, so making
 * its link client-side would buy nothing and cost a boundary.
 *
 * `useSearchParams` suspends during prerender, so the caller wraps this in a
 * `<Suspense>` whose fallback is the plain Collection link — the same thing
 * this renders when there is no origin.
 */
export function OriginBackLink() {
  return <BackLink {...backTarget(parseOrigin(useSearchParams().get("from") ?? undefined))} />;
}
