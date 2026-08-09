"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionShell } from "@/components/onboarding/question-shell";
import { ChipSelect } from "@/components/profile/chip-select";
import { InterestsField } from "@/components/profile/interests-field";
import { OptionRows } from "@/components/profile/option-rows";
import { TimezoneCapture } from "@/components/profile/timezone-capture";
import { TextInput } from "@/components/ui/text-input";
import {
  CHAT_TONE_OPTIONS,
  ENGLISH_CONTEXTS,
  ENGLISH_CONTEXT_LABELS,
  EXCLUSIVE_ENGLISH_CONTEXT,
  MAX_CONSUMING_LEN,
  MAX_OCCUPATION_LEN,
  ONBOARDING_STEPS,
} from "@/lib/profile/constants";
import { completeOnboarding } from "@/lib/profile/client";
import { completeProfileAnswers } from "@/lib/profile/normalize";
import { toggleExclusive } from "@/lib/profile/selection";
import { detectTimeZone } from "@/lib/profile/timezone";
import { ONBOARDING_DEFAULT_HREF } from "@/lib/share/policy";

/**
 * Five questions, one screen each, every one skippable, one write at the end.
 *
 * The step is React state, not a route and not a `?q=` param. Five route
 * transitions on a phone is five spinners, and the answers would have to be
 * serialised between them. The cost is that the iOS edge-swipe leaves the flow
 * rather than stepping back through it — which is why `QuestionShell` draws its
 * own back chevron, and why the gate returns an abandoning user to question one.
 *
 * Nothing is persisted until `Done`. Abandoning at question three loses three
 * taps; the alternative is five requests, five failure modes, and an
 * `onboarded_at` that is still null, so nothing would have been recovered.
 */

const CONTEXT_CHIPS = ENGLISH_CONTEXTS.map((slug) => ({
  value: slug,
  label: ENGLISH_CONTEXT_LABELS[slug],
}));

const QUESTIONS = [
  "What do you do?",
  "What are you into?",
  "Reading or watching anything right now?",
  "Where do you use English?",
  "How should the chat talk to you?",
] as const;

type Answers = {
  occupation: string;
  interests: string[];
  currentlyConsuming: string;
  englishContexts: string[];
  chatTone: string | null;
};

const EMPTY: Answers = {
  occupation: "",
  interests: [],
  currentlyConsuming: "",
  englishContexts: [],
  chatTone: null,
};

/**
 * The flow always starts blank, and takes no initial answers.
 *
 * Pre-filling from the row was tried and removed: the only way to have answers
 * with a null `onboarded_at` is a hand-edited database, and it made screen one
 * read as a form over the user's existing data — where `Skip all` writes five
 * nulls. F7 §13.8 is explicit that an abandoning user restarts at question one.
 */
