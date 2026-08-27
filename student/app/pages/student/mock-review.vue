<script setup lang="ts">
definePageMeta({ layout: 'student' })
useHead({ title: 'Mock Review · Passmed' })

const studentApi       = useStudentApi()
const route            = useRouter()
const routeQ           = useRoute()
const { openMobile }   = useSidebar()
const { toggle: toggleDark } = useDarkMode()

// ── Types ─────────────────────────────────────────────────────────────────────
interface ReviewOption {
  letter:     string
  text:       string
  is_correct: boolean
  was_chosen: boolean
}

interface ReviewQuestion {
  position:            number
  question_id:         number
  question_stem:       string
  question_image_ids:  string | null   // image URL shown under the stem
  explanation:         string | null
  category:            { id: number; name: string } | null
  options:             ReviewOption[]
  chosen_answer:       string | null   // 'A' | 'B' | 'C' | 'D' | null
  correct_answer:      string | null
  result:              'correct' | 'incorrect' | 'skipped'
  chosen_option_text:  string | null
  correct_option_text: string | null
}

interface ReviewData {
  session_id:     number
  attempt_number: number
  exam_name:      string
  score_pct:      number
  passed:         boolean
  pass_mark:      number
  total:          number
  correct:        number
  wrong:          number
  skipped:        number
  marking_method: string
  neg_penalty:    number
  questions:      ReviewQuestion[]
}

// ── State ─────────────────────────────────────────────────────────────────────
const loading   = ref(true)
const loadError = ref('')
const data      = ref<ReviewData | null>(null)

// Which question's explanation is expanded
const expandedExp = ref<Set<number>>(new Set())

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreColor(pct: number): string {
  if (pct >= 70) return 'var(--green, #16a34a)'
  if (pct >= 50) return 'var(--amber, #d97706)'
  return 'var(--rose, #e11d48)'
}

function scoreRingOffset(pct: number): number {
  return 94.25 * (1 - pct / 100)
}

function optionClass(opt: ReviewOption, q: ReviewQuestion): string {
  // If skipped — no highlights
  if (q.result === 'skipped' && !opt.was_chosen && !opt.is_correct) return 'opt-plain'
  if (opt.is_correct)  return 'opt-correct'
  if (opt.was_chosen)  return 'opt-wrong'
  return 'opt-plain'
}

function resultBadgeClass(result: string): string {
  if (result === 'correct')   return 'rb rb-correct'
  if (result === 'incorrect') return 'rb rb-wrong'
  return 'rb rb-skip'
}

function resultBadgeLabel(result: string): string {
  if (result === 'correct')   return 'Correct'
  if (result === 'incorrect') return 'Incorrect'
  return 'Skipped'
}

function toggleExp(idx: number) {
  const s = new Set(expandedExp.value)
  if (s.has(idx)) s.delete(idx)
  else s.add(idx)
  expandedExp.value = s
}

// ── Load review ───────────────────────────────────────────────────────────────
async function loadReview() {
  loading.value   = true
  loadError.value = ''
  try {
    const sid     = routeQ.query.sid
    const attempt = routeQ.query.attempt ?? '1'

    if (!sid) {
      loadError.value = 'No session ID provided.'
      return
    }

    const res = await studentApi<any>(`/mock-exams/session/${sid}/review?attempt=${attempt}`)
    if (res?.status === 'success') {
      data.value = res.data as ReviewData
    } else {
      loadError.value = res?.msg ?? 'Failed to load review.'
    }
  } catch (e: any) {
    loadError.value = e?.data?.msg ?? 'Failed to load review.'
  } finally {
    loading.value = false
  }
}

function goBack() {
  // scrollTo=completed so mock.vue scrolls to the "Previously attempted" section
  route.push('/student/mock?scrollTo=completed')
}

onMounted(loadReview)
</script>

