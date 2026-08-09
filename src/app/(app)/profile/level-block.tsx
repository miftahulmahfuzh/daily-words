import { LevelMark } from "@/components/gamification/level-mark";
import { LevelPill } from "@/components/ui/level-pill";
import { Eyebrow, Meta } from "@/components/ui/text";
import { LEVEL_TIER_COUNT, levelArtKey, levelCaption } from "@/lib/gamification/levels";
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
 * invented there; the slot says so plainly — and **no picture either**. There is
 * no tier at zero words, so there is nothing to illustrate; do not invent a "not
 * started" mark (F22 D5).
 *
 * F22 put the illustration to the LEFT of the pill and caption, on one row.
 * `min-w-0` on the text column is load-bearing: "Curator of Forgotten Tongues" is
 * the longest title in either table, and a flex child will not shrink below its
 * content width without it — which is how a pill pushes a row off the right edge
 * at 375px with nothing throwing.
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
  // Null only for an index outside the table, which `resolve()` cannot produce.
  // It draws nothing rather than throwing — `levelArtKey` mirrors `badgeTitle`.
  const artKey = level ? levelArtKey(kind, level.index) : null;

  return (
    <div className="flex shrink-0 flex-col items-start gap-2">
      <Eyebrow size="sm">{label}</Eyebrow>
      {level ? (
        <div className="flex w-full items-center gap-3">
          {artKey && <LevelMark artKey={artKey} />}
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <LevelPill
              kind={kind}
              label={level.title}
              tier={level.index + 1}
              tierCount={LEVEL_TIER_COUNT[kind]}
            />
            <Meta>{levelCaption(level, kind)}</Meta>
          </div>
        </div>
      ) : (
        <Meta>no words yet</Meta>
      )}
    </div>
  );
}
