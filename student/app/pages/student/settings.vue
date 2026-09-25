<script setup lang="ts">
definePageMeta({ layout: 'student' })
useHead({ title: 'Settings · Passmed' })

// Google sign-in widget (plugin registered in the frontend layer; available
// app-wide). Used here to let the user CONNECT Google from Settings.
import { GoogleSignInButton } from 'vue3-google-signin'
// Country list + per-country school data (shared with the onboarding modal).
import { COUNTRIES, schoolsForCountry } from '~/data/onboarding'

// ─── Auth + API ────────────────────────────────────────────────────────────
const { user, fetchMe } = useAuth()
const studentApi = useStudentApi()
const { activeExamId, examSwitching } = useExam()

// In-panel "Extend subscription" popup (mounted in the student layout). Each
// billing row's Extend button opens it with the exam preselected; on a
// successful purchase we refetch the billing list so the new expiry shows.
const { openExtend, successTick } = useSubscribeModal()

// ─── Initial load (so slow connections get a skeleton, not a blank form) ────
const loading   = ref(true)
const loadError = ref('')
// Full-page (content) skeleton: initial profile load OR an active-exam switch
// (the sidebar flips examSwitching the instant a new exam is picked, so the
// skeleton appears immediately — before the network refetch finishes).
const pageLoading = computed(() => loading.value || examSwitching.value)
async function loadProfile() {
  loading.value = true
  loadError.value = ''
  try {
    // Always refresh from /me so the Profile tab reflects the latest saved values
    // — e.g. onboarding details completed earlier this session, which the cached
    // (login-time) user object doesn't have yet. fetchMe() always hits /me.
    await fetchMe()
    if (!user.value) loadError.value = 'Could not load your settings. Please try again.'
  } catch (e: any) {
    loadError.value = e?.data?.msg || e?.message || 'Could not load your settings. Please try again.'
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  loadProfile()
  loadNotifPrefs()
  loadBilling()
  loadResetStatus()
  loadLinked()
})

// Active exam switched in the sidebar → refresh exam-scoped tabs (Danger zone
// reset status + Subscription "Active" badge) so they reflect the new exam.
watch(activeExamId, async (id, prev) => {
  if (id && id !== prev) {
    resetConfirmText.value = ''
    showResetModal.value = false
    await Promise.all([loadResetStatus(), loadBilling()])
    // Clear the sidebar's "switching" flag once this page's data has loaded
    // (so the skeleton — which shows the instant the user picks a new exam —
    // is replaced by the fresh exam's data).
    examSwitching.value = false
  }
})

const activeTab = ref('profile')

const tabs = [
  { id:'profile',       label:'Profile' },
  { id:'security',      label:'Security' },
  { id:'notifications', label:'Notifications' },
  { id:'billing',       label:'Subscription' },
  { id:'linked',        label:'Linked accounts' },
  { id:'danger',        label:'Danger zone' },
]

// ─── Profile (dynamic) ──────────────────────────────────────────────────────
// Only the three fields wired below are sent to /profile/update. The other
// fields shown earlier (specialty, training level, institution, school) are
// removed for now — add them back here AND on the Laravel side when ready.
const profile = reactive({
  name: '',
  email: '',
  grad_year: '',
  // Onboarding intake fields — editable here.
  audience: '',
  country: '',
  medical_school: '',          // dropdown value (or SCHOOL_OTHER sentinel)
  medical_school_other: '',    // free text when not listed / no list for country
  work_study: '',
  specialty: '',
  exam_date: '',               // YYYY-MM-DD for <input type=date>
})

const profileSaving = ref(false)

// ─── Security (dynamic) ─────────────────────────────────────────────────────
const security = reactive({ currentPw: '', newPw: '', confirmPw: '' })
const securitySaving = ref(false)

// ─── 2FA state (simple toggle for now) ──────────────────────────────────────
// Minimal placeholder until the full email-OTP flow is finalised with the
// client. For now the toggle just flips `users.two_fa_enabled` (0/1).
//
// UX: optimistic update — the toggle visually flips on click instantly, then
// the API call happens in the background. On error we revert. This avoids
// the "did my click register?" delay during the network round-trip.

const twoFaServerValue = computed<boolean>(() =>
  Boolean((user.value as any)?.two_fa_enabled),
)

// When non-null, this overrides what the server says (used while a toggle
// is in flight). Cleared after the call settles, success or error.
const twoFaOptimistic = ref<boolean | null>(null)

const twoFaEnabled = computed<boolean>(() =>
  twoFaOptimistic.value ?? twoFaServerValue.value,
)

const twoFaBusy = ref(false)

async function handleTwoFaToggle() {
  if (twoFaBusy.value) return

  const wasEnabled    = twoFaEnabled.value
  const willBeEnabled = !wasEnabled

  // 1) Optimistic flip — UI updates immediately, no waiting for the network.
  twoFaOptimistic.value = willBeEnabled
  twoFaBusy.value = true

  const path = willBeEnabled ? '/2fa/enable' : '/2fa/disable'

  try {
    await studentApi(path, { method: 'POST' })
    await fetchMe()
    // Server state now matches optimistic; clear override so we re-track server.
    twoFaOptimistic.value = null
    showToast(
      willBeEnabled
        ? 'Two-factor authentication enabled.'
        : 'Two-factor authentication disabled.',
      'ok',
    )
  } catch (e: any) {
    // 2) Revert the optimistic flip — toggle snaps back to its prior state.
    twoFaOptimistic.value = null
    showToast(e?.data?.msg || e?.message || 'Failed to update 2FA setting.', 'err')
  } finally {
    twoFaBusy.value = false
  }
}

// ─── Bottom toast (success + error notifications) ───────────────────────────
// All feedback (profile + security, success + error) is delivered through
// this single floating pill. Errors stay on screen a little longer so the
// user has time to read them; success auto-dismisses quickly.
const toast = ref<{ msg: string; kind: 'ok' | 'err' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string, kind: 'ok' | 'err' = 'ok') {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { msg, kind }
  // Errors stick around longer (5s) since they need to be read/acted on.
  const dismissAfter = kind === 'err' ? 5000 : 3000
  toastTimer = setTimeout(() => { toast.value = null }, dismissAfter)
}

// ─── Notifications — persisted to /notification-preferences ─────────────────
// Defaults mirror the backend (student_notif_prefs): the four in-app toggles
// default ON, the weekly email OFF. loadNotifPrefs() overwrites these with the
// saved values on mount; saveNotifs() persists changes. Each toggle gates the
// matching notification in InstituteNotifier (newContent → exam assigned,
// reminders → deadline/streak nudges, milestones → results, examUpdates →
// exam-live/cohort/seat, weeklyDigest → weekly email digest).
const notifs = reactive({
  newContent: true, reminders: true, milestones: true, examUpdates: true, weeklyDigest: false
})
const notifsSaving = ref(false)

async function loadNotifPrefs() {
  try {
    const res: any = await studentApi('/notification-preferences', { method: 'GET' })
    const d = res?.data
    if (d && typeof d === 'object') {
      notifs.newContent   = !!d.newContent
      notifs.reminders    = !!d.reminders
      notifs.milestones   = !!d.milestones
      notifs.examUpdates  = !!d.examUpdates
      notifs.weeklyDigest = !!d.weeklyDigest
    }
  } catch (e) {
    // Non-fatal — keep the defaults so the toggles still render.
    log.warn('settings', 'loadNotifPrefs failed', e)
  }
}

