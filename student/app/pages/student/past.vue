<script setup lang="ts">
definePageMeta({ layout: 'student' })
useHead({ title: 'Past Sessions · Passmed' })

interface Question { n: number; topic: string; result: 'correct' | 'incorrect' | 'skipped'; t: string }
interface Session {
  id: number; date: string; time: string; mode: 'tutor' | 'timed'; status: string
  score: number; total: number; correct: number; incorrect: number; skipped: number
  duration: string; topics: string[]; questions: Question[]
}

// ─── API wiring ────────────────────────────────────────────────────────────
// GET /api-student/v1/sessions?exam_id=<id>
// Sessions are scoped to the currently-active exam — when the user switches
// active exam from the sidebar, the list refetches with the new exam_id so
// stale sessions from a different exam disappear.
const { activeExam, examSwitching } = useExam()

// Subtitle pulled from the active exam (mirrors flagged.vue) — was previously
const sessions    = ref<Session[]>([])
const loadingList = ref(true)
const loadError   = ref('')

// Map a single API session row to the UI shape. `exam` relation is loaded
// with `id,name` columns by the controller's index() — the Exam model has
// a `name` field (confirmed via StudentExam->examrow definition).
function mapApiSession(s: any): Session {
  const started  = new Date(s.started_at)
  const elapsed  = s.elapsed_seconds || 0
  const mins     = Math.max(1, Math.round(elapsed / 60))
  const total    = s.question_count || 0
  const correct  = s.score_correct || 0
  const incorrect= s.score_incorrect || 0
  const skipped  = s.score_skipped || 0
  const score    = total > 0 ? Math.round((correct / total) * 100) : 0
  const name     = s.exam?.name || ''
  return {
    id: s.id, status: s.status, mode: s.mode,
    date: started.toISOString().slice(0, 10),
    time: started.toTimeString().slice(0, 5),
    score, total, correct, incorrect, skipped,
    duration: `${mins} min`,
    topics: name ? [name] : [],
    questions: [],   // detail list is fetched lazily from /sessions/{id} on Review
  }
}

async function loadSessions() {
  const examId = activeExam.value?.examId
  if (!examId) {
    // No active exam yet — keep skeleton until useExam resolves.
    return
  }
  loadingList.value = true
  loadError.value   = ''
  // Clear out the previous exam's sessions immediately — otherwise the
  // date-group v-for keeps rendering them under the skeleton while the new
  // exam's request is in flight.
  sessions.value    = []
  try {
    const studentApi = useStudentApi()
    const res: any = await studentApi('/sessions', {
      params: { exam_id: Number(examId) },
    })
    sessions.value = (res?.data ?? []).map(mapApiSession)
  } catch (e: any) {
    loadError.value = e?.data?.msg || e?.message || 'Failed to load past sessions.'
    sessions.value = []
  } finally {
    loadingList.value   = false
    examSwitching.value = false   // clear sidebar-set flag after our fetch
  }
}

onMounted(loadSessions)

// Refetch the list whenever the user switches active exam in the sidebar.
watch(() => activeExam.value?.examId, (newId, oldId) => {
  if (newId && newId !== oldId) loadSessions()
})

// ─── Redo (true replay) ─────────────────────────────────────────────────
// POST /sessions/{id}/redo clones the original question set into a fresh
// session (no answers / no flags), then we jump straight into the runner.
// Replaces the old Redo link that dumped the user on a blank qbank builder.
const redoingId = ref<number | null>(null)
const redoError = ref('')

async function redoSession(s: Session) {
  if (redoingId.value !== null) return
  redoingId.value = s.id
  redoError.value = ''
  try {
    const studentApi = useStudentApi()
    const res: any = await studentApi(`/sessions/${s.id}/redo`, { method: 'POST' })
    const newId = res?.session_id
    if (!newId) throw new Error('No session id returned')
    const mode  = res?.mode || s.mode
    const count = res?.question_count
    await navigateTo({
      path: mode === 'timed' ? '/student/timed' : '/student/tutor',
      query: {
        session: String(newId),
        count:   count != null ? String(count) : undefined,
        mode,
      },
    })
  } catch (e: any) {
    redoError.value = e?.data?.msg || e?.message || 'Could not start a replay. Please try again.'
    redoingId.value = null
    setTimeout(() => { redoError.value = '' }, 4000)
  }
}

