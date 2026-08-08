import Link from "next/link";
import { Screen } from "@/components/screen";
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
      <div
        className="shrink-0 bg-paper px-[var(--gutter)]"
        style={{ paddingTop: "var(--pad-top)" }}
      >
        <div className="flex items-baseline justify-between pb-3.5">
          <h1 className="m-0 text-[27px] font-normal tracking-[-0.01em]">
            Collection
          </h1>
          <Link
            href="/vocab/new"
            className="flex h-9 items-center rounded-[var(--r-pill)] border border-ink bg-ink px-4 font-mono text-[11px] tracking-[0.12em] text-paper uppercase"
          >
            + Word
          </Link>
        </div>
        <div className="flex gap-[22px] border-b border-rule">
          <TabLink href="/vocab" label="Mine" active={!discover} />
          <TabLink href="/vocab?tab=discover" label="Discover" active={discover} />
        </div>
      </div>

      {discover ? <DiscoverTab /> : <MineTab />}
    </Screen>
  );
}

function TabLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b py-2.5 text-[17px] ${
        active ? "border-ink text-ink" : "border-transparent text-ink-3"
      }`}
    >
      {label}
    </Link>
  );
}

function MineTab() {
  const groups = groupedByLetter(MINE);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)] pb-3">
      <div className="sticky top-0 z-2 bg-paper pt-3 pb-2.5">
        <div className="flex h-10 items-center gap-2 rounded-[var(--r-field)] border border-rule bg-card px-3">
          <span className="font-mono text-[12px] text-ink-3">/</span>
          <span className="text-[16px] text-ink-3">
            Search {MINE.length} words
          </span>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.letter}>
          <div className="sticky top-[62px] z-1 bg-paper pt-2.5 pb-1.5 font-mono text-[10px] tracking-[0.2em] text-ink-3 uppercase">
            {group.letter}
          </div>
          {group.words.map((word) => (
            <Link
              key={word.id}
              href={`/vocab/${word.id}`}
              className="flex min-h-[46px] w-full items-baseline gap-2.5 border-b border-rule-2 py-3 pr-2"
            >
              <span
                className={`text-[18px] ${
                  word.mastered ? "text-ink-3 line-through" : "text-ink"
                }`}
              >
                {word.term}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] leading-[1.25] text-ink-3">
                {word.definition}
              </span>
              {word.mastered && (
                <span className="size-[6px] shrink-0 rounded-full bg-accent" />
              )}
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

function DiscoverTab() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[var(--gutter)] pt-6 pb-4">
      <button
        type="button"
        className="h-14 w-full rounded-[var(--r-field)] border border-ink bg-ink font-mono text-[12px] tracking-[0.16em] text-paper uppercase"
      >
        Pick a new word for me
      </button>

      {/* Proposed, not kept. Nothing enters the collection until "Keep" —
          ten idle taps must not pollute the six-word card pool. [R4] */}
      <div className="dw-in flex flex-col gap-3 rounded-[var(--r-card)] border border-rule bg-card p-5">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[26px] tracking-[-0.01em]">
            {DISCOVER_PICK.term}
          </span>
          <span className="font-mono text-[11px] text-ink-3">
            {DISCOVER_PICK.ipa}
          </span>
        </div>
        <p className="m-0 text-[16px] leading-[1.4] text-ink-2">
          {DISCOVER_PICK.definition}
        </p>
        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            className="h-11 flex-1 rounded-[var(--r-field)] border border-ink bg-ink font-mono text-[11px] tracking-[0.14em] text-paper uppercase"
          >
            Keep
          </button>
          <button
            type="button"
            className="h-11 flex-1 rounded-[var(--r-field)] border border-rule font-mono text-[11px] tracking-[0.14em] text-ink-2 uppercase"
          >
            Another
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 pt-1.5">
        <span className="font-mono text-[9px] tracking-[0.2em] text-ink-3 uppercase">
          Kept from Discover
        </span>
        {DISCOVER_KEPT.map((word) => (
          <div
            key={word.term}
            className="flex items-baseline gap-2.5 border-b border-rule-2 pb-2.5"
          >
            <span className="text-[18px]">{word.term}</span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-ink-3">
              {word.definition}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
