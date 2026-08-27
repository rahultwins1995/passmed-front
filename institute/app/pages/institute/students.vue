<script setup lang="ts">

// Permission matrix (admin panel → Role Matrix). `canEdit` gates every
// mutation on this page; the same rules are enforced server-side by the
// perm: middleware, so hiding a button is UX, not the security boundary.
const { canEdit, readOnly } = useInstitutePermissions()
const PERM_AREA = 'students' as const

// /institute/students — live data from /api-institute/v1/testinstitutions
import { computed, ref, onMounted, watch } from 'vue'
const { instName } = useInstitution()

definePageMeta({ layout: 'institute' })
useHead({ title: 'All Students · Passmed Institute' })

const route = useRoute()

// ── Types ────────────────────────────────────────────────────────────────────
// 'none' = Not Started — a student who has attempted 0 questions has no performance
// signal, so they're neither "On Track" nor "At Risk"; they get their own state and
// are excluded from every risk count and the cohort average.
type Risk  = 'high' | 'medium' | 'low' | 'none'
type Trend = 'up' | 'down' | 'flat'

type Student = {
  id: string | number
  userId: number | null   // users.id — required by /institution-students/{id}/profile
  name: string
  initials: string
  avatarUrl: string | null   // uploaded student photo (null → initials fallback)
  bg: string
  year: string
  score: number
  qs: number
  streak: number
  lastActive: number   // days ago
  risk: Risk
  trend: Trend
  weakTopic: string
  email?: string
}

type SortKey = 'name' | 'year' | 'score' | 'trend' | 'qs' | 'streak' | 'lastActive' | 'risk'

// ── API fetch ────────────────────────────────────────────────────────────────
const api       = useInstituteApi()
const students  = ref<Student[]>([])
const loading   = ref(true)
const fetchError = ref<string | null>(null)

