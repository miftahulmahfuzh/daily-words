import { Screen, ScreenBody } from "@/components/layout/screen";
import { EmptyState } from "@/components/ui/empty-state";
import { vocabListHref } from "@/lib/vocab/links";

/**
 * Reached three ways: a malformed id, a deleted word, and another account's
 * word. All three say the same thing on purpose — telling the third case apart
 * would confirm that somebody else's id exists.
 */
export default function WordNotFound() {
  return (
    <Screen>
      <ScreenBody className="pb-7">
        <EmptyState
          title="Not in your collection"
          body="That word has been removed, or was never here."
          action={{ label: "Collection", href: vocabListHref() }}
        />
      </ScreenBody>
    </Screen>
  );
}
