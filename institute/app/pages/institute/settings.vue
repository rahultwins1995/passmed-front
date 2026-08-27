<script setup lang="ts">

// Permission matrix (admin panel → Role Matrix). The same rules are enforced
// server-side by the perm: middleware, so hiding a button is UX, not the
// security boundary.
//
//   canEdit   → program details, thresholds, notification prefs  (inst_settings,edit)
//   canManage → invite and REMOVE team members                   (inst_settings,full)
//
// Removing an admin takes away someone's access to the whole portal, so it sits
// behind `manage` rather than `edit`.
const { canEdit, canManage, readOnly } = useInstitutePermissions()
const PERM_AREA = 'inst_settings' as const

// /institute/settings — program profile, cohorts, thresholds,
// notification preferences & team management.
import { ref } from 'vue'
import {
  zoneOptions, regionsOf, zoneLabel, timeIn, offsetIn, defaultZoneForHost, isValidZone,
  type Zone,
} from '../../utils/timezones'
const { instName, instLogo, userPhoto } = useInstitution()

// ── Two-factor authentication (mirrors the student settings toggle) ─────────
const { user, fetchMe } = useAuth()
const instituteApi = useInstituteApi()

const twoFaServerValue = computed<boolean>(() => Boolean((user.value as any)?.two_fa_enabled))
const twoFaOptimistic  = ref<boolean | null>(null)
const twoFaEnabled     = computed<boolean>(() => twoFaOptimistic.value ?? twoFaServerValue.value)
const twoFaBusy        = ref(false)

async function handleTwoFaToggle() {
  if (twoFaBusy.value) return
  const willBeEnabled = !twoFaEnabled.value
  twoFaOptimistic.value = willBeEnabled   // optimistic flip
  twoFaBusy.value = true
  try {
    await instituteApi(willBeEnabled ? '/2fa/enable' : '/2fa/disable', { method: 'POST' })
    await fetchMe()
    twoFaOptimistic.value = null
    showToast(willBeEnabled ? 'Two-factor authentication enabled.' : 'Two-factor authentication disabled.')
  } catch (e: any) {
    twoFaOptimistic.value = null   // revert
    showToast(e?.data?.msg || e?.message || 'Failed to update 2FA setting.', 'var(--rose)')
  } finally {
    twoFaBusy.value = false
  }
}

definePageMeta({ layout: 'institute' })
useHead({ title: 'Settings · Passmed Institute' })

/*
 * Team access — the institution's admins and professors.
 *
 * This panel used to be a read-only list with an empty `<!-- Invite form -->`
 * placeholder: adding a colleague meant emailing Passmed and waiting. It now runs
 * its own roster, capped by the contract (default 3 admins, 10 professors) — the
 * caps and every rule below are enforced server-side in InstitutionTeam, so the UI
 * is convenience, not the boundary.
 *
 * The server decides who can be removed (`can_remove` / `blocked_reason`) rather
 * than the client re-deriving "is owner, is me, is last admin" — working those out
 * in two places is how the button and the API drift apart.
 *
 * "Program Director" is gone: it was never a separate role, just the owner admin.
 */
type TeamMember = {
  id: number
  name: string
  email: string
  role: 'institution-admin' | 'professor'
  role_label: string
  is_owner: boolean
  you: boolean
  pending: boolean            // invited, never signed in
  can_remove: boolean
  can_change_role: boolean
  blocked_reason: string | null
}
type TeamCounts = { admins: number; professors: number; max_admins: number; max_professors: number }
type NotifKey =
  | 'At-risk alert'
  | 'Weekly digest'
  | 'Mock exam results'
  | 'Low engagement alert'
  | 'Seat invitation accepted'
  | 'Billing reminders'

// Section navigation (chip-row at top — mirrors the student settings page).
const activeTab = ref('program')
const tabs = [
  { id: 'program',       label: 'Program' },
  { id: 'thresholds',    label: 'Thresholds' },
  { id: 'notifications', label: 'Notifications' },
  // Was "Admins" — it always listed professors too, and now it invites them.
  { id: 'admins',        label: 'Team' },
  { id: 'security',      label: 'Security' },
  { id: 'danger',        label: 'Danger zone' },
]

const program = ref({
  name: '',
  institution: '',
  examType: '',
  director: '',
  // Empty, not 'America/New_York'. The default is resolved from the portal's own
  // domain once we know it (see resolveDefaultZone), and a SAVED zone always wins.
  // Hardcoding New York here is what made every non-US programme look American.
  timezone: '',
  logoUrl: '',
  // Include the Shared Pool in students' Institution Q Bank (default off).
  sharedPoolOptin: false,
})

// Prefill institution identity from the shared profile state — the form must
// never show another institution's hardcoded demo name.
watch(instName, (v) => {
  if (!v) return
  if (!program.value.institution) program.value.institution = v
  if (!program.value.name)        program.value.name        = v
}, { immediate: true })

/**
 * Pick a timezone for an institution that has never set one.
 *
 * Driven by the portal's own hostname — passmed.uk → Europe/London,
 * passmed.co.za → Africa/Johannesburg, passmed.com → America/New_York. Where the
 * domain says nothing (localhost, a preview URL), it falls back to the BROWSER's
 * zone, which beats assuming America.
 *
 * useRequestURL() rather than window.location: this page server-renders, and
 * `window` doesn't exist there.
 */
function resolveDefaultZone(): string {
  try {
    return defaultZoneForHost(useRequestURL().hostname)
  } catch {
    return 'America/New_York'
  }
}

// Hydrate the real saved program information from the backend on mount.
async function loadProgram() {
  try {
    const res: any = await instituteApi('/program')
    const d = res?.data
    if (d) {
      program.value = {
        name:        d.name        ?? '',
        institution: d.institution ?? '',
        examType:    d.examType    || program.value.examType,
        director:    d.director    ?? '',
        // A SAVED zone always wins. The country default is only ever a fallback for
        // an institution that has never chosen one — re-deriving it on every load
        // would quietly drag a US-hosted programme in Berlin back to New York.
        // `isValidZone` guards against junk already in the column.
        timezone:    (d.timezone && isValidZone(d.timezone)) ? d.timezone : resolveDefaultZone(),
        logoUrl:     d.logoUrl     ?? '',
        sharedPoolOptin: !!d.sharedPoolOptin,
      }
    }
  } catch (e) { /* keep prefill defaults if the fetch fails */ }

  // Belt and braces: if /program failed or returned nothing, the select still needs
  // a value or it renders blank and saves an empty string.
  if (!program.value.timezone) program.value.timezone = resolveDefaultZone()
}
// Full-page skeleton (topbar stays) until every section's data has loaded.
const pageLoading = ref(true)
onMounted(async () => {
  try {
    await Promise.all([loadProgram(), loadCohorts(), loadAdmins(), loadSettingsExtras()])
  } finally {
    pageLoading.value = false
  }
})

// Cohorts are read-only here — the source of truth (and management) is the
// Seats & Billing page. We just display the real cohort names at-a-glance.
const cohorts = ref<string[]>([])
async function loadCohorts() {
  try {
    const res: any = await instituteApi('/cohorts')
    cohorts.value = (res?.data ?? []).map((c: any) => c?.name ?? '').filter(Boolean)
  } catch (e) { /* leave empty on failure */ }
}
// (loaded via the consolidated onMounted above)
const thresholds = ref({ passmark: 65, atRiskWeeks: 2, weeklyQTarget: 150 })
const notifs = ref<Record<NotifKey, boolean>>({
  'At-risk alert': true,
  'Weekly digest': true,
  'Mock exam results': true,
  'Low engagement alert': true,
  'Seat invitation accepted': false,
  'Billing reminders': true,
})
// ── Team access ─────────────────────────────────────────────────────────────
const team       = ref<TeamMember[]>([])
const teamCounts = ref<TeamCounts>({ admins: 0, professors: 0, max_admins: 3, max_professors: 10 })
const teamBusyId = ref<number | null>(null)

