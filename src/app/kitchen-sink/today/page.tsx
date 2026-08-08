import { notFound } from "next/navigation";
import { Screen, ScreenBody, ScreenHeader } from "@/components/layout/screen";
import { DailyCard } from "@/components/daily/daily-card";
import { DayStrip } from "@/components/daily/day-strip";
import { NoCardYet } from "@/components/daily/no-card-yet";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/text";
import { Pill } from "@/components/ui/pill";
import type { DailyCardItemView } from "@/lib/ui/types";
import { WEEK_STRIP } from "@/lib/sample-data";
import { CardEmpty } from "@/app/(app)/today/card-empty";

/**
 * The /today layout under worst-case content, for the no-scroll spec.
 *
 * Not the real /today: that one needs a session, and the thing being tested is
 * the layout rather than the query. The strings are deliberately hostile — a
 * 24-character term and a 140-character definition on every row — because the
 * guarantee being proved is that no string can change a row's height.
 *
 * `?n=` sets the number of words so the spec can exercise 0, 1, 3 and 6.
 * `?state=empty` swaps the nudge for F5's `CardEmpty` — the widest of /today's
 * six card-region states, since it is the only one carrying two buttons.
 */
/**
 * Both strings must OVERFLOW their line box at 375px, not merely fill it — the
 * spec asserts `scrollWidth > clientWidth` on each, so a fixture that quietly
 * fits would make the truncation assertions vacuous. An earlier 21-character
 * term measured exactly 259px in a 259px box and passed while proving nothing.
 * The term line has ~259px at 22px serif; the definition ~309px at 15px.
 */
const LONG_TERM = "antidisestablishmentarianismophobia";
const LONG_DEFINITION =
  "a way of speaking that goes all the way round the point before arriving at it, if it arrives at all, which on the evidence it rarely does";

function fixture(n: number): DailyCardItemView[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `fixture-${i}`,
    term: `${LONG_TERM}${i}`,
    definition: LONG_DEFINITION,
    tag: "noun",
  }));
}

export default async function KitchenSinkTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ n?: string; state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { n, state } = await searchParams;
  const count = Math.min(Math.max(Number(n ?? 6), 0), 6);
  const items = fixture(count);
  const empty = state === "empty";

  return (
    <Screen tabs>
      <ScreenBody>
        <ScreenHeader
          className="pb-3"
          eyebrow={<Eyebrow>Friday 18 September</Eyebrow>}
          title="Today’s card"
          trailing={
            <Pill href="/calendar" mono className="min-h-[32px] text-mono-xs">
              12 day run
            </Pill>
          }
        />

        {empty ? (
          <CardEmpty
            title="Every word mastered."
            actions={
              <>
                <Button variant="filled" size="sm" fullWidth={false} href="/vocab/new">
                  Add a word
                </Button>
                <Button variant="outline" size="sm" fullWidth={false} href="/vocab">
                  Discover
                </Button>
              </>
            }
          />
        ) : count === 0 ? (
          <NoCardYet
            action={
              <Button
                variant="filled"
                size="md"
                fullWidth={false}
                className="min-w-[200px]"
              >
                Make today’s card
              </Button>
            }
          />
        ) : (
          <DailyCard
            items={items}
            shortCardAction={
              count < 6 ? (
                <Button
                  variant="quiet"
                  size="sm"
                  fullWidth={false}
                  href="/vocab/new"
                >
                  Add more words
                </Button>
              ) : undefined
            }
          />
        )}

        <DayStrip days={WEEK_STRIP} />
      </ScreenBody>
    </Screen>
  );
}
