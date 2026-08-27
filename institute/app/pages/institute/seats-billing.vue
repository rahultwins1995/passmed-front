<script setup lang="ts">

// Permission matrix (admin panel → Role Matrix). The same rules are enforced
// server-side by the perm: middleware, so hiding a button is UX, not the
// security boundary.
//
//   canEdit   → create a cohort, rename it, invite/move a student   (perm:…,edit)
//   canManage → DELETE a cohort, REMOVE a student (revokes a seat)  (perm:…,full)
//
// Deleting a cohort and revoking someone's seat are not the same act as adding
// one, so they sit behind `full` rather than `edit`.
const { canEdit, canManage, readOnly } = useInstitutePermissions()
const PERM_AREA = 'seats_cohorts' as const

import { ref, computed, onMounted, watch, nextTick } from 'vue'
const { instName, userName, userEmail } = useInstitution()

definePageMeta({ layout: 'institute' })
useHead({ title: 'Seats & Cohorts · Institute' })

// ── Types ────────────────────────────────────────────────────────────────────
type StudentStatus = 'active' | 'invited' | 'atrisk'
type InviteMode    = 'single' | 'bulk' | 'existing'
type ActiveTab     = 'cohorts' | 'roster'
type RosterFilter  = 'all' | 'active' | 'atrisk' | 'invited'

type Student = {
  seatId: number
  userId: number | null
  name: string
  initials: string
  avatarUrl: string | null
  email: string
  status: StudentStatus
  joined: string
  lastActive: string
}

type Cohort = {
  id: number
  label: string
  color: string
  colorLight: string
  colorBorder: string
  examIds: number[]
  students: Student[]
}

type ExamOption = { id: number; name: string }

// Used by both the existing-student picker (id = userId) and the roster table
type ExistingStudent = {
  id: number           // userId — used by the invite picker
  seatId: number       // student_institutes.id — used by roster remove
  cohortId: number | null  // direct from roster API — drives Unassigned/In-a-cohort filter
  name: string
  email: string
  initials: string
  avatarUrl: string | null
  status: StudentStatus
  joined: string
  lastActive: string
  cohort: string
  avatarIdx: number
}

// ── API ───────────────────────────────────────────────────────────────────────
const api = useInstituteApi()

// ── Colour helpers ────────────────────────────────────────────────────────────
const cohortColors = [
  { label: 'Teal',   color: 'var(--teal)',   light: 'var(--teal-pale)',    border: 'var(--teal-border)'        },
  { label: 'Purple', color: '#8b5cf6',        light: 'var(--purple-light)', border: 'rgba(139,92,246,0.25)'    },
  { label: 'Green',  color: 'var(--green)',   light: 'var(--green-light)',  border: 'var(--green-border)'       },
  { label: 'Amber',  color: 'var(--amber)',   light: 'var(--amber-light)',  border: 'var(--amber-border)'       },
  { label: 'Rose',   color: 'var(--rose)',    light: 'var(--rose-light)',   border: 'var(--rose-border)'        },
  { label: 'Blue',   color: '#0ea5e9',        light: 'rgba(14,165,233,.1)', border: 'rgba(14,165,233,0.3)'     },
]

// Derived from cohortColors so the palette is defined in one place only.
const COHORT_COLOR_MAP: Record<string, { color: string; light: string; border: string }> =
  Object.fromEntries(cohortColors.map(c => [c.label.toLowerCase(), { color: c.color, light: c.light, border: c.border }]))

function resolveColor(name: string) {
  return COHORT_COLOR_MAP[name] ?? COHORT_COLOR_MAP['teal']!
}

