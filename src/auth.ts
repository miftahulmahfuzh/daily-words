import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/lib/db'
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema'
import { ensureProfile } from '@/lib/db/queries/profiles'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'database', maxAge: 60 * 60 * 24 * 90 }, // 90 days
  providers: [Google], // reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
  trustHost: true,
  pages: { signIn: '/signin' },
  callbacks: {
    // Database strategy: the callback gets the DB user row. Surface its id.
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
  events: {
    // Guarantee every user has a profile row from the first moment, so
    // getUserTimezone() is total and F5/F9 never carry a null branch.
    async createUser({ user }) {
      if (user.id) await ensureProfile(user.id)
    },
  },
})
