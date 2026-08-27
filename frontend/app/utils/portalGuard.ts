/**
 * Shared portal route guard — the one implementation behind BOTH
 * student/app/middleware/student-auth.global.ts and
 * institute/app/middleware/institute-auth.global.ts.
 *
 * Those two files used to hold byte-identical copies of this logic, with a
 * comment begging future editors to keep them in sync. Since the layers merge
 * into a single Nuxt app, both are registered globally and both run on every
 * navigation — so the duplication bought nothing and risked drift. They now
 * both delegate here; running twice is harmless (the guard is idempotent).
 *
 * Behaviour:
 *   • Not logged in + protected path        → /login?redirect=<original>
 *   • Logged in + wrong role for the path   → bounced to THEIR portal
 *   • Logged in + right role, but the page's permission area is `none`
 *                                           → bounced to a page they CAN see
 *
 * That last rule is what makes the admin panel's Role Matrix real: a Professor
 * with `none` on seats_cohorts cannot reach /institute/seats-billing by typing
 * the URL. The API enforces the same matrix independently (perm: middleware on
 * routes/api-institute.php), so this is UX, not the security boundary.
 *
 * Role-name compatibility: users.role has been seen as 'institution-admin',
 * 'institute-admin' and 'institute_admin' during development. INSTITUTE_ROLES
 * in roles.ts accepts every known spelling — add new ones there.
 */

import type { RouteLocationNormalized } from 'vue-router'
import { INSTITUTE_ROLES, roleHomePath } from './roles'
import { areaForPath, hasPermission, firstAllowedInstitutePath } from '../../../institute/app/utils/institutePermissions'

const STUDENT_ROLES = ['student']

const ROUTE_GUARDS: Array<{ prefix: string; allowedRoles: string[] }> = [
  { prefix: '/student',   allowedRoles: STUDENT_ROLES },
  { prefix: '/institute', allowedRoles: INSTITUTE_ROLES },
]

export async function runPortalGuard (to: RouteLocationNormalized) {
  const guard = ROUTE_GUARDS.find(g => to.path.startsWith(g.prefix))
  if (!guard) return

  // SSR cannot reliably read the api.passmed.com session cookie in dev
  // (cross-domain). Defer auth checks to the client, where the auth state
  // has been populated.
  if (import.meta.server) return

  const { user, fetchMe } = useAuth()

  if (!user.value) await fetchMe()

  // Stage 1 — logged in?
  if (!user.value) {
    // frontend/app/pages/login.vue reads route.query.redirect to decide where
    // to send the user after a successful login. Keep the param name in sync.
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  // Stage 2 — right audience for this section?
  //
  // Multi-role users are judged by their AVAILABLE PORTALS (membership-based, from the
  // login/me payload), not just their global users.role — so a student who is also an
  // institution admin can reach /institute, and vice-versa. Falls back to the global-role
  // check when available_portals isn't present (older sessions).
  const role    = String((user.value as any)?.role || '').toLowerCase()
  const allowed = guard.allowedRoles.map(r => r.toLowerCase())
  const portals = (((user.value as any)?.available_portals) || [])
    .map((p: any) => String(p?.path || ''))

  const canEnter = portals.includes(guard.prefix) || allowed.includes(role)
  if (!canEnter) {
    // Send them to a section they CAN enter (their first portal, else role home).
    return navigateTo(portals[0] || roleHomePath(role))
  }

  // Stage 3 — permission matrix (institute portal only; students have no matrix).
  if (guard.prefix !== '/institute') return

  const area = areaForPath(to.path)
  if (!area) return                                  // dashboard / help / contact

  if (!hasPermission(user.value, area, 'view')) {
    const fallback = firstAllowedInstitutePath(user.value)
    // Avoid a redirect loop if the fallback is itself blocked.
    return navigateTo(fallback === to.path ? '/institute' : fallback)
  }
}
