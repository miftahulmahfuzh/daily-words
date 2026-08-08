import { Screen, ScreenBody } from "@/components/layout/screen";
import { AddWordForm } from "@/components/vocab/add-word-form";
import { requireUser } from "@/lib/auth/session";
import { recentEntries } from "@/lib/db/queries/vocab";

/**
 * One field, one button. The screen exists to capture a single word, so the
 * word is the largest thing on it and the field has no box to compete with.
 *
 * No tab bar: `/vocab/new` is not a tab, and the roadmap locks the bar to four
 * items. The entry point is the "+ Word" control in the /vocab header — the
 * design's only add affordance — plus F4's empty state and F5's short-card
 * prompt, all pointing here.
 */
export default async function AddWordPage() {
  const user = await requireUser();
  const recent = await recentEntries(user.id, 3);

  return (
    <Screen>
      <ScreenBody scroll padded={false} className="px-6 pb-7">
        <AddWordForm
          recent={recent.map((entry) => ({ id: entry.id, term: entry.term }))}
        />
      </ScreenBody>
    </Screen>
  );
}
