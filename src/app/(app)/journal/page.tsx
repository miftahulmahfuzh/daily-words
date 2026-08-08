import { Screen, ScreenBody } from "@/components/layout/screen";
import { ListRow } from "@/components/ui/list-row";
import { TextInput } from "@/components/ui/text-input";
import { JOURNAL } from "@/lib/sample-data";

/* The composer is a permanent textarea at the top — not behind a button, sheet
   or FAB. This screen is the one place the app-shell "+" is suppressed. [R3] */
export default function JournalPage() {
  return (
    <Screen tabs>
      <ScreenBody
        scroll
        className="pt-4.5 pb-3"
        top={
          <>
            <h1 className="m-0 mb-3.5 text-2xl font-normal tracking-title">
              Journal
            </h1>
            <TextInput
              name="entry"
              placeholder="Paste a line worth keeping"
              autoCapitalize="sentences"
              autoCorrect="on"
              spellCheck
              enterKeyHint="done"
              trailing={
                <button
                  type="button"
                  className="font-mono text-mono-xs tracking-nav text-accent uppercase"
                >
                  Save
                </button>
              }
            />
          </>
        }
      >
        {JOURNAL.map((entry) => (
          <ListRow
            key={entry.id}
            href={`/journal/${entry.id}`}
            layout="stacked"
            // Clamped to three lines so a pasted paragraph occupies the same
            // space as a proverb and the list stays scannable.
            title={entry.text}
            subtitle={
              <>
                {entry.source} · {entry.date}
              </>
            }
          />
        ))}
      </ScreenBody>
    </Screen>
  );
}