async function loadAdmins() {
  try {
    const res: any = await instituteApi('/team')
    const d = res?.data
    if (Array.isArray(d?.members)) team.value = d.members
    if (d?.counts) teamCounts.value = d.counts
  } catch (e) { /* leave empty on failure */ }
}

const admins     = computed(() => team.value.filter(m => m.role === 'institution-admin'))
const professors = computed(() => team.value.filter(m => m.role === 'professor'))

const adminsFull     = computed(() => teamCounts.value.admins     >= teamCounts.value.max_admins)
const professorsFull = computed(() => teamCounts.value.professors >= teamCounts.value.max_professors)

// `manage` on inst_settings, not `edit`. Removing an admin takes away someone's
// access to the portal — that is what the manage tier is for. Program details and
// thresholds stay at `edit`.
const canManageTeam = computed(() => canManage(PERM_AREA))

// ── Invite form (the placeholder that was never built) ──────────────────────
const invite = ref<{ firstname: string; lastname: string; email: string; role: TeamMember['role'] }>({
  firstname: '', lastname: '', email: '', role: 'professor',
})
const inviteBusy  = ref(false)
const inviteError = ref('')

// Can't invite into a role that's already at its cap — say why, before they type.
const inviteRoleFull = computed(() =>
  invite.value.role === 'institution-admin' ? adminsFull.value : professorsFull.value)

async function sendInvite() {
  inviteError.value = ''
  const firstname = invite.value.firstname.trim()
  const lastname  = invite.value.lastname.trim()
  const email     = invite.value.email.trim()

  if (!firstname) { inviteError.value = 'Enter a first name.'; return }
  if (!lastname)  { inviteError.value = 'Enter a last name.';  return }
  if (!email)     { inviteError.value = 'Enter an email.';     return }
  if (inviteRoleFull.value) {
    inviteError.value = invite.value.role === 'institution-admin'
      ? `You already have ${teamCounts.value.max_admins} admins.`
      : `You already have ${teamCounts.value.max_professors} professors.`
    return
  }

  inviteBusy.value = true
  try {
    const res: any = await instituteApi('/team', {
      method: 'POST',
      body: { firstname, lastname, email, role: invite.value.role },
    })
    showToast(res?.message ?? 'Invite sent.')
    invite.value = { firstname: '', lastname: '', email: '', role: invite.value.role }
    await loadAdmins()
  } catch (e: any) {
    // The server owns the caps and the duplicate-email rule; surface its wording
    // rather than guessing at a friendlier one that might be wrong.
    inviteError.value = e?.data?.message || e?.data?.msg || 'Could not send the invite.'
  } finally {
    inviteBusy.value = false
  }
}

async function changeTeamRole(m: TeamMember, role: TeamMember['role']) {
  if (role === m.role || teamBusyId.value) return
  teamBusyId.value = m.id
  try {
    const res: any = await instituteApi(`/team/${m.id}`, { method: 'PATCH', body: { role } })
    showToast(res?.message ?? 'Role updated.')
    await loadAdmins()
  } catch (e: any) {
    showToast(e?.data?.message || 'Could not change that role.', 'var(--rose)')
  } finally {
    teamBusyId.value = null
  }
}

const pendingRemove = ref<TeamMember | null>(null)

async function doRemoveMember() {
  const m = pendingRemove.value
  pendingRemove.value = null
  if (!m) return

  teamBusyId.value = m.id
  try {
    const res: any = await instituteApi(`/team/${m.id}`, { method: 'DELETE' })
    showToast(res?.message ?? 'Removed.')
    await loadAdmins()
  } catch (e: any) {
    const code = e?.response?.status ?? e?.statusCode
    if (code === 403)      showToast("You don't have permission to remove team members.", 'var(--rose)')
    else if (code === 404) { await loadAdmins(); showToast('That team member no longer exists.', 'var(--rose)') }
    else                   showToast(e?.data?.message || 'Could not remove them.', 'var(--rose)')
  } finally {
    teamBusyId.value = null
  }
}

async function resendTeamInvite(m: TeamMember) {
  if (teamBusyId.value) return
  teamBusyId.value = m.id
  try {
    const res: any = await instituteApi(`/team/${m.id}/resend`, { method: 'POST' })
    showToast(res?.message ?? 'Invite resent.')
  } catch (e: any) {
    showToast(e?.data?.message || 'Could not resend the invite.', 'var(--rose)')
  } finally {
    teamBusyId.value = null
  }
}

/*
 * ── Session timeout ─────────────────────────────────────────────────────────
 *
 * `sessionTimeout` is one of '', '30min', '1hour', '4hour', '24hour', 'never'.
 *
 * '' means INHERIT the platform-wide default, which is deliberately not the same as
 * 'never'. An institution that has never touched this control must follow whatever
 * Passmed sets globally; collapsing "no opinion" into "no timeout" would silently
 * turn the security policy off for everyone who left it alone.
 *
 * `effectiveMinutes` is what the server says is actually in force once inheritance
 * is resolved — so the tile can state the real number instead of an empty box.
 */
type TimeoutToken = '' | '30min' | '1hour' | '4hour' | '24hour' | 'never'

const security = ref<{ sessionTimeout: TimeoutToken }>({ sessionTimeout: '' })
const effectiveMinutes = ref<number | null>(null)
const securityState = ref<'idle' | 'saving' | 'saved'>('idle')

function minutesLabel(m: number | null): string {
  if (m === null) return 'never'
  if (m < 60) return `${m} minutes`
  const h = m / 60
  return h === 1 ? '1 hour' : `${h % 1 === 0 ? h : h.toFixed(1)} hours`
}

const effectiveTimeoutLabel = computed(() => {
  if (effectiveMinutes.value === null && security.value.sessionTimeout === 'never') return 'never'
  return effectiveMinutes.value === null ? '' : minutesLabel(effectiveMinutes.value)
})

// Only meaningful while the institution is inheriting — once it picks its own value,
// the effective number IS its own value, not the platform's.
const platformDefaultLabel = computed(() =>
  security.value.sessionTimeout === '' ? (effectiveTimeoutLabel.value || '30 minutes') : 'inherit',
)

async function saveSecurity() {
  if (!canEdit(PERM_AREA)) return
  securityState.value = 'saving'
  try {
    await instituteApi('/settings-extras', {
      method: 'POST',
      body: { security: { sessionTimeout: security.value.sessionTimeout } },
    })
    // Re-read rather than assume: the server resolves inheritance, so after choosing
    // '' we don't know the effective number until it tells us.
    await loadSettingsExtras()
    securityState.value = 'saved'
    showToast('Session timeout updated.')
    setTimeout(() => { if (securityState.value === 'saved') securityState.value = 'idle' }, 2000)
  } catch (e: any) {
    securityState.value = 'idle'
    showToast(e?.data?.msg || 'Could not save the session timeout.', 'var(--rose)')
  }
}