async function saveNotifs() {
  if (notifsSaving.value) return
  notifsSaving.value = true
  try {
    await studentApi('/notification-preferences', {
      method: 'POST',
      body: {
        newContent:   notifs.newContent,
        reminders:    notifs.reminders,
        milestones:   notifs.milestones,
        examUpdates:  notifs.examUpdates,
        weeklyDigest: notifs.weeklyDigest,
      },
    })
    showToast('Changes saved successfully', 'ok')
  } catch (e: any) {
    showToast(e?.data?.msg || e?.message || 'Failed to save preferences.', 'err')
  } finally {
    notifsSaving.value = false
  }
}

// ─── Billing / Subscription — live from /exams/billing ──────────────────────
// Replaces the old hardcoded "Passmed Pro / $29/mo / Visa 4242" card. Passmed
// is per-exam access, so this is a LIST: purchased exams (plan + expiry + price)
// and institute-assigned exams (institution name, no price), plus the payment
// history (transactions) shown under "Billing history".
interface BillingExam {
  source: 'personal' | 'institute'
  exam_id: number
  name: string
  plan: string | null
  expiry_date: string | null
  days_left: number | null
  status: 'active' | 'expired'
  is_current: boolean
  amount: number | null
  currency: string | null
  institution: string | null
}
const billingExams = ref<BillingExam[]>([])
const billingLoading = ref(false)

// Billing history — the student's payments/invoices, pulled from the same
// /exams/billing response (backend already returns a `transactions` array
// sourced from the local transactions table / Stripe). Shown in the "Billing
// history" list below the subscription cards.
interface BillingTxn {
  id: number
  exam: string | null
  plan: string | null          // Stripe product name (e.g. "PLE 1 Month")
  amount: number | null
  currency: string | null
  status: string               // succeeded | failed | pending
  date: string | null          // formatted date
  receipt_url?: string | null  // Stripe receipt/invoice URL when available
}
const billingHistory = ref<BillingTxn[]>([])

// Refresh the billing list after a successful add/extend in the popup.
watch(successTick, () => { loadBilling() })

async function loadBilling() {
  billingLoading.value = true
  try {
    const res: any = await studentApi('/exams/billing', { method: 'GET' })
    billingExams.value = Array.isArray(res?.data) ? res.data : []
    billingHistory.value = Array.isArray(res?.transactions) ? res.transactions : []
  } catch (e) {
    log.warn('settings', 'loadBilling failed', e)
    billingExams.value = []
    billingHistory.value = []
  } finally {
    billingLoading.value = false
    // Always release the sidebar's exam-switch skeleton flag once billing data
    // has resolved (covers both initial mount and exam-switch refetch).
    examSwitching.value = false
  }
}

// ─── Danger zone: reset ALL progress (whole account, once only) ────────────
const resetExamId    = ref(0)
const resetExamName  = ref<string | null>(null)
const resetDone      = ref(false)
const showResetModal = ref(false)
const resetConfirmText = ref('')
const resetting      = ref(false)
const resetModalEl = ref<HTMLElement | null>(null)

async function loadResetStatus() {
  try {
    const res: any = await studentApi('/reset-progress/status', { method: 'GET' })
    resetExamId.value   = Number(res?.exam_id || 0)
    resetExamName.value = res?.exam_name || null
    resetDone.value     = !!res?.reset_done
  } catch (e) {
    log.warn('settings', 'loadResetStatus failed', e)
  }
}

function openResetModal() {
  if (resetDone.value) return
  resetConfirmText.value = ''
  showResetModal.value = true
}
function closeResetModal() {
  if (resetting.value) return
  showResetModal.value = false
}

async function doReset() {
  if (resetting.value || resetConfirmText.value.trim() !== 'RESET') return
  resetting.value = true
  try {
    await studentApi('/reset-progress', { method: 'POST' })
    resetDone.value = true
    showResetModal.value = false
    showToast('Your account progress has been reset', 'ok')
  } catch (e: any) {
    showToast(e?.data?.msg || e?.message || 'Failed to reset progress.', 'err')
  } finally {
    resetting.value = false
  }
}

// ─── Danger zone: delete account (GDPR right-to-erasure) ───────────────────
// Permanently anonymises the account + purges personal data on the backend
// (POST /account/delete, password-confirmed). On success the server clears the
// auth cookie, so we hard-redirect home — the dead session bounces to login.
const showDeleteModal   = ref(false)
const deletePassword    = ref('')
const deleteConfirmText = ref('')
const deleting          = ref(false)
const deleteModalEl = ref<HTMLElement | null>(null)

function openDeleteModal() {
  deletePassword.value = ''
  deleteConfirmText.value = ''
  showDeleteModal.value = true
}
function closeDeleteModal() {
  if (deleting.value) return
  showDeleteModal.value = false
}

async function doDeleteAccount() {
  if (deleting.value || deleteConfirmText.value.trim() !== 'DELETE') return
  deleting.value = true
  try {
    await studentApi('/account/delete', { method: 'POST', body: { password: deletePassword.value } })
    showToast('Your account has been deleted.', 'ok')
    setTimeout(() => { window.location.href = '/' }, 1200)
  } catch (e: any) {
    showToast(e?.data?.msg || e?.message || 'Could not delete account. Check your password and try again.', 'err')
    deleting.value = false
  }
}

// Format a money amount with its currency (defaults to USD). Returns '' if null.
function money(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return ''
  const cur = (currency || 'usd').toUpperCase()
  const sym = cur === 'USD' ? '$' : ''
  return `${sym}${Number(amount).toFixed(2)}${sym ? '' : ' ' + cur}`
}

// Human label for the access plan / source.
function planLabel(e: BillingExam) {
  if (e.source === 'institute') return e.institution ? `Assigned by ${e.institution}` : 'Institute-assigned'
  const months = e.plan ? `${e.plan}-month access` : 'Access'
  return months
}

// Badge: only the currently-selected exam is "Active"; the rest show their
// source/status (Institute / Expired / Purchased).
function badgeText(e: BillingExam) {
  if (e.is_current) return 'Active'
  if (e.source === 'institute') return 'Institute'
  if (e.status === 'expired') return 'Expired'
  return 'Purchased'
}
function badgeStyle(e: BillingExam) {
  if (e.is_current) return ''                                                   // default teal "Active"
  if (e.source === 'institute') return 'background:#fef3c7;color:#b45309'       // amber
  if (e.status === 'expired') return 'background:var(--surface-2,#e5e7eb);color:var(--ink-dim,#6b7280)'  // gray
  return 'background:#e0f2fe;color:#0369a1'                                     // neutral blue (Purchased)
}
// Variant class for the two badges whose light colors are inline (institute amber,
// purchased blue) — lets the scoped `body.dark` rules give them a dark override,
// which a plain CSS rule cannot do against an inline style.
function badgeVariant(e: BillingExam) {
  if (e.source === 'institute') return 'bb-institute'
  if (!e.is_current && e.status !== 'expired') return 'bb-purchased'
  return ''
}

// ─── Hydrate profile fields from the auth user as soon as it's available ───
watchEffect(() => {
  if (!user.value) return
  const u = user.value as any
  profile.name            = u.name || ''
  profile.email           = u.email || ''
  profile.grad_year       = u.grad_year ? String(u.grad_year) : ''
  profile.audience        = u.audience || ''
  profile.country         = u.country || ''
  profile.work_study      = u.work_study || ''
  profile.specialty       = u.specialty || ''
  // <input type=date> needs YYYY-MM-DD; DB may return "2026-06-08 00:00:00".
  profile.exam_date       = u.exam_date ? String(u.exam_date).slice(0, 10) : ''
  // Map the stored school to the dropdown: a known school selects it directly;
  // anything else (or a country with no list) becomes free text.
  const known = schoolsForCountry(u.country || '').some(g => g.schools.includes(u.medical_school))
  profile.medical_school       = known ? u.medical_school : (u.medical_school ? SCHOOL_OTHER : '')
  profile.medical_school_other = known ? '' : (u.medical_school || '')
})

