<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
const { instName } = useInstitution()

// Permission matrix — the dashboard is visible to every portal user, but the
// data it pulls in is not. Skip calls this user isn't allowed to make.
const { can, canEdit } = useInstitutePermissions()

definePageMeta({ layout: 'institute' })
useHead({ title: 'Program Dashboard · Passmed Institute' })

const api = useInstituteApi()

type AtRisk = { user_id: number; name: string; initials: string; avatar_url: string | null; cohort: string; score: number; risk: 'high' | 'medium'; last_active_days: number | null }
type Band   = { band: string; count: number; risk: string }
type Topic  = { topic: string; pct: number }
type Mock   = { id: number; name: string; date: string; questions: number; cohort_avg: number; pass_rate: number; completed: number; total: number }
type Feed   = { name: string; text: string; time: string; color: string }

type Dash = {
  header: { institution: string; type: string; enrolled: number; updated_at: string }
  // Cohorts for the filter dropdown + the currently applied filter (echoed back).
  cohorts?: { id: number; name: string }[]
  cohort_id?: number | null
  stat_strip: { cohort_avg: number; at_risk_count: number; pass_rate: number; avg_weekly_qs: number; seats_used: number; seats_total: number }
  at_risk: AtRisk[]
  score_distribution: Band[]
  passing_pct: number
  at_risk_pct: number
  // The institution's saved pass mark. Every threshold label/colour/line on this
  // page derives from it — nothing re-hardcodes 60/65.
  pass_threshold: number
  weak_topics: Topic[]
  mock_results: Mock[]
  heatmap: number[][]
  heatmap_weeks?: string[]   // per-column start-of-week labels (e.g. "1 Jul") from the API
  activity_feed: Feed[]
}

const data    = ref<Dash | null>(null)
const loading = ref(true)
const error   = ref(false)

// Student profile drawer (inline — same as mock-exams detail page)
const router       = useRouter()
const drawerOpen   = ref(false)
const profileFull  = ref(false)
const sp           = ref<any | null>(null)
const spLoading    = ref(false)
const spUserId     = ref<number | null>(null)

async function openStudent(userId: number) {
  if (!userId) return
  drawerOpen.value = true
  profileFull.value = false
  spLoading.value = true
  sp.value = null
  spUserId.value = userId
  fetchCohorts()
  try {
    const res = await api<any>(`/institution-students/${userId}/profile`)
    if (res?.status === 'success') sp.value = res.data
  } catch { /* ignore */ }
  finally { spLoading.value = false }
}

// Cohort assign/change from the profile panel.
const cohorts = ref<{ id: number; name: string }[]>([])
const cohortBusy = ref(false)
async function fetchCohorts() {
  if (cohorts.value.length) return
  // /cohorts is gated by perm:seats_cohorts,view — calling it without the
  // permission just 403s and leaves the picker empty, so don't call it at all.
  if (!can('seats_cohorts')) return
  try {
    const res = await api<any>('/cohorts')
    const list = res?.data ?? res ?? []
    cohorts.value = (Array.isArray(list) ? list : []).map((c: any) => ({ id: c.id, name: c.name }))
  } catch { /* ignore */ }
}
async function changeCohort(targetId: number) {
  const p = sp.value
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
  const id = spUserId.value
  if (!id) { showToast('No account for this student yet', 'var(--amber)'); return }
  if (checkinBusy.value) return          // guard against double-clicks
  checkinBusy.value = true
  try {
    const res = await api<any>(`/students/${id}/checkin`, { method: 'POST' })
    if (res?.status === 'success') showToast('Check-in email sent to ' + (sp.value?.name ?? 'student'), 'var(--teal)')
    else showToast(res?.message || 'Could not send check-in', 'var(--rose)')
  } catch {
    showToast('Could not send check-in — try again', 'var(--rose)')
  } finally {
    checkinBusy.value = false
  }
}
function closeDrawer() { drawerOpen.value = false; profileFull.value = false }
function viewFullProfile() { drawerOpen.value = false; profileFull.value = true }
function backToDashboard() { profileFull.value = false }

const spEngMax = computed(() =>
  Math.max(1, ...((sp.value?.engagement ?? []).map((d: any) => d.count)))
)

