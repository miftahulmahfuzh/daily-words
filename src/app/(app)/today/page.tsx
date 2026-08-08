import Link from "next/link";
import { Screen, ScreenBody } from "@/components/screen";
import { DailyCard } from "@/components/daily-card";
import { TODAY_CARD, WEEK_STRIP } from "@/lib/sample-data";

export default function TodayPage() {
  return (
    <Screen tabs>
      <ScreenBody>
        <header className="flex items-baseline justify-between pb-3">
          <div className="flex flex-col gap-[3px]">
            <span className="font-mono text-[10px] tracking-[0.2em] text-ink-3 uppercase">
              Friday 18 September
            </span>
            <h1 className="m-0 text-[27px] font-normal tracking-[-0.01em]">
              Today’s card
            </h1>
          </div>
          <Link
            href="/calendar"
            className="flex min-h-[32px] items-center rounded-[var(--r-pill)] border border-rule px-3 font-mono text-[10px] tracking-[0.12em] text-ink-2 uppercase"
          >
            12 day run
          </Link>
        </header>

        <DailyCard words={TODAY_CARD} />

        <div className="flex shrink-0 flex-col gap-2 px-0.5 pt-3.5 pb-3">
          <span className="font-mono text-[9px] tracking-[0.2em] text-ink-3 uppercase">
            Last seven days
          </span>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEK_STRIP.map((day, i) => (
              <div key={i} className="flex flex-col items-center gap-[5px]">
                <span className="font-mono text-[9px] tracking-[0.08em] text-ink-3">
                  {day.label}
                </span>
                <span
                  className={
                    day.made
                      ? "text-[12px] text-accent"
                      : "text-[11px] text-miss"
                  }
                >
                  {day.made ? "✓" : "✕"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </ScreenBody>
    </Screen>
  );
}
