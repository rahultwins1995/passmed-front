<script setup lang="ts">

// Permission matrix (admin panel → Role Matrix). The same rules are enforced
// server-side by the perm: middleware, so hiding a button is UX, not the
// security boundary.
//
//   canManage → DECLARE RESULTS (publishes scores to students, cannot be undone)
//               DELETE an exam  (cascades: unassigns every student, clears sessions)
//               both are perm:mock_exams,full
//
// Neither of these is an "edit". Releasing scores is visible to every student who
// sat the exam and there is no un-declare, so it belongs behind `full`.
const { canEdit, canManage, readOnly } = useInstitutePermissions()
const PERM_AREA = 'mock_exams' as const

import { computed, ref, onMounted } from 'vue'
const { instName } = useInstitution()

definePageMeta({ layout: 'institute' })
useHead({ title: 'Mock Exams · Passmed Institute' })

const api    = useInstituteApi()
const router = useRouter()

// Whole exam card is clickable → open its detail page.
// (Declare button + View link stop propagation so they don't double-fire.)
function openExam(id: string) {
  router.push(`/institute/mock-exams/${id}`)
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ExamType = 'Full Simulation' | 'Topic Focus' | 'Rapid Fire'
type DistRisk = 'high' | 'medium' | 'pass' | 'strong'

type ScoreBand = { band: string; count: number; risk: DistRisk }

type MockExam = {
  id: string
  name: string
  type: ExamType
  date: string
  questions: number
  duration: string
  timed: boolean
  cohortAvg: number
  passRate: number
  completed: number
  total: number
  status: 'completed' | 'scheduled' | 'active'
  prevAvg: number | null
  passMarkValue: number
  markingMethod: 'standard' | 'negative'
  negMarkPenalty: number
  attemptLimit: number
  resultsRelease: 'immediate' | 'manual'
  canDeclare: boolean
  scoreDistribution: ScoreBand[]
  incompleteStudents: string[]
}

// ── API state ─────────────────────────────────────────────────────────────────
const exams        = ref<MockExam[]>([])
const examsLoading = ref(false)
const declaringId  = ref<string | null>(null)

function inferType(questionCount: number): ExamType {
  if (questionCount >= 80) return 'Full Simulation'
  if (questionCount >= 20) return 'Topic Focus'
  return 'Rapid Fire'
}

function transformExam(raw: any, prevRaw: any | null): MockExam {
  return {
    id:                 String(raw.id),
    name:               raw.name,
    type:               (raw.type as ExamType) || inferType(raw.question_count ?? 0),
    date:               raw.date ?? raw.created_at,
    questions:          raw.questions ?? raw.question_count ?? 0,
    duration:           raw.duration ?? (raw.timed ? `${raw.duration_minutes ?? 60} min` : 'Open'),
    timed:              !!raw.timed,
    cohortAvg:          raw.cohort_avg ?? 0,
    passRate:           raw.pass_rate ?? 0,
    completed:          raw.completed ?? 0,
    total:              raw.total ?? 0,
    status:             raw.status ?? 'active',
    prevAvg:            prevRaw ? (prevRaw.cohort_avg ?? null) : null,
    passMarkValue:      raw.pass_mark_value ?? 65,
    markingMethod:      (raw.marking_method ?? 'standard') as 'standard' | 'negative',
    negMarkPenalty:     raw.neg_mark_penalty ?? 0.25,
    attemptLimit:       raw.attempt_limit ?? 1,
    resultsRelease:     (raw.results_release ?? 'immediate') as 'immediate' | 'manual',
    canDeclare:         raw.can_declare ?? false,
    scoreDistribution:  (raw.score_distribution ?? []).map((d: any) => ({
      band: d.band, count: d.count, risk: d.risk as DistRisk,
    })),
    incompleteStudents: raw.incomplete_students ?? [],
  }
}

// ── Fetch exams ───────────────────────────────────────────────────────────────
async function fetchExams() {
  examsLoading.value = true
  try {
    const res = await api<any>('/mock-exams')
    if (res?.status === 'success') {
      const raw: any[] = res.data ?? []
      exams.value = raw.map((e, idx) => transformExam(e, raw[idx + 1] ?? null))
    }
  } catch { /* fail silently */ }
  finally { examsLoading.value = false }
}

onMounted(() => { fetchExams() })

// ── Declare Results ────────────────────────────────────────────────────────────
async function declareResults(examId: string) {
  if (declaringId.value) return
  declaringId.value = examId
  try {
    const res = await api<any>(`/mock-exams/${examId}/declare-results`, { method: 'POST' })
    if (res?.status === 'success') {
      const exam = exams.value.find(e => e.id === examId)
      if (exam) exam.canDeclare = false
      showToast(`Results declared for ${res.declared_count} student(s)`, 'var(--green)')
    } else {
      showToast(res?.message ?? 'Could not declare results', 'var(--rose)')
    }
  } catch {
    showToast('Error declaring results', 'var(--rose)')
  } finally {
    declaringId.value = null
  }
}

// ── Delete a mock exam (cascades: unassigns every student) ──────────────────────
const confirmDel = ref<MockExam | null>(null)
const deletingId = ref<string | null>(null)
function askDelete(exam: MockExam) { confirmDel.value = exam }
async function doDelete() {
  const exam = confirmDel.value
  if (!exam || deletingId.value) return
  deletingId.value = exam.id
  confirmDel.value = null                      // close the dialog immediately
  try {
    const res = await api<any>(`/mock-exams/${exam.id}`, { method: 'DELETE' })
    if (res?.status === 'success') {
      exams.value = exams.value.filter(e => e.id !== exam.id)
      const n = res.unassigned_count ?? 0
      showToast(`"${exam.name}" deleted${n ? ` · unassigned from ${n} student(s)` : ''}`, 'var(--teal)')
    } else {
      showToast(res?.message ?? 'Could not delete exam', 'var(--rose)')
    }
  } catch (e: any) {
    const code = e?.response?.status ?? e?.statusCode
    if (code === 403)      showToast("You don't have permission to delete exams.", 'var(--rose)')
    else if (code === 404) { exams.value = exams.value.filter(e => e.id !== exam.id); showToast('That exam no longer exists.', 'var(--rose)') }
    else                   showToast(e?.data?.message || 'Error deleting exam', 'var(--rose)')
  } finally {
    deletingId.value = null
  }
}

// ── Derived stats ─────────────────────────────────────────────────────────────
const totalExams  = computed(() => exams.value.length)
const latest      = computed(() => exams.value[0] ?? null)
const previous    = computed(() => exams.value[1] ?? null)
const improving   = computed(() =>
  latest.value && previous.value
    ? latest.value.cohortAvg > previous.value.cohortAvg
    : false
)
const stillAtRisk = computed(() =>
  latest.value
    ? latest.value.scoreDistribution
        .filter(d => d.risk === 'high')
        .reduce((a, d) => a + d.count, 0)
    : 0
)

// ── Trend chart ───────────────────────────────────────────────────────────────
const fullSims = computed(() =>
  exams.value.filter(e => e.type === 'Full Simulation').slice().reverse()
)
const chart = computed(() => {
  const W = 600, H = 110, PAD = { t: 16, r: 20, b: 30, l: 38 }
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b
  const minS = 55, maxS = 85
  const sims = fullSims.value
  const denom = Math.max(1, sims.length - 1)
  const toX = (i: number) => PAD.l + (i / denom) * cW
  const toY = (v: number) => PAD.t + cH - ((v - minS) / (maxS - minS)) * cH
  const dots = sims.map((e, i) => ({
    x: +toX(i).toFixed(1), y: +toY(e.cohortAvg).toFixed(1), v: e.cohortAvg,
    label: e.name.replace('Full Simulation — ', '').replace('Full Simulation - ', ''),
  }))
  const pts     = dots.map(d => `${d.x},${d.y}`).join(' ')
  const fillPts = `${toX(0).toFixed(1)},${(PAD.t + cH).toFixed(1)} ${pts} ${toX(sims.length - 1).toFixed(1)},${(PAD.t + cH).toFixed(1)}`
  const passY   = +toY(65).toFixed(1)
  const grid    = [60, 65, 70, 75, 80].map(v => ({ v, y: +toY(v).toFixed(1) }))
  return { W, H, PAD, cW, dots, pts, fillPts, passY, grid }
})

// ── Toast ─────────────────────────────────────────────────────────────────────
const toast = ref<{ text: string; color: string } | null>(null)
function showToast(text: string, color = 'var(--teal)') {
  toast.value = { text, color }
  setTimeout(() => { toast.value = null }, 2400)
}

// ── Export — Mock Exam Analysis PDF (latest exam) via the reports endpoint ─────
const { downloading: exporting, downloadReport } = useReportDownload()
async function exportReport() {
  const r = await downloadReport({ type: 'mockexam', range: 'year' }, 'mock-exam-analysis.pdf')
  if (r.ok) showToast(`${r.filename} downloaded`, 'var(--teal)')
  else if (r.error) showToast(r.error, 'var(--rose)')
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function passColors(rate: number) {
  if (rate >= 75) return { fg: 'var(--green)',    bg: 'var(--green-light)',  bd: 'var(--green-border)',  accent: 'var(--green)'  }
  if (rate >= 65) return { fg: 'var(--teal-mid)', bg: 'var(--teal-pale)',    bd: 'var(--teal-border)',   accent: 'var(--teal)'   }
  return                  { fg: 'var(--rose)',    bg: 'var(--rose-light)',   bd: 'var(--rose-border)',   accent: 'var(--rose)'   }
}
function avgColor(avg: number) {
  if (avg >= 75) return 'var(--green)'
  if (avg >= 65) return 'var(--teal-mid)'
  if (avg >= 60) return 'var(--amber)'
  return 'var(--rose)'
}
function typeBadgeStyle(type: ExamType) {
  if (type === 'Full Simulation') return { bg: 'var(--teal-pale)',    fg: 'var(--teal-mid)', bd: 'var(--teal-border)'    }
  if (type === 'Topic Focus')     return { bg: 'var(--amber-light)',  fg: 'var(--amber)',    bd: 'var(--amber-border)'   }
  return                                  { bg: 'var(--purple-light)', fg: 'var(--purple)',  bd: 'rgba(124,58,237,0.2)' }
}
function typeBadgeLabel(type: ExamType) {
  if (type === 'Full Simulation') return 'Full Sim'
  if (type === 'Topic Focus')     return 'Topic Focus'
  return 'Rapid Fire'
}
function distBarColor(risk: string) {
  if (risk === 'high')   return 'var(--rose)'
  if (risk === 'medium') return 'var(--amber)'
  if (risk === 'strong') return 'var(--green)'
  return 'var(--teal)'
}
function distBarH(count: number, max: number, maxPx = 32) {
  if (count === 0) return 2
  return Math.max(4, Math.round((count / max) * maxPx))
}
function maxDist(exam: MockExam) {
  return Math.max(1, ...exam.scoreDistribution.map(d => d.count))
}
</script>

<template>
  <div class="main">
    <!-- `view` level: page is visible but every mutation is hidden. -->
    <ReadOnlyBanner :area="PERM_AREA" />

    <div class="content">
      <div style="animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;">

        <!-- ── Page header ──────────────────────────────────────────────────── -->
        <div class="page-header" style="margin-bottom:20px;">
          <div>
            <div class="page-title">Mock Exams</div>
            <div class="page-sub">{{ totalExams }} exams administered</div>
          </div>
          <div class="page-header-right" style="gap:8px;">
            <!-- Export moved here from the topbar (topbar is now shared in the layout). -->
            <button type="button" class="tb-export-btn" :disabled="exporting" :style="exporting ? 'opacity:0.6;cursor:default' : ''" @click="exportReport">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {{ exporting ? 'Exporting…' : 'Export Report' }}
            </button>
            <NuxtLink to="/institute/assign-exams" class="hdr-btn hdr-primary">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Assign New Exam
            </NuxtLink>
          </div>
        </div>

        <!-- ── SKELETON ─────────────────────────────────────────────────────── -->
        <template v-if="examsLoading">
          <div class="grid-4" style="gap:12px;margin-bottom:20px;">
            <div v-for="i in 4" :key="i" class="stat-card" style="padding:14px 16px;">
              <div class="sk" style="width:55%;height:8px;margin-bottom:10px;"></div>
              <div class="sk" style="width:40%;height:22px;margin-bottom:8px;"></div>
              <div class="sk" style="width:65%;height:7px;"></div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div v-for="i in 3" :key="i" class="card" style="padding:0;overflow:hidden;">
              <div style="display:flex;align-items:stretch;">
                <div class="sk" style="width:4px;flex-shrink:0;border-radius:var(--r-lg) 0 0 var(--r-lg);"></div>
                <div style="flex:1;padding:16px 20px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
                  <div style="flex:2;min-width:180px;">
                    <div class="sk" style="width:55%;height:11px;margin-bottom:8px;border-radius:5px;"></div>
                    <div class="sk" style="width:75%;height:8px;border-radius:4px;"></div>
                  </div>
                  <div style="min-width:80px;"><div class="sk" style="width:50px;height:26px;border-radius:6px;margin:0 auto;"></div></div>
                  <div style="min-width:80px;"><div class="sk" style="width:56px;height:26px;border-radius:8px;margin:0 auto;"></div></div>
                  <div style="flex:1;min-width:100px;"><div class="sk" style="width:100%;height:28px;border-radius:4px;"></div></div>
                  <div><div class="sk" style="width:100px;height:30px;border-radius:8px;"></div></div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <template v-else-if="exams.length">

          <!-- ── Stat strip ──────────────────────────────────────────────────── -->
          <div class="grid-4" style="gap:12px;margin-bottom:20px;">
            <div class="stat-card c-teal" style="padding:14px 16px;">
              <div class="stat-label">Latest Cohort Avg</div>
              <div class="stat-val" style="font-size:1.4rem;">{{ latest!.cohortAvg }}%</div>
              <div v-if="previous" class="stat-delta" :class="improving ? 'delta-up' : 'delta-down'">
                {{ improving ? '↑' : '↓' }} {{ Math.abs(latest!.cohortAvg - previous.cohortAvg) }}% vs prev exam
              </div>
              <div v-else class="stat-sub">First exam recorded</div>
            </div>
            <div class="stat-card c-green" style="padding:14px 16px;">
              <div class="stat-label">Latest Pass Rate</div>
              <div class="stat-val" style="font-size:1.4rem;">{{ latest!.passRate }}%</div>
              <div class="stat-sub">{{ latest!.completed }}/{{ latest!.total }} completed</div>
            </div>
            <div class="stat-card c-rose" style="padding:14px 16px;">
              <div class="stat-label">Still At Risk</div>
              <div class="stat-val" style="font-size:1.4rem;color:var(--rose);">{{ stillAtRisk }}</div>
              <div class="stat-sub">Scored below {{ latest!.passMarkValue }}% in latest exam</div>
            </div>
            <div class="stat-card c-amber" style="padding:14px 16px;">
              <div class="stat-label">Exams Administered</div>
              <div class="stat-val" style="font-size:1.4rem;">{{ totalExams }}</div>
              <div class="stat-sub">All time</div>
            </div>
          </div>

          <!-- ── Trend chart ─────────────────────────────────────────────────── -->
          <div v-if="fullSims.length >= 2" class="card" style="margin-bottom:18px;padding:20px 24px;">
            <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px;">
              <div>
                <div class="card-title">Cohort Score Trend</div>
                <div class="card-sub">Average score across all full simulation papers</div>
              </div>
              <div style="display:flex;align-items:center;gap:14px;font-size:0.67rem;font-weight:700;">
                <div style="display:flex;align-items:center;gap:5px;color:var(--teal);">
                  <div style="width:20px;height:2px;background:var(--teal);border-radius:1px;"></div>Cohort avg
                </div>
                <div style="display:flex;align-items:center;gap:5px;color:var(--amber);">
                  <div style="width:20px;border-top:2px dashed var(--amber);"></div>Pass mark (65%)
                </div>
              </div>
            </div>
            <svg width="100%" :viewBox="`0 0 ${chart.W} ${chart.H}`" style="overflow:visible;">
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--teal)" stop-opacity="0.15"/>
                  <stop offset="100%" stop-color="var(--teal)" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <g>
                <template v-for="g in chart.grid" :key="g.v">
                  <line :x1="chart.PAD.l" :y1="g.y" :x2="chart.PAD.l + chart.cW" :y2="g.y"
                    :stroke="g.v === 65 ? 'var(--amber)' : 'var(--border)'"
                    :stroke-width="g.v === 65 ? 1.5 : 1"
                    :stroke-dasharray="g.v === 65 ? '4,3' : ''" />
                  <text :x="chart.PAD.l - 5" :y="g.y + 3" text-anchor="end" font-size="8" fill="#7a95ad" font-family="Figtree,sans-serif">{{ g.v }}</text>
                </template>
              </g>
              <polygon :points="chart.fillPts" fill="url(#trendFill)" />
              <polyline :points="chart.pts" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              <template v-for="d in chart.dots" :key="d.label">
                <circle :cx="d.x" :cy="d.y" r="4.5" fill="var(--teal)" stroke="white" stroke-width="2.5" />
                <text :x="d.x" :y="d.y - 10" text-anchor="middle" font-size="9" font-weight="800" fill="var(--teal-dark)" font-family="Figtree,sans-serif">{{ d.v }}%</text>
                <text :x="d.x" :y="chart.PAD.t + (chart.H - chart.PAD.t - chart.PAD.b) + 17" text-anchor="middle" font-size="9" fill="#7a95ad" font-family="Figtree,sans-serif">{{ d.label }}</text>
              </template>
              <text :x="chart.PAD.l + chart.cW + 5" :y="chart.passY + 3" font-size="8" fill="var(--amber)" font-family="Figtree,sans-serif" font-weight="800">Pass</text>
            </svg>
          </div>

          <!-- ── Exam list ────────────────────────────────────────────────────── -->
          <div class="section-label" style="margin-bottom:12px;">All exams</div>
          <div style="display:flex;flex-direction:column;gap:10px;">

            <div
              v-for="exam in exams" :key="exam.id"
              class="exam-card card"
              role="button" tabindex="0"
              @click="openExam(exam.id)"
              @keydown.enter="openExam(exam.id)"
            >
              <div class="exam-row">

                <!-- Accent bar -->
                <div class="accent-bar" :style="{ background: passColors(exam.passRate).accent }"></div>

                <!-- Name + meta -->
                <div class="exam-info">
                  <div class="exam-name-row">
                    <span class="exam-name">{{ exam.name }}</span>
                    <span class="type-badge" :style="{ background: typeBadgeStyle(exam.type).bg, color: typeBadgeStyle(exam.type).fg, borderColor: typeBadgeStyle(exam.type).bd }">
                      {{ typeBadgeLabel(exam.type) }}
                    </span>
                    <span v-if="exam.markingMethod === 'negative'" class="marking-badge">
                      −{{ exam.negMarkPenalty }} marking
                    </span>
                  </div>
                  <div class="exam-meta">
                    <span>{{ exam.date }}</span>
                    <span class="meta-dot">·</span>
                    <span>{{ exam.questions }} questions</span>
                    <span class="meta-dot">·</span>
                    <span>{{ exam.duration }}</span>
                    <span class="meta-dot">·</span>
                    <span>{{ exam.completed }}/{{ exam.total }} completed</span>
                    <span class="meta-dot">·</span>
                    <span>Pass ≥{{ exam.passMarkValue }}%</span>
                    <span v-if="exam.attemptLimit > 1" class="meta-dot">·</span>
                    <span v-if="exam.attemptLimit > 1">{{ exam.attemptLimit === 99 ? '∞' : exam.attemptLimit }}× attempts</span>
                  </div>
                </div>

                <!-- Cohort Avg -->
                <div class="metric-col">
                  <div class="metric-label">Cohort Avg</div>
                  <div class="metric-val" :style="{ color: avgColor(exam.cohortAvg) }">{{ exam.cohortAvg }}%</div>
                  <div v-if="exam.prevAvg !== null" class="metric-delta"
                    :style="{ color: exam.cohortAvg > exam.prevAvg! ? 'var(--green)' : 'var(--rose)' }">
                    {{ exam.cohortAvg > exam.prevAvg! ? '↑' : '↓' }}
                    {{ Math.abs(exam.cohortAvg - exam.prevAvg!) }}% vs prev
                  </div>
                </div>

                <!-- Pass Rate -->
                <div class="metric-col">
                  <div class="metric-label">Pass Rate</div>
                  <span class="pass-chip"
                    :style="{ background: passColors(exam.passRate).bg, color: passColors(exam.passRate).fg, borderColor: passColors(exam.passRate).bd }">
                    {{ exam.passRate }}%
                  </span>
                </div>

                <!-- Score Distribution mini bars -->
                <div class="dist-col">
                  <div class="metric-label" style="margin-bottom:6px;">Score distribution</div>
                  <div style="display:flex;gap:3px;align-items:flex-end;height:32px;">
                    <div
                      v-for="d in exam.scoreDistribution" :key="d.band"
                      :style="{ flex:1, height: distBarH(d.count, maxDist(exam))+'px', background: distBarColor(d.risk), borderRadius:'2px 2px 0 0' }"
                      :title="`${d.band}: ${d.count} students`"
                    ></div>
                  </div>
                </div>

                <!-- Actions -->
                <div class="actions-col">
                  <!-- Declare button (manual-release only). Irreversible → `full`. -->
                  <button type="button"
                    v-if="exam.resultsRelease === 'manual' && canManage(PERM_AREA)"
                    class="declare-btn"
                    :class="{ 'declare-active': exam.canDeclare, 'declare-done': !exam.canDeclare }"
                    :disabled="!exam.canDeclare || declaringId === exam.id"
                    @click.stop="declareResults(exam.id)"
                  >
                    <template v-if="declaringId === exam.id">
                      <span class="spin-sm"></span> Declaring…
                    </template>
                    <template v-else-if="exam.canDeclare">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Declare Results
                    </template>
                    <template v-else>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      Results Declared
                    </template>
                  </button>

                  <NuxtLink :to="`/institute/mock-exams/${exam.id}`" class="view-btn" @click.stop>
                    View details →
                  </NuxtLink>

                  <!-- Delete (cascades: unassigns from every student) → `full`, not `edit`. -->
                  <button type="button" v-if="canManage(PERM_AREA)" class="del-btn" title="Delete exam"
                    :disabled="deletingId === exam.id"
                    @click.stop="askDelete(exam)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </div>
              </div>
            </div>

          </div>

        </template>

        <!-- ── Empty state ──────────────────────────────────────────────────── -->
        <div v-else-if="!examsLoading" style="padding:60px;text-align:center;">
          <div style="font-size:2.4rem;margin-bottom:12px;">📋</div>
          <div style="font-size:0.9rem;font-weight:700;color:var(--ink-dim);">No exams yet</div>
          <div style="font-size:0.73rem;color:var(--ink-faint);margin-top:4px;">Assign your first exam to get started</div>
          <NuxtLink to="/institute/assign-exams" class="hdr-btn hdr-primary" style="display:inline-flex;margin-top:20px;">
            Assign Exam →
          </NuxtLink>
        </div>

      </div>
    </div>

    <!-- Delete confirmation -->
    <Transition name="toast">
      <div v-if="confirmDel" class="del-overlay" @click.self="confirmDel = null">
        <div class="del-modal" role="dialog" aria-modal="true">
          <div class="del-modal-icon">🗑</div>
          <div class="del-modal-title">Delete this exam?</div>
          <div class="del-modal-body">
            <strong>{{ confirmDel.name }}</strong> will be permanently deleted and
            <strong>unassigned from every student</strong> who had it, along with their attempt data.
            This can't be undone.
          </div>
          <div class="del-modal-actions">
            <button type="button" class="del-cancel" @click="confirmDel = null" :disabled="!!deletingId">Cancel</button>
            <button type="button" class="del-confirm" @click="doDelete" :disabled="!!deletingId">
              <span v-if="deletingId" class="spin-sm"></span>
              {{ deletingId ? 'Deleting…' : 'Delete exam' }}
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
/* ── Header buttons ─────────────────────────────────────────────────────── */
.hdr-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.74rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer; text-decoration: none; transition: all 0.13s;
}
.hdr-btn:hover { border-color: var(--teal-border); color: var(--teal); }
.hdr-primary { background: var(--teal); color: #fff; border-color: var(--teal); }
.hdr-primary:hover { background: var(--teal-dark); color: #fff; border-color: var(--teal-dark); }

.tb-export-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.72rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer; transition: all 0.13s;
}
.tb-export-btn:hover { border-color: var(--teal-border); color: var(--teal); }

/* ── Section label ──────────────────────────────────────────────────────── */
.section-label { font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--ink-dim); }