function mapStudent(s: any): Student {
  const nm = s.name || s.invite_name || 'Unknown'
  const initials = nm.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  // getCohorts returns a computed `status` STRING ('active' | 'invited' | 'atrisk').
  // (Previously this read s.seat_status — a field the API doesn't send — so every
  // student defaulted to 'invited' and kept showing Resend even after activating.)
  // Prefer the string; fall back to a numeric seat_status for other shapes.
  const rawStatus = typeof s.status === 'string'
    ? s.status
    : ((s.seat_status ?? 0) === 1 ? 'active' : 'invited')
  const status: StudentStatus = rawStatus === 'active' ? 'active'
    : rawStatus === 'atrisk' ? 'atrisk'
    : 'invited'
  return {
    seatId: s.seat_id ?? 0,
    userId: s.user_id ?? null,
    name: nm,
    initials,
    avatarUrl: s.avatar_url ?? null,
    email: s.email ?? '',
    status,
    joined: s.invited_at
      ? new Date(s.invited_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
      : '—',
    lastActive: status === 'invited' ? 'Pending' : 'Recently',
  }
}

function mapCohort(raw: any): Cohort {
  const c = resolveColor(raw.color ?? 'teal')
  return {
    id: raw.id,
    label: raw.name,
    color: c.color,
    colorLight: c.light,
    colorBorder: c.border,
    examIds: Array.isArray(raw.exam_ids) ? raw.exam_ids.map(Number) : [],
    students: (raw.students ?? []).map(mapStudent),
  }
}

// ── Seats state ───────────────────────────────────────────────────────────────
const cohortsLoading = ref(true)
const totalSeats     = ref(0)          // set from GET /seats-info → licence_seats
const cohorts        = ref<Cohort[]>([])
// ── Licence lifecycle (display-only; billing stays manual) ─────────────────────
const licenceEnd     = ref<string | null>(null)   // ISO Y-m-d — expiry / renewal date
const licenceAutoRenew = ref(false)

// ── Remote data ───────────────────────────────────────────────────────────────
const examOptions      = ref<ExamOption[]>([])
const existingStudents  = ref<ExistingStudent[]>([])
const existingLoading   = ref(true)   // true on mount so skeleton shows immediately
const seatsInfoLoading  = ref(true)
const statsLoading      = computed(() => existingLoading.value || seatsInfoLoading.value)

async function fetchCohorts() {
  cohortsLoading.value = true
  try {
    const res: any = await api('/cohorts')
    cohorts.value = (res.data ?? []).map(mapCohort)
  } catch {
    showToast('Failed to load cohorts', 'var(--rose)')
  } finally {
    cohortsLoading.value = false
  }
}

async function fetchSeatsInfo() {
  try {
    const res: any = await api('/seats-info')
    totalSeats.value = res.data?.total_seats ?? 0
    // The licence EXPIRY (admin's End date) is the source of truth. Only fall back to
    // the renewal date when there is no end date — the renewal column historically
    // defaulted to the CREATION date, which wrongly showed "Expires today".
    licenceEnd.value = res.data?.licence_end_date ?? res.data?.licence_renew_date ?? null
    licenceAutoRenew.value = !!res.data?.licence_auto_renew
  } catch {} finally {
    seatsInfoLoading.value = false
  }
}

async function fetchExams() {
  try {
    const res: any = await api('/getexamsofinstitute')
    examOptions.value = res.data?.exams ?? []
  } catch {}
}

async function fetchExistingStudents() {
  existingLoading.value = true
  try {
    const res: any = await api('/institution-students')
    existingStudents.value = (res.data ?? []).map((s: any, idx: number) => {
      const nm = s.name ?? ''
      // Backend sends `status` as a STRING ('active' | 'atrisk' | 'invited').
      // (Old code compared a numeric seat_status === 1, so the string never
      // matched and EVERY row fell back to 'invited'.) Fall back to numeric
      // seat_status only for other response shapes.
      const rawStatus = typeof s.status === 'string'
        ? s.status
        : ((s.seat_status ?? 1) === 1 ? 'active' : 'invited')
      return {
        id:         s.user_id,
        seatId:     s.seat_id ?? s.id ?? 0,   // backend returns seat_id (student_institutes.id)
        cohortId:   s.cohort_id ?? null,
        name:       nm,
        email:      s.email ?? '',
        initials:   nm ? nm.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() : '??',
        avatarUrl:  s.avatar_url ?? null,
        status:     (rawStatus === 'active' ? 'active' : rawStatus === 'atrisk' ? 'atrisk' : 'invited') as StudentStatus,
        joined:     s.invited_at ?? s.created_at
          ? new Date(s.invited_at ?? s.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
          : '—',
        lastActive: s.last_active ?? '—',
        cohort:     s.cohort_name ?? s.cohort?.name ?? 'Unassigned',
        avatarIdx:  idx,
      }
    })
  } catch {} finally {
    existingLoading.value = false
  }
}

// Make sure we have the logged-in admin's name/email for support requests
// (same source the Contact form uses). Populates the shared useInstitution state.
async function ensureProfile() {
  if (userEmail.value) return
  try {
    const res: any = await api('/profile')
    if (res?.status === 'success') {
      if (!userName.value)  userName.value  = res.data?.user?.name  ?? ''
      if (!userEmail.value) userEmail.value = res.data?.user?.email ?? ''
    }
  } catch (e) { /* non-fatal */ }
}

const route = useRoute()

onMounted(() => {
  fetchSeatsInfo()
  fetchCohorts()
  fetchExams()
  fetchExistingStudents()
  ensureProfile()
})

// Deep-link from All Students "Invite a resident" (?invite=1). Handled via a
// watcher (immediate) so it fires reliably on BOTH a fresh load and client-side
// navigation into this page — an onMounted-only check missed SPA navigation.
const inviteDeepLinkDone = ref(false)
watch(() => route.query.invite, async (val) => {
  if (!val || inviteDeepLinkDone.value) return
  inviteDeepLinkDone.value = true
  // Defer past setup so all helpers/refs are initialised (immediate fires mid-setup).
  await nextTick()
  // Load seats + students + cohorts first (openInvite checks seatsAvailable).
  await Promise.all([fetchSeatsInfo(), fetchExistingStudents(), fetchCohorts()].map(p => p?.catch?.(() => {})))
  if (cohorts.value.length) openInvite(cohorts.value[0].id)
  else openNewCohort()
}, { immediate: true })

// ── Derived seat counts ───────────────────────────────────────────────────────
// seatsOccupied = every student_institutes row for this institution (all statuses)
// This matches existingStudents which comes from GET /institution-students
const seatsOccupied  = computed(() => existingStudents.value.length)
const seatsAvailable = computed(() => Math.max(0, totalSeats.value - seatsOccupied.value))
const usagePct       = computed(() => totalSeats.value > 0 ? Math.round((seatsOccupied.value / totalSeats.value) * 100) : 0)

// ── Licence expiry / renewal ──────────────────────────────────────────────────
// Whole days from today to the licence end/renewal date (null when no date on
// file). Both sides normalised to midnight so "today" reads 0, not a fraction.
const daysToExpiry = computed<number | null>(() => {
  if (!licenceEnd.value) return null
  const end = new Date(licenceEnd.value)
  if (isNaN(end.getTime())) return null
  const a = new Date(); a.setHours(0, 0, 0, 0)
  const b = new Date(end); b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
})
const licenceDateLabel = computed(() => {
  if (!licenceEnd.value) return 'No renewal date on file'
  const d = new Date(licenceEnd.value)
  if (isNaN(d.getTime())) return 'No renewal date on file'
  const when = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return (licenceAutoRenew.value ? 'Renews ' : 'Expires ') + when
})
// 60-day reminder. Amber ≤60 days, rose ≤14 days or already expired. Billing is
// manual, so this is a nudge to contact us — not an automated renewal.
const licenceReminder = computed(() => {
  const d = daysToExpiry.value
  if (d === null || d > 60) return null
  if (d < 0)  return { tone: 'rose' as const,  text: `Licence expired ${Math.abs(d)} day${Math.abs(d) !== 1 ? 's' : ''} ago — request renewal` }
  if (d === 0) return { tone: 'rose' as const,  text: 'Licence expires today — request renewal' }
  const tone = d <= 14 ? 'rose' as const : 'amber' as const
  return { tone, text: `Licence expires in ${d} day${d !== 1 ? 's' : ''} — request renewal` }
})

const avatarColors = ['var(--teal)', '#8b5cf6', 'var(--green)', 'var(--amber)', '#ec4899', '#0ea5e9', '#f97316']
function avatarBg(idx: number) { return avatarColors[idx % avatarColors.length] }

function statusData(s: StudentStatus) {
  if (s === 'active')  return { label: 'Active',  bg: 'var(--green-light)', fg: 'var(--green)',  bd: 'var(--green-border)'  }
  if (s === 'atrisk')  return { label: 'At-risk', bg: 'var(--rose-light)',  fg: 'var(--rose)',   bd: 'var(--rose-border)'   }
  return                      { label: 'Invited', bg: 'var(--amber-light)', fg: 'var(--amber)',  bd: 'var(--amber-border)'  }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const activeTab    = ref<ActiveTab>('cohorts')
const rosterFilter = ref<RosterFilter>('all')

// Roster draws directly from the institution-students API — shows every student
// in the institution, including those not yet assigned to a cohort.
const filteredRoster = computed(() =>
  rosterFilter.value === 'all'
    ? existingStudents.value
    : existingStudents.value.filter(s => s.status === rosterFilter.value)
)

// ── Inline invite form ────────────────────────────────────────────────────────
type InviteForm = {
  open: boolean
  cohortId: number | null
  mode: InviteMode
  firstName: string
  lastName: string
  email: string
  role: string
  selectedUserId: number | null
  existSearch: string
}
const inviteForm = ref<InviteForm>({
  open: false, cohortId: null, mode: 'single',
  firstName: '', lastName: '', email: '', role: '',
  selectedUserId: null, existSearch: '',
})

const filteredExisting = computed(() => {
  const q = inviteForm.value.existSearch.toLowerCase()
  const targetCohort = inviteForm.value.cohortId
  // Exclude students already in THIS cohort — you can't invite someone who's
  // already a member. (Moving them here would be a no-op.)
  const pool = existingStudents.value.filter(s => s.cohortId !== targetCohort)
  if (!q) return pool
  return pool.filter(
    s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
  )
})

// Seats/billing buttons → send a request through the SAME contact endpoint
// as the Contact Passmed form (POST /messages/send). No self-serve billing.
const contactingSupport = ref(false)
async function contactSupport(kind: 'add' | 'upgrade' | 'cancel' | 'renew') {
  if (contactingSupport.value) return
  const inst = instName.value || 'our institution'
  const map = {
    add:     { category: 'Seat management', msg: `I'd like to add seats to ${inst}. Current seats: ${totalSeats.value}, in use: ${seatsOccupied.value}. Additional seats required: ` },
    upgrade: { category: 'Seat management', msg: `I'd like to upgrade / add seats for ${inst}. Current seats: ${totalSeats.value}, in use: ${seatsOccupied.value}. Required: ` },
    cancel:  { category: 'Billing enquiry', msg: `I'd like to discuss cancelling the subscription for ${inst}.` },
    renew:   { category: 'Billing enquiry', msg: `I'd like to renew the licence for ${inst}${licenceEnd.value ? ` (current expiry ${licenceEnd.value})` : ''}.` },
  } as const
  const { category, msg } = map[kind]
  contactingSupport.value = true
  try {
    const res: any = await api('/messages/send', {
      method: 'POST',
      body: { category, message: msg, name: userName.value || inst, email: userEmail.value },
    })
    if (res?.status === 'success') showToast("Request sent — our team will be in touch", 'var(--teal)')
    else showToast(res?.msg || 'Failed to send request — try again', 'var(--rose)')
  } catch (e: any) {
    showToast(e?.data?.msg || 'Failed to send request — try again', 'var(--rose)')
  } finally {
    contactingSupport.value = false
  }
}

// Licence renewal — dedicated endpoint that emails institutions@passmed.com the
// institution's renewal request (separate from the generic support inbox).
async function requestRenewal() {
  if (contactingSupport.value) return
  contactingSupport.value = true
  try {
    const res: any = await api('/seats/renew-request', { method: 'POST', body: {} })
    if (res?.status === 'success') showToast(res?.message || 'Renewal request sent — our team will be in touch', 'var(--teal)')
    else showToast(res?.message || res?.msg || 'Failed to send request — try again', 'var(--rose)')
  } catch (e: any) {
    showToast(e?.data?.message || e?.data?.msg || 'Failed to send request — try again', 'var(--rose)')
  } finally {
    contactingSupport.value = false
  }
}

/*
 * ── "Request additional seats" ───────────────────────────────────────────────
 *
 * Posts to the purpose-built POST /seats/request, gated on `perm:seats_cohorts,edit`
 * — the page this button lives on. It used to be smuggled through /messages/send
 * (the contact-support endpoint) with the seat count pasted into a prose string,
 * which meant the ask was gated on `notifications` rather than on seats, and the
 * platform side received free text it had to re-read to find the number.
 *
 * Notify-only: the endpoint emails the platform team and writes an audit line. It
 * stores nothing, so nothing tracks whether the request was actioned. If seat
 * requests become routine they want a table with a status and an approval queue.
 */
const seatsModal = ref({ open: false, count: 5, note: '' })
function openSeatsModal() { seatsModal.value = { open: true, count: 5, note: '' } }
function closeSeatsModal() { seatsModal.value.open = false }

async function submitSeatsRequest() {
  if (contactingSupport.value) return

  const n = Number(seatsModal.value.count) || 0
  if (n < 1) { showToast('Please enter how many seats to add', 'var(--amber)'); return }

  contactingSupport.value = true
  try {
    const res: any = await api('/seats/request', {
      method: 'POST',
      body: { seats: n, note: seatsModal.value.note.trim() },
    })
    if (res?.status === 'success') {
      showToast(res?.message || 'Request sent — our team will be in touch', 'var(--teal)')
      closeSeatsModal()
    } else {
      showToast(res?.message || res?.msg || 'Failed to send request — try again', 'var(--rose)')
    }
  } catch (e: any) {
    showToast(e?.data?.message || e?.data?.msg || 'Failed to send request — try again', 'var(--rose)')
  } finally {
    contactingSupport.value = false
  }
}

function openInvite(cohortId: number) {
  // NOTE: no seat gate here. Adding an EXISTING student is a move (no new seat),
  // so the modal must open even when the licence is full. The seat check is
  // enforced in sendInvite() for the "new student" branch only.
  inviteForm.value = {
    open: true, cohortId, mode: 'single',
    firstName: '', lastName: '', email: '', role: '',
    selectedUserId: null, existSearch: '',
  }
}
function closeInvite() { inviteForm.value.open = false }

const inviteSubmitting = ref(false)

async function sendInvite(cohortId: number) {
  const cohort = cohorts.value.find(c => c.id === cohortId)
  if (!cohort) return

  const isExisting = inviteForm.value.mode === 'existing'

  let body: Record<string, any>
  if (isExisting) {
    if (!inviteForm.value.selectedUserId) { showToast('Please select a student', 'var(--amber)'); return }
    body = { user_id: inviteForm.value.selectedUserId }
  } else {
    const firstName = inviteForm.value.firstName.trim()
    const lastName  = inviteForm.value.lastName.trim()
    const email     = inviteForm.value.email.trim()
    if (!firstName) { showToast('Please enter the first name', 'var(--amber)');  return }
    if (!email)     { showToast('Please enter their email', 'var(--amber)'); return }
    // Seat gate applies ONLY to a brand-new student. An existing student joining
    // a cohort is a move within the institution and consumes no new seat.
    if (seatsAvailable.value <= 0) { showToast('No seats available — add more first', 'var(--amber)'); return }
    body = { first_name: firstName, last_name: lastName, email }
  }

  inviteSubmitting.value = true
  try {
    const res: any = await api(`/cohorts/${cohortId}/students`, { method: 'POST', body })
    const added = mapStudent(res.data)

    if (isExisting) {
      // MOVE: pull the student out of whatever cohort they were in (single-cohort
      // membership — multi-cohort would need a pivot table on the backend), then
      // drop them into the target so the UI doesn't show them in two places.
      for (const c of cohorts.value) {
        const i = c.students.findIndex(st => st.userId != null && st.userId === added.userId)
        if (i !== -1) c.students.splice(i, 1)
      }
      cohort.students.push(added)
      closeInvite()
      fetchExistingStudents()
      // No seat math — a move doesn't change seat usage.
      showToast(res?.message || `${added.name || 'Student'} added to ${cohort.label}`, 'var(--teal)')
    } else {
      cohort.students.push(added)
      closeInvite()
      // Refresh existingStudents so the 4 top stat boxes update immediately
      fetchExistingStudents()
      const left = seatsAvailable.value - 1
      showToast(`Invite sent · ${left} seat${left !== 1 ? 's' : ''} remaining`, 'var(--teal)')
    }
  } catch {
    showToast(isExisting ? 'Failed to add student' : 'Failed to send invite', 'var(--rose)')
  } finally {
    inviteSubmitting.value = false
  }
}

// ── Student actions ───────────────────────────────────────────────────────────
const resendingId = ref<number | null>(null)
async function resend(cohortId: number, seatId: number, name: string) {
  if (!seatId) { showToast('Cannot resend — missing seat', 'var(--amber)'); return }
  if (!cohortId) { showToast('Assign a cohort first to send the invite', 'var(--amber)'); return }
  if (resendingId.value) return
  resendingId.value = seatId
  try {
    const res: any = await api(`/cohorts/${cohortId}/students/${seatId}/resend`, { method: 'POST' })
    if (res?.status === 'error') showToast(res?.message || 'Failed to resend invite', 'var(--rose)')
    else showToast(`Invite resent to ${name}`, 'var(--teal)')
  } catch (e: any) {
    showToast(e?.data?.message || 'Failed to resend invite', 'var(--rose)')
  } finally {
    resendingId.value = null
  }
}

// ── Move student to another cohort ────────────────────────────────────────────
const moveModal = ref<{ open: boolean; seatId: number; fromCohortId: number; name: string; targetId: number | null }>({
  open: false, seatId: 0, fromCohortId: 0, name: '', targetId: null,
})
const movingId = ref<number | null>(null)

function openMove(cohortId: number, student: Student) {
  moveModal.value = { open: true, seatId: student.seatId, fromCohortId: cohortId, name: student.name, targetId: null }
}
function closeMove() { moveModal.value.open = false }

// Cohorts the student can be moved to (everything except their current one).
const moveTargets = computed(() => cohorts.value.filter(c => c.id !== moveModal.value.fromCohortId))

async function confirmMove() {
  const m = moveModal.value
  if (!m.targetId) { showToast('Please choose a cohort to move to', 'var(--amber)'); return }
  movingId.value = m.seatId
  try {
    const res: any = await api(`/cohorts/${m.fromCohortId}/students/${m.seatId}/move`, {
      method: 'POST',
      body: { target_cohort_id: m.targetId },
    })
    if (res?.status === 'success') {
      showToast(res?.message || 'Student moved', 'var(--teal)')
      closeMove()
      fetchCohorts()
    } else {
      showToast(res?.message || 'Failed to move student', 'var(--rose)')
    }
  } catch (e: any) {
    showToast(e?.data?.message || 'Failed to move student', 'var(--rose)')
  } finally {
    movingId.value = null
  }
}

// ── Edit cohort modal ─────────────────────────────────────────────────────────
type EditCohortModal = {
  open: boolean
  cohortId: number | null
  name: string
  colorIdx: number
  examIds: number[]
}

const editCohortModal = ref<EditCohortModal>({
  open: false, cohortId: null, name: '', colorIdx: 0, examIds: [],
})
function toggleEditExam(id: number) {
  const arr = editCohortModal.value.examIds
  const i = arr.indexOf(id)
  if (i === -1) arr.push(id); else arr.splice(i, 1)
}

function colorIdxFromCssValue(val: string): number {
  const idx = cohortColors.findIndex(c => c.color === val)
  return idx >= 0 ? idx : 0
}

function openEditCohort(cohort: Cohort) {
  editCohortModal.value = {
    open: true,
    cohortId: cohort.id,
    name: cohort.label,
    colorIdx: colorIdxFromCssValue(cohort.color),
    examIds: [...(cohort.examIds ?? [])],
  }
}
function closeEditCohort() { editCohortModal.value.open = false }

async function submitEditCohort() {
  const name = editCohortModal.value.name.trim()
  if (!name) { showToast('Please enter a cohort name', 'var(--amber)'); return }

  const c = cohortColors[editCohortModal.value.colorIdx]
  const body = {
    name,
    color:    c.label.toLowerCase(),
    exam_ids: editCohortModal.value.examIds,
  }

  try {
    const res: any = await api(`/cohorts/${editCohortModal.value.cohortId}`, { method: 'PATCH', body })
    const updated = mapCohort(res.data)
    const idx = cohorts.value.findIndex(c => c.id === editCohortModal.value.cohortId)
    if (idx !== -1) {
      // preserve existing students list — API response may not include them
      cohorts.value[idx] = { ...updated, students: cohorts.value[idx].students }
    }
    closeEditCohort()
    showToast(`Cohort "${name}" updated`, 'var(--teal)')
  } catch {
    showToast('Failed to update cohort', 'var(--rose)')
  }
}

// Styled confirm modal replaces the native browser confirm() dialog.
const pendingCohortDelete = ref<{ id: number; label: string } | null>(null)
function deleteCohort(cohortId: number, cohortLabel: string) {
  pendingCohortDelete.value = { id: cohortId, label: cohortLabel }
}
const deletingCohortId = ref<number | null>(null)
async function doDeleteCohort() {
  const pending = pendingCohortDelete.value
  pendingCohortDelete.value = null            // close the dialog immediately
  if (!pending || deletingCohortId.value) return
  const cohortId = pending.id
  const cohortLabel = pending.label
  deletingCohortId.value = cohortId           // busy guard — no double-fire
  try {
    await api(`/cohorts/${cohortId}`, { method: 'DELETE' })
    cohorts.value = cohorts.value.filter(c => c.id !== cohortId)
    showToast(`Cohort "${cohortLabel}" removed`, 'var(--ink)')
  } catch (e: any) {
    const code = e?.response?.status ?? e?.statusCode
    if (code === 403)      showToast("You don't have permission to remove cohorts.", 'var(--rose)')
    else if (code === 404) { cohorts.value = cohorts.value.filter(c => c.id !== cohortId); showToast('That cohort no longer exists.', 'var(--rose)') }
    else                   showToast(e?.data?.message || 'Failed to remove cohort', 'var(--rose)')
  } finally {
    deletingCohortId.value = null
  }
}

// Remove now asks for confirmation first (it frees the seat — shouldn't be
// a one-click accident).
const removeModal = ref<{ open: boolean; cohortId: number; seatId: number; name: string }>({
  open: false, cohortId: 0, seatId: 0, name: '',
})
const removingId = ref<number | null>(null)

function removeStudent(cohortId: number, seatId: number, studentName: string) {
  removeModal.value = { open: true, cohortId, seatId, name: studentName }
}
function closeRemove() { removeModal.value.open = false }

async function confirmRemoveStudent() {
  const m = { ...removeModal.value }
  closeRemove()                               // close the dialog immediately
  if (!m.cohortId || !m.seatId || removingId.value) return
  removingId.value = m.seatId
  const pruneSeat = () => {
    const cohort = cohorts.value.find(c => c.id === m.cohortId)
    if (cohort) cohort.students = cohort.students.filter(s => s.seatId !== m.seatId)
  }
  try {
    await api(`/cohorts/${m.cohortId}/students/${m.seatId}`, { method: 'DELETE' })
    pruneSeat()
    showToast(`${m.name} removed`, 'var(--ink)')
  } catch (e: any) {
    const code = e?.response?.status ?? e?.statusCode
    if (code === 403)      showToast("You don't have permission to remove students.", 'var(--rose)')
    else if (code === 404) { pruneSeat(); showToast('That student is no longer in this cohort.', 'var(--rose)') }
    else                   showToast(e?.data?.message || 'Failed to remove student', 'var(--rose)')
  } finally {
    removingId.value = null
  }
}

// ── Bulk CSV (inline invite panel) ────────────────────────────────────────────
const csvText     = ref('First name, Last name, Email\nJane, Smith, jane.smith@example.com')
const csvDragging = ref(false)

type CsvRow = { firstName: string; lastName: string; email: string; valid: boolean }
const csvParsed = computed<CsvRow[]>(() => {
  if (!csvText.value.trim()) return []
  const allLines = csvText.value.split('\n')
  const first = allLines[0]?.toLowerCase() ?? ''
  const lines = (first.includes('name') || first.includes('email')) ? allLines.slice(1) : allLines
  return lines.map(l => l.trim()).filter(Boolean).map(l => {
    const [firstName = '', lastName = '', email = ''] = l.split(',').map(s => s.trim())
    return { firstName, lastName, email, valid: !!firstName && /.+@.+\..+/.test(email) }
  })
})

// Read a dropped/selected file to CSV text. .xlsx/.xls are parsed with SheetJS
// (loaded on demand) and converted to CSV so the existing row parser works.
async function fileToText(file: File): Promise<string> {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    return ws ? XLSX.utils.sheet_to_csv(ws) : ''
  }
  return await file.text()
}

async function handleCsvFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  csvText.value = await fileToText(file)
}
async function handleDrop(e: DragEvent) {
  csvDragging.value = false
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (!file) return
  csvText.value = await fileToText(file)
}

// Download a starter CSV template (First name, Last name, Email) so admins
// populate the right shape for the cohort bulk upload. Client-only (on click).
function downloadCohortTemplate() {
  const csv = 'First name,Last name,Email\nJane,Doe,jane.doe@example.com\nJohn,Smith,john.smith@example.com\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'cohort-students-template.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function importCsv(cohortId: number) {
  const cohort = cohorts.value.find(c => c.id === cohortId)
  if (!cohort) return
  const valid    = csvParsed.value.filter(r => r.valid)
  const toInvite = valid.slice(0, Math.max(0, seatsAvailable.value))
  let added = 0
  let skipped = valid.length - toInvite.length
  for (const r of toInvite) {
    try {
      const resp: any = await api(`/cohorts/${cohortId}/students`, { method: 'POST', body: { first_name: r.firstName, last_name: r.lastName, email: r.email } })
      cohort.students.push(mapStudent(resp.data))
      added++
    } catch (e) { logError('[seats-billing] importCsv invite failed', r.email, e); skipped++ }
  }
  closeInvite()
  fetchExistingStudents()
  showToast(`${added} invite${added !== 1 ? 's' : ''} sent${skipped ? ` (${skipped} skipped)` : ''}`, 'var(--teal)')
}

// ── New cohort modal ──────────────────────────────────────────────────────────
type NewCohortModal = {
  open: boolean
  name: string
  colorIdx: number
  examIds: number[]
  inviteMode: 'single' | 'existing' | 'bulk'
  invFirstName: string
  invLastName: string
  invEmail: string
  invRole: string
  bulkCsv: string
  /* "Select students" tab (reference design) */
  selSearch: string
  selFilter: 'all' | 'unassigned' | 'incohort'
  selIds: number[]
}

const newCohortModal = ref<NewCohortModal>({
  open: false, name: '', colorIdx: 0,
  examIds: [],
  inviteMode: 'single',
  invFirstName: '', invLastName: '', invEmail: '', invRole: '',
  bulkCsv: '',
  selSearch: '', selFilter: 'all', selIds: [],
})
function toggleNewExam(id: number) {
  const arr = newCohortModal.value.examIds
  const i = arr.indexOf(id)
  if (i === -1) arr.push(id); else arr.splice(i, 1)
}

function openNewCohort() {
  newCohortModal.value = {
    open: true, name: '', colorIdx: 0,
    examIds: [],
    inviteMode: 'single',
    invFirstName: '', invLastName: '', invEmail: '', invRole: '',
    bulkCsv: '',
    selSearch: '', selFilter: 'all', selIds: [],
  }
}
function closeNewCohort() { newCohortModal.value.open = false }

// ── Create-cohort "Select students" picker (reference-design tab) ────────────
// Membership comes straight from the roster API's cohort_id (reliable even for
// pending invites, where user accounts don't exist yet).
const ncFilteredStudents = computed(() => {
  const m = newCohortModal.value
  const q = m.selSearch.trim().toLowerCase()
  const list = existingStudents.value.filter(st => {
    if (m.selFilter === 'unassigned' && st.cohortId != null) return false
    if (m.selFilter === 'incohort'   && st.cohortId == null) return false
    if (q && !(st.name.toLowerCase().includes(q) || st.email.toLowerCase().includes(q))) return false
    return true
  })
  // Selected students float to the top, unselected sit below (stable order
  // within each group) — so the admin can always review their picks first.
  const sel = new Set(m.selIds)
  return list.sort((a, b) => Number(sel.has(b.id)) - Number(sel.has(a.id)))
})
function ncToggleStudent(id: number) {
  const arr = newCohortModal.value.selIds
  const i = arr.indexOf(id)
  if (i === -1) arr.push(id)
  else arr.splice(i, 1)
}

const ncBulkParsed = computed(() => {
  if (!newCohortModal.value.bulkCsv.trim()) return [] as CsvRow[]
  const lines = newCohortModal.value.bulkCsv.split('\n')
  const first = lines[0]?.toLowerCase() ?? ''
  const data = (first.includes('name') || first.includes('email')) ? lines.slice(1) : lines
  return data.map(l => l.trim()).filter(Boolean).map(l => {
    const [firstName = '', lastName = '', email = ''] = l.split(',').map(s => s.trim())
    return { firstName, lastName, email, valid: !!firstName && /.+@.+\..+/.test(email) }
  })
})

async function handleNcCsvFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  newCohortModal.value.bulkCsv = await fileToText(file)
}
async function handleNcDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (!file) return
  newCohortModal.value.bulkCsv = await fileToText(file)
}