// Hydrate thresholds + notification preferences + security from the backend.
async function loadSettingsExtras() {
  try {
    const res: any = await instituteApi('/settings-extras')
    const d = res?.data
    if (d?.thresholds)    thresholds.value = { ...thresholds.value, ...d.thresholds }
    if (d?.notifications) notifs.value     = { ...notifs.value, ...d.notifications }
    if (d?.security) {
      security.value.sessionTimeout = (d.security.sessionTimeout ?? '') as TimeoutToken
      effectiveMinutes.value = d.security.effectiveMinutes ?? null
    }
  } catch (e) { /* keep defaults on failure */ }
}
// (loaded via the consolidated onMounted above)

const notifDescriptions: Record<NotifKey, string> = {
  'At-risk alert': 'Email when a resident drops below the pass threshold',
  'Weekly digest': 'Sunday summary of cohort activity and performance',
  'Mock exam results': 'Notify when exam results are ready to review',
  'Low engagement alert': "Email when a resident hasn't logged in for 5+ days",
  'Seat invitation accepted': 'Notify when a new resident accepts their invitation',
  'Billing reminders': 'Renewal and payment notifications',
}

/*
 * ── Timezone ────────────────────────────────────────────────────────────────
 *
 * The list was six US zones, so a London or Johannesburg programme had no way to
 * say where it was and got silently filed under US Eastern. It now offers ~110
 * zones across every region, each showing the CURRENT time there, and defaults
 * from the portal's own domain (passmed.uk → Europe/London).
 *
 * `zoneOptions(saved)` folds in whatever the institution already has stored, even
 * if it isn't in the curated list — otherwise the <select> would have no <option>
 * matching its value, render blank, and overwrite their zone on the next save.
 */
const tzNow = ref(new Date())
let tzTimer: ReturnType<typeof setInterval> | null = null

const zones      = computed(() => zoneOptions(program.value.timezone))
const zoneGroups = computed(() => regionsOf(zones.value))
const zonesIn    = (region: string) => zones.value.filter(z => z.region === region)

// Re-render the clocks on a 30s tick so an open dropdown doesn't show stale times.
// Cheap: the Intl formatters are cached per zone in utils/timezones.ts, so this is
// ~110 format() calls, not ~110 constructor calls.
onMounted(() => { tzTimer = setInterval(() => { tzNow.value = new Date() }, 30_000) })
onBeforeUnmount(() => { if (tzTimer) clearInterval(tzTimer) })

// The label has to be a function of tzNow, not of Date.now(), or Vue has no reason
// to re-render it when the clock ticks.
const labelFor = (z: Zone) => zoneLabel(z, tzNow.value)

/** Live readout under the field — the one zone that actually matters. */
const selectedZoneLine = computed(() => {
  const tz = program.value.timezone
  if (!tz) return ''
  const t = timeIn(tz, tzNow.value)
  const o = offsetIn(tz, tzNow.value)
  return t ? `It's ${t} there right now (${o})` : ''
})

const programFields: Array<{ label: string; key: keyof typeof program.value }> = [
  { label: 'Program name',     key: 'name' },
  { label: 'Institution',      key: 'institution' },
  { label: 'Exam type',        key: 'examType' },
  { label: 'Program director', key: 'director' },
]

const thresholdFields = [
  { label: 'Pass threshold',          key: 'passmark' as const,      unit: '%',     hint: 'Residents below this are flagged at-risk. Affects dashboard, at-risk table and board readiness report.' },
  { label: 'At-risk alert trigger',   key: 'atRiskWeeks' as const,   unit: 'weeks', hint: 'How many consecutive weeks below threshold before an alert email is sent.' },
  { label: 'Weekly question target',  key: 'weeklyQTarget' as const, unit: 'Qs',    hint: 'Minimum questions per week per resident. Used in engagement alerts and weekly digest.' },
]

// ── Toast ──────────────────────────────────────────
const toast = ref<{ text: string; color: string } | null>(null)
function showToast(text: string, color = 'var(--teal)') {
  toast.value = { text, color }
  setTimeout(() => { toast.value = null }, 2400)
}

// ── Institution logo upload ────────────────────────
// Replaces the old "logo URL" text field — upload the image, store the returned
// URL into program.logoUrl (persisted on Save).
const logoInput     = ref<HTMLInputElement | null>(null)
const logoUploading = ref(false)
async function onLogoChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) { showToast('Logo must be under 5MB', 'var(--rose)'); return }
  const fd = new FormData()
  fd.append('logo', file)
  logoUploading.value = true
  try {
    const res: any = await instituteApi('/program/logo', { method: 'POST', body: fd })
    if (res?.status === 'success' && res?.data?.logo_url) {
      program.value.logoUrl = res.data.logo_url
      instLogo.value = res.data.logo_url   // live-update the sidebar avatar (no reload needed)
      showToast('Logo uploaded — Save changes to apply.')
    } else {
      showToast(res?.msg || 'Failed to upload logo', 'var(--rose)')
    }
  } catch (err: any) {
    showToast(err?.data?.msg || 'Failed to upload logo', 'var(--rose)')
  } finally {
    logoUploading.value = false
    if (logoInput.value) logoInput.value.value = ''   // allow re-selecting the same file
  }
}

// Remove the logo — clear it locally AND in the shared sidebar state (so the
// sidebar reverts to initials immediately). Persisted on Save changes.
function removeLogo() {
  program.value.logoUrl = ''
  instLogo.value = ''
}

// ── Admin profile photo upload ─────────────────────────
// Uploads the logged-in admin's photo (users.avatar). Persists immediately on
// the server (no Save needed) and live-updates the sidebar user avatar.
const userPhotoInput     = ref<HTMLInputElement | null>(null)
const userPhotoUploading = ref(false)
async function onUserPhotoChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) { showToast('Photo must be under 5MB', 'var(--rose)'); return }
  const fd = new FormData()
  fd.append('avatar', file)
  userPhotoUploading.value = true
  try {
    const res: any = await instituteApi('/program/user-photo', { method: 'POST', body: fd })
    if (res?.status === 'success' && res?.data?.avatar_url) {
      userPhoto.value = res.data.avatar_url   // live-update the sidebar user avatar
      showToast('Profile photo updated.')
    } else {
      showToast(res?.msg || 'Failed to upload photo', 'var(--rose)')
    }
  } catch (err: any) {
    showToast(err?.data?.msg || 'Failed to upload photo', 'var(--rose)')
  } finally {
    userPhotoUploading.value = false
    if (userPhotoInput.value) userPhotoInput.value.value = ''
  }
}
async function removeUserPhoto() {
  userPhotoUploading.value = true
  try {
    const res: any = await instituteApi('/program/user-photo/remove', { method: 'POST', body: {} })
    if (res?.status === 'success') {
      userPhoto.value = ''
      showToast('Profile photo removed.')
    } else {
      showToast(res?.msg || 'Failed to remove photo', 'var(--rose)')
    }
  } catch (err: any) {
    showToast(err?.data?.msg || 'Failed to remove photo', 'var(--rose)')
  } finally {
    userPhotoUploading.value = false
  }
}

// Cohorts here are read-only (managed in Seats & Billing).

// Admin invite/remove is deferred (creates/removes real users — auth-sensitive).
// The list above is read-only for now; management UI will be added separately.

// ── Per-section saves (each section persists independently, like the student
//    settings page — its own button + saving state). ─────────────────────────
type SaveState = 'idle' | 'saving' | 'saved'

