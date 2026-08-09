"use client";

import { LEVEL_TIER_COUNT } from "@/lib/gamification/levels";
import type { LevelProgressPayload } from "@/lib/gamification/schemas";
import type { LevelKind } from "@/lib/ui/types";
import { LevelBlock } from "./level-block";
import { levelSelection } from "./panel-selection";
import { useOpenPanel } from "./profile-panels";

/**
 * Both level blocks, made tappable.
 *
 * **The smallest unit that can be a client component**, exactly as
 * `badge-shelf.tsx` is for its rows: the page stays a server component and the
 * seventeen glosses travel in one cacheable chunk rather than through the RSC
 * payload on every request. `LevelProgressPayload` is imported as a **type** —
 * a value import of `levelProgressSchema` here is the 73 kB zod mistake
 * CLAUDE.md documents.
 *
 * The dialog is not here. It is one element for the whole page, owned by
 * `ProfilePanels`; see the note there for why an element and not just a
 * component.
 *
 * **Tapping is all this adds.** The panel states the tier and the rule in the
 * present tense and stops — no countdown, no ladder, no dimmed next tier. The
 * next tier's *name* is already under the pill in `levelCaption`; its picture
 * is the one thing withheld (F22 D5), and withholding it is what makes the
 * illustration changing a small event rather than a checklist item ticking.
 */
export function LevelBlocks({
  streakLevel,
  collectorLevel,
}: {
  streakLevel: LevelProgressPayload;
  collectorLevel: LevelProgressPayload | null;
}) {
  return (
    <>
      <Tappable kind="streak" label="Streak" level={streakLevel} />
      <Tappable kind="collector" label="Collection" level={collectorLevel} />
    </>
  );
}

/**
 * A `<button>` wrapping the existing block, exactly as `badge-shelf.tsx` wraps
 * `BadgeRow` — the kit is frozen and one caller needs this (F13 D6). The block
 * is at least 56px tall because of the mark inside it, clearing
 * `LAYOUT.touchMin`'s 44.
 *
 * **Not a button when there is no level.** At zero manual words there is no
 * tier, no art and nothing to open ([R13], F22 D5), so the "no words yet" slot
 * stays a plain block rather than becoming a control that does nothing.
 */
function Tappable({
  kind,
  label,
  level,
}: {
  kind: LevelKind;
  label: string;
  level: LevelProgressPayload | null;
}) {
  const open = useOpenPanel();

  if (!level) return <LevelBlock kind={kind} label={label} level={level} />;

  return (
    // The aria-label lives on the button, because that is the thing with a role.
    <button
      type="button"
      className="w-full text-left"
      aria-label={`${level.title}, ${kind} level ${level.index + 1} of ${LEVEL_TIER_COUNT[kind]}`}
      onClick={() => open(levelSelection(kind, level))}
    >
      <LevelBlock kind={kind} label={label} level={level} />
    </button>
  );
}