/** Pick a deterministic gradient for a name so each avatar has a consistent colour. */
const GRADIENTS = [
  'linear-gradient(135deg,#be123c,#e11d48)',
  'linear-gradient(135deg,#0369a1,#06b6d4)',
  'linear-gradient(135deg,#047857,#059669)',
  'linear-gradient(135deg,#5b21b6,#7c3aed)',
  'linear-gradient(135deg,#92400e,#d97706)',
  'linear-gradient(135deg,#0f766e,#0d9488)',
  'linear-gradient(135deg,#1e40af,#3b82f6)',
  'linear-gradient(135deg,#9d174d,#db2777)',
  'linear-gradient(135deg,#7c3aed,#a855f7)',
  'linear-gradient(135deg,#14532d,#16a34a)',
]
function gradientFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return GRADIENTS[h % GRADIENTS.length]
}
function initialsFor(name: string) {
  const parts = (name || '').trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ── The institution's pass mark — the ONLY source of the risk bands ───────────
// Set from the API (`pass_threshold`), which reads the saved Settings value. It
// is NOT a constant: the whole bug was that 60/65 was written out by hand here
// and in the backend, so changing the pass mark to 60% left a 63% student sitting
// in At-Risk. 65 is only the pre-load default, replaced on the first fetch.
const passMark = ref(65)
// Borderline band width, mirroring INSTITUTE_MEDIUM_BAND in the backend helper.
const MEDIUM_BAND = 5
const mediumFloor = computed(() => passMark.value - MEDIUM_BAND)

/** Map a raw API record to our Student shape. */
function mapStudent(raw: any, idx: number): Student {
  const name = raw.name || raw.full_name || raw.student_name || `Student ${idx + 1}`
  const score = Number(raw.avg_score ?? raw.score ?? raw.average_score ?? 0)

  // The backend already classified this row against the institution's pass mark;
  // trust it. The local branch is only a fallback for an older API response, and
  // it now uses the same threshold instead of a hardcoded 60/65.
  let risk: Risk = 'low'
  if (raw.risk_level) {
    const r = String(raw.risk_level).toLowerCase()
    if (r === 'high')   risk = 'high'
    else if (r === 'medium' || r === 'med') risk = 'medium'
  } else {
    if (score < mediumFloor.value) risk = 'high'
    else if (score < passMark.value) risk = 'medium'
  }

  // Not Started = no evidence of any attempt. We require BOTH no questions AND no
  // score, because the API's questions_done can come back 0 even for students who
  // clearly attempted (they have a real avg score) — keying off qs alone would wrongly
  // flag everyone. A non-zero score is definitive proof the student started, so it
  // always wins. (Once questions_done is reliably populated, qs>0 will also count.)
  const qsDone = Number(raw.questions_done ?? raw.qs ?? raw.total_questions ?? 0)
  if (qsDone <= 0 && score <= 0) risk = 'none'

  let trend: Trend = 'flat'
  if (raw.trend) {
    const t = String(raw.trend).toLowerCase()
    if (t === 'up' || t === 'improving')    trend = 'up'
    else if (t === 'down' || t === 'declining') trend = 'down'
  }

  return {
    id:         raw.id ?? idx,
    userId:     Number(raw.user_id ?? 0) || null,
    name,
    initials:   initialsFor(name),
    avatarUrl:  raw.avatar_url ?? null,
    bg:         gradientFor(name),
    // Cohort column: prefer the real cohort name (PG2/PG3), fall back to grad year.
    year:       raw.cohort ?? raw.year ?? raw.pgy ?? '—',
    score,
    qs:         qsDone,
    streak:     Number(raw.streak ?? raw.current_streak ?? 0),
    lastActive: (() => {
      const la = raw.last_active_days ?? raw.days_inactive ?? raw.last_active
      return (la === null || la === undefined) ? -1 : Number(la)
    })(),
    risk,
    trend,
    weakTopic:  raw.weak_topic ?? raw.weakest_topic ?? raw.weakness ?? '—',
    email:      raw.email,
  }
}

async function loadStudents() {
  loading.value = true
  fetchError.value = null
  try {
    // /students-overview returns the full roster WITH per-student stats
    // (avg score, qs done, streak, last active, trend, weak topic) in one call.
    const res = await api<any>('/students-overview')
    // Pick up the institution's pass mark BEFORE mapping — mapStudent's fallback
    // branch and every label below classify against it.
    if (res?.pass_threshold != null) passMark.value = Number(res.pass_threshold)
    const raw: any[] = Array.isArray(res) ? res : (res?.data ?? res?.students ?? [])
    students.value = raw.map(mapStudent)
  } catch (err: any) {
    fetchError.value = err?.data?.message || err?.message || 'Failed to load students'
  } finally {
    loading.value = false
  }
}
onMounted(loadStudents)

// ── Filters / sorting ────────────────────────────────────────────────────────
const search = ref('')
const cohort = ref<string>('All')
const risk   = ref<'all' | 'atrisk' | 'high' | 'medium' | 'low' | 'none'>('all')
const sortKey = ref<SortKey>('risk')
const sortDir = ref<'asc' | 'desc'>('asc')
const selected = ref<Set<string | number>>(new Set())

// Profile drawer — shared StudentProfileDrawer component (same rich drawer
// the mock-exam detail page shows). It needs the USER id: testinstitutions
// rows carry it as user_id (row `id` is the seat id, which the profile
// endpoint won't accept).
const drawerUserId = ref<number | null>(null)
function closeDrawer() { drawerUserId.value = null }
function openDrawer(s: Student) {
  if (!s.userId) {
    showToast('No profile yet — this invite is still pending', 'var(--amber)')
    return
  }
  drawerUserId.value = s.userId
}

// ── Filters ↔ URL (two-way) ──────────────────────────────────────────────────
// Read on load: ?filter=atrisk|high|medium|low (the dashboard's At-Risk card
// deep-links to ?filter=atrisk) and ?cohort=<year>.
const RISK_VALUES = ['atrisk', 'high', 'medium', 'low'] as const
const qFilter = String(route.query.filter ?? '')
if ((RISK_VALUES as readonly string[]).includes(qFilter)) risk.value = qFilter as typeof risk.value
const qCohort = String(route.query.cohort ?? '')
if (qCohort) cohort.value = qCohort

// Write back on change, so the URL always reflects the active filter (and stays
// shareable). 'all' / 'All' = default → drop the param instead of ?filter=all.
const router = useRouter()
watch([risk, cohort], () => {
  const q: Record<string, any> = { ...route.query }
  if (risk.value === 'all') delete q.filter
  else q.filter = risk.value
  if (cohort.value === 'All') delete q.cohort
  else q.cohort = cohort.value
  router.replace({ query: q })
})

// Deep-link support: ?student=<name or row id> opens the drawer once the
// roster has loaded.
const deepLink = typeof route.query.student === 'string' ? route.query.student : null
if (deepLink) {
  const stop = watch(students, (list) => {
    const m = list.find(s => String(s.id) === deepLink || s.name === deepLink)
    if (m) { openDrawer(m); stop() }
  }, { deep: false })
}

const cohortOptions = computed(() => {
  const years = [...new Set(students.value.map(s => s.year).filter(y => y && y !== '—'))].sort()
  return [{ value: 'All', label: 'All cohorts' }, ...years.map(y => ({ value: y, label: y }))]
})

// Matches the roster rule + the stat cards. The bands are derived from the saved
// pass mark (see passMark / mediumFloor), so these buckets shift with it instead
// of being pinned to 60/65 — the labels stay generic for exactly that reason.
// 'atrisk' is the combined bucket the dashboard deep-links to (?filter=atrisk).
const riskPills: Array<{ value: typeof risk.value; label: string }> = [
  { value: 'all',    label: 'All'           },
  { value: 'atrisk', label: '⚠ At Risk (all)' },
  { value: 'high',   label: 'High Risk'     },
  { value: 'medium', label: 'Medium Risk'   },
  { value: 'low',    label: 'On Track'      },
  { value: 'none',   label: 'Not Started'   },
]

const riskRank: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 }

