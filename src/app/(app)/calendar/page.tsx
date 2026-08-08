import { Screen, ScreenBody } from "@/components/layout/screen";
import { BackLink } from "@/components/layout/back-link";
import { CalendarCell, CalendarMarkGlyph } from "@/components/ui/calendar-cell";
import { Prose } from "@/components/ui/text";
import type { CalendarDayView } from "@/lib/ui/types";
import { MONTH } from "@/lib/sample-data";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

type Cell = CalendarDayView | null;

function buildCells(): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < MONTH.firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= MONTH.days; d++) {
    cells.push({
      date: `2026-09-${String(d).padStart(2, "0")}`,
      day: d,
      isToday: d === MONTH.today,
      mark: d > MONTH.today ? "future" : MONTH.made.has(d) ? "made" : "missed",
    });
  }
  return cells;
}

/**
 * Ticks and crosses, a month at a time.
 *
 * Month navigation is prev/next controls, never a horizontal swipe. A swipe
 * that starts within ~20px of the screen edge is claimed by iOS for back
 * navigation, which is exactly where a one-handed thumb lands first.
 */
export default function CalendarPage() {
  const cells = buildCells();

  return (
    <Screen tabs>
      <ScreenBody scroll>
        <div className="flex items-center justify-between pb-4">
          <BackLink href="/today" label="Today" />
          <div className="flex items-center gap-3.5">
            <span className="font-mono text-mono-xl text-ink-3">‹</span>
            <span className="text-[19px]">{MONTH.label}</span>
            <span className="font-mono text-mono-xl text-ink-3">›</span>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0.5 pb-2">
          {DOW.map((d, i) => (
            <span
              key={i}
              className="text-center font-mono text-mono-2xs tracking-chip text-ink-3 uppercase"
            >
              {d}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell, i) =>
            cell === null ? (
              <CalendarCell key={i} day={null} mark="future" />
            ) : (
              <CalendarCell
                key={cell.date}
                day={cell.day}
                mark={cell.mark}
                isToday={cell.isToday}
                accessibleDate={`${cell.day} September`}
              />
            ),
          )}
        </div>

        <div className="flex flex-col gap-3.5 pt-5 pb-4">
          <div className="flex flex-wrap gap-x-[18px] gap-y-3.5 font-mono text-mono-xs tracking-[0.08em] text-ink-3">
            <Legend mark="made">card made</Legend>
            <Legend mark="missed">missed</Legend>
            <Legend mark="missed" isToday>
              today
            </Legend>
            <Legend mark="future">not yet</Legend>
          </div>
          <Prose size="body">{MONTH.summary}</Prose>
        </div>
      </ScreenBody>
    </Screen>
  );
}

/** The key, drawn with the same glyph component as the grid so it cannot lie. */
function Legend({
  mark,
  isToday,
  children,
}: {
  mark: CalendarDayView["mark"];
  isToday?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <CalendarMarkGlyph mark={mark} isToday={isToday} /> {children}
    </span>
  );
}
