import { Eyebrow } from "@/components/ui/text";
import { formatLocalDayMonth, toLocalDate } from "@/lib/time/local-date";

/**
 * `──── Round 2 · 14 August ────`
 *
 * Rendered above the first message of every round after the first. Old rounds
 * keep their normal bubble styling and are not dimmed: they are the user's own
 * sentences, and greying them out would say the practice did not count.
 *
 * The date is formatted in the user's timezone, like every other date in the
 * app — the roadmap's day-boundary rule has no exception for decoration.
 */
export function RoundDivider({
  round,
  startedAt,
  timezone,
}: {
  round: number;
  /** ISO instant of the round's first message. */
  startedAt: string;
  timezone: string;
}) {
  const day = formatLocalDayMonth(toLocalDate(new Date(startedAt), timezone));

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="h-px flex-1 bg-rule-2" />
      <Eyebrow size="sm" className="shrink-0 tracking-[0.18em]">
        Round {round} · {day}
      </Eyebrow>
      <span className="h-px flex-1 bg-rule-2" />
    </div>
  );
}