/* ── Exam card ──────────────────────────────────────────────────────────── */
.exam-card { padding: 0; overflow: hidden; cursor: pointer; transition: box-shadow 0.18s, transform 0.18s; }
.exam-card:hover { box-shadow: 0 4px 20px rgba(15,31,46,0.08); transform: translateY(-1px); }
.exam-card:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }

.exam-row { display: flex; align-items: center; gap: 0; 
  @media (max-width: 600px) {
    flex-wrap: wrap;
  }
}

.accent-bar { width: 4px; flex-shrink: 0; align-self: stretch; border-radius: var(--r-lg) 0 0 var(--r-lg); }

.exam-info { flex: 2; min-width: 200px; padding: 16px 0 16px 20px; }
.exam-name-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 5px; }
.exam-name { font-size: 0.87rem; font-weight: 800; color: var(--ink); }

.type-badge {
  font-size: 0.6rem; font-weight: 800; padding: 2px 8px;
  border-radius: 20px; border: 1px solid; white-space: nowrap;
}
.marking-badge {
  font-size: 0.6rem; font-weight: 800; padding: 2px 8px;
  border-radius: 20px; background: var(--purple-light); color: var(--purple);
  border: 1px solid rgba(124,58,237,0.2); white-space: nowrap;
}
.exam-meta { font-size: 0.67rem; color: var(--ink-dim); display: flex; align-items: center; flex-wrap: wrap; gap: 3px; }
.meta-dot { color: var(--ink-faint); }

