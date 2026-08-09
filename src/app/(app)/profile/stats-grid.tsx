import { Eyebrow, Meta } from "@/components/ui/text";
import type { ProfileStats } from "@/lib/gamification/schemas";

/**
 * The four numbers, in the design's ruled 2×2 grid — readings off one
 * instrument, not four separate cards.
 *
 * Under it, one muted line about today. Its whole job is to be *not* a warning:
 * body-text colour, same weight as everything else, no amber, no countdown, no
 * "before midnight". A day still in progress is a fact, not a deadline, and at
 * 23:50 the line says exactly what it said at 09:00.
 *
 * When the run has ended the line is "no streak right now", and nothing follows
 * it — no encouragement, no call to action, no reference to what was lost.
 */
export function StatsGrid({ stats }: { stats: ProfileStats }) {
  const figures = [
    { n: stats.currentStreak, label: "Current streak" },
    { n: stats.longestStreak, label: "Longest streak" },
    { n: stats.totalCards, label: "Cards made" },
    { n: stats.totalManualWords, label: "Words collected" },
  ];

  return (
    <>
      <div className="grid shrink-0 grid-cols-2 border-t border-l border-rule">
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="flex flex-col gap-[5px] border-r border-b border-rule px-3.5 py-4"
          >
            <span className="text-[32px] leading-none tracking-display tabular-nums">
              {figure.n}
            </span>
            <Eyebrow size="sm" className="tracking-[0.16em]">
              {figure.label}
            </Eyebrow>
          </div>
        ))}
      </div>
      <Meta className="shrink-0 pt-3">{todayLine(stats)}</Meta>
    </>
  );
}

function todayLine(stats: ProfileStats): string {
  if (stats.currentStreak === 0) return "no streak right now";
  return stats.hasCardToday
    ? "today’s card is made"
    : "today’s card is not made yet";
}
