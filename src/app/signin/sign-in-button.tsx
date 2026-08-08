"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * Must be rendered inside the <form> whose action is signInWithGoogle —
 * useFormStatus reads the enclosing form's pending state. The disabled state
 * matters on a phone: the OAuth hop is slow enough to invite a second tap.
 *
 * The one filled button in the app set in the serif rather than the mono. It is
 * a sentence addressed to a person — "Continue with Google" — not a command
 * label, and this screen has no other type on it to hold the line.
 */
export function SignInButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="filled"
      loading={pending}
      disabled={pending}
      className="h-[54px] gap-2.5 font-serif text-base tracking-normal normal-case"
    >
      {!pending && (
        <span className="inline-block size-[17px] rounded-full border-[1.5px] border-paper" />
      )}
      {pending ? "Taking you to Google…" : "Continue with Google"}
    </Button>
  );
}
