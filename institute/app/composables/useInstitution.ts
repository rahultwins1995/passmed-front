// Shared institution identity (name / initials / type).
//
// Single source of truth for the sidebar AND every page topbar/breadcrumb —
// replaces the hardcoded "Johns Hopkins" strings that used to sit in each
// page. State lives in useState so it is shared app-wide and SSR-safe.
//
// Populated by the sidebar's existing GET /profile fetch (the sidebar is
// always mounted via the institute layout, so no extra API call is needed).
// Pages simply read `instName` and fall back to a neutral label while the
// fetch is in flight:  {{ instName || 'Institute' }}
export const useInstitution = () => {
  const instName     = useState<string>('inst:name',     () => '')
  const instInitials = useState<string>('inst:initials', () => 'IN')
  const instType     = useState<string>('inst:type',     () => '')
  // Uploaded institution logo URL (optional). When set, the sidebar shows it in
  // place of the initials avatar; empty → initials fallback.
  const instLogo     = useState<string>('inst:logo',     () => '')
  // Logged-in admin identity (same /profile fetch) — used e.g. to prefill
  // the contact form instead of hardcoded demo names.
  const userName     = useState<string>('inst:user-name',  () => '')
  const userEmail    = useState<string>('inst:user-email', () => '')
  // Uploaded admin profile photo URL (optional) — shown in the sidebar user
  // avatar in place of initials when set.
  const userPhoto    = useState<string>('inst:user-photo', () => '')
  // Impersonation ("Log as") — set from the sidebar's /profile fetch. Drives the
  // "Viewing as … · impersonated by …" banner + Exit control in the institute layout.
  const isImpersonating = useState<boolean>('inst:imp',    () => false)
  const impersonatedBy  = useState<string>('inst:imp-by',  () => 'Admin')
  return { instName, instInitials, instType, instLogo, userName, userEmail, userPhoto, isImpersonating, impersonatedBy }
}
