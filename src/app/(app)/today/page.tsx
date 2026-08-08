import { Screen, ScreenBody, ScreenHeader } from "@/components/layout/screen";
import { DailyCard } from "@/components/daily/daily-card";
import { DayStrip } from "@/components/daily/day-strip";
import { Eyebrow } from "@/components/ui/text";
import { Pill } from "@/components/ui/pill";
import { TODAY_CARD_ITEMS, WEEK_STRIP } from "@/lib/sample-data";

/**
 * The centrepiece, and the only screen in the app that does not scroll.
 *
 * `ScreenBody` without `scroll` is what enforces that: the pane is
 * `overflow: hidden`, so even a miscalculation cannot produce a scrollbar — it
 * would clip, which is loud and gets noticed, rather than quietly making the
 * card draggable. The card between the header and the strip is `flex-1` and
 * absorbs every device's slack. See [R19].
 */
export default function TodayPage() {
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

        <DailyCard items={TODAY_CARD_ITEMS} />

        <DayStrip days={WEEK_STRIP} />
      </ScreenBody>
    </Screen>
  );
}
