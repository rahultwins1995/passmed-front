<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
const { instName } = useInstitution()

definePageMeta({ layout: 'institute' })

const api   = useInstituteApi()
const route = useRoute()

// ── Types ──────────────────────────────────────────────────────────────────────
type DistRisk = 'high' | 'medium' | 'pass' | 'strong'

type ScoreBand    = { band: string; count: number; risk: DistRisk }
type TopicResult  = { topic: string; questions: number; cohortAvg: number; passRate: number }
type QuestionOpt  = { letter: string; text: string; isCorrect: boolean }
type HardQuestion = {
  questionId: number
  pctCorrect: number | null   // null = not attempted yet
  totalAttempts: number
  stem: string
  explanation: string
  category: string
  difficulty: string
  options: QuestionOpt[]
}
type StudentScore = { name: string; avatarUrl: string | null; score: number; passed: boolean; change: number | null; userId: number }

type ExamDetail = {
  id: string
  name: string
  type: string
  date: string
  questions: number
  duration: string
  timed: boolean
  cohortAvg: number
  passRate: number
  completed: number
  total: number
  status: string
  passMarkValue: number
  markingMethod: string
  negMarkPenalty: number
  attemptLimit: number
  resultsRelease: string
  canDeclare: boolean
  scoreDistribution: ScoreBand[]
  topicBreakdown: TopicResult[]
  hardestQuestions: HardQuestion[]
  allQuestions: HardQuestion[]
  studentScores: StudentScore[]
  incompleteStudents: { name: string; avatarUrl: string | null }[]
}

// ── State ──────────────────────────────────────────────────────────────────────
const exam    = ref<ExamDetail | null>(null)
const loading = ref(true)
const error   = ref(false)

// ── Fetch ──────────────────────────────────────────────────────────────────────
async function fetchExam() {
  const id = route.params.id
  if (!id) { error.value = true; loading.value = false; return }

  loading.value = true
  error.value   = false
  try {
    const res = await api<any>(`/mock-exams/${id}`)
    if (res?.status === 'success') {
      const d = res.data
      exam.value = {
        id:                 String(d.id),
        name:               d.name,
        type:               d.type ?? 'Exam',
        date:               d.date ?? '',
        questions:          d.questions ?? 0,
        duration:           d.duration ?? 'Open',
        timed:              !!d.timed,
        cohortAvg:          +(d.cohort_avg ?? 0).toFixed(1),
        passRate:           +(d.pass_rate ?? 0).toFixed(1),
        completed:          d.completed ?? 0,
        total:              d.total ?? 0,
        status:             d.status ?? 'active',
        passMarkValue:      d.pass_mark_value ?? 65,
        markingMethod:      d.marking_method ?? 'standard',
        negMarkPenalty:     d.neg_mark_penalty ?? 0.25,
        attemptLimit:       d.attempt_limit ?? 1,
        resultsRelease:     d.results_release ?? 'immediate',
        canDeclare:         d.can_declare ?? false,
        scoreDistribution:  (d.score_distribution ?? []).map((b: any) => ({
          band: b.band, count: b.count, risk: b.risk as DistRisk,
        })),
        topicBreakdown: (d.topic_breakdown ?? []).map((t: any) => ({
          topic: t.topic, questions: t.questions,
          cohortAvg: t.cohort_avg, passRate: t.pass_rate,
        })),
        hardestQuestions: (d.hardest_questions ?? []).map((q: any) => ({
          questionId:    q.question_id,
          pctCorrect:    q.pct_correct,
          totalAttempts: q.total_attempts ?? 0,
          stem:          q.stem ?? '',
          explanation:   q.explanation ?? '',
          category:      q.category ?? '',
          difficulty:    q.difficulty ?? 'intermediate',
          options: (q.options ?? []).map((o: any) => ({
            letter: o.letter, text: o.text ?? '', isCorrect: !!o.is_correct,
          })),
        })),
        allQuestions: (d.all_questions ?? []).map((q: any) => ({
          questionId:    q.question_id,
          pctCorrect:    q.pct_correct,
          totalAttempts: q.total_attempts ?? 0,
          stem:          q.stem ?? '',
          explanation:   q.explanation ?? '',
          category:      q.category ?? '',
          difficulty:    q.difficulty ?? 'intermediate',
          options: (q.options ?? []).map((o: any) => ({
            letter: o.letter, text: o.text ?? '', isCorrect: !!o.is_correct,
          })),
        })),
        studentScores: (d.student_scores ?? []).map((s: any) => ({
          name: s.name, score: s.score, passed: s.passed, userId: s.user_id ?? 0,
          avatarUrl: s.avatar_url ?? null,
          change: (s.change ?? s.vs_prev ?? null) as number | null,
        })),
        incompleteStudents: (d.incomplete_students ?? []).map((x: any) =>
          typeof x === 'string' ? { name: x, avatarUrl: null } : { name: x.name, avatarUrl: x.avatar_url ?? null }),
      }
      useHead({ title: `${exam.value.name} · Passmed Institute` })
    } else {
      error.value = true
    }
  } catch { error.value = true }
  finally { loading.value = false }
}

onMounted(fetchExam)

// ── Student profile (drawer + full page) ──────────────────────────────────────
const router         = useRouter()
const drawerOpen     = ref(false)
const profileFull    = ref(false)
const profile        = ref<any | null>(null)
const profileLoading = ref(false)
const profileUserId  = ref<number | null>(null)

async function openStudent(userId: number) {
  if (!userId) return
  drawerOpen.value = true
  profileFull.value = false
  profileLoading.value = true
  profile.value = null
  profileUserId.value = userId
  fetchCohorts()
  try {
    const res = await api<any>(`/institution-students/${userId}/profile`)
    if (res?.status === 'success') profile.value = res.data
  } catch { /* ignore */ }
  finally { profileLoading.value = false }
}

// Cohort assign/change from the profile panel.
const cohorts = ref<{ id: number; name: string }[]>([])
const cohortBusy = ref(false)
async function fetchCohorts() {
  if (cohorts.value.length) return
  try {
    const res = await api<any>('/cohorts')
    const list = res?.data ?? res ?? []
    cohorts.value = (Array.isArray(list) ? list : []).map((c: any) => ({ id: c.id, name: c.name }))
  } catch { /* ignore */ }
}
async function changeCohort(targetId: number) {
  const p = profile.value
  if (!p || !targetId || cohortBusy.value || !p.seat_id || targetId === p.cohort_id) return
  cohortBusy.value = true
  const prevName = p.cohort_name
  try {
    const res = p.cohort_id
      ? await api<any>(`/cohorts/${p.cohort_id}/students/${p.seat_id}/move`, { method: 'POST', body: { target_cohort_id: targetId } })
      : await api<any>(`/cohorts/${targetId}/students`, { method: 'POST', body: { user_id: p.user_id ?? p.id } })
    if (res?.status === 'success') {
      const name = cohorts.value.find(c => c.id === targetId)?.name ?? ''
      if (prevName && p.meta && p.meta.includes(prevName)) p.meta = p.meta.replace(prevName, name)
      else if (name) p.meta = p.meta ? `${name} · ${p.meta}` : name
      p.cohort_id = targetId
      p.cohort_name = name
      showToast('Moved to ' + name, 'var(--teal)')
    } else {
      showToast(res?.message || 'Could not update cohort', 'var(--rose)')
    }
  } catch {
    showToast('Could not update cohort — try again', 'var(--rose)')
  } finally {
    cohortBusy.value = false
  }
}

// Real "Send check-in email" — emails the resident + drops an in-app notification.
const checkinBusy = ref(false)
async function sendCheckin() {
  const id = profileUserId.value
  if (!id) { showToast('No account for this student yet', 'var(--amber)'); return }
  if (checkinBusy.value) return          // guard against double-clicks
  checkinBusy.value = true
  try {
    const res = await api<any>(`/students/${id}/checkin`, { method: 'POST' })
    if (res?.status === 'success') showToast('Check-in email sent to ' + (profile.value?.name ?? 'student'), 'var(--teal)')
    else showToast(res?.message || 'Could not send check-in', 'var(--rose)')
  } catch {
    showToast('Could not send check-in — try again', 'var(--rose)')
  } finally {
    checkinBusy.value = false
  }
}
function closeDrawer() { drawerOpen.value = false }
function viewFullProfile() { drawerOpen.value = false; profileFull.value = true }
function backFromProfile() { profileFull.value = false }
function goAssign() { router.push('/institute/assign-exams') }
function accColor(p: number) {
  if (p >= 80) return 'var(--green)'
  if (p >= 70) return 'var(--teal)'
  if (p >= 60) return 'var(--amber)'
  return 'var(--rose)'
}
function statusPillStyle(risk: string) {
  if (risk === 'high')   return 'background:var(--rose-light);color:var(--rose);border-color:var(--rose-border);'
  if (risk === 'medium') return 'background:var(--amber-light);color:var(--amber);border-color:var(--amber-border);'
  return 'background:var(--green-light);color:var(--green);border-color:var(--green-border);'
}
const profileTrend = computed(() => {
  const pts = (profile.value?.score_trend ?? []) as { label: string; value: number }[]
  const W = 520, H = 92, PAD = { t: 16, r: 16, b: 26, l: 26 }
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b
  const minV = 40, maxV = 100
  const n = pts.length
  const toX = (i: number) => n <= 1 ? PAD.l + cW / 2 : PAD.l + (i / (n - 1)) * cW
  const toY = (v: number) => PAD.t + cH - ((v - minV) / (maxV - minV)) * cH
  const dots = pts.map((p, i) => ({ x: +toX(i).toFixed(1), y: +toY(p.value).toFixed(1), v: p.value, label: p.label }))
  const line = dots.map(d => `${d.x},${d.y}`).join(' ')
  const baseY = +(PAD.t + cH).toFixed(1)
  const area = dots.length > 1
    ? `${dots[0].x},${baseY} ${line} ${dots[dots.length - 1].x},${baseY}`
    : ''
  const grid = [50, 65, 80].map(v => ({ v, y: +toY(v).toFixed(1) }))
  const passY = +toY(65).toFixed(1)
  return { W, H, PAD, cW, cH, dots, line, area, grid, passY }
})
const engMax = computed(() =>
  Math.max(1, ...((profile.value?.engagement ?? []).map((d: any) => d.count)))
)