const cohortSubmitting = ref(false)

async function submitNewCohort() {
  const name = newCohortModal.value.name.trim()
  if (!name) { showToast('Please enter a cohort name', 'var(--amber)'); return }

  const c = cohortColors[newCohortModal.value.colorIdx]
  const body: Record<string, any> = {
    name,
    color:   c.label.toLowerCase(),
    exam_ids: newCohortModal.value.examIds,
  }

  // Optional single invite bundled with creation
  if (
    newCohortModal.value.inviteMode === 'single' &&
    newCohortModal.value.invFirstName.trim() &&
    newCohortModal.value.invEmail.trim()
  ) {
    body.invite_first_name = newCohortModal.value.invFirstName.trim()
    body.invite_last_name  = newCohortModal.value.invLastName.trim()
    body.invite_email      = newCohortModal.value.invEmail.trim()
  }

  cohortSubmitting.value = true
  try {
    const res: any = await api('/cohorts', { method: 'POST', body })
    const created = mapCohort(res.data)

    // "Select students" tab — attach the chosen existing students to the new
    // cohort (same endpoint the per-cohort Invite modal uses). Existing
    // students already occupy seats, so no seat check is needed here.
    let added = 0
    let skipped = 0
    if (newCohortModal.value.inviteMode === 'existing' && newCohortModal.value.selIds.length) {
      for (const uid of newCohortModal.value.selIds) {
        try {
          const r: any = await api(`/cohorts/${created.id}/students`, { method: 'POST', body: { user_id: uid } })
          created.students.push(mapStudent(r.data))
          added++
        } catch (e) { logError('[seats-billing] add existing student to new cohort failed', uid, e) }
      }
    }

    // Bulk upload tab — invite each valid parsed row by name+email (Mode B),
    // capped to available seats. Reuses the same /cohorts/{id}/students endpoint.
    if (newCohortModal.value.inviteMode === 'bulk') {
      const valid    = ncBulkParsed.value.filter(r => r.valid)
      const toInvite = valid.slice(0, Math.max(0, seatsAvailable.value))
      skipped = valid.length - toInvite.length
      for (const row of toInvite) {
        try {
          const r: any = await api(`/cohorts/${created.id}/students`, { method: 'POST', body: { first_name: row.firstName, last_name: row.lastName, email: row.email } })
          created.students.push(mapStudent(r.data))
          added++
        } catch (e) { logError('[seats-billing] bulk invite failed', row.email, e); skipped++ }
      }
    }

    cohorts.value.push(created)
    closeNewCohort()
    fetchExistingStudents()
    const skipMsg = skipped ? ` (${skipped} skipped)` : ''
    showToast(added
      ? `Cohort "${name}" created · ${added} student${added !== 1 ? 's' : ''} invited${skipMsg}`
      : `Cohort "${name}" created`, 'var(--teal)')
  } catch (e: any) {
    // Surface the real reason instead of a silent generic failure — a Laravel
    // validation error (422) arrives as e.data.message / e.data.errors.
    const errs = e?.data?.errors ? Object.values(e.data.errors).flat().join(', ') : ''
    showToast(e?.data?.msg || e?.data?.message || errs || 'Failed to create cohort', 'var(--rose)')
    logError('[seats-billing] create cohort failed', e)
  } finally {
    cohortSubmitting.value = false
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
const toast = ref('')
function showToast(msg: string, _color = '') {
  toast.value = msg
  setTimeout(() => (toast.value = ''), 2400)
}
</script>

<template>
  <!-- Topbar breadcrumb — same structure as every other institute page -->

  <div class="sb-page">

    <!-- Page header -->
    <!-- `view` level: page is visible but every mutation is hidden. -->
    <ReadOnlyBanner :area="PERM_AREA" />
    <div class="page-header">
      <div>
        <div class="page-title">Seats &amp; Cohorts</div>
        <div class="page-sub">Institution Pro · {{ instName || 'Institute' }}</div>
      </div>
    </div>

    <!-- Stat strip -->
    <div class="stat-grid">

      <!-- Skeleton state -->
      <template v-if="statsLoading">
        <div v-for="i in 4" :key="i" class="stat-card" style="--top:linear-gradient(90deg,var(--border),var(--border));">
          <div class="sk-line" style="width:64px;height:9px;border-radius:4px;margin-bottom:12px;"></div>
          <div class="sk-line" style="width:48px;height:28px;border-radius:6px;margin-bottom:10px;"></div>
          <div class="sk-line" style="width:90px;height:9px;border-radius:4px;"></div>
        </div>
      </template>

      <!-- Real values -->
      <template v-else>
        <div class="stat-card" style="--top:linear-gradient(90deg,#5b21b6,var(--purple));">
          <div class="stat-label">Total seats</div>
          <div class="stat-val mono">{{ totalSeats }}</div>
          <div class="stat-sub">Institution Pro</div>
        </div>
        <div class="stat-card" style="--top:linear-gradient(90deg,var(--teal-dark),var(--teal));">
          <div class="stat-label">Occupied</div>
          <div class="stat-val mono">{{ seatsOccupied }}</div>
          <div class="stat-sub">{{ usagePct }}% utilisation</div>
        </div>
        <div class="stat-card" :style="{ '--top': seatsAvailable <= 3 ? 'linear-gradient(90deg,#92400e,var(--amber))' : 'linear-gradient(90deg,#047857,var(--green))' }">
          <div class="stat-label">Available</div>
          <div class="stat-val mono">{{ seatsAvailable }}</div>
          <div class="stat-sub">Unallocated seats</div>
        </div>
        <div class="stat-card" style="--top:linear-gradient(90deg,#0369a1,var(--teal));">
          <div class="stat-label">Cohorts</div>
          <div class="stat-val mono">{{ cohorts.length }}</div>
          <div class="stat-sub">Active groups</div>
        </div>
      </template>

    </div>

    <!-- Low-seats warning -->
    <div v-if="seatsAvailable <= 5 && !cohortsLoading" class="warn-banner">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span>Only <strong>{{ seatsAvailable }} seat{{ seatsAvailable !== 1 ? 's' : '' }}</strong> remaining — add more seats before inviting more residents.</span>
    </div>

    <!-- Main 2-col layout -->
    <div class="main-grid">

      <!-- ── Left: tabs ──────────────────────────────────────────────────── -->
      <div>
        <!-- Tab toggle (pill style) -->
        <div class="tab-toggle">
          <button type="button" :class="{ active: activeTab === 'cohorts' }" @click="activeTab = 'cohorts'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Cohorts
          </button>
          <button type="button" :class="{ active: activeTab === 'roster' }" @click="activeTab = 'roster'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            All residents
          </button>
        </div>

        <!-- ── Cohorts tab ─────────────────────────────────────────────── -->
        <template v-if="activeTab === 'cohorts'">

          <!-- Loading skeleton -->
          <template v-if="cohortsLoading">
            <div class="cohort-meta-row">
              <div class="sk-line" style="width:240px;height:13px;border-radius:6px;"></div>
              <div class="sk-line" style="width:90px;height:28px;border-radius:8px;"></div>
            </div>
            <div v-for="i in 3" :key="i" class="cohort-card" style="margin-bottom:14px;">
              <div class="cohort-hdr" style="background:var(--surface);border-bottom-color:var(--border);">
                <div class="sk-line" style="width:34px;height:34px;border-radius:9px;flex-shrink:0;"></div>
                <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
                  <div class="sk-line" style="width:160px;height:13px;border-radius:6px;"></div>
                  <div class="sk-line" style="width:100px;height:10px;border-radius:5px;"></div>
                </div>
                <div class="sk-line" style="width:70px;height:30px;border-radius:8px;"></div>
              </div>
              <div v-for="j in 2" :key="j" class="student-row" style="border-bottom:1px solid var(--border);">
                <div class="sk-line" style="width:28px;height:28px;border-radius:50%;flex-shrink:0;"></div>
                <div style="flex:1;display:flex;flex-direction:column;gap:5px;">
                  <div class="sk-line" style="width:130px;height:12px;border-radius:5px;"></div>
                  <div class="sk-line" style="width:180px;height:10px;border-radius:5px;"></div>
                </div>
                <div class="sk-line" style="width:55px;height:20px;border-radius:20px;"></div>
                <div style="display:flex;gap:4px;">
                  <div class="sk-line" style="width:50px;height:24px;border-radius:6px;"></div>
                  <div class="sk-line" style="width:58px;height:24px;border-radius:6px;"></div>
                </div>
              </div>
            </div>
          </template>

          <!-- Real cohort list -->
          <template v-else>
            <div v-if="cohorts.length" class="cohort-meta-row">
              <span>{{ seatsOccupied }} residents across {{ cohorts.length }} cohorts · click <strong>Invite</strong> on any cohort to add a resident</span>
              <button type="button" v-if="canEdit(PERM_AREA)" class="btn-new-cohort" @click="openNewCohort">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New cohort
              </button>
            </div>

            <div v-for="cohort in cohorts" :key="cohort.id" class="cohort-card">
              <!-- Cohort header -->
              <div class="cohort-hdr" :style="{ background: cohort.colorLight, borderBottomColor: cohort.colorBorder }">
                <div class="cohort-icon" :style="{ background: cohort.color }">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <div style="flex:1;">
                  <div class="cohort-name">{{ cohort.label }}</div>
                  <div class="cohort-stats">
                    {{ cohort.students.length }} student{{ cohort.students.length !== 1 ? 's' : '' }}
                    <template v-if="cohort.students.filter(s => s.status === 'active').length > 0">
                      · <span style="color:var(--green);font-weight:700;">{{ cohort.students.filter(s => s.status === 'active').length }} active</span>
                    </template>
                    <template v-if="cohort.students.filter(s => s.status === 'atrisk').length > 0">
                      · <span style="color:var(--rose);font-weight:700;">{{ cohort.students.filter(s => s.status === 'atrisk').length }} at-risk</span>
                    </template>
                    <template v-if="cohort.students.filter(s => s.status === 'invited').length > 0">
                      · <span style="color:var(--amber);font-weight:700;">{{ cohort.students.filter(s => s.status === 'invited').length }} pending</span>
                    </template>
                  </div>
                </div>
                <button type="button"
                  class="cohort-invite-btn"
                  :style="{ color: cohort.color, borderColor: cohort.colorBorder }"
                  :disabled="seatsAvailable <= 0"
                  @click="openInvite(cohort.id)"
                 aria-label="Invite to cohort">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {{ seatsAvailable <= 0 ? 'Invite (full)' : 'Invite' }}
                </button>
                <button type="button"
                  class="cohort-edit-btn"
                  title="Edit cohort"
                  @click.stop="openEditCohort(cohort)"
                 aria-label="Edit cohort">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button type="button"
                  v-if="canManage(PERM_AREA)"
                  class="cohort-delete-btn"
                  title="Remove cohort"
                  :disabled="deletingCohortId === cohort.id"
                  @click.stop="deleteCohort(cohort.id, cohort.label)"
                 aria-label="Remove cohort">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>

              <!-- Inline invite form -->
              <div v-if="inviteForm.open && inviteForm.cohortId === cohort.id" class="invite-panel">
                <!-- Panel header -->
                <div class="invite-panel-hdr">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <span class="invite-panel-title">Invite to {{ cohort.label }}</span>
                    <span class="seats-badge" :class="seatsAvailable <= 3 ? 'amber' : 'teal'">
                      <span class="seats-dot"></span>
                      {{ seatsAvailable }} seat{{ seatsAvailable !== 1 ? 's' : '' }} remaining
                    </span>
                  </div>
                  <button type="button" class="close-x" @click="closeInvite" aria-label="Close">×</button>
                </div>

                <!-- Mode tabs -->
                <div class="mode-tabs">
                  <button type="button" :class="{ on: inviteForm.mode === 'single' }" @click="inviteForm.mode = 'single'">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Single invite
                  </button>
                  <button type="button" :class="{ on: inviteForm.mode === 'existing' }" @click="inviteForm.mode = 'existing'">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    Existing student
                  </button>
                  <button type="button" :class="{ on: inviteForm.mode === 'bulk' }" @click="inviteForm.mode = 'bulk'">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                    Bulk upload
                  </button>
                </div>

                <!-- Single invite -->
                <template v-if="inviteForm.mode === 'single'">
                  <div class="invite-single-grid">
                    <div>
                      <label>First name</label>
                      <input type="text" v-model="inviteForm.firstName" placeholder="Jane" class="invite-input" />
                    </div>
                    <div>
                      <label>Last name</label>
                      <input type="text" v-model="inviteForm.lastName" placeholder="Smith" class="invite-input" />
                    </div>
                    <div>
                      <label>Email</label>
                      <input type="email" v-model="inviteForm.email" placeholder="j.smith@hospital.edu" class="invite-input" />
                    </div>
                     
                    <button type="button" v-if="canEdit(PERM_AREA)" class="btn-send" :disabled="inviteSubmitting" @click="sendInvite(cohort.id)">
                      {{ inviteSubmitting ? 'Sending…' : 'Send invite →' }}
                    </button>
                  </div>
                  <div class="invite-note">🔒 The resident receives an email invitation to create their Passmed account. Uses 1 seat.</div>
                </template>

                <!-- Existing student picker -->
                <template v-else-if="inviteForm.mode === 'existing'">
                  <div v-if="existingLoading" class="exist-loading">
                    <div class="sk-line" style="width:100%;height:34px;border-radius:8px;margin-bottom:8px;"></div>
                    <div v-for="k in 3" :key="k" class="sk-line" style="width:100%;height:44px;border-radius:8px;margin-bottom:6px;"></div>
                  </div>
                  <template v-else>
                    <div style="margin-bottom:10px;">
                      <input
                        v-model="inviteForm.existSearch"
                        type="text"
                        placeholder="Search by name or email…"
                        class="invite-input"
                        style="width:100%;box-sizing:border-box;"
                      />
                    </div>
                    <div class="exist-list">
                      <div
                        v-for="s in filteredExisting"
                        :key="s.id"
                        class="exist-row"
                        :class="{ selected: inviteForm.selectedUserId === s.id }"
                        @click="inviteForm.selectedUserId = s.id"
                      >
                        <div class="student-ava" style="width:26px;height:26px;font-size:.58rem;background:var(--teal);flex-shrink:0;">
                          <img v-if="s.avatarUrl" :src="s.avatarUrl" :alt="s.name" class="student-ava-img" />
                          <template v-else>{{ s.initials }}</template>
                        </div>
                        <div style="flex:1;min-width:0;">
                          <div class="student-name">{{ s.name }}</div>
                          <div class="student-email mono">{{ s.email }}</div>
                        </div>
                        <svg v-if="inviteForm.selectedUserId === s.id" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <div v-if="!filteredExisting.length" class="cohort-empty" style="padding:16px;">
                        {{ inviteForm.existSearch ? 'No students match that search' : 'No existing students found' }}
                      </div>
                    </div>
                    <div style="text-align:right;margin-top:10px;">
                      <button type="button" class="btn-secondary" @click="closeInvite" style="margin-right:8px;">Cancel</button>
                      <button type="button" class="btn-send" :disabled="!inviteForm.selectedUserId || inviteSubmitting" @click="sendInvite(cohort.id)">
                        {{ inviteSubmitting ? 'Adding…' : 'Add to cohort →' }}
                      </button>
                    </div>
                  </template>
                </template>

                <!-- Bulk upload -->
                <template v-else>
                  <div
                    class="drop-zone"
                    :class="{ dragging: csvDragging }"
                    @dragover.prevent="csvDragging = true"
                    @dragleave="csvDragging = false"
                    @drop="handleDrop"
                    @click="($refs.csvFileInput as HTMLInputElement).click()"
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--teal-mid)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 10px;display:block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                    <div class="drop-title">Drop CSV or spreadsheet here</div>
                    <div class="drop-sub">or click to browse · .csv, .xlsx, .xls accepted</div>
                    <input ref="csvFileInput" type="file" accept=".csv,.xlsx,.xls" style="display:none" @change="handleCsvFile" />
                  </div>

                  <div v-if="csvParsed.length" class="csv-preview">
                    <div class="preview-hdr">{{ csvParsed.filter(r => r.valid).length }} valid · {{ csvParsed.filter(r => !r.valid).length }} invalid</div>
                    <div class="preview-list">
                      <div v-for="(r, i) in csvParsed" :key="i" class="preview-row" :class="{ invalid: !r.valid }">
                        <span>{{ [r.firstName, r.lastName].filter(Boolean).join(' ') || '—' }}</span>
                        <span class="mono dim">{{ r.email || '—' }}</span>
                        <span v-if="!r.valid" class="preview-bad">invalid</span>
                        <span v-else class="preview-ok">✓</span>
                      </div>
                    </div>
                  </div>

                  <div class="invite-note">Expected columns: <code>First name, Last name, Email</code> — header row optional. Each row uses 1 seat.
                    <a href="#" @click.prevent="downloadCohortTemplate" style="color:var(--teal-mid);font-weight:600;text-decoration:underline;margin-left:6px;">Download template</a>
                  </div>

                  <div style="text-align:right;margin-top:10px;">
                    <button type="button" class="btn-secondary" @click="closeInvite">Cancel</button>
                    <button type="button" class="btn-send" style="margin-left:8px;" :disabled="!csvParsed.filter(r => r.valid).length" @click="importCsv(cohort.id)">
                      Import {{ csvParsed.filter(r => r.valid).length }} residents
                    </button>
                  </div>
                </template>
              </div>

              <!-- Student list -->
              <div v-if="cohort.students.length">
                <div
                  v-for="(student, si) in cohort.students"
                  :key="student.seatId"
                  class="student-row"
                  :style="{ borderBottom: si < cohort.students.length - 1 ? '1px solid var(--border)' : 'none' }"
                >
                  <div class="student-ava" :style="{ background: avatarBg(si) }">
                    <img v-if="student.avatarUrl" :src="student.avatarUrl" :alt="student.name" class="student-ava-img" />
                    <template v-else>{{ student.initials }}</template>
                  </div>
                  <div style="flex:1;min-width:0;">
                    <div class="student-name">{{ student.name }}</div>
                    <div class="student-email mono">{{ student.email }}</div>
                  </div>
                  <span class="status-chip" :style="{ background: statusData(student.status).bg, color: statusData(student.status).fg, borderColor: statusData(student.status).bd }">
                    {{ statusData(student.status).label }}
                  </span>
                  <div style="display:flex;gap:4px;flex-shrink:0;">
                    <!-- Resend / Move are `edit`; Remove revokes a seat, so it is `full`. -->
                    <button type="button" v-if="canEdit(PERM_AREA) && student.status === 'invited'" class="action-btn teal" :disabled="resendingId === student.seatId" :style="resendingId === student.seatId ? 'opacity:0.6;cursor:default' : ''" @click="resend(cohort.id, student.seatId, student.name)">{{ resendingId === student.seatId ? 'Sending…' : 'Resend' }}</button>
                    <button type="button" v-else-if="canEdit(PERM_AREA)" class="action-btn" @click="openMove(cohort.id, student)">Move</button>
                    <button type="button" v-if="canManage(PERM_AREA)" class="action-btn danger" @click="removeStudent(cohort.id, student.seatId, student.name)">Remove</button>
                  </div>
                </div>
              </div>
              <div v-else class="cohort-empty">No students in this cohort yet. Click <strong>Invite</strong> to add residents.</div>
            </div>

            <!-- Empty state when no cohorts -->
            <div v-if="!cohorts.length" class="cohort-empty-state">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <div>No cohorts yet</div>
              <button type="button" class="btn-new-cohort" @click="openNewCohort" style="margin-top:10px;">+ Create your first cohort</button>
            </div>
          </template>
        </template>

        <!-- ── Roster tab ──────────────────────────────────────────────── -->
        <template v-else>
          <div class="card" style="padding:0;overflow:hidden;">
            <div class="roster-head">
              <div>
                <div class="card-title">All Residents</div>
                <div class="card-sub">{{ seatsOccupied }} of {{ totalSeats }} seats occupied</div>
              </div>
              <div style="display:flex;gap:5px;">
                <button type="button"
                  v-for="f in (['all','active','atrisk','invited'] as RosterFilter[])"
                  :key="f"
                  class="filter-pill"
                  :class="{ on: rosterFilter === f }"
                  @click="rosterFilter = f"
                >{{ f === 'all' ? 'All' : f === 'atrisk' ? 'At-risk' : f.charAt(0).toUpperCase() + f.slice(1) }}</button>
              </div>
            </div>

            <table class="roster-table">
              <thead>
                <tr>
                  <th style="padding-left:20px;">Resident</th>
                  <th>Cohort</th>
                  <th>Status</th>
                  <th>Last active</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(s, i) in filteredRoster" :key="s.id" class="roster-row">
                  <td style="padding-left:20px;">
                    <div style="display:flex;align-items:center;gap:9px;">
                      <div class="student-ava" :style="{ background: avatarBg(s.avatarIdx) }">
                        <img v-if="s.avatarUrl" :src="s.avatarUrl" :alt="s.name" class="student-ava-img" />
                        <template v-else>{{ s.initials }}</template>
                      </div>
                      <div>
                        <div class="student-name">{{ s.name }}</div>
                        <div class="student-email mono">{{ s.email }}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="cohort-chip">{{ s.cohort }}</span></td>
                  <td>
                    <span class="status-chip dot" :style="{ background: statusData(s.status).bg, color: statusData(s.status).fg, borderColor: statusData(s.status).bd }">
                      <span class="status-dot"></span>{{ statusData(s.status).label }}
                    </span>
                  </td>
                  <td class="dim">{{ s.lastActive }}</td>
                  <td class="dim">{{ s.joined }}</td>
                  <td style="text-align:right;padding-right:20px;">
                    <button type="button" v-if="canEdit(PERM_AREA) && s.status === 'invited'" class="ghost-btn teal" :disabled="resendingId === s.seatId" :style="resendingId === s.seatId ? 'opacity:0.6;cursor:default' : ''" @click="resend(s.cohortId ?? 0, s.seatId, s.name)">{{ resendingId === s.seatId ? 'Sending…' : 'Resend' }}</button>
                    <button type="button"
                      v-else-if="canManage(PERM_AREA) && s.cohortId"
                      class="ghost-btn danger"
                      @click="removeStudent(s.cohortId, s.seatId, s.name)"
                    >Remove</button>
                    <span v-else-if="!s.cohortId" class="dim" style="font-size:.65rem;">No cohort</span>
                  </td>
                </tr>
                <tr v-if="!filteredRoster.length">
                  <td colspan="6" class="table-empty">No residents match this filter</td>
                </tr>
              </tbody>
            </table>

            <div class="roster-footer">
              <span class="dim">{{ seatsAvailable }} seat{{ seatsAvailable !== 1 ? 's' : '' }} unallocated</span>
              <button type="button" class="btn-teal-outline" :disabled="!cohorts.length" @click="cohorts.length && openInvite(cohorts[0].id)">+ Invite resident</button>
            </div>
          </div>
        </template>
      </div>

      <!-- ── Right: subscription sidebar ────────────────────────────── -->
      <div style="display:flex;flex-direction:column;gap:14px;">

        <!-- Subscription card -->
        <div class="card">
          <div class="sub-hdr">
            <div>
              <div class="plan-meta">Annual · {{ totalSeats }} seats</div>
              <div class="plan-expiry">{{ licenceDateLabel }}</div>
            </div>
            <span class="active-badge">Active</span>
          </div>

          <!-- 60-day licence reminder (display-only; billing stays manual) -->
          <div v-if="licenceReminder" class="licence-alert" :class="`licence-alert--${licenceReminder.tone}`">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div class="licence-alert-body">
              <span>{{ licenceReminder.text }}</span>
              <button v-if="canEdit(PERM_AREA)" type="button" class="licence-alert-cta" :disabled="contactingSupport" @click="requestRenewal">
                {{ contactingSupport ? 'Sending…' : 'Request renewal' }}
              </button>
            </div>
          </div>

          <div class="usage-box">
            <div class="usage-row"><span>Seat usage</span><strong>{{ seatsOccupied }} / {{ totalSeats }}</strong></div>
            <div class="usage-bar">
              <div class="usage-fill" :style="{ width: usagePct + '%', background: usagePct >= 95 ? 'var(--rose)' : usagePct >= 80 ? 'var(--amber)' : 'linear-gradient(90deg,var(--teal-dark),var(--teal))' }"></div>
            </div>
          </div>


          <!-- Asking Passmed for more seats is a billing action. Gated on `edit` for
               seats_cohorts — a role with only `view` here sees its usage but cannot
               ask for more. The endpoint enforces the same, so hiding this is UX. -->
          <button v-if="canEdit(PERM_AREA)" type="button" class="btn-purple-full" @click="openSeatsModal()">Upgrade / Add seats</button>
        </div>

      </div>
    </div>

    <!-- New cohort modal -->
    <Transition name="modal">
      <div v-if="newCohortModal.open" class="modal-overlay" @click.self="closeNewCohort">
        <div class="nc-modal">

          <!-- Header -->
          <div class="nc-header">
            <div>
              <div class="nc-title">Create new cohort</div>
              <div class="nc-sub">{{ seatsAvailable }} seat{{ seatsAvailable !== 1 ? 's' : '' }} available</div>
            </div>
            <button type="button" class="nc-close" @click="closeNewCohort" aria-label="Close">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Body -->
          <div class="nc-body">

            <!-- Name + colour -->
            <div class="nc-name-row">
              <div style="flex:1;">
                <label>Cohort name <span style="color:var(--rose);">*</span></label>
                <input type="text" v-model="newCohortModal.name" placeholder="e.g. PGY-4, Fellow 2026, Cardiology Track…" class="modal-input" @keyup.enter="submitNewCohort" />
              </div>
              <div>
                <label>Colour</label>
                <div class="color-grid">
                  <button type="button"
                    v-for="(c, i) in cohortColors" :key="i"
                    class="color-swatch"
                    :style="{ background: c.color }"
                    :class="{ selected: newCohortModal.colorIdx === i }"
                    :title="c.label"
                    @click="newCohortModal.colorIdx = i"
                   :aria-label="c.label">
                    <svg v-if="newCohortModal.colorIdx === i" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Exams — multi-select (from API) -->
            <div class="modal-field">
              <label>Exams</label>
              <div class="exam-multi">
                <label v-for="exam in examOptions" :key="exam.id" class="exam-check">
                  <input type="checkbox" :checked="newCohortModal.examIds.includes(exam.id)" @change="toggleNewExam(exam.id)" />
                  <span>{{ exam.name }}</span>
                </label>
                <div v-if="!examOptions.length" class="exam-multi-empty">No exams available.</div>
              </div>
            </div>

            <!-- Invite students (optional) -->
            <div class="nc-divider">
              <div class="nc-section-label">Invite students <span style="font-weight:500;text-transform:none;letter-spacing:0;">(optional)</span></div>

              <!-- Mode toggle -->
              <div class="mode-tabs" style="margin-bottom:14px;">
                <button type="button" :class="{ on: newCohortModal.inviteMode === 'single' }" @click="newCohortModal.inviteMode = 'single'">Single</button>
                <button type="button" :class="{ on: newCohortModal.inviteMode === 'existing' }" @click="newCohortModal.inviteMode = 'existing'">Select students</button>
                <button type="button" :class="{ on: newCohortModal.inviteMode === 'bulk' }"   @click="newCohortModal.inviteMode = 'bulk'">Bulk upload</button>
              </div>

              <!-- Single -->
              <template v-if="newCohortModal.inviteMode === 'single'">
                <div class="nc-invite-grid">
                  <div>
                    <label>First name</label>
                    <input type="text"  v-model="newCohortModal.invFirstName" placeholder="Jane" class="modal-input" />
                  </div>
                  <div>
                    <label>Last name</label>
                    <input type="text"  v-model="newCohortModal.invLastName"  placeholder="Smith" class="modal-input" />
                  </div>
                  <div>
                    <label>Email</label>
                    <input type="email" v-model="newCohortModal.invEmail" placeholder="j.smith@hospital.edu" class="modal-input" />
                  </div>
                </div>
                <div class="invite-note">Leave empty to create the cohort without students — you can invite later.</div>
              </template>

              <!-- Select existing students (reference-design tab) -->
              <template v-else-if="newCohortModal.inviteMode === 'existing'">
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                  <input
                    v-model="newCohortModal.selSearch"
                    type="text"
                    placeholder="Search by name or email…"
                    class="modal-input"
                    style="flex:1;box-sizing:border-box;"
                  />
                  <select v-model="newCohortModal.selFilter" class="modal-input" style="width:auto;flex-shrink:0;">
                    <option value="all">All students</option>
                    <option value="unassigned">Unassigned</option>
                    <option value="incohort">In a cohort</option>
                  </select>
                </div>
                <div class="exist-list">
                  <div
                    v-for="st in ncFilteredStudents"
                    :key="st.id"
                    class="exist-row"
                    :class="{ selected: newCohortModal.selIds.includes(st.id) }"
                    @click="ncToggleStudent(st.id)"
                  >
                    <div class="student-ava" style="width:26px;height:26px;font-size:.58rem;background:var(--teal);flex-shrink:0;">
                      <img v-if="st.avatarUrl" :src="st.avatarUrl" :alt="st.name" class="student-ava-img" />
                      <template v-else>{{ st.initials }}</template>
                    </div>
                    <div style="flex:1;min-width:0;">
                      <div class="student-name">{{ st.name }}</div>
                      <div class="student-email mono">{{ st.email }}</div>
                    </div>
                    <span v-if="st.cohortId != null" style="font-size:0.6rem;color:var(--ink-faint);flex-shrink:0;">in cohort</span>
                    <svg v-if="newCohortModal.selIds.includes(st.id)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div v-if="!ncFilteredStudents.length" class="cohort-empty" style="padding:16px;">
                    {{ newCohortModal.selSearch ? 'No students match that search' : 'No students found' }}
                  </div>
                </div>
                <div class="invite-note" style="margin-top:8px;">
                  {{ newCohortModal.selIds.length }} student{{ newCohortModal.selIds.length !== 1 ? 's' : '' }} selected — they'll be added to the new cohort.
                </div>
              </template>

              <!-- Bulk -->
              <template v-else-if="newCohortModal.inviteMode === 'bulk'">
                <div
                  class="drop-zone"
                  @dragover.prevent
                  @drop="handleNcDrop"
                  @click="($refs.ncCsvInput as HTMLInputElement).click()"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 8px;display:block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                  <div class="drop-title">Drop CSV or spreadsheet here</div>
                  <div class="drop-sub">or click to browse · .csv, .xlsx accepted</div>
                  <input ref="ncCsvInput" type="file" accept=".csv,.xlsx,.xls" style="display:none" @change="handleNcCsvFile" />
                </div>
                <div v-if="ncBulkParsed.length" class="nc-bulk-summary" :class="ncBulkParsed.filter(r=>r.valid).length < ncBulkParsed.length ? 'amber' : 'green'">
                  {{ ncBulkParsed.filter(r => r.valid).length }} residents found ·
                  {{ Math.min(ncBulkParsed.filter(r=>r.valid).length, seatsAvailable) }} will be invited ({{ seatsAvailable }} seats available)
                  <template v-if="ncBulkParsed.filter(r=>r.valid).length > seatsAvailable">
                    · {{ ncBulkParsed.filter(r=>r.valid).length - seatsAvailable }} will be skipped
                  </template>
                </div>
                <div class="invite-note" style="margin-top:8px;">Expected columns: <code>First name, Last name, Email</code> — header row optional.
                  <a href="#" @click.prevent="downloadCohortTemplate" style="color:var(--teal-mid);font-weight:600;text-decoration:underline;margin-left:6px;">Download template</a>
                </div>
              </template>
            </div>
          </div>

          <!-- Footer -->
          <div class="nc-footer">
            <button type="button" class="btn-secondary" @click="closeNewCohort">Cancel</button>
            <button type="button" class="btn-send" :disabled="cohortSubmitting" @click="submitNewCohort">
              {{ cohortSubmitting ? 'Creating…' : 'Create cohort' }}
            </button>
          </div>

        </div>
      </div>
    </Transition>

    <!-- Edit cohort modal -->
    <Transition name="modal">
      <div v-if="editCohortModal.open" class="modal-overlay" @click.self="closeEditCohort">
        <div class="nc-modal">

          <div class="nc-header">
            <div>
              <div class="nc-title">Edit cohort</div>
              <div class="nc-sub">Changes apply immediately</div>
            </div>
            <button type="button" class="nc-close" @click="closeEditCohort" aria-label="Close">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="nc-body">
            <!-- Name + colour -->
            <div class="nc-name-row">
              <div style="flex:1;">
                <label>Cohort name <span style="color:var(--rose);">*</span></label>
                <input
                  type="text"
                  v-model="editCohortModal.name"
                  placeholder="e.g. PGY-4, Fellows 2026…"
                  class="modal-input"
                  @keyup.enter="submitEditCohort"
                />
              </div>
              <div>
                <label>Colour</label>
                <div class="color-grid">
                  <button type="button"
                    v-for="(c, i) in cohortColors" :key="i"
                    class="color-swatch"
                    :style="{ background: c.color }"
                    :class="{ selected: editCohortModal.colorIdx === i }"
                    :title="c.label"
                    @click="editCohortModal.colorIdx = i"
                   :aria-label="c.label">
                    <svg v-if="editCohortModal.colorIdx === i" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Exams — multi-select -->
            <div class="modal-field">
              <label>Exams</label>
              <div class="exam-multi">
                <label v-for="exam in examOptions" :key="exam.id" class="exam-check">
                  <input type="checkbox" :checked="editCohortModal.examIds.includes(exam.id)" @change="toggleEditExam(exam.id)" />
                  <span>{{ exam.name }}</span>
                </label>
                <div v-if="!examOptions.length" class="exam-multi-empty">No exams available.</div>
              </div>
            </div>
          </div>

          <div class="nc-footer">
            <button type="button" class="btn-secondary" @click="closeEditCohort">Cancel</button>
            <button type="button" class="btn-send" @click="submitEditCohort">Save changes</button>
          </div>

        </div>
      </div>
    </Transition>

    <!-- Move student to another cohort -->
    <Transition name="modal">
      <div v-if="moveModal.open" class="modal-overlay" @click.self="closeMove">
        <div class="nc-modal">
          <div class="nc-header">
            <div>
              <div class="nc-title">Move student</div>
              <div class="nc-sub">{{ moveModal.name }} — choose a cohort to move to</div>
            </div>
            <button type="button" class="nc-close" @click="closeMove" aria-label="Close">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="nc-body">
            <div class="modal-field">
              <label>Move to cohort</label>
              <select v-model.number="moveModal.targetId" class="modal-input">
                <option :value="null">Select cohort…</option>
                <option v-for="c in moveTargets" :key="c.id" :value="c.id">{{ c.label }}</option>
              </select>
              <div v-if="!moveTargets.length" style="font-size:0.75rem;color:var(--ink-dim);margin-top:6px;">
                No other cohorts to move to — create another cohort first.
              </div>
              <div v-else style="font-size:0.72rem;color:var(--ink-dim);margin-top:6px;">
                The student keeps their seat and progress — only their cohort changes.
              </div>
            </div>
          </div>

          <div class="nc-footer">
            <button type="button" class="btn-secondary" @click="closeMove">Cancel</button>
            <button type="button" class="btn-send"
              :disabled="!moveModal.targetId || movingId === moveModal.seatId"
              @click="confirmMove">
              {{ movingId === moveModal.seatId ? 'Moving…' : 'Move student' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Remove student confirmation -->
    <Transition name="modal">
      <div v-if="removeModal.open" class="modal-overlay" @click.self="closeRemove">
        <div class="nc-modal" style="max-width:420px;">
          <div class="nc-header">
            <div>
              <div class="nc-title">Remove student?</div>
              <div class="nc-sub">This frees their seat</div>
            </div>
            <button type="button" class="nc-close" @click="closeRemove" aria-label="Close">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="nc-body">
            <p style="font-size:0.85rem;color:var(--ink);margin:0;">
              Remove <strong>{{ removeModal.name }}</strong> from this cohort? This frees their seat. You can invite them again later.
            </p>
          </div>
          <div class="nc-footer">
            <button type="button" class="btn-secondary" @click="closeRemove">Cancel</button>
            <button type="button" class="btn-send" style="background:var(--rose);"
              :disabled="removingId === removeModal.seatId"
              @click="confirmRemoveStudent">
              {{ removingId === removeModal.seatId ? 'Removing…' : 'Remove' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Request additional seats modal -->
    <Transition name="modal">
      <div v-if="seatsModal.open" class="modal-overlay" @click.self="closeSeatsModal">
        <div class="nc-modal">
          <div class="nc-header">
            <div>
              <div class="nc-title">Request additional seats</div>
              <div class="nc-sub">Passmed team will respond within 1 business day</div>
            </div>
            <button type="button" class="nc-close" @click="closeSeatsModal" aria-label="Close">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="nc-body">
            <div class="seats-plan-box">
              <div>
                <div class="seats-plan-k">Current plan</div>
                <div class="seats-plan-v">Institution Pro · {{ totalSeats }} seats</div>
              </div>
            </div>
            <div class="modal-field">
              <label class="modal-label">Seats to add <span style="color:var(--rose)">*</span></label>
              <input type="number" min="1" v-model.number="seatsModal.count" class="modal-input" />
            </div>
            <div class="modal-field">
              <label class="modal-label">Notes <span style="color:var(--ink-dim);font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
              <textarea v-model="seatsModal.note" class="modal-input" rows="3" placeholder="e.g. New PGY-1 cohort starting Sep 2026…" style="resize:vertical"></textarea>
            </div>
          </div>
          <div class="nc-footer">
            <button type="button" class="btn-secondary" @click="closeSeatsModal">Cancel</button>
            <button type="button" class="btn-send" :disabled="contactingSupport" @click="submitSeatsRequest">Send request</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Toast -->
    <Transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Transition>
  </div>

  <ConfirmModal
    :open="pendingCohortDelete !== null"
    title="Remove cohort"
    :message="`Remove cohort “${pendingCohortDelete?.label}”?\n\nStudents won't be deleted — they'll just lose their cohort assignment.`"
    confirm-label="Remove"
    danger
    @confirm="doDeleteCohort"
    @cancel="pendingCohortDelete = null"
  />
</template>

<style scoped>
.sb-page { padding: 18px 22px; max-width: 1280px; }
.fade-in { animation: fadeUp .3s cubic-bezier(.16,1,.3,1) both; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* ── Skeleton ─────────────────────────────────────────────────────────── */
.sk-line {
  background: linear-gradient(90deg, var(--surface) 25%, var(--border) 50%, var(--surface) 75%);
  background-size: 600px 100%;
  animation: sk-shimmer 1.4s ease-in-out infinite;
  display: block;
}
@keyframes sk-shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}

/* ── Header ──────────────────────────────────────────────────────────── */
.page-header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 18px; gap: 12px; flex-wrap: wrap; 
  @media (max-width: 500px) {
    flex-direction: column; align-items: flex-start;
  }
}
.page-title  { font-size: 1.5rem; font-weight: 800; color: var(--ink); }
.page-sub    { font-size: .82rem; color: var(--ink-dim); margin-top: 2px; }

.hdr-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 9px; border: 1.5px solid var(--border);
  background: var(--white); font-family: Figtree, sans-serif;
  font-size: .76rem; font-weight: 700; color: var(--ink-mid); cursor: pointer;
}
.hdr-btn:hover { border-color: var(--teal-border); color: var(--teal); background: var(--teal-pale); }
.hdr-btn:disabled { opacity: .5; cursor: not-allowed; }
.hdr-purple { background: var(--purple); color: #fff; border-color: var(--purple); }
.hdr-purple:hover { background: #6d28d9; color: #fff; border-color: #6d28d9; }

/* ── Stat strip ──────────────────────────────────────────────────────── */
.stat-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 18px; 
  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }}
.stat-card {
  padding: 14px 16px; border-radius: var(--r-lg);
  background: var(--white); border: 1px solid var(--border);
  position: relative; overflow: hidden;
}
.stat-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0;
  height: 3px; background: var(--top); border-radius: var(--r-lg) var(--r-lg) 0 0;
}
.stat-label { font-size: .62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--ink-dim); margin-bottom: 6px; }
.stat-val   { font-size: 1.6rem; font-weight: 700; color: var(--ink); line-height: 1; }
.stat-sub   { font-size: .65rem; color: var(--ink-dim); margin-top: 4px; }
.mono       { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; }

/* ── Warning banner ──────────────────────────────────────────────────── */
.warn-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; background: var(--amber-pale);
  border: 1px solid var(--amber-border); border-radius: var(--r-sm);
  font-size: .73rem; color: var(--amber-dark); margin-bottom: 16px;
}

