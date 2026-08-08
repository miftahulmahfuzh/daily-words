import { Screen, ScreenBody, ScreenHeader } from "@/components/layout/screen";
import { Tabs } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { Pill } from "@/components/ui/pill";
import { Eyebrow, Prose } from "@/components/ui/text";
import { TextInput } from "@/components/ui/text-input";
import {
  MINE,
  groupedByLetter,
  DISCOVER_PICK,
  DISCOVER_KEPT,
} from "@/lib/sample-data";

/* Tabs are a `?tab=` query param, not a `/vocab/discover` segment — a static
   segment beside `/vocab/[id]` makes "is this an id?" a permanent question.
   ROADMAP [R17]. */
export default async function VocabPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const discover = tab === "discover";

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
                <Pill href="/vocab/new" tone="ink" mono className="h-9">
                  + Word
                </Pill>
              }
            />
            <Tabs
              items={[
                { label: "Mine", href: "/vocab", active: !discover },
                {
                  label: "Discover",
                  href: "/vocab?tab=discover",
                  active: discover,
                },
              ]}
            />
          </>
        }
      >
        {discover ? <DiscoverTab /> : <MineTab />}
      </ScreenBody>
    </Screen>
  );
}

function MineTab() {
  const groups = groupedByLetter(MINE);

  return (
    <>
      <div className="sticky top-0 z-2 bg-paper pt-3 pb-2.5">
        <TextInput
          name="q"
          readOnly
          placeholder={`Search ${MINE.length} words`}
          className="h-10"
          inputClassName="h-10 text-body"
          leading={<span className="font-mono text-mono-md text-ink-3">/</span>}
        />
      </div>

      {groups.map((group) => (
        <div key={group.letter}>
          <div className="sticky top-[62px] z-1 bg-paper pt-2.5 pb-1.5">
            <Eyebrow>{group.letter}</Eyebrow>
          </div>
          {group.words.map((word) => (
            <ListRow
              key={word.id}
              href={`/vocab/${word.id}`}
              title={word.term}
              subtitle={word.definition}
              muted={word.mastered}
              strikethrough={word.mastered}
              trailing={
                word.mastered ? (
                  <span className="size-[6px] shrink-0 rounded-full bg-accent" />
                ) : undefined
              }
            />
          ))}
        </div>
      ))}
    </>
  );
}

function DiscoverTab() {
  return (
    <>
      <Button variant="filled" className="h-14 shrink-0">
        Pick a new word for me
      </Button>

      {/* Proposed, not kept. Nothing enters the collection until "Keep" —
          ten idle taps must not pollute the six-word card pool. [R4] */}
      <Card className="dw-in flex shrink-0 flex-col gap-3">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[26px] tracking-title">{DISCOVER_PICK.term}</span>
          {/* IPA is always mono: the serif's latin subset does not guarantee the
              IPA Extensions block, and a silent fallback shows as a mismatched
              line. A hard rule for F3 and F4 too. */}
          <span className="font-mono text-mono-sm text-ink-3">
            {DISCOVER_PICK.ipa}
          </span>
        </div>
        <Prose size="body">{DISCOVER_PICK.definition}</Prose>
        <div className="flex gap-2.5 pt-1">
          <Button variant="filled" size="sm" className="flex-1 text-mono-sm tracking-nav">
            Keep
          </Button>
          <Button size="sm" className="flex-1 text-mono-sm tracking-nav">
            Another
          </Button>
        </div>
      </Card>

      <div className="flex shrink-0 flex-col gap-2.5 pt-1.5">
        <Eyebrow size="sm">Kept from Discover</Eyebrow>
        {DISCOVER_KEPT.map((word) => (
          <ListRow
            key={word.term}
            title={word.term}
            subtitle={word.definition}
            className="min-h-0 py-0 pb-2.5"
          />
        ))}
      </div>
    </>
  );
}