const filtered = computed<Student[]>(() => {
  const q = search.value.toLowerCase().trim()
  return students.value.filter(s => {
    const matchSearch = !q ||
      s.name.toLowerCase().includes(q) ||
      s.year.toLowerCase().includes(q) ||
      s.weakTopic.toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q)
    const matchCohort = cohort.value === 'All' || s.year === cohort.value
    const matchRisk =
      risk.value === 'all'      ? true
      : risk.value === 'atrisk' ? (s.risk === 'high' || s.risk === 'medium')
      : s.risk === risk.value                       // 'high' | 'medium' | 'low'
    return matchSearch && matchCohort && matchRisk
  })
})

const sorted = computed(() => {
  const list = [...filtered.value]
  const k = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  list.sort((a, b) => {
    let av: any = (a as any)[k], bv: any = (b as any)[k]
    if (k === 'risk') { av = riskRank[a.risk]; bv = riskRank[b.risk] }
    if (typeof av === 'string') return av.localeCompare(bv) * dir
    return ((av ?? 0) - (bv ?? 0)) * dir
  })
  return list
})

// ── Stats ────────────────────────────────────────────────────────────────────
const stats = computed(() => {
  const all    = students.value
  const high    = all.filter(s => s.risk === 'high').length
  const onTrack = all.filter(s => s.risk === 'low').length
  // Cohort average only counts students who have actually started (attempted ≥1
  // question). Including a Not-Started student's phantom 0% would drag the average
  // down and misrepresent the cohort.
  const scored = all.filter(s => s.risk !== 'none')
  const avgScore = scored.length
    ? Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length)
    : 0
  // Every sub-label is derived from the saved pass mark. They used to read
  // "Below 65% threshold" / "60–64%" / "Pass mark: 65%" as literal text, so a
  // 60% pass mark produced cards that contradicted the numbers above them.
  // `filter` = the risk-filter value this card applies when clicked (null = info-only,
  // not a filter). High Risk → 'high', On Track → 'low', Total → 'all' (clear).
  return [
    { label: 'Total Enrolled',   val: String(all.length), sub: 'Active residents',                                     color: 'c-teal',  filter: 'all'  },
    { label: 'High Risk',        val: String(high),       sub: `Below ${mediumFloor.value}% avg score`,                color: 'c-rose',  filter: 'high' },
    { label: 'On Track',         val: String(onTrack),    sub: `At or above ${passMark.value}% avg score`,             color: 'c-green', filter: 'low'  },
    { label: 'Cohort Avg Score', val: avgScore + '%',     sub: `Pass mark: ${passMark.value}%`,                        color: 'c-purple', filter: null  },
  ]
})

const cols: Array<{ key: SortKey | ''; label: string; align: 'left' | 'center' | 'right'; width?: string }> = [
  { key: 'name',       label: 'Resident',    align: 'left'   },
  { key: 'year',       label: 'Cohort',      align: 'center' },
  { key: 'score',      label: 'Avg Score',   align: 'center' },
  { key: 'trend',      label: 'Trend',       align: 'center' },
  { key: 'qs',         label: 'Qs Done',     align: 'center' },
  { key: 'streak',     label: 'Streak',      align: 'center' },
  { key: 'lastActive', label: 'Last Active', align: 'center' },
  { key: 'risk',       label: 'Status',      align: 'center' },
  { key: '',           label: '',            align: 'right'  },
]

function sortBy(k: SortKey | '') {
  if (!k) return
  if (sortKey.value === k) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = k
    sortDir.value = (k === 'name' || k === 'year') ? 'asc' : 'desc'
  }
}

const allChecked = computed({
  get: () => filtered.value.length > 0 && filtered.value.every(s => selected.value.has(s.id)),
  set: (v) => {
    const next = new Set(selected.value)
    if (v) filtered.value.forEach(s => next.add(s.id))
    else filtered.value.forEach(s => next.delete(s.id))
    selected.value = next
  },
})
const someChecked = computed(() => selected.value.size > 0 && !allChecked.value)

function toggleCheck(id: string | number, checked: boolean) {
  const next = new Set(selected.value)
  if (checked) next.add(id)
  else next.delete(id)
  selected.value = next
}

// Toast
const toast = ref<{ text: string; color: string } | null>(null)
function showToast(text: string, color = 'var(--teal)') {
  toast.value = { text, color }
  setTimeout(() => { toast.value = null }, 2400)
}

const bulkEmailBusy = ref(false)
async function bulkEmail() {
  const ids = selectedUserIds()
  if (!ids.length) { showToast('Selected students have no account yet', 'var(--amber)'); return }
  if (bulkEmailBusy.value) return
  bulkEmailBusy.value = true
  try {
    const res = await api<any>('/students/checkin-selected', { method: 'POST', body: { user_ids: ids } })
    if (res?.status === 'success') {
      const n = Number(res.sent ?? ids.length)
      showToast(res.message || `Check-in email sent to ${n} student${n === 1 ? '' : 's'}`)
      selected.value = new Set()
    } else {
      showToast(res?.message || 'Could not send emails', 'var(--rose)')
    }
  } catch {
    showToast('Could not send emails — try again', 'var(--rose)')
  } finally {
    bulkEmailBusy.value = false
  }
}
// Per-student "Send check-in email" from the profile drawer — hits the real
// endpoint that emails the resident + drops an in-app notification.
// Toast + table refresh when the drawer reports a cohort assign/move.
function onCohortChanged(result: { ok: boolean; message: string }) {
  showToast(result.message, result.ok ? 'var(--teal)' : 'var(--rose)')
  if (result.ok) loadStudents()
}