// ─── Onboarding / profile details (editable) ────────────────────────────────
// Captured during the one-time intake (StudentOnboardingModal), stored on the
// user row, returned by /me, and editable here. medical_school is matched
// against the selected country's list (data/onboarding.ts); a school not on the
// list — or any country with no list — is held in medical_school_other.
const SCHOOL_OTHER = '__other__'
const isStudentProfile     = computed(() => profile.audience === 'student')
const profileSchoolGroups  = computed(() => schoolsForCountry(profile.country))
const profileHasSchoolList = computed(() => profileSchoolGroups.value.length > 0)
// Only a USER change of country should reset the school (not programmatic
// hydration), so this is an @change handler rather than a watch.
function onProfileCountryChange() {
  profile.medical_school = ''
  profile.medical_school_other = ''
}
const effectiveProfileSchool = computed(() => {
  if (!profileHasSchoolList.value) return profile.medical_school_other.trim()
  return profile.medical_school === SCHOOL_OTHER
    ? profile.medical_school_other.trim()
    : profile.medical_school.trim()
})

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(String(d).replace(' ', 'T'))
  return isNaN(dt.getTime())
    ? String(d)
    : dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
// Terms acceptance stays read-only (informational — not something to edit).
const termsAcceptedLabel = computed(() => {
  const t = (user.value as any)?.terms_accepted_at
  return t ? `Accepted ${fmtDate(t)}` : ''
})

// ─── Save handlers ──────────────────────────────────────────────────────────
async function saveProfile() {
  if (profileSaving.value) return
  profileSaving.value = true

  try {
    // Email is intentionally omitted — students can't change it (also enforced
    // server-side in updateProfile). Onboarding fields are saved here too; the
    // school/work fields follow the selected audience so switching from resident
    // to student (or back) clears the now-irrelevant ones.
    const audienceFields = isStudentProfile.value
      ? { medical_school: effectiveProfileSchool.value || null, work_study: null, specialty: null }
      : { medical_school: null, work_study: profile.work_study.trim() || null, specialty: profile.specialty.trim() || null }
    await studentApi('/profile/update', {
      method: 'POST',
      body: {
        name: profile.name,
        grad_year: profile.grad_year || null,
        audience: profile.audience || null,
        country: profile.country || null,
        exam_date: profile.exam_date || null,
        ...audienceFields,
      },
    })
    // Re-fetch /me so sidebar / other components see the latest values.
    await fetchMe()
    showToast('Changes saved successfully', 'ok')
  } catch (e: any) {
    const msg =
      e?.data?.msg
      || e?.data?.errormsg
      || (e?.data?.errors && Object.values(e.data.errors).flat().join(', '))
      || e?.message
      || 'Failed to update profile.'
    showToast(msg, 'err')
  } finally {
    profileSaving.value = false
  }
}

// ─── Profile picture ────────────────────────────────────────────────────────
// Assumed backend contract (NOT built yet — wire the Laravel side to match):
//   POST   /profile/avatar         multipart/form-data, field "avatar" (image)
//                                  → { status:'success', data:{ avatar_url } }
//   POST   /profile/avatar/remove  → { status:'success' }
//   GET    /me                     → user.avatar_url: string | null
// Until the backend exists the control still renders (initials fallback) and
// uploads will simply error via the toast.
const avatarInput      = ref<HTMLInputElement | null>(null)
const avatarUploading  = ref(false)
const profileAvatarError = ref(false)
const profileAvatarUrl = computed(() =>
  profileAvatarError.value ? null : ((user.value as any)?.avatar_url || null))
watch(() => (user.value as any)?.avatar_url, () => { profileAvatarError.value = false })

const profileInitials = computed(() => {
  const n = (profile.name || (user.value as any)?.name || '').trim()
  if (!n) return '—'
  return n.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase() || '').join('') || '—'
})

async function onAvatarPick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    showToast('Please choose a PNG, JPG or WEBP image.', 'err')
    input.value = ''
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image must be 5MB or smaller.', 'err')
    input.value = ''
    return
  }
  avatarUploading.value = true
  try {
    const fd = new FormData()
    fd.append('avatar', file)
    await studentApi('/profile/avatar', { method: 'POST', body: fd })
    await fetchMe()                 // sidebar + this preview pick up the new URL
    profileAvatarError.value = false
    showToast('Profile photo updated', 'ok')
  } catch (err: any) {
    showToast(err?.data?.msg || err?.message || 'Failed to upload photo.', 'err')
  } finally {
    avatarUploading.value = false
    input.value = ''              // allow re-picking the same file
  }
}

async function removeAvatar() {
  if (avatarUploading.value) return
  avatarUploading.value = true
  try {
    await studentApi('/profile/avatar/remove', { method: 'POST' })
    await fetchMe()
    showToast('Profile photo removed', 'ok')
  } catch (err: any) {
    showToast(err?.data?.msg || err?.message || 'Failed to remove photo.', 'err')
  } finally {
    avatarUploading.value = false
  }
}

async function changePassword() {
  if (securitySaving.value) return

  // Client-side guards before hitting the API
  if (!security.currentPw || !security.newPw || !security.confirmPw) {
    showToast('Please fill in all password fields.', 'err')
    return
  }
  if (security.newPw !== security.confirmPw) {
    showToast('New password and confirmation do not match.', 'err')
    return
  }
  if (security.newPw.length < 8) {
    showToast('New password must be at least 8 characters.', 'err')
    return
  }

  securitySaving.value = true

  try {
    await studentApi('/password/change', {
      method: 'POST',
      body: {
        current_password: security.currentPw,
        new_password: security.newPw,
        new_password_confirmation: security.confirmPw,
      },
    })
    // Clear the form
    security.currentPw = ''
    security.newPw = ''
    security.confirmPw = ''
    showToast('Changes saved successfully', 'ok')
  } catch (e: any) {
    const msg =
      e?.data?.msg
      || e?.data?.errormsg
      || (e?.data?.errors && Object.values(e.data.errors).flat().join(', '))
      || e?.message
      || 'Failed to change password.'
    showToast(msg, 'err')
  } finally {
    securitySaving.value = false
  }
}

// ─── Linked Accounts (Google) ───────────────────────────────────────────────
const linkedLoading  = ref(true)
const googleConnected = ref(false)
const hasPassword     = ref(true)
const linkedBusy      = ref(false)

// Set-password mini-form, shown for Google-only accounts (so they can get a
// password before disconnecting, and use email login).
const showSetPw   = ref(false)
const setPw       = reactive({ newPw: '', confirmPw: '' })
const setPwSaving = ref(false)

async function loadLinked() {
  linkedLoading.value = true
  try {
    const res: any = await studentApi('/linked-accounts/status', { method: 'GET' })
    const d = res?.data || {}
    googleConnected.value = !!d.google_connected
    hasPassword.value     = !!d.has_password
  } catch {
    // Backend not deployed yet (dev hits prod API) → fall back to the user flag
    // so the row still reflects something sensible instead of erroring.
    googleConnected.value = (user.value as any)?.createdbytype === 'google'
    hasPassword.value     = (user.value as any)?.createdbytype !== 'google'
  } finally {
    linkedLoading.value = false
  }
}

function applyLinkedStatus(d: any) {
  if (!d) return
  googleConnected.value = !!d.google_connected
  hasPassword.value     = !!d.has_password
}

