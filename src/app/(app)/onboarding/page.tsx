import Link from "next/link";
import { Screen } from "@/components/screen";
import { ONBOARDING } from "@/lib/sample-data";

/* Five questions, one per screen, every one skippable. The design prototype's
   placeholder questions asked things the app does not ask; these follow F7. [R20] */
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
      <div
        className="flex flex-1 flex-col px-6.5"
        style={{
          paddingTop: "var(--pad-top)",
          paddingBottom: "calc(var(--pad-bottom) + 20px)",
        }}
      >
        <div className="flex h-10 items-center justify-between">
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
            className="py-2 pl-4 font-mono text-[11px] tracking-[0.14em] text-ink-3 uppercase"
          >
            Skip
          </Link>
        </div>

        <div className="flex flex-1 flex-col gap-2 pt-11">
          <span className="font-mono text-[10px] tracking-[0.2em] text-ink-3 uppercase">
            Question {step} of {ONBOARDING.length}
          </span>
          <h2 className="m-0 mb-5.5 max-w-[280px] text-[28px] leading-[1.15] font-normal tracking-[-0.01em] text-pretty">
            {question.prompt}
          </h2>

          {question.kind === "options" ? (
            <div className="flex flex-col">
              {question.options?.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="flex min-h-[56px] items-center justify-between gap-3 border-b border-rule-2 px-0.5 py-4 text-left text-[19px] text-ink"
                >
                  <span>{option}</span>
                  <span className="text-ink-3">✓</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="border-b border-ink pb-2.5">
              <input
                type="text"
                placeholder={question.placeholder}
                className="w-full bg-transparent text-[26px] text-ink outline-none placeholder:text-ink-3"
              />
            </div>
          )}
        </div>

        <Link
          href={nextHref}
          className="flex h-[52px] w-full items-center justify-center rounded-[var(--r-field)] border border-ink bg-ink font-mono text-[12px] tracking-[0.16em] text-paper uppercase"
        >
          {last ? "Start" : "Next"}
        </Link>
      </div>
    </Screen>
  );
}