const programState = ref<SaveState>('idle')
async function saveProgram() {
  if (programState.value === 'saving') return
  programState.value = 'saving'
  try {
    await instituteApi('/program', {
      method: 'POST',
      body: {
        name:        program.value.name,
        institution: program.value.institution,
        examType:    program.value.examType,
        director:    program.value.director,
        timezone:    program.value.timezone,
        logoUrl:     program.value.logoUrl,
        sharedPoolOptin: program.value.sharedPoolOptin,
      },
    })
    programState.value = 'saved'
    setTimeout(() => { programState.value = 'idle' }, 2000)
  } catch (e: any) {
    programState.value = 'idle'
    showToast(e?.data?.msg || e?.message || 'Failed to save program info.', 'var(--rose)')
  }
}

const thresholdsState = ref<SaveState>('idle')
async function saveThresholds() {
  if (thresholdsState.value === 'saving') return
  thresholdsState.value = 'saving'
  try {
    await instituteApi('/settings-extras', { method: 'POST', body: { thresholds: thresholds.value } })
    thresholdsState.value = 'saved'
    setTimeout(() => { thresholdsState.value = 'idle' }, 2000)
  } catch (e: any) {
    thresholdsState.value = 'idle'
    showToast(e?.data?.msg || e?.message || 'Failed to save thresholds.', 'var(--rose)')
  }
}

const notifsState = ref<SaveState>('idle')
async function saveNotifs() {
  if (notifsState.value === 'saving') return
  notifsState.value = 'saving'
  try {
    await instituteApi('/settings-extras', { method: 'POST', body: { notifications: notifs.value } })
    notifsState.value = 'saved'
    setTimeout(() => { notifsState.value = 'idle' }, 2000)
  } catch (e: any) {
    notifsState.value = 'idle'
    showToast(e?.data?.msg || e?.message || 'Failed to save notifications.', 'var(--rose)')
  }
}

// Send a real password-reset link to the logged-in admin's own email.
const resetSending = ref(false)
async function sendPasswordReset() {
  if (resetSending.value) return
  const email = (user.value as any)?.email
  if (!email) { showToast('No account email found', 'var(--amber)'); return }
  resetSending.value = true
  try {
    await $fetch(instituteAuthApiPath('forgot-password'), { method: 'POST', body: { email } })
    showToast('Password reset email sent to ' + email, 'var(--green)')
  } catch (e: any) {
    showToast('Failed to send reset link', 'var(--rose)')
  } finally {
    resetSending.value = false
  }
}

// Styled danger-confirm modal replaces the native window.confirm() dialogs.
const dangerDialog = ref<null | 'reset' | 'deactivate'>(null)
function resetConfirm()      { dangerDialog.value = 'reset' }
function deactivateConfirm() { dangerDialog.value = 'deactivate' }
function doDangerConfirm() {
  const kind = dangerDialog.value
  dangerDialog.value = null
  if (kind === 'reset')      showToast('Progress reset complete', 'var(--rose)')
  if (kind === 'deactivate') showToast('Contact Passmed support to complete deactivation — support@passmed.com', 'var(--rose)')
}
// Real export — complete data bundle (residents + analytics, mock-exam results,
// audit log + a JSON manifest), zipped, via the reports endpoint.
const { downloading: exporting, downloadReport } = useReportDownload()
async function exportAll() {
  if (exporting.value) return
  showToast('Preparing data export…', 'var(--ink)')
  const r = await downloadReport({ type: 'alldata', range: 'all' }, 'passmed-data-export.zip')
  if (r.ok) showToast(`${r.filename} downloaded`, 'var(--green)')
  else if (r.error) showToast(r.error, 'var(--rose)')
}

// Real audit-log CSV (recent actions by this institution's users).
const { downloading: auditDownloading, downloadReport: downloadAudit } = useReportDownload()
async function downloadAuditLog() {
  if (auditDownloading.value) return
  showToast('Preparing audit log…', 'var(--ink)')
  const r = await downloadAudit({ type: 'auditlog', range: 'all' }, 'audit-log.csv')
  if (r.ok) showToast(`${r.filename} downloaded`, 'var(--green)')
  else if (r.error) showToast(r.error, 'var(--rose)')
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2)
}
// tzLabel() is gone — it stripped `America/` and `Pacific/` and swapped ONE
// underscore, which is only a label for a list of six US cities. Zone labels now
// come from zoneLabel() in utils/timezones.ts, which handles every region and
// appends the live local time.
</script>

