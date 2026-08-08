"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** Rendered inside the <form> whose action is signOutAction. */
export function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      loading={pending}
      className="text-mono-sm tracking-cta text-ink-3"
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
