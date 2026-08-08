'use server'

import { signIn, signOut } from '@/auth'

/** Google is the only way in, by locked decision. There is no other provider. */
export async function signInWithGoogle(): Promise<void> {
  await signIn('google', { redirectTo: '/today' })
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/signin' })
}