/* ── Main grid ───────────────────────────────────────────────────────── */
.main-grid { display: grid; grid-template-columns: 1fr 320px; gap: 16px; align-items: start; 
  @media (max-width: 1000px) {
    grid-template-columns: 1fr;
    & > div { min-width: 0%; }
  }
}

/* ── Tab toggle (pill style) ─────────────────────────────────────────── */
.tab-toggle {
  display: flex; gap: 4px; background: var(--surface);
  border: 1px solid var(--border); border-radius: 10px;
  padding: 4px; margin-bottom: 16px; width: fit-content;
}
.tab-toggle button {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 18px; border-radius: 8px; border: 1.5px solid transparent;
  background: transparent; font-family: Figtree, sans-serif;
  font-size: .76rem; font-weight: 700; color: var(--ink-dim); cursor: pointer;
}
.tab-toggle button.active {
  background: var(--white); color: var(--teal-mid);
  border-color: var(--teal-border); box-shadow: 0 1px 4px rgba(0,0,0,.06);
}

/* ── Cohort meta row ─────────────────────────────────────────────────── */
.cohort-meta-row {
  display: flex; align-items: center; justify-content: space-between;
  font-size: .72rem; color: var(--ink-dim); margin-bottom: 14px;

  @media (max-width: 500px) {
    flex-direction: column; align-items: flex-start; gap: 10px;
  }
}
.btn-new-cohort {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-radius: 8px; border: 1.5px dashed var(--border);
  background: var(--white); font-family: Figtree, sans-serif;
  font-size: .73rem; font-weight: 600; color: var(--ink-dim); cursor: pointer;
}
.btn-new-cohort:hover { border-color: var(--teal-border); color: var(--teal); }