<template>
  <div class="main">
    <!-- `view` level: page is visible but every mutation is hidden. -->
    <ReadOnlyBanner :area="PERM_AREA" />

    <div class="content">

      <!-- Full-page skeleton (topbar stays) while the sections load -->
      <div v-if="pageLoading" style="max-width:820px;">
        <div class="page-header" style="margin-bottom:18px;">
          <div>
            <div class="set-sk" style="width:140px;height:22px;margin-bottom:10px;"></div>
            <div class="set-sk" style="width:260px;height:12px;"></div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:22px;">
          <div v-for="n in 6" :key="'tsk' + n" class="set-sk" style="width:90px;height:32px;border-radius:9px;"></div>
        </div>
        <div class="card" style="margin-bottom:14px;">
          <div class="set-sk" style="width:160px;height:13px;margin-bottom:18px;"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div v-for="n in 6" :key="'fsk' + n">
              <div class="set-sk" style="width:90px;height:10px;margin-bottom:8px;"></div>
              <div class="set-sk" style="width:100%;height:38px;border-radius:9px;"></div>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:18px;">
            <div class="set-sk" style="width:130px;height:34px;border-radius:9px;"></div>
          </div>
        </div>
      </div>

      <div v-show="!pageLoading" style="animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;max-width:820px;">

        <!-- Header -->
        <div class="page-header" style="margin-bottom:18px;">
          <div>
            <div class="page-title">Settings</div>
            <div class="page-sub">Program configuration · {{ program.institution }}</div>
          </div>
        </div>

        <!-- Section navigation -->
        <div class="settings-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="stab-s"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >{{ tab.label }}</button>
        </div>

        <!-- 1. Program information -->
        <div v-show="activeTab === 'program'" class="card" style="margin-bottom:14px;">
          <div class="section-eyebrow">Program information</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">
            <div v-for="f in programFields" :key="f.key">
              <label class="fld-label">{{ f.label }}</label>
              <input v-model="program[f.key]" type="text" class="fld" />
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">
            <div>
              <label class="fld-label">Timezone</label>
              <!-- Grouped by region, each option showing the current time there.
                   Was six US cities; a UK or SA programme literally could not
                   describe itself. -->
              <select v-model="program.timezone" class="fld" style="background:var(--white);cursor:pointer;">
                <optgroup v-for="region in zoneGroups" :key="region" :label="region">
                  <option v-for="z in zonesIn(region)" :key="z.tz" :value="z.tz">
                    {{ labelFor(z) }}
                  </option>
                </optgroup>
              </select>
              <div v-if="selectedZoneLine" class="tz-now">{{ selectedZoneLine }}</div>
            </div>
            <div>
              <label class="fld-label">
                Institution logo <span style="font-weight:500;color:var(--ink-faint);">(optional)</span>
              </label>
              <div class="logo-upload">
                <div class="logo-preview">
                  <img v-if="program.logoUrl" :src="program.logoUrl" alt="Institution logo" />
                  <span v-else class="logo-ph">No logo</span>
                </div>
                <div class="logo-actions">
                  <input ref="logoInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="onLogoChange" />
                  <button v-if="canEdit(PERM_AREA)" type="button" class="btn-logo" :disabled="logoUploading" @click="logoInput?.click()">
                    {{ logoUploading ? 'Uploading…' : (program.logoUrl ? 'Change logo' : 'Upload logo') }}
                  </button>
                  <button v-if="canEdit(PERM_AREA) && program.logoUrl" type="button" class="btn-logo-remove" @click="removeLogo">Remove</button>
                  <div class="logo-hint">PNG, JPG or WebP · up to 5MB</div>
                </div>
              </div>

              <!-- Admin profile photo (logged-in user) -->
              <label class="fld-label" style="margin-top:16px;">
                Your profile photo <span style="font-weight:500;color:var(--ink-faint);">(optional)</span>
              </label>
              <div class="logo-upload">
                <div class="logo-preview">
                  <img v-if="userPhoto" :src="userPhoto" alt="Profile photo" />
                  <span v-else class="logo-ph">No photo</span>
                </div>
                <div class="logo-actions">
                  <input ref="userPhotoInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="onUserPhotoChange" />
                  <button type="button" class="btn-logo" :disabled="userPhotoUploading" @click="userPhotoInput?.click()">
                    {{ userPhotoUploading ? 'Uploading…' : (userPhoto ? 'Change photo' : 'Upload photo') }}
                  </button>
                  <button v-if="userPhoto" type="button" class="btn-logo-remove" :disabled="userPhotoUploading" @click="removeUserPhoto">Remove</button>
                  <div class="logo-hint">PNG, JPG or WebP · up to 5MB</div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <label class="fld-label" style="margin-bottom:8px;">Cohorts enrolled</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              <div v-for="c in cohorts" :key="c" class="cohort-pill">
                <span>{{ c }}</span>
              </div>
              <span v-if="!cohorts.length" style="font-size:0.72rem;color:var(--ink-dim);">No cohorts yet</span>
            </div>
            <div style="font-size:0.66rem;color:var(--ink-dim);margin-top:6px;">Manage cohorts in Seats &amp; Cohorts.</div>
          </div>

          <!-- Shared Pool opt-in — whether students see Shared-Pool questions in their
               Institution Q Bank. Off by default (their own questions only). -->
          <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:16px;">
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;max-width:640px;">
              <input type="checkbox" v-model="program.sharedPoolOptin" :disabled="!canEdit(PERM_AREA)"
                     style="margin-top:3px;width:16px;height:16px;cursor:pointer;flex-shrink:0;" />
              <span>
                <span class="fld-label" style="display:block;margin:0 0 2px;">Include the Shared Pool in our students' Question Bank</span>
                <span style="font-size:0.7rem;color:var(--ink-dim);line-height:1.5;">Off: students see only your institution's own questions. On: they also see Shared-Pool questions contributed by other institutions (each shown with a “Shared” badge).</span>
              </span>
            </label>
          </div>

          <div style="display:flex;justify-content:flex-end;margin-top:18px;">
            <button v-if="canEdit(PERM_AREA)" type="button" @click="saveProgram" class="btn-save" :class="{ saved: programState === 'saved' }" :disabled="programState === 'saving'">
              <template v-if="programState === 'saved'">✓ Saved</template>
              <template v-else>{{ programState === 'saving' ? 'Saving…' : 'Save changes' }}</template>
            </button>
          </div>
        </div>

        <!-- 2. Performance thresholds -->
        <div v-show="activeTab === 'thresholds'" class="card" style="margin-bottom:14px;">
          <div class="section-eyebrow">Performance thresholds</div>
          <div class="grid-4" style="gap:14px;">
            <div v-for="f in thresholdFields" :key="f.key">
              <label class="fld-label">{{ f.label }}</label>
              <div style="display:flex;align-items:center;gap:7px;">
                <input
                  :value="thresholds[f.key]"
                  @input="thresholds[f.key] = +($event.target as HTMLInputElement).value || 0"
                  type="number"
                  class="fld fld-num"
                />
                <span style="font-size:0.75rem;font-weight:600;color:var(--ink-dim);flex-shrink:0;">{{ f.unit }}</span>
              </div>
              <div style="font-size:0.62rem;color:var(--ink-dim);margin-top:5px;line-height:1.45;">{{ f.hint }}</div>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:18px;">
            <button v-if="canEdit(PERM_AREA)" type="button" @click="saveThresholds" class="btn-save" :class="{ saved: thresholdsState === 'saved' }" :disabled="thresholdsState === 'saving'">
              <template v-if="thresholdsState === 'saved'">✓ Saved</template>
              <template v-else>{{ thresholdsState === 'saving' ? 'Saving…' : 'Save changes' }}</template>
            </button>
          </div>
        </div>

        <!-- 3. Email notifications -->
        <div v-show="activeTab === 'notifications'" class="card" style="margin-bottom:14px;">
          <div class="section-eyebrow" style="margin-bottom:4px;">Email notifications</div>
          <div style="font-size:0.67rem;color:var(--ink-dim);margin-bottom:14px;">
            Sent to all administrators listed below unless otherwise configured.
          </div>
          <div>
            <div
              v-for="(label, i) in Object.keys(notifs) as NotifKey[]"
              :key="label"
              class="notif-row"
              :class="{ 'no-border': i === Object.keys(notifs).length - 1 }"
            >
              <div>
                <div style="font-size:0.78rem;font-weight:700;color:var(--ink);">{{ label }}</div>
                <div style="font-size:0.66rem;color:var(--ink-dim);margin-top:2px;">{{ notifDescriptions[label] }}</div>
              </div>
              <button type="button" class="toggle" :class="{ on: notifs[label] }" @click="notifs[label] = !notifs[label]" role="switch" :aria-checked="notifs[label]" :aria-label="label">
                <div class="toggle-knob"></div>
              </button>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:18px;">
            <button v-if="canEdit(PERM_AREA)" type="button" @click="saveNotifs" class="btn-save" :class="{ saved: notifsState === 'saved' }" :disabled="notifsState === 'saving'">
              <template v-if="notifsState === 'saved'">✓ Saved</template>
              <template v-else>{{ notifsState === 'saving' ? 'Saving…' : 'Save changes' }}</template>
            </button>
          </div>
        </div>

        <!-- 4. Team access -->
        <!-- Was "Administrator access", but it always listed professors too, so the
             title was wrong. Admins and professors are the only two roles. -->
        <div v-show="activeTab === 'admins'" class="card" style="margin-bottom:14px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
            <div>
              <div class="section-eyebrow" style="margin-bottom:0;">Team access</div>
              <div style="font-size:0.67rem;color:var(--ink-dim);margin-top:3px;max-width:52ch;">
                Admins run the portal and can change settings. Professors teach — they see students,
                exams and the question bank, but not this page.
              </div>
            </div>

            <!-- The caps, stated up front. An admin who doesn't know the limit only
                 discovers it as a 422 halfway through inviting someone. -->
            <div class="team-caps">
              <span class="team-cap" :class="{ full: adminsFull }">
                {{ teamCounts.admins }} of {{ teamCounts.max_admins }} admins
              </span>
              <span class="team-cap" :class="{ full: professorsFull }">
                {{ teamCounts.professors }} of {{ teamCounts.max_professors }} professors
              </span>
            </div>
          </div>

          <div v-for="group in [
                { key: 'admin',     title: 'Admins',     rows: admins },
                { key: 'professor', title: 'Professors', rows: professors },
              ]" :key="group.key" style="margin-bottom:14px;">

            <div class="team-group-title">{{ group.title }}</div>

            <div v-if="!group.rows.length" class="team-empty">
              No {{ group.title.toLowerCase() }} yet.
            </div>

            <div v-else class="admins-wrap">
              <div
                v-for="(a, i) in group.rows"
                :key="a.id"
                class="team-row"
                :class="{ 'no-border': i === group.rows.length - 1 }"
              >
                <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                  <div class="avatar">{{ initials(a.name) }}</div>
                  <div style="min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                      <span style="font-size:0.76rem;font-weight:700;color:var(--ink);">{{ a.name }}</span>
                      <span v-if="a.you" class="you-chip">You</span>
                      <!-- The owner. Was called "Program Director" — never a separate
                           role, just the admin who owns the account and can't be removed. -->
                      <span v-if="a.is_owner" class="owner-chip">Owner</span>
                      <span v-if="a.pending" class="pending-chip">Invite pending</span>
                    </div>
                    <div class="team-email">{{ a.email }}</div>
                  </div>
                </div>

                <div class="team-actions">
                  <template v-if="canManageTeam">
                    <button
                      v-if="a.pending"
                      type="button" class="team-btn"
                      :disabled="teamBusyId === a.id"
                      @click="resendTeamInvite(a)"
                    >Resend</button>

                    <!-- Promote / demote. Hidden for the owner and for the last
                         admin — the server enforces both; this just doesn't offer
                         a button that's guaranteed to 422. -->
                    <button
                      v-if="a.can_change_role"
                      type="button" class="team-btn"
                      :disabled="teamBusyId === a.id"
                      @click="changeTeamRole(a, a.role === 'institution-admin' ? 'professor' : 'institution-admin')"
                    >{{ a.role === 'institution-admin' ? 'Make professor' : 'Make admin' }}</button>

                    <button
                      v-if="a.can_remove"
                      type="button" class="team-btn danger"
                      :disabled="teamBusyId === a.id"
                      @click="pendingRemove = a"
                    >Remove</button>

                    <!-- Say WHY, instead of silently showing nothing. -->
                    <span v-if="a.blocked_reason" class="team-blocked">{{ a.blocked_reason }}</span>
                  </template>
                  <span v-else class="team-role-label">{{ a.role_label }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Invite form — the placeholder that was never built. -->
          <div v-if="canManageTeam" class="invite-box">
            <div class="team-group-title" style="margin-top:0;">Invite someone</div>
            <div style="font-size:0.66rem;color:var(--ink-dim);margin-bottom:10px;">
              They'll get an email with a link to set their own password. It expires in 3 days.
            </div>

            <div class="invite-grid">
              <input v-model="invite.firstname" class="fld" type="text" placeholder="First name" :disabled="inviteBusy" />
              <input v-model="invite.lastname" class="fld" type="text" placeholder="Last name" :disabled="inviteBusy" />
              <input v-model="invite.email" class="fld" type="email" placeholder="name@hospital.org" :disabled="inviteBusy" />
              <select v-model="invite.role" class="fld" :disabled="inviteBusy">
                <option value="professor" :disabled="professorsFull">
                  Professor{{ professorsFull ? ' — limit reached' : '' }}
                </option>
                <option value="institution-admin" :disabled="adminsFull">
                  Admin{{ adminsFull ? ' — limit reached' : '' }}
                </option>
              </select>
              <button
                type="button" class="btn-save"
                :disabled="inviteBusy || inviteRoleFull"
                @click="sendInvite"
              >{{ inviteBusy ? 'Sending…' : 'Send invite' }}</button>
            </div>

            <div v-if="inviteRoleFull" class="invite-note">
              You've used all {{ invite.role === 'institution-admin' ? teamCounts.max_admins : teamCounts.max_professors }}
              {{ invite.role === 'institution-admin' ? 'admin' : 'professor' }} places.
              Remove someone first, or contact Passmed to raise the limit.
            </div>
            <div v-if="inviteError" class="invite-error">{{ inviteError }}</div>
          </div>
        </div>

        <!-- 5. Security & access -->
        <div v-show="activeTab === 'security'" class="card" style="margin-bottom:14px;">
          <div class="section-eyebrow">Security &amp; access</div>
          <div class="grid-2" style="gap:14px;">
            <div class="sec-tile">
              <div class="sec-title">Session timeout</div>
              <div class="sec-desc">
                Sign everyone out after this long with no activity. Clicking, typing or
                scrolling resets the clock.
              </div>
              <!-- Was decorative: no v-model, no persistence, nothing read it. The
                   real logout came from SessionTimeoutMiddleware, which measured from
                   LOGIN rather than from last activity and defaulted to 30 minutes —
                   which is why people were kicked out mid-work while this said 1 hour. -->
              <select
                v-model="security.sessionTimeout"
                class="fld fld-small"
                style="background:var(--white);cursor:pointer;"
                :disabled="!canEdit(PERM_AREA) || securityState === 'saving'"
                @change="saveSecurity"
              >
                <!-- '' is not "no timeout" — it's "whatever Passmed sets". Keeping the
                     two apart is why the stored value can be an empty string. -->
                <option value="">Use Passmed default ({{ platformDefaultLabel }})</option>
                <option value="30min">30 minutes</option>
                <option value="1hour">1 hour</option>
                <option value="4hour">4 hours</option>
                <option value="24hour">24 hours</option>
                <option value="never">Never</option>
              </select>

              <div class="sec-note">
                <template v-if="securityState === 'saving'">Saving…</template>
                <template v-else-if="securityState === 'saved'">Saved</template>
                <template v-else-if="effectiveTimeoutLabel">In force now: {{ effectiveTimeoutLabel }}</template>
              </div>
            </div>
            <div class="sec-tile">
              <div class="sec-title">Two-factor authentication</div>
              <div class="sec-desc">Require 2FA for all administrator accounts.</div>
              <div style="display:flex;align-items:center;gap:10px;">
                <button type="button" class="toggle" :class="{ on: twoFaEnabled }" @click="handleTwoFaToggle"
                  role="switch" :aria-checked="twoFaEnabled" :disabled="twoFaBusy" aria-label="Two-factor authentication">
                  <div class="toggle-knob"></div>
                </button>
                <span style="font-size:0.7rem;color:var(--ink-dim);">
                  {{ twoFaBusy ? (twoFaEnabled ? 'Enabling…' : 'Disabling…') : 'Recommended for programs with HIPAA obligations' }}
                </span>
              </div>
            </div>
            <div class="sec-tile">
              <div class="sec-title">Change password</div>
              <div class="sec-desc">Update your administrator account password.</div>
              <button type="button" @click="sendPasswordReset" :disabled="resetSending" class="btn-secondary-sm">{{ resetSending ? 'Sending…' : 'Send reset link' }}</button>
            </div>
            <div class="sec-tile">
              <div class="sec-title">Audit log</div>
              <div class="sec-desc">View all admin actions — seat changes, settings edits, exam assignments.</div>
              <button type="button" @click="downloadAuditLog" :disabled="auditDownloading" class="btn-secondary-sm">{{ auditDownloading ? 'Downloading…' : 'Download CSV' }}</button>
            </div>
          </div>
        </div>

        <!-- 6. Danger zone -->
        <div v-show="activeTab === 'danger'" class="card" style="border-color:var(--rose-border);">
          <div class="section-eyebrow" style="color:var(--rose);">Danger zone</div>
          <div class="danger-row">
            <div>
              <div class="danger-title">Export all data</div>
              <div class="danger-desc">Download a ZIP containing every resident with their analytics, all mock-exam results, your audit log and a JSON summary.</div>
            </div>
            <button type="button" @click="exportAll" class="btn-danger-fill" :disabled="exporting" :style="exporting ? 'opacity:0.6;cursor:default' : ''">{{ exporting ? 'Exporting…' : '↓ Export' }}</button>
          </div>
          <div class="danger-row">
            <div>
              <div class="danger-title">Reset all resident progress</div>
              <div class="danger-desc">Clears all question history, scores and streaks. This action cannot be undone.</div>
            </div>
            <button type="button" @click="resetConfirm" class="btn-danger">Reset progress</button>
          </div>
          <div class="danger-row no-border">
            <div>
              <div class="danger-title">Deactivate program</div>
              <div class="danger-desc">Suspend all resident and admin access. Seats and data are preserved and can be reactivated.</div>
            </div>
            <button type="button" @click="deactivateConfirm" class="btn-danger">Deactivate</button>
          </div>
        </div>

      </div>
    </div>

    <Transition name="toast">
      <div v-if="toast" class="settings-toast" :style="{ background: toast.color }">{{ toast.text }}</div>
    </Transition>
  </div>

  <ConfirmModal
    :open="dangerDialog !== null"
    :title="dangerDialog === 'reset' ? 'Reset all progress' : 'Deactivate program'"
    :message="dangerDialog === 'reset'
      ? 'This will permanently delete all resident question history, scores and streaks. This cannot be undone.'
      : 'Are you sure you want to deactivate this program? All resident and admin access will be suspended immediately.'"
    :confirm-label="dangerDialog === 'reset' ? 'Delete history' : 'Deactivate'"
    danger
    @confirm="doDangerConfirm"
    @cancel="dangerDialog = null"
  />

  <!-- Removing a colleague locks them out of the portal — worth a confirm.
       The account isn't deleted (their audit trail and authored questions
       would be orphaned), it's detached and deactivated. Say so. -->
  <ConfirmModal
    :open="pendingRemove !== null"
    title="Remove from team"
    :message="`Remove ${pendingRemove?.name} (${pendingRemove?.role_label}) from this institution?\n\nThey lose access to the portal immediately. Their account isn't deleted — anything they authored stays put.`"
    confirm-label="Remove"
    danger
    @confirm="doRemoveMember"
    @cancel="pendingRemove = null"
  />
