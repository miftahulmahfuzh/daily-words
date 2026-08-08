import { redirect } from "next/navigation";
import { Screen } from "@/components/screen";
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
          <form action={signInWithGoogle}>
            <SignInButton />
          </form>
          <p className="m-0 text-center font-mono text-[10px] leading-[1.7] tracking-[0.04em] text-ink-3">
            The only way in. No password to forget.
          </p>
        </div>
      </div>
    </Screen>
  );
}