/* ── Cohort card ─────────────────────────────────────────────────────── */
.cohort-card {
  border: 1px solid var(--border); border-radius: var(--r-lg);
  background: var(--white); overflow: hidden; margin-bottom: 14px;
}
.cohort-hdr {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border-bottom: 1px solid;
  @media (max-width: 500px) {
    flex-wrap: wrap; gap: 10px;
  }
}
.cohort-icon {
  width: 34px; height: 34px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.cohort-name  { font-size: .86rem; font-weight: 800; color: var(--ink); }
.cohort-stats { font-size: .65rem; color: var(--ink-dim); margin-top: 2px; }
.cohort-invite-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 13px; border-radius: 8px; border: 1.5px solid;
  background: var(--white); font-family: Figtree, sans-serif;
  font-size: .73rem; font-weight: 700; cursor: pointer;
}
.cohort-invite-btn:hover { opacity: .85; }
.cohort-invite-btn:disabled { opacity: .4; cursor: not-allowed; }
.cohort-edit-btn {
  width: 30px; height: 30px; border-radius: 7px; border: 1.5px solid var(--border);
  background: var(--white); display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--ink-dim); flex-shrink: 0; transition: all .12s;
}
.cohort-edit-btn:hover { border-color: var(--teal-border); color: var(--teal); background: var(--teal-pale); }
.cohort-delete-btn {
  width: 30px; height: 30px; border-radius: 7px; border: 1.5px solid var(--border);
  background: var(--white); display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--ink-dim); flex-shrink: 0; transition: all .12s;
}
.cohort-delete-btn:hover { border-color: var(--rose-border); color: var(--rose); background: var(--rose-light); }
.cohort-empty { padding: 28px; text-align: center; color: var(--ink-dim); font-size: .74rem; }