</template>

<style scoped>
.section-eyebrow {
  font-size: 0.65rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 2px; color: var(--ink-dim); margin-bottom: 18px;
}
.fld-label {
  font-size: 0.72rem; font-weight: 700; color: var(--ink-mid);
  display: block; margin-bottom: 6px;
}
.fld {
  width: 100%; padding: 9px 12px;
  border: 1.5px solid var(--border); border-radius: 9px;
  font-family: Figtree, sans-serif; font-size: 0.8rem; color: var(--ink);
  /* Without an explicit background the input fell back to UA-default white,
     so in dark mode the light var(--ink) text sat on white = invisible.
     --white flips to the dark card colour under body.dark. */
  background: var(--white);
  outline: none; box-sizing: border-box;
  transition: border-color .15s;
}
.fld:focus { border-color: var(--teal); }
.fld-num {
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: 0.9rem; font-weight: 700;
}
.fld-small {
  padding: 7px 10px; font-size: 0.76rem;
  border-color: var(--teal-border); background: var(--white);
}

.btn-save {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 18px; border-radius: 9px; border: none;
  background: var(--teal); color: #fff;
  font-family: Figtree, sans-serif; font-size: 0.76rem; font-weight: 800;
  cursor: pointer; transition: background .15s;
}
.btn-save.saved { background: var(--green); }