// ── The institution's pass mark ───────────────────────────────────────────────
// Comes from /dashboard (`pass_threshold`), which reads the saved Settings value.
// Every threshold-bearing label, colour and chart line on this page reads it. The
// bug it fixes: these were all written as a literal 65, so an institution that set
// its pass mark to 60% still saw "Below 65% pass threshold" and a pass line drawn
// in the wrong place. 65 is only the pre-fetch default.
const passMark    = computed(() => Number(data.value?.pass_threshold ?? 65))
// Borderline band width — mirrors INSTITUTE_MEDIUM_BAND in the backend helper.
const mediumFloor = computed(() => passMark.value - 5)
function accColor(p: number) {
  if (p >= 80) return 'var(--green)'
  if (p >= 70) return 'var(--teal)'
  if (p >= 60) return 'var(--amber)'
  return 'var(--rose)'
}
function spStatusStyle(risk: string) {
  if (risk === 'high')   return 'background:var(--rose-light);color:var(--rose);border-color:var(--rose-border);'
  if (risk === 'medium') return 'background:var(--amber-light);color:var(--amber);border-color:var(--amber-border);'
  return 'background:var(--green-light);color:var(--green);border-color:var(--green-border);'
}
const spTrend = computed(() => {
  const pts = (sp.value?.score_trend ?? []) as { label: string; value: number }[]
  const W = 520, H = 92, PAD = { t: 16, r: 16, b: 26, l: 26 }
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b
  const minV = 40, maxV = 100
  const n = pts.length
  const toX = (i: number) => n <= 1 ? PAD.l + cW / 2 : PAD.l + (i / (n - 1)) * cW
  const toY = (v: number) => PAD.t + cH - ((v - minV) / (maxV - minV)) * cH
  const dots = pts.map((p, i) => ({ x: +toX(i).toFixed(1), y: +toY(p.value).toFixed(1), v: p.value, label: p.label }))
  const line = dots.map(d => d.x + ',' + d.y).join(' ')
  const baseY = +(PAD.t + cH).toFixed(1)
  const area = dots.length > 1 ? dots[0].x + ',' + baseY + ' ' + line + ' ' + dots[dots.length - 1].x + ',' + baseY : ''
  // The middle gridline IS the pass line, so it has to sit on the institution's
  // own threshold rather than a hardcoded 65.
  const grid = [50, passMark.value, 80].map(v => ({ v, y: +toY(v).toFixed(1) }))
  const passY = +toY(passMark.value).toFixed(1)
  return { W, H, PAD, cW, cH, dots, line, area, grid, passY }
})

// Dashboard cohort filter — null = whole institution. Performance stats scope to
// the chosen cohort server-side; licence/mock/activity widgets stay institution-wide.
// State is shared with the topbar selector (institute layout) via useCohortFilter,
// so changing the topbar dropdown re-runs this fetch.
const { selectedCohortId, cohortList } = useCohortFilter()
async function fetchDashboard() {
  loading.value = true
  error.value   = false
  try {
    const query: Record<string, any> = {}
    if (selectedCohortId.value) query.cohort_id = selectedCohortId.value
    const res = await api<any>('/dashboard', { query })
    if (res?.status === 'success') {
      data.value = res.data
      // Feed the shared list so the topbar selector can render the cohorts.
      cohortList.value = res.data?.cohorts ?? []
    }
    else error.value = true
  } catch { error.value = true }
  finally { loading.value = false }
}
// Re-fetch whenever the cohort changes (from the topbar or elsewhere).
watch(selectedCohortId, () => { fetchDashboard() })
onMounted(fetchDashboard)

// ── Derived helpers ────────────────────────────────────────────────────────────
const distMax = computed(() =>
  Math.max(1, ...((data.value?.score_distribution ?? []).map(b => b.count)))
)
const heatMax = computed(() => {
  const flat = (data.value?.heatmap ?? []).flat()
  return Math.max(1, ...flat)
})
function heatLevel(v: number) {
  if (v === 0) return 0
  const r = v / heatMax.value
  if (r > 0.75) return 4
  if (r > 0.5)  return 3
  if (r > 0.25) return 2
  return 1
}

// Same bands as the risk rule — a score at or above the pass mark is never shown
// as a warning, whatever the pass mark happens to be.
function scoreBadgeClass(s: number) {
  if (s < mediumFloor.value) return 'score-danger'
  if (s < passMark.value)    return 'score-warn'
  return 'score-ok'
}
function topicColor(p: number) {
  if (p < 45) return 'var(--rose)'
  if (p < 60) return 'var(--amber)'
  if (p < 67) return 'var(--teal)'
  return 'var(--green)'
}
function topicPctColor(p: number) {
  if (p < 45) return 'var(--rose)'
  if (p < 60) return 'var(--amber)'
  if (p < 67) return 'var(--teal-mid)'
  return 'var(--green)'
}
function bandColor(risk: string) {
  if (risk === 'high')   return 'var(--rose)'
  if (risk === 'medium') return 'var(--amber)'
  if (risk === 'strong') return 'var(--green)'
  return 'var(--teal-mid)'
}
function lastActiveLabel(d: number | null) {
  if (d === null) return '—'
  if (d === 0) return 'Today'
  if (d === 1) return '1d ago'
  return `${d}d ago`
}
function feedColor(c: string) {
  return c === 'rose' ? 'var(--rose)' : c === 'amber' ? 'var(--amber)' : c === 'green' ? 'var(--green)' : 'var(--teal)'
}
function passColor(p: number) {
  if (p >= 75) return 'var(--green)'
  if (p >= passMark.value) return 'var(--teal-mid)'
  return 'var(--amber)'
}

// ── Toast ──────────────────────────────────────────────────────────────────────
const toast = ref<{ text: string; color: string } | null>(null)
function showToast(text: string, color = 'var(--teal)') {
  toast.value = { text, color }
  setTimeout(() => { toast.value = null }, 2400)
}

// ── Export — real Cohort Performance PDF via the reports endpoint ──────────────
const { downloading: exporting, downloadReport } = useReportDownload()
async function exportReport() {
  const r = await downloadReport({ type: 'cohort', range: 'year' }, 'cohort-performance-summary.pdf')
  if (r.ok) showToast(`${r.filename} downloaded`, 'var(--teal)')
  else if (r.error) showToast(r.error, 'var(--rose)')
}
</script>

