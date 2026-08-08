'use client'

import { useFormStatus } from 'react-dom'

/**
 * Must be rendered inside the <form> whose action is signInWithGoogle —
 * useFormStatus reads the enclosing form's pending state. The disabled state
 * matters on a phone: the OAuth hop is slow enough to invite a second tap.
 */
export function SignInButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[var(--r-field)] border border-ink bg-ink text-[17px] text-paper disabled:opacity-60"
    >
      <span className="inline-block size-[17px] rounded-full border-[1.5px] border-paper" />
      {pending ? 'Taking you to Google…' : 'Continue with Google'}
    </button>
  )
}
