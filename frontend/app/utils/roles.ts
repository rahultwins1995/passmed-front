/**
 * Single source of truth for role → portal routing.
 *
 * The institute role arrives in several spellings depending on the backend
 * path ('institution-admin', 'institute-admin', 'institute_admin', 'institute').
 * This list and the mapping were previously duplicated in login.vue,
 * useSocialAuth.ts, the signup flow, and AppHeader — and AppHeader only handled
 * two of the four, so some admins landed on "/" instead of "/institute".
 * Everything now goes through roleHomePath() so the variants stay in sync.
 */
export const INSTITUTE_ROLES = [
  'institution-admin',
  'institute-admin',
  'institute_admin',
  'institute',
  // Professors are institute teaching staff and land in /institute too. What
  // they can actually see/do there is decided by the permission matrix
  // (see institutePermissions.ts), not by this list.
  'professor',
]

export function isInstituteRole (role?: string | null): boolean {
  return INSTITUTE_ROLES.includes(String(role || '').toLowerCase())
}

/** Portal landing path for a given user role. Defaults to '/' for unknown roles. */
export function roleHomePath (role?: string | null): string {
  const r = String(role || '').toLowerCase()
  if (r === 'student') return '/student'
  if (INSTITUTE_ROLES.includes(r)) return '/institute'
  return '/'
}