<template>
  <div class="content rv-wrap">

    <!-- ── Back bar ──────────────────────────────────────────────────────────── -->
    <div class="rv-back-bar">
      <button type="button" class="mobile-menu-btn" @click="openMobile" style="margin-right:8px;" aria-label="Open menu">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <button type="button" class="rv-back-btn" @click="goBack">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Mock Exams
      </button>
      <!-- Dark mode toggle -->
      <button type="button" class="dm-btn ib" title="Toggle dark mode" @click="toggleDark" style="margin-left:auto" aria-label="Toggle dark mode">
        <svg class="icon-sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        <svg class="icon-moon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
    </div>

    <!-- ── Loading ───────────────────────────────────────────────────────────── -->
    <template v-if="loading">
      <div class="rv-header-sk fi d1">
        <div class="sk-pulse" style="width:200px;height:22px;border-radius:6px"></div>
        <div class="sk-pulse" style="width:120px;height:14px;border-radius:4px;margin-top:6px"></div>
      </div>
      <div class="rv-score-sk fi d2">
        <div class="sk-pulse" style="width:80px;height:80px;border-radius:50%"></div>
        <div style="flex:1">
          <div class="sk-pulse" style="width:140px;height:18px;border-radius:5px;margin-bottom:8px"></div>
          <div class="sk-pulse" style="width:220px;height:12px;border-radius:4px"></div>
        </div>
      </div>
      <div v-for="i in 4" :key="`sk-q-${i}`" class="rv-q-sk fi" :class="`d${i+2}`">
        <div class="sk-pulse" style="width:40px;height:40px;border-radius:8px"></div>
        <div style="flex:1">
          <div class="sk-pulse" style="width:90%;height:14px;border-radius:4px;margin-bottom:8px"></div>
          <div class="sk-pulse" style="width:70%;height:14px;border-radius:4px;margin-bottom:6px"></div>
          <div class="sk-pulse" style="width:50%;height:14px;border-radius:4px"></div>
        </div>
      </div>
    </template>

    <!-- ── Error ─────────────────────────────────────────────────────────────── -->
    <div v-else-if="loadError" class="rv-error fi d1">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p>{{ loadError }}</p>
      <button type="button" class="rv-retry-btn" @click="loadReview">Retry</button>
    </div>

    <!-- ── Main content ───────────────────────────────────────────────────────── -->
    <template v-else-if="data">

      <!-- Score summary card -->
      <div class="rv-summary fi d1">
        <div class="rv-summary-left">
          <!-- Score ring -->
          <div class="rv-ring-wrap">
            <svg viewBox="0 0 36 36" width="76" height="76">
              <circle fill="none" stroke="var(--border, #e2edf4)" stroke-width="3" cx="18" cy="18" r="15"/>
              <circle fill="none"
                      :stroke="scoreColor(data.score_pct)"
                      stroke-width="3" stroke-linecap="round"
                      cx="18" cy="18" r="15"
                      stroke-dasharray="94.25"
                      :stroke-dashoffset="scoreRingOffset(data.score_pct)"
                      transform="rotate(-90 18 18)"/>
            </svg>
            <div class="rv-ring-inner">
              <span class="rv-ring-pct" :style="{ color: scoreColor(data.score_pct) }">
                {{ Math.round(data.score_pct) }}%
              </span>
            </div>
          </div>
        </div>

        <div class="rv-summary-body">
          <div class="rv-summary-title">{{ data.exam_name }}</div>
          <div class="rv-summary-sub">Attempt {{ data.attempt_number }}</div>

          <!-- Pass / Fail -->
          <div class="rv-summary-badges">
            <span class="rv-pass-badge" :class="data.passed ? 'rv-pass-badge--pass' : 'rv-pass-badge--fail'">
              {{ data.passed ? '✓ Passed' : '✗ Failed' }}
            </span>
            <span class="rv-pass-badge rv-pass-badge--neutral">Pass mark {{ data.pass_mark }}%</span>
            <span v-if="data.marking_method === 'negative'" class="rv-pass-badge rv-pass-badge--neg">
              Negative marking (–{{ data.neg_penalty }}/wrong)
            </span>
          </div>

          <!-- Stats row -->
          <div class="rv-stats">
            <div class="rv-stat rv-stat--correct">
              <span class="rv-stat-val">{{ data.correct }}</span>
              <span class="rv-stat-lbl">Correct</span>
            </div>
            <div class="rv-stat rv-stat--wrong">
              <span class="rv-stat-val">{{ data.wrong }}</span>
              <span class="rv-stat-lbl">Incorrect</span>
            </div>
            <div class="rv-stat rv-stat--skip">
              <span class="rv-stat-val">{{ data.skipped }}</span>
              <span class="rv-stat-lbl">Skipped</span>
            </div>
            <div class="rv-stat rv-stat--total">
              <span class="rv-stat-val">{{ data.total }}</span>
              <span class="rv-stat-lbl">Total</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Section label -->
      <div class="rv-section-lbl fi d2">Questions</div>

      <!-- Question cards -->
      <div v-for="(q, idx) in data.questions" :key="q.question_id"
           class="rv-qcard fi" :class="`d${idx + 3}`">

        <!-- Card header: Q number + result badge -->
        <div class="rv-qcard-head">
          <div class="rv-qnum" :class="`rv-qnum--${q.result}`">Q{{ idx + 1 }}</div>
          <span :class="resultBadgeClass(q.result)">{{ resultBadgeLabel(q.result) }}</span>
          <div class="rv-qcard-head-spacer"></div>
          <span v-if="q.category" class="rv-cat-badge">{{ q.category.name }}</span>
        </div>

        <!-- Question stem — stored as HTML, render it sanitized (same as the
             timed/tutor session views) instead of printing raw <p> tags. -->
        <div class="rv-stem" v-html="sanitizeHtml(q.question_stem)"></div>

        <!-- Question image (only when a real http(s) URL is present) -->
        <div v-if="isImageUrl(q.question_image_ids)" class="qc-question-image qc-question-image--student-mockreview">
          <img :src="q.question_image_ids" alt="Question image" loading="lazy" />
        </div>

        <!-- Options list -->
        <div class="rv-options">
          <div v-for="opt in q.options" :key="opt.letter"
               class="rv-opt" :class="optionClass(opt, q)">

            <!-- Left: letter pill -->
            <div class="rv-opt-letter" :class="`rv-opt-letter--${optionClass(opt, q)}`">
              {{ opt.letter }}
            </div>

            <!-- Option text -->
            <div class="rv-opt-text">{{ opt.text }}</div>

            <!-- Right: indicators -->
            <div class="rv-opt-indicators">
              <!-- Correct tick -->
              <span v-if="opt.is_correct && !opt.was_chosen" class="rv-ind rv-ind--correct" title="Correct answer">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <!-- Student chose this -->
              <span v-if="opt.was_chosen && !opt.is_correct" class="rv-ind rv-ind--wrong" title="Your answer">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </span>
              <!-- Student chose and it's correct -->
              <span v-if="opt.was_chosen && opt.is_correct" class="rv-ind rv-ind--chosen-correct" title="Your answer — correct!">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
            </div>

          </div>
        </div>

        <!-- Skipped notice -->
        <div v-if="q.result === 'skipped'" class="rv-skip-note">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          You did not answer this question. The correct answer is <strong>{{ q.correct_answer }}</strong>.
        </div>

        <!-- Explanation toggle -->
        <div v-if="q.explanation" class="rv-exp-wrap">
          <button type="button" class="rv-exp-toggle" @click="toggleExp(idx)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            {{ expandedExp.has(idx) ? 'Hide Explanation' : 'Show Explanation' }}
            <svg class="rv-exp-chevron" :class="{ 'rv-exp-chevron--open': expandedExp.has(idx) }" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div v-if="expandedExp.has(idx)" class="rv-exp-body" v-html="sanitizeHtml(q.explanation)"></div>
        </div>

      </div>

    </template>

  </div>
