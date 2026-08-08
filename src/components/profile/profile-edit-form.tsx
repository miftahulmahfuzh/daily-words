"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { ScreenBody, ScreenHeader } from "@/components/layout/screen";
import { ChipSelect } from "@/components/profile/chip-select";
import { InterestsField } from "@/components/profile/interests-field";
import { OptionRows } from "@/components/profile/option-rows";
import { TimezoneField } from "@/components/profile/timezone-field";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { Eyebrow, Meta } from "@/components/ui/text";
import { patchProfile, postTimezone } from "@/lib/profile/client";
import { completeProfileAnswers } from "@/lib/profile/normalize";
import { toggleExclusive } from "@/lib/profile/selection";
import {
  CHAT_TONE_OPTIONS,
  ENGLISH_CONTEXTS,
  ENGLISH_CONTEXT_LABELS,
  EXCLUSIVE_ENGLISH_CONTEXT,
  MAX_CONSUMING_LEN,
  MAX_OCCUPATION_LEN,
} from "@/lib/profile/constants";
import type { ProfileResponse } from "@/lib/profile/schemas";

/**
 * "Edit my answers" — one scrolling page, not a wizard.
 *
 * The wizard exists to get a stranger through five questions in under a minute.
 * A returning user wants to change one line, and walking them past four screens
 * they do not care about to reach it would be worse than the form they expected.
 * Same order, same labels, same inputs as the flow.
 *
 * Clearing a field and saving writes `null`: "I no longer want to answer that"
 * has to be expressible, or the only way out of a stale answer is a wrong one.
 *
 * The timezone is a second request, because it is a different resource with a
 * different rule — saving it by hand sets `timezone_source = 'manual'`, which
 * permanently stops the automatic re-detection in `<TimezoneSync />`. It goes
 * first, so a failure there does not leave the answers saved and the zone not.
 */

const CONTEXT_CHIPS = ENGLISH_CONTEXTS.map((slug) => ({
  value: slug,
  label: ENGLISH_CONTEXT_LABELS[slug],
}));

export function ProfileEditForm({ profile }: { profile: ProfileResponse }) {
  const router = useRouter();

  const [occupation, setOccupation] = useState(profile.occupation ?? "");
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [currently, setCurrently] = useState(profile.currentlyConsuming ?? "");
  const [contexts, setContexts] = useState<string[]>(profile.englishContexts ?? []);
  const [tone, setTone] = useState<string | null>(profile.chatTone);
  const [timezone, setTimezone] = useState(profile.timezone);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timezoneChanged = timezone !== profile.timezone;

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);

    if (timezoneChanged) {
      const tz = await postTimezone(timezone, true);
      if (!tz.ok) {
        setSaving(false);
        setError(tz.message);
        return;
      }
    }

    // All five are sent, because the form draws all five: a field left out here
    // would silently keep a value the user believes they cleared.
    const result = await patchProfile(
      completeProfileAnswers({
        occupation,
        interests,
        currentlyConsuming: currently,
        englishContexts: contexts,
        chatTone: tone,
      }),
    );

    if (!result.ok) {
      setSaving(false);
      setError(result.message);
      return;
    }

    router.push("/profile");
    router.refresh();
  }

  return (
    <>
      <ScreenBody
        scroll
        className="gap-6 pt-1 pb-6"
        top={
          <>
            <BackLink href="/profile" label="Profile" />
            <ScreenHeader className="pb-3.5" title="Your answers" />
          </>
        }
      >
        <Field id="occupation" label="What do you do?">
          <TextInput
            id="occupation"
            name="occupation"
            placeholder="teacher, student, nurse…"
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            maxLength={MAX_OCCUPATION_LEN}
          />
        </Field>

        <div className="flex flex-col gap-2.5">
          <Eyebrow>What are you into?</Eyebrow>
          <InterestsField value={interests} onChange={(next) => setInterests(next)} />
        </div>

        <Field id="currently" label="Reading or watching anything right now?">
          <TextInput
            id="currently"
            name="currently"
            placeholder="a book, a show, a channel"
            value={currently}
            onChange={(e) => setCurrently(e.target.value)}
            autoCapitalize="words"
            autoCorrect="on"
            spellCheck
            maxLength={MAX_CONSUMING_LEN}
          />
        </Field>

        <div className="flex flex-col gap-2.5">
          <Eyebrow>Where do you use English?</Eyebrow>
          <ChipSelect
            options={CONTEXT_CHIPS}
            selected={contexts}
            onToggle={(slug) =>
              setContexts((previous) =>
                toggleExclusive(previous, slug, EXCLUSIVE_ENGLISH_CONTEXT),
              )
            }
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <Eyebrow>How should the chat talk to you?</Eyebrow>
          <OptionRows options={CHAT_TONE_OPTIONS} value={tone} onChange={setTone} />
        </div>

        <TimezoneField
          value={timezone}
          storedSource={profile.timezoneSource}
          changed={timezoneChanged}
          onChange={setTimezone}
        />
      </ScreenBody>

      {/* Sticky by position, not by `position: fixed` — it is the last row of the
          Screen's flex column, which is what keeps it clear of iOS's moving URL
          bar. */}
      <div
        className="flex shrink-0 flex-col gap-2 border-t border-rule bg-paper px-[var(--gutter)] pt-3.5"
        style={{ paddingBottom: "calc(var(--pad-bottom) + 8px)" }}
      >
        {error && <Meta className="text-red">{error}</Meta>}
        <Button variant="filled" onClick={() => void save()} loading={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </>
  );
}
