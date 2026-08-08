import { Screen, ScreenBody, ScreenHeader } from "@/components/layout/screen";
import { Tabs } from "@/components/ui/tabs";
import { Pill } from "@/components/ui/pill";
import DiscoverTab from "@/components/vocab/discover-tab";
import { MineTab } from "@/components/vocab/mine-tab";
import { requireUser } from "@/lib/auth/session";
import { MAX_SEARCH_CHARS } from "@/lib/vocab/format";
import { vocabListHref } from "@/lib/vocab/links";

/* Tabs are a `?tab=` query param, not a `/vocab/discover` segment — a static
   segment beside `/vocab/[id]` makes "is this an id?" a permanent question.
   ROADMAP [R17]. */
export default async function VocabPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { tab, q } = await searchParams;
  const discover = tab === "discover";

  // Sliced rather than rejected: a pasted paragraph in the search box should
  // degrade to a search, not to an error page.
  const query = typeof q === "string" ? q.trim().slice(0, MAX_SEARCH_CHARS) : "";

  return (
    <Screen tabs>
      <ScreenBody
        scroll
        className={discover ? "gap-5 pt-6 pb-4" : "pb-3"}
        top={
          <>
            <ScreenHeader
              className="pb-3.5"
              title="Collection"
              trailing={
                /* [R21]: the only add affordance. There is no floating "+". */
                <Pill href="/vocab/new" tone="ink" mono className="h-9">
                  + Word
                </Pill>
              }
            />
            <Tabs
              items={[
                { label: "Mine", href: vocabListHref(), active: !discover },
                {
                  label: "Discover",
                  href: vocabListHref({ tab: "discover" }),
                  active: discover,
                },
              ]}
            />
          </>
        }
      >
        {discover ? (
          <DiscoverTab userId={user.id} />
        ) : (
          <MineTab userId={user.id} q={query} />
        )}
      </ScreenBody>
    </Screen>
  );
}