</template>

<style scoped>
/* ─── Skeleton ────────────────────────────────────────────────────────────── */
.sk-pulse {
  background: var(--surface-2, #e5e7eb);
  animation: skPulse 1.2s ease-in-out infinite;
}
@keyframes skPulse { 0%,100%{opacity:.85} 50%{opacity:.5} }

/* ─── Fade-in ────────────────────────────────────────────────────────────── */
.fi { opacity: 0; animation: fadeIn .35s ease forwards; }
.d1 { animation-delay: .04s }
.d2 { animation-delay: .08s }
.d3 { animation-delay: .10s }
.d4 { animation-delay: .12s }
.d5 { animation-delay: .14s }
.d6 { animation-delay: .16s }
.d7 { animation-delay: .18s }
.d8 { animation-delay: .20s }
@keyframes fadeIn { to { opacity: 1 } }

/* ─── Layout ──────────────────────────────────────────────────────────────── */
.rv-wrap {
  padding: 20px 24px 48px; 
}

/* ─── Back button ────────────────────────────────────────────────────────── */
.rv-back-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
}
.rv-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.73rem;
  font-weight: 600;
  color: var(--ink-dim, #64748b);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  transition: color .12s;
}
.rv-back-btn:hover { color: var(--teal, #06b6d4); }

/* ─── Skeleton blocks ────────────────────────────────────────────────────── */
.rv-header-sk { margin-bottom: 20px; }
.rv-score-sk  { display: flex; align-items: center; gap: 20px; padding: 20px; background: var(--white,#fff); border: 1px solid var(--border,#e2edf4); border-radius: 14px; margin-bottom: 18px; }
.rv-q-sk      { display: flex; align-items: flex-start; gap: 14px; padding: 18px; background: var(--white,#fff); border: 1px solid var(--border,#e2edf4); border-radius: 12px; margin-bottom: 12px; }

/* ─── Error ───────────────────────────────────────────────────────────────── */
.rv-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 56px 24px;
  color: var(--ink-dim);
  text-align: center;
}
.rv-error p { font-size: 0.85rem; margin: 0; }
.rv-retry-btn {
  font-size: 0.77rem;
  font-weight: 600;
  padding: 7px 18px;
  border-radius: 8px;
  border: 1px solid var(--border,#e2edf4);
  background: var(--white,#fff);
  color: var(--ink-dim);
  cursor: pointer;
  font-family: inherit;
}
.rv-retry-btn:hover { border-color: var(--teal,#06b6d4); color: var(--teal,#06b6d4); }

/* ─── Summary card ───────────────────────────────────────────────────────── */
.rv-summary {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  background: var(--white, #fff);
  border: 1px solid var(--border, #e2edf4);
  border-radius: 16px;
  padding: 20px 22px;
  margin-bottom: 24px;
}

.rv-summary-left { flex-shrink: 0; }

.rv-ring-wrap {
  position: relative;
  width: 76px;
  height: 76px;
}
.rv-ring-wrap svg { display: block; }
.rv-ring-inner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rv-ring-pct {
  font-size: 0.88rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
}

.rv-summary-body { flex: 1; min-width: 0; }
.rv-summary-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 2px;
}
.rv-summary-sub {
  font-size: 0.72rem;
  color: var(--ink-dim);
  margin-bottom: 10px;
}

.rv-summary-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.rv-pass-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.67rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  border: 1px solid transparent;
  white-space: nowrap;
}
.rv-pass-badge--pass    { background: color-mix(in srgb,var(--green,#16a34a) 10%,transparent); color: var(--green,#16a34a); border-color: color-mix(in srgb,var(--green,#16a34a) 28%,transparent); }
.rv-pass-badge--fail    { background: color-mix(in srgb,var(--rose,#e11d48) 8%,transparent);  color: var(--rose,#e11d48);  border-color: color-mix(in srgb,var(--rose,#e11d48) 25%,transparent); }
.rv-pass-badge--neutral { background: color-mix(in srgb,var(--ink-dim) 8%,transparent);       color: var(--ink-dim); }
.rv-pass-badge--neg     { background: color-mix(in srgb,#7c3aed 8%,transparent);              color: #7c3aed; border-color: color-mix(in srgb,#7c3aed 22%,transparent); }

/* Stats row */
.rv-stats {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
}
.rv-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}
.rv-stat-val {
  font-size: 1.1rem;
  font-weight: 800;
  line-height: 1;
}
.rv-stat-lbl {
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
}
.rv-stat--correct .rv-stat-val { color: var(--green,#16a34a); }
.rv-stat--correct .rv-stat-lbl { color: color-mix(in srgb,var(--green,#16a34a) 70%,var(--ink-dim)); }
.rv-stat--wrong .rv-stat-val   { color: var(--rose,#e11d48); }
.rv-stat--wrong .rv-stat-lbl   { color: color-mix(in srgb,var(--rose,#e11d48) 70%,var(--ink-dim)); }
.rv-stat--skip .rv-stat-val    { color: var(--amber,#d97706); }
.rv-stat--skip .rv-stat-lbl    { color: color-mix(in srgb,var(--amber,#d97706) 70%,var(--ink-dim)); }
.rv-stat--total .rv-stat-val   { color: var(--ink); }
.rv-stat--total .rv-stat-lbl   { color: var(--ink-dim); }

/* ─── Section label ───────────────────────────────────────────────────────── */
.rv-section-lbl {
  font-size: 0.63rem;
  font-weight: 700;
  letter-spacing: .09em;
  text-transform: uppercase;
  color: var(--ink-dim);
  margin-bottom: 12px;
}

/* ─── Question card ───────────────────────────────────────────────────────── */
.rv-qcard {
  background: var(--white, #fff);
  border: 1px solid var(--border, #e2edf4);
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 12px;
  transition: box-shadow .15s;
}
.rv-qcard:hover {
  box-shadow: 0 2px 12px rgba(6,182,212,.06);
}

.rv-qcard-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.rv-qcard-head-spacer { flex: 1; }

/* Q number pill */
.rv-qnum {
  font-size: 0.67rem;
  font-weight: 800;
  padding: 3px 9px;
  border-radius: 20px;
  white-space: nowrap;
  letter-spacing: .02em;
}
.rv-qnum--correct   { background: color-mix(in srgb,var(--green,#16a34a) 12%,transparent); color: var(--green,#16a34a); }
.rv-qnum--incorrect { background: color-mix(in srgb,var(--rose,#e11d48) 10%,transparent);  color: var(--rose,#e11d48); }
.rv-qnum--skipped   { background: color-mix(in srgb,var(--amber,#d97706) 10%,transparent); color: var(--amber,#d97706); }

/* Result badge */
.rb {
  display: inline-flex;
  align-items: center;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 20px;
  border: 1px solid transparent;
}
.rb-correct { background: color-mix(in srgb,var(--green,#16a34a) 10%,transparent); color: var(--green,#16a34a); border-color: color-mix(in srgb,var(--green,#16a34a) 28%,transparent); }
.rb-wrong   { background: color-mix(in srgb,var(--rose,#e11d48) 8%,transparent);   color: var(--rose,#e11d48);  border-color: color-mix(in srgb,var(--rose,#e11d48) 25%,transparent); }
.rb-skip    { background: color-mix(in srgb,var(--amber,#d97706) 10%,transparent); color: var(--amber,#d97706); border-color: color-mix(in srgb,var(--amber,#d97706) 25%,transparent); }

/* Category badge */
.rv-cat-badge {
  font-size: 0.62rem;
  font-weight: 500;
  padding: 2px 9px;
  border-radius: 20px;
  border: 1px solid var(--border,#e2edf4);
  background: var(--surface,#f7fafc);
  color: var(--ink-dim);
  white-space: nowrap;
}

/* Question stem */
.rv-stem {
  font-size: 0.83rem;
  font-weight: 500;
  color: var(--ink);
  line-height: 1.6;
  margin-bottom: 14px;
}

/* ─── Options ──────────────────────────────────────────────────────────────── */
.rv-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.rv-opt {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  transition: background .1s, border-color .1s;
}

/* States */
.opt-plain   {
  background: var(--surface, #f7fafc);
  border-color: var(--border, #e2edf4);
}
.opt-correct {
  background: color-mix(in srgb, var(--green,#16a34a) 8%, transparent);
  border-color: color-mix(in srgb, var(--green,#16a34a) 35%, transparent);
}
.opt-wrong {
  background: color-mix(in srgb, var(--rose,#e11d48) 7%, transparent);
  border-color: color-mix(in srgb, var(--rose,#e11d48) 30%, transparent);
}

/* Letter pill */
.rv-opt-letter {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: .02em;
  flex-shrink: 0;
  margin-top: 1px;
}
.rv-opt-letter--opt-plain   { background: var(--border,#e2edf4); color: var(--ink-dim); }
.rv-opt-letter--opt-correct { background: var(--green,#16a34a); color: #fff; }
.rv-opt-letter--opt-wrong   { background: var(--rose,#e11d48);  color: #fff; }

/* Text */
.rv-opt-text {
  flex: 1;
  font-size: 0.8rem;
  color: var(--ink);
  line-height: 1.5;
}
.opt-correct .rv-opt-text { font-weight: 600; color: var(--green,#16a34a); }
.opt-wrong   .rv-opt-text { color: var(--rose,#e11d48); }

/* Indicators */
.rv-opt-indicators {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}

.rv-ind {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rv-ind--correct        { background: var(--green,#16a34a); color: #fff; }
.rv-ind--wrong          { background: var(--rose,#e11d48);  color: #fff; }
.rv-ind--chosen-correct { background: var(--green,#16a34a); color: #fff; }

/* ─── Skipped notice ─────────────────────────────────────────────────────── */
.rv-skip-note {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.73rem;
  color: var(--amber, #d97706);
  background: color-mix(in srgb, var(--amber,#d97706) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--amber,#d97706) 25%, transparent);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  line-height: 1.4;
}
.rv-skip-note strong { color: var(--ink); font-weight: 700; }

/* ─── Explanation ─────────────────────────────────────────────────────────── */
.rv-exp-wrap {
  border-top: 1px solid var(--border, #e2edf4);
  padding-top: 10px;
  margin-top: 6px;
}

.rv-exp-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--ink-dim);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  transition: color .12s;
}
.rv-exp-toggle:hover { color: var(--teal, #06b6d4); }

.rv-exp-chevron {
  transition: transform .18s ease;
}
.rv-exp-chevron--open {
  transform: rotate(180deg);
}

.rv-exp-body {
  margin-top: 8px;
  font-size: 0.79rem;
  color: var(--ink-dim);
  line-height: 1.65;
  background: var(--surface, #f7fafc);
  border-radius: 8px;
  padding: 10px 12px;
}
</style>