const checkinBusy = ref(false)
async function sendCheckin(id: number, name: string) {
  if (!id) { showToast('This invite is still pending — no account yet', 'var(--amber)'); return }
  if (checkinBusy.value) return          // guard against double-clicks
  checkinBusy.value = true
  try {
    const res = await api<any>(`/students/${id}/checkin`, { method: 'POST' })
    if (res?.status === 'success') showToast(`Check-in email sent to ${name}`)
    else showToast(res?.message || 'Could not send check-in', 'var(--rose)')
  } catch {
    showToast('Could not send check-in — try again', 'var(--rose)')
  } finally {
    checkinBusy.value = false
  }
}
// Map selected row ids → user ids (only students that have an account).
function selectedUserIds(): number[] {
  return students.value
    .filter(s => selected.value.has(s.id) && s.userId)
    .map(s => s.userId as number)
}
// Carry the selection into the Assign-Exams wizard as pre-chosen recipients.
function bulkAssign() {
  const ids = selectedUserIds()
  if (!ids.length) { showToast('Selected students have no account yet', 'var(--amber)'); return }
  navigateTo({ path: '/institute/assign-exams', query: { student_ids: ids.join(',') } })
}
// Per-student "Assign exam" from the profile drawer.
function assignFromDrawer() {
  const uid = drawerUserId.value
  closeDrawer()
  navigateTo({ path: '/institute/assign-exams', query: uid ? { student_ids: String(uid) } : {} })
}
function clearSelection() { selected.value = new Set() }

function exportCsv() {
  // Proper CSV quoting (commas/quotes/newlines in names) + UTF-8 BOM so
  // Excel opens it with the right encoding.
  const q = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const rows = [['Name', 'Cohort', 'Avg Score', 'Qs Done', 'Streak', 'Last Active (days)', 'Status']]
  students.value.forEach(s => rows.push([s.name, s.year, s.score + '%', String(s.qs), String(s.streak), String(s.lastActive), riskStatusLabel(s.risk)]))
  const csv = '\uFEFF' + rows.map(r => r.map(q).join(',')).join('\r\n')
  if (import.meta.client) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'passmed-students.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
  showToast('CSV exported ✓', 'var(--green)')
}

// Resident invites are managed on the Seats & Cohorts page (per-cohort invite
// + seat allocation). Deep-link with ?invite=1 so that page opens the invite
// flow on arrival instead of just landing there.
function invite() {
  navigateTo('/institute/seats-billing?invite=1')
}

// Display helpers. Colours track the SAME bands as the risk rule, so a passing
// score is never painted red — with a 60% pass mark, 63% is green, not amber.
// (`+10` is the "comfortably clear" tier, not a threshold.)
function scoreColor(s: number) {
  if (s < mediumFloor.value)     return 'var(--rose)'
  if (s < passMark.value)        return 'var(--amber)'
  if (s < passMark.value + 10)   return 'var(--teal-mid)'
  return 'var(--green)'
}
function scoreBg(s: number) {
  if (s < mediumFloor.value)     return 'var(--rose-light)'
  if (s < passMark.value)        return 'var(--amber-light)'
  if (s < passMark.value + 10)   return 'var(--teal-pale)'
  return 'var(--green-light)'
}
function trendIcon(t: Student['trend']) {
  return t === 'up' ? '↑' : t === 'down' ? '↓' : '→'
}
function trendColor(t: Student['trend']) {
  return t === 'up' ? 'var(--green)' : t === 'down' ? 'var(--rose)' : 'var(--ink-faint)'
}
// Status label matches the roster's own rule (and the High/Medium stat cards),
// which is now derived from the institution's pass mark rather than a fixed
// 60/65. Showing the severity in the label (not just the colour) keeps the table,
// the stat cards and the filter in sync.
function riskBadge(r: Student['risk']) {
  if (r === 'high')   return { label: 'High Risk',   bg: 'var(--rose-light)',  fg: 'var(--rose)',  bd: 'var(--rose-border)' }
  if (r === 'medium') return { label: 'Medium Risk', bg: 'var(--amber-light)', fg: 'var(--amber)', bd: 'var(--amber-border)' }
  // Not Started — neutral grey, deliberately NOT green, so a 0-attempt student is
  // never mistaken for "On Track". Uses theme surface/ink tokens so it flips in dark mode.
  if (r === 'none')   return { label: 'Not Started', bg: 'var(--surface-hi)',  fg: 'var(--ink-dim)', bd: 'var(--border)' }
  return                  { label: 'On Track',    bg: 'var(--green-light)', fg: 'var(--green)', bd: 'var(--green-border)' }
}
// CSV/text status — same labels without colour.
function riskStatusLabel(r: Student['risk']) {
  if (r === 'high')   return 'High Risk'
  if (r === 'medium') return 'Medium Risk'
  if (r === 'none')   return 'Not Started'
  return 'On Track'
}
function lastActiveLabel(d: number) {
  if (d < 0) return 'Never'
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  return `${d}d ago`
}
function lastActiveColor(d: number) {
  if (d < 0) return 'var(--ink-faint)'
  if (d === 0) return 'var(--green)'
  if (d === 1) return 'var(--teal-mid)'
  return d > 3 ? 'var(--rose)' : 'var(--ink-dim)'
}
</script>