/* ── Empty state ─────────────────────────────────────────────────────── */
.cohort-empty-state {
  text-align: center; padding: 48px 24px; color: var(--ink-faint);
  font-size: .82rem; display: flex; flex-direction: column; align-items: center; gap: 10px;
}

/* ── Invite panel (inline) ───────────────────────────────────────────── */
.invite-panel {
  padding: 16px 18px;
  background: linear-gradient(135deg, rgba(6,182,212,.04), rgba(6,182,212,.08));
  border-bottom: 2px solid var(--teal-border);
}
.invite-panel-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.invite-panel-title { font-size: .74rem; font-weight: 800; color: var(--teal-dark); }
.seats-badge {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 20px;
  font-size: .65rem; font-weight: 800;
}
.seats-badge.teal { background: var(--teal-pale); border: 1px solid var(--teal-border); color: var(--teal-mid); }
.seats-badge.amber { background: var(--amber-pale); border: 1px solid var(--amber-border); color: var(--amber); }
.seats-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.close-x { background: none; border: none; cursor: pointer; color: var(--ink-dim); font-size: 1.1rem; line-height: 1; padding: 2px; }
.close-x:hover { color: var(--rose); }

/* Mode tabs */
.mode-tabs {
  display: flex; gap: 2px; background: var(--surface);
  border: 1px solid var(--border); border-radius: 8px;
  padding: 3px; width: fit-content; margin-bottom: 14px;
  @media (max-width: 500px) {
    flex-direction: column; gap: 6px;
  }

}
.mode-tabs button {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 14px; border-radius: 6px; border: none;
  font-family: Figtree, sans-serif; font-size: .72rem; font-weight: 700;
  cursor: pointer; background: transparent; color: var(--ink-dim);
}
.mode-tabs button.on { background: var(--white); color: var(--teal-mid); box-shadow: 0 1px 4px rgba(0,0,0,.08); }

