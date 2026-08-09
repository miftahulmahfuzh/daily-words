import { notFound } from "next/navigation";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Eyebrow, Meta } from "@/components/ui/text";
import { EntryRow } from "@/components/journal/entry-row";
import { InsightPanel } from "@/components/journal/insight-panel";
import { entryMeta, groupByDate } from "@/lib/journal/format";
import { JOURNAL_TEXT_MAX } from "@/lib/journal/limits";
import type { JournalEntryDto } from "@/lib/journal/schemas";

/**
 * The journal's two screens under worst-case content, for review at 375px.
 *
 * Not the real screens: those need a session, a database and — for the insight —
 * a model call. What is reviewable without any of that is the layout, which is
 * where this feature can go wrong silently: a 1000-character paste must occupy
 * exactly as much of the list as a six-word proverb, and the insight must fit
 * under a one-line entry without scrolling.
 *
 * `?state=entry` draws the entry page with a ready insight; the default draws
 * the list. The composer is deliberately **not** here — it is a client component
 * with a live `POST` behind it, and a fixture that pretends to save is worse
 * than no fixture.
 */

const TODAY = "2026-09-18";

const LONG_PASTE =
  "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair. ".repeat(
    4,
  );

const entry = (over: Partial<JournalEntryDto> & Pick<JournalEntryDto, "id" | "text">): JournalEntryDto => ({
  sourceNote: null,
  insightStatus: "none",
  insight: null,
  localDate: TODAY,
  createdAt: "2026-09-18T04:00:00.000Z",
  updatedAt: "2026-09-18T04:00:00.000Z",
  edited: false,
  ...over,
});

const READY = entry({
  id: "1",
  text: "A fall in a pit, a gain in one’s wit.",
  sourceNote: "Chinese proverb, heard in a film",
  insightStatus: "ready",
  insight: {
    meaning:
      "Failure teaches. The proverb does not soften the loss; it treats the understanding gained as what the loss bought.",
    whenItApplies: [
      "Reviewing a project that failed and working out what it taught.",
      "Reassuring someone who has just made an expensive mistake.",
      "Arguing for trying something that might not work.",
    ],
  },
});

const ENTRIES: JournalEntryDto[] = [
  READY,
  entry({
    id: "2",
    // The paste the list has to survive: clamped to three lines, same row height
    // as everything around it.
    text: LONG_PASTE.slice(0, JOURNAL_TEXT_MAX),
    sourceNote: "A Tale of Two Cities",
  }),
  entry({
    id: "3",
    text: "Nothing to be done.",
    sourceNote: "Waiting for Godot",
    localDate: "2026-09-17",
    edited: true,
  }),
  entry({
    id: "4",
    text: "We are all in the gutter, but some of us are looking at the stars.",
    sourceNote: "Oscar Wilde",
    localDate: "2026-08-21",
  }),
];

export default async function KitchenSinkJournalPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { state } = await searchParams;

  if (state === "entry") {
    return (
      <Screen>
        <ScreenBody scroll padded={false} className="px-6 pb-7">
          <BackLink href="/kitchen-sink/journal" label="Journal" />
          <p className="m-0 pt-3 text-2xl leading-[1.25] tracking-[-0.015em] whitespace-pre-wrap text-pretty">
            {READY.text}
          </p>
          <div className="flex items-baseline gap-2 py-4.5 pb-5.5">
            <Eyebrow className="tracking-[0.1em]">{entryMeta(READY)}</Eyebrow>
          </div>
          <div className="h-px bg-rule" />
          {READY.insight && <InsightPanel insight={READY.insight} />}
          <div className="flex items-center gap-6 pt-7">
            <Meta>Edit</Meta>
            <Meta>Delete</Meta>
          </div>
        </ScreenBody>
      </Screen>
    );
  }

  return (
    <Screen tabs>
      <ScreenBody
        scroll
        className="pb-3"
        top={
          <div className="pt-4.5 pb-3.5">
            <h1 className="m-0 mb-3.5 text-2xl font-normal tracking-title">Journal</h1>
            <div className="flex h-[46px] items-center rounded-[var(--r-field)] border border-rule bg-card px-3.5">
              <span className="flex-1 text-base text-ink-3">Paste a line worth keeping</span>
            </div>
            <Meta className="block pt-2">Composer is inert here — see /journal.</Meta>
          </div>
        }
      >
        {groupByDate(ENTRIES, TODAY).map((group) => (
          <div key={group.date}>
            <div className="bg-paper pt-3 pb-1">
              <Eyebrow>{group.label}</Eyebrow>
            </div>
            {group.entries.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </div>
        ))}
        <div className="flex justify-center py-4">
          <Button size="sm" fullWidth={false} href="/kitchen-sink/journal?state=entry">
            Entry page
          </Button>
        </div>
      </ScreenBody>
    </Screen>
  );
}