<template>
  <div class="main">
    <!-- `view` level: page is visible but every mutation is hidden. -->
    <ReadOnlyBanner :area="PERM_AREA" />

    <div class="content">
      <div style="animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;">

        <!-- Header -->
        <div class="page-header" style="margin-bottom:18px;">
          <div>
            <div class="page-title">All Students</div>
            <div class="page-sub">
              <template v-if="loading">Loading…</template>
              <template v-else-if="fetchError">Could not load data</template>
              <template v-else>{{ students.length }} residents enrolled</template>
            </div>
          </div>
          <div class="page-header-right" style="gap:8px;">
            <button type="button" class="hdr-btn" :disabled="loading || !students.length" @click="exportCsv">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
            <button type="button" v-if="canEdit(PERM_AREA)" class="hdr-btn hdr-primary" @click="invite">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Invite Resident
            </button>
          </div>
        </div>

        <!-- Error banner -->
        <div v-if="fetchError" style="padding:14px 18px;background:var(--rose-light);border:1.5px solid var(--rose-border);border-radius:10px;margin-bottom:16px;font-size:0.78rem;color:var(--rose);font-weight:600;">
          ⚠ {{ fetchError }}
        </div>

        <!-- ── Skeleton loader ─────────────────────────────────────── -->
        <div v-if="loading">

          <!-- Stat cards skeleton -->
          <div class="d4 grid-4" style="gap:12px;margin-bottom:20px;">
            <div v-for="i in 4" :key="i" class="sk-stat-card">
              <div class="sk" style="width:70px;height:8px;border-radius:4px;margin-bottom:10px;"></div>
              <div class="sk" style="width:50px;height:22px;border-radius:5px;margin-bottom:8px;"></div>
              <div class="sk" style="width:90px;height:7px;border-radius:4px;"></div>
            </div>
          </div>

          <!-- Filters skeleton -->
          <div class="card" style="padding:14px 18px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <div class="sk" style="flex:1;min-width:200px;height:34px;border-radius:8px;"></div>
              <div class="sk" style="width:76px;height:28px;border-radius:7px;"></div>
              <div class="sk" style="width:76px;height:28px;border-radius:7px;"></div>
              <div class="sk" style="width:76px;height:28px;border-radius:7px;"></div>
              <div class="sk" style="width:90px;height:28px;border-radius:7px;"></div>
              <div class="sk" style="width:76px;height:28px;border-radius:7px;"></div>
            </div>
          </div>

          <!-- Table skeleton (preserves column alignment) -->
          <div class="card" style="padding:0;overflow:hidden;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid var(--border);background:var(--surface);">
                  <th style="padding:10px 16px;width:32px;">
                    <div class="sk" style="width:12px;height:12px;border-radius:2px;"></div>
                  </th>
                  <th v-for="c in cols" :key="c.label + c.key" class="th">{{ c.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="i in 8" :key="i"
                  style="border-bottom:1px solid var(--border);"
                  :style="{ opacity: 1 - (i - 1) * 0.09 }">
                  <td style="padding:10px 16px;">
                    <div class="sk" style="width:12px;height:12px;border-radius:2px;"></div>
                  </td>
                  <!-- Name + avatar -->
                  <td style="padding:10px 12px;">
                    <div style="display:flex;align-items:center;gap:9px;">
                      <div class="sk" style="width:28px;height:28px;border-radius:50%;flex-shrink:0;"></div>
                      <div style="display:flex;flex-direction:column;gap:5px;">
                        <div class="sk" style="width:110px;height:9px;border-radius:4px;"></div>
                        <div class="sk" style="width:72px;height:7px;border-radius:4px;"></div>
                      </div>
                    </div>
                  </td>
                  <!-- Year pill -->
                  <td style="padding:10px 12px;text-align:center;">
                    <div class="sk" style="width:38px;height:18px;border-radius:20px;margin:0 auto;"></div>
                  </td>
                  <!-- Score + bar -->
                  <td style="padding:10px 12px;text-align:center;">
                    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                      <div class="sk" style="width:44px;height:18px;border-radius:6px;"></div>
                      <div class="sk" style="width:60px;height:3px;border-radius:2px;"></div>
                    </div>
                  </td>
                  <!-- Trend -->
                  <td style="padding:10px 12px;text-align:center;">
                    <div class="sk" style="width:14px;height:14px;border-radius:3px;margin:0 auto;"></div>
                  </td>
                  <!-- Qs Done -->
                  <td style="padding:10px 12px;text-align:center;">
                    <div class="sk" style="width:36px;height:10px;border-radius:4px;margin:0 auto;"></div>
                  </td>
                  <!-- Streak -->
                  <td style="padding:10px 12px;text-align:center;">
                    <div class="sk" style="width:28px;height:10px;border-radius:4px;margin:0 auto;"></div>
                  </td>
                  <!-- Last Active -->
                  <td style="padding:10px 12px;text-align:center;">
                    <div class="sk" style="width:52px;height:10px;border-radius:4px;margin:0 auto;"></div>
                  </td>
                  <!-- Risk pill -->
                  <td style="padding:10px 12px;text-align:center;">
                    <div class="sk" style="width:64px;height:18px;border-radius:20px;margin:0 auto;"></div>
                  </td>
                  <!-- Action -->
                  <td style="padding:10px 12px;text-align:right;">
                    <div class="sk" style="width:40px;height:20px;border-radius:6px;margin-left:auto;"></div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <!-- ── End skeleton ─────────────────────────────────────────── -->

        <template v-else>

        <!-- Stats -->
        <div class="d4 grid-4" style="gap:12px;margin-bottom:20px;">
          <div v-for="s in stats" :key="s.label" class="stat-card"
               :class="[s.color, { 'stat-card-clickable': s.filter, 'stat-card-active': s.filter && risk === s.filter }]"
               style="padding:14px 16px;"
               :role="s.filter ? 'button' : undefined"
               :tabindex="s.filter ? 0 : undefined"
               @click="s.filter && (risk = s.filter as typeof risk)"
               @keyup.enter="s.filter && (risk = s.filter as typeof risk)">
            <div class="stat-label">{{ s.label }}</div>
            <div class="stat-val" style="font-size:1.4rem;">{{ s.val }}</div>
            <div class="stat-sub">{{ s.sub }}</div>
          </div>
        </div>

        <!-- Filters -->
        <div class="card" style="padding:14px 18px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <div style="position:relative;flex:1;min-width:200px;">
              <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--ink-dim);" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input v-model="search" type="text" placeholder="Search by name, email, topic, or year…" class="as-search" />
            </div>
            <!-- Cohort — a dropdown (not pills): the cohort list grows over time. -->
            <select v-model="cohort" class="as-select" aria-label="Cohort">
              <option v-for="p in cohortOptions" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
            <select v-model="risk" class="as-select" aria-label="Risk">
              <option v-for="p in riskPills" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
          </div>
        </div>

        <!-- Bulk bar -->
        <div v-if="selected.size > 0" class="bulk-bar">
          <span style="font-size:0.78rem;font-weight:700;color:var(--teal-mid);flex:1;">
            {{ selected.size }} student{{ selected.size > 1 ? 's' : '' }} selected
          </span>
          <button type="button" v-if="canEdit(PERM_AREA)" class="bulk-email" @click="bulkEmail"
            :disabled="bulkEmailBusy"
            :style="bulkEmailBusy ? 'opacity:.5;cursor:not-allowed;' : ''">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            {{ bulkEmailBusy ? 'Sending…' : 'Email selected' }}
          </button>
          <button type="button" v-if="canEdit(PERM_AREA)" class="bulk-assign" @click="bulkAssign">Assign exam</button>
          <button type="button" class="bulk-clear" @click="clearSelection">✕ Clear</button>
        </div>

        <!-- Table -->
        <div class="card" style="padding:0;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid var(--border);">
                <th style="padding:10px 16px;width:32px;">
                  <input
                    type="checkbox"
                    :checked="allChecked"
                    :indeterminate.prop="someChecked"
                    @change="allChecked = ($event.target as HTMLInputElement).checked"
                    style="cursor:pointer;accent-color:var(--teal);"
                  />
                </th>
                <th
                  v-for="c in cols"
                  :key="c.label + c.key"
                  :style="{ textAlign: c.align, cursor: c.key ? 'pointer' : 'default' }"
                  class="th"
                  @click="sortBy(c.key)"
                  :aria-sort="c.key && sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined"
                >
                  {{ c.label }}
                  <span v-if="c.key && sortKey === c.key" style="margin-left:3px;">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in sorted"
                :key="s.id"
                class="student-row"
                @click="openDrawer(s)"
              >
                <td style="padding:10px 16px;" @click.stop>
                  <input
                    type="checkbox"
                    :checked="selected.has(s.id)"
                    @change="toggleCheck(s.id, ($event.target as HTMLInputElement).checked)"
                    style="cursor:pointer;accent-color:var(--teal);"
                  />
                </td>
                <td style="padding:10px 12px;">
                  <div style="display:flex;align-items:center;gap:9px;">
                    <div class="avatar-md" :style="{ background: s.bg }">
                      <img v-if="s.avatarUrl" :src="s.avatarUrl" :alt="s.name" class="avatar-img" />
                      <template v-else>{{ s.initials }}</template>
                    </div>
                    <div>
                      <div style="font-size:0.79rem;font-weight:700;color:var(--ink);">{{ s.name }}</div>
                      <div style="font-size:0.62rem;color:var(--ink-dim);margin-top:1px;">{{ s.email || '—' }}</div>
                    </div>
                  </div>
                </td>
                <td style="padding:10px 12px;text-align:center;">
                  <span class="year-pill">{{ s.year }}</span>
                </td>
                <td style="padding:10px 12px;text-align:center;">
                  <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
                    <span class="score-chip" :style="{ color: scoreColor(s.score), background: scoreBg(s.score) }">{{ s.score }}%</span>
                    <div style="width:60px;height:3px;background:var(--surface);border-radius:2px;overflow:hidden;">
                      <div :style="{ width: Math.round(s.score * 0.6) + 'px', height: '100%', background: scoreColor(s.score), borderRadius: '2px' }"></div>
                    </div>
                  </div>
                </td>
                <td style="padding:10px 12px;text-align:center;">
                  <span :style="{ color: trendColor(s.trend), fontSize: '0.85rem' }">{{ trendIcon(s.trend) }}</span>
                </td>
                <td style="padding:10px 12px;text-align:center;font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.72rem;color:var(--ink-mid);">{{ s.qs.toLocaleString() }}</td>
                <td style="padding:10px 12px;text-align:center;font-size:0.8rem;">{{ s.streak > 0 ? `${s.streak}🔥` : '—' }}</td>
                <td style="padding:10px 12px;text-align:center;">
                  <span :style="{ color: lastActiveColor(s.lastActive), fontWeight: s.lastActive === 0 ? 700 : 400, fontSize: '0.72rem' }">{{ lastActiveLabel(s.lastActive) }}</span>
                </td>
                <td style="padding:10px 12px;text-align:center;">
                  <span
                    class="risk-pill"
                    :style="{ background: riskBadge(s.risk).bg, color: riskBadge(s.risk).fg, borderColor: riskBadge(s.risk).bd }"
                  >
                    <span class="risk-dot" :style="{ background: riskBadge(s.risk).fg }"></span>
                    {{ riskBadge(s.risk).label }}
                  </span>
                </td>
                <td style="padding:10px 12px;text-align:right;">
                  <button type="button" class="action-link" @click.stop="openDrawer(s)" style="font-size:0.68rem;">View →</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!sorted.length && !fetchError" style="padding:40px;text-align:center;">
            <div style="font-size:1.5rem;margin-bottom:8px;">🔍</div>
            <div style="font-size:0.82rem;font-weight:700;color:var(--ink-dim);">No students match your filters</div>
            <div style="font-size:0.7rem;color:var(--ink-faint);margin-top:4px;">Try adjusting the search or cohort filter</div>
          </div>
        </div>

        <div style="font-size:0.65rem;color:var(--ink-dim);margin-top:10px;text-align:right;">
          Showing {{ sorted.length }} of {{ students.length }} residents
        </div>

        </template><!-- end v-else -->

      </div>
    </div>

    <!-- Student profile drawer — shared component (same as mock-exam detail) -->
    <StudentProfileDrawer
      :open="drawerUserId !== null"
      :user-id="drawerUserId"
      :pass-mark="passMark"
      :checkin-busy="checkinBusy"
      @update:open="(v: boolean) => { if (!v) closeDrawer() }"
      @checkin="(id: number, name: string) => sendCheckin(id, name)"
      @assign="assignFromDrawer"
      @cohort-changed="onCohortChanged"
    />

    <Transition name="toast">
      <div v-if="toast" class="as-toast" :style="{ background: toast.color }">{{ toast.text }}</div>
    </Transition>
  </div>
</template>

<style scoped>
/* Stat cards that double as risk filters — clickable + active highlight. */
.stat-card-clickable { cursor: pointer; transition: box-shadow .13s, transform .13s, border-color .13s; }
.stat-card-clickable:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(15,31,46,.08); }
.stat-card-active { outline: 2px solid var(--teal); outline-offset: -1px; box-shadow: 0 4px 14px rgba(15,31,46,.10); }