<template>
<div class="main">


  <!-- Scrollable content -->
  <div class="content">

    <!-- PAGE HEADER -->
    <div class="page-header fi d1">
      <div>
        <div class="page-title">Program Dashboard</div>
        <div class="page-sub">
          <template v-if="data">{{ data.header.type }} · {{ data.header.enrolled }} residents enrolled · Last updated {{ data.header.updated_at }}</template>
          <template v-else>Loading…</template>
        </div>
      </div>
      <div class="dash-head-actions">
        <!-- Cohort filter now lives in the shared topbar (institute layout). -->
        <!-- Export moved here from the topbar (topbar is now shared in the layout). -->
        <button type="button" class="export-btn" :disabled="exporting" :style="exporting ? 'opacity:0.6;cursor:default' : ''" @click="exportReport">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {{ exporting ? 'Exporting…' : 'Export Report' }}
        </button>
      </div>
    </div>

    <!-- ── Loading skeleton ── -->
    <template v-if="loading">
      <div class="stat-strip">
        <div v-for="i in 5" :key="i" class="stat-card" style="padding:14px 16px;">
          <div class="sk" style="width:55%;height:8px;margin-bottom:10px;"></div>
          <div class="sk" style="width:40%;height:22px;margin-bottom:8px;"></div>
          <div class="sk" style="width:65%;height:7px;"></div>
        </div>
      </div>
      <div class="sk" style="width:100%;height:300px;border-radius:12px;margin-top:16px;"></div>
    </template>

    <!-- ── Error ── -->
    <div v-else-if="error || !data" style="padding:60px;text-align:center;">
      <div style="font-size:2.2rem;margin-bottom:12px;">⚠️</div>
      <div style="font-size:0.9rem;font-weight:700;color:var(--ink-dim);">Couldn't load dashboard</div>
      <div style="font-size:0.73rem;color:var(--ink-faint);margin-top:4px;">Please try again.</div>
      <button type="button" class="export-btn" style="display:inline-flex;margin-top:18px;" @click="fetchDashboard">Retry</button>
    </div>

    <!-- ── Student full profile (replaces dashboard body) ── -->
    <div v-else-if="profileFull && sp" style="animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;">
      <div class="back-row">
        <button type="button" class="back-btn" @click="backToDashboard">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to dashboard
        </button>
        <span class="back-sep">›</span>
        <span class="back-name">{{ sp.name }}</span>
      </div>
      <div class="hero-card">
        <div class="hero-left">
          <div class="fp-avatar">
            <img v-if="sp.avatar_url" :src="sp.avatar_url" :alt="sp.name" class="fp-avatar-img" />
            <template v-else>{{ sp.initials }}</template>
          </div>
          <div>
            <div class="hero-title">{{ sp.name }}</div>
            <div class="hero-meta">{{ sp.meta || '-' }}</div>
            <span class="sd-status" :style="spStatusStyle(sp.risk)" style="margin-top:6px;"><span class="status-dot"></span>{{ sp.status_label }}</span>
          </div>
        </div>
        <div class="hero-stats">
          <div class="hero-stat"><div class="hero-stat-label">Avg Score</div><div class="hero-stat-val">{{ sp.avg_score }}%</div></div>
          <div class="hero-stat"><div class="hero-stat-label">Qs Done</div><div class="hero-stat-val">{{ sp.qs_answered.toLocaleString() }}</div></div>
          <div class="hero-stat"><div class="hero-stat-label">Streak</div><div class="hero-stat-val">{{ sp.streak }}</div></div>
        </div>
      </div>
      <div class="fp-grid">
        <div class="card">
          <div class="card-title">Score Trend</div>
          <div class="card-sub" style="margin-bottom:10px;">Monthly average · pass mark {{ passMark }}%</div>
          <svg v-if="spTrend.dots.length" width="100%" :viewBox="'0 0 ' + spTrend.W + ' ' + spTrend.H" preserveAspectRatio="xMidYMid meet" style="display:block;max-height:130px;overflow:visible;">
            <line v-for="g in spTrend.grid" :key="'g'+g.v" :x1="spTrend.PAD.l" :y1="g.y" :x2="spTrend.PAD.l + spTrend.cW" :y2="g.y" stroke="var(--border)" stroke-width="1"/>
            <line :x1="spTrend.PAD.l" :y1="spTrend.passY" :x2="spTrend.PAD.l + spTrend.cW" :y2="spTrend.passY" stroke="var(--amber)" stroke-width="1.5" stroke-dasharray="4,3"/>
            <polygon v-if="spTrend.dots.length > 1" :points="spTrend.area" fill="var(--teal)" fill-opacity="0.10"/>
            <polyline v-if="spTrend.dots.length > 1" :points="spTrend.line" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <template v-for="d in spTrend.dots" :key="d.label">
              <circle :cx="d.x" :cy="d.y" r="4" fill="var(--teal)" stroke="#fff" stroke-width="2"/>
              <text :x="d.x" :y="d.y - 9" text-anchor="middle" font-size="9" font-weight="800" fill="var(--teal-dark)" font-family="Figtree,sans-serif">{{ d.v }}%</text>
              <text :x="d.x" :y="spTrend.PAD.t + spTrend.cH + 16" text-anchor="middle" font-size="9" fill="#7a95ad" font-family="Figtree,sans-serif">{{ d.label }}</text>
            </template>
          </svg>
          <div v-else class="sd-empty">Not enough data yet.</div>
        </div>
        <div class="card">
          <div class="card-title">Weekly Engagement</div>
          <div class="card-sub" style="margin-bottom:14px;">Questions answered · last 7 days</div>
          <div class="we-chart">
            <div v-for="(d, di) in sp.engagement" :key="di" class="we-col">
              <div class="we-count">{{ d.count || '' }}</div>
              <div class="we-bar" :style="{ height: (d.count ? Math.max(6, Math.round(d.count / spEngMax * 64)) : 3) + 'px', background: d.count ? 'var(--teal)' : 'var(--border)' }"></div>
              <div class="we-lbl">{{ d.label }}</div>
            </div>
          </div>
          <div class="sd-eng-note">{{ sp.week_qs }} questions this week</div>
        </div>
      </div>
      <div class="fp-grid" style="margin-top:16px;">
        <div class="card">
          <div class="card-title">Topic Accuracy</div>
          <div class="card-sub" style="margin-bottom:14px;">Performance by subject area</div>
          <div v-if="sp.topic_accuracy.length">
            <div v-for="t in sp.topic_accuracy" :key="t.topic" class="sd-topic">
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
          <div v-if="sp.mock_history.length">
            <div v-for="(m, mi) in sp.mock_history" :key="mi" class="sd-mock">
              <span class="sd-mock-score mono" :style="{ color: accColor(m.score) }">{{ m.score }}%</span>
              <div><div class="sd-mock-name">{{ m.name }}</div><div class="sd-mock-date">{{ m.date }}<template v-if="m.timed"> · Timed</template></div></div>
            </div>
          </div>
          <div v-else class="sd-empty">No mock exams completed yet.</div>
        </div>
      </div>
      <div class="card" style="margin-top:16px;">
        <div class="card-title" style="margin-bottom:12px;">Actions</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <button v-if="canEdit('students')" type="button" class="sd-action-primary" style="width:auto;margin:0;padding:9px 16px;" :disabled="checkinBusy" @click="sendCheckin()">{{ checkinBusy ? 'Sending…' : 'Send check-in email' }}</button>
          <button v-if="can('assign_exams')" type="button" class="sd-action" style="flex:0 0 auto;padding:9px 16px;" @click="router.push('/institute/assign-exams')">Assign targeted exam</button>
          <select v-if="sp.seat_id && canEdit('seats_cohorts')" class="sd-cohort-select" style="flex:0 0 auto;margin:0;width:auto;" :value="sp.cohort_id ?? ''" :disabled="cohortBusy"
            @change="changeCohort(+($event.target as HTMLSelectElement).value)">
            <option value="" disabled>{{ sp.cohort_id ? 'Change cohort…' : 'Assign cohort…' }}</option>
            <option v-for="c in cohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
      </div>
    </div>

    <template v-else>

      <!-- ── STAT STRIP ── -->
      <div class="stat-strip">
        <div class="stat-card c-teal d1">
          <div class="stat-label">Cohort Avg Score</div>
          <div class="stat-val">{{ data.stat_strip.cohort_avg }}<span style="font-size:1rem;color:var(--ink-dim)">%</span></div>
          <div class="stat-sub">Across completed mocks</div>
        </div>
        <div class="stat-card c-rose d2">
          <div class="stat-label">At-Risk Residents</div>
          <div class="stat-val" style="color:var(--rose)">{{ data.stat_strip.at_risk_count }}</div>
          <div class="stat-sub">Below {{ passMark }}% pass threshold</div>
        </div>
        <div class="stat-card c-green d3">
          <div class="stat-label">Pass Rate (mock)</div>
          <div class="stat-val">{{ data.stat_strip.pass_rate }}<span style="font-size:1rem;color:var(--ink-dim)">%</span></div>
          <div class="stat-sub">Latest exam</div>
        </div>
        <div class="stat-card c-amber d4">
          <div class="stat-label">Avg Weekly Qs</div>
          <div class="stat-val">{{ data.stat_strip.avg_weekly_qs }}</div>
          <div class="stat-sub">Per resident · last 7 days</div>
        </div>
        <div class="stat-card c-purple d5">
          <div class="stat-label">Seats Used</div>
          <div class="stat-val">{{ data.stat_strip.seats_used }}<span style="font-size:1rem;color:var(--ink-dim)">/{{ data.stat_strip.seats_total }}</span></div>
          <div class="stat-sub">{{ Math.max(0, data.stat_strip.seats_total - data.stat_strip.seats_used) }} seats remaining</div>
        </div>
      </div>

      <!-- ── ROW 1: At-Risk Table ── -->
      <div class="section-divider d2">Attention required</div>
      <div class="d2" style="margin-bottom:16px;">
        <div class="card" style="padding:18px 0;">
          <div class="card-head" style="padding:0 20px;">
            <div>
              <div class="card-title">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                At-Risk Residents
              </div>
              <div class="card-sub">Below {{ passMark }}% · sorted by urgency</div>
            </div>
            <NuxtLink to="/institute/students?filter=atrisk" class="card-action">View all students →</NuxtLink>
          </div>

          <div v-if="data.at_risk.length" style="margin-top:12px;overflow: auto;">
            <table class="risk-table">
              <thead>
                <tr>
                  <th style="padding-left:20px">Resident</th>
                  <th>Risk</th>
                  <th>Avg Score</th>
                  <th>Activity</th>
                  <th style="padding-right:20px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in data.at_risk" :key="s.user_id" class="student-row" @click="openStudent(s.user_id)">
                  <td style="padding-left:20px">
                    <div class="stu-name-cell">
                      <div class="stu-av" :style="{ background: s.risk === 'high' ? 'linear-gradient(135deg,#be123c,#e11d48)' : 'linear-gradient(135deg,#92400e,#d97706)' }">
                        <img v-if="s.avatar_url" :src="s.avatar_url" :alt="s.name" class="stu-av-img" />
                        <template v-else>{{ s.initials }}</template>
                      </div>
                      <div>
                        <div class="stu-name">{{ s.name }}</div>
                        <div class="stu-cohort">{{ s.cohort || '—' }}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="risk-pill" :class="s.risk === 'high' ? 'risk-high' : 'risk-medium'"><span class="risk-dot"></span>{{ s.risk === 'high' ? 'High' : 'Medium' }}</span>
                  </td>
                  <td><span class="score-badge" :class="scoreBadgeClass(s.score)">{{ s.score }}%</span></td>
                  <td style="font-size:0.72rem;color:var(--ink-dim);">{{ lastActiveLabel(s.last_active_days) }}</td>
                  <td style="text-align:right;padding-right:20px">
                    <button type="button" class="action-link" @click.stop="openStudent(s.user_id)">View</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else style="padding:28px 20px;text-align:center;font-size:0.78rem;color:var(--ink-faint);">
            🎉 No at-risk residents — everyone is above the {{ passMark }}% threshold.
          </div>
        </div>
      </div>

      <!-- ── ROW 2: Performance Breakdown ── -->
      <div class="section-divider d3">Performance breakdown</div>

      <!-- Score Distribution -->
      <div class="card d3" style="margin-bottom:16px;">
        <div class="card-head">
          <div>
            <div class="card-title">Score Distribution</div>
            <div class="card-sub">{{ data.stat_strip.seats_used }} residents · latest mock scores</div>
          </div>
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="display:flex;align-items:center;gap:5px;font-size:0.67rem;color:var(--green);font-weight:700;">
              <div style="width:8px;height:8px;border-radius:2px;background:var(--green)"></div>Passing ({{ data.passing_pct }}%)
            </div>
            <div style="display:flex;align-items:center;gap:5px;font-size:0.67rem;color:var(--rose);font-weight:700;">
              <div style="width:8px;height:8px;border-radius:2px;background:var(--rose)"></div>At risk ({{ data.at_risk_pct }}%)
            </div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:flex-end;height:90px;margin-top:24px;margin-bottom:6px;">
          <div v-for="b in data.score_distribution" :key="b.band" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;height:100%;">
            <div style="font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.6rem;font-weight:700;" :style="{ color: bandColor(b.risk) }">{{ b.count }}</div>
            <div :style="{ width:'100%', height: (b.count === 0 ? 2 : Math.max(4, Math.round(b.count / distMax * 80))) + 'px', borderRadius:'4px 4px 0 0', background: bandColor(b.risk) }" :title="`${b.band}: ${b.count}`"></div>
          </div>
        </div>
        <div style="display:flex;gap:6px;border-top:1px solid var(--border);padding-top:5px;">
          <div v-for="b in data.score_distribution" :key="b.band" style="flex:1;font-size:0.6rem;color:var(--ink-dim);text-align:center;">{{ b.band }}</div>
        </div>
      </div>

      <div class="grid-2 d3">

        <!-- WEAK TOPICS -->
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Cohort Weak Topics</div>
              <div class="card-sub">Lowest avg accuracy across all residents</div>
            </div>
            <NuxtLink to="/institute/assign-exams" class="card-action">Assign targeted exam →</NuxtLink>
          </div>
          <div v-if="data.weak_topics.length" class="topic-grid">
            <div v-for="t in data.weak_topics" :key="t.topic" class="topic-row">
              <div class="topic-name">{{ t.topic }}</div>
              <div class="topic-track"><div class="topic-fill" :style="{ width: t.pct + '%', background: topicColor(t.pct) }"></div></div>
              <div class="topic-pct" :style="{ color: topicPctColor(t.pct) }">{{ t.pct }}%</div>
            </div>
          </div>
          <div v-else style="padding:24px;text-align:center;font-size:0.76rem;color:var(--ink-faint);">No topic data yet.</div>
        </div>

        <!-- MOCK EXAM RESULTS -->
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">Mock Exam Results</div>
              <div class="card-sub">Cohort performance · recent papers</div>
            </div>
            <NuxtLink to="/institute/assign-exams" class="card-action">Assign new →</NuxtLink>
          </div>
          <div v-if="data.mock_results.length" class="hide-scrollbar-by-css" style="flex: 1 1 0%; overflow-y: auto; min-height: 0px; max-height: 300px;">
            <table  class="exam-results-table">
              <thead>
                <tr><th>Exam</th><th>Cohort avg</th><th>Pass rate</th><th>Completed</th><th></th></tr>
              </thead>
              <tbody>
                <tr v-for="m in data.mock_results" :key="m.id">
                  <td>
                    <div class="exam-name-cell">{{ m.name }}</div>
                    <div class="exam-name-sub">{{ m.date }} · {{ m.questions }} Qs</div>
                  </td>
                  <td><span class="pass-rate-cell" :style="{ color: passColor(m.cohort_avg) }">{{ m.cohort_avg }}%</span></td>
                  <td><span class="score-badge" :class="m.pass_rate >= 75 ? 'score-ok' : m.pass_rate >= passMark ? 'score-warn' : 'score-danger'">{{ m.pass_rate }}%</span></td>
                  <td style="font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.74rem;color:var(--ink-mid)">{{ m.completed }}/{{ m.total }}</td>
                  <td style="text-align:right"><NuxtLink :to="`/institute/mock-exams/${m.id}`" class="action-link">View →</NuxtLink></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else style="padding:24px;text-align:center;font-size:0.76rem;color:var(--ink-faint);">No exams administered yet.</div>
        </div>
      </div>

      <!-- ── ROW 3: Engagement + Activity Feed ── -->
      <div class="section-divider d4">Platform usage & admin</div>
      <div class="d4 grid-2">

        <!-- ENGAGEMENT HEATMAP -->
        <div class="card" style="display:flex;flex-direction:column;">
          <div class="card-head">
            <div>
              <div class="card-title">Weekly Engagement</div>
              <div class="card-sub">Questions answered · last {{ data.heatmap?.length ?? 0 }} weeks</div>
            </div>
          </div>
          <div style="flex:1;display:flex;gap:6px;align-items:stretch;margin-top:8px;">
            <div style="display:flex;flex-direction:column;gap:3px;padding-top:2px;width:12px;text-align:center;">
              <div v-for="(lbl, di) in ['M','T','W','T','F','S','S']" :key="di" style="height:16px;font-size:0.52rem;color:var(--ink-faint);line-height:16px;">{{ lbl }}</div>
            </div>
            <div style="flex:1;display:flex;gap:3px;">
              <div v-for="(week, wi) in data.heatmap" :key="wi" style="flex:1;display:flex;flex-direction:column;gap:3px;">
                <div v-for="(val, dd) in week" :key="dd"
                  :class="'hm' + heatLevel(val)"
                  style="height:16px;border-radius:2px;"
                  :title="`${val} questions`"></div>
              </div>
            </div>
          </div>
          <!-- Per-week start-date labels, aligned under the columns (from API heatmap_weeks). -->
          <div v-if="data.heatmap_weeks?.length" style="display:flex;gap:6px;margin-top:5px;">
            <div style="flex:0 0 12px;"></div>
            <div style="flex:1;display:flex;gap:3px;">
              <div v-for="(wk, wi) in data.heatmap_weeks" :key="wi" style="flex:1;text-align:center;font-size:0.5rem;color:var(--ink-faint);white-space:nowrap;overflow:hidden;">{{ wk }}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:4px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border);">
            <span style="font-size:0.6rem;color:var(--ink-dim)">Less</span>
            <div style="width:10px;height:10px;border-radius:2px;" class="hm0"></div>
            <div style="width:10px;height:10px;border-radius:2px;" class="hm1"></div>
            <div style="width:10px;height:10px;border-radius:2px;" class="hm2"></div>
            <div style="width:10px;height:10px;border-radius:2px;" class="hm3"></div>
            <div style="width:10px;height:10px;border-radius:2px;" class="hm4"></div>
            <span style="font-size:0.6rem;color:var(--ink-dim)">More</span>
          </div>
        </div>

        <!-- ACTIVITY FEED -->
        <div class="card" style="display:flex;flex-direction:column;min-height:0;">
          <div class="card-head" style="flex-shrink:0;">
            <div>
              <div class="card-title">Activity Feed</div>
              <div class="card-sub">Recent cohort events</div>
            </div>
          </div>
          <div v-if="data.activity_feed.length" class="feed-list" style="flex:1;overflow-y:auto;min-height:0;max-height:300px;">
            <div v-for="(f, fi) in data.activity_feed" :key="fi" class="feed-item">
              <div class="feed-dot" :style="{ background: feedColor(f.color) }"></div>
              <div class="feed-body">
                <div class="feed-text"><strong v-if="f.name">{{ f.name }}</strong> {{ f.text }}</div>
                <div class="feed-time">{{ f.time }}</div>
              </div>
            </div>
          </div>
          <div v-else style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;padding:24px 0;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            <div style="font-size:0.74rem;font-weight:700;color:var(--ink-dim);">All caught up</div>
            <div style="font-size:0.65rem;color:var(--ink-faint);">No recent activity</div>
          </div>
        </div>

      </div>
    </template>

  </div><!-- /content -->

  <!-- ── Student profile drawer (inline) ─────────────────────────────────── -->
  <Transition name="drawer">
    <div v-if="drawerOpen && !profileFull" class="sd-overlay" @click.self="closeDrawer">
      <aside class="sd-panel">
        <button type="button" class="sd-close" @click="closeDrawer" aria-label="Close">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div v-if="spLoading" class="sd-body"><div class="sd-empty">Loading profile...</div></div>
        <template v-else-if="sp">
          <div class="sd-head">
            <div class="sd-avatar">
              <img v-if="sp.avatar_url" :src="sp.avatar_url" :alt="sp.name" class="sd-avatar-img" />
              <template v-else>{{ sp.initials }}</template>
            </div>
            <div>
              <div class="sd-name">{{ sp.name }}</div>
              <div class="sd-meta">{{ sp.meta || '-' }}</div>
              <span class="sd-status" :style="spStatusStyle(sp.risk)"><span class="status-dot"></span>{{ sp.status_label }}</span>
            </div>
          </div>
          <div class="sd-body">
            <div class="sd-section-label">Performance Summary</div>
            <div class="sd-stats">
              <div class="sd-stat"><div class="sd-stat-val" :style="{ color: accColor(sp.avg_score) }">{{ sp.avg_score }}%</div><div class="sd-stat-lbl">Avg Score</div></div>
              <div class="sd-stat"><div class="sd-stat-val">{{ sp.qs_answered.toLocaleString() }}</div><div class="sd-stat-lbl">Qs Answered</div></div>
              <div class="sd-stat"><div class="sd-stat-val">{{ sp.streak }}</div><div class="sd-stat-lbl">Day Streak</div></div>
            </div>
            <div class="sd-section-label">Topic Accuracy</div>
            <div v-if="sp.topic_accuracy.length">
              <div v-for="t in sp.topic_accuracy" :key="t.topic" class="sd-topic">
                <span class="sd-topic-name">{{ t.topic }}</span>
                <div class="sd-topic-bar"><div :style="{ width: t.pct + '%', background: accColor(t.pct) }"></div></div>
                <span class="sd-topic-pct mono" :style="{ color: accColor(t.pct) }">{{ t.pct }}%</span>
              </div>
            </div>
            <div v-else class="sd-empty">No topic data yet.</div>
            <div class="sd-section-label">Mock Exam History</div>
            <div v-if="sp.mock_history.length">
              <div v-for="(m, mi) in sp.mock_history" :key="mi" class="sd-mock">
                <span class="sd-mock-score mono" :style="{ color: accColor(m.score) }">{{ m.score }}%</span>
                <div><div class="sd-mock-name">{{ m.name }}</div><div class="sd-mock-date">{{ m.date }}<template v-if="m.timed"> &middot; Timed</template></div></div>
              </div>
            </div>
            <div v-else class="sd-empty">No mock exams completed yet.</div>
            <div class="sd-section-label">Engagement (last 7 days)</div>
            <div class="sd-eng">
              <div v-for="(d, di) in sp.engagement" :key="di" class="sd-eng-col">
                <div class="sd-eng-bar" :style="{ height: (d.count ? Math.max(4, Math.round(d.count / spEngMax * 40)) : 3) + 'px', background: d.count ? 'var(--teal)' : 'var(--border)' }"></div>
                <div class="sd-eng-lbl">{{ d.label }}</div>
              </div>
            </div>
            <div class="sd-eng-note">{{ sp.week_qs }} questions this week</div>
            <button v-if="canEdit('students')" type="button" class="sd-action-primary" :disabled="checkinBusy" @click="sendCheckin()">{{ checkinBusy ? 'Sending…' : 'Send Check-In Email' }}</button>
            <div v-if="sp.seat_id && canEdit('seats_cohorts')" class="sd-cohort">
              <label class="sd-cohort-lbl">{{ sp.cohort_id ? 'Cohort' : 'Assign cohort' }}</label>
              <select class="sd-cohort-select" :value="sp.cohort_id ?? ''" :disabled="cohortBusy"
                @change="changeCohort(+($event.target as HTMLSelectElement).value)">
                <option value="" disabled>{{ sp.cohort_id ? 'Change cohort…' : 'Select a cohort…' }}</option>
                <option v-for="c in cohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>
            <div class="sd-action-row">
              <button type="button" class="sd-action" @click="router.push('/institute/assign-exams')">Assign targeted exam</button>
              <button type="button" class="sd-action" @click="viewFullProfile">View full profile</button>
            </div>
          </div>
        </template>
        <div v-else class="sd-body"><div class="sd-empty">Couldn't load this student's profile.</div></div>
      </aside>
    </div>
  </Transition>

  <!-- Toast -->
  <Transition name="toast">
    <div v-if="toast" class="me-toast" :style="{ background: toast.color }">{{ toast.text }}</div>
  </Transition>