async function onConnectGoogleSuccess(response: any) {
  if (linkedBusy.value) return
  linkedBusy.value = true
  try {
    const res: any = await studentApi('/linked-accounts/google/connect', {
      method: 'POST',
      body: { credential: response.credential },
    })
    applyLinkedStatus(res?.data)
    await fetchMe()
    showToast('Google connected successfully.', 'ok')
  } catch (e: any) {
    showToast(e?.data?.msg || e?.message || 'Could not connect Google.', 'err')
  } finally {
    linkedBusy.value = false
  }
}

function onConnectGoogleError() {
  showToast('Google connection was cancelled.', 'err')
}

// Disconnect uses a styled in-app modal (not the native confirm). When the
// account has no password yet, the modal collects one inline and sets it
// before disconnecting — Google can't be removed while it's the only login.
const showDisconnectModal = ref(false)
const disconnecting       = ref(false)
const discPw              = reactive({ newPw: '', confirmPw: '' })
const disconnectModalEl = ref<HTMLElement | null>(null)

// Accessible modals: focus trap (Esc + Tab-cycle + focus restore)
useFocusTrap(resetModalEl, showResetModal, { onEscape: () => { closeResetModal() } })
useFocusTrap(deleteModalEl, showDeleteModal, { onEscape: () => { closeDeleteModal() } })
useFocusTrap(disconnectModalEl, showDisconnectModal, { onEscape: () => { closeDisconnectModal() } })

function openDisconnectModal() {
  if (linkedBusy.value) return
  discPw.newPw = ''
  discPw.confirmPw = ''
  showDisconnectModal.value = true
}
function closeDisconnectModal() {
  if (disconnecting.value) return
  showDisconnectModal.value = false
}

async function confirmDisconnect() {
  if (disconnecting.value) return

  // Google-only account → set a password first (same modal).
  if (!hasPassword.value) {
    if (!discPw.newPw || !discPw.confirmPw) {
      showToast('Please set a password to continue.', 'err'); return
    }
    if (discPw.newPw !== discPw.confirmPw) {
      showToast('Passwords do not match.', 'err'); return
    }
    if (discPw.newPw.length < 8) {
      showToast('Password must be at least 8 characters.', 'err'); return
    }
  }

  disconnecting.value = true
  try {
    if (!hasPassword.value) {
      const pwRes: any = await studentApi('/linked-accounts/set-password', {
        method: 'POST',
        body: { new_password: discPw.newPw, new_password_confirmation: discPw.confirmPw },
      })
      applyLinkedStatus(pwRes?.data)
    }

    const res: any = await studentApi('/linked-accounts/google/disconnect', { method: 'POST' })
    applyLinkedStatus(res?.data)
    await fetchMe()

    discPw.newPw = ''
    discPw.confirmPw = ''
    showDisconnectModal.value = false
    showToast('Google disconnected. You can now sign in with your email and password.', 'ok')
  } catch (e: any) {
    // Defensive: if the backend reports the account still has no password
    // (code: needs_password) — e.g. hasPassword was stale because the status
    // call had failed — flip into the "set a password" state and keep the modal
    // open so the inline password fields appear, instead of dead-ending on a
    // toast. The disconnect is correctly refused server-side either way, so the
    // user is never actually locked out.
    if (e?.data?.code === 'needs_password') {
      hasPassword.value = false
      showToast('Set a password first so you can still sign in after disconnecting.', 'err')
    } else {
      const msg = e?.data?.msg
        || (e?.data?.errors && Object.values(e.data.errors).flat().join(', '))
        || e?.message || 'Could not disconnect Google.'
      showToast(msg, 'err')
    }
  } finally {
    disconnecting.value = false
  }
}

async function submitSetPassword() {
  if (setPwSaving.value) return
  if (!setPw.newPw || !setPw.confirmPw) {
    showToast('Please fill in both password fields.', 'err'); return
  }
  if (setPw.newPw !== setPw.confirmPw) {
    showToast('Passwords do not match.', 'err'); return
  }
  if (setPw.newPw.length < 8) {
    showToast('Password must be at least 8 characters.', 'err'); return
  }

  setPwSaving.value = true
  try {
    const res: any = await studentApi('/linked-accounts/set-password', {
      method: 'POST',
      body: { new_password: setPw.newPw, new_password_confirmation: setPw.confirmPw },
    })
    applyLinkedStatus(res?.data)
    setPw.newPw = ''
    setPw.confirmPw = ''
    showSetPw.value = false
    await fetchMe()
    showToast('Password set successfully.', 'ok')
  } catch (e: any) {
    const msg = e?.data?.msg
      || (e?.data?.errors && Object.values(e.data.errors).flat().join(', '))
      || e?.message || 'Could not set password.'
    showToast(msg, 'err')
  } finally {
    setPwSaving.value = false
  }
}

</script>