.hdr-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.74rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer;
}
.hdr-btn:hover { border-color: var(--teal-border); color: var(--teal); }
.hdr-primary {
  background: var(--teal); color: #fff; border-color: var(--teal-mid);
}
.hdr-primary:hover { background: var(--teal-dark); color: #fff; }

.as-search {
  width: 100%; padding: 7px 10px 7px 32px;
  border: 1.5px solid var(--border); border-radius: 8px;
  font-family: Figtree, sans-serif; font-size: 0.78rem;
  color: var(--ink); background: var(--surface);
  outline: none; transition: border-color 0.14s; box-sizing: border-box;
}
.as-search:focus { border-color: var(--teal-border); }

/* Filter dropdowns (cohort / risk) — same look as the search input. */
.as-select {
  padding: 7px 28px 7px 10px;
  border: 1.5px solid var(--border); border-radius: 8px;
  font-family: Figtree, sans-serif; font-size: 0.78rem; font-weight: 600;
  color: var(--ink); background: var(--surface);
  outline: none; cursor: pointer; transition: border-color 0.14s;
  min-width: 140px; box-sizing: border-box;
}
.as-select:focus { border-color: var(--teal-border); }

.tab-pill {
  padding: 5px 12px; border-radius: 7px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-weight: 700;
  color: var(--ink-mid); cursor: pointer;
}
.tab-pill.on {
  border-color: var(--teal-border); background: var(--teal-pale); color: var(--teal-mid);
}

.bulk-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px;
  background: var(--teal-pale);
  border: 1.5px solid var(--teal-border);
  border-radius: var(--r-lg);
  margin-bottom: 12px;
}
.bulk-email {
  padding: 6px 12px; border-radius: 7px;
  background: var(--teal); color: #fff; border: none;
  font-family: Figtree, sans-serif; font-size: 0.73rem; font-weight: 800;
  cursor: pointer; display: flex; align-items: center; gap: 5px;
}
.bulk-assign {
  padding: 6px 12px; border-radius: 7px;
  background: var(--white); color: var(--teal-mid);
  border: 1.5px solid var(--teal-border);
  font-family: Figtree, sans-serif; font-size: 0.73rem; font-weight: 800;
  cursor: pointer;
}
.bulk-clear {
  padding: 6px 10px; border-radius: 7px;
  background: none; color: var(--ink-dim); border: none;
  font-family: Figtree, sans-serif; font-size: 0.73rem; cursor: pointer;
}

