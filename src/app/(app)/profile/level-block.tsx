import { LevelPill } from "@/components/ui/level-pill";
import { Eyebrow, Meta } from "@/components/ui/text";
import { LEVEL_TIER_COUNT, levelCaption } from "@/lib/gamification/levels";
import type { LevelProgressPayload } from "@/lib/gamification/schemas";
import type { LevelKind } from "@/lib/ui/types";

/**
 * One level: its label, its title, and how far the next one is.
 *
 * **No progress bar.** F9's plan §10.2 specified a 4px filled track under each
 * title; [R18] makes the Claude Design output the visual source of truth and it
 * has none — the design draws an accent pill and one mono line, and F2 shipped
 * `LevelPill` to match, with the tier surviving only in the `title` attribute.
 * The bar would also have been the one engagement flourish on a page whose whole
 * argument is that it is a record rather than a dashboard.
 *
 * `level` is null only for the collector table at zero words ([R13]). No title is
 * invented there; the slot says so plainly.
 */
export function LevelBlock({
  kind,
  label,
  level,
}: {
  kind: LevelKind;
  label: string;
  level: LevelProgressPayload | null;
}) {
  return (
    <div className="flex shrink-0 flex-col items-start gap-2">
      <Eyebrow size="sm">{label}</Eyebrow>
      {level ? (
        <>
          <LevelPill
            kind={kind}
            label={level.title}
            tier={level.index + 1}
            tierCount={LEVEL_TIER_COUNT[kind]}
          />
          <Meta>{levelCaption(level, kind)}</Meta>
        </>
      ) : (
        <Meta>no words yet</Meta>
      )}
    </div>
  );
}