/* Institution logo upload */
.logo-upload { display: flex; align-items: center; gap: 12px; }
.logo-preview {
  width: 56px; height: 56px; flex-shrink: 0; border-radius: 10px;
  border: 1.5px solid var(--border); background: var(--surface);
  display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.logo-preview img { width: 100%; height: 100%; object-fit: contain; }
.logo-ph { font-size: 0.6rem; color: var(--ink-dim); }
.logo-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.btn-logo {
  padding: 7px 14px; border-radius: 8px; border: 1.5px solid var(--border);
  background: var(--white); font-family: Figtree, sans-serif; font-size: 0.74rem;
  font-weight: 700; color: var(--ink-mid); cursor: pointer; transition: border-color .15s, color .15s;
}
.btn-logo:hover:not(:disabled) { border-color: var(--teal-border); color: var(--teal); }
.btn-logo:disabled { opacity: .6; cursor: not-allowed; }
.btn-logo-remove {
  border: none; background: none; cursor: pointer;
  font-family: Figtree, sans-serif; font-size: 0.72rem; font-weight: 700; color: var(--rose);
}
.logo-hint { flex-basis: 100%; font-size: 0.62rem; color: var(--ink-dim); }

.cohort-pill {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 20px;
  background: var(--teal-pale); border: 1.5px solid var(--teal-border);
  font-size: 0.74rem; font-weight: 700; color: var(--teal-mid);
}
.cohort-x {
  background: none; border: none; cursor: pointer;
  color: var(--teal-mid); font-size: 0.9rem; line-height: 1; padding: 0;
}
.cohort-x:hover { color: var(--rose); }
.cohort-add {
  padding: 5px 12px; border-radius: 20px;
  border: 1.5px dashed var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.73rem; font-weight: 600;
  color: var(--ink-dim); cursor: pointer;
}
.cohort-add:hover { border-color: var(--teal-border); color: var(--teal); }

.notif-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 0; border-bottom: 1px solid var(--border);
}
.notif-row.no-border { border-bottom: none; }

.toggle {
  width: 38px; height: 22px; border-radius: 20px;
  background: var(--border); cursor: pointer; position: relative;
  transition: background 0.2s; flex-shrink: 0;  border: none;
}
.toggle.on { background: var(--teal); }
.toggle-knob {
  position: absolute; top: 3px; width: 16px; height: 16px;
  border-radius: 50%; background: #fff;
  transition: transform 0.2s; transform: translateX(2px);
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
}
.toggle.on .toggle-knob { transform: translateX(18px); }

.btn-secondary {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 13px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.73rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer;
}
.btn-secondary:hover {
  border-color: var(--teal-border); color: var(--teal); background: var(--teal-pale);
}

.admins-wrap { border: 1px solid var(--border); border-radius: var(--r-sm); overflow: hidden; }
.admin-head {
  background: var(--surface); padding: 7px 14px;
  border-bottom: 1px solid var(--border);
  display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 10px;
  font-size: 0.57rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 1.5px; color: var(--ink-dim);
}
.admin-row {
  display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 10px;
  align-items: center; padding: 11px 14px;
  border-bottom: 1px solid var(--border);
  transition: background 0.1s;
  @media (max-width: 600px) {
    grid-template-columns: 1fr 1fr;
    & > div:nth-child(3) { grid-column: 1 / -1; }
    & > div:nth-child(4) { grid-column: 2 / -1; justify-self: end; }
  }
}
.admin-row.no-border { border-bottom: none; }
.admin-row:hover { background: var(--surface); }

.avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: linear-gradient(135deg, var(--teal-dark), var(--teal));
  display: flex; align-items: center; justify-content: center;
  font-size: 0.6rem; font-weight: 800; color: #fff; flex-shrink: 0;
}
.you-chip {
  font-size: 0.58rem; font-weight: 800;
  background: var(--teal-pale); color: var(--teal-mid);
  border: 1px solid var(--teal-border);
  padding: 1px 6px; border-radius: 20px;
}