// ── Declare results ────────────────────────────────────────────────────────────
const declaring = ref(false)
const toast = ref<{ text: string; color: string } | null>(null)

async function declareResults() {
  if (!exam.value || declaring.value) return
  declaring.value = true
  try {
    const res = await api<any>(`/mock-exams/${exam.value.id}/declare-results`, { method: 'POST' })
    if (res?.status === 'success') {
      exam.value.canDeclare = false
      showToast(`Results declared for ${res.declared_count} student(s)`, 'var(--green)')
    } else {
      showToast(res?.message ?? 'Could not declare results', 'var(--rose)')
    }
  } catch {
    showToast('Error declaring results', 'var(--rose)')
  } finally {
    declaring.value = false
  }
}

function showToast(text: string, color = 'var(--teal)') {
  toast.value = { text, color }
  setTimeout(() => { toast.value = null }, 2400)
}

// ── Delete this exam (cascades: unassigns every student) ────────────────────────
const confirmDel = ref(false)
const deleting   = ref(false)
async function doDelete() {
  if (!exam.value || deleting.value) return
  deleting.value = true
  try {
    const res = await api<any>(`/mock-exams/${exam.value.id}`, { method: 'DELETE' })
    if (res?.status === 'success') {
      router.push('/institute/mock-exams')
    } else {
      showToast(res?.message ?? 'Could not delete exam', 'var(--rose)')
      deleting.value = false
    }
  } catch (e: any) {
    const code = e?.response?.status ?? e?.statusCode
    if (code === 403) {
      showToast("You don't have permission to delete exams.", 'var(--rose)')
      deleting.value = false
    } else if (code === 404) {
      // Already gone — nothing left to show on this detail page; go back to the list.
      router.push('/institute/mock-exams')
    } else {
      showToast(e?.data?.message || 'Error deleting exam', 'var(--rose)')
      deleting.value = false
    }
  }
}

// ── Question preview modal ───────────────────────────────────────────────────────
const modalIdx = ref<number | null>(null)
// Preview modal walks the FULL assigned set (so it works before anyone sits it).
const modalQ = computed<HardQuestion | null>(() =>
  modalIdx.value === null ? null : (exam.value?.allQuestions[modalIdx.value] ?? null)
)
function openQ(i: number) { modalIdx.value = i }
function closeQ() { modalIdx.value = null }
function navQ(delta: number) {
  if (modalIdx.value === null || !exam.value) return
  const n = exam.value.allQuestions.length
  modalIdx.value = Math.max(0, Math.min(n - 1, modalIdx.value + delta))
}

// ── "All Questions" card pagination ──────────────────────────────────────────
const qPage     = ref(1)
const qPageSize  = 10
const qTotalPages = computed(() => Math.max(1, Math.ceil((exam.value?.allQuestions.length ?? 0) / qPageSize)))
const pagedQuestions = computed(() => {
  const all = exam.value?.allQuestions ?? []
  const start = (qPage.value - 1) * qPageSize
  return all.slice(start, start + qPageSize)
})
// Keep the page in range if the data changes.
watch(qTotalPages, (tp) => { if (qPage.value > tp) qPage.value = 1 })

