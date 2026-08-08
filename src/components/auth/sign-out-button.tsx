'use client'

import { useFormStatus } from 'react-dom'

/** Rendered inside the <form> whose action is signOutAction. */
export function SignOutButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-[44px] w-full items-center justify-center rounded-[var(--r-field)] border border-rule font-mono text-[11px] tracking-[0.16em] text-ink-3 uppercase disabled:opacity-60"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
