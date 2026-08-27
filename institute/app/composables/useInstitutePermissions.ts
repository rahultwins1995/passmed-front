import {
  hasPermission,
  levelFor,
  areaForPath,
  type InstituteArea,
  type PermissionLevel,
} from '../utils/institutePermissions'

/**
 * Component-facing wrapper over the permission matrix.
 *
 *   const { can, canEdit, canManage, readOnly } = useInstitutePermissions()
 *
 *   <NuxtLink v-if="can('reports')" to="/institute/reports">Reports</NuxtLink>
 *   <button v-if="canEdit('seats_cohorts')">Invite student</button>
 *   <button v-if="canManage('seats_cohorts')">Remove student</button>
 *
 * `can(area)`       → at least `view`   may I see this at all?
 * `canEdit(area)`   → at least `edit`   may I create/update here?
 * `canManage(area)` → `full`            may I DELETE / PUBLISH / REVOKE here?
 * `readOnly(area)`  → view but not edit — drives disabled buttons and hidden
 *                     action columns.
 *
 * The canEdit/canManage split is the whole reason `full` exists. Use `canEdit`
 * for create + update, and `canManage` for anything irreversible or visible to
 * students: deleting a cohort, declaring results, approving a question into the
 * live bank, broadcasting a notification, revoking a seat. Those are gated at
 * `perm:<area>,full` server-side (routes/api-institute.php) — gate them here too,
 * or the button renders and then 403s.
 *
 * Everything is a computed off the shared `auth_user` state, so it reacts if
 * an admin changes the matrix and the user re-fetches /me.
 */
export const useInstitutePermissions = () => {
  const { user } = useAuth()

  // Prefer the INSTITUTION MEMBERSHIP permissions (institute_permissions) so a multi-role
  // user — e.g. a PassMed admin or student who is also an institution admin — is gated by
  // their institute role here, not their global one. Falls back to the global matrix for a
  // plain institution-admin (where the two are identical anyway).
  const permissions = computed<Record<string, PermissionLevel>>(
    () => (user.value?.institute_permissions ?? user.value?.permissions ?? {}) as Record<string, PermissionLevel>,
  )

  const level = (area: InstituteArea | string): PermissionLevel => levelFor(user.value, area)

  const can = (area: InstituteArea | string, required: PermissionLevel = 'view'): boolean =>
    hasPermission(user.value, area, required)

  const canEdit = (area: InstituteArea | string): boolean => hasPermission(user.value, area, 'edit')

  /** Holds `full` — may delete, publish, declare, broadcast or revoke in this area. */
  const canManage = (area: InstituteArea | string): boolean => hasPermission(user.value, area, 'full')

  /** @deprecated name kept so nothing breaks; prefer `canManage`. */
  const canFull = canManage

  /** Visible but not editable — the read-only state for a `view` level. */
  const readOnly = (area: InstituteArea | string): boolean =>
    hasPermission(user.value, area, 'view') && !hasPermission(user.value, area, 'edit')

  /** Permission area guarding an arbitrary portal path (null = ungated). */
  const areaFor = (path: string) => areaForPath(path)

  /** Can the user open this portal path? */
  const canVisit = (path: string): boolean => {
    const area = areaForPath(path)
    if (!area) return true
    return hasPermission(user.value, area, 'view')
  }

  return { permissions, level, can, canEdit, canManage, canFull, readOnly, areaFor, canVisit }
}
