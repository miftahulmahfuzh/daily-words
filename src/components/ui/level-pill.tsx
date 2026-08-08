import type { LevelKind } from "@/lib/ui/types";
import { Pill } from "./pill";

/**
 * A streak or collector level, drawn as the design draws it: an accent-outlined
 * pill carrying the title and nothing else.
 *
 * F2 §6.11 proposed a tier ramp — the fill stepping in opacity with
 * `tier / tierCount` — as a way of showing progression without a progress bar.
 * ROADMAP [R18] makes the design authoritative and the design has no ramp, so
 * the ramp is gone. The tier survives only in the `title` attribute, where it
 * costs no ink.
 *
 * Collector level is undefined at zero words ([R13]); the caller renders "no
 * words yet" instead of asking for a pill with no label.
 */
export function LevelPill({
  kind,
  label,
  tier,
  tierCount,
  className,
}: {
  kind: LevelKind;
  /** The exact title string from the roadmap's table, e.g. "Keeper of the Pocket". */
  label: string;
  /** 1-based index into that table. */
  tier: number;
  /** 9 for streak, 8 for collector. */
  tierCount: number;
  className?: string;
}) {
  return (
    <Pill
      tone="accent"
      className={className}
      // Title, not visible text: the level name is the reward, and a "4 of 9"
      // beside it turns a compliment into a progress meter.
      {...{ title: `${label} — ${kind} level ${tier} of ${tierCount}` }}
    >
      {label}
    </Pill>
  );
}
