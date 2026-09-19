<script setup lang="ts">
definePageMeta({ layout: 'student' })
useHead({ title: 'Mock Exams · Passmed' })

const studentApi = useStudentApi()
const router     = useRouter()
const { activeExam, examSwitching } = useExam()
// Hamburger + dark-mode toggle now live in the shared <StudentTopbar>.

// ── Types ─────────────────────────────────────────────────────────────────────
interface PastAttempt {
  attemptNumber:     number
  resultDeclared:    boolean         // false = institute hasn't released this attempt yet
  scorePct:          number | null
  passed:            boolean | null
  completedAt:       string | null   // "28 Feb 2026"
  correctCount:      number | null
  timeTakenMinutes:  number | null
  mode:              string          // "Timed" | "Tutor"
  rankLabel:         string | null   // "Top 28%" | "Bottom 55%"
  sessionId:         number | null
}

interface MockExam {
  id:                number
  name:              string
  description:       string | null
  questionCount:     number
  durationMinutes:   number | null
  extraTimeMins:     number
  timed:             boolean
  dueDate:           string | null
  difficulty:        string
  passMarkValue:     number
  attemptLimit:      number | null   // null = unlimited
  attemptsDone:      number
  attemptsLeft:      number | null   // null = unlimited; 0 = exhausted
  topics:            string[]
  totalAttemptsCount: number | null  // how many students attempted
  showLeaderboard:    boolean
  peerRankLabel:     string | null   // "Top 28%" etc.
  topPeers:          { initials: string; color: string }[]
  institutionName:   string
  studentStatus:      'pending' | 'in_progress' | 'completed'
  resultsRelease:     'immediate' | 'manual'   // 'manual' = score hidden until admin releases
  assignmentStatus:   'active' | 'scheduled'  // 'scheduled' = not yet open (Coming Soon)
  sendAt:             string | null           // date when scheduled exam goes live
  scorePct:          number | null
  passed:            boolean | null
  sessionId:         number | null
  pastAttempts:      PastAttempt[]
}

// ── State ─────────────────────────────────────────────────────────────────────
const exams              = ref<MockExam[]>([])
const loading            = ref(true)
const loadError          = ref('')
const launching          = ref<number | null>(null)

