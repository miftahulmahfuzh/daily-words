import { cn } from "@/lib/ui/cn";
import { MAX_ASSISTANT_TURNS } from "@/lib/chat/turn-policy";

/**
 * Eight dots in the header, filled as turns are used.
 *
 * No number and no "3 of 8" label, deliberately. The cap needs to be *felt* —
 * the conversation is finite and the user should sense it closing — but a
 * counter reads as a score, and a score is the thing this feature is explicitly
 * not ([R18] has no icons either, so a progress bar was never on the table).
 * Dots are ambient; you notice them filling without reading them.
 *
 * The count comes from `MAX_ASSISTANT_TURNS`, so the meter cannot disagree with
 * the cap the server enforces.
 */
export function TurnMeter({ used }: { used: number }) {
  return (
    <span
      className="flex items-center gap-[3px]"
      // The dots are decoration; this is the accessible reading of them.
      role="img"
      aria-label={`${Math.min(used, MAX_ASSISTANT_TURNS)} of ${MAX_ASSISTANT_TURNS} turns used`}
    >
      {Array.from({ length: MAX_ASSISTANT_TURNS }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "block size-[5px] rounded-full",
            i < used ? "bg-ink-3" : "bg-rule",
          )}
        />
      ))}
    </span>
  );
}
