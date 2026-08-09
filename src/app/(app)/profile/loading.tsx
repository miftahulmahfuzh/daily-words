import { Screen, ScreenBody } from "@/components/layout/screen";
import { Eyebrow } from "@/components/ui/text";
import { Skeleton } from "@/components/ui/skeleton";
import { BADGE_CATALOG } from "@/lib/gamification/badges";

/**
 * The same block heights the real page draws, so nothing jumps when the query
 * lands. The badge rows are ghosts rather than titles: a shelf that renders all
 * thirteen names and then re-orders them a moment later reads as a glitch.
 */
export default function ProfileLoading() {
  return (
    <Screen tabs>
      <ScreenBody scroll className="pb-4">
        <div className="flex shrink-0 flex-col gap-5 pb-5.5">
          <Skeleton width={120} height={10} />
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton width={64} height={9} />
              <Skeleton width={180} height={32} className="rounded-[var(--r-pill)]" />
              <Skeleton width="70%" height={10} />
            </div>
          ))}
        </div>

        <div className="grid shrink-0 grid-cols-2 border-t border-l border-rule">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-[5px] border-r border-b border-rule px-3.5 py-4"
            >
              <Skeleton width={48} height={32} />
              <Skeleton width={86} height={9} />
            </div>
          ))}
        </div>

        <div className="shrink-0 py-4.5 pb-6 pt-7">
          <Skeleton width="65%" height={17} />
        </div>

        <Eyebrow size="sm">Badges</Eyebrow>
        <div className="flex shrink-0 flex-col pt-2">
          {BADGE_CATALOG.map((badge) => (
            <div
              key={badge.key}
              className="flex items-baseline gap-3 border-b border-rule-2 py-3.5"
            >
              <span className="size-[7px] shrink-0 bg-rule" />
              <Skeleton width="60%" height={16} />
            </div>
          ))}
        </div>
      </ScreenBody>
    </Screen>
  );
}