// Question stems/explanations are stored as HTML. This view shows them via {{ }},
// so strip the tags to plain text (otherwise "<p>…" prints literally). Paragraph
// breaks → newlines, other tags dropped, entities decoded. Not v-html → no XSS.
function plain(input: unknown): string {
  const s = input == null ? '' : String(input)
  if (!s) return ''
  let t = s
    .replace(/\s*<\/p\s*>\s*<p[^>]*>\s*/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/?[^>]+>/g, '')
  if (import.meta.client && t.includes('&')) {
    const el = document.createElement('textarea')
    el.innerHTML = t
    t = el.value
  }
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ── Review-all modal (every hardest question with options + explanation) ─────────
const reviewOpen = ref(false)
// Review-all shows every question in the exam (falls back to the hardest set).
const reviewList = computed<HardQuestion[]>(() => {
  const all = exam.value?.allQuestions ?? []
  return all.length ? all : (exam.value?.hardestQuestions ?? [])
})
const reviewStats = computed(() => {
  const qs = reviewList.value
  if (!qs.length) return { count: 0, avg: 0, hardest: 0 }
  // avg/hardest only over ATTEMPTED questions (unattempted have pctCorrect = null).
  const attempted = qs.filter(q => q.totalAttempts > 0 && q.pctCorrect != null)
  return {
    count:   qs.length,
    avg:     attempted.length ? Math.round(attempted.reduce((a, q) => a + (q.pctCorrect ?? 0), 0) / attempted.length) : 0,
    hardest: attempted.length ? Math.min(...attempted.map(q => q.pctCorrect ?? 0)) : 0,
  }
})
function diffBg(d: string)    { const v=String(d||'').toLowerCase(); if(v==='advanced'||v==='hard')return 'var(--rose-light)'; if(v==='expert')return 'var(--purple-light)'; if(v==='intermediate'||v==='medium')return 'var(--amber-pale)'; return 'var(--green-light)' }
function diffColor(d: string) { const v=String(d||'').toLowerCase(); if(v==='advanced'||v==='hard')return 'var(--rose)'; if(v==='expert')return 'var(--purple)'; if(v==='intermediate'||v==='medium')return 'var(--amber)'; return 'var(--green)' }
function diffLabel(d: string) { const v=String(d||'').trim(); if(!v)return ''; const m:Record<string,string>={easy:'Foundation',medium:'Intermediate',hard:'Advanced',foundation:'Foundation',intermediate:'Intermediate',advanced:'Advanced',expert:'Expert'}; return m[v.toLowerCase()] ?? (v.charAt(0).toUpperCase()+v.slice(1).toLowerCase()) }
function scrollToQ(i: number) {
  document.getElementById(`raq-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function avgColor(avg: number) {
  if (avg >= 70) return 'var(--green)'
  if (avg >= 65) return 'var(--teal-mid)'
  if (avg >= 55) return 'var(--amber)'
  return 'var(--rose)'
}
function avgBarColor(avg: number) {
  if (avg >= 70) return 'var(--green)'
  if (avg >= 65) return 'var(--teal)'
  if (avg >= 55) return 'var(--amber)'
  return 'var(--rose)'
}
function topicAvgBg(avg: number) {
  if (avg >= 70) return 'var(--green-light)'
  if (avg >= 65) return 'var(--teal-pale)'
  if (avg >= 55) return 'var(--amber-light)'
  return 'var(--rose-light)'
}
function distBarColor(risk: DistRisk) {
  if (risk === 'high')   return 'var(--rose)'
  if (risk === 'medium') return 'var(--amber)'
  if (risk === 'strong') return 'var(--green)'
  return 'var(--teal)'
}
function scoreColor(sc: number) {
  if (sc >= 80) return 'var(--green)'
  if (sc >= 65) return 'var(--teal-mid)'
  if (sc >= 55) return 'var(--amber)'
  return 'var(--rose)'
}
function scoreBg(sc: number) {
  if (sc >= 80) return 'var(--green-light)'
  if (sc >= 65) return 'var(--teal-pale)'
  if (sc >= 55) return 'var(--amber-light)'
  return 'var(--rose-light)'
}
function pctColor(p: number) {
  if (p < 45) return 'var(--rose)'
  if (p < 60) return 'var(--amber)'
  return 'var(--teal-mid)'
}
function pctBg(p: number) {
  if (p < 45) return 'var(--rose-light)'
  if (p < 60) return 'var(--amber-pale)'
  return 'var(--teal-pale)'
}
function pctBorder(p: number) {
  if (p < 45) return 'var(--rose-border)'
  if (p < 60) return 'var(--amber-border)'
  return 'var(--teal-border)'
}
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

const distMax = computed(() =>
  Math.max(1, ...(exam.value?.scoreDistribution.map(d => d.count) ?? []))
)
const passedCount = computed(() => exam.value?.studentScores.filter(s => s.passed).length ?? 0)
const insightText = computed(() => {
  const p = modalQ.value?.pctCorrect ?? 0
  if (p < 50) return 'This was one of the most challenging questions in the exam. Most residents selected an incorrect option.'
  if (p < 65) return 'Below the pass threshold — a significant proportion of residents answered incorrectly.'
  return 'Most residents answered correctly, though there is room for improvement.'
})
</script>

<template>
  <div class="main">

    <div class="content">

      <!-- ── Loading skeleton ──────────────────────────────────────────────── -->
      <div v-if="loading">
        <div class="sk" style="width:200px;height:30px;margin-bottom:18px;border-radius:8px;"></div>
        <div class="sk" style="width:100%;height:96px;border-radius:14px;margin-bottom:16px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1.6fr;gap:16px;margin-bottom:16px;">
          <div class="sk" style="height:220px;border-radius:12px;"></div>
          <div class="sk" style="height:220px;border-radius:12px;"></div>
        </div>
        <div class="sk" style="width:100%;height:180px;border-radius:12px;"></div>
      </div>

      <!-- ── Error state ────────────────────────────────────────────────────── -->
      <div v-else-if="error || !exam" style="padding:80px;text-align:center;">
        <div style="font-size:2.2rem;margin-bottom:12px;">⚠️</div>
        <div style="font-size:0.88rem;font-weight:700;color:var(--ink-dim);">Exam not found</div>
        <div style="font-size:0.73rem;color:var(--ink-faint);margin-top:4px;">This exam may have been removed or you don't have access.</div>
        <NuxtLink to="/institute/mock-exams" class="hdr-btn hdr-primary" style="display:inline-flex;margin-top:20px;">
          ← Back to Mock Exams
        </NuxtLink>
      </div>

      <template v-else>
        <!-- ═══════════ Normal detail view ═══════════ -->
        <div v-if="!reviewOpen && !profileFull" style="animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;">

          <!-- ── Back + breadcrumb row ──────────────────────────────────────── -->
          <div class="back-row">
            <NuxtLink to="/institute/mock-exams" class="back-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              All Exams
            </NuxtLink>
            <span class="back-sep">›</span>
            <span class="back-name">{{ exam.name }}</span>
            <!-- Delete moved here from the topbar (topbar is now shared in the layout). -->
            <button v-if="exam" type="button" class="tb-del-btn" style="margin-left:auto;" @click="confirmDel = true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              Delete
            </button>
          </div>

          <!-- ── Navy gradient header card ──────────────────────────────────── -->
          <div class="hero-card">
            <div class="hero-left">
              <div class="hero-title">{{ exam.name }}</div>
              <div class="hero-meta">
                {{ exam.date }} · {{ exam.questions }} questions · {{ exam.duration }} · {{ exam.completed }}/{{ exam.total }} residents completed
              </div>
            </div>
            <div class="hero-stats">
              <div class="hero-stat">
                <div class="hero-stat-label">Cohort Avg</div>
                <div class="hero-stat-val" style="color:var(--teal);">{{ exam.cohortAvg }}%</div>
              </div>
              <div class="hero-stat">
                <div class="hero-stat-label">Pass Rate</div>
                <div class="hero-stat-val" :style="{ color: exam.passRate >= 75 ? 'var(--green)' : exam.passRate >= 65 ? 'var(--teal-mid)' : 'var(--rose)' }">{{ exam.passRate }}%</div>
              </div>
              <div class="hero-stat">
                <div class="hero-stat-label">Pass Mark</div>
                <div class="hero-stat-val" style="color:var(--amber);">{{ exam.passMarkValue }}%</div>
              </div>
            </div>
          </div>

          <!-- ── Row: Distribution + Topic Breakdown ────────────────────────── -->
          <div class="dist-topic-grid">

            <!-- Score distribution -->
            <div class="card">
              <div class="card-head">
                <div>
                  <div class="card-title">Score Distribution</div>
                  <div class="card-sub">{{ exam.completed }} residents</div>
                </div>
                <div class="dist-legend">
                  <span style="color:var(--rose);">■ Risk</span>
                  <span style="color:var(--teal);">■ Pass</span>
                  <span style="color:var(--green);">■ Strong</span>
                </div>
              </div>

              <div v-if="exam.scoreDistribution.every(b => b.count === 0)" class="empty-hint">
                No scores yet — available once students complete the exam.
              </div>
              <template v-else>
                <div class="dist-chart">
                  <div v-for="d in exam.scoreDistribution" :key="d.band" class="dist-col-item">
                    <div class="dist-count" :style="{ color: distBarColor(d.risk) }">{{ d.count }}</div>
                    <div
                      class="dist-bar"
                      :style="{
                        height: d.count === 0 ? '0px' : Math.max(4, Math.round((d.count / distMax) * 80)) + 'px',
                        background: distBarColor(d.risk),
                      }"
                    ></div>
                  </div>
                </div>
                <div class="dist-labels">
                  <div v-for="d in exam.scoreDistribution" :key="d.band">{{ d.band }}</div>
                </div>
              </template>
            </div>

            <!-- Topic breakdown -->
            <div class="card" style="padding:0;overflow:hidden;">
              <div class="card-head" style="padding:16px 18px 12px;">
                <div>
                  <div class="card-title">Topic Breakdown</div>
                  <div class="card-sub">Cohort avg &amp; pass rate by subject area</div>
                </div>
              </div>

              <div v-if="!exam.topicBreakdown.length" class="empty-hint" style="padding:0 18px 18px;">
                Topic data is not yet available. It appears once students complete the exam.
              </div>
              <table v-else class="topic-table">
                <thead>
                  <tr>
                    <th style="text-align:left;">Topic</th>
                    <th style="text-align:center;">Qs</th>
                    <th>Cohort Avg</th>
                    <th style="text-align:center;">Pass Rate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in exam.topicBreakdown" :key="t.topic">
                    <td class="t-topic">{{ t.topic }}</td>
                    <td class="t-qs mono">{{ t.questions }}</td>
                    <td>
                      <div class="t-avg">
                        <div class="t-bar-bg">
                          <div class="t-bar-fill" :style="{ width: Math.round((t.cohortAvg / 100) * 100) + '%', background: avgBarColor(t.cohortAvg) }"></div>
                        </div>
                        <span class="mono" :style="{ color: avgColor(t.cohortAvg), fontWeight: 700, fontSize: '0.74rem' }">{{ t.cohortAvg }}%</span>
                      </div>
                    </td>
                    <td style="text-align:center;">
                      <span class="t-pass" :style="{ background: topicAvgBg(t.passRate), color: avgColor(t.passRate) }">{{ t.passRate }}%</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- ── All Questions ──────────────────────────────────────────────── -->
          <div class="card" style="margin-top:16px;">
            <div class="card-head">
              <div>
                <div class="card-title">All Questions</div>
                <div class="card-sub">
                  {{ exam.allQuestions.length ? `${exam.allQuestions.length} assigned · click any question to preview` : 'No questions assigned' }}
                </div>
              </div>
              <button type="button" v-if="exam.allQuestions.length" class="review-all-btn" @click="reviewOpen = true">Review all →</button>
            </div>

            <div v-if="!exam.allQuestions.length" class="empty-hint">
              No questions are assigned to this exam yet.
            </div>

            <div v-else>
              <div
                v-for="(q, qi) in pagedQuestions" :key="q.questionId"
                class="hq-row" @click="openQ((qPage - 1) * qPageSize + qi)"
              >
                <div class="hq-num mono">Q{{ (qPage - 1) * qPageSize + qi + 1 }}</div>
                <div class="hq-main">
                  <div class="hq-stem">{{ plain(q.stem) }}</div>
                  <div class="hq-topic">{{ q.category }}</div>
                </div>
                <div class="hq-right">
                  <div style="text-align:right;">
                    <template v-if="q.totalAttempts > 0">
                      <div class="hq-pct mono" :style="{ color: (q.pctCorrect ?? 0) < 45 ? 'var(--rose)' : (q.pctCorrect ?? 0) < 60 ? 'var(--amber)' : 'var(--teal-mid)' }">{{ q.pctCorrect }}%</div>
                      <div class="hq-pct-sub">correct</div>
                    </template>
                    <div v-else class="hq-pct-sub">not attempted</div>
                  </div>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
              </div>

              <!-- Pagination -->
              <div v-if="qTotalPages > 1" class="hq-pagination">
                <button type="button" class="hq-pg-btn" :disabled="qPage === 1" @click="qPage--">← Prev</button>
                <span class="hq-pg-info">Page {{ qPage }} of {{ qTotalPages }}</span>
                <button type="button" class="hq-pg-btn" :disabled="qPage === qTotalPages" @click="qPage++">Next →</button>
              </div>
            </div>
          </div>

          <!-- ── Individual Scores ──────────────────────────────────────────── -->
          <div v-if="exam.studentScores.length" class="card" style="padding:0;overflow:hidden;margin-top:16px;">
            <div class="is-head">
              <div class="card-title">Individual Scores</div>
              <div class="card-sub">{{ passedCount }} passed · sorted by score</div>
            </div>

            <div class="is-scroll">
              <table class="is-table">
                <thead>
                  <tr>
                    <th style="text-align:left;">Resident</th>
                    <th style="text-align:center;">Score</th>
                    <th style="text-align:center;">vs Prev</th>
                    <th style="text-align:center;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(s, i) in exam.studentScores" :key="s.name" class="is-row" @click="openStudent(s.userId)">
                    <td>
                      <div class="is-name">
                        <span class="is-rank mono">{{ i + 1 }}</span>
                        <span class="is-avatar">
                          <img v-if="s.avatarUrl" :src="s.avatarUrl" :alt="s.name" class="is-avatar-img" />
                          <template v-else>{{ initials(s.name) }}</template>
                        </span>
                        <span class="is-fullname">{{ s.name }}</span>
                      </div>
                    </td>
                    <td style="text-align:center;">
                      <span class="is-score mono" :style="{ background: scoreBg(s.score), color: scoreColor(s.score) }">{{ s.score }}%</span>
                    </td>
                    <td style="text-align:center;">
                      <span v-if="s.change === null || s.change === 0" style="color:var(--ink-faint);" class="mono">—</span>
                      <span v-else class="mono" :style="{ color: s.change > 0 ? 'var(--green)' : 'var(--rose)', fontWeight: 700 }">
                        {{ s.change > 0 ? '+' : '' }}{{ s.change }}%
                      </span>
                    </td>
                    <td style="text-align:center;">
                      <span class="status-pill" :style="s.passed
                        ? 'background:var(--green-light);color:var(--green);border-color:var(--green-border);'
                        : (s.score >= 55 ? 'background:var(--amber-light);color:var(--amber);border-color:var(--amber-border);' : 'background:var(--rose-light);color:var(--rose);border-color:var(--rose-border);')">
                        <span class="status-dot"></span>{{ s.passed ? 'Pass' : (s.score >= 55 ? 'Borderline' : 'Below') }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Did not complete -->
            <div v-if="exam.incompleteStudents.length" class="dnc">
              <div class="dnc-head">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span class="dnc-title">Did not complete</span>
                <span class="dnc-count">{{ exam.incompleteStudents.length }} resident{{ exam.incompleteStudents.length !== 1 ? 's' : '' }}</span>
              </div>
              <div class="dnc-chips">
                <div v-for="n in exam.incompleteStudents" :key="n.name" class="dnc-chip">
                  <span class="dnc-avatar">
                    <img v-if="n.avatarUrl" :src="n.avatarUrl" :alt="n.name" class="dnc-avatar-img" />
                    <template v-else>{{ initials(n.name) }}</template>
                  </span>
                  <span>{{ n.name }}</span>
                  <span style="color:var(--amber);font-weight:700;">—</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- ═══════════ Review-all full page (replaces detail; "Back to exam" returns) ═══════════ -->
        <div v-else-if="reviewOpen" style="animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;max-width:840px;">

          <!-- Back to exam breadcrumb -->
          <div class="back-row">
            <button type="button" class="back-btn" @click="reviewOpen = false">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Back to exam
            </button>
            <span class="back-sep">›</span>
            <span class="back-name">{{ exam.name }}</span>
            <span class="back-sep">›</span>
            <span style="font-size:0.78rem;color:var(--ink-dim);">All Questions</span>
          </div>

          <!-- Title -->
          <div style="margin-bottom:22px;">
            <div class="page-title">Question Review</div>
            <div class="page-sub">{{ reviewStats.count }} questions · {{ exam.name }} · {{ exam.date }} · with answer options and explanations</div>
          </div>

          <!-- Stats -->
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
            <div class="stat-card c-teal" style="padding:12px 16px;"><div class="stat-label">Questions</div><div class="stat-val" style="font-size:1.3rem;">{{ reviewStats.count }}</div></div>
            <div class="stat-card c-rose" style="padding:12px 16px;"><div class="stat-label">Avg Correct Rate</div><div class="stat-val" style="font-size:1.3rem;">{{ reviewStats.avg }}%</div></div>
            <div class="stat-card c-amber" style="padding:12px 16px;"><div class="stat-label">Hardest</div><div class="stat-val" style="font-size:1.3rem;color:var(--rose);">{{ reviewStats.hardest }}%</div></div>
          </div>

          <!-- Question cards -->
          <div v-for="(q, qi) in reviewList" :key="q.questionId" :id="`raq-${qi}`" class="ra-card">
            <div class="ra-card-tags">
              <span class="mono ra-qnum">Q{{ qi + 1 }}</span>
              <span v-if="q.totalAttempts > 0" class="ra-tag" :style="{ background: pctBg(q.pctCorrect ?? 0), color: pctColor(q.pctCorrect ?? 0), borderColor: pctBorder(q.pctCorrect ?? 0) }">{{ q.pctCorrect }}% correct</span>
              <span v-else class="ra-tag" style="background:var(--surface);color:var(--ink-dim);border-color:var(--border);">Not attempted</span>
              <span class="ra-tag" :style="{ background: diffBg(q.difficulty), color: diffColor(q.difficulty), borderColor: 'transparent' }">{{ diffLabel(q.difficulty) }}</span>
              <span v-if="q.category" class="ra-tag" style="background:var(--surface);color:var(--ink-dim);border-color:var(--border);">{{ q.category }}</span>
              <div v-if="q.totalAttempts > 0" class="ra-bar-wrap">
                <div class="ra-bar-bg"><div class="ra-bar-fill" :style="{ width: (q.pctCorrect ?? 0) + '%', background: pctColor(q.pctCorrect ?? 0) }"></div></div>
                <span class="mono" :style="{ color: pctColor(q.pctCorrect ?? 0), fontSize: '0.68rem', fontWeight: 700 }">{{ q.pctCorrect }}%</span>
              </div>
            </div>

            <div class="ra-stem">{{ plain(q.stem) }}</div>

            <div v-if="q.options.length" class="q-opts" style="margin-bottom:14px;">
              <div v-for="opt in q.options" :key="opt.letter" class="q-opt" :class="{ 'q-opt-correct': opt.isCorrect }">
                <span class="q-opt-letter" :style="{ background: opt.isCorrect ? 'var(--teal)' : 'var(--surface)', color: opt.isCorrect ? '#fff' : 'var(--ink-dim)', borderColor: opt.isCorrect ? 'var(--teal)' : 'var(--border)' }">{{ opt.letter }}</span>
                <span class="q-opt-text" :style="{ color: opt.isCorrect ? 'var(--teal-dark)' : 'var(--ink)', fontWeight: opt.isCorrect ? 700 : 400 }">{{ opt.text }}</span>
                <span v-if="opt.isCorrect" class="q-opt-correct-tag">✓ Correct</span>
              </div>
            </div>

            <template v-if="q.explanation">
              <!-- Label sits OUTSIDE the box (mirrors the per-question modal) so
                   .q-expl wraps only the interpolated text — white-space:pre-line
                   then preserves the backend's \n breaks cleanly, with no stray
                   template-indentation gaps around the label. -->
              <div class="q-modal-section-label" style="margin-top:0;color:var(--teal-mid);">Explanation</div>
              <div class="q-expl">{{ plain(q.explanation) }}</div>
            </template>

            <div class="ra-card-foot">
              <span>{{ qi + 1 }} of {{ reviewStats.count }}</span>
              <div class="ra-card-nav">
                <button type="button" v-if="qi > 0" class="q-nav-btn" @click="scrollToQ(qi - 1)">← Prev</button>
                <button type="button" v-if="qi < reviewStats.count - 1" class="q-nav-btn" @click="scrollToQ(qi + 1)">Next →</button>
              </div>
            </div>
          </div>
        </div>
        <!-- ═══════════ Student full profile (replaces detail) ═══════════ -->
        <div v-else style="animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;">
          <div class="back-row">
            <button type="button" class="back-btn" @click="backFromProfile">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Back to exam
            </button>
            <span class="back-sep">›</span>
            <span class="back-name">{{ profile?.name || 'Student' }}</span>
          </div>

          <div v-if="profileLoading" class="empty-hint">Loading profile…</div>

          <template v-else-if="profile">
            <div class="hero-card" style="margin-bottom:16px;">
              <div class="hero-left" style="display:flex;align-items:center;gap:16px;">
                <div class="fp-avatar">
                  <img v-if="profile.avatar_url" :src="profile.avatar_url" :alt="profile.name" class="fp-avatar-img" />
                  <template v-else>{{ profile.initials }}</template>
                </div>
                <div>
                  <div class="hero-title">{{ profile.name }}</div>
                  <div class="hero-meta">{{ profile.meta || '—' }}</div>
                  <span class="sd-status" :style="statusPillStyle(profile.risk)" style="margin-top:6px;"><span class="status-dot"></span>{{ profile.status_label }}</span>
                </div>
              </div>
              <div class="hero-stats">
                <div class="hero-stat"><div class="hero-stat-label">Avg Score</div><div class="hero-stat-val" style="color:var(--teal);">{{ profile.avg_score }}%</div></div>
                <div class="hero-stat"><div class="hero-stat-label">Qs Done</div><div class="hero-stat-val" style="color:var(--teal);">{{ profile.qs_answered.toLocaleString() }}</div></div>
                <div class="hero-stat"><div class="hero-stat-label">Streak</div><div class="hero-stat-val" style="color:var(--teal);">{{ profile.streak }}</div></div>
              </div>
            </div>

            
            <!-- Row 1: Score Trend + Weekly Engagement -->
            <div class="dist-topic-grid" style="grid-template-columns:1fr 1fr;margin-bottom: 16px;">
              <div class="card">
                <div class="card-title">Score Trend</div>
                <div class="card-sub" style="margin-bottom:10px;">Monthly average · pass mark 65%</div>
                <svg v-if="profileTrend.dots.length" width="100%" :viewBox="`0 0 ${profileTrend.W} ${profileTrend.H}`" preserveAspectRatio="xMidYMid meet" style="display:block;max-height:130px;overflow:visible;">
                  <!-- y gridlines -->
                  <line v-for="g in profileTrend.grid" :key="'g'+g.v" :x1="profileTrend.PAD.l" :y1="g.y" :x2="profileTrend.PAD.l + profileTrend.cW" :y2="g.y" stroke="var(--border)" stroke-width="1"/>
                  <!-- pass line -->
                  <line :x1="profileTrend.PAD.l" :y1="profileTrend.passY" :x2="profileTrend.PAD.l + profileTrend.cW" :y2="profileTrend.passY" stroke="var(--amber)" stroke-width="1.5" stroke-dasharray="4,3"/>
                  <!-- area + line (>=2 pts) -->
                  <polygon v-if="profileTrend.dots.length > 1" :points="profileTrend.area" fill="var(--teal)" fill-opacity="0.10"/>
                  <polyline v-if="profileTrend.dots.length > 1" :points="profileTrend.line" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                  <template v-for="d in profileTrend.dots" :key="d.label">
                    <circle :cx="d.x" :cy="d.y" r="4" fill="var(--teal)" stroke="#fff" stroke-width="2"/>
                    <text :x="d.x" :y="d.y - 9" text-anchor="middle" font-size="9" font-weight="800" fill="var(--teal-dark)" font-family="Figtree,sans-serif">{{ d.v }}%</text>
                    <text :x="d.x" :y="profileTrend.PAD.t + profileTrend.cH + 16" text-anchor="middle" font-size="9" fill="#7a95ad" font-family="Figtree,sans-serif">{{ d.label }}</text>
                  </template>
                </svg>
                <div v-else class="sd-empty">Not enough data yet.</div>
              </div>

              <div class="card">
                <div class="card-title">Weekly Engagement</div>
                <div class="card-sub" style="margin-bottom:14px;">Questions answered · last 7 days</div>
                <div class="we-chart">
                  <div v-for="(d, di) in profile.engagement" :key="di" class="we-col">
                    <div class="we-count">{{ d.count || '' }}</div>
                    <div class="we-bar" :style="{ height: (d.count ? Math.max(6, Math.round(d.count / engMax * 64)) : 3) + 'px', background: d.count ? 'var(--teal)' : 'var(--border)' }"></div>
                    <div class="we-lbl">{{ d.label }}</div>
                  </div>
                </div>
                <div class="sd-eng-note">{{ profile.week_qs }} questions this week</div>
              </div>
            </div>

            <div class="dist-topic-grid" style="grid-template-columns:1fr 1fr;">
              <div class="card">
                <div class="card-title">Topic Accuracy</div>
                <div class="card-sub" style="margin-bottom:14px;">Performance by subject area</div>
                <div v-if="profile.topic_accuracy.length">
                  <div v-for="t in profile.topic_accuracy" :key="t.topic" class="sd-topic">
                    <span class="sd-topic-name">{{ t.topic }}</span>
                    <div class="sd-topic-bar"><div :style="{ width: t.pct + '%', background: accColor(t.pct) }"></div></div>
                    <span class="sd-topic-pct mono" :style="{ color: accColor(t.pct) }">{{ t.pct }}%</span>
                  </div>
                </div>
                <div v-else class="sd-empty">No topic data yet.</div>
              </div>

              <div class="card">
                <div class="card-title">Exam History</div>
                <div class="card-sub" style="margin-bottom:14px;">Recent mock exam scores</div>
                <div v-if="profile.mock_history.length">
                  <div v-for="(m, mi) in profile.mock_history" :key="mi" class="sd-mock">
                    <span class="sd-mock-score mono" :style="{ color: accColor(m.score) }">{{ m.score }}%</span>
                    <div><div class="sd-mock-name">{{ m.name }}</div><div class="sd-mock-date">{{ m.date }}{{ m.timed ? ' · Timed' : '' }}</div></div>
                  </div>
                </div>
                <div v-else class="sd-empty">No mock exams completed yet.</div>
              </div>
            </div>

            <div class="card" style="margin-top:16px;">
              <div class="card-title" style="margin-bottom:12px;">Actions</div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                <button type="button" class="sd-action-primary" style="width:auto;margin:0;padding:9px 16px;" :disabled="checkinBusy" @click="sendCheckin()">{{ checkinBusy ? 'Sending…' : 'Send check-in email' }}</button>
                <button type="button" class="sd-action" style="flex:0 0 auto;padding:9px 16px;" @click="goAssign">Assign targeted exam</button>
                <select v-if="profile.seat_id" class="sd-cohort-select" style="flex:0 0 auto;margin:0;width:auto;" :value="profile.cohort_id ?? ''" :disabled="cohortBusy"
                  @change="changeCohort(+($event.target as HTMLSelectElement).value)">
                  <option value="" disabled>{{ profile.cohort_id ? 'Change cohort…' : 'Assign cohort…' }}</option>
                  <option v-for="c in cohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
            </div>
            
          </template>
        </div>

      </template>

    </div><!-- end content -->

    <!-- ── Question preview modal ────────────────────────────────────────────── -->
    <Transition name="modal">
      <div v-if="modalQ" class="q-overlay" @click.self="closeQ">
        <div class="q-modal">
          <div class="q-modal-head">
            <div class="q-modal-tags">
              <span class="mono q-modal-qnum">Q{{ (modalIdx ?? 0) + 1 }}</span>
              <span v-if="modalQ.totalAttempts > 0" class="q-modal-pct" :style="{ background: pctBg(modalQ.pctCorrect ?? 0), color: pctColor(modalQ.pctCorrect ?? 0), borderColor: pctBorder(modalQ.pctCorrect ?? 0) }">{{ modalQ.pctCorrect }}% correct</span>
              <span v-else class="q-modal-pct" style="background:var(--surface);color:var(--ink-dim);border-color:var(--border);">Not attempted</span>
              <span v-if="modalQ.category" class="q-modal-topic">{{ modalQ.category }}</span>
            </div>
            <button type="button" class="q-close" @click="closeQ" aria-label="Close">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="q-modal-body">
            <div class="q-modal-stem">{{ plain(modalQ.stem) }}</div>

            <!-- Options (if available) -->
            <template v-if="modalQ.options.length">
              <div class="q-modal-section-label">Answer options</div>
              <div class="q-opts">
                <div v-for="opt in modalQ.options" :key="opt.letter" class="q-opt" :class="{ 'q-opt-correct': opt.isCorrect }">
                  <span class="q-opt-letter" :style="{ background: opt.isCorrect ? 'var(--teal)' : 'var(--surface)', color: opt.isCorrect ? '#fff' : 'var(--ink-dim)', borderColor: opt.isCorrect ? 'var(--teal)' : 'var(--border)' }">{{ opt.letter }}</span>
                  <span class="q-opt-text" :style="{ color: opt.isCorrect ? 'var(--teal-dark)' : 'var(--ink)', fontWeight: opt.isCorrect ? 700 : 400 }">{{ opt.text }}</span>
                  <span v-if="opt.isCorrect" class="q-opt-correct-tag">✓ Correct</span>
                </div>
              </div>
            </template>

            <!-- Cohort insight — only once the question has been attempted -->
            <template v-if="modalQ.totalAttempts > 0">
              <div class="q-modal-section-label">Cohort performance</div>
              <div class="q-insight">
                <div class="q-insight-num">
                  <div class="mono" :style="{ color: pctColor(modalQ.pctCorrect ?? 0), fontSize: '1.6rem', fontWeight: 700, lineHeight: 1 }">{{ modalQ.pctCorrect }}%</div>
                  <div class="q-insight-sub">answered correctly</div>
                </div>
                <div style="flex:1;">
                  <div class="q-insight-bar-bg">
                    <div class="q-insight-bar-fill" :style="{ width: (modalQ.pctCorrect ?? 0) + '%', background: pctColor(modalQ.pctCorrect ?? 0) }"></div>
                  </div>
                  <div class="q-insight-text">{{ insightText }}</div>
                </div>
              </div>
            </template>

            <!-- Explanation -->
            <template v-if="modalQ.explanation">
              <div class="q-modal-section-label">Explanation</div>
              <div class="q-expl">{{ plain(modalQ.explanation) }}</div>
            </template>
          </div>

          <div class="q-modal-foot">
            <div class="q-foot-count">{{ (modalIdx ?? 0) + 1 }} of {{ exam!.allQuestions.length }}</div>
            <div class="q-foot-nav">
              <button type="button" class="q-nav-btn" :disabled="modalIdx === 0" @click="navQ(-1)">← Prev</button>
              <button type="button" class="q-nav-btn" :disabled="modalIdx === exam!.allQuestions.length - 1" @click="navQ(1)">Next →</button>
              <button type="button" class="q-nav-btn q-nav-primary" @click="closeQ(); reviewOpen = true">Review all →</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── Student profile drawer ────────────────────────────────────────────── -->
    <Transition name="drawer">
      <div v-if="drawerOpen" class="sd-overlay" @click.self="closeDrawer">
        <aside class="sd-panel">
          <button type="button" class="sd-close" @click="closeDrawer" aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>

          <div v-if="profileLoading" class="sd-body"><div class="sd-empty">Loading profile…</div></div>

          <template v-else-if="profile">
            <div class="sd-head">
              <div class="sd-avatar">
              <img v-if="profile.avatar_url" :src="profile.avatar_url" :alt="profile.name" class="sd-avatar-img" />
              <template v-else>{{ profile.initials }}</template>
            </div>
              <div>
                <div class="sd-name">{{ profile.name }}</div>
                <div class="sd-meta">{{ profile.meta || '—' }}</div>
                <span class="sd-status" :style="statusPillStyle(profile.risk)"><span class="status-dot"></span>{{ profile.status_label }}</span>
              </div>
            </div>

            <div class="sd-body">
              <div class="sd-section-label">Performance Summary</div>
              <div class="sd-stats">
                <div class="sd-stat"><div class="sd-stat-val" :style="{ color: accColor(profile.avg_score) }">{{ profile.avg_score }}%</div><div class="sd-stat-lbl">Avg Score</div></div>
                <div class="sd-stat"><div class="sd-stat-val">{{ profile.qs_answered.toLocaleString() }}</div><div class="sd-stat-lbl">Qs Answered</div></div>
                <div class="sd-stat"><div class="sd-stat-val">{{ profile.streak }}</div><div class="sd-stat-lbl">Day Streak</div></div>
              </div>

              <div class="sd-section-label">Topic Accuracy</div>
              <div v-if="profile.topic_accuracy.length">
                <div v-for="t in profile.topic_accuracy" :key="t.topic" class="sd-topic">
                  <span class="sd-topic-name">{{ t.topic }}</span>
                  <div class="sd-topic-bar"><div :style="{ width: t.pct + '%', background: accColor(t.pct) }"></div></div>
                  <span class="sd-topic-pct mono" :style="{ color: accColor(t.pct) }">{{ t.pct }}%</span>
                </div>
              </div>
              <div v-else class="sd-empty">No topic data yet.</div>

              <div class="sd-section-label">Mock Exam History</div>
              <div v-if="profile.mock_history.length">
                <div v-for="(m, mi) in profile.mock_history" :key="mi" class="sd-mock">
                  <span class="sd-mock-score mono" :style="{ color: accColor(m.score) }">{{ m.score }}%</span>
                  <div><div class="sd-mock-name">{{ m.name }}</div><div class="sd-mock-date">{{ m.date }}{{ m.timed ? ' · Timed' : '' }}</div></div>
                </div>
              </div>
              <div v-else class="sd-empty">No mock exams completed yet.</div>

              <div class="sd-section-label">Engagement (last 7 days)</div>
              <div class="sd-eng">
                <div v-for="(d, di) in profile.engagement" :key="di" class="sd-eng-col">
                  <div class="sd-eng-bar" :style="{ height: Math.max(3, Math.min(40, d.count * 6)) + 'px', background: d.count ? 'var(--teal)' : 'var(--border)' }"></div>
                  <div class="sd-eng-lbl">{{ d.label }}</div>
                </div>
              </div>
              <div class="sd-eng-note">{{ profile.week_qs }} questions this week</div>

              <button type="button" class="sd-action-primary" :disabled="checkinBusy" @click="sendCheckin()">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                {{ checkinBusy ? 'Sending…' : 'Send Check-In Email' }}
              </button>
              <div v-if="profile.seat_id" class="sd-cohort">
                <label class="sd-cohort-lbl">{{ profile.cohort_id ? 'Cohort' : 'Assign cohort' }}</label>
                <select class="sd-cohort-select" :value="profile.cohort_id ?? ''" :disabled="cohortBusy"
                  @change="changeCohort(+($event.target as HTMLSelectElement).value)">
                  <option value="" disabled>{{ profile.cohort_id ? 'Change cohort…' : 'Select a cohort…' }}</option>
                  <option v-for="c in cohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
              <div class="sd-action-row">
                <button type="button" class="sd-action" @click="goAssign">Assign targeted exam</button>
                <button type="button" class="sd-action" @click="viewFullProfile">View full profile</button>
              </div>
            </div>
          </template>
        </aside>
      </div>
    </Transition>


    <!-- Delete confirmation -->
    <Transition name="toast">
      <div v-if="confirmDel" class="del-overlay" @click.self="confirmDel = false">
        <div class="del-modal" role="dialog" aria-modal="true">
          <div class="del-modal-icon">🗑</div>
          <div class="del-modal-title">Delete this exam?</div>
          <div class="del-modal-body">
            <strong>{{ exam?.name }}</strong> will be permanently deleted and
            <strong>unassigned from every student</strong> who had it, along with their attempt data.
            This can't be undone.
          </div>
          <div class="del-modal-actions">
            <button type="button" class="del-cancel" @click="confirmDel = false" :disabled="deleting">Cancel</button>
            <button type="button" class="del-confirm" @click="doDelete" :disabled="deleting">
              <span v-if="deleting" class="spin-sm"></span>
              {{ deleting ? 'Deleting…' : 'Delete exam' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Toast -->
    <Transition name="toast">
      <div v-if="toast" class="me-toast" :style="{ background: toast.color }">{{ toast.text }}</div>
    </Transition>
  </div>
</template>

<style scoped>
/* ── Back row ────────────────────────────────────────────────────────────── */
.back-row { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.back-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: 8px;
  background: var(--surface); border: 1.5px solid var(--border);
  font-family: Figtree, sans-serif; font-size: 0.74rem; font-weight: 700;
  color: var(--ink-mid); text-decoration: none; transition: all 0.13s;
}
.back-btn:hover { border-color: var(--teal-border); color: var(--teal); }
.back-sep { color: var(--ink-faint); }
.back-name { font-size: 0.78rem; font-weight: 700; color: var(--ink); }

/* ── Declare button ─────────────────────────────────────────────────────── */
.declare-btn {
  display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px;
  border-radius: 8px; font-family: Figtree, sans-serif; font-size: 0.72rem; font-weight: 700;
  cursor: pointer; transition: all 0.15s; white-space: nowrap; border: 1.5px solid;
}
.declare-active { background: var(--green-light); color: var(--green); border-color: var(--green-border); }
.declare-active:hover:not(:disabled) { background: var(--green); color: #fff; }
.declare-done { background: var(--surface); color: var(--ink-faint); border-color: var(--border); cursor: not-allowed; opacity: 0.7; }

/* ── Hero card (navy gradient) ───────────────────────────────────────────── */
.hero-card {
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--r-lg);
  padding: 22px 26px;
  margin-bottom: 16px;
  display: flex; align-items: flex-start; justify-content: space-between;
  flex-wrap: wrap; gap: 16px;
}
.hero-left { min-width: 240px; }
.hero-title { font-family: Figtree, sans-serif; font-size: 1.2rem; font-weight: 800; color: #fff; margin-bottom: 6px; }
.hero-meta { font-size: 0.72rem; color: rgba(255,255,255,0.45); }
.hero-stats { display: flex; gap: 26px; flex-wrap: wrap; }
.hero-stat { text-align: center; }
.hero-stat-label {
  font-size: 0.56rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 1.5px; color: rgba(255,255,255,0.32); margin-bottom: 4px;
}
.hero-stat-val { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: 1.5rem; font-weight: 700; line-height: 1; }

/* ── Distribution + Topic grid ───────────────────────────────────────────── */
.dist-topic-grid { display: grid; grid-template-columns: 1fr 1.6fr; gap: 16px; }
@media (max-width: 900px) { .dist-topic-grid { grid-template-columns: 1fr; } }

.card-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 4px; }
.dist-legend { display: flex; gap: 10px; font-size: 0.65rem; font-weight: 700; }

/* Score distribution chart */
.dist-chart { display: flex; gap: 6px; align-items: flex-end; height: 80px; margin-top: 20px; margin-bottom: 6px; }
.dist-col-item { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 3px; height: 100%; }
.dist-count { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: 0.62rem; font-weight: 700; }
.dist-bar { width: 100%; border-radius: 4px 4px 0 0; transition: height 0.4s ease; }
.dist-labels { display: flex; gap: 6px; border-top: 1px solid var(--border); padding-top: 5px; }
.dist-labels > div { flex: 1; font-size: 0.6rem; color: var(--ink-dim); text-align: center; }

/* Topic table */
.topic-table { width: 100%; border-collapse: collapse; }
.topic-table th {
  font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px;
  color: var(--ink-dim); padding: 6px 14px; border-bottom: 1px solid var(--border);
}
.topic-table td { padding: 9px 14px; border-bottom: 1px solid var(--border); }
.topic-table tr:last-child td { border-bottom: none; }
.t-topic { font-size: 0.78rem; font-weight: 600; color: var(--ink); }
.t-qs { font-size: 0.72rem; color: var(--ink-dim); text-align: center; }
.t-avg { display: flex; align-items: center; gap: 8px; }
.t-bar-bg { width: 80px; height: 6px; background: var(--surface); border-radius: 3px; overflow: hidden; flex-shrink: 0; }
.t-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
.t-pass { font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 6px; }

/* ── All Questions list ──────────────────────────────────────────────────── */
.hq-row {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 11px 8px; margin: 0 -8px;
  border-bottom: 1px solid var(--border); border-radius: 8px;
  cursor: pointer; transition: background 0.1s;
}
.hq-row:hover { background: var(--surface); }
.hq-pagination { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 14px 0 4px; }
.hq-pg-btn { padding: 6px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--white); font-family: Figtree, sans-serif; font-size: .72rem; font-weight: 700; color: var(--ink-mid); cursor: pointer; }
.hq-pg-btn:hover:not(:disabled) { border-color: var(--teal); color: var(--teal); }
.hq-pg-btn:disabled { opacity: .4; cursor: not-allowed; }
.hq-pg-info { font-size: .72rem; font-weight: 600; color: var(--ink-dim); }
.hq-num { font-size: 0.7rem; font-weight: 700; color: var(--ink-dim); width: 26px; flex-shrink: 0; padding-top: 1px; }
.hq-main { flex: 1; min-width: 0; }
.hq-stem { font-size: 0.74rem; font-weight: 600; color: var(--ink); margin-bottom: 3px; }
.hq-topic { font-size: 0.63rem; color: var(--ink-dim); }
.hq-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.hq-pct { font-size: 0.82rem; font-weight: 700; }
.hq-pct-sub { font-size: 0.6rem; color: var(--ink-dim); }

/* ── Individual Scores ───────────────────────────────────────────────────── */
.is-head {
  padding: 14px 18px 10px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}
.is-scroll { max-height: 360px; overflow-y: auto; }
.is-table { width: 100%; border-collapse: collapse; }
.is-table th {
  font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px;
  color: var(--ink-dim); padding: 8px 14px; border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--white); z-index: 1;
}
.is-table td { padding: 8px 14px; border-bottom: 1px solid var(--border); }
.is-table tr:last-child td { border-bottom: none; }
.is-table tbody tr { transition: background 0.1s; }
.is-table tbody tr:hover { background: var(--surface); }
.is-name { display: flex; align-items: center; gap: 9px; }
.is-rank { font-size: 0.7rem; font-weight: 600; color: var(--ink-dim); width: 16px; }
.is-avatar {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  background: var(--teal-pale); color: var(--teal-mid);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.52rem; font-weight: 800;
  overflow: hidden;
}
.is-avatar-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
.is-fullname { font-size: 0.77rem; font-weight: 700; color: var(--ink); }
.is-score { font-size: 0.78rem; font-weight: 700; padding: 2px 8px; border-radius: 6px; }
.status-pill {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 0.62rem; font-weight: 800; padding: 3px 9px;
  border-radius: 20px; border: 1px solid;
}
.status-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }

/* Did not complete */
.dnc { border-top: 2px solid var(--amber-border); background: var(--amber-pale); padding: 12px 18px; }
.dnc-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.dnc-title { font-size: 0.68rem; font-weight: 800; color: var(--amber); text-transform: uppercase; letter-spacing: 1px; }
.dnc-count { font-size: 0.65rem; color: var(--ink-dim); }
.dnc-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.dnc-chip {
  display: flex; align-items: center; gap: 7px;
  padding: 5px 10px; border-radius: 8px;
  background: var(--white); border: 1px solid var(--amber-border);
  font-size: 0.72rem; font-weight: 700; color: var(--ink);
}
.dnc-avatar {
  width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg, var(--ink-mid), var(--ink));
  display: flex; align-items: center; justify-content: center;
  font-size: 0.5rem; font-weight: 800; color: #fff;
  overflow: hidden;
}
.dnc-avatar-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }

/* ── Question modal ──────────────────────────────────────────────────────── */
.q-overlay {
  position: fixed; inset: 0; z-index: 500;
  background: rgba(11,25,41,0.5); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.q-modal {
  background: var(--white); border-radius: var(--r-xl);
  width: 100%; max-width: 620px; max-height: 88dvh;
  display: flex; flex-direction: column;
  box-shadow: 0 24px 64px rgba(6,182,212,0.14), 0 8px 32px rgba(0,0,0,0.12);
}
.q-modal-head {
  padding: 16px 20px 13px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-shrink: 0;
}
.q-modal-tags { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.q-modal-qnum { font-size: 0.72rem; font-weight: 700; color: var(--ink-dim); }
.q-modal-pct { font-size: 0.66rem; font-weight: 800; padding: 2px 9px; border-radius: 20px; border: 1px solid; }
.q-modal-topic { font-size: 0.66rem; padding: 2px 9px; border-radius: 20px; background: var(--surface); color: var(--ink-dim); border: 1px solid var(--border); }
.q-close {
  width: 28px; height: 28px; border-radius: 7px; border: 1.5px solid var(--border);
  background: var(--white); display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--ink-dim); flex-shrink: 0; transition: all 0.13s;
}
.q-close:hover { border-color: var(--rose-border); color: var(--rose); }
.q-modal-body { padding: 20px 22px; overflow-y: auto; flex: 1; }
.q-modal-stem { font-size: 0.92rem; font-weight: 500; color: var(--ink); line-height: 1.7; margin-bottom: 20px; }
.q-modal-section-label {
  font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px;
  color: var(--ink-dim); margin-bottom: 9px; margin-top: 18px;
}
.q-modal-section-label:first-of-type { margin-top: 0; }
.q-opts { display: flex; flex-direction: column; gap: 6px; }
.q-opt {
  display: flex; align-items: flex-start; gap: 10px; padding: 9px 12px;
  border-radius: 9px; border: 1.5px solid var(--border); background: var(--white);
}
.q-opt-correct { background: var(--teal-pale); border-color: var(--teal-border); }
.q-opt-letter {
  width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; border: 2px solid;
  display: flex; align-items: center; justify-content: center;
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: 0.66rem; font-weight: 700;
}
.q-opt-text { font-size: 0.8rem; line-height: 1.5; flex: 1; padding-top: 2px; }
.q-opt-correct-tag { margin-left: auto; font-size: 0.62rem; font-weight: 800; color: var(--teal-mid); white-space: nowrap; flex-shrink: 0; padding-top: 4px; }
.q-insight {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--r);
  padding: 14px 16px; display: flex; align-items: center; gap: 16px;
}
.q-insight-num { text-align: center; min-width: 60px; }
.q-insight-sub { font-size: 0.6rem; color: var(--ink-dim); margin-top: 3px; }
.q-insight-bar-bg { height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; margin-bottom: 6px; }
.q-insight-bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s cubic-bezier(0.16,1,0.3,1); }
.q-insight-text { font-size: 0.7rem; color: var(--ink-dim); line-height: 1.5; }
.q-expl {
  background: linear-gradient(135deg, var(--teal-pale), rgba(240,254,255,0.5));
  border: 1px solid var(--teal-border); border-radius: var(--r-sm);
  padding: 13px 15px; font-size: 0.78rem; color: var(--ink); line-height: 1.65;
  /* Explanation is interpolated as plain text ({{ q.explanation }}); preserve
     the backend's \n line breaks so paragraph structure survives instead of
     collapsing to one run-on block. */
  white-space: pre-line;
}
/* Dark mode: the light rgba(240,254,255,…) stop above doesn't theme-flip and
   rendered as a glaring near-white box on the dark page. Replace the gradient
   with teal-tinted dark stops (text/border vars already flip via body.dark). */
body.dark .q-expl {
  background: linear-gradient(135deg, rgba(20,184,166,0.10), rgba(20,184,166,0.05));
}
.q-modal-foot {
  padding: 13px 20px; border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
  background: var(--surface); border-radius: 0 0 var(--r-xl) var(--r-xl);
}
.q-foot-count { font-size: 0.7rem; color: var(--ink-dim); }
.q-foot-nav { display: flex; gap: 7px; }
.q-nav-btn {
  padding: 7px 14px; border-radius: 8px; border: 1.5px solid var(--border);
  background: var(--white); font-family: Figtree, sans-serif; font-size: 0.74rem;
  font-weight: 700; color: var(--ink-mid); cursor: pointer; transition: all 0.13s;
}
.q-nav-btn:hover:not(:disabled) { border-color: var(--teal-border); color: var(--teal); }
.q-nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.q-nav-primary { background: var(--teal); color: #fff; border-color: var(--teal); }
.q-nav-primary:hover:not(:disabled) { background: var(--teal-dark); color: #fff; border-color: var(--teal-dark); }

.modal-enter-active, .modal-leave-active { transition: opacity 0.2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .q-modal, .modal-leave-active .q-modal,
.modal-enter-active .ra-modal, .modal-leave-active .ra-modal { transition: transform 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.25s; }
.modal-enter-from .q-modal, .modal-leave-to .q-modal,
.modal-enter-from .ra-modal, .modal-leave-to .ra-modal { transform: translateY(16px) scale(0.97); opacity: 0; }

/* Review-all button + modal */
.review-all-btn {
  padding: 6px 14px; border-radius: 8px; border: 1.5px solid var(--border);
  background: var(--white); font-family: Figtree, sans-serif; font-size: 0.74rem;
  font-weight: 700; color: var(--teal-mid); cursor: pointer; white-space: nowrap;
  transition: all 0.13s; flex-shrink: 0;
}
.review-all-btn:hover { border-color: var(--teal-border); background: var(--teal-pale); }
.ra-modal {
  background: var(--white); border-radius: var(--r-xl);
  width: 100%; max-width: 780px; max-height: 90dvh;
  display: flex; flex-direction: column;
  box-shadow: 0 24px 64px rgba(6,182,212,0.14), 0 8px 32px rgba(0,0,0,0.12);
}
.ra-head {
  padding: 18px 22px 15px; border-bottom: 1px solid var(--border);
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-shrink: 0;
}
.ra-title { font-size: 1.05rem; font-weight: 800; color: var(--ink); }
.ra-sub { font-size: 0.7rem; color: var(--ink-dim); margin-top: 3px; }
.ra-body { padding: 18px 22px 22px; overflow-y: auto; flex: 1; }
.ra-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 22px; }
.ra-stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); padding: 12px 16px; }
.ra-stat-label { font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--ink-dim); margin-bottom: 4px; }
.ra-stat-val { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: 1.3rem; font-weight: 700; color: var(--ink); }
.ra-card { border: 1.5px solid var(--border); border-radius: var(--r-lg); padding: 18px; margin-bottom: 14px; }
.ra-card-tags { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.ra-qnum {
  font-size: 0.72rem; font-weight: 700; color: var(--ink-dim);
  background: var(--surface); border: 1px solid var(--border); padding: 2px 8px; border-radius: 6px;
}
.ra-tag { font-size: 0.64rem; font-weight: 800; padding: 2px 9px; border-radius: 20px; border: 1px solid; }
.ra-bar-wrap { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.ra-bar-bg { width: 60px; height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
.ra-bar-fill { height: 100%; border-radius: 3px; }
.ra-stem {
  font-size: 0.9rem; font-weight: 500; color: var(--ink); line-height: 1.7;
  margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px solid var(--border);
}
.ra-card-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 12px; margin-top: 4px; border-top: 1px solid var(--border);
  font-size: 0.68rem; color: var(--ink-dim);
}
.ra-card-nav { display: flex; gap: 6px; }

/* Misc */
.empty-hint { font-size: 0.76rem; color: var(--ink-faint); font-style: italic; padding: 12px 0; }
.mono { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; }

.hdr-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.74rem; font-weight: 700;
  color: var(--ink-mid); text-decoration: none; transition: all 0.13s;
}
.hdr-btn:hover { border-color: var(--teal-border); color: var(--teal); }
.hdr-primary { background: var(--teal); color: #fff; border-color: var(--teal); }
.hdr-primary:hover { background: var(--teal-dark); color: #fff; border-color: var(--teal-dark); }

/* ── Delete control + confirmation modal ─────────────────────────────────── */
.tb-del-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.72rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer; transition: all 0.13s;
}
.tb-del-btn:hover { border-color: var(--rose-border); color: var(--rose); background: var(--rose-light); }

.del-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(15,31,46,0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.del-modal {
  background: var(--white); border-radius: 14px; padding: 26px 26px 22px;
  width: 100%; max-width: 400px; text-align: center;
  box-shadow: 0 20px 60px rgba(0,0,0,0.28); border: 1px solid var(--border);
}
.del-modal-icon { font-size: 2rem; margin-bottom: 10px; }
.del-modal-title { font-size: 1rem; font-weight: 800; color: var(--ink); margin-bottom: 8px; }
.del-modal-body { font-size: 0.78rem; line-height: 1.55; color: var(--ink-dim); margin-bottom: 20px; }
.del-modal-body strong { color: var(--ink); font-weight: 800; }
.del-modal-actions { display: flex; gap: 10px; }
.del-cancel, .del-confirm {
  flex: 1; padding: 10px 14px; border-radius: 9px;
  font-family: Figtree, sans-serif; font-size: 0.78rem; font-weight: 800;
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.del-cancel { background: var(--surface); border: 1.5px solid var(--border); color: var(--ink-mid); }
.del-cancel:hover:not(:disabled) { border-color: var(--ink-faint); }
.del-confirm { background: var(--rose); border: 1.5px solid var(--rose); color: #fff; }
.del-confirm:hover:not(:disabled) { background: var(--rose-dark, #c2334d); }
.del-cancel:disabled, .del-confirm:disabled { opacity: 0.6; cursor: default; }

.me-toast {
  position: fixed; bottom: 32px; right: 32px; padding: 11px 18px; border-radius: 9px;
  color: #fff; font-family: Figtree, sans-serif; font-size: 0.78rem; font-weight: 700;
  box-shadow: 0 8px 32px rgba(0,0,0,0.16); z-index: 9999;
}
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }

.spin-sm {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  border: 1.5px solid currentColor; border-top-color: transparent;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

@keyframes sk-shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}
.sk {
  background: linear-gradient(90deg, var(--surface) 25%, var(--border) 50%, var(--surface) 75%);
  background-size: 600px 100%;
  animation: sk-shimmer 1.4s ease-in-out infinite;
  border-radius: 4px;
}
/* ── Student profile drawer + full profile ──────────────────────────────── */
.sd-overlay { position: fixed; inset: 0; z-index: 600; background: rgba(11,25,41,0.4); display: flex; justify-content: flex-end; }
.sd-panel { width: 420px; max-width: 92vw; height: 100%; background: var(--white); box-shadow: -8px 0 40px rgba(0,0,0,0.16); display: flex; flex-direction: column; position: relative; overflow: hidden; }
.sd-close { position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--white); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink-dim); z-index: 2; }
.sd-close:hover { border-color: var(--rose-border); color: var(--rose); }
.sd-head { display: flex; gap: 14px; padding: 22px 22px 16px; border-bottom: 1px solid var(--border); }
.sd-avatar { width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0; background: linear-gradient(135deg,var(--teal),var(--teal-dark)); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 1.1rem; overflow: hidden; }
.sd-avatar-img { width: 100%; height: 100%; border-radius: 14px; object-fit: cover; display: block; }
.sd-name { font-size: 1.05rem; font-weight: 800; color: var(--ink); }
.sd-meta { font-size: 0.7rem; color: var(--ink-dim); margin: 2px 0 6px; }
.sd-status { display: inline-flex; align-items: center; gap: 5px; font-size: 0.6rem; font-weight: 800; padding: 3px 9px; border-radius: 20px; border: 1px solid; text-transform: uppercase; letter-spacing: 0.5px; }
.sd-body { padding: 18px 22px 24px; overflow-y: auto; flex: 1; }
.sd-section-label { font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--ink-dim); margin: 18px 0 10px; }
.sd-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
.sd-stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); padding: 12px 8px; text-align: center; }
.sd-stat-val { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: 1.15rem; font-weight: 700; color: var(--ink); }
.sd-stat-lbl { font-size: 0.56rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-dim); margin-top: 3px; }
.sd-topic { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
.sd-topic-name { font-size: 0.74rem; color: var(--ink); width: 120px; flex-shrink: 0; }
.sd-topic-bar { flex: 1; height: 6px; background: var(--surface); border-radius: 3px; overflow: hidden; }
.sd-topic-bar > div { height: 100%; border-radius: 3px; }
.sd-topic-pct { font-size: 0.72rem; font-weight: 700; width: 38px; text-align: right; }
.sd-mock { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border); }
.sd-mock:last-child { border-bottom: none; }
.sd-mock-score { font-size: 0.9rem; font-weight: 700; width: 42px; }
.sd-mock-name { font-size: 0.76rem; font-weight: 600; color: var(--ink); }
.sd-mock-date { font-size: 0.64rem; color: var(--ink-dim); }
.sd-eng { display: flex; align-items: flex-end; gap: 6px; height: 44px; }
.sd-eng-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; height: 100%; }
.sd-eng-bar { width: 100%; border-radius: 3px 3px 0 0; }
.sd-eng-lbl { font-size: 0.55rem; color: var(--ink-faint); }
.sd-eng-note { font-size: 0.66rem; color: var(--ink-dim); margin-top: 8px; }

/* Weekly engagement mini bar chart (relative-scaled) */
.we-chart { display: flex; align-items: flex-end; gap: 6px; height: 72px; }
.we-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 3px; height: 100%; }
.we-count { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: 0.58rem; font-weight: 700; color: var(--teal-mid); min-height: 9px; line-height: 1; }
.we-bar { width: 100%; max-width: 30px; border-radius: 3px 3px 0 0; transition: height 0.3s ease; }
.we-lbl { font-size: 0.55rem; color: var(--ink-faint); }
.sd-action-primary { width: 100%; margin-top: 18px; padding: 11px; border: none; border-radius: 9px; background: var(--teal); color: #fff; font-family: Figtree, sans-serif; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
.sd-action-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.sd-cohort { margin-top: 12px; }
.sd-cohort-lbl { display: block; font-family: Figtree, sans-serif; font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-dim); margin-bottom: 5px; }
.sd-cohort-select { width: 100%; padding: 8px 10px; border: 1.5px solid var(--border); border-radius: 8px; background: var(--surface); font-family: Figtree, sans-serif; font-size: 0.76rem; font-weight: 600; color: var(--ink); cursor: pointer; outline: none; }
.sd-cohort-select:focus { border-color: var(--teal-border); }
.sd-cohort-select:disabled { opacity: 0.6; cursor: not-allowed; }
.sd-action-primary:hover { background: var(--teal-dark); }
.sd-action-row { display: flex; gap: 8px; margin-top: 8px; }
.sd-action { flex: 1; padding: 9px; border: 1.5px solid var(--border); border-radius: 9px; background: var(--white); font-family: Figtree, sans-serif; font-size: 0.73rem; font-weight: 700; color: var(--ink-mid); cursor: pointer; }
.sd-action:hover { border-color: var(--teal-border); color: var(--teal); }
.sd-empty { font-size: 0.74rem; color: var(--ink-faint); font-style: italic; padding: 6px 0; }
.is-row { cursor: pointer; }
.fp-avatar { width: 56px; height: 56px; border-radius: 16px; flex-shrink: 0; background: linear-gradient(135deg,var(--teal),var(--teal-dark)); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 1.2rem; overflow: hidden; }
.fp-avatar-img { width: 100%; height: 100%; border-radius: 16px; object-fit: cover; display: block; }
.drawer-enter-active, .drawer-leave-active { transition: opacity .25s; }
.drawer-enter-active .sd-panel, .drawer-leave-active .sd-panel { transition: transform .28s cubic-bezier(0.16,1,0.3,1); }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .sd-panel, .drawer-leave-to .sd-panel { transform: translateX(100%); }
</style>