// Filter state
const modeFilters  = ref(new Set(['tutor','timed']))
const scoreFilters = ref(new Set(['high','mid','low']))
const openCards    = ref(new Set<number>())

function toggleModeFilter(m: string) {
  if (modeFilters.value.has(m)) modeFilters.value.delete(m)
  else modeFilters.value.add(m)
  modeFilters.value = new Set(modeFilters.value)
}

function toggleScoreFilter(s: string) {
  if (scoreFilters.value.has(s)) scoreFilters.value.delete(s)
  else scoreFilters.value.add(s)
  scoreFilters.value = new Set(scoreFilters.value)
}

function scoreGroup(s: number) {
  if (s >= 70) return 'high'
  if (s >= 50) return 'mid'
  return 'low'
}

function scoreColor(s: number) {
  if (s >= 70) return 'var(--green)'
  if (s >= 50) return 'var(--amber)'
  return 'var(--rose)'
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
}

function groupLabel(d: string) {
  // Group sessions relative to *today* (browser's local date), not a hardcoded
  // demo date. So "Today" actually means today, "Yesterday" actually yesterday.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date  = new Date(d)
  date.setHours(0, 0, 0, 0)
  const diff  = Math.floor((today.getTime() - date.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7)  return 'This Week'
  if (diff < 14) return 'Last Week'
  return date.toLocaleDateString('en-GB', { month:'long', year:'numeric' })
}

function ringOffset(score: number) {
  const r = 18, circ = 2 * Math.PI * r
  return circ - (score / 100) * circ
}

const filtered = computed(() =>
  sessions.value.filter(s =>
    modeFilters.value.has(s.mode) && scoreFilters.value.has(scoreGroup(s.score))
  )
)

const grouped = computed(() => {
  const groups: Record<string, Session[]> = {}
  filtered.value.forEach(s => {
    const lbl = groupLabel(s.date)
    if (!groups[lbl]) groups[lbl] = []
    groups[lbl].push(s)
  })
  return groups
})

const stats = computed(() => {
  const f = filtered.value
  const totalQ = f.reduce((a, s) => a + s.total, 0)
  const avgSc  = f.length ? Math.round(f.reduce((a, s) => a + s.score, 0) / f.length) : 0
  const totalMins = f.reduce((a, s) => a + parseInt(s.duration), 0)
  const timeStr = totalMins >= 60 ? `${Math.round(totalMins/60)}h ${totalMins%60}m` : `${totalMins}m`
  return { count: f.length, totalQ, avgSc: f.length ? avgSc + '%' : '—', time: timeStr }
})

// Per-card loading flag — driven by toggleCard so the breakdown shows a
// "Loading…" message while /sessions/{id} is in flight.
const loadingDetails = ref<Set<number>>(new Set())

// Hit /sessions/{id} once per card (on first expand) and stash the question
// list back into `sessions.value[<that one>].questions` so the breakdown
// renders without re-fetching on every collapse/expand.
async function loadSessionDetail(id: number) {
  // Skip if we've already loaded this session's questions.
  const idx = sessions.value.findIndex(s => s.id === id)
  if (idx === -1) return
  if (sessions.value[idx].questions.length > 0) return

  loadingDetails.value.add(id)
  loadingDetails.value = new Set(loadingDetails.value)

  try {
    const studentApi = useStudentApi()
    const res: any = await studentApi(`/sessions/${id}`)
    const data = res?.data
    if (!data) return

    // Backend relation: session_questions (HasMany) → question (BelongsTo).
    // Each row has chosen_answer / result / q_time_spent + the joined
    // question (with topic, difficulty, stem). We only need a compact
    // shape here for the breakdown row.
    // Only show rows the user actually engaged with (correct / incorrect /
    // skipped). When the user does Save & Exit mid-session, the remaining
    // un-touched questions are still in the DB (with NULL result) — but
    // those don't belong in the breakdown view.
    const allRows: any[] = data.session_questions || data.questions || []
    const rows = allRows.filter((row: any) =>
      row.result === 'correct'
      || row.result === 'incorrect'
      || row.result === 'skipped'
    )
    const mapped = rows.map((row: any, i: number) => {
      const q = row.question || {}

      // Breakdown row label — ONLY use the snapshotted `chosen_option_text`
      // (what the user actually picked). If the user skipped without picking
      // anything, this is null → show "—". We deliberately don't fall back
      // to correct_option_text / topic / stem because a skipped row should
      // visually communicate "you didn't choose", not leak the right answer.
      const truncate = (s: string, n = 80) =>
        s && s.length > n ? s.slice(0, n).trim() + '…' : s
      const topic = truncate(row.chosen_option_text || '', 80) || '—'

      const secs = row.q_time_spent || 0
      const time = row.result === 'skipped'
        ? '—'
        : (secs > 0
            ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
            : '0:00')

      return {
        n: (row.position ?? i) + 1,
        topic,
        result: (row.result || 'skipped') as 'correct' | 'incorrect' | 'skipped',
        t: time,
      }
    })

    // Update the specific session in-place without losing reactivity.
    sessions.value[idx] = { ...sessions.value[idx], questions: mapped }
    sessions.value = [...sessions.value]
  } catch (e) {
    log.warn('past', 'loadSessionDetail failed', e)
  } finally {
    loadingDetails.value.delete(id)
    loadingDetails.value = new Set(loadingDetails.value)
  }
}

function toggleCard(id: number) {
  const opening = !openCards.value.has(id)
  if (openCards.value.has(id)) openCards.value.delete(id)
  else openCards.value.add(id)
  openCards.value = new Set(openCards.value)
  // Lazy-fetch the breakdown only on FIRST open. Subsequent toggles reuse
  // the in-memory copy.
  if (opening) loadSessionDetail(id)
}
</script>

<template>
  <!-- Topbar swaps to a shimmer band while sessions load so the whole page
       reads as one unified skeleton (matches user expectation that the
       *entire* page placeholder while data fetches). -->
  <div v-if="loadingList || examSwitching" class="sk-topbar">
    <div class="sk-pulse" style="width:140px;height:18px;border-radius:4px"></div>
    <div class="sk-pulse" style="width:220px;height:11px;border-radius:4px;margin-top:6px"></div>
  </div>
  <StudentTopbar v-else title="Past Sessions" />

  <div class="content">

    <!-- HEADER (real OR skeleton) -->
    <template v-if="loadingList || examSwitching">
      <!-- Skeleton header — mirrors page-header + 4 stat blocks. -->
      <div class="page-header fi d1">
        <div>
          <div class="sk-pulse" style="width:210px;height:24px;border-radius:6px"></div>
          <div class="sk-pulse" style="width:280px;height:11px;border-radius:4px;margin-top:8px"></div>
        </div>
        <div class="header-stats">
          <div v-for="i in 4" :key="`sk-h-${i}`" class="hstat">
            <div class="sk-pulse" style="width:48px;height:22px;border-radius:6px"></div>
            <div class="sk-pulse" style="width:60px;height:10px;border-radius:4px;margin-top:6px"></div>
          </div>
        </div>
      </div>
      <!-- Skeleton filters -->
      <div class="filters-bar fi d2">
        <div class="sk-pulse" style="width:38px;height:10px;border-radius:4px"></div>
        <div class="sk-pulse" style="width:72px;height:26px;border-radius:14px"></div>
        <div class="sk-pulse" style="width:72px;height:26px;border-radius:14px"></div>
        <div class="filters-sep"></div>
        <div class="sk-pulse" style="width:38px;height:10px;border-radius:4px"></div>
        <div class="sk-pulse" style="width:60px;height:26px;border-radius:14px"></div>
        <div class="sk-pulse" style="width:74px;height:26px;border-radius:14px"></div>
        <div class="sk-pulse" style="width:60px;height:26px;border-radius:14px"></div>
      </div>
    </template>
    <template v-else>
      <!-- HEADER -->
      <div class="page-header fi d1">
        <div>
          <div class="page-title">Session History</div>
          <div class="page-sub">All completed sessions, most recent first</div>
        </div>
        <div class="header-stats">
          <div class="hstat"><span class="hstat-val">{{ stats.count }}</span><span class="hstat-lbl">Sessions</span></div>
          <div class="hstat"><span class="hstat-val">{{ stats.totalQ.toLocaleString() }}</span><span class="hstat-lbl">Questions</span></div>
          <div class="hstat"><span class="hstat-val" style="color:var(--teal)">{{ stats.avgSc }}</span><span class="hstat-lbl">Avg score</span></div>
          <div class="hstat"><span class="hstat-val">{{ stats.time }}</span><span class="hstat-lbl">Time spent</span></div>
        </div>
      </div>

      <!-- FILTERS -->
      <div class="filters-bar fi d2">
        <span class="filter-label">Mode</span>
        <button type="button" class="filter-chip tutor" :class="{ on: modeFilters.has('tutor') }" @click="toggleModeFilter('tutor')" :aria-pressed="modeFilters.has('tutor')">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Tutor
        </button>
        <button type="button" class="filter-chip timed" :class="{ on: modeFilters.has('timed') }" @click="toggleModeFilter('timed')" :aria-pressed="modeFilters.has('timed')">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Timed
        </button>
        <div class="filters-sep"></div>
        <span class="filter-label">Score</span>
        <button type="button" class="filter-chip" :class="{ on: scoreFilters.has('high') }" @click="toggleScoreFilter('high')" :aria-pressed="scoreFilters.has('high')">
          <span style="color:var(--green);font-size:0.65rem">●</span> ≥ 70%
        </button>
        <button type="button" class="filter-chip" :class="{ on: scoreFilters.has('mid') }" @click="toggleScoreFilter('mid')" :aria-pressed="scoreFilters.has('mid')">
          <span style="color:var(--amber);font-size:0.65rem">●</span> 50–69%
        </button>
        <button type="button" class="filter-chip" :class="{ on: scoreFilters.has('low') }" @click="toggleScoreFilter('low')" :aria-pressed="scoreFilters.has('low')">
          <span style="color:var(--rose);font-size:0.65rem">●</span> &lt; 50%
        </button>
      </div>
    </template>

    <!-- LOADING / ERROR / EMPTY -->
    <!-- Skeleton: 4 placeholder cards mirroring the real session-card layout. -->
    <template v-if="loadingList || examSwitching">
      <div v-for="i in 4" :key="`sk-${i}`" class="session-card sk-card">
        <div class="session-main">
          <div class="session-accent sk-pulse"></div>
          <div class="session-body">
            <div class="score-ring sk-pulse" style="background:var(--surface-2);border-radius:50%"></div>
            <div class="session-info" style="flex:1">
              <div class="sk-line sk-pulse" style="width:60%;height:14px"></div>
              <div class="sk-line sk-pulse" style="width:40%;height:10px;margin-top:8px"></div>
              <div style="display:flex;gap:14px;margin-top:8px">
                <div class="sk-line sk-pulse" style="width:60px;height:10px"></div>
                <div class="sk-line sk-pulse" style="width:60px;height:10px"></div>
                <div class="sk-line sk-pulse" style="width:60px;height:10px"></div>
              </div>
            </div>
          </div>
          <div class="session-actions" style="display:flex;gap:6px">
            <div class="sk-pulse" style="width:64px;height:28px;border-radius:6px"></div>
            <div class="sk-pulse" style="width:64px;height:28px;border-radius:6px"></div>
          </div>
        </div>
        <div class="session-bar-wrap"><div class="sk-line sk-pulse" style="width:100%;height:6px"></div></div>
      </div>
    </template>
    <div v-else-if="loadError" class="empty-state fi d3" style="color:var(--rose)">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p>{{ loadError }}</p>
    </div>
    <div v-else-if="filtered.length === 0" class="empty-state fi d3">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <!-- Distinguish "exam has no sessions yet" from "filters hid them all".
           sessions.value is the raw API list; filtered.value applies the chip
           filters on top. -->
      <p v-if="sessions.length === 0">
        No sessions yet for <strong>{{ activeExam.name }}</strong>.
        Start one from the Question Bank.
      </p>
      <p v-else>No sessions match the current filters.</p>
    </div>

    <!-- SESSION GROUPS — hidden while loading so the skeleton above is the
         only thing visible during an active-exam switch. (sessions.value is
         also cleared in loadSessions, but this guard is belt-and-suspenders
         in case the API responds before Vue re-renders the skeleton.) -->
    <template v-if="!loadingList && !examSwitching">
    <template v-for="(group, label, gi) in grouped" :key="label">
      <div class="date-group fi" :class="`d${gi + 2}`">
        <div class="date-group-label">{{ label }}</div>

        <div v-for="s in group" :key="s.id" class="session-card">
          <!-- MAIN ROW -->
          <button type="button" class="session-main" @click="toggleCard(s.id)" :aria-expanded="openCards.has(s.id)">
            <div class="session-accent" :class="s.mode === 'tutor' ? 'accent-tutor' : 'accent-timed'"></div>
            <div class="session-body">
              <!-- Score Ring -->
              <div class="score-ring">
                <svg viewBox="0 0 44 44">
                  <circle class="score-ring-track" cx="22" cy="22" r="18"/>
                  <circle class="score-ring-fill" cx="22" cy="22" r="18"
                    :stroke="scoreColor(s.score)"
                    :stroke-dasharray="2 * Math.PI * 18"
                    :stroke-dashoffset="ringOffset(s.score)"/>
                </svg>
                <div class="score-ring-label">
                  <span class="score-ring-pct" :style="{ color: scoreColor(s.score), fontSize: '0.82rem' }">{{ s.score }}%</span>
                </div>
              </div>
              <!-- Info -->
              <div class="session-info">
                <div class="session-top">
                  <span class="session-title">{{ formatDate(s.date) }} at {{ s.time }}</span>
                  <span class="mode-tag" :class="s.mode === 'tutor' ? 'mode-tag-tutor' : 'mode-tag-timed'">
                    {{ s.mode === 'tutor' ? 'Tutor' : 'Timed' }}
                  </span>
                </div>
                <div class="session-topics">{{ s.topics.join(', ') }}</div>
                <div class="session-meta">
                  <div class="sm-item">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    <strong>{{ s.total }}</strong>&nbsp;questions
                  </div>
                  <div class="sm-item">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <strong style="color:var(--green)">{{ s.correct }}</strong>&nbsp;correct
                  </div>
                  <div class="sm-item">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    <strong style="color:var(--rose)">{{ s.incorrect }}</strong>&nbsp;incorrect
                  </div>
                  <div class="sm-item">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <strong>{{ s.duration }}</strong>
                  </div>
                </div>
              </div>
            </div>
            <div class="session-actions">
              <!-- In-progress: show Resume jumping back into the runner. -->
              <NuxtLink v-if="s.status === 'in_progress'"
                        :to="`/student/${s.mode}?session=${s.id}`"
                        class="sa-btn sa-btn-primary" @click.stop>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Resume
              </NuxtLink>
              <button v-else type="button" class="sa-btn sa-btn-primary"
                      :disabled="redoingId === s.id"
                      :style="redoingId === s.id ? 'opacity:0.65;cursor:default' : ''"
                      @click.stop="redoSession(s)">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 .49-4.44"/></svg>
                {{ redoingId === s.id ? 'Starting…' : 'Redo' }}
              </button>
              <NuxtLink v-if="s.status !== 'in_progress'"
                        :to="`/student/review/${s.id}`" class="sa-btn" @click.stop>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Review
              </NuxtLink>
            </div>
          </button>

          <!-- PROGRESS BAR -->
          <div class="session-bar-wrap">
            <div class="bar-track">
              <div class="bar-correct"   :style="{ width: (s.correct/s.total*100).toFixed(1) + '%' }"></div>
              <div class="bar-incorrect" :style="{ width: (s.incorrect/s.total*100).toFixed(1) + '%' }"></div>
              <div class="bar-skipped"   :style="{ width: (s.skipped/s.total*100).toFixed(1) + '%' }"></div>
            </div>
          </div>

          <!-- BREAKDOWN — populated lazily by loadSessionDetail() on first
               expand. Shows shimmer skeleton rows while the API is in flight. -->
          <div class="breakdown" :class="{ open: openCards.has(s.id) }">
            <div class="breakdown-title">
              Question Breakdown
              <span style="font-weight:500;text-transform:none;letter-spacing:0;color:var(--ink-dim);font-size:0.67rem;margin-left:6px">
                <template v-if="loadingDetails.has(s.id)">— loading…</template>
                <template v-else-if="s.questions.length">— {{ s.questions.length }} shown of {{ s.total }}</template>
                <template v-else>— no question data</template>
              </span>
            </div>
            <!-- Skeleton rows while loading -->
            <div v-if="loadingDetails.has(s.id)" class="qlist">
              <div v-for="i in Math.min(5, s.total || 5)" :key="`sk-${s.id}-${i}`" class="q-row">
                <span class="q-num sk-pulse" style="width:18px;height:10px;display:inline-block;border-radius:3px"></span>
                <div class="q-status-dot sk-pulse"></div>
                <span class="q-topic sk-pulse" style="width:60%;height:10px;display:inline-block;border-radius:3px"></span>
                <span class="q-time sk-pulse" style="width:36px;height:10px;display:inline-block;border-radius:3px"></span>
                <span class="q-result sk-pulse" style="width:60px;height:14px;display:inline-block;border-radius:8px"></span>
              </div>
            </div>
            <!-- Real list once loaded -->
            <div v-else class="qlist">
              <div v-for="q in s.questions" :key="q.n" class="q-row">
                <span class="q-num">{{ String(q.n).padStart(2,'0') }}</span>
                <div class="q-status-dot" :class="`q-dot-${q.result}`"></div>
                <span class="q-topic">{{ q.topic }}</span>
                <span class="q-time">{{ q.t }}</span>
                <span class="q-result" :class="`q-result-${q.result}`">
                  {{ q.result.charAt(0).toUpperCase() + q.result.slice(1) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    </template><!-- /v-if !loadingList -->

  </div>
    <!-- Redo failure toast (replay couldn't be created) -->
    <Transition name="rt-fade">
      <div v-if="redoError" class="redo-toast">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {{ redoError }}
      </div>
    </Transition>
</template>

<style scoped>
/* ── Skeleton loaders ─────────────────────────────────────────────────────
   Pulse animation works against surface-2 background so it reads as "shimmer"
   in both light and dark mode without hard-coded colors. */
.sk-topbar {
  padding: 18px 24px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  background: var(--white, #fff);
}
.sk-card { pointer-events: none; opacity: 0.85; }
.sk-line { background: var(--surface-2, #e5e7eb); border-radius: 4px; display: block; }
.sk-pulse {
  background: var(--surface-2, #e5e7eb);
  animation: skPulse 1.2s ease-in-out infinite;
}
@keyframes skPulse {
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 0.5;  }
}

/* ── Redo failure toast ── */
.redo-toast {
  position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px;
  background: var(--rose); color: #fff;
  padding: 10px 16px; border-radius: 9px;
  font-size: 0.8rem; font-weight: 700;
  box-shadow: 0 6px 22px rgba(0,0,0,0.18); z-index: 9999;
}
.redo-toast svg { flex-shrink: 0; }
.rt-fade-enter-active, .rt-fade-leave-active { transition: opacity 0.25s, transform 0.25s; }
.rt-fade-enter-from, .rt-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
</style>