/* Single invite grid */
.invite-single-grid {
  display: grid; grid-template-columns: 1fr 1fr 1fr auto;
  gap: 8px; align-items: flex-end; margin-bottom: 10px;
}
.invite-input {
  width: 100%; box-sizing: border-box;
  padding: 7px 10px; border: 1.5px solid var(--teal-border); border-radius: 8px;
  font-family: Figtree, sans-serif; font-size: .76rem; color: var(--ink);
  outline: none; background: var(--white);
}
.invite-input:focus { border-color: var(--teal); }
label { font-size: .64rem; font-weight: 700; color: var(--ink-mid); display: block; margin-bottom: 4px; }
.invite-note { font-size: .61rem; color: var(--ink-dim); margin-top: 8px; }
.invite-note code {
  background: var(--surface); padding: 1px 5px; border-radius: 4px;
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;
}

/* Existing student picker */
.exist-loading { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.exist-list {
  max-height: 200px; overflow-y: auto;
  border: 1px solid var(--border); border-radius: 8px;
  margin-bottom: 10px;
}
.exist-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; cursor: pointer;
  border-bottom: 1px solid var(--border); transition: background .1s;
}
.exist-row:last-child { border-bottom: none; }
.exist-row:hover { background: var(--teal-pale); }
.exist-row.selected { background: var(--teal-pale); border-left: 3px solid var(--teal); }

/* Buttons */
.btn-send {
  padding: 7px 16px; border-radius: 8px; border: none;
  background: var(--teal); color: #fff;
  font-family: Figtree, sans-serif; font-size: .74rem; font-weight: 800;
  cursor: pointer; white-space: nowrap; align-self: flex-end;
}
.btn-send:hover { background: var(--teal-dark); }
.btn-send:disabled { opacity: .4; cursor: not-allowed; }
.btn-secondary {
  padding: 7px 14px; border-radius: 8px; border: 1.5px solid var(--border);
  background: var(--white); font-family: Figtree, sans-serif;
  font-size: .76rem; font-weight: 700; color: var(--ink-mid); cursor: pointer;
}
.btn-secondary:hover { border-color: var(--teal-border); color: var(--teal); }

/* Drop zone */
.drop-zone {
  border: 2px dashed var(--teal-border); border-radius: 10px;
  padding: 24px; text-align: center; cursor: pointer;
  background: rgba(6,182,212,.03); transition: all .14s; margin-bottom: 10px;
}
.drop-zone:hover, .drop-zone.dragging {
  border-color: var(--teal); background: rgba(6,182,212,.08);
}
.drop-title { font-size: .79rem; font-weight: 700; color: var(--teal-mid); margin-bottom: 4px; }
.drop-sub   { font-size: .67rem; color: var(--ink-dim); }

/* CSV preview */
.csv-preview { border: 1px solid var(--border); border-radius: var(--r); overflow: hidden; margin-bottom: 10px; }
.preview-hdr { padding: 8px 12px; background: var(--surface); font-size: .7rem; font-weight: 700; color: var(--ink-mid); }
.preview-list { max-height: 160px; overflow-y: auto; }
.preview-row {
  display: grid; grid-template-columns: 1.2fr 1.6fr 1fr 60px;
  gap: 8px; padding: 7px 12px;
  font-size: .72rem; color: var(--ink);
  border-top: 1px solid var(--border);
}
.preview-row.invalid { background: var(--rose-light); }
.preview-ok  { color: var(--green); font-weight: 700; }
.preview-bad { color: var(--rose); font-weight: 800; font-size: .65rem; text-transform: uppercase; }
.dim  { color: var(--ink-dim); }

