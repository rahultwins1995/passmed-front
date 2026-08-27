/**
 * Institute-portal permissions — single source of truth.
 *
 * The backend attaches a `permissions` map to the user on /login and /me:
 *
 *   { students: 'view', mock_exams: 'none', question_bank: 'full', … }
 *
 * Levels are ordered  none < view < edit < full.  A role with no row in the
 * admin matrix gets `none` everywhere (deny by default), which is why a fresh
 * Professor sees only Dashboard / Help / Contact until an admin grants access
 * in pm-admin → Settings → Role Matrix.
 *
 * The SAME map is enforced server-side by the `perm:<area>,<level>` middleware
 * on routes/api-institute.php. Anything gated here must be gated there too —
 * hiding a nav item is cosmetic on its own.
 */

export type PermissionLevel = 'none' | 'view' | 'edit' | 'full'

export const PERMISSION_LEVELS: PermissionLevel[] = ['none', 'view', 'edit', 'full']

export const INSTITUTE_AREAS = [
  'students',
  'mock_exams',
  'assign_exams',
  'question_bank',
  'reports',
  'seats_cohorts',
  'inst_settings',
  'notifications',
] as const

export type InstituteArea = typeof INSTITUTE_AREAS[number]

/**
 * What each level MEANS. The ladder is cumulative — `edit` is view + edit, and
 * `full` is edit + the destructive things:
 *
 *   none  hidden from the sidebar; the API 403s
 *   view  read-only
 *   edit  view + create + update
 *   full  edit + delete / publish / declare / broadcast / revoke a seat
 *
 * ── AREA_LEVELS: the levels each area can actually honour ───────────────────
 * Mirror of Permission::AREA_LEVELS in the Laravel model. Not every area has
 * four real states: `reports` is a single read-only endpoint, and nothing in
 * `inst_settings` or `students` can be deleted or published. Offering `full` on
 * those columns implied a capability that no route checked.
 *
 * Keep this in step with the PHP. The backend clamps too (and is the actual
 * boundary) — this copy exists so the portal doesn't render a Delete button that
 * the API is only going to reject.
 */
export const AREA_LEVELS: Record<InstituteArea, PermissionLevel[]> = {
  students:      ['none', 'view', 'edit'],                    // check-in emails; nothing to destroy
  mock_exams:    ['none', 'view', 'edit', 'full'],            // full = declare results + delete
  assign_exams:  ['none', 'view', 'edit', 'full'],            // full = delete an assignment
  question_bank: ['none', 'view', 'edit', 'full'],            // full = approve/reject into the live bank
  reports:       ['none', 'view'],                            // read-only by nature
  seats_cohorts: ['none', 'view', 'edit', 'full'],            // full = delete cohort + revoke a seat
  inst_settings: ['none', 'view', 'edit', 'full'],            // full = add/remove team members
  notifications: ['none', 'view', 'edit'],                    // own inbox only; nothing destructive
}

/** Levels this area supports. Unknown area → the whole ladder. */
export function levelsForArea (area: string): PermissionLevel[] {
  return AREA_LEVELS[area as InstituteArea] ?? PERMISSION_LEVELS
}

/** Does this area have a destructive tier at all? Drives whether `full` is offered. */
export function hasManageTier (area: string): boolean {
  return levelsForArea(area).includes('full')
}

/**
 * Route prefix → permission area.
 *
 * Order matters: longest/most specific prefixes first, because we match with
 * startsWith (/institute/mock-exams/12 must hit mock_exams, not the dashboard).
 */
export const INSTITUTE_PAGE_AREAS: Array<{ prefix: string; area: InstituteArea }> = [
  { prefix: '/institute/students',      area: 'students' },
  { prefix: '/institute/at-risk',       area: 'students' },
  { prefix: '/institute/mock-exams',    area: 'mock_exams' },
  { prefix: '/institute/assign-exams',  area: 'assign_exams' },
  { prefix: '/institute/question-bank', area: 'question_bank' },
  { prefix: '/institute/reports',       area: 'reports' },
  { prefix: '/institute/seats-billing', area: 'seats_cohorts' },
  { prefix: '/institute/settings',      area: 'inst_settings' },
  { prefix: '/institute/notifications', area: 'notifications' },
]

/**
 * Pages every portal user can reach regardless of the matrix. Without these a
 * Professor with an all-`none` matrix would have nowhere to land after login.
 */
export const INSTITUTE_PUBLIC_PATHS = [
  '/institute',          // dashboard (exact match — see areaForPath)
  '/institute/help',
  '/institute/contact',
]

/** Which permission area guards this path? `null` = ungated portal page. */
export function areaForPath (path: string): InstituteArea | null {
  const clean = String(path || '').split('?')[0]!.replace(/\/+$/, '') || '/institute'

  if (INSTITUTE_PUBLIC_PATHS.includes(clean)) return null

  const hit = INSTITUTE_PAGE_AREAS.find(p => clean === p.prefix || clean.startsWith(p.prefix + '/'))
  return hit ? hit.area : null
}

/**
 * Read one area's level off a user object, clamped to what the area supports.
 *
 * Clamps DOWNWARD only. A `/me` payload cached before AREA_LEVELS existed can
 * still carry `reports: 'full'`; that reads as `view` here — the strongest level
 * `reports` actually has — rather than lighting up controls that don't exist.
 * Unknown/missing/garbage → 'none', so a typo denies rather than grants.
 */
export function levelFor (user: any, area: string): PermissionLevel {
  // Institute portal reads the membership matrix first (institute_permissions), so a
  // multi-role user is gated by their institution role, not their global one.
  const raw = String(user?.institute_permissions?.[area] ?? user?.permissions?.[area] ?? 'none').toLowerCase()
  if (!(PERMISSION_LEVELS as string[]).includes(raw)) return 'none'

  const allowed = levelsForArea(area)
  if (allowed.includes(raw as PermissionLevel)) return raw as PermissionLevel

  // Strongest supported level that is no stronger than what was stored.
  const want = PERMISSION_LEVELS.indexOf(raw as PermissionLevel)
  return allowed
    .filter(l => PERMISSION_LEVELS.indexOf(l) <= want)
    .sort((a, b) => PERMISSION_LEVELS.indexOf(b) - PERMISSION_LEVELS.indexOf(a))[0] ?? 'none'
}

/** Does the user hold at least `required` on `area`? Levels are cumulative. */
export function hasPermission (user: any, area: string, required: PermissionLevel = 'view'): boolean {
  const have = PERMISSION_LEVELS.indexOf(levelFor(user, area))
  const need = PERMISSION_LEVELS.indexOf(required)
  return have >= (need < 0 ? 1 : need)
}

/** First page the user is actually allowed to see — used for post-login and redirects. */
export function firstAllowedInstitutePath (user: any): string {
  const hit = INSTITUTE_PAGE_AREAS.find(p => hasPermission(user, p.area, 'view'))
  return hit ? hit.prefix : '/institute'
}
