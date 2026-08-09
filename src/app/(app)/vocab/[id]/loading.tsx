import { Suspense } from "react";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { BackLink } from "@/components/layout/back-link";
import { OriginBackLink } from "@/components/layout/origin-back-link";
import { Skeleton } from "@/components/ui/skeleton";
import { vocabListHref } from "@/lib/vocab/links";

/**
 * The same block heights the real page draws, so nothing jumps when the row
 * lands. The back link is real: it is the one control that works before the
 * word does.
 *
 * It is also the one control that can be *wrong* before the word does. A
 * `loading.tsx` receives no props and so cannot read `searchParams` on the
 * server, so the origin is read on the client by `OriginBackLink` (F11 D7).
 * The `<Suspense>` fallback is the pre-F11 link — the same destination an
 * absent or unrecognised origin resolves to — so the worst case is the old
 * behaviour rather than a gap where the escape hatch should be.
 */
export default function WordLoading() {
  return (
    <Screen>
      <ScreenBody scroll padded={false} className="px-6 pb-7">
        <Suspense fallback={<BackLink href={vocabListHref()} label="Collection" />}>
          <OriginBackLink />
        </Suspense>
        <Skeleton width="55%" height={38} className="mt-2" />
        <Skeleton width={140} height={13} className="mt-4" />
        <div className="mt-4.5 h-px bg-rule" />
        <Skeleton width="100%" height={18} className="mt-4.5" />
        <Skeleton width="80%" height={18} className="mt-2.5" />
        <Skeleton width={44} height={10} className="mt-7" />
        <Skeleton width="92%" height={16} className="mt-4" />
        <Skeleton width="88%" height={16} className="mt-3.5" />
        <Skeleton width="90%" height={16} className="mt-3.5" />
      </ScreenBody>
    </Screen>
  );
}
