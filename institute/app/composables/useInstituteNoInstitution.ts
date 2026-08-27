/**
 * Set when the institute API returns 409 `no_institution` — the user is signed
 * in fine, but has no row in `institution_manages`, so no institution can be
 * resolved for them and every endpoint fails.
 *
 * This happens when an institution-admin or professor is created from
 * Settings → Admin Users without picking an institution. Previously the API
 * answered 401 for this, the 401 handler read it as "session expired", and the
 * user was bounced to /login about two seconds after signing in — with no clue
 * why. Now the layout renders an explanation instead.
 */
export const useInstituteNoInstitution = () =>
  useState<string | null>('institute_no_institution', () => null)