// ── Toast (replaces native alert() for start-exam errors) ───────────────────
const toast = ref<{ msg: string; kind: 'ok' | 'err' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(msg: string, kind: 'ok' | 'err' = 'ok') {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { msg, kind }
  toastTimer = setTimeout(() => { toast.value = null }, kind === 'err' ? 5000 : 3000)
}
const completedSectionEl = ref<HTMLElement | null>(null)

const { updateFromExams } = useMockBadge()

// ── Derived lists ─────────────────────────────────────────────────────────────
// "New this week"       → never attempted before (attemptsDone === 0, not completed)
// "Previously attempted"→ has at least 1 attempt done, OR fully completed
//   (keeps retake-in-progress exams in the "Previously attempted" section)
const availableExams = computed(() => exams.value.filter(e => e.studentStatus !== 'completed' && e.attemptsDone === 0))
const completedExams = computed(() => exams.value.filter(e => e.studentStatus === 'completed' || e.attemptsDone > 0))

// ── Helpers ───────────────────────────────────────────────────────────────────
function mapPastAttempt(raw: any, idx: number): PastAttempt {
  return {
    attemptNumber:    raw.attempt_number    ?? idx + 1,
    // result_declared: true by default so immediate-release exams always show scores.
    // For manual-release exams the backend sends false until admin declares.
    resultDeclared:   raw.result_declared   ?? true,
    scorePct:         raw.score_pct         ?? null,
    passed:           raw.passed            ?? null,
    completedAt:      raw.completed_at      ?? null,
    correctCount:     raw.correct_count     ?? null,
    timeTakenMinutes: raw.time_taken_minutes ?? null,
    mode:             raw.mode              ?? 'Timed',
    rankLabel:        raw.rank_label        ?? null,
    sessionId:        raw.session_id        ?? null,
  }
}

function mapExam(raw: any): MockExam {
  return {
    id:                 raw.id,
    name:               raw.name                ?? 'Untitled Exam',
    description:        raw.description         ?? null,
    questionCount:      raw.question_count       ?? 0,
    durationMinutes:    raw.duration_minutes     ?? null,
    extraTimeMins:      raw.extra_time_mins      ?? 0,
    timed:              !!raw.timed,
    dueDate:            raw.due_date             ?? null,
    difficulty:         raw.difficulty           ?? 'mixed',
    passMarkValue:      raw.pass_mark_value      ?? 65,
    attemptLimit:       raw.attempt_limit        ?? null,
    attemptsDone:       raw.attempts_done        ?? 0,
    attemptsLeft:       raw.attempts_left        ?? null,
    topics:             raw.topics               ?? [],
    totalAttemptsCount: raw.total_attempts_count ?? raw.completed_count ?? null,
    showLeaderboard:    raw.show_leaderboard !== false,   // default true when absent
    peerRankLabel:      raw.peer_rank_label      ?? null,
    topPeers:           raw.top_peers            ?? [],
    institutionName:    raw.institution_name     ?? '',
    studentStatus:      raw.student_status       ?? 'pending',
    resultsRelease:     raw.results_release      ?? 'immediate',
    assignmentStatus:   raw.assignment_status    ?? 'active',
    sendAt:             raw.send_at             ?? null,
    scorePct:           raw.score_pct            ?? null,
    passed:             raw.passed               ?? null,
    sessionId:          raw.session_id           ?? null,
    pastAttempts:       (raw.past_attempts ?? []).map(mapPastAttempt),
  }
}

function canRetry(exam: MockExam): boolean {
  return exam.attemptsLeft === null || exam.attemptsLeft > 0
}

// Returns true when assignment is 'scheduled' — not yet open to students
function isUpcoming(exam: MockExam): boolean {
  return exam.assignmentStatus === 'scheduled'
}

function retryLabel(exam: MockExam): string {
  if (exam.attemptLimit) return `Retake`
  return 'Retake'
}

function diffLabel(d: string): string {
  return { easy: 'Foundation', medium: 'Intermediate', hard: 'Advanced', foundation: 'Foundation', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert', mixed: 'Mixed' }[d] ?? d
}

function formatDuration(mins: number | null): string {
  if (!mins) return '—'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function formatTimeTaken(mins: number | null): string {
  if (!mins) return ''
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}min` : `${h}h`
}

function institutionInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'PM'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function stripeClass(exam: MockExam): string {
  if (exam.studentStatus === 'completed') return 'stripe-standard'
  return 'stripe-new'
}

function diffBadgeClass(d: string): string {
  return { easy: 'badge-easy', medium: 'badge-medium', hard: 'badge-hard', foundation: 'badge-easy', intermediate: 'badge-medium', advanced: 'badge-hard', expert: 'badge-expert', mixed: 'badge-mixed' }[d] ?? 'badge-mixed'
}
function diffBarClass(d: string): string {
  return { easy: 'diff-easy', medium: 'diff-medium', hard: 'diff-hard', foundation: 'diff-easy', intermediate: 'diff-medium', advanced: 'diff-hard', expert: 'diff-expert', mixed: 'diff-mixed' }[d] ?? 'diff-mixed'
}

/** Attempts badge for available exam */
function attemptsBadgeClass(exam: MockExam): string {
  if (exam.attemptLimit === null) return 'attempts-unlimited'
  if (exam.attemptLimit === 1)   return 'attempts-one'
  return 'attempts-limited'
}

function attemptsBadgeLabel(exam: MockExam): string {
  if (exam.attemptLimit === null) return 'Unlimited attempts'
  if (exam.attemptLimit === 1)   return '1 attempt only'
  return `${exam.attemptLimit} attempts allowed`
}

/** Attempts badge for completed exam */
function attemptsLeftBadgeClass(exam: MockExam): string {
  if (exam.attemptsLeft === null) return 'attempts-unlimited'
  if (exam.attemptsLeft === 0)   return 'attempts-none'
  if (exam.attemptsLeft === 1)   return 'attempts-one'
  return 'attempts-limited'
}

function attemptsLeftLabel(exam: MockExam): string {
  if (exam.attemptsLeft === null) return 'Unlimited attempts'
  if (exam.attemptsLeft === 0)   return 'No attempts left'
  // Show "X of Y attempts used · Z remaining" when we know the total.
  // e.g. "1 of 3 attempts used · 2 remaining" — avoids ambiguous "2 of 3 left" phrasing.
  if (exam.attemptLimit && exam.attemptsDone > 0) {
    return `${exam.attemptsDone} of ${exam.attemptLimit} attempt${exam.attemptLimit === 1 ? '' : 's'} used · ${exam.attemptsLeft} remaining`
  }
  return `${exam.attemptsLeft} attempt${exam.attemptsLeft === 1 ? '' : 's'} remaining`
}

function scoreColor(pct: number | null): string {
  if (pct === null) return 'var(--ink-dim)'
  if (pct >= 70) return 'var(--green)'
  if (pct >= 50) return 'var(--amber)'
  return 'var(--rose)'
}

function scoreRingOffset(pct: number | null): number {
  if (pct === null) return 94.25
  return 94.25 * (1 - pct / 100)
}

function rankLabelColor(label: string | null): string {
  if (!label) return 'var(--ink-dim)'
  if (label.toLowerCase().startsWith('top')) return 'var(--green)'
  return 'var(--rose)'
}

function isGoodRank(label: string | null): boolean {
  return !!label && label.toLowerCase().startsWith('top')
}

// ── Leaderboard modal ─────────────────────────────────────────────────────────
interface LeaderboardEntry {
  rank:          number
  name:          string
  initials:      string
  scorePct:      number
  color:         string
  attemptNumber: number
  passed:        boolean
  isMe:          boolean
}

const LB_COLORS = ['#16a34a','#e11d48','#0891b2','#7c3aed','#ea580c','#0284c7','#be123c','#15803d']

const lbOpen        = ref(false)
const lbExam        = ref<MockExam | null>(null)
const lbLoading     = ref(false)
const lbEntries          = ref<LeaderboardEntry[]>([])
const lbMyBest           = ref<number | null>(null)
const lbMyAttemptsCount  = ref<number>(0)
const lbOthersCount      = ref<number>(0)
const lbTotalPeers       = ref<number>(0)
const lbMyPercentile     = ref<number | null>(null)
const lbTotalStudents    = ref<number>(0)

function lbColor(idx: number): string {
  return LB_COLORS[idx % LB_COLORS.length]
}

function lbInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

async function openLeaderboard(exam: MockExam) {
  lbExam.value       = exam
  lbOpen.value       = true
  lbLoading.value    = true
  lbEntries.value         = []
  lbMyBest.value          = null
  lbMyAttemptsCount.value = 0
  lbOthersCount.value     = 0
  lbTotalPeers.value      = exam.totalAttemptsCount ?? 0
  lbMyPercentile.value    = null
  lbTotalStudents.value   = 0

  try {
    const res = await studentApi<any>(`/mock-exams/${exam.id}/leaderboard`)
    if (res?.status === 'success') {
      lbMyBest.value          = res.data?.my_best_score     ?? null
      lbMyAttemptsCount.value = res.data?.my_attempts_count ?? 0
      lbOthersCount.value     = res.data?.others_count      ?? 0
      lbTotalPeers.value      = res.data?.total_attempts    ?? lbTotalPeers.value
      lbMyPercentile.value    = res.data?.my_percentile     ?? null
      lbTotalStudents.value   = res.data?.total_students    ?? 0
      lbEntries.value = (res.data?.entries ?? []).map((e: any, i: number): LeaderboardEntry => ({
        rank:          e.rank          ?? i + 1,
        name:          e.name          ?? 'Anonymous',
        initials:      lbInitials(e.name ?? ''),
        scorePct:      e.score_pct     ?? 0,
        color:         lbColor(i),
        attemptNumber: e.attempt_number ?? 1,
        passed:        e.passed        ?? false,
        isMe:          e.is_me         ?? false,
      }))
    }
  } catch {}
  finally { lbLoading.value = false }
}

function closeLeaderboard() {
  lbOpen.value  = false
  lbExam.value  = null
}

// ── Load exams ─────────────────────────────────────────────────────────────────
const routeQ = useRoute()

async function loadExams() {
  loading.value   = true
  loadError.value = ''
  try {
    const res = await studentApi<any>('/mock-exams')
    if (res?.status === 'success') {
      exams.value = (res.data ?? []).map(mapExam)
      updateFromExams(exams.value)  // sync sidebar badge
    } else {
      loadError.value = res?.msg ?? 'Failed to load mock exams.'
    }
  } catch (e: any) {
    loadError.value = e?.data?.msg ?? 'Failed to load mock exams.'
  } finally {
    loading.value = false
    // If coming back from mock-review, scroll to "Previously attempted" section.
    if (routeQ.query.scrollTo === 'completed') {
      await nextTick()
      completedSectionEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
}

// ── Start / resume exam ────────────────────────────────────────────────────────
async function startExam(exam: MockExam) {
  // Drives the button "Starting…" state AND the full-screen launch overlay,
  // covering the (slow) /mock-exams/{id}/start round-trip. On success the
  // overlay fades out as the runner mounts and shows its own sk-runner
  // skeleton, so the loading indicator is continuous: overlay → skeleton →
  // runner. Cleared in `finally` so it never lingers (incl. keep-alive return).
  launching.value = exam.id
  try {
    const res = await studentApi<any>(`/mock-exams/${exam.id}/start`, { method: 'POST' })
    if (res?.status !== 'success') {
      showToast(res?.msg ?? 'Could not start exam.', 'err')
      return
    }
    const sessionId = res.session_id
    // All mocks (timed and "Open"/untimed) now run through the single
    // mock-timed runner, which gates its clock on the timed flag. mock-tutor.vue
    // was removed — it behaved as a tutor session, not an exam.
    router.push(`/student/mock-timed?sid=${sessionId}&timed=${exam.timed ? 1 : 0}`)
  } catch (e: any) {
    showToast(e?.data?.msg ?? 'Could not start exam.', 'err')
  } finally {
    launching.value = null
  }
}

function reviewSession(sessionId: number | null, attemptNumber: number = 1) {
  if (sessionId) router.push(`/student/mock-review?sid=${sessionId}&attempt=${attemptNumber}`)
}

onMounted(loadExams)
// Safety net: if this page is kept alive (keep-alive layout), onMounted won't
// fire on re-activation — onActivated ensures the list is always fresh.
onActivated(loadExams)

// When the student finishes an exam and navigates back here, completeSession()
// increments completionTick. Watching it guarantees a refetch regardless of
// whether the page remounts or was kept alive.
const completionTick = useState<number>('mock:completionTick', () => 0)
watch(completionTick, () => { loadExams() })

// Reload mock exams whenever the student switches their active exam.
// The backend filters by student_active_exam_portal.exam_id, so a fresh
// fetch after the switch shows only the new exam's mock exams.
// examSwitching flips to true THE INSTANT the user picks a new exam in
// the sidebar (before the POST /active-exam/set finishes). Use it to
// show the skeleton immediately — no network-round-trip delay.
watch(() => examSwitching.value, (switching) => {
  if (switching) {
    loading.value = true
    exams.value   = []
  }
})

// Once the active exam has actually changed (POST done, examId updated),
// fetch the new exam's mock exams.
watch(() => activeExam.value?.examId, (newId, oldId) => {
  if (!newId || newId === oldId) return
  loadExams()
})
</script>

<template>
  <!-- Standard title bar (matches every other page). Swaps to a shimmer band
       while the mock list loads so the whole page reads as one skeleton. -->
  <div v-if="loading" class="sk-topbar">
    <div class="sk-pulse" style="width:150px;height:18px;border-radius:4px"></div>
  </div>
  <StudentTopbar v-else title="Mock Exams">
    <span v-if="availableExams.length" class="new-badge">{{ availableExams.length }} new</span>
  </StudentTopbar>

  <div class="content">

    <!-- ── Loading skeleton ─────────────────────────────────────────────────── -->
    <template v-if="loading">
      <div class="section-label fi d2">
        <div class="sk-pulse" style="width:110px;height:10px;border-radius:3px"></div>
      </div>
      <div v-for="i in 3" :key="`sk-${i}`" class="exam-card fi" :class="`d${i+2}`" style="pointer-events:none">
        <div class="exam-card-stripe stripe-new" style="opacity:.4"></div>
        <div class="exam-card-inner">
          <div class="exam-diff-bar diff-mixed" style="opacity:.3"></div>
          <div class="exam-body">
            <div class="exam-top" style="margin-bottom:10px">
              <div style="flex:1">
                <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
                  <div class="sk-pulse" style="width:55%;height:15px;border-radius:4px"></div>
                  <div class="sk-pulse" style="width:44px;height:18px;border-radius:20px"></div>
                </div>
                <div class="sk-pulse" style="width:90%;height:11px;border-radius:3px;margin-bottom:5px"></div>
                <div class="sk-pulse" style="width:70%;height:11px;border-radius:3px"></div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">
                <div class="sk-pulse" style="width:32px;height:32px;border-radius:50%"></div>
                <div class="sk-pulse" style="width:52px;height:9px;border-radius:3px"></div>
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px">
              <div class="sk-pulse" style="width:90px;height:14px;border-radius:3px"></div>
              <div class="sk-pulse" style="width:80px;height:14px;border-radius:3px"></div>
              <div class="sk-pulse" style="width:100px;height:14px;border-radius:3px"></div>
            </div>
            <div style="display:flex;gap:6px;margin-bottom:14px">
              <div class="sk-pulse" style="width:70px;height:20px;border-radius:20px"></div>
              <div class="sk-pulse" style="width:90px;height:20px;border-radius:20px"></div>
              <div class="sk-pulse" style="width:60px;height:20px;border-radius:20px"></div>
            </div>
            <div class="sk-pulse" style="width:108px;height:34px;border-radius:8px"></div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Error ────────────────────────────────────────────────────────────── -->
    <div v-else-if="loadError" class="empty-state fi d2" style="color:var(--rose)">
      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p>{{ loadError }}</p>
    </div>

    <!-- ── Empty ────────────────────────────────────────────────────────────── -->
    <div v-else-if="exams.length === 0" class="empty-state fi d2">
      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      <p>No mock exams assigned to you yet.</p>
    </div>

    <template v-else>

      <!-- ══ NEW THIS WEEK ════════════════════════════════════════════════════ -->
      <template v-if="availableExams.length > 0">
        <div class="section-label fi d2">New this week</div>

        <div v-for="(exam, gi) in availableExams" :key="`a-${exam.id}`"
             class="exam-card fi" :class="`d${gi+3}`">
          <div :class="['exam-card-stripe', stripeClass(exam)]"></div>
          <div class="exam-card-inner">
            <div :class="['exam-diff-bar', diffBarClass(exam.difficulty)]"></div>
            <div class="exam-body">

              <!-- Title row + Creator -->
              <div class="exam-top">
                <div class="exam-title-row">
                  <div class="exam-title">
                    {{ exam.name }}
                    <span v-if="exam.studentStatus === 'in_progress'" class="exam-badge badge-in-progress">
                      ● In Progress
                    </span>
                    <span v-else class="exam-badge badge-new">New</span>
                    <span :class="['exam-badge', diffBadgeClass(exam.difficulty)]">{{ diffLabel(exam.difficulty) }}</span>
                    <span v-if="exam.assignmentStatus === 'scheduled'" class="exam-badge badge-scheduled">
                      🕐 Coming Soon{{ exam.sendAt ? ' · ' + exam.sendAt : '' }}
                    </span>
                    <span v-else-if="exam.dueDate" class="exam-badge badge-due">Due soon</span>
                  </div>
                  <div class="exam-sub">{{ exam.timed ? 'Timed Mode' : 'Tutor Mode' }} · Pass mark {{ exam.passMarkValue }}%</div>
                </div>
                <div class="exam-creator" :title="exam.institutionName">
                  <div class="creator-avatar">{{ institutionInitials(exam.institutionName) }}</div>
                  <div class="creator-name">{{ exam.institutionName }}</div>
                </div>
              </div>

              <!-- Description -->
              <div v-if="exam.description" class="exam-desc">{{ exam.description }}</div>

              <!-- Meta row -->
              <div class="exam-meta">
                <div class="em-item">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                  <strong>{{ exam.questionCount }}</strong>&nbsp;questions
                </div>
                <div v-if="exam.durationMinutes" class="em-item">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <strong>{{ formatDuration(exam.durationMinutes) }}</strong>&nbsp;time limit
                </div>
                <div class="em-item">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  {{ diffLabel(exam.difficulty) }} difficulty
                </div>
                <div v-if="exam.dueDate" class="em-item em-due">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Due {{ exam.dueDate }}
                </div>
                <div v-if="exam.totalAttemptsCount && exam.attemptsDone > 0" class="em-item">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <strong>{{ exam.totalAttemptsCount.toLocaleString() }}</strong>&nbsp;{{ exam.totalAttemptsCount === 1 ? 'attempt' : 'attempts' }}
                </div>
                <span :class="['attempts-badge', attemptsBadgeClass(exam)]">
                  <svg v-if="exam.attemptLimit === null" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                  <svg v-else-if="exam.attemptLimit === 1" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <svg v-else width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                  {{ attemptsBadgeLabel(exam) }}
                </span>
                <span v-if="exam.extraTimeMins > 0" class="attempts-badge extra-time-badge">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  +{{ exam.extraTimeMins }} min extra time
                </span>
              </div>

              <!-- Topics -->
              <div v-if="exam.topics.length" class="exam-topics">
                <span v-for="t in exam.topics" :key="t" class="topic-tag">{{ t }}</span>
              </div>

              <!-- Actions -->
              <div class="exam-actions">
                <button type="button" class="btn btn-primary"
                        :disabled="launching === exam.id || isUpcoming(exam)"
                        :class="{ 'btn-expired': isUpcoming(exam), 'btn-resume': exam.studentStatus === 'in_progress' && !isUpcoming(exam) }"
                        @click="!isUpcoming(exam) && startExam(exam)">
                  <!-- Resume icon for in_progress -->
                  <svg v-if="exam.studentStatus === 'in_progress'" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>
                  <!-- Play icon for not started -->
                  <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  {{ launching === exam.id ? 'Starting…' : (exam.studentStatus === 'in_progress' ? 'Resume Exam' : 'Start Exam') }}
                </button>
                <button type="button" v-if="exam.showLeaderboard && exam.totalAttemptsCount && exam.attemptsDone > 0" class="btn btn-ghost" @click="openLeaderboard(exam)">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  Leaderboard
                </button>
                <div class="exam-actions-spacer"></div>
                <div v-if="exam.showLeaderboard && exam.totalAttemptsCount && exam.attemptsDone > 0" class="leaderboard-peek" style="cursor:pointer" @click="openLeaderboard(exam)">
                  <div class="leaderboard-avatars">
                    <div v-for="peer in exam.topPeers.slice(0, 3)" :key="peer.initials"
                         class="lb-av" :style="{ background: peer.color }">{{ peer.initials }}</div>
                  </div>
                  {{ exam.totalAttemptsCount.toLocaleString() }} peers attempted
                </div>
              </div>

            </div>
          </div>
        </div>
      </template>

      <!-- ══ PREVIOUSLY ATTEMPTED ══════════════════════════════════════════ -->
      <template v-if="completedExams.length > 0">
        <div ref="completedSectionEl" class="section-label fi d2" :style="availableExams.length > 0 ? 'margin-top:8px' : ''">
          Previously attempted
        </div>

        <div v-for="(exam, gi) in completedExams" :key="`c-${exam.id}`"
             class="exam-card fi" :class="`d${gi+3}`">
          <div :class="['exam-card-stripe', stripeClass(exam)]"></div>
          <div class="exam-card-inner">
            <div :class="['exam-diff-bar', diffBarClass(exam.difficulty)]"></div>
            <div class="exam-body">

              <!-- Title row + Creator -->
              <div class="exam-top">
                <div class="exam-title-row">
                  <div class="exam-title">
                    {{ exam.name }}
                    <span :class="['exam-badge', diffBadgeClass(exam.difficulty)]">{{ diffLabel(exam.difficulty) }}</span>
                  </div>
                  <div class="exam-sub">{{ exam.timed ? 'Timed Mode' : 'Tutor Mode' }} · Pass mark {{ exam.passMarkValue }}%</div>
                </div>
                <div class="exam-creator" :title="exam.institutionName">
                  <div class="creator-avatar">{{ institutionInitials(exam.institutionName) }}</div>
                  <div class="creator-name">{{ exam.institutionName }}</div>
                </div>
              </div>

              <!-- Description -->
              <div v-if="exam.description" class="exam-desc">{{ exam.description }}</div>

              <!-- Meta row -->
              <div class="exam-meta">
                <div class="em-item">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                  <strong>{{ exam.questionCount }}</strong>&nbsp;questions
                </div>
                <div v-if="exam.durationMinutes" class="em-item">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <strong>{{ formatDuration(exam.durationMinutes) }}</strong>&nbsp;time limit
                </div>
                <div class="em-item">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  {{ diffLabel(exam.difficulty) }} difficulty
                </div>
                <div v-if="exam.totalAttemptsCount && exam.attemptsDone > 0" class="em-item">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <strong>{{ exam.totalAttemptsCount.toLocaleString() }}</strong>&nbsp;{{ exam.totalAttemptsCount === 1 ? 'attempt' : 'attempts' }}
                </div>
                <span :class="['attempts-badge', attemptsLeftBadgeClass(exam)]">
                  <svg v-if="exam.attemptsLeft === null" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                  <svg v-else-if="exam.attemptsLeft === 0" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  <svg v-else width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                  {{ attemptsLeftLabel(exam) }}
                </span>
              </div>

              <!-- Topics -->
              <div v-if="exam.topics.length" class="exam-topics">
                <span v-for="t in exam.topics" :key="t" class="topic-tag">{{ t }}</span>
              </div>

              <!-- Actions -->
              <div class="exam-actions" style="margin-bottom:12px">
                <!-- Resume if retake is in_progress -->
                <button type="button" v-if="exam.studentStatus === 'in_progress'"
                        class="btn btn-primary btn-resume"
                        :disabled="launching === exam.id"
                        @click="startExam(exam)">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>
                  {{ launching === exam.id ? 'Starting…' : 'Resume Exam' }}
                </button>
                <!-- Retake if completed and attempts left -->
                <button type="button" v-else-if="canRetry(exam)"
                        class="btn btn-primary"
                        :disabled="launching === exam.id || isUpcoming(exam)"
                        :class="{ 'btn-expired': isUpcoming(exam) }"
                        @click="!isUpcoming(exam) && startExam(exam)">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 .49-4.44"/></svg>
                  {{ launching === exam.id ? 'Starting…' : retryLabel(exam) }}
                </button>
                <span v-else class="exhausted-msg">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  All attempts used
                </span>
                <button type="button" v-if="exam.showLeaderboard && exam.totalAttemptsCount && exam.attemptsDone > 0" class="btn btn-ghost" @click="openLeaderboard(exam)">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  Leaderboard
                </button>
                <div class="exam-actions-spacer"></div>
                <button type="button" v-if="exam.showLeaderboard && exam.totalAttemptsCount && exam.attemptsDone > 0" class="leaderboard-peek" style="cursor:pointer" @click="openLeaderboard(exam)">
                  <div class="leaderboard-avatars">
                    <div v-for="peer in exam.topPeers.slice(0, 3)" :key="peer.initials"
                         class="lb-av" :style="{ background: peer.color }">{{ peer.initials }}</div>
                  </div>
                  {{ exam.totalAttemptsCount.toLocaleString() }} peers
                  <template v-if="exam.peerRankLabel">
                    · You rank
                    <strong :style="{ color: rankLabelColor(exam.peerRankLabel), marginLeft: '3px' }">
                      {{ exam.peerRankLabel }}
                    </strong>
                  </template>
                </button>
              </div>

            </div>

          <!-- Past attempts inset -->
          <div class="past-attempts">
            <div class="pa-label">Your attempts</div>
            <div class="pa-list">

              <!-- CASE A: ALL attempts are undeclared (manual release, nothing released yet) -->
              <template v-if="exam.resultsRelease === 'manual' && exam.pastAttempts.every(a => !a.resultDeclared)">
                <div class="results-pending">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.55">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <div>
                    <div class="results-pending-title">Results not yet released</div>
                    <div class="results-pending-sub">Your institution will release results once marking is complete.</div>
                  </div>
                </div>
              </template>

              <!-- CASE B: At least some attempts are declared — show declared rows -->
              <template v-else-if="exam.pastAttempts.length">

                <!-- Declared attempt rows -->
                <template v-for="pa in exam.pastAttempts" :key="pa.attemptNumber">
                  <!-- Declared attempt: show full result row -->
                  <div v-if="pa.resultDeclared" class="pa-row">

                    <!-- Score ring -->
                    <div class="pa-score-ring">
                      <svg viewBox="0 0 36 36" width="52" height="52">
                        <circle fill="none" stroke="var(--border)" stroke-width="3" cx="18" cy="18" r="15"/>
                        <circle fill="none"
                                :stroke="scoreColor(pa.scorePct)"
                                stroke-width="3" stroke-linecap="round"
                                cx="18" cy="18" r="15"
                                stroke-dasharray="94.25"
                                :stroke-dashoffset="scoreRingOffset(pa.scorePct)"
                                transform="rotate(-90 18 18)"/>
                      </svg>
                      <div class="pa-ring-label">
                        <span class="pa-pct" :style="{ color: scoreColor(pa.scorePct) }">
                          {{ pa.scorePct != null ? Math.round(pa.scorePct) + '%' : '—' }}
                        </span>
                      </div>
                    </div>

                    <!-- Date + meta -->
                    <div class="pa-info">
                      <div v-if="pa.completedAt" class="pa-date">{{ pa.completedAt }}</div>
                      <div class="pa-meta">
                        <template v-if="pa.correctCount != null">{{ pa.correctCount }}/{{ exam.questionCount }} correct</template>
                        <template v-if="pa.timeTakenMinutes"> · {{ formatTimeTaken(pa.timeTakenMinutes) }}</template>
                        <template v-if="pa.mode"> · {{ pa.mode }}</template>
                      </div>
                    </div>

                    <!-- Spacer -->
                    <div style="flex:1"></div>

                    <!-- Right group: rank | separator | review -->
                    <div class="pa-right">
                      <span v-if="pa.rankLabel || pa.passed !== null"
                            class="pa-rank"
                            :class="pa.rankLabel
                              ? (isGoodRank(pa.rankLabel) ? 'pa-rank-good' : 'pa-rank-bad')
                              : (pa.passed ? 'pa-rank-good' : 'pa-rank-bad')">
                        {{ pa.rankLabel ?? (pa.passed ? 'Passed' : 'Failed') }}
                      </span>
                      <div class="pa-sep"></div>
                      <button type="button" v-if="pa.sessionId" class="pa-btn" @click="reviewSession(pa.sessionId, pa.attemptNumber)">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        Review
                      </button>
                    </div>

                  </div>

                  <!-- Undeclared attempt (newer attempt, results pending) -->
                  <div v-else class="pa-row pa-row-pending">
                    <div class="pa-pending-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.45">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </div>
                    <div class="pa-info">
                      <div v-if="pa.completedAt" class="pa-date">{{ pa.completedAt }}</div>
                      <div class="pa-meta">Attempt {{ pa.attemptNumber }} · {{ pa.mode }}</div>
                    </div>
                    <div style="flex:1"></div>
                    <div class="pa-right">
                      <span class="pa-rank pa-rank-pending">Pending release</span>
                    </div>
                  </div>
                </template>

              </template>

              <!-- CASE C: Fallback for old data — single row from top-level score -->
              <template v-else-if="exam.scorePct != null && exam.resultsRelease !== 'manual'">
                <div class="pa-row">
                  <div class="pa-score-ring">
                    <svg viewBox="0 0 36 36" width="52" height="52">
                      <circle fill="none" stroke="var(--border)" stroke-width="3" cx="18" cy="18" r="15"/>
                      <circle fill="none"
                              :stroke="scoreColor(exam.scorePct)"
                              stroke-width="3" stroke-linecap="round"
                              cx="18" cy="18" r="15"
                              stroke-dasharray="94.25"
                              :stroke-dashoffset="scoreRingOffset(exam.scorePct)"
                              transform="rotate(-90 18 18)"/>
                    </svg>
                    <div class="pa-ring-label">
                      <span class="pa-pct" :style="{ color: scoreColor(exam.scorePct) }">
                        {{ Math.round(exam.scorePct) }}%
                      </span>
                    </div>
                  </div>
                  <div class="pa-info">
                    <div class="pa-meta">{{ exam.timed ? 'Timed' : 'Tutor' }} · {{ exam.questionCount }} questions</div>
                  </div>
                  <div style="flex:1"></div>
                  <div class="pa-right">
                    <span class="pa-rank" :class="exam.passed ? 'pa-rank-good' : 'pa-rank-bad'">
                      {{ exam.passed ? 'Passed' : 'Failed' }}
                    </span>
                    <div class="pa-sep"></div>
                    <button type="button" v-if="exam.sessionId" class="pa-btn" @click="reviewSession(exam.sessionId, 1)">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      Review
                    </button>
                  </div>
                </div>
              </template>

            </div>
          </div>
        </div><!-- /exam-card-inner -->

        </div><!-- /exam-card -->
      </template>

    </template>
  </div>

  <!-- ══ LEADERBOARD MODAL ═══════════════════════════════════════════════════ -->
  <Teleport to="body">
    <Transition name="lb-fade">
      <div v-if="lbOpen" class="lb-overlay" @click.self="closeLeaderboard">
        <div class="lb-modal">

          <!-- Header -->
          <div class="lb-header">
            <div class="lb-header-text">
              <div class="lb-title">{{ lbExam?.name }}</div>
              <div class="lb-subtitle">{{ lbExam?.institutionName }} · All attempts</div>
            </div>
            <button type="button" class="lb-close" @click="closeLeaderboard" aria-label="Close leaderboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- ── Manual results: hide leaderboard ONLY if student has no declared attempts ── -->
          <template v-if="lbExam?.resultsRelease === 'manual' && !lbExam.pastAttempts.some(a => a.resultDeclared)">
            <div class="lb-manual-block">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.55">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <div>
                <div class="lb-manual-title">Results not yet released</div>
                <div class="lb-manual-sub">Your institution will release results and leaderboard once marking is complete.</div>
              </div>
            </div>
          </template>

          <!-- ── Normal flow ───────────────────────────────────────────────── -->
          <template v-else>

            <!-- Your best score card -->
            <div class="lb-my-score">
              <div class="lb-my-score-left">
                <span class="lb-my-score-val" :style="{ color: lbMyBest !== null ? scoreColor(lbMyBest) : 'var(--ink-dim)' }">
                  {{ lbMyBest !== null ? lbMyBest + '%' : '—' }}
                </span>
              </div>
              <div class="lb-my-score-right">
                <div class="lb-my-score-label">Your best score</div>
                <div class="lb-my-score-sub">
                  <template v-if="lbMyBest === null">Not attempted yet</template>
                  <template v-else>Your personal best · {{ lbMyAttemptsCount }} {{ lbMyAttemptsCount === 1 ? 'attempt' : 'attempts' }}</template>
                  <template v-if="lbOthersCount"> · {{ lbOthersCount }} others</template>
                  <template v-if="lbMyBest !== null && lbMyPercentile !== null"> · <strong class="lb-pctl">Top {{ lbMyPercentile }}%</strong></template>
                </div>
              </div>
            </div>

            <!-- Loading -->
            <div v-if="lbLoading" class="lb-loading">
              <div class="lb-spinner"></div>
              Loading leaderboard…
            </div>

            <!-- Table -->
            <template v-else-if="lbEntries.length">
              <div class="lb-table">
                <div class="lb-thead">
                  <div class="lb-col-rank">#</div>
                  <div class="lb-col-name">NAME</div>
                  <div class="lb-col-score">SCORE</div>
                  <div class="lb-col-bar">BAR</div>
                </div>
                <div v-for="entry in lbEntries" :key="`${entry.name}-${entry.attemptNumber}`"
                     class="lb-row" :class="{ 'lb-row-me': entry.isMe }">
                  <div class="lb-col-rank" :class="{ 'lb-rank-me': entry.isMe }">
                    <span v-if="entry.rank <= 3" class="lb-medal" :class="`lb-medal-${entry.rank}`"
                          :aria-label="`Rank ${entry.rank}`" :title="`Rank ${entry.rank}`">{{ entry.rank }}</span>
                    <span v-else class="lb-rank-num">{{ entry.rank }}</span>
                  </div>
                  <div class="lb-col-name lb-name-cell">
                    <div class="lb-av-md" :style="{ background: entry.color }">{{ entry.initials }}</div>
                    <div style="min-width:0">
                      <div style="display:flex;align-items:center;gap:5px">
                        <span class="lb-name-text">{{ entry.name }}</span>
                      </div>
                      <span class="lb-attempt-tag">Attempt {{ entry.attemptNumber }}</span>
                    </div>
                  </div>
                  <div class="lb-col-score lb-score-val" :style="{ color: scoreColor(entry.scorePct) }">{{ entry.scorePct }}%</div>
                  <div class="lb-col-bar lb-bar-cell">
                    <div class="lb-bar-track">
                      <div class="lb-bar-fill" :style="{ width: entry.scorePct + '%', background: scoreColor(entry.scorePct) }"></div>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Empty -->
            <div v-else class="lb-empty">No attempts yet — be the first!</div>

          </template>

        </div>
      </div>
    </Transition>
  </Teleport>
  <!-- Bottom-center toast for start-exam errors. Auto-dismisses. -->
  <Transition name="toast">
    <div v-if="toast" class="mock-toast" :class="`mock-toast--${toast.kind}`">
      <svg v-if="toast.kind === 'ok'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>{{ toast.msg }}</span>
    </div>
  </Transition>

  <!-- Full-screen launching indicator — covers the gap between tapping Start
       and the runner mounting (the /mock-exams/{id}/start round-trip + nav).
       The runner (mock-timed) then shows its own sk-runner skeleton, so the
       student never sees a blank/unresponsive screen. -->
  <Teleport to="body">
    <Transition name="lo-fade">
      <div v-if="launching !== null" class="launch-overlay" aria-live="polite" aria-busy="true">
        <div class="launch-spinner"></div>
        <div class="launch-text">Starting your exam…</div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ─── Skeleton ────────────────────────────────────────────────────────────── */
.sk-pulse {
  background: var(--surface-2, #e5e7eb);
  animation: skPulse 1.2s ease-in-out infinite;
}
@keyframes skPulse { 0%,100%{opacity:.85} 50%{opacity:.5} }

/* ─── Layout ──────────────────────────────────────────────────────────────── */
.content {
  padding: 24px;
}

/* ─── Page header / sub ───────────────────────────────────────────────────── */
.page-title {
  font-size: 1.45rem;
  font-weight: 800;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 10px;
}

.new-badge {
  font-size: 0.62rem;
  font-weight: 800;
  padding: 3px 9px;
  border-radius: 20px;
  background: var(--teal, #06b6d4);
  color: #fff;
  letter-spacing: .5px;
  text-transform: uppercase;
}

.page-sub {
  font-size: 0.75rem;
  color: var(--ink-dim);
  margin-top: 3px;
}

/* ─── Section label ───────────────────────────────────────────────────────── */
.section-label {
  font-size: 0.63rem;
  font-weight: 700;
  letter-spacing: .09em;
  text-transform: uppercase;
  color: var(--ink-dim);
  margin: 20px 0 10px;
}

/* ─── Exam card ───────────────────────────────────────────────────────────── */
.exam-card {
  background: var(--white, #fff);
  border: 1px solid var(--border, #e2edf4);
  border-radius: 14px;
  margin-bottom: 14px;
  overflow: hidden;
  display: flex;
  transition: box-shadow .15s, border-color .15s;
}
.exam-card:hover {
  border-color: color-mix(in srgb, var(--teal, #06b6d4) 40%, transparent);
  box-shadow: 0 2px 16px rgba(6,182,212,.08);
}

/* Left stripe */
.exam-card-stripe {
  width: 4px;
  flex-shrink: 0;
}
.stripe-new      { background: var(--teal, #06b6d4); }
.stripe-standard { background: var(--border, #e2edf4); }
.stripe-sponsored{ background: #7c3aed; }

/* Inner (everything after the stripe) */
.exam-card-inner {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* Top difficulty bar */
.exam-diff-bar {
  height: 3px;
  width: 100%;
  flex-shrink: 0;
}
.diff-easy  { background: var(--green, #16a34a); }
.diff-medium{ background: var(--amber, #d97706); }
.diff-hard  { background: var(--rose, #e11d48); }
.diff-expert{ background: var(--purple, #7c3aed); }
.diff-mixed { background: linear-gradient(90deg, var(--teal, #06b6d4), #7c3aed); }

/* Body */
.exam-body {
  padding: 14px 18px 16px;
}

/* ─── Card top: title col + creator ──────────────────────────────────────── */
.exam-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 8px;
}

.exam-title-row { flex: 1; min-width: 0; }

.exam-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--ink);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  line-height: 1.5;
}

.exam-sub {
  font-size: 0.68rem;
  color: var(--ink-dim);
  margin-top: 3px;
}

/* Creator */

.creator-avatar {
  background: linear-gradient(135deg, #0369a1, #06b6d4);
}
/* 

.exam-creator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.creator-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: .5px;
}

.creator-name {
  font-size: 0.63rem;
  font-weight: 600;
  color: var(--ink-dim);
  text-align: center;
  max-width: 80px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
*/

/* ─── Inline badges ───────────────────────────────────────────────────────── */
.exam-badge {
  font-size: 0.59rem;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 20px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
}
.badge-new      { background: color-mix(in srgb,var(--teal,#06b6d4) 14%,transparent); color: var(--teal,#06b6d4); }
.badge-easy     { background: color-mix(in srgb,var(--green,#16a34a) 14%,transparent); color: var(--green,#16a34a); }
.badge-medium   { background: color-mix(in srgb,var(--amber,#d97706) 14%,transparent); color: var(--amber,#d97706); }
.badge-hard     { background: color-mix(in srgb,var(--rose,#e11d48) 14%,transparent);  color: var(--rose,#e11d48); }
.badge-expert   { background: color-mix(in srgb,var(--purple,#7c3aed) 14%,transparent); color: var(--purple,#7c3aed); }
.badge-mixed    { background: color-mix(in srgb,var(--teal,#06b6d4) 14%,transparent);  color: var(--teal,#06b6d4); }
.badge-due       { background: color-mix(in srgb,var(--amber,#d97706) 14%,transparent); color: var(--amber,#d97706); }
.badge-scheduled  { background: color-mix(in srgb,#7c3aed 12%,transparent); color: #7c3aed; border-color: color-mix(in srgb,#7c3aed 25%,transparent); }
.badge-in-progress{ background: color-mix(in srgb,var(--amber,#d97706) 14%,transparent); color: var(--amber,#d97706); border: 1px solid color-mix(in srgb,var(--amber,#d97706) 28%,transparent); }

/* ─── Description ────────────────────────────────────────────────────────── */
.exam-desc {
  font-size: 0.72rem;
  color: var(--ink-dim);
  line-height: 1.55;
  margin-top: 6px;
  margin-bottom: 10px;
}

/* ─── Meta row ────────────────────────────────────────────────────────────── */
.exam-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.em-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.69rem;
  color: var(--ink-dim);
  font-weight: 500;
}
.em-item strong { color: var(--ink); font-weight: 700; }
.em-due { color: var(--amber, #d97706) !important; }

/* Attempts badge */
.attempts-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.67rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
}
.attempts-unlimited { background: color-mix(in srgb,var(--teal,#06b6d4) 14%,transparent); color: var(--teal,#06b6d4); }
.attempts-one       { background: color-mix(in srgb,var(--rose,#e11d48) 14%,transparent); color: var(--rose,#e11d48); }
.attempts-limited   { background: color-mix(in srgb,var(--amber,#d97706) 14%,transparent); color: var(--amber,#d97706); }
.attempts-none      { background: color-mix(in srgb,var(--ink-dim) 10%,transparent); color: var(--ink-dim); }

/* ─── Topics ─────────────────────────────────────────────────────────────── */
.exam-topics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.topic-tag {
  font-size: 0.64rem;
  font-weight: 500;
  color: var(--ink-dim);
  background: var(--surface, #f7fafc);
  border: 1px solid var(--border, #e2edf4);
  border-radius: 20px;
  padding: 3px 10px;
  white-space: nowrap;
}

/* ─── Actions ────────────────────────────────────────────────────────────── */
.exam-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.exam-actions-spacer { flex: 1; }

/* ─── Leaderboard peek ───────────────────────────────────────────────────── */
.leaderboard-peek {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.67rem;
  color: var(--ink-dim);
  font-weight: 500;
}

.leaderboard-avatars {
  display: flex;
}

.lb-av {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--white, #fff);
  color: #fff;
  font-size: 0.5rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: -6px;
  letter-spacing: 0;
}
.lb-av:first-child { margin-left: 0; }

.exhausted-msg {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.72rem;
  color: var(--ink-dim);
  font-weight: 500;
}

/* ─── Past attempts inset ────────────────────────────────────────────────── */
.past-attempts {
  border-top: 1px solid var(--border, #e2edf4);
  background: var(--surface, #f7fafc);
  padding: 12px 18px 14px 18px;
}

.pa-label {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .07em;
  color: var(--ink-dim);
  margin-bottom: 10px;
}

/* .pa-list { display: flex; flex-direction: column; gap: 0; } */

.pa-row {
  display: flex;
  align-items: center;
  gap: 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--border, #e2edf4) 70%, transparent);
}
/* 
.pa-row:last-child { border-bottom: none; }
 */

/* Score ring */

.pa-score-ring {
  position: relative;
  /* width: 52px;
  height: 52px; */
  flex-shrink: 0;
}
.pa-score-ring svg { display: block; }
.pa-ring-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pa-pct {
  font-size: 0.66rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
}

.pa-info { min-width: 0; }
.pa-date { font-size: 0.72rem; font-weight: 600; color: var(--ink); }
.pa-meta { font-size: 0.67rem; color: var(--ink-dim); margin-top: 2px; }

/* Right-side group: rank badge + separator + review */
.pa-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.pa-sep {
  width: 1px;
  height: 14px;
  background: var(--border, #e2edf4);
  flex-shrink: 0;
}

.pa-rank {
  font-size: 0.63rem;
  font-weight: 700;
  letter-spacing: .02em;
  padding: 3px 10px;
  border-radius: 20px;
  border: 1px solid transparent;
  white-space: nowrap;
  flex-shrink: 0;
}
.pa-rank-good {
  color: var(--green, #16a34a);
  background: color-mix(in srgb, var(--green, #16a34a) 10%, transparent);
  border-color: color-mix(in srgb, var(--green, #16a34a) 28%, transparent);
}
.pa-rank-bad {
  color: var(--rose, #e11d48);
  background: color-mix(in srgb, var(--rose, #e11d48) 8%, transparent);
  border-color: color-mix(in srgb, var(--rose, #e11d48) 30%, transparent);
}

.pa-actions { flex-shrink: 0; }
/*
.pa-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  font-weight: 500;
  color: var(--ink-dim, #64748b);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: color .12s;
  font-family: inherit;
}
.pa-btn:hover {
  color: var(--teal, #06b6d4);
}*/

/* ─── Pending attempt row ────────────────────────────────────────────────── */
.pa-row-pending {
  opacity: 0.75;
}
.pa-pending-icon {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pa-rank-pending {
  color: var(--amber, #d97706);
  background: color-mix(in srgb, var(--amber, #d97706) 10%, transparent);
  border-color: color-mix(in srgb, var(--amber, #d97706) 28%, transparent);
}

/* ─── Results pending ────────────────────────────────────────────────────── */
.results-pending {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--amber, #d97706) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--amber, #d97706) 25%, transparent);
  border-radius: 8px;
  color: var(--ink-dim, #64748b);
}
.results-pending-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--amber, #d97706);
  margin-bottom: 2px;
}
.results-pending-sub {
  font-size: 0.72rem;
  color: var(--ink-dim, #64748b);
  line-height: 1.4;
}

/* ─── Empty state ────────────────────────────────────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 56px 24px;
  color: var(--ink-dim);
  text-align: center;
}
.empty-state p { font-size: 0.85rem; margin: 0; }

/* ─── Fade-in ────────────────────────────────────────────────────────────── */
.fi { opacity: 0; animation: fadeIn .35s ease forwards; }
.d1 { animation-delay: .04s }
.d2 { animation-delay: .08s }
.d3 { animation-delay: .12s }
.d4 { animation-delay: .16s }
.d5 { animation-delay: .20s }
.d6 { animation-delay: .24s }
.d7 { animation-delay: .28s }
.d8 { animation-delay: .32s }
@keyframes fadeIn { to { opacity: 1 } }

/* ─── Button overrides for exam actions ───────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 7px 16px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2edf4);
  background: var(--white, #fff);
  color: var(--ink-dim);
  cursor: pointer;
  font-family: inherit;
  transition: border-color .12s, color .12s, background .12s;
}
.btn:hover {
  border-color: color-mix(in srgb, var(--teal, #06b6d4) 40%, transparent);
  color: var(--ink);
}
.btn:disabled { opacity: .55; cursor: default; }

.btn-primary {
  background: var(--teal, #06b6d4);
  color: #fff;
  border-color: var(--teal, #06b6d4);
}
.btn-primary:hover {
  background: color-mix(in srgb, var(--teal, #06b6d4) 85%, #000);
  border-color: color-mix(in srgb, var(--teal, #06b6d4) 85%, #000);
  color: #fff;
}
.btn-primary:disabled {
  background: var(--teal, #06b6d4);
  border-color: var(--teal, #06b6d4);
  color: #fff;
}
.btn-ghost {
  background: transparent;
  color: var(--ink-dim, #64748b);
  border-color: var(--border, #e2edf4);
}
.btn-ghost:hover {
  border-color: var(--teal, #06b6d4);
  color: var(--teal, #06b6d4);
}
/* Resume state — amber color */
.btn-resume,
.btn-resume:hover {
  background: var(--amber, #d97706) !important;
  border-color: var(--amber, #d97706) !important;
  color: #fff !important;
}

/* Expired / past-due state overrides btn-primary disabled style */
.btn-expired,
.btn-expired:disabled {
  background: var(--surface, #f0f7ff) !important;
  border-color: var(--border, #e2edf4) !important;
  color: var(--ink-dim, #64748b) !important;
  cursor: not-allowed !important;
  opacity: 1 !important;
}

/* ─── Leaderboard modal ─────────────────────────────────────────────────── */
.lb-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
  padding: 16px;
}
.lb-modal {
  background: var(--white, #fff);
  border-radius: 16px;
  width: 100%;
  max-width: 520px;
  box-shadow: 0 24px 64px rgba(0,0,0,.18);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.lb-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 20px 0;
}
.lb-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink, #0f1e2d);
  line-height: 1.3;
}
.lb-subtitle {
  font-size: 0.73rem;
  color: var(--ink-dim, #64748b);
  margin-top: 2px;
}
.lb-close {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ink-dim, #64748b);
  padding: 4px;
  border-radius: 6px;
  display: flex;
  transition: color .12s, background .12s;
}
.lb-close:hover {
  color: var(--ink, #0f1e2d);
  background: var(--surface, #f0f7ff);
}
.lb-my-score {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 14px 20px;
  background: color-mix(in srgb, var(--teal, #06b6d4) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--teal, #06b6d4) 22%, transparent);
  border-radius: 10px;
  padding: 12px 16px;
}
.lb-my-score-left {
  flex-shrink: 0;
  width: 36px;
  text-align: center;
}
.lb-my-score-val {
  font-size: 1.2rem;
  font-weight: 800;
}
.lb-my-score-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ink, #0f1e2d);
}
.lb-my-score-sub {
  font-size: 0.69rem;
  color: var(--ink-dim, #64748b);
  margin-top: 2px;
}
.lb-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: center;
  padding: 28px;
  color: var(--ink-dim, #64748b);
  font-size: 0.82rem;
}
.lb-spinner {
  width: 18px;
  height: 18px;
  border: 2.5px solid var(--border, #e2edf4);
  border-top-color: var(--teal, #06b6d4);
  border-radius: 50%;
  animation: lbSpin .7s linear infinite;
}
@keyframes lbSpin { to { transform: rotate(360deg) } }
.lb-empty {
  text-align: center;
  padding: 28px;
  color: var(--ink-dim, #64748b);
  font-size: 0.82rem;
}
.lb-manual-block {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 16px 20px 20px;
  padding: 14px 16px;
  background: color-mix(in srgb, var(--amber, #d97706) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--amber, #d97706) 25%, transparent);
  border-radius: 10px;
  color: var(--ink-dim, #64748b);
}
.lb-manual-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--amber, #d97706);
  margin-bottom: 3px;
}
.lb-manual-sub {
  font-size: 0.73rem;
  color: var(--ink-dim, #64748b);
  line-height: 1.45;
}
.lb-table {
  overflow-y: auto;
  max-height: 360px;
  padding: 0 0 16px;
}
.lb-thead {
  display: grid;
  grid-template-columns: 36px 1fr 54px 80px;
  gap: 0;
  padding: 6px 20px;
  font-size: 0.63rem;
  font-weight: 700;
  letter-spacing: .06em;
  color: var(--ink-dim, #64748b);
  text-transform: uppercase;
  border-bottom: 1px solid var(--border, #e2edf4);
}
.lb-row {
  display: grid;
  grid-template-columns: 36px 1fr 54px 80px;
  gap: 0;
  padding: 9px 20px;
  align-items: center;
  border-bottom: 1px solid color-mix(in srgb, var(--border, #e2edf4) 60%, transparent);
  transition: background .1s;
}
.lb-row:hover { background: var(--surface, #f0f7ff); }
.lb-row:last-child { border-bottom: none; }
.lb-rank-num {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ink-dim, #64748b);
}
/* Gold / silver / bronze medal disc for the top-3 ranks. */
.lb-medal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 0.72rem;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.28);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.45);
}
.lb-medal-1 { background: linear-gradient(145deg, #fde68a 0%, #f59e0b 55%, #b45309 100%); }
.lb-medal-2 { background: linear-gradient(145deg, #f1f5f9 0%, #cbd5e1 55%, #94a3b8 100%); }
.lb-medal-3 { background: linear-gradient(145deg, #e8b98a 0%, #cd7f32 55%, #8b5a2b 100%); }
.lb-pctl { color: var(--brand, #0891b2); font-weight: 700; }
.lb-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.lb-av-md {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.62rem;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.lb-name-text {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--ink, #0f1e2d);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
.lb-attempt-tag {
  font-size: 0.62rem;
  font-weight: 600;
  color: var(--ink-dim, #64748b);
  margin-top: 1px;
  display: block;
}
.lb-row-me {
  background: color-mix(in srgb, var(--primary, #2563eb) 6%, transparent);
  border-radius: 8px;
}
.lb-rank-me {
  color: var(--primary, #2563eb) !important;
  font-weight: 700;
}
.lb-score-val {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--ink, #0f1e2d);
}
.lb-bar-cell {
  padding-right: 4px;
}
.lb-bar-track {
  height: 6px;
  background: var(--border, #e2edf4);
  border-radius: 3px;
  overflow: hidden;
}
.lb-bar-fill {
  height: 100%;
  background: var(--teal, #06b6d4);
  border-radius: 3px;
  transition: width .4s ease;
}

/* Transition */
.lb-fade-enter-active, .lb-fade-leave-active { transition: opacity .2s, transform .2s; }
.lb-fade-enter-from, .lb-fade-leave-to { opacity: 0; transform: scale(.96); }
.mock-toast {
  position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: 10px;
  padding: 12px 22px; border-radius: 999px;
  font-size: 0.85rem; font-weight: 600; letter-spacing: 0.2px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25);
  z-index: 9999; pointer-events: none; max-width: 90vw;
}
.mock-toast--ok  { background: #0f172a; color: #fff; }
.mock-toast--ok svg { color: #22d3ee; }
.mock-toast--err { background: #991b1b; color: #fff; }
.toast-enter-active, .toast-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 12px); }
.extra-time-badge {
  background: var(--teal-light, #ccfbf1);
  color: var(--teal-dark, #0f766e);
  border: 1px solid var(--teal-border, #5eead4);
}

/* Full-screen "Starting your exam…" launching indicator. */
.launch-overlay {
  position: fixed;
  inset: 0;
  z-index: 400;
  background: rgba(15, 31, 46, 0.55);
  backdrop-filter: blur(3px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}
.launch-spinner {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  animation: launch-spin 0.7s linear infinite;
}
@keyframes launch-spin { to { transform: rotate(360deg); } }
.launch-text {
  color: #fff;
  font-family: 'Figtree', sans-serif;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: 0.2px;
}
.lo-fade-enter-active, .lo-fade-leave-active { transition: opacity 0.18s ease; }
.lo-fade-enter-from, .lo-fade-leave-to { opacity: 0; }
</style>