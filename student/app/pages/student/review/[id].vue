<script setup lang="ts">
// Session Review page — mirrors the static HTML mockup at
// Student-Postal.html (#portal-review). All class names are intentionally
// kept identical so the existing student.css review styles apply unchanged.
//
// Route: /student/review/:id  — :id matches Session.id from past.vue

definePageMeta({ layout: 'student' })
useHead({ title: 'Session Review · Passmed' })

const { openMobile } = useSidebar()
const { toggle: toggleDark } = useDarkMode()

interface ReviewOption {
  letter: string
  text: string
  correct: boolean
  userSelected: boolean
}

interface ReviewQuestion {
  n: number
  questionId?: number           // underlying questions.id — needed for the
                                // flag-toggle PATCH back to the session row.
  result: 'correct' | 'incorrect' | 'skipped'
  topic: string
  difficulty: string
  time: string
  text: string                  // vignette / question stem (may contain <em>)
  options: ReviewOption[]
  explanation: string           // HTML allowed
}

interface ReviewSession {
  id: number
  date: string                  // 'YYYY-MM-DD'
  time: string                  // 'HH:MM'
  mode: 'tutor' | 'timed'
  score: number
  total: number
  correct: number
  incorrect: number
  skipped: number
  duration: string              // '34 min'
  avgPerQ: string               // '51s'
  topics: string[]
  questions: ReviewQuestion[]
}

// ─── Route resolution + API load ───────────────────────────────────────────
const route = useRoute()
const sessionId = computed(() => Number(route.params.id))

// Raw API session (loaded on mount). Mapped into ReviewSession via `session`.
const apiSession   = ref<any>(null)
const loadingReview = ref(true)
const reviewError   = ref('')

onMounted(async () => {
  try {
    const studentApi = useStudentApi()
    const res: any = await studentApi(`/sessions/${sessionId.value}`)
    apiSession.value = res?.data ?? null
  } catch (e: any) {
    reviewError.value = e?.data?.msg || e?.message || 'Failed to load session.'
  } finally {
    loadingReview.value = false
  }
})

// Convert a single API question row to the ReviewQuestion shape the template
// already expects. Question.question_options is the nested options array; the
// chosen_answer letter (A/B/C/D/E) marks userSelected.
function mapApiQ(row: any, idx: number): ReviewQuestion {
  const q       = row.question || {}
  const rawOpts = q.question_options || q.questionOptions || []
  const options: ReviewOption[] = rawOpts.map((o: any, i: number) => {
    const letter = String.fromCharCode(65 + i)
    const isCorrect = o.is_correct === true || String(o.is_correct).toLowerCase() === 'true'
    return {
      letter,
      text: o.option_text || '',
      correct: isCorrect,
      userSelected: row.chosen_answer === letter,
    }
  })
  const secs = row.q_time_spent || 0
  const time = secs > 0
    ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
    : (row.result === 'skipped' ? '—' : '0:00')
  // Topic display — Question has nested `category` / `topic` relations.
  // Each returns { id, name, slug } (or null if not joined). String fallback
  // handles older flat fields and missing relations.
  const topic =
    (typeof q.topic === 'object' && q.topic?.name) ||
    (typeof q.category === 'object' && q.category?.name) ||
    (typeof q.topic === 'string' ? q.topic : '') ||
    (typeof q.category === 'string' ? q.category : '') ||
    '—'

  return {
    n: idx + 1,
    questionId: Number(row.question_id ?? q.id ?? 0) || undefined,
    result: (row.result || 'skipped') as 'correct' | 'incorrect' | 'skipped',
    topic,
    difficulty: String(q.difficulty || 'intermediate'),
    time,
    text: q.question_stem || q.stem || '',
    img: q.question_image_ids || '',
    options,
    explanation: q.explanation || '',
  }
}

// Build the ReviewSession the template renders. Falls back to mock if the
// API hasn't loaded yet (so SSR/template doesn't blow up on empty state).
const session = computed<ReviewSession | null>(() => {
  const s = apiSession.value
  if (!s) return null
  const started = s.started_at ? new Date(s.started_at) : new Date()
  const total      = s.question_count || 0
  const correct    = s.score_correct || 0
  const incorrect  = s.score_incorrect || 0
  const skipped    = s.score_skipped || 0
  const score      = total > 0 ? Math.round((correct / total) * 100) : 0
  const totalSecs  = s.elapsed_seconds || 0
  const mins       = Math.max(1, Math.round(totalSecs / 60))
  const avgSecs    = total > 0 ? Math.round(totalSecs / total) : 0
  const avgPerQ    = avgSecs >= 60
    ? `${Math.floor(avgSecs / 60)}m ${avgSecs % 60}s`
    : `${avgSecs}s`
  // Backend relation is `session_questions()` (plural HasMany) so the API
  // serialises rows under that key. Fall back to `questions` only for
  // forward compatibility if the relation name ever changes.
  const rawRows   = s.session_questions || s.questions || []
  const questions = rawRows.map(mapApiQ)
  return {
    id: s.id,
    date: started.toISOString().slice(0, 10),
    time: started.toTimeString().slice(0, 5),
    mode: (s.mode || 'tutor') as 'tutor' | 'timed',
    score, total, correct, incorrect, skipped,
    duration: `${mins} min`,
    avgPerQ,
    topics: s.exam?.name ? [s.exam.name] : [],
    questions,
  }
})

// ─── State ─────────────────────────────────────────────────────────────────
// Active (expanded) question — mirrors the mockup's `activeQ`. Only one card
// is expanded at a time; others collapse to a single-line preview.
const activeQ = ref(1)

// Result filter chips (correct / incorrect / skipped) — toggles visibility
// of both the q-card AND the ng-item in the side grid.
const navFilters = ref<Set<'correct' | 'incorrect' | 'skipped'>>(
  new Set(['correct', 'incorrect', 'skipped'])
)

// Flagged questions — initially hydrated from the API response. Tracked by
// `n` (1-based position) to match the existing template bindings, but each
// toggle PATCHes the backend using the row's question_id.
const flagged = ref<Set<number>>(new Set())

// Rehydrate the flagged set whenever the API session resolves so the flag
// icon reflects the saved state on first paint.
watch(apiSession, (s) => {
  if (!s) return
  const rows = s.session_questions || s.questions || []
  const next = new Set<number>()
  rows.forEach((row: any, idx: number) => {
    if (row?.flagged === true || row?.flagged === 1 || row?.flagged === '1') {
      next.add(idx + 1)
    }
  })
  flagged.value = next
}, { immediate: true })

const jumpInput = ref('')

// ─── Helpers ───────────────────────────────────────────────────────────────
function toggleNavFilter(type: 'correct' | 'incorrect' | 'skipped') {
  if (navFilters.value.has(type)) navFilters.value.delete(type)
  else navFilters.value.add(type)
  navFilters.value = new Set(navFilters.value)

  // If the active card is now hidden, snap to the first visible one.
  if (!session.value) return
  const activeStillVisible = session.value.questions
    .find(q => q.n === activeQ.value && navFilters.value.has(q.result))
  if (!activeStillVisible) {
    const firstVisible = session.value.questions
      .find(q => navFilters.value.has(q.result))
    if (firstVisible) activeQ.value = firstVisible.n
  }
}

function isHidden(q: ReviewQuestion): boolean {
  return !navFilters.value.has(q.result)
}