</div><!-- /main -->
</template>

<style scoped>
.export-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.74rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer; transition: all 0.13s;
}
.export-btn:hover { border-color: var(--teal-border); color: var(--teal); }

.dash-head-actions { display: flex; align-items: center; gap: 8px; }
.cohort-filter {
  padding: 7px 12px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.74rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer; transition: all 0.13s; outline: none;
}
.cohort-filter:hover:not(:disabled) { border-color: var(--teal-border); color: var(--teal); }
.cohort-filter:disabled { opacity: 0.6; cursor: default; }

.card-action { text-decoration: none; cursor: pointer; }
.action-link { text-decoration: none; cursor: pointer; }
.student-row { cursor: pointer; }

.me-toast {
  position: fixed; bottom: 32px; right: 32px; padding: 11px 18px; border-radius: 9px;
  color: #fff; font-family: Figtree, sans-serif; font-size: 0.78rem; font-weight: 700;
  box-shadow: 0 8px 32px rgba(0,0,0,0.16); z-index: 9999;
}
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }

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
/* ── Student profile drawer ──────────────────────────────────────────────── */
.sd-overlay { position: fixed; inset: 0; z-index: 600; background: rgba(11,25,41,0.4); display: flex; justify-content: flex-end; }
.sd-panel { width: 420px; max-width: 92vw; height: 100%; background: var(--white); box-shadow: -8px 0 40px rgba(0,0,0,0.16); display: flex; flex-direction: column; position: relative; overflow: hidden; }
.sd-close { position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--white); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink-dim); z-index: 2; }
.sd-close:hover { border-color: var(--rose-border); color: var(--rose); }
.sd-head { display: flex; gap: 14px; padding: 22px 22px 16px; border-bottom: 1px solid var(--border); }
.sd-avatar { width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0; background: linear-gradient(135deg,var(--teal),var(--teal-dark)); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 1.1rem; overflow: hidden; }
.sd-avatar-img { width: 100%; height: 100%; border-radius: 14px; object-fit: cover; display: block; }
.stu-av { overflow: hidden; }
.stu-av-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
.sd-name { font-size: 1.05rem; font-weight: 800; color: var(--ink); }
.sd-meta { font-size: 0.7rem; color: var(--ink-dim); margin: 2px 0 6px; }
.sd-status { display: inline-flex; align-items: center; gap: 5px; font-size: 0.6rem; font-weight: 800; padding: 3px 9px; border-radius: 20px; border: 1px solid; text-transform: uppercase; letter-spacing: 0.5px; }
.status-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
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
.sd-action-primary { width: 100%; margin-top: 18px; padding: 11px; border: none; border-radius: 9px; background: var(--teal); color: #fff; font-family: Figtree, sans-serif; font-size: 0.78rem; font-weight: 700; cursor: pointer; }
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
.mono { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; }
.back-row { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.back-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 8px; background: var(--white); border: 1.5px solid var(--border); font-family: Figtree, sans-serif; font-size: 0.74rem; font-weight: 700; color: var(--ink-mid); cursor: pointer; }
.back-btn:hover { border-color: var(--teal-border); color: var(--teal); }
.back-sep { color: var(--ink-faint); }
.back-name { font-size: 0.78rem; font-weight: 700; color: var(--ink); }
.hero-card { background: linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--r-lg); padding: 22px 26px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
.hero-left { display: flex; align-items: center; gap: 16px; }
.fp-avatar { width: 56px; height: 56px; border-radius: 16px; flex-shrink: 0; background: linear-gradient(135deg,var(--teal),var(--teal-dark)); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 1.2rem; overflow: hidden; }
.fp-avatar-img { width: 100%; height: 100%; border-radius: 16px; object-fit: cover; display: block; }
.hero-title { font-family: Figtree, sans-serif; font-size: 1.2rem; font-weight: 800; color: #fff; }
.hero-meta { font-size: 0.72rem; color: rgba(255,255,255,0.45); margin-top: 2px; }
.hero-stats { display: flex; gap: 26px; flex-wrap: wrap; }
.hero-stat { text-align: center; }
.hero-stat-label { font-size: 0.56rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.32); margin-bottom: 4px; }
.hero-stat-val { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: 1.5rem; font-weight: 700; line-height: 1; color: var(--teal); }
.fp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.we-chart { display: flex; align-items: flex-end; gap: 6px; height: 72px; }
.we-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 3px; height: 100%; }
.we-count { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: 0.58rem; font-weight: 700; color: var(--teal-mid); min-height: 9px; line-height: 1; }
.we-bar { width: 100%; max-width: 30px; border-radius: 3px 3px 0 0; transition: height 0.3s ease; }
.we-lbl { font-size: 0.55rem; color: var(--ink-faint); }
.drawer-enter-active, .drawer-leave-active { transition: opacity .25s; }
.drawer-enter-active .sd-panel, .drawer-leave-active .sd-panel { transition: transform .28s cubic-bezier(0.16,1,0.3,1); }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .sd-panel, .drawer-leave-to .sd-panel { transform: translateX(100%); }
.hide-scrollbar-by-css {
 /* Hide scrollbar - Firefox */
    scrollbar-width: none;

    /* Hide scrollbar - IE/Edge */
    -ms-overflow-style: none;
}

/* Hide scrollbar - Chrome, Safari, Opera */
.hide-scrollbar-by-css::-webkit-scrollbar {
    display: none;
}
</style>