/* ── Student row ─────────────────────────────────────────────────────── */
.student-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 16px; transition: background .1s;
  @media (max-width: 767px) {
    flex-wrap: wrap; gap: 6px;        flex-direction: column;
        align-items: flex-start;
  }
}
.student-row:hover { background: var(--surface); }
.student-ava {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: .6rem; font-weight: 800; color: #fff; flex-shrink: 0;
  overflow: hidden;
}
.student-ava-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
.student-name  { font-size: .77rem; font-weight: 700; color: var(--ink); }
.student-email { font-size: .62rem; color: var(--ink-dim); margin-top: 1px; font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; }

.status-chip {
  font-size: .6rem; font-weight: 800;
  padding: 2px 7px; border-radius: 20px; border: 1px solid;
  white-space: nowrap;
}
.status-chip.dot { display: inline-flex; align-items: center; gap: 4px; font-size: .61rem; text-transform: uppercase; letter-spacing: .5px; }
.status-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

.action-btn {
  padding: 3px 8px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: .65rem; font-weight: 700;
  color: var(--ink-dim); cursor: pointer;
}
.action-btn:hover { border-color: var(--teal-border); color: var(--teal); }
.action-btn.teal  { border-color: var(--teal-border); background: var(--teal-pale); color: var(--teal-mid); }
.action-btn.danger:hover { border-color: var(--rose-border); color: var(--rose); background: var(--rose-light); }

/* ── Roster tab ──────────────────────────────────────────────────────── */
.card { padding: 18px; border-radius: var(--r-lg); background: var(--white); border: 1px solid var(--border); }
.card-title { font-size: .82rem; font-weight: 800; color: var(--ink); }
.card-sub   { font-size: .68rem; color: var(--ink-dim); margin-top: 2px; }

.roster-head {
  padding: 14px 20px 10px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}
.filter-pill {
  padding: 4px 10px; border-radius: 20px; border: 1.5px solid var(--border);
  background: var(--white); font-family: Figtree, sans-serif;
  font-size: .7rem; font-weight: 700; color: var(--ink-dim); cursor: pointer;
}
.filter-pill.on { border-color: var(--teal-border); background: var(--teal-pale); color: var(--teal-mid); }

.roster-table { width: 100%; border-collapse: collapse; }
.roster-table th {
  font-size: .58rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 1.5px; color: var(--ink-dim);
  padding: 6px 10px 8px; text-align: left; border-bottom: 1px solid var(--border);
}
.roster-row td { padding: 9px 10px; border-bottom: 1px solid var(--border); font-size: .75rem; color: var(--ink); }
.roster-row:hover td { background: var(--surface); }
.cohort-chip {
  font-size: .68rem; font-weight: 700;
  background: var(--teal-pale); color: var(--teal-mid);
  border: 1px solid var(--teal-border); padding: 2px 8px; border-radius: 20px;
}
.ghost-btn {
  font-size: .67rem; font-weight: 700;
  background: none; border: none; cursor: pointer;
  padding: 3px 7px; border-radius: 5px; font-family: Figtree, sans-serif;
  color: var(--ink-dim);
}
.ghost-btn.teal:hover   { color: var(--teal); background: var(--teal-pale); }
.ghost-btn.danger:hover { color: var(--rose); background: var(--rose-light); }
.table-empty { padding: 36px; text-align: center; color: var(--ink-faint); font-size: .82rem; }

.roster-footer {
  padding: 10px 20px; border-top: 1px solid var(--border);
  background: var(--surface); border-radius: 0 0 var(--r-lg) var(--r-lg);
  display: flex; align-items: center; justify-content: space-between;
  font-size: .72rem;
}
.btn-teal-outline {
  font-size: .71rem; font-weight: 700; color: var(--teal-mid);
  padding: 5px 11px; border-radius: 7px; border: 1.5px solid var(--teal-border);
  background: var(--teal-pale); cursor: pointer; font-family: Figtree, sans-serif;
}
.btn-teal-outline:disabled { opacity: .5; cursor: not-allowed; }

/* ── Right sidebar ───────────────────────────────────────────────────── */
.section-label { font-size: .65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--ink-dim); }

.sub-hdr { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
.plan-meta  { font-size: .68rem; color: var(--ink-dim); }
.plan-expiry { font-size: .7rem; font-weight: 600; color: var(--ink-mid); margin-top: 3px; }
.licence-alert {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 9px 11px; border-radius: var(--r); margin-bottom: 12px;
  font-size: .7rem; font-weight: 600; line-height: 1.35;
  border: 1px solid transparent;
}
.licence-alert svg { flex-shrink: 0; margin-top: 1px; }
.licence-alert--amber { background: var(--amber-light);  color: var(--amber); border-color: var(--amber-border); }
.licence-alert--rose  { background: var(--rose-light);   color: var(--rose);  border-color: var(--rose-border); }
.licence-alert-body { display: flex; flex-direction: column; gap: 6px; }
.licence-alert-cta {
  align-self: flex-start; background: transparent; border: 1px solid currentColor;
  color: inherit; font-size: .64rem; font-weight: 700; padding: 3px 9px;
  border-radius: 5px; cursor: pointer; transition: opacity .13s;
}
.licence-alert-cta:hover:not(:disabled) { opacity: .75; }
.licence-alert-cta:disabled { opacity: .55; cursor: default; }
.active-badge {
  font-size: .6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
  background: var(--green-light); color: var(--green);
  border: 1px solid var(--green-border); padding: 3px 8px; border-radius: 20px;
}

.usage-box { background: var(--surface); border-radius: var(--r); padding: 10px 12px; margin-bottom: 12px; }
.usage-row { display: flex; justify-content: space-between; font-size: .65rem; color: var(--ink-dim); margin-bottom: 6px; }
.usage-row strong { font-weight: 700; color: var(--ink); }
.usage-bar  { height: 7px; background: var(--border); border-radius: 4px; overflow: hidden; }
.usage-fill { height: 100%; border-radius: 4px; transition: width .4s; }

.plan-row { display: flex; justify-content: space-between; font-size: .7rem; margin-bottom: 6px; }
.plan-row span  { color: var(--ink-dim); }
.plan-row strong { font-weight: 700; }

.btn-purple-full {
  width: 100%; padding: 9px; border-radius: 9px; border: none;
  background: var(--purple); color: #fff;
  font-family: Figtree, sans-serif; font-size: .76rem; font-weight: 800; cursor: pointer;
}
.btn-purple-full:hover { background: #6d28d9; }
.btn-ghost-full {
  width: 100%; padding: 7px; border-radius: 9px; border: none;
  background: none; color: var(--ink-dim);
  font-family: Figtree, sans-serif; font-size: .72rem; cursor: pointer; margin-top: 4px;
}
.btn-ghost-full:hover { color: var(--rose); }

/* ── New cohort modal ────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(15,31,46,.5);
  display: flex; align-items: center; justify-content: center; z-index: 1001;
  /* A GLOBAL, unscoped `.modal-overlay { opacity:0; pointer-events:none }` for the
     marketing payment modal lives in frontend main.css and leaks into this portal.
     Set both explicitly here (scoped = higher specificity) so our Vue <Transition>
     drives visibility instead. Without this the modal renders in the DOM but stays
     opacity:0 / unclickable after a client-side (post-login) navigation. */
  opacity: 1; pointer-events: auto;
}
.nc-modal {
  background: var(--white); border-radius: var(--r-xl); width: 90%; max-width: 560px;
  box-shadow: 0 24px 64px rgba(6,182,212,.14), 0 8px 32px rgba(0,0,0,.12);
  overflow: hidden;
}
.nc-header {
  padding: 18px 22px 16px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}
.nc-title { font-size: .9rem; font-weight: 800; color: var(--ink); }
.nc-sub   { font-size: .67rem; color: var(--ink-dim); margin-top: 2px; }
.nc-close {
  width: 28px; height: 28px; border-radius: 7px; border: 1.5px solid var(--border);
  background: var(--white); display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--ink-dim); flex-shrink: 0;
}
.nc-close:hover { border-color: var(--rose-border); color: var(--rose); }

.nc-body { padding: 20px 22px; }

.nc-name-row { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: flex-end; margin-bottom: 18px; }

.modal-field { margin-bottom: 16px; }
.modal-input {
  width: 100%; box-sizing: border-box;
  padding: 9px 12px; border: 1.5px solid var(--border); border-radius: 9px;
  font-family: Figtree, sans-serif; font-size: .82rem; color: var(--ink);
  outline: none; background: var(--white);
}
.modal-input:focus { border-color: var(--teal); }

/* Multi-select exam picker (cohort modals) */
.exam-multi {
  border: 1.5px solid var(--border); border-radius: 9px;
  max-height: 160px; overflow-y: auto; background: var(--white);
}
.exam-check {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px; font-size: .82rem; color: var(--ink);
  cursor: pointer; border-bottom: 1px solid var(--border);
}
.exam-check:last-child { border-bottom: none; }
.exam-check:hover { background: var(--surface); }
.exam-check input { accent-color: var(--teal); cursor: pointer; flex-shrink: 0; }
.exam-multi-empty { padding: 9px 12px; font-size: .78rem; color: var(--ink-dim); }

.color-grid { display: flex; gap: 6px; margin-top: 8px; }
.color-swatch {
  width: 28px; height: 28px; border-radius: 7px; border: 2px solid transparent;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: transform .1s;
}
.color-swatch:hover    { transform: scale(1.1); }
.color-swatch.selected { border-color: var(--ink); transform: scale(1.12); }

.nc-divider { border-top: 1px solid var(--border); padding-top: 18px; margin-top: 2px; }
.nc-section-label { font-size: .7rem; font-weight: 800; color: var(--ink-dim); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 12px; }

.nc-invite-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px; }

.nc-bulk-summary {
  padding: 8px 10px; border-radius: 8px;
  font-size: .71rem; font-weight: 700; margin-top: 10px;
}
.nc-bulk-summary.green { background: var(--green-light); border: 1px solid var(--green-border); color: var(--green); }
.nc-bulk-summary.amber { background: var(--amber-pale); border: 1px solid var(--amber-border); color: var(--amber); }

.nc-footer {
  padding: 14px 22px; border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  background: var(--surface); border-radius: 0 0 var(--r-xl) var(--r-xl);
}

.modal-enter-from .nc-modal, .modal-leave-to .nc-modal { opacity: 0; transform: scale(.96) translateY(12px); }
.modal-enter-active .nc-modal, .modal-leave-active .nc-modal { transition: all .22s cubic-bezier(0.16,1,0.3,1); }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active, .modal-leave-active { transition: opacity .22s ease; }

/* ── Toast ───────────────────────────────────────────────────────────── */
.toast {
  position: fixed; bottom: 24px; right: 24px;
  padding: 12px 18px; border-radius: 10px;
  /* Fixed dark pill — NOT var(--ink), which flips light in dark mode and made
     the white text illegible. Border separates it from a dark page. */
  background: #111827; color: #fff;
  border: 1px solid rgba(255,255,255,0.14);
  font-size: .82rem; font-weight: 600;
  box-shadow: 0 8px 32px rgba(0,0,0,.4); z-index: 300;
}
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
.toast-enter-active, .toast-leave-active { transition: all .25s ease; }
/* Request additional seats modal */
.modal-label { display:block; font-size:0.62rem; font-weight:800; letter-spacing:0.8px; text-transform:uppercase; color:var(--ink-dim); margin-bottom:7px; }
.seats-plan-box { display:flex; align-items:center; justify-content:space-between; gap:12px; background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px 14px; margin-bottom:18px; }
.seats-plan-k { font-size:0.58rem; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; color:var(--ink-dim); }
.seats-plan-v { font-size:0.82rem; font-weight:800; color:var(--ink); margin-top:2px; }
</style>