.th {
  font-size: 0.59rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 1.5px; color: var(--ink-dim);
  padding: 10px 12px; user-select: none; white-space: nowrap;
}

.student-row {
  cursor: pointer; transition: background 0.1s;
  border-bottom: 1px solid var(--border);
}
.student-row:hover { background: var(--surface); }

.avatar-md {
  width: 28px; height: 28px; border-radius: 50%;
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  font-size: 0.58rem; font-weight: 800; color: #fff;
  overflow: hidden;
}
.avatar-img {
  width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;
}
.avatar-lg {
  width: 50px; height: 50px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.95rem; font-weight: 800; color: #fff;
  flex-shrink: 0;
}

.year-pill {
  font-size: 0.72rem; font-weight: 700;
  padding: 2px 8px; border-radius: 20px;
  background: var(--surface); color: var(--ink-mid);
}

.score-chip {
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;
  font-size: 0.78rem; font-weight: 700;
  padding: 2px 8px; border-radius: 6px;
}

.risk-pill {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 0.6rem; font-weight: 800;
  padding: 2px 8px; border-radius: 20px;
  border: 1px solid;
}
.risk-dot {
  width: 5px; height: 5px; border-radius: 50%;
  display: inline-block;
}

.action-link {
  font-size: 0.7rem; font-weight: 700;
  color: var(--teal); background: none; border: none;
  cursor: pointer; padding: 4px 6px; border-radius: 5px;
  font-family: Figtree, sans-serif;
}
.action-link:hover { background: var(--teal-pale); }