function selectQ(n: number, scroll = true) {
  activeQ.value = n
  if (scroll && import.meta.client) {
    nextTick(() => {
      const el = document.getElementById(`qcard-${n}__review`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}

function jumpToQ() {
  const n = parseInt(jumpInput.value, 10)
  if (!n || !session.value) return
  const q = session.value.questions.find(qq => qq.n === n)
  if (q && navFilters.value.has(q.result)) {
    selectQ(n)
  }
  jumpInput.value = ''
}

// toggleFlag — flip local state and persist to the SESSION ROW so it survives a
// reload (both flag AND un-flag). The icon is rehydrated from
// session_questions.flagged (see the watch above), so we PATCH the SAME source:
// /sessions/{id}/questions/{qid} with { flagged }. (It used to write the separate
// question_flags table, which this page never reads — so flags never reappeared.)
async function toggleFlag(n: number) {
  const newFlag = !flagged.value.has(n)
  if (newFlag) flagged.value.add(n)
  else         flagged.value.delete(n)
  flagged.value = new Set(flagged.value)

  // Lookup the underlying question_id for the row at position `n`.
  const q = session.value?.questions.find(qq => qq.n === n)
  const qid = q?.questionId
  if (!qid) return    // mock fallback → no backend call

  try {
    const studentApi = useStudentApi()
    await studentApi(`/sessions/${sessionId.value}/questions/${qid}`, {
      method: 'PATCH',
      body: { flagged: newFlag },
    })
  } catch (e) {
    log.warn('review', 'toggleFlag failed', e)
    // Revert the optimistic UI change on failure.
    if (newFlag) flagged.value.delete(n)
    else         flagged.value.add(n)
    flagged.value = new Set(flagged.value)
  }
}

// ─── Option styling — matches mockup's class-decision logic ────────────────
function optionClass(q: ReviewQuestion, opt: ReviewOption): string {
  if (opt.correct && opt.userSelected) return 'opt-correct'
  if (opt.correct && !opt.userSelected && q.result !== 'skipped') return 'opt-correct'
  if (opt.correct && q.result === 'skipped') return 'opt-skipped-correct'
  if (!opt.correct && opt.userSelected) return 'opt-user-wrong'
  return ''
}

function optionIndicators(q: ReviewQuestion, opt: ReviewOption): { cls: string; text: string }[] {
  if (opt.correct && opt.userSelected) {
    return [{ cls: 'ind-your-correct', text: 'Your answer · Correct' }]
  }
  if (opt.correct && !opt.userSelected && q.result !== 'skipped') {
    return [{ cls: 'ind-correct', text: 'Correct answer' }]
  }
  if (opt.correct && q.result === 'skipped') {
    return [{ cls: 'ind-correct', text: 'Correct answer' }]
  }
  if (!opt.correct && opt.userSelected) {
    return [{ cls: 'ind-your', text: 'Your answer' }]
  }
  return []
}

// ─── Display helpers ────────────────────────────────────────────────────────
function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// Stroke-dasharray (perimeter) and stroke-dashoffset for the SVG score ring.
// Ring radius is 24 (from the mockup's <circle r="24">), so circumference is
// 2π·24 ≈ 150.796. Offset shrinks as score rises.
function ringPerimeter(): number {
  return 2 * Math.PI * 24
}

function ringOffset(score: number): number {
  return ringPerimeter() - (score / 100) * ringPerimeter()
}

// Width percentages for the score breakdown bar (nav-summary)
function barPct(value: number, total: number): string {
  return total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%'
}

// Diff badge → class
function diffClass(d: string): string {
  const v = String(d || '').toLowerCase()
  if (v === 'foundation' || v === 'easy')     return 'q-tag-diff-easy'
  if (v === 'advanced'   || v === 'hard')     return 'q-tag-diff-hard'
  if (v === 'expert')                          return 'q-tag-diff-expert'
  return 'q-tag-diff-med'   // intermediate / medium / unknown
}

function diffLabel(d: string): string {
  const v = String(d || '').trim()
  if (!v) return ''
  // Canonical taxonomy: foundation / intermediate / advanced / expert.
  // Legacy easy/medium/hard mapped onto the same three lower tiers.
  const map: Record<string, string> = {
    easy: 'Foundation', medium: 'Intermediate', hard: 'Advanced',
    foundation: 'Foundation', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert',
  }
  return map[v.toLowerCase()] ?? (v.charAt(0).toUpperCase() + v.slice(1))
}

// Plain text only — the .q-result-badge already renders a check/X/clock SVG
// icon next to this, so prepending a glyph here produced a double tick/cross.
function resultLabel(r: 'correct' | 'incorrect' | 'skipped'): string {
  if (r === 'correct') return 'Correct'
  if (r === 'incorrect') return 'Incorrect'
  return 'Skipped'
}
</script>

<template>
  <!-- Loading skeleton — full page shimmer (topbar + layout) so the whole
       page reads as one unified placeholder while data loads. -->
  <div v-if="loadingReview" class="sk-topbar-review">
    <div style="display:flex;align-items:center;gap:14px">
      <div class="sk-pulse" style="width:96px;height:14px;border-radius:4px"></div>
      <div style="width:1px;height:18px;background:var(--border);"></div>
      <div>
        <div class="sk-pulse" style="width:160px;height:14px;border-radius:4px"></div>
        <div class="sk-pulse" style="width:260px;height:10px;border-radius:4px;margin-top:6px"></div>
      </div>
    </div>
  </div>
  <div v-if="loadingReview" class="review-layout">
    <div class="nav-panel">
      <div class="nav-panel-head">
        <div class="sk-line sk-pulse" style="width:70%;height:14px"></div>
        <div class="nav-filters" style="margin-top:10px;display:flex;flex-direction:column;gap:6px">
          <div class="sk-pulse" style="height:22px;border-radius:10px"></div>
          <div class="sk-pulse" style="height:22px;border-radius:10px"></div>
          <div class="sk-pulse" style="height:22px;border-radius:10px"></div>
        </div>
        <div class="sk-pulse" style="height:30px;border-radius:6px;margin-top:14px"></div>
      </div>
      <div class="ng-grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:10px">
        <div v-for="i in 15" :key="i" class="sk-pulse" style="aspect-ratio:1;border-radius:6px"></div>
      </div>
    </div>
    <div style="flex:1;padding:20px;overflow-y:auto">
      <!-- Header card -->
      <div class="sk-pulse" style="height:78px;border-radius:10px;margin-bottom:18px"></div>
      <!-- Question cards -->
      <div v-for="i in 3" :key="`sk-q-${i}`" style="border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:14px">
        <div style="display:flex;gap:8px;margin-bottom:14px">
          <div class="sk-pulse" style="width:32px;height:18px;border-radius:4px"></div>
          <div class="sk-pulse" style="width:88px;height:18px;border-radius:10px"></div>
          <div class="sk-pulse" style="width:64px;height:18px;border-radius:10px"></div>
        </div>
        <div class="sk-line sk-pulse" style="width:96%;height:12px;margin-bottom:6px"></div>
        <div class="sk-line sk-pulse" style="width:80%;height:12px;margin-bottom:14px"></div>
        <div v-for="j in 4" :key="j" class="sk-pulse" style="height:36px;border-radius:8px;margin-bottom:8px"></div>
      </div>
    </div>
  </div>
  <!-- API error — message from backend -->
  <div v-else-if="reviewError" style="display:flex;align-items:center;justify-content:center;min-height:100dvh;flex-direction:column;gap:14px;font-family:'Figtree',sans-serif;padding:30px;text-align:center">
    <div style="font-size:1rem;font-weight:700;color:var(--rose)">Couldn't load session</div>
    <div style="font-size:0.82rem;color:var(--ink-dim);max-width:420px">{{ reviewError }}</div>
    <NuxtLink to="/student/past" style="margin-top:8px;color:var(--teal);text-decoration:underline">← Back to Past Sessions</NuxtLink>
  </div>
  <!-- API returned no data (no exception thrown, but session is null) -->
  <div v-else-if="!session" style="display:flex;align-items:center;justify-content:center;min-height:100dvh;flex-direction:column;gap:14px;font-family:'Figtree',sans-serif;padding:30px;text-align:center">
    <div style="font-size:1rem;font-weight:700;color:var(--ink-dim)">Session not found</div>
    <div style="font-size:0.82rem;color:var(--ink-faint);max-width:420px">This session may have been deleted or you may not have access to it.</div>
    <NuxtLink to="/student/past" style="margin-top:8px;color:var(--teal);text-decoration:underline">← Back to Past Sessions</NuxtLink>
  </div>

  <!-- Main review UI — only shown when session loaded successfully -->
  <div v-if="session" class="topbar">
    <button type="button" class="mobile-menu-btn" @click="openMobile" aria-label="Open menu">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
    <div class="tb-left">
      <NuxtLink to="/student/past" class="tb-back" style="cursor:pointer;text-decoration:none">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Past Sessions
      </NuxtLink>
      <div class="tb-divider"></div>
      <h1 style="font-size:0.93rem;font-weight:800">Session Review</h1>
    </div>
    <div class="tb-right">
      <button type="button" class="dm-btn" @click="toggleDark()" aria-label="Toggle dark mode">
        <svg class="i-sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        <svg class="i-moon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
    </div>
  </div>

  <!-- Review layout: nav-panel + scrollable q-list -->
  <div v-if="session" class="review-layout">

    <!-- ═══ LEFT NAV PANEL ═══ -->
    <div class="nav-panel">
      <div class="nav-panel-head">
        <div class="nav-panel-title">Questions</div>

        <div class="nav-filters">
          <button type="button" class="nf-chip correct" :class="{ on: navFilters.has('correct') }" @click="toggleNavFilter('correct')" :aria-pressed="navFilters.has('correct')">
            <div class="nf-dot" style="background:var(--green)"></div>
            Correct
          </button>
          <button type="button" class="nf-chip incorrect" :class="{ on: navFilters.has('incorrect') }" @click="toggleNavFilter('incorrect')" :aria-pressed="navFilters.has('incorrect')">
            <div class="nf-dot" style="background:var(--rose)"></div>
            Wrong
          </button>
          <button type="button" class="nf-chip skipped" :class="{ on: navFilters.has('skipped') }" @click="toggleNavFilter('skipped')" :aria-pressed="navFilters.has('skipped')">
            <div class="nf-dot" style="background:var(--ink-faint)"></div>
            Skipped
          </button>
        </div>

        <div class="nav-jump">
          <input type="number" placeholder="Go to Q…" :min="1" :max="session.total" v-model="jumpInput" @keyup.enter="jumpToQ" />
          <button type="button" class="nav-jump-btn" @click="jumpToQ">Go</button>
        </div>
      </div>

      <div class="nav-grid-wrap">
        <div class="nav-grid">
          <div
            v-for="q in session.questions" :key="q.n"
            class="ng-item"
            :class="[q.result, { active: q.n === activeQ, hidden: isHidden(q) }]"
            @click="selectQ(q.n)"
          >{{ q.n }}</div>
        </div>
      </div>

      <div class="nav-summary">
        <div class="ns-row">
          <span class="ns-lbl">Score</span>
          <span class="ns-val" style="color:var(--green)">{{ session.score }}%</span>
        </div>
        <div class="ns-bar">
          <div class="ns-correct"   :style="{ width: barPct(session.correct,   session.total) }"></div>
          <div class="ns-incorrect" :style="{ width: barPct(session.incorrect, session.total) }"></div>
          <div class="ns-skipped"   :style="{ width: barPct(session.skipped,   session.total) }"></div>
        </div>
        <div class="ns-row" style="margin-top:4px">
          <span class="ns-lbl" style="color:var(--green)">{{ session.correct }} correct</span>
          <span class="ns-lbl" style="color:var(--rose)">{{ session.incorrect }} wrong</span>
          <span class="ns-lbl">{{ session.skipped }} skipped</span>
        </div>
      </div>
    </div>

    <!-- ═══ RIGHT: SCROLLABLE Q LIST ═══ -->
    <div class="q-scroll">

      <!-- Session header card -->
      <div class="session-header fi">
        <div class="sh-score-ring">
          <svg viewBox="0 0 58 58">
            <circle fill="none" stroke="var(--border)" stroke-width="5" cx="29" cy="29" r="24"/>
            <circle fill="none" stroke="var(--green)" stroke-width="5" stroke-linecap="round"
              cx="29" cy="29" r="24"
              :stroke-dasharray="ringPerimeter()"
              :stroke-dashoffset="ringOffset(session.score)"/>
          </svg>
          <div class="sh-ring-label">
            <span class="sh-ring-pct" style="color:var(--green)">{{ session.score }}%</span>
          </div>
        </div>

        <div class="sh-info">
          <div class="sh-title">{{ formatLongDate(session.date) }} · {{ session.mode === 'tutor' ? 'Tutor Mode' : 'Timed Mode' }}</div>
          <div class="sh-meta">
            <div class="sh-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              <strong>{{ session.total }}</strong>&nbsp;questions
            </div>
            <div class="sh-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <strong>{{ session.duration }}</strong>&nbsp;total
            </div>
            <div class="sh-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              {{ session.topics.join(' · ') }}
            </div>
          </div>
        </div>

        <div class="sh-stats">
          <div class="sh-stat">
            <span class="sh-stat-val" style="color:var(--green)">{{ session.correct }}</span>
            <span class="sh-stat-lbl">Correct</span>
          </div>
          <div class="sh-stat">
            <span class="sh-stat-val" style="color:var(--rose)">{{ session.incorrect }}</span>
            <span class="sh-stat-lbl">Incorrect</span>
          </div>
          <div class="sh-stat">
            <span class="sh-stat-val" style="color:var(--ink-dim)">{{ session.skipped }}</span>
            <span class="sh-stat-lbl">Skipped</span>
          </div>
          <div class="sh-stat">
            <span class="sh-stat-val">{{ session.avgPerQ }}</span>
            <span class="sh-stat-lbl">Avg / Q</span>
          </div>
        </div>
      </div>

      <!-- Question cards -->
      <div
        v-for="(q, qi) in session.questions" :key="q.n"
        :id="`qcard-${q.n}__review`"
        class="q-card fi"
        :class="{ collapsed: q.n !== activeQ, hidden: isHidden(q) }"
        :style="{ animationDelay: (0.04 + qi * 0.04) + 's' }"
        @click="q.n !== activeQ ? selectQ(q.n, false) : null"
      >
        <div class="q-card-head">
          <span class="q-num-badge">Q{{ q.n }}</span>
          <span class="q-result-badge" :class="`qrb-${q.result}`">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <template v-if="q.result === 'correct'"><polyline points="20 6 9 17 4 12"/></template>
              <template v-else-if="q.result === 'incorrect'"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></template>
              <template v-else><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></template>
            </svg>
            {{ resultLabel(q.result) }}
          </span>
          <div class="q-tags">
            <span class="q-tag">{{ q.topic }}</span>
            <span class="q-tag" :class="diffClass(q.difficulty)">{{ diffLabel(q.difficulty) }}</span>
          </div>
          <div class="q-time-tag">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            {{ q.time }}
          </div>
          <div
            class="flag-btn" :class="{ flagged: flagged.has(q.n) }"
            title="Flag this question"
            @click.stop="toggleFlag(q.n)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          </div>
        </div>

        <!-- Collapsed preview (single-line) -->
        <div class="q-preview" v-html="sanitizeHtml(q.text)"></div>

        <!-- Expanded body -->
        <div class="q-card-body">
          <div class="q-text" v-html="sanitizeHtml(q.text)"></div>

          <!-- Question image (only when a real http(s) URL is present) -->
          <div v-if="isImageUrl(q.img)" class="qc-question-image qc-question-image--student-review">
            <img :src="q.img" alt="Question image" loading="lazy" />
          </div>

          <div class="q-options">
            <div
              v-for="opt in q.options" :key="opt.letter"
              class="q-option"
              :class="optionClass(q, opt)"
            >
              <div class="opt-letter">{{ opt.letter }}</div>
              <div class="opt-text">{{ opt.text }}</div>
              <div v-if="optionIndicators(q, opt).length" class="opt-indicators">
                <span
                  v-for="(ind, i) in optionIndicators(q, opt)" :key="i"
                  class="opt-ind" :class="ind.cls"
                >{{ ind.text }}</span>
              </div>
            </div>
          </div>

          <div class="q-explanation">
            <div class="q-expl-head">
              <div class="q-expl-icon">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <span class="q-expl-label">Explanation</span>
            </div>
            <div class="q-expl-text" v-html="sanitizeHtml(q.explanation)"></div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- "Session not found" message only shows when the load finished, no error
       was raised, but the session is missing (e.g. invalid id). During the
       initial load the skeleton above is responsible for the UI — we used
       `v-else` before, which made this message leak through under the
       skeleton because `session` is also null while loading. -->
  <div v-else-if="!loadingReview && !reviewError && !session" class="content">
    <p style="padding:40px;text-align:center;color:var(--ink-dim)">Session not found.</p>
  </div>
</template>

<style scoped>
/* Dark-mode toggle button (same as tutor/timed session pages). */
.dm-btn{width:32px;height:32px;border-radius:7px;border:1.5px solid var(--border);background:var(--white);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink-dim);position:relative;overflow:hidden;transition:all 0.2s}
.dm-btn svg{position:absolute;transition:opacity 0.2s,transform 0.3s cubic-bezier(0.34,1.56,0.64,1)}
.dm-btn .i-sun{opacity:1;transform:rotate(0deg) scale(1)}
.dm-btn .i-moon{opacity:0;transform:rotate(-90deg) scale(0.6)}
:global(body.dark) .dm-btn .i-sun{opacity:0;transform:rotate(90deg) scale(0.6)}
:global(body.dark) .dm-btn .i-moon{opacity:1;transform:rotate(0deg) scale(1)}

/* Skeleton shimmer — same pattern as past.vue so look-and-feel matches. */
.sk-topbar-review {
  padding: 14px 22px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  background: var(--white, #fff);
}
.sk-line { background: var(--surface-2, #e5e7eb); border-radius: 4px; display: block; }
.sk-pulse {
  background: var(--surface-2, #e5e7eb);
  animation: skPulse 1.2s ease-in-out infinite;
}
@keyframes skPulse {
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 0.5;  }
}
</style>
