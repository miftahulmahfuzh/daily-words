import type { CalendarDayView } from "@/lib/ui/types";
import { cn } from "@/lib/ui/cn";
import { CalendarMarkGlyph } from "@/components/ui/calendar-cell";
import { Eyebrow } from "@/components/ui/text";

export type DayStripItem = CalendarDayView & {
  /** One letter: M T W T F S S, in the user's locale. */
  weekday: string;
};

/**
 * The last seven days, under the card.
 *
 * Seven marks and no numerals: this strip answers "have I been keeping it up?"
 * and nothing else. The month grid on /calendar is where a date becomes
 * something you can point at.
 *
 * Its height is part of /today's budget. If this strip ever needs to grow, the
 * budget has to be re-derived first — on the binding device it cannot simply be
 * absorbed.
 */
export function DayStrip({
  days,
  label = "Last seven days",
  className,
}: {
  days: DayStripItem[];
  label?: string;
  className?: string;
}) {
  return (
    <div
      data-testid="day-strip"
      className={cn("flex shrink-0 flex-col gap-2 px-0.5 pt-3.5 pb-3", className)}
    >
      <Eyebrow size="sm">{label}</Eyebrow>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => (
          <div key={day.date} className="flex flex-col items-center gap-[5px]">
            <span className="font-mono text-mono-2xs tracking-[0.08em] text-ink-3">
              {day.weekday}
            </span>
            <CalendarMarkGlyph mark={day.mark} isToday={day.isToday} />
          </div>
        ))}
      </div>
    </div>
  );
}