export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const last = step === ONBOARDING_STEPS - 1;

  function set<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * The functional form, for the two multi-selects. A handler that computed the
   * next array from the value it was rendered with dropped every tap that landed
   * before React flushed the previous one — six chips gave three selections.
   */
  function update<K extends keyof Answers>(
    key: K,
    next: (previous: Answers[K]) => Answers[K],
  ) {
    setAnswers((prev) => ({ ...prev, [key]: next(prev[key]) }));
  }

  async function submit(final: Answers) {
    if (saving) return;
    setSaving(true);
    setError(null);

    const result = await completeOnboarding({
      ...completeProfileAnswers({
        occupation: final.occupation,
        interests: final.interests,
        currentlyConsuming: final.currentlyConsuming,
        englishContexts: final.englishContexts,
        chatTone: final.chatTone,
      }),
      timezone: detectTimeZone() ?? undefined,
    });

    if (!result.ok) {
      // Answers stay in state; nothing is lost and the button comes back.
      // No retry loop — a failed write on a phone is usually a tunnel, and
      // spinning against it drains the battery instead of the problem.
      setSaving(false);
      setError("Couldn't save. Try again.");
      return;
    }

    /**
     * `replace`, so the back gesture from the destination does not return to a
     * flow the gate would immediately bounce out of again.
     *
     * The destination comes from the server (F18 D13 step 2). It is `/today`
     * for everyone except a stranger who arrived from a shared journal entry and
     * tapped "Start your own journal" — they get `/journal`, with an **empty**
     * composer. The route chooses between two literals; nothing here builds a
     * path, and the fallback exists so an older server that has never heard of
     * `next` still lands somebody sensible.
     */
    router.replace(result.data.next || ONBOARDING_DEFAULT_HREF);
  }

  function advance(next: Answers) {
    setAnswers(next);
    if (last) void submit(next);
    else setStep((s) => s + 1);
  }

  /** Clears this question's answer and moves on. Screen 5's finishes the flow. */
  function skip() {
    const cleared: Answers = { ...answers };
    if (step === 0) cleared.occupation = "";
    if (step === 1) cleared.interests = [];
    if (step === 2) cleared.currentlyConsuming = "";
    if (step === 3) cleared.englishContexts = [];
    if (step === 4) cleared.chatTone = null;
    advance(cleared);
  }

  /** One tap out of the whole flow, for the user who will not answer questions. */
  function skipAll() {
    setAnswers(EMPTY);
    void submit(EMPTY);
  }

  const enterAdvances = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      advance(answers);
    }
  };

  return (
    <>
      {/* Mounted at the root rather than inside screen one, so stepping forward
          cannot unmount and re-fire it. */}
      <TimezoneCapture />

      <div key={step} className="dw-fade flex min-h-0 flex-1 flex-col">
        <QuestionShell
          step={step + 1}
          total={ONBOARDING_STEPS}
          question={QUESTIONS[step]}
          onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
          skipLabel={step === 0 ? "Skip all" : "Skip"}
          onSkip={step === 0 ? skipAll : skip}
          ctaLabel={saving ? "Saving…" : last ? "Done" : "Next"}
          onNext={() => advance(answers)}
          busy={saving}
          error={error}
        >
          {step === 0 && (
            <TextInput
              name="occupation"
              aria-label={QUESTIONS[0]}
              variant="underline"
              placeholder="teacher, student, nurse…"
              inputClassName="text-[26px]"
              className="pb-2.5"
              value={answers.occupation}
              onChange={(e) => set("occupation", e.target.value)}
              onKeyDown={enterAdvances}
              // Overridden from TextInput's /vocab/new defaults: this is prose
              // about a person, not a headword whose spelling iOS must not
              // "repair" behind the app's back.
              autoCapitalize="sentences"
              autoCorrect="on"
              spellCheck
              enterKeyHint="next"
              maxLength={MAX_OCCUPATION_LEN}
            />
          )}

          {step === 1 && (
            <InterestsField
              value={answers.interests}
              onChange={(next) => update("interests", next)}
            />
          )}

          {step === 2 && (
            <TextInput
              name="currently-consuming"
              aria-label={QUESTIONS[2]}
              variant="underline"
              placeholder="a book, a show, a channel"
              inputClassName="text-[26px]"
              className="pb-2.5"
              value={answers.currentlyConsuming}
              onChange={(e) => set("currentlyConsuming", e.target.value)}
              onKeyDown={enterAdvances}
              autoCapitalize="words"
              autoCorrect="on"
              spellCheck
              enterKeyHint="next"
              maxLength={MAX_CONSUMING_LEN}
            />
          )}

          {step === 3 && (
            <ChipSelect
              options={CONTEXT_CHIPS}
              selected={answers.englishContexts}
              onToggle={(slug) =>
                update("englishContexts", (previous) =>
                  toggleExclusive(previous, slug, EXCLUSIVE_ENGLISH_CONTEXT),
                )
              }
            />
          )}

          {step === 4 && (
            <OptionRows
              options={CHAT_TONE_OPTIONS}
              value={answers.chatTone}
              onChange={(next) => set("chatTone", next)}
            />
          )}
        </QuestionShell>
      </div>
    </>
  );
}
