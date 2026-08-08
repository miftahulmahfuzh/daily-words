import Link from "next/link";
import { Screen } from "@/components/screen";

export default function SignInPage() {
  return (
    <Screen>
      <div
        className="dw-fade flex flex-1 flex-col px-8"
        style={{
          paddingTop: "calc(var(--pad-top) + 60px)",
          paddingBottom: "calc(var(--pad-bottom) + 30px)",
        }}
      >
        <div className="flex flex-1 flex-col justify-center gap-[18px]">
          <span className="font-mono text-[10px] tracking-[0.22em] text-ink-3 uppercase">
            Est. 2026
          </span>
          <h1 className="m-0 text-[40px] leading-[1.05] font-normal tracking-[-0.015em]">
            Daily
            <br />
            Words
          </h1>
          <div className="h-px w-11 bg-ink" />
          <p className="m-0 max-w-[250px] text-[17px] leading-[1.45] text-ink-2">
            Six words a day, on one card, in your pocket.
          </p>
        </div>

        <div className="flex flex-col gap-[18px]">
          <Link
            href="/onboarding"
            className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[var(--r-field)] border border-ink bg-ink text-[17px] text-paper"
          >
            <span className="inline-block size-[17px] rounded-full border-[1.5px] border-paper" />
            Continue with Google
          </Link>
          <p className="m-0 text-center font-mono text-[10px] leading-[1.7] tracking-[0.04em] text-ink-3">
            The only way in. No password to forget.
          </p>
        </div>
      </div>
    </Screen>
  );
}