/* Drawer */
.drawer-overlay {
  position: fixed; inset: 0; z-index: 500;
  background: rgba(11, 25, 41, 0.5);
  display: flex; justify-content: flex-end;
}
.drawer-overlay-enter-active, .drawer-overlay-leave-active { transition: opacity .25s; }
.drawer-overlay-enter-from, .drawer-overlay-leave-to { opacity: 0; }

.drawer-panel {
  width: 460px; max-width: 100vw;
  background: var(--white);
  display: flex; flex-direction: column;
  box-shadow: -16px 0 48px rgba(0, 0, 0, 0.16);
  animation: drawer-slide .25s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes drawer-slide {
  from { transform: translateX(20px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.drawer-head {
  padding: 20px 24px; border-bottom: 1px solid var(--border);
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
}
.drawer-close {
  width: 30px; height: 30px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--ink-dim); flex-shrink: 0;
}
.drawer-close:hover { border-color: var(--rose-border); color: var(--rose); }

.drawer-body { padding: 22px 24px; overflow-y: auto; flex: 1; }

.kv-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--r-sm); padding: 14px 16px;
}
.kv-label {
  font-size: 0.6rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 1.5px; color: var(--ink-dim); margin-bottom: 6px;
}
.kv-val {
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;
  font-size: 1.4rem; font-weight: 800; color: var(--ink);
}
.kv-sub { font-size: 0.66rem; color: var(--ink-dim); margin-top: 3px; }

.as-toast {
  position: fixed; bottom: 32px; right: 32px;
  padding: 11px 18px; border-radius: 9px;
  color: #fff; font-family: Figtree, sans-serif;
  font-size: 0.78rem; font-weight: 700;
  box-shadow: 0 8px 32px rgba(0,0,0,0.16);
  z-index: 9999;
}
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }

/* ── Skeleton loader ──────────────────────────────────────────── */
@keyframes shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position:  400px 0; }
}
.sk {
  background: linear-gradient(
    90deg,
    var(--surface)    0%,
    #e2e8ef           40%,
    var(--surface)    80%
  );
  background-size: 400px 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 4px;
  display: block;
}
.sk-stat-card {
  padding: 14px 16px;
  border-radius: var(--r-lg);
  background: var(--white);
  border: 1px solid var(--border);
  border-top: 3px solid var(--border);
}
</style>