<template>
  <!-- Topbar — shimmer band while the profile loads (unified full-page skeleton) -->
  <div v-if="loading" class="sk-topbar" style="display:flex;align-items:center;justify-content:space-between">
    <div>
      <div class="sk-pulse" style="width:110px;height:18px;border-radius:4px"></div>
      <div class="sk-pulse" style="width:280px;height:11px;border-radius:4px;margin-top:6px"></div>
    </div>
    <div class="sk-pulse" style="width:130px;height:34px;border-radius:9px"></div>
  </div>
  <StudentTopbar v-else title="Settings" />

  <div class="content">

    <!-- TABS — shapes while loading, real tabs after -->
    <div v-if="loading" style="display:flex;gap:6px;margin-bottom:24px;flex-wrap:wrap" class="fi d1">
      <div v-for="i in 6" :key="`tab-sk-${i}`" class="sk-pulse" style="width:92px;height:32px;border-radius:9px"></div>
    </div>
    <div v-else style="display:flex;gap:6px;margin-bottom:24px;flex-wrap:wrap" class="fi d1">
      <button v-for="tab in tabs" :key="tab.id" type="button"
        class="stab-s" :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id">
        {{ tab.label }}
      </button>
    </div>

    <!-- ── Loading skeleton (initial load + exam switch) ── -->
    <div v-if="pageLoading" class="settings-section fi d2">
      <div class="section-header">
        <div class="sk-pulse" style="width:34px;height:34px;border-radius:9px"></div>
        <div style="flex:1">
          <div class="sk-pulse" style="width:120px;height:13px;border-radius:4px;margin-bottom:7px"></div>
          <div class="sk-pulse" style="width:180px;height:10px;border-radius:4px"></div>
        </div>
      </div>
      <div v-for="i in 3" :key="`sk-row-${i}`" class="setting-row">
        <div class="row-left">
          <div class="sk-pulse" style="width:110px;height:12px;border-radius:4px"></div>
        </div>
        <div class="row-right" style="width:100%;max-width:320px">
          <div class="sk-pulse" style="width:100%;height:38px;border-radius:9px"></div>
        </div>
      </div>
    </div>

    <!-- ── Load error ── -->
    <div v-else-if="loadError" class="settings-section fi d2" style="text-align:center;padding:40px 20px">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--rose,#e11d48)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div style="font-size:0.9rem;font-weight:700;color:var(--ink,#0f1f2e);margin-top:12px">{{ loadError }}</div>
      <button type="button" class="settings-retry-btn" @click="loadProfile">Retry</button>
    </div>

    <!-- ── PROFILE ── -->
    <div v-show="activeTab === 'profile' && !pageLoading && !loadError" class="settings-section fi d2">
      <div class="section-header">
        <div class="section-icon" style="background:#e0f9fd">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0891b2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div><div class="section-title">Profile</div><div class="section-sub">Your personal information</div></div>
      </div>

      <div class="setting-row">
        <div class="row-left"><div class="row-label">Profile photo</div><div class="row-sub">PNG, JPG or WEBP · up to 5MB</div></div>
        <div class="row-right avatar-edit">
          <div class="avatar avatar-lg">
            <img v-if="profileAvatarUrl" :src="profileAvatarUrl" alt="Profile photo" class="avatar-img" @error="profileAvatarError = true" />
            <template v-else>{{ profileInitials }}</template>
          </div>
          <div class="avatar-actions">
            <input ref="avatarInput" type="file" accept="image/png,image/jpeg,image/webp" style="display:none" @change="onAvatarPick" />
            <button type="button" class="avatar-upload-btn" :disabled="avatarUploading" @click="avatarInput?.click()">
              {{ avatarUploading ? 'Uploading…' : (profileAvatarUrl ? 'Change photo' : 'Upload photo') }}
            </button>
            <button v-if="profileAvatarUrl" type="button" class="avatar-remove-btn" :disabled="avatarUploading" @click="removeAvatar">
              Remove
            </button>
          </div>
        </div>
      </div>
      <div class="setting-row">
        <div class="row-left"><div class="row-label">Full name</div></div>
        <div class="row-right"><input class="s-input" type="text" v-model="profile.name" :disabled="profileSaving" /></div>
      </div>
      <div class="setting-row">
        <div class="row-left"><div class="row-label">Email</div><div class="row-sub">Your account email can’t be changed</div></div>
        <div class="row-right"><input class="s-input" type="email" :value="profile.email" disabled readonly /></div>
      </div>
      <div class="setting-row">
        <div class="row-left"><div class="row-label">Year of graduation</div><div class="row-sub">Medical school graduation year</div></div>
        <div class="row-right">
          <select class="s-select" v-model="profile.grad_year" :disabled="profileSaving">
            <option value="">— Select —</option>
            <option v-for="y in ['2018','2019','2020','2021','2022','2023','2024','2025','2026','2027','2028']" :key="y" :value="y">{{ y }}</option>
          </select>
        </div>
      </div>

      <!-- Onboarding details — editable. Saved alongside name/grad year via /profile/update. -->
      <div class="onb-divider">Your details</div>
      <div class="setting-row">
        <div class="row-left"><div class="row-label">Account type</div></div>
        <div class="row-right">
          <select class="s-select" v-model="profile.audience" :disabled="profileSaving">
            <option value="" disabled>— Select —</option>
            <option value="student">Medical student</option>
            <option value="resident">Resident or doctor</option>
          </select>
        </div>
      </div>
      <div class="setting-row">
        <div class="row-left"><div class="row-label">Country</div></div>
        <div class="row-right">
          <select class="s-select" v-model="profile.country" :disabled="profileSaving" @change="onProfileCountryChange">
            <option value="">— Select —</option>
            <option v-for="c in COUNTRIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>

      <!-- Student: medical school (dropdown scoped to country, or free text) -->
      <template v-if="isStudentProfile">
        <div v-if="profileHasSchoolList" class="setting-row">
          <div class="row-left"><div class="row-label">Medical school</div></div>
          <div class="row-right">
            <select class="s-select" v-model="profile.medical_school" :disabled="profileSaving">
              <option value="" disabled>— Select —</option>
              <optgroup v-for="grp in profileSchoolGroups" :key="grp.group" :label="grp.group">
                <option v-for="s in grp.schools" :key="s" :value="s">{{ s }}</option>
              </optgroup>
              <option value="__other__">My school isn’t listed…</option>
            </select>
          </div>
        </div>
        <div v-if="profileHasSchoolList && profile.medical_school === '__other__'" class="setting-row">
          <div class="row-left"><div class="row-label">School name</div></div>
          <div class="row-right"><input class="s-input" type="text" v-model="profile.medical_school_other" :disabled="profileSaving" placeholder="Your medical school" /></div>
        </div>
        <div v-if="!profileHasSchoolList" class="setting-row">
          <div class="row-left"><div class="row-label">Medical school</div></div>
          <div class="row-right"><input class="s-input" type="text" v-model="profile.medical_school_other" :disabled="profileSaving" placeholder="Your medical school" /></div>
        </div>
      </template>

      <!-- Resident: where they work/study + specialty -->
      <template v-else>
        <div class="setting-row">
          <div class="row-left"><div class="row-label">Where you work / study</div></div>
          <div class="row-right"><input class="s-input" type="text" v-model="profile.work_study" :disabled="profileSaving" placeholder="Institution or program" /></div>
        </div>
        <div class="setting-row">
          <div class="row-left"><div class="row-label">Specialty</div></div>
          <div class="row-right"><input class="s-input" type="text" v-model="profile.specialty" :disabled="profileSaving" placeholder="e.g. Internal Medicine" /></div>
        </div>
      </template>

      <div class="setting-row" :style="termsAcceptedLabel ? '' : 'border-bottom:none'">
        <div class="row-left"><div class="row-label">Exam date</div></div>
        <div class="row-right"><input class="s-input" type="date" v-model="profile.exam_date" :disabled="profileSaving" /></div>
      </div>
      <!-- Terms acceptance stays read-only (informational). -->
      <div v-if="termsAcceptedLabel" class="setting-row" style="border-bottom:none">
        <div class="row-left"><div class="row-label">Terms of Use</div></div>
        <div class="row-right"><div class="row-value">{{ termsAcceptedLabel }}</div></div>
      </div>

      <div class="section-foot">
        <button type="button" class="btn-primary" :disabled="profileSaving" @click="saveProfile">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          {{ profileSaving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </div>

    <!-- ── SECURITY ── -->
    <div v-show="activeTab === 'security' && !pageLoading && !loadError" class="settings-section fi d2">
      <div class="section-header">
        <div class="section-icon" style="background:#fef9c3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div><div class="section-title">Password &amp; Security</div><div class="section-sub">Keep your account safe</div></div>
      </div>

      <div class="setting-row">
        <div class="row-left"><div class="row-label">Current password</div></div>
        <div class="row-right"><input class="s-input" type="password" v-model="security.currentPw" placeholder="Enter current password" :disabled="securitySaving" /></div>
      </div>
      <div class="setting-row">
        <div class="row-left"><div class="row-label">New password</div><div class="row-sub">At least 8 characters</div></div>
        <div class="row-right"><input class="s-input" type="password" v-model="security.newPw" placeholder="New password" :disabled="securitySaving" /></div>
      </div>
      <div class="setting-row">
        <div class="row-left"><div class="row-label">Confirm new password</div></div>
        <div class="row-right"><input class="s-input" type="password" v-model="security.confirmPw" placeholder="Confirm new password" :disabled="securitySaving" /></div>
      </div>
      <div class="setting-row" style="border-bottom:none">
        <div class="row-left">
          <div class="row-label">Two-factor authentication</div>
          <div class="row-sub">Extra layer of protection via authenticator app</div>
        </div>
        <div class="row-right" style="display:flex;align-items:center;gap:8px">
          <span style="font-size:0.72rem;font-weight:700;color:var(--ink-dim)">
            {{ twoFaBusy ? (twoFaEnabled ? 'Enabling…' : 'Disabling…') : (twoFaEnabled ? 'On' : 'Off') }}
          </span>
          <label class="toggle" :class="{ 'toggle--busy': twoFaBusy }" @click.prevent="handleTwoFaToggle">
            <input type="checkbox" :checked="twoFaEnabled" :disabled="twoFaBusy" />
            <div class="toggle-track"></div>
            <div class="toggle-thumb"></div>
          </label>
        </div>
      </div>

      <div class="section-foot">
        <button type="button" class="btn-primary"
          :disabled="securitySaving || !security.currentPw || !security.newPw || !security.confirmPw"
          @click="changePassword">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          {{ securitySaving ? 'Saving…' : 'Change password' }}
        </button>
      </div>
    </div>

    <!-- ── NOTIFICATIONS ── -->
    <div v-show="activeTab === 'notifications' && !pageLoading" class="settings-section fi d2">
      <div class="section-header">
        <div class="section-icon" style="background:#f5f3ff">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        </div>
        <div><div class="section-title">Notification Preferences</div><div class="section-sub">Choose what you hear about</div></div>
      </div>
      <div v-for="(pref, i) in [
        { key:'newContent',   label:'New content alerts',    sub:'When new questions or exams are added' },
        { key:'reminders',    label:'Study reminders',        sub:'Daily nudges to keep your streak' },
        { key:'milestones',   label:'Milestone achievements', sub:'When you hit performance milestones' },
        { key:'examUpdates',  label:'Exam updates',           sub:'Changes to your target exam or curriculum' },
        { key:'weeklyDigest', label:'Weekly digest email',    sub:'Performance summary sent every Monday' },
      ]" :key="pref.key" class="setting-row" :style="i===4?'border-bottom:none':''">
        <div class="row-left">
          <div class="row-label">{{ pref.label }}</div>
          <div class="row-sub">{{ pref.sub }}</div>
        </div>
        <div class="row-right">
          <label class="toggle">
            <input type="checkbox" v-model="notifs[pref.key as keyof typeof notifs]" />
            <div class="toggle-track"></div>
            <div class="toggle-thumb"></div>
          </label>
        </div>
      </div>

      <div class="section-foot">
        <button type="button" class="btn-primary" :disabled="notifsSaving" @click="saveNotifs">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          {{ notifsSaving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </div>

    <!-- ── SUBSCRIPTION ── -->
    <div v-show="activeTab === 'billing' && !pageLoading" class="settings-section fi d2">
      <div class="section-header">
        <div class="section-icon" style="background:#dcfce7">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        </div>
        <div><div class="section-title">Subscription</div><div class="section-sub">Manage your plan and billing</div></div>
      </div>
      <!-- Loading — billing fetch (exam-switch is handled by the page skeleton) -->
      <template v-if="billingLoading">
        <div v-for="i in 3" :key="`bill-sk-${i}`" class="billing-card">
          <div style="flex:1">
            <div class="sk-pulse" style="width:64px;height:20px;border-radius:6px;margin-bottom:10px"></div>
            <div class="sk-pulse" style="width:140px;height:15px;border-radius:5px;margin-bottom:8px"></div>
            <div class="sk-pulse" style="width:220px;height:11px;border-radius:4px"></div>
          </div>
          <div class="sk-pulse" style="width:64px;height:22px;border-radius:5px"></div>
        </div>
      </template>

      <!-- Empty -->
      <div v-else-if="billingExams.length === 0" class="setting-row" style="border-bottom:none">
        <div class="row-left">
          <div class="row-label">No exams yet</div>
          <div class="row-sub">Purchased or institution-assigned exams will appear here.</div>
        </div>
      </div>

      <!-- One card per exam the student has access to -->
      <template v-else>
        <div v-for="e in billingExams" :key="e.exam_id" class="billing-card">
          <div>
            <span class="billing-badge" :class="badgeVariant(e)" :style="badgeStyle(e)">{{ badgeText(e) }}</span>
            <div class="billing-name">{{ e.name }}</div>
            <div class="billing-detail">
              {{ planLabel(e) }}
              <template v-if="e.expiry_date">
                · {{ e.status === 'expired' ? 'Expired' : 'Expires' }} {{ e.expiry_date }}
              </template>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:9px;flex-shrink:0">
            <!-- Days remaining is the headline here — this view is for tracking access
                 and extending it. The order price is intentionally NOT shown: it was
                 only the last charge (not the total paid) and isn't meaningful here. -->
            <div v-if="e.status !== 'expired' && e.days_left != null" style="text-align:right;line-height:1.05">
              <div style="font-size:1.7rem;font-weight:800;color:var(--ink,#0f1f2e)">{{ e.days_left }}</div>
              <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-dim,#6b7280)">days left</div>
            </div>
            <div v-else-if="e.status === 'expired'" style="font-size:0.95rem;font-weight:800;color:#dc2626">Expired</div>
            <div v-else-if="e.source === 'institute'" style="font-size:0.8rem;font-weight:600;color:var(--ink-dim,#6b7280)">Assigned</div>
            <!-- Extend — personal exams only (institute access is assigned, not
                 purchasable by the student). Opens the in-panel checkout with
                 this exam preselected. -->
            <button v-if="e.source !== 'institute'" type="button" class="billing-extend-btn"
              @click="openExtend({ name: e.name })">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              {{ e.status === 'expired' ? 'Renew' : 'Extend' }}
            </button>
          </div>
        </div>
      </template>

      <!-- ── BILLING HISTORY (invoices / payments from Stripe) ── -->
      <!-- Inset 20px to line up with the subscription cards (which use margin:_ 20px)
           so the rows stay within the card container instead of spanning edge-to-edge. -->
      <div style="margin:28px 20px 4px;padding-top:22px;border-top:1px solid var(--border,#e5e7eb)">
        <div style="font-size:0.8rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-dim,#6b7280);margin-bottom:4px">Billing history</div>
        <div class="section-sub" style="margin-bottom:14px">Your payments and invoices.</div>

        <template v-if="billingLoading">
          <div v-for="i in 2" :key="`txn-sk-${i}`" class="sk-pulse" style="width:100%;height:46px;border-radius:8px;margin-bottom:8px"></div>
        </template>

        <div v-else-if="billingHistory.length === 0" class="row-sub" style="padding:4px 0">
          No payments yet — your invoices will appear here after your first purchase.
        </div>

        <div v-else>
          <div v-for="t in billingHistory" :key="t.id"
            style="display:flex;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid var(--border,#eef2f6)">
            <div style="flex:1;min-width:0">
              <div style="font-size:0.9rem;font-weight:700;color:var(--ink,#0f1f2e);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ t.plan || t.exam || 'Payment' }}</div>
              <div style="font-size:0.75rem;color:var(--ink-dim,#6b7280)">{{ t.date || '' }}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:0.9rem;font-weight:700;color:var(--ink,#0f1f2e)">{{ money(t.amount, t.currency) }}</div>
              <div style="font-size:0.68rem;font-weight:700;text-transform:capitalize"
                :style="{ color: t.status === 'succeeded' ? '#16a34a' : (t.status === 'failed' ? '#dc2626' : '#a16207') }">{{ t.status }}</div>
            </div>
            <a v-if="t.receipt_url" :href="t.receipt_url" target="_blank" rel="noopener" title="View receipt"
              style="flex-shrink:0;display:inline-flex;align-items:center;gap:5px;font-size:0.78rem;font-weight:700;color:var(--teal,#0891b2);text-decoration:none">
              Receipt
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </div>
        </div>
      </div>

    </div>

    <!-- ── LINKED ACCOUNTS ── -->
    <div v-show="activeTab === 'linked' && !pageLoading" class="settings-section fi d2">
      <div class="section-header">
        <div class="section-icon" style="background:#e0f9fd">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0891b2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </div>
        <div><div class="section-title">Linked Accounts</div><div class="section-sub">Connected third-party services</div></div>
      </div>
      <!-- Only Google is a real OAuth provider in this app (per client). -->
      <div class="linked-row" style="border-bottom:none;align-items:center">
        <div class="linked-logo" style="background:#f0f4ff">
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        </div>
        <div class="linked-info">
          <div class="linked-name">Google</div>
          <div v-if="linkedLoading" class="linked-status linked-disconnected">Checking…</div>
          <div v-else :class="googleConnected ? 'linked-status linked-connected' : 'linked-status linked-disconnected'">
            {{ googleConnected ? 'Connected · ' + ((user as any)?.email || '') : 'Not connected' }}
          </div>
        </div>

        <!-- Action area: Connect widget when not linked, Disconnect when linked -->
        <div class="linked-action" v-if="!linkedLoading">
          <div v-if="!googleConnected" class="google-connect-wrap">
            <GoogleSignInButton
              @success="onConnectGoogleSuccess"
              @error="onConnectGoogleError"
              type="standard" size="medium" shape="rectangular" text="signin_with"
            />
          </div>
          <button v-else type="button" class="linked-disconnect-btn"
            :disabled="linkedBusy" @click="openDisconnectModal">
            Disconnect
          </button>
        </div>
      </div>

      <!-- Set-password mini-form: only meaningful for Google-only accounts -->
      <div v-if="!linkedLoading && !hasPassword" class="linked-setpw">
        <div class="linked-setpw-note">
          Your account uses Google to sign in and has no password yet. Set one to
          be able to log in with email — and to disconnect Google.
        </div>
        <button v-if="!showSetPw" type="button" class="set-pw-toggle" @click="showSetPw = true">
          Set a password
        </button>
        <div v-else class="set-pw-form">
          <input v-model="setPw.newPw" type="password" class="fld" placeholder="New password (min 8 chars)" autocomplete="new-password" />
          <input v-model="setPw.confirmPw" type="password" class="fld" placeholder="Confirm new password" autocomplete="new-password" />
          <div class="set-pw-actions">
            <button type="button" class="set-pw-save" :disabled="setPwSaving" @click="submitSetPassword">
              {{ setPwSaving ? 'Saving…' : 'Save password' }}
            </button>
            <button type="button" class="set-pw-cancel" @click="showSetPw = false">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── DANGER ZONE ── -->
    <div v-show="activeTab === 'danger' && !pageLoading" class="settings-section danger-section fi d2">
      <div class="section-header" style="background:var(--rose-light)">
        <div class="section-icon" style="background:var(--rose-light)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <div><div class="section-title">Danger Zone</div><div class="section-sub">Irreversible actions — proceed with caution</div></div>
      </div>
      <div class="danger-row" style="border-bottom:none">
        <div>
          <div class="row-label">Reset all progress</div>
          <div class="row-sub">
            Clears your dashboard, past sessions, mock attempts &amp; statistics across
            <strong>all your exams</strong> — your whole account.
            Can only be done once and cannot be undone.
          </div>
        </div>
        <button type="button" class="btn-danger" :disabled="resetDone" @click="openResetModal">
          {{ resetDone ? 'Already reset' : 'Reset progress' }}
        </button>
      </div>
      <div class="danger-row" style="border-top:1px solid var(--rose-light);border-bottom:none">
        <div>
          <div class="row-label">Delete my account</div>
          <div class="row-sub">
            Permanently deletes your account and personal data — profile, past
            sessions, mock attempts, notes &amp; flags. Billing records are
            anonymised and retained for legal reasons. <strong>This cannot be undone.</strong>
          </div>
        </div>
        <button type="button" class="btn-danger" @click="openDeleteModal">Delete account</button>
      </div>
    </div>

  </div>

  <!-- Reset-progress confirm modal (requires typing RESET) -->
  <Teleport to="body">
    <div v-if="showResetModal" class="overlay open" @click.self="closeResetModal">
      <div ref="resetModalEl" class="modal-box" role="dialog" aria-modal="true" aria-label="Reset all progress?" style="max-width:420px;width:94vw">
        <div class="m-head">
          <div class="m-title">Reset all progress?</div>
          <button type="button" class="m-close" @click="closeResetModal" aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="m-body">
          <div class="m-note">
            This resets your dashboard, past sessions, mock attempts and statistics across
            <strong>all your exams</strong> — your whole account. Your data isn't deleted — it's hidden and your
            counters start fresh. <strong>This can only be done once.</strong>
          </div>
          <div style="margin:14px 0 6px;font-size:0.8rem;font-weight:600">Type <strong>RESET</strong> to confirm</div>
          <input class="s-input" type="text" v-model="resetConfirmText" placeholder="RESET" :disabled="resetting" style="width:100%" />
          <div class="m-btns" style="margin-top:16px">
            <button type="button" class="btn" :disabled="resetting" style="flex:1;justify-content:center" @click="closeResetModal">Cancel</button>
            <button type="button" class="btn btn-danger" :disabled="resetting || resetConfirmText.trim() !== 'RESET'" style="flex:1;justify-content:center" @click="doReset">
              {{ resetting ? 'Resetting…' : 'Reset progress' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete-account confirm modal (password + type DELETE) -->
    <div v-if="showDeleteModal" class="overlay open" @click.self="closeDeleteModal">
      <div ref="deleteModalEl" class="modal-box" role="dialog" aria-modal="true" aria-label="Delete your account?" style="max-width:440px;width:94vw">
        <div class="m-head">
          <div class="m-title">Delete your account?</div>
          <button type="button" class="m-close" @click="closeDeleteModal" aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="m-body">
          <div class="m-note">
            This <strong>permanently</strong> deletes your account and personal data —
            profile, past sessions, mock attempts, notes and flags. Your billing records
            are anonymised and kept for legal reasons. <strong>This cannot be undone.</strong>
          </div>
          <div style="margin:14px 0 6px;font-size:0.8rem;font-weight:600">
            Password <span style="font-weight:400;opacity:0.6">(leave blank if you sign in with Google)</span>
          </div>
          <input class="s-input" type="password" v-model="deletePassword" placeholder="Your password" :disabled="deleting" style="width:100%" autocomplete="current-password" />
          <div style="margin:14px 0 6px;font-size:0.8rem;font-weight:600">Type <strong>DELETE</strong> to confirm</div>
          <input class="s-input" type="text" v-model="deleteConfirmText" placeholder="DELETE" :disabled="deleting" style="width:100%" />
          <div class="m-btns" style="margin-top:16px">
            <button type="button" class="btn" :disabled="deleting" style="flex:1;justify-content:center" @click="closeDeleteModal">Cancel</button>
            <button type="button" class="btn btn-danger" :disabled="deleting || deleteConfirmText.trim() !== 'DELETE'" style="flex:1;justify-content:center" @click="doDeleteAccount">
              {{ deleting ? 'Deleting…' : 'Delete account' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Disconnect Google confirm modal (collects a password first if needed) -->
    <div v-if="showDisconnectModal" class="overlay open" @click.self="closeDisconnectModal">
      <div ref="disconnectModalEl" class="modal-box" role="dialog" aria-modal="true" aria-label="Disconnect Google?" style="max-width:440px;width:94vw">
        <div class="m-head">
          <div class="m-title">Disconnect Google?</div>
          <button type="button" class="m-close" @click="closeDisconnectModal" aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="m-body">
          <!-- Account already has a password → simple confirmation -->
          <div v-if="hasPassword" class="m-note">
            You'll sign in with your <strong>email and password</strong> from now on.
            You can reconnect Google any time.
          </div>

          <!-- Google-only account → must set a password before disconnecting -->
          <template v-else>
            <div class="m-note">
              Google is currently your <strong>only way to sign in</strong>. Set a
              password now so you can still access your account after disconnecting.
            </div>
            <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
              <input class="s-input" type="password" v-model="discPw.newPw" placeholder="New password (min 8 characters)" autocomplete="new-password" :disabled="disconnecting" style="width:100%" />
              <input class="s-input" type="password" v-model="discPw.confirmPw" placeholder="Confirm new password" autocomplete="new-password" :disabled="disconnecting" style="width:100%" />
            </div>
          </template>

          <div class="m-btns" style="margin-top:18px">
            <button type="button" class="btn" :disabled="disconnecting" style="flex:1;justify-content:center" @click="closeDisconnectModal">Cancel</button>
            <button type="button" class="btn btn-danger" :disabled="disconnecting" style="flex:1;justify-content:center" @click="confirmDisconnect">
              {{ disconnecting ? 'Working…' : (hasPassword ? 'Disconnect' : 'Set password & disconnect') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Bottom-center toast for success/error notifications. Auto-dismisses. -->
  <Transition name="toast">
    <div v-if="toast" class="settings-toast" :class="`settings-toast--${toast.kind}`">
      <svg v-if="toast.kind === 'ok'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>{{ toast.msg }}</span>
    </div>
  </Transition>
</template>

<style scoped>
/* Dark-mode overrides for the two billing badges whose light colors are inline
   (badgeStyle): amber "Institute" and blue "Purchased". !important is needed to beat
   the inline style; scoped to dark mode and to each variant so light mode is untouched. */
body.dark .billing-badge.bb-institute { background: #78350f !important; color: #fde68a !important; }
body.dark .billing-badge.bb-purchased { background: #0c4a6e !important; color: #bae6fd !important; }

.btn-primary[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Profile photo control (Settings → Profile). */
.avatar-edit {
  display: flex;
  align-items: center;
  gap: 16px;
}
.avatar-lg {
  width: 64px;
  height: 64px;
  font-size: 1.15rem;
  flex-shrink: 0;
}
.avatar-lg .avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}
.avatar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.avatar-upload-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1.5px solid var(--teal);
  background: var(--teal);
  color: #fff;
  font-family: 'Figtree', sans-serif;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.13s;
}
.avatar-upload-btn:hover:not(:disabled) { background: var(--teal-mid); border-color: var(--teal-mid); }
.avatar-upload-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.avatar-remove-btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1.5px solid var(--border);
  background: var(--white);
  color: var(--ink-mid);
  font-family: 'Figtree', sans-serif;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.13s;
}
.avatar-remove-btn:hover:not(:disabled) { border-color: var(--rose); color: var(--rose); }
.avatar-remove-btn:disabled { opacity: 0.55; cursor: not-allowed; }

/* Per-row Extend / Renew button on the Subscription billing cards. */
.billing-extend-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 13px;
  border: 1.5px solid var(--teal);
  border-radius: 8px;
  background: var(--white);
  color: var(--teal-mid);
  font-family: 'Figtree', sans-serif;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.13s;
  white-space: nowrap;
}
.billing-extend-btn:hover {
  background: var(--teal);
  color: #fff;
}

/* ─── Linked Accounts (Google connect / disconnect / set-password) ───────── */
.linked-action { margin-left: auto; display: flex; align-items: center; }
.google-connect-wrap { display: flex; align-items: center; }
.linked-disconnect-btn {
  border: 1px solid var(--border, #e5e7eb);
  background: var(--white, #fff);
  color: var(--rose, #e11d48);
  font-size: 13px; font-weight: 600;
  padding: 7px 14px; border-radius: 8px; cursor: pointer;
  transition: background .15s, border-color .15s;
}
.linked-disconnect-btn:hover:not([disabled]) {
  background: var(--rose-light, #fff1f2);
  border-color: var(--rose, #e11d48);
}
.linked-disconnect-btn[disabled] { opacity: .6; cursor: not-allowed; }

.linked-setpw {
  margin-top: 14px; padding: 14px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  background: var(--surface, #f8fafc);
}
.linked-setpw-note { font-size: 13px; color: var(--ink-soft, #64748b); line-height: 1.5; }
.set-pw-toggle {
  margin-top: 10px;
  border: 1px solid var(--border, #e5e7eb);
  background: var(--white, #fff);
  color: var(--ink, #0f1f2e);
  font-size: 13px; font-weight: 600;
  padding: 7px 14px; border-radius: 8px; cursor: pointer;
}
.set-pw-toggle:hover { border-color: var(--brand, #06b6d4); }
.set-pw-form { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.set-pw-form .fld {
  width: 100%;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  background: var(--white, #fff);
  color: var(--ink, #0f1f2e);
}
.set-pw-form .fld:focus { outline: none; border-color: var(--brand, #06b6d4); }
.set-pw-actions { display: flex; gap: 8px; }
.set-pw-save {
  background: var(--brand, #06b6d4); color: #fff; border: none;
  font-size: 13px; font-weight: 600; padding: 8px 16px;
  border-radius: 8px; cursor: pointer;
}
.set-pw-save[disabled] { opacity: .6; cursor: not-allowed; }
.set-pw-cancel {
  background: transparent; border: 1px solid var(--border, #e5e7eb);
  color: var(--ink-soft, #64748b); font-size: 13px; font-weight: 600;
  padding: 8px 16px; border-radius: 8px; cursor: pointer;
}
/* Per-section save footer (replaces the single top "Save changes" button). */
.section-foot {
  display: flex;
  justify-content: flex-end;
  padding: 16px;
  margin-top: 4px;
  border-top: 1px solid var(--border, #e5e7eb);
}
.s-input[disabled],
.s-select[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Read-only onboarding details on the Profile tab. */
.onb-divider {
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--ink-faint, #94a3b8);
  padding: 16px 20px 4px;
}
.row-value {
  /* Match the editable inputs' column (.s-input min-width:200px) and left-align
     so read-only values line up with the fields above instead of floating to
     the far page edge. */
  min-width: 200px;
  max-width: 320px;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--ink, #0f1f2e);
  text-align: left;
  word-break: break-word;
}

/* ─── Bottom toast ────────────────────────────────────────────────────────
   Floating pill at bottom-center for success/error notifications. Fixed
   positioning so it doesn't shift the page layout. */
.settings-toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 22px;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.2px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25);
  z-index: 9999;
  pointer-events: none;
  white-space: nowrap;
}
.settings-toast--ok {
  background: #0f172a;     /* dark slate, matches the mockup */
  color: #ffffff;
}
.settings-toast--ok svg {
  color: #22d3ee;          /* teal check icon */
}
.settings-toast--err {
  background: #991b1b;
  color: #fff;
}

/* Slide-up + fade transition */
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}

/* ─── 2FA toggle pending state ─────────────────────────────────────────────
   Subtle pulse + cursor change while the API call is in flight. Combined
   with the optimistic flip, this signals "click registered, working on it". */
.toggle--busy {
  cursor: progress;
  animation: toggle-busy-pulse 1.1s ease-in-out infinite;
}
@keyframes toggle-busy-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
}


/* Standard skeleton pulse — same effect + colour as every other student page
   (was a one-off shimmer gradient here, which looked different from the rest). */
.sk-pulse {
  background: var(--surface-2, #e5e7eb);
  animation: skPulse 1.2s ease-in-out infinite;
  display: block;
  border-radius: 4px;
}
@keyframes skPulse { 0%, 100% { opacity: 0.85; } 50% { opacity: 0.5; } }
.settings-retry-btn {
  margin-top: 16px; padding: 9px 20px; border-radius: 9px;
  border: 1.5px solid var(--teal,#06b6d4); background: var(--teal,#06b6d4); color: #fff;
  font-family: 'Figtree', sans-serif; font-size: 0.82rem; font-weight: 700; cursor: pointer;
}
.settings-retry-btn:hover { background: var(--teal-dark,#0369a1); border-color: var(--teal-dark,#0369a1); }
</style>