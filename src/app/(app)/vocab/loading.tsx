import { Screen, ScreenBody, ScreenHeader } from "@/components/layout/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { Pill } from "@/components/ui/pill";
import { vocabListHref } from "@/lib/vocab/links";

/**
 * The chrome is real and the rows are ghosts, in the same heights the list
 * draws, so the header does not jump when the query lands.
 */
export default function VocabLoading() {
  return (
    <Screen tabs>
      <ScreenBody
        scroll
        className="pb-3"
        top={
          <>
            <ScreenHeader
              className="pb-3.5"
              title="Collection"
              trailing={
                <Pill href="/vocab/new" tone="ink" mono className="h-9">
                  + Word
                </Pill>
              }
            />
            <Tabs
              items={[
                { label: "Mine", href: vocabListHref(), active: true },
                { label: "Discover", href: vocabListHref({ tab: "discover" }), active: false },
              ]}
            />
          </>
        }
      >
        <div className="pt-3 pb-2.5">
          <Skeleton width="100%" height={40} className="rounded-[var(--r-field)]" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="flex min-h-[46px] items-baseline gap-2.5 border-b border-rule-2 py-3 pr-2"
          >
            <Skeleton width={92} height={14} />
            <Skeleton width="45%" height={11} />
          </div>
        ))}
      </ScreenBody>
    </Screen>
  );
}
