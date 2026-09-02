import { notFound } from "next/navigation";
import { Screen, ScreenBody, ScreenHeader } from "@/components/layout/screen";
import { Pill } from "@/components/ui/pill";
import { Tabs } from "@/components/ui/tabs";
import { MineClient } from "@/components/vocab/mine-client";
import {
  VOCAB_DISCOVER_SCROLL_KEY,
  VOCAB_MINE_SCROLL_KEY,
} from "@/lib/vocab/format";
import type { VocabListItem } from "@/lib/vocab/schemas";

/**
 * The Collection's Mine tab against a fixture collection, for F29.
 *
 * Not the real screen: that needs a session and a database. What is reviewable
 * without either is the pane — and the pane is exactly where this feature can go
 * wrong silently. Scroll memory can only be asserted on something that actually
 * scrolls, and `MineClient` takes plain props, so the whole of it renders here
 * with no `userId` anywhere.
 *
 * `?fill=N` sets the size of the collection. The default is 120: twice
 * `VOCAB_PAGE_SIZE`, so the render window and the "More" control are both in
 * play rather than being a case only the tests see.
 *
 * `?tab=discover` draws the Discover tab's **key on the same pane**, which is
 * the one thing about F29 that a single-tab fixture could not show. It is the
 * pane that is being fixtured, not `DiscoverPanel` — that component is a client
 * island with live `POST`s behind it, and a fixture that pretends to suggest
 * words is worse than no fixture. What sits under the key here is a column of
 * inert blocks tall enough to scroll.
 *
 * The rows link to `/vocab/<uuid>` like the real list, because they *are* the
 * real list — `VocabList` builds its hrefs through `vocabDetailHref`. Those
 * routes are authenticated, so the round-trip test that `/kitchen-sink/journal`
 * supports is not available here; F29 §6 says what is asserted instead.
 */

const TERMS = [
  "abeyance", "bellwether", "cadence", "diffident", "ebullient", "fastidious",
  "garrulous", "halcyon", "iridescent", "jejune", "kismet", "lassitude",
  "maunder", "nascent", "obdurate", "palimpsest", "quiescent", "recondite",
  "sanguine", "truculent", "umbrage", "verdant", "winnow", "xeric",
  "yeoman", "zephyr",
] as const;

const DEFINITION =
  "A state of temporary disuse or suspension, held in reserve against the day somebody asks for it again.";

/** A collection of `count` rows, alphabetical, the way Postgres returns them. */
const collection = (count: number): VocabListItem[] =>
  Array.from({ length: count }, (_, i) => {
    const stem = TERMS[i % TERMS.length];
    const round = Math.floor(i / TERMS.length);
    return {
      // A real uuid shape, so `vocabDetailHref` produces a real-looking href.
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      term: round === 0 ? stem : `${stem}${round}`,
      definition: DEFINITION,
      status: "active" as const,
      enrichmentStatus: "ready" as const,
    };
  }).sort((a, b) => a.term.localeCompare(b.term));

/** Clamped for the same reason the journal fixture clamps: a typo is not a fixture. */
const FILL_MAX = 400;

export default async function KitchenSinkVocabPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; fill?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { tab, fill } = await searchParams;
  const discover = tab === "discover";
  const count = Math.min(Math.max(Number(fill ?? 120) || 0, 0), FILL_MAX);

  return (
    <Screen tabs>
      <ScreenBody
        scroll
        restoreScroll={discover ? VOCAB_DISCOVER_SCROLL_KEY : VOCAB_MINE_SCROLL_KEY}
        className={discover ? "gap-5 pt-6 pb-4" : "pb-3"}
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
                { label: "Mine", href: "/kitchen-sink/vocab", active: !discover },
                {
                  label: "Discover",
                  href: "/kitchen-sink/vocab?tab=discover",
                  active: discover,
                },
              ]}
            />
          </>
        }
      >
        {discover ? (
          Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className="h-24 shrink-0 rounded-[var(--r-card)] border border-rule bg-card"
            />
          ))
        ) : (
          <MineClient
            items={collection(count)}
            total={count}
            /* `null` is the mode switch: the whole collection is in hand and the
               browser filters it, which is the mode the render window lives in. */
            serverQ={null}
            initialCursor={null}
          />
        )}
      </ScreenBody>
    </Screen>
  );
}