/* Status line under the session-timeout select. */
.sec-note {
  font-size: 0.64rem; color: var(--ink-faint);
  margin-top: 6px; min-height: 1em;
}

/* Live clock under the timezone select — confirms the pick without re-opening it. */
.tz-now {
  font-size: 0.66rem; color: var(--ink-faint);
  margin-top: 5px; font-variant-numeric: tabular-nums;
}

/* ── Team access ─────────────────────────────────────────────────────────── */
.team-caps { display: flex; gap: 6px; flex-wrap: wrap; }
.team-cap {
  font-size: 0.62rem; font-weight: 700; color: var(--ink-dim);
  background: var(--surface); border: 1px solid var(--border);
  padding: 3px 9px; border-radius: 20px; white-space: nowrap;
}
/* At the cap — amber, not red. It's a limit, not an error. */
.team-cap.full { background: #fffbeb; border-color: #fcd34d; color: #b45309; }

.team-group-title {
  font-size: 0.6rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 1.2px; color: var(--ink-dim); margin: 0 0 6px;
}
.team-empty {
  font-size: 0.7rem; color: var(--ink-faint);
  border: 1px dashed var(--border); border-radius: var(--r-sm);
  padding: 12px 14px;
}

.team-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 14px; border-bottom: 1px solid var(--border);
  transition: background 0.1s;
}
.team-row.no-border { border-bottom: none; }
.team-row:hover { background: var(--surface); }
.team-email {
  font-size: 0.68rem; color: var(--ink-dim);
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.owner-chip {
  font-size: 0.58rem; font-weight: 800;
  background: var(--surface); color: var(--ink-mid);
  border: 1px solid var(--border);
  padding: 1px 6px; border-radius: 20px;
}
.pending-chip {
  font-size: 0.58rem; font-weight: 800;
  background: #fffbeb; color: #b45309; border: 1px solid #fcd34d;
  padding: 1px 6px; border-radius: 20px;
}

.team-actions { display: flex; align-items: center; gap: 5px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.team-btn {
  font-size: 0.66rem; font-weight: 700; color: var(--ink-dim);
  background: var(--white); border: 1px solid var(--border);
  padding: 4px 9px; border-radius: 6px; cursor: pointer;
  font-family: Figtree, sans-serif; white-space: nowrap;
}
.team-btn:hover:not(:disabled) { border-color: var(--teal); color: var(--teal); }
.team-btn:disabled { opacity: 0.5; cursor: default; }
.team-btn.danger:hover:not(:disabled) { border-color: var(--rose, #e11d48); color: var(--rose, #e11d48); }
/* Why a row has no buttons, instead of leaving the admin guessing. */
.team-blocked { font-size: 0.62rem; color: var(--ink-faint); }
.team-role-label { font-size: 0.7rem; color: var(--ink-dim); }

/* ── Invite form ─────────────────────────────────────────────────────────── */
.invite-box {
  border-top: 1px solid var(--border);
  padding-top: 14px; margin-top: 4px;
}
.invite-grid {
  display: grid; gap: 8px;
  grid-template-columns: 1.1fr 1.3fr 0.9fr auto;
  align-items: center;
}
@media (max-width: 720px) {
  .invite-grid { grid-template-columns: 1fr 1fr; }
  .invite-grid > :last-child { grid-column: 1 / -1; }
}
.invite-note {
  font-size: 0.66rem; color: #b45309;
  background: #fffbeb; border: 1px solid #fcd34d;
  border-radius: 6px; padding: 7px 10px; margin-top: 9px;
}
.invite-error {
  font-size: 0.68rem; color: var(--rose, #e11d48);
  margin-top: 8px;
}
.admin-remove {
  font-size: 0.68rem; font-weight: 700; color: var(--ink-dim);
  background: none; border: none; cursor: pointer;
  font-family: Figtree, sans-serif; padding: 4px 8px; border-radius: 6px;
}
.admin-remove:hover { color: var(--rose); background: var(--rose-light); }

.confirm-yes {
  padding: 2px 8px; border-radius: 5px;
  background: var(--rose); color: #fff; border: none;
  font-family: Figtree, sans-serif; font-size: 0.64rem; font-weight: 800;
  cursor: pointer;
}
.confirm-no {
  padding: 2px 8px; border-radius: 5px;
  background: var(--surface); border: 1px solid var(--border);
  font-family: Figtree, sans-serif; font-size: 0.64rem; font-weight: 700;
  cursor: pointer; color: var(--ink-dim);
}

.invite-form {
  margin-top: 14px; padding: 14px 16px;
  background: var(--teal-pale);
  border: 1px solid var(--teal-border);
  border-radius: var(--r-sm);
}
.btn-primary-sm {
  padding: 7px 14px; border-radius: 8px; border: none;
  background: var(--teal); color: #fff;
  font-family: Figtree, sans-serif; font-size: 0.74rem; font-weight: 800;
  cursor: pointer; white-space: nowrap;
}
.btn-close-sm {
  padding: 7px 10px; border-radius: 8px;
  border: 1.5px solid var(--teal-border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.74rem; font-weight: 700;
  cursor: pointer; color: var(--ink-mid);
}

.sec-tile {
  padding: 14px; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--r-sm);
}
.sec-title { font-size: 0.76rem; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
.sec-desc  { font-size: 0.66rem; color: var(--ink-dim); margin-bottom: 10px; }
.btn-secondary-sm {
  padding: 6px 14px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.73rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer;
}
.btn-secondary-sm:hover { border-color: var(--teal-border); color: var(--teal); }

.danger-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px solid var(--border);
}
.danger-row.no-border { border-bottom: none; }
.danger-title { font-size: 0.78rem; font-weight: 700; color: var(--ink); }
.danger-desc { font-size: 0.65rem; color: var(--ink-dim); margin-top: 2px; }
.btn-danger {
  padding: 7px 14px; border-radius: 8px;
  border: 1.5px solid var(--rose-border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.73rem; font-weight: 700;
  color: var(--rose); cursor: pointer;
}
.btn-danger:hover { background: var(--rose-light); }
.btn-danger-fill {
  padding: 7px 14px; border-radius: 8px;
  border: 1.5px solid var(--rose-border); background: var(--rose-light);
  font-family: Figtree, sans-serif; font-size: 0.73rem; font-weight: 700;
  color: var(--rose); cursor: pointer;
}
.btn-danger-fill:hover { background: var(--rose); color: #fff; }

.settings-toast {
  position: fixed; bottom: 32px; right: 32px;
  padding: 11px 18px; border-radius: 9px;
  color: #fff; font-family: Figtree, sans-serif;
  font-size: 0.78rem; font-weight: 700;
  box-shadow: 0 8px 32px rgba(0,0,0,0.16);
  z-index: 9999;
}
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }

/* Section navigation chips (own styling — independent of the student layer). */
.settings-tabs {
  display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 22px;
}
.stab-s {
  padding: 7px 14px; border-radius: 9px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.76rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer; transition: all 0.13s;
}
.stab-s:hover { border-color: var(--teal-border); color: var(--teal); }
.stab-s.active {
  border-color: var(--teal-border); color: var(--teal); background: var(--teal-pale);
}

/* Page-load skeleton shapes */
.set-sk {
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-hi, var(--border)) 37%, var(--surface) 63%);
  background-size: 400% 100%;
  border-radius: 6px;
  animation: setSkPulse 1.4s ease infinite;
}
@keyframes setSkPulse {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}
</style>
