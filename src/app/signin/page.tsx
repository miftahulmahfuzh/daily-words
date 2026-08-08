import { redirect } from "next/navigation";
import { Screen, ScreenBody } from "@/components/layout/screen";
import { Eyebrow, Prose } from "@/components/ui/text";
import { getSessionUser } from "@/lib/auth/session";
import { signInWithGoogle } from "@/lib/auth/actions";
import { SignInButton } from "./sign-in-button";

export default async function SignInPage() {
  // A real session read, not a cookie sniff. Middleware cannot make this call:
  // a stale cookie looks identical to a live one there, and acting on it loops.
  const user = await getSessionUser();
  if (user) redirect("/today");

  return (
    <Screen>
      <ScreenBody padded={false} className="dw-fade px-8">
        <div
          className="flex flex-1 flex-col pt-[60px]"
          style={{ paddingBottom: "calc(var(--pad-bottom) + 30px)" }}
        >
          <div className="flex flex-1 flex-col justify-center gap-[18px]">
            <Eyebrow className="tracking-[0.22em]">Est. 2026</Eyebrow>
            <h1 className="m-0 text-[40px] leading-[1.05] font-normal tracking-[-0.015em]">
              Daily
              <br />
              Words
            </h1>
            <div className="h-px w-11 bg-ink" />
            <Prose className="max-w-[250px]">
              Six words a day, on one card, in your pocket.
            </Prose>
          </div>

          <div className="flex shrink-0 flex-col gap-[18px]">
            <form action={signInWithGoogle}>
              <SignInButton />
            </form>
            <p className="m-0 text-center font-mono text-mono-xs leading-[1.7] tracking-[0.04em] text-ink-3">
              The only way in. No password to forget.
            </p>
          </div>
        </div>
      </ScreenBody>
    </Screen>
  );
}
