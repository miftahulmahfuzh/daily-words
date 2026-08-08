import { Screen, ScreenBody, BackLink } from "@/components/screen";
import { MONTH } from "@/lib/sample-data";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

type Cell = { n: number | null; state: "made" | "missed" | "today" | "future" };

function buildCells(): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < MONTH.firstWeekday; i++) {
    cells.push({ n: null, state: "future" });
  }
  for (let d = 1; d <= MONTH.days; d++) {
    const state =
      d === MONTH.today
        ? "today"
        : d > MONTH.today
          ? "future"
          : MONTH.made.has(d)
            ? "made"
            : "missed";
    cells.push({ n: d, state });
  }
  return cells;
}

export default function CalendarPage() {
  const cells = buildCells();

  return (
    <Screen tabs>
      <ScreenBody scroll>
        <div className="flex items-center justify-between pb-4">
          <BackLink href="/today" label="Today" />
          <div className="flex items-center gap-3.5">
            <span className="font-mono text-[14px] text-ink-3">‹</span>
            <span className="text-[19px]">{MONTH.label}</span>
            <span className="font-mono text-[14px] text-ink-3">›</span>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0.5 pb-2">
          {DOW.map((d, i) => (
            <span
              key={i}
              className="text-center font-mono text-[9px] tracking-[0.12em] text-ink-3 uppercase"
            >
              {d}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell, i) => (
            <div
              key={i}
              className="flex aspect-square flex-col items-center justify-center gap-1"
            >
              {cell.n !== null && (
                <>
                  <span
                    className={`font-mono text-[11px] ${
                      cell.state === "today" ? "text-ink" : "text-ink-3"
                    }`}
                  >
                    {cell.n}
                  </span>
                  {cell.state === "made" && (
                    <span className="text-[12px] text-accent">✓</span>
                  )}
                  {cell.state === "missed" && (
                    <span className="text-[11px] text-miss">✕</span>
                  )}
                  {/* Today is an open ring, never a cross — the day is not a
                      failure until it is over. */}
                  {cell.state === "today" && (
                    <span className="inline-block size-[9px] rounded-full border border-ink" />
                  )}
                  {cell.state === "future" && (
                    <span className="inline-block h-px w-[9px] bg-rule" />
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3.5 pt-5 pb-4">
          <div className="flex flex-wrap gap-x-[18px] gap-y-3.5 font-mono text-[10px] tracking-[0.08em] text-ink-3">
            <span className="flex items-center gap-1.5">
              <span className="text-[12px] text-accent">✓</span> card made
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[11px] text-miss">✕</span> missed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-[9px] rounded-full border border-ink" />{" "}
              today
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-px w-[9px] bg-rule" /> not yet
            </span>
          </div>
          <p className="m-0 text-[16px] leading-[1.4] text-ink-2">
            {MONTH.summary}
          </p>
        </div>
      </ScreenBody>
    </Screen>
  );
}
