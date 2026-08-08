import Link from "next/link";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { TextInput } from "@/components/ui/text-input";
import { Eyebrow } from "@/components/ui/text";

const RECENT = ["truculent", "obviate", "sanguine"];

/**
 * One field, one button. The screen exists to capture a single word, so the
 * word is the largest thing on it and the field has no box to compete with.
 */
export default function AddWordPage() {
  return (
    <Screen>
      <ScreenBody padded={false} className="px-6">
        <div className="flex h-11 shrink-0 items-center justify-between">
          <Eyebrow>Add a word</Eyebrow>
          <Link
            href="/vocab"
            className="py-2 pl-4 font-mono text-mono-sm tracking-nav text-ink-3 uppercase"
          >
            Close
          </Link>
        </div>

        <div className="shrink-0 pt-6">
          <Field
            id="term"
            label="Word"
            hideLabel
            hint="Pronunciation and meaning are fetched for you."
          >
            {/* autoCorrect and spellCheck are off by default in TextInput,
                deliberately: iOS silently repairs "genteell" before the app ever
                sees it, which would make typo correction impossible to trigger. */}
            <TextInput
              id="term"
              name="term"
              variant="underline"
              placeholder="word"
              inputClassName="text-[30px] tracking-title"
            />
          </Field>
        </div>

        <Button variant="filled" className="mt-[22px] shrink-0">
          Add
        </Button>

        <div className="flex shrink-0 flex-col gap-2.5 pt-6">
          <Eyebrow size="sm">Just added</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {RECENT.map((word) => (
              <Pill key={word} href={`/vocab/${word}`}>
                {word}
              </Pill>
            ))}
          </div>
        </div>
      </ScreenBody>
    </Screen>
  );
}
