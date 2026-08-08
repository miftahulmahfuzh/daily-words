import Link from "next/link";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { TextInput } from "@/components/ui/text-input";
import { Eyebrow } from "@/components/ui/text";
import { ONBOARDING } from "@/lib/sample-data";

/* Five questions, one per screen, every one skippable. The design prototype's
   placeholder questions asked things the app does not ask — "how many words on
   a card?" is locked at six, and "when should the card be ready?" schedules
   something the app deliberately never schedules. These follow F7. [R20] */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const step = Math.min(Math.max(Number(q ?? 1), 1), ONBOARDING.length);
  const question = ONBOARDING[step - 1];
  const last = step === ONBOARDING.length;
  const nextHref = last ? "/today" : `/onboarding?q=${step + 1}`;

  return (
    <Screen>
      <ScreenBody
        padded={false}
        className="px-6.5"
        // The tab bar is absent here, so the screen owes the bottom inset itself.
      >
        <div
          className="flex flex-1 flex-col"
          style={{ paddingBottom: "calc(var(--pad-bottom) + 20px)" }}
        >
          <div className="flex h-10 shrink-0 items-center justify-between">
            {/* Progress is five hairlines, not a bar with a percentage. The
                user is answering questions, not completing a task. */}
            <div className="flex gap-[5px]">
              {ONBOARDING.map((_, i) => (
                <span
                  key={i}
                  className={`h-px w-5 ${i < step ? "bg-ink" : "bg-rule"}`}
                />
              ))}
            </div>
            <Link
              href={nextHref}
              className="py-2 pl-4 font-mono text-mono-sm tracking-nav text-ink-3 uppercase"
            >
              Skip
            </Link>
          </div>

          <div className="flex flex-1 flex-col gap-2 pt-11">
            <Eyebrow>
              Question {step} of {ONBOARDING.length}
            </Eyebrow>
            <h2 className="m-0 mb-5.5 max-w-[280px] text-[28px] leading-[1.15] font-normal tracking-title text-pretty">
              {question.prompt}
            </h2>

            {question.kind === "options" ? (
              <div className="flex flex-col">
                {question.options?.map((option) => (
                  <ListRow
                    key={option}
                    title={option}
                    className="min-h-[56px] items-center py-4 pr-0.5 text-[19px]"
                    trailing={<span className="text-ink-3">✓</span>}
                  />
                ))}
              </div>
            ) : (
              <TextInput
                name={`q${step}`}
                variant="underline"
                placeholder={question.placeholder}
                autoCapitalize="sentences"
                className="pb-2.5"
                inputClassName="text-[26px]"
              />
            )}
          </div>

          <Button variant="filled" href={nextHref} className="shrink-0">
            {last ? "Start" : "Next"}
          </Button>
        </div>
      </ScreenBody>
    </Screen>
  );
}
