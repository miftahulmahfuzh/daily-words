import { Screen } from "@/components/layout/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatBubbleTyping } from "@/components/ui/chat-bubble";

/**
 * The shell, painted before the transcript arrives.
 *
 * A typing bubble rather than a spinner, because that is what the screen shows
 * a moment later anyway while the opener generates — so the transition from
 * loading to loaded is invisible, and the user never sees an empty composer
 * inviting them to speak first.
 */
export default function ChatLoading() {
  return (
    <Screen>
      <div
        className="flex shrink-0 items-center justify-between border-b border-rule px-[var(--gutter)] pb-3"
        style={{ paddingTop: "var(--pad-top)" }}
      >
        <Skeleton width={60} height={14} />
        <Skeleton width={90} height={18} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-[var(--gutter)] py-5">
        <ChatBubbleTyping />
      </div>
    </Screen>
  );
}
