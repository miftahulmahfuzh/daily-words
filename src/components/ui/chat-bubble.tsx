import { cn } from "@/lib/ui/cn";
import type { ChatRole } from "@/lib/ui/types";
import { Eyebrow } from "./text";

/**
 * One turn in the practice chat.
 *
 * The assistant speaks first, so an assistant bubble must look right as the
 * very first element on the screen with no user turn above it — hence the
 * optional `eyebrow`, which the opener uses to say "Scenario" and set the
 * frame. No avatars, no names, no timestamps: there are two participants and
 * the alignment already says which is which. The turn counter belongs in the
 * header, not in a bubble.
 */
export function ChatBubble({
  role,
  eyebrow,
  children,
  state = "sent",
  className,
}: {
  role: ChatRole;
  /** A short uppercase framing label. The opener's "Scenario". */
  eyebrow?: string;
  /** Plain text. No markdown rendering in v0.1.0. */
  children: React.ReactNode;
  state?: "sent" | "pending" | "failed";
  className?: string;
}) {
  const assistant = role === "assistant";

  return (
    <div className={cn("flex", assistant ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[86%] rounded-[var(--r-card)] px-3.5 py-3",
          assistant
            ? "rounded-bl-[var(--r-chip)] bg-card"
            : "rounded-br-[var(--r-chip)] bg-accent-soft",
          state === "pending" && "opacity-60",
          state === "failed" && "border border-red",
          className,
        )}
      >
        {eyebrow && (
          <Eyebrow size="sm" className="block pb-2 tracking-[0.18em]">
            {eyebrow}
          </Eyebrow>
        )}
        <span className="text-base text-ink text-pretty">{children}</span>
      </div>
    </div>
  );
}

/** Three dots while the model composes. The only looping animation in the app. */
export function ChatBubbleTyping() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-[var(--r-card)] rounded-bl-[var(--r-chip)] bg-card px-3.5 py-4">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block size-[5px] animate-pulse rounded-full bg-ink-3"
            style={{ animationDelay: `${i * 200}ms`, animationDuration: "1200ms" }}
          />
        ))}
        <span className="sr-only">Composing</span>
      </div>
    </div>
  );
}