.metric-col { padding: 16px 14px; min-width: 82px; text-align: center; }
.metric-label { font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--ink-dim); margin-bottom: 4px; }
.metric-val { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: 1.2rem; font-weight: 700; }
.metric-delta { font-size: 0.65rem; font-weight: 700; margin-top: 2px; }

.dist-col { padding: 16px 14px; min-width: 110px; flex: 1; }

.pass-chip {
  display: inline-block; font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;
  font-size: 0.85rem; font-weight: 800; padding: 4px 12px;
  border-radius: 8px; border: 1.5px solid;
}

.actions-col {
  padding: 16px 18px 16px 10px;
  display: flex; align-items: center; gap: 7px; flex-shrink: 0;
}

/* ── Declare button ──────────────────────────────────────────────────────── */
.declare-btn {
  display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px;
  border-radius: 8px; font-family: Figtree, sans-serif; font-size: 0.7rem; font-weight: 700;
  cursor: pointer; transition: all 0.15s; white-space: nowrap; border: 1.5px solid;
}
.declare-active { background: var(--green-light); color: var(--green); border-color: var(--green-border); }
.declare-active:hover:not(:disabled) { background: var(--green); color: #fff; }
.declare-done { background: var(--surface); color: var(--ink-faint); border-color: var(--border); cursor: not-allowed; opacity: 0.7; }

/* ── View button ─────────────────────────────────────────────────────────── */
.view-btn {
  padding: 6px 14px; border-radius: 8px; background: var(--surface);
  border: 1.5px solid var(--border); font-family: Figtree, sans-serif;
  font-size: 0.72rem; font-weight: 700; color: var(--ink-mid); cursor: pointer;
  transition: all 0.13s; white-space: nowrap; text-decoration: none;
  display: inline-flex; align-items: center;
}
.view-btn:hover { border-color: var(--teal-border); color: var(--teal); background: var(--teal-pale); }

/* ── Delete button ───────────────────────────────────────────────────────── */
.del-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  color: var(--ink-faint); cursor: pointer; transition: all 0.13s; flex-shrink: 0;
}
.del-btn:hover:not(:disabled) { border-color: var(--rose-border); color: var(--rose); background: var(--rose-light); }
.del-btn:disabled { opacity: 0.5; cursor: default; }

/* ── Delete confirmation modal ───────────────────────────────────────────── */
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

/* ── Toast ───────────────────────────────────────────────────────────────── */
.me-toast {
  position: fixed; bottom: 32px; right: 32px; padding: 11px 18px; border-radius: 9px;
  color: #fff; font-family: Figtree, sans-serif; font-size: 0.78rem; font-weight: 700;
  box-shadow: 0 8px 32px rgba(0,0,0,0.16); z-index: 9999;
}
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }

/* ── Spinners ────────────────────────────────────────────────────────────── */
.spin-sm {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  border: 1.5px solid currentColor; border-top-color: transparent;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Stat helpers ────────────────────────────────────────────────────────── */
.stat-delta { font-size: 0.7rem; font-weight: 700; margin-top: 2px; }
.delta-up { color: var(--green); }
.delta-down { color: var(--rose); }
.mono { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; }

/* ── Skeleton ────────────────────────────────────────────────────────────── */
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
</style>
