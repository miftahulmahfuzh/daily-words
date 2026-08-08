import { requireUser } from '@/lib/auth/session'

/**
 * The authoritative auth guard for every signed-in route.
 *
 * It deliberately renders no chrome. Each screen owns its own frame through the
 * `Screen` primitive (which is what holds the no-scroll vertical budget and the
 * tab bar), so wrapping them in a second header/main/footer here would break
 * the layout maths the design depends on.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return <>{children}</>
}
