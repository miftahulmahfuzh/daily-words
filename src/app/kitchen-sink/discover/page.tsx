import { notFound } from "next/navigation";
import { Screen, ScreenBody, ScreenHeader } from "@/components/layout/screen";
import { Pill } from "@/components/ui/pill";
import { Tabs } from "@/components/ui/tabs";
import { DiscoverPanel, type KeptWord } from "@/components/vocab/discover-panel";
import type { Suggestion } from "@/lib/vocab/schemas";

/**
 * The Discover tab under worst-case content, for review at 375px.
 *
 * Not the real tab: that one needs a session, a database and a model call, and
 * the thing being reviewed here is the layout. The shell around it is copied
 * from `/vocab` so the pane's gutter, gap and top block are identical — a
 * fixture measured in a different frame proves nothing about the real one.
 *
 * The strings are hostile on purpose. The term is 20 characters and the gloss
 * is the full 80 the server permits, which is the pair F8 §14's layout check
 * names. `?state=resting` drops the proposal to show the first-run state.
 *
 * **Issues no requests.** Neither state acts by itself; the buttons are live,
 * and tapping one here will 401 without a session. That is fine — nothing
 * paints from the network.
 */

const LONG_TERM = "circumlocutionary";

/** Exactly 80 characters — the cap `truncateGloss` enforces server-side. */
const LONG_GLOSS = "using far more words than the thing being described could ever have needed";

const PROPOSAL: Suggestion = {
  term: LONG_TERM,
  partOfSpeech: "adjective",
  gloss: LONG_GLOSS,
};

const KEPT: KeptWord[] = [
  { id: "k1", term: "winnow", definition: "to sift out what is not wanted", enrichmentStatus: "ready" },
  { id: "k2", term: "sanguine", definition: null, enrichmentStatus: "pending" },
  {
    id: "k3",
    term: LONG_TERM,
    definition: LONG_GLOSS,
    enrichmentStatus: "ready",
  },
];

export default async function KitchenSinkDiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { state } = await searchParams;

  return (
    <Screen tabs>
      <ScreenBody
        scroll
        className="gap-5 pt-6 pb-4"
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
                { label: "Mine", href: "/kitchen-sink/discover?state=resting", active: false },
                { label: "Discover", href: "/kitchen-sink/discover", active: true },
              ]}
            />
          </>
        }
      >
        <DiscoverPanel
          initialKept={KEPT}
          initialSuggestion={state === "resting" ? null : PROPOSAL}
        />
      </ScreenBody>
    </Screen>
  );
}
