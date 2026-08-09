import { Screen, ScreenBody } from "@/components/layout/screen";
import { EmptyState } from "@/components/ui/empty-state";
import { SHARE_GONE_BODY, SHARE_GONE_TITLE } from "@/lib/share/policy";

/**
 * Reached three ways: a slug that was revoked, a slug that never existed, and a
 * payload that no longer parses. **All three say the same thing on purpose.**
 *
 * `/vocab/[id]/not-found.tsx` already carries the private version of this
 * reasoning. The public case is stronger: distinguishing "revoked" from "never
 * existed" tells a slug-guesser that their guess *used to be right*, which is a
 * live oracle on the slug space. Both cases also take the identical code path —
 * one indexed lookup that misses — so there is no timing channel either.
 *
 * A real 404 status, via `notFound()`, so unfurlers and crawlers drop it rather
 * than caching a soft 200.
 *
 * No action button. Every destination in this app needs a session, and offering
 * a stranger a link that bounces them to /signin would be worse than offering
 * nothing.
 */
export default function ShareNotFound() {
  return (
    <Screen>
      <ScreenBody className="pb-7">
        <EmptyState title={SHARE_GONE_TITLE} body={SHARE_GONE_BODY} />
      </ScreenBody>
    </Screen>
  );
}
