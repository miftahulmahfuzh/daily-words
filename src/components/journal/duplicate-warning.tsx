import Link from "next/link";
import { Eyebrow, Meta } from "@/components/ui/text";
import { duplicateMatchMeta } from "@/lib/journal/format";
import { journalEntryHref } from "@/lib/journal/links";
import {
  DUPLICATE_DISMISS_LABEL,
  DUPLICATE_HEADING,
  DUPLICATE_KEEP_LABEL,
} from "@/lib/journal/limits";
import type { DuplicateMatchDto } from "@/lib/journal/schemas";

/**
 * "You kept this already" — the whole of [S4]'s softening, on screen.
 *
 * **A block, not a modal.** The app has exactly one modal (F13's badge dialog,
 * on `/profile`) and this is not a second one: it appears under the composer
 * where the counter and the error already appear, so the screen keeps its
 * one-column rhythm and nothing is trapped behind a backdrop. A save is never
 * lost to it — `Keep it anyway` is one tap and re-POSTs with `force: true`.
 *
 * The register is F10 §7's: plain, no exclamation, no second person telling the
 * user what to do. It states what is true and offers two ways forward, and the
 * accented one is the one that keeps the line. It does not scold, because the
 * user has done nothing wrong — they met a good saying twice.
 *
 * The link out is deliberately **not** the primary action: following it
 * abandons the save, which is the one way to lose the paste from here.
 */
export function DuplicateWarning({
  match,
  onKeep,
  onDismiss,
}: {
  match: DuplicateMatchDto;
  onKeep: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="dw-in flex flex-col gap-2 border-l-2 border-ink-3/40 pl-3"
    >
      <Eyebrow>{DUPLICATE_HEADING}</Eyebrow>

      <Link href={journalEntryHref(match.id)} className="flex flex-col gap-1 no-underline">
        <span className="line-clamp-3 text-base text-ink">{match.excerpt}</span>
        <Meta>{duplicateMatchMeta(match)}</Meta>
      </Link>

      <div className="flex min-h-[44px] items-center gap-4">
        {/* The composer's Save treatment, so the two accented actions on this
            screen look like the same kind of thing. */}
        <button
          type="button"
          onClick={onKeep}
          className="py-2 font-mono text-mono-sm tracking-nav text-accent uppercase"
        >
          {DUPLICATE_KEEP_LABEL}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="py-2 font-mono text-mono-sm tracking-nav text-ink-3 uppercase"
        >
          {DUPLICATE_DISMISS_LABEL}
        </button>
      </div>
    </div>
  );
}
