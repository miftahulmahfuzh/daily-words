import { BADGE_CATALOG } from "@/lib/gamification/badges";
import type { CardCreatedRewards } from "@/lib/gamification/schemas";

/**
 * The browser half of the reveal moment.
 *
 * **No `server-only` here, and no zod value import** — this ships to the phone.
 * `BADGE_CATALOG` is a pure array of strings and comes along harmlessly; the
 * schemas stay on the server and only their inferred types cross.
 *
 * Why a module-level channel rather than props: the button that receives
 * `rewards` is the one thing on /today that stops existing the moment the card
 * appears. `NudgeButton` is rendered inside `NoCardYet`, and the `router.refresh()`
 * that follows a successful press replaces that whole branch with the card — so
 * the component holding the payload unmounts before it could show anything. The
 * toast is mounted once, unconditionally, beside that branch; the press hands
 * the payload across.
 *
 * `latest` is a one-slot buffer so ordering can never matter. It is cleared on
 * read, which is what makes a `router.refresh()` — or a genuine reload — show
 * nothing a second time. Nothing is persisted: missing the toast is fine, and
 * the record is /profile.
 */

export type RewardLine = {
  /** Stable within one queue; only ever used as a React key. */
  id: string;
  label: string;
  text: string;
};

type Listener = (lines: RewardLine[]) => void;

let latest: RewardLine[] | null = null;
const listeners = new Set<Listener>();

/** Called by the nudge button with the `rewards` from `POST /api/cards`. */
export function publishRewards(rewards: CardCreatedRewards | null): void {
  const lines = toRewardLines(rewards);
  if (lines.length === 0) return;

  if (listeners.size === 0) {
    latest = lines;
    return;
  }
  for (const listener of listeners) listener(lines);
}

export function subscribeRewards(listener: Listener): () => void {
  listeners.add(listener);
  if (latest) {
    const pending = latest;
    latest = null;
    listener(pending);
  }
  return () => {
    listeners.delete(listener);
  };
}

const CATALOG_ORDER = new Map(BADGE_CATALOG.map((b, i) => [b.key as string, i]));

/**
 * Level-up first, then badges in catalog order. **At most three lines**, the
 * third collapsing into a pointer rather than a fourth toast — a queue long
 * enough to sit through is a takeover, and this is a courtesy.
 */
export function toRewardLines(rewards: CardCreatedRewards | null): RewardLine[] {
  if (!rewards) return [];

  const lines: RewardLine[] = [];
  if (rewards.levelUp) {
    lines.push({
      id: "level",
      label: "Level",
      text: rewards.levelUp.title,
    });
  }

  for (const badge of [...rewards.awardedBadges].sort(
    (a, b) => (CATALOG_ORDER.get(a.key) ?? 99) - (CATALOG_ORDER.get(b.key) ?? 99),
  )) {
    lines.push({ id: `badge:${badge.key}`, label: "Badge", text: badge.title });
  }

  if (lines.length <= 3) return lines;
  const shown = lines.slice(0, 2);
  shown.push({
    id: "more",
    label: "",
    text: `and ${lines.length - 2} more — see profile`,
  });
  return shown;
}
