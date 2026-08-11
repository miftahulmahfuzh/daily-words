"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { Eyebrow, Meta } from "@/components/ui/text";
import {
  BIRTHDAY_ERRORS,
  MIN_BIRTHDAY_YEAR,
  normalizeBirthday,
} from "@/lib/profile/birthday";
import { postBirthday } from "@/lib/profile/client";
import { ONBOARDING_DEFAULT_HREF } from "@/lib/share/policy";

/**
 * One question, asked once, of everybody.
 *
 * **Not a sixth `QuestionShell`, and not a sixth onboarding step.** The roadmap
 * caps that flow at five and `ONBOARDING_STEPS` is not a config value, so this is
 * its own screen — see `lib/profile/birthday.ts`. It borrows the flow's grammar
 * (a 40px chrome row with one muted text button, an eyebrow, a 28px question, the
 * input, one filled CTA at the foot) and deliberately drops the two things that
 * would make it read as a flow: the progress hairlines and "Question 1 of 5".
 * There is no back chevron either, because there is nothing behind this screen.
 *
 * **Both buttons write.** Skip stores no date and stamps `birthday_asked_at`,
 * which is the only reason this screen is not shown again tomorrow. So a failed
 * request must not navigate — otherwise the user is returned here on the next
 * open having been told it saved.
 *
 * `today` arrives from the server, computed in the *profile's* zone rather than
 * the browser's. It bounds the field and it is what `normalizeBirthday` reads;
 * constructing an `Intl.DateTimeFormat` here would be a second answer to "what
 * day is it" in a codebase that keeps exactly one.
 */
export function BirthdayPrompt({ today }: { today: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(birthday: string | null) {
    if (saving) return;

    // The client's copy of the rule, on the F3 precedent: it exists to keep the
    // form honest and the route is still the real gate. `type="date"` cannot
    // produce most of what this catches, but a browser that renders it as a plain
    // text field can produce all of it.
    const parsed = normalizeBirthday(birthday, today);
    if (!parsed.ok) {
      setError(BIRTHDAY_ERRORS[parsed.reason]);
      return;
    }

    setSaving(true);
    setError(null);

    const result = await postBirthday(parsed.value);
    if (!result.ok) {
      setSaving(false);
      setError(result.message);
      return;
    }

    // `replace`, so the back gesture cannot return to a screen the gate would
    // now bounce straight out of again — the same reason onboarding replaces.
    router.replace(ONBOARDING_DEFAULT_HREF);
  }

  return (
    <div
      className="flex flex-1 flex-col"
      style={{ paddingBottom: "calc(var(--pad-bottom) + 20px)" }}
    >
      <div className="flex h-10 shrink-0 items-center justify-end">
        <button
          type="button"
          onClick={() => void send(null)}
          disabled={saving}
          className="py-2 pl-4 font-mono text-mono-sm tracking-nav text-ink-3 uppercase"
        >
          Skip
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 pt-11">
        <Eyebrow>One question</Eyebrow>
        <h2 className="m-0 mb-5.5 max-w-[280px] text-[28px] leading-[1.15] font-normal tracking-title text-pretty">
          When is your birthday?
        </h2>
        <TextInput
          id="birthday"
          name="birthday"
          type="date"
          aria-label="When is your birthday?"
          variant="underline"
          inputClassName="text-[26px]"
          className="pb-2.5"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          min={`${MIN_BIRTHDAY_YEAR}-01-01`}
          max={today}
        />
        {/* The whole of the explanation. It is one badge, it is asked once, and
            saying so is cheaper than being asked why the app wants this. */}
        <Meta className="pt-3.5">
          It decides one badge, on the day itself. Nothing else reads it.
        </Meta>
      </div>

      {error && <Meta className="shrink-0 pb-3 text-red">{error}</Meta>}

      <Button
        variant="filled"
        onClick={() => void send(value)}
        loading={saving}
        className="shrink-0"
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
