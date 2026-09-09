<script setup lang="ts">
definePageMeta({ layout: 'student' })
useHead({ title: 'My Dashboard · Passmed' })

const studentApi = useStudentApi()

// ─── Data state ───────────────────────────────────────────────────────────────
const loading   = ref(true)
const error     = ref<string | null>(null)

const examName      = ref<string | null>(null)
const stats         = ref<any>(null)
// One dated point per completed session (was: 8 weekly averages).
const scoreTrend    = ref<{ date: string; label?: string; ts?: number; score: number | null; n?: number }[]>([])
const topics        = ref<{ name: string; pct: number; total: number; correct: number }[]>([])
const weakAreas     = ref<{ name: string; pct: number; questions: number; topic_type?: string; topic_id?: number }[]>([])
const heatmap       = ref<Record<string, number>>({})
const cohort        = ref<any>(null)
// Pass mark for this student — from their institution's configured threshold
// (backend resolves it); 65 only as a pre-load default. Everything that used a
// literal 65 (pass line, by-topic ✓/✗, weak-area copy) reads this instead.
const passThreshold = ref(65)

// Topic bar colors (cycle through palette)
const topicColors = ['#16a34a','#06b6d4','#0891b2','#7c3aed','#ea580c','#0284c7']
const weakColors  = ['#d97706','#e11d48','#0891b2','#7c3aed']

// ─── Fetch dashboard data ─────────────────────────────────────────────────────
async function loadDashboard() {
  loading.value = true
  error.value   = null
  try {
    const res = await studentApi<any>('/dashboard')
    if (res?.status === 'success') {
      const d        = res.data
      examName.value = d.exam_name    ?? null
      stats.value    = d.stats        ?? null
      scoreTrend.value = d.score_trend ?? []
      topics.value   = d.topics       ?? []
      weakAreas.value= d.weak_areas   ?? []
      heatmap.value  = d.heatmap      ?? {}
      cohort.value   = d.cohort       ?? null
      passThreshold.value = d.pass_threshold ?? 65
    }
  } catch (e: any) {
    error.value = e?.data?.msg || e?.message || 'Failed to load dashboard'
  } finally {
    loading.value = false
    await nextTick()
    renderTrend()
    renderBell()
    renderHeatmap()
  }
}

onMounted(loadDashboard)

// Re-render the SVG charts on resize so they re-flow to the new width (fixed
// px sizing means they never zoom; this just recomputes spacing/fit). Debounced.
let resizeTimer: ReturnType<typeof setTimeout> | null = null
function onResize () {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => { renderTrend(); renderBell() }, 120)
}
onMounted(() => { if (import.meta.client) window.addEventListener('resize', onResize) })
onBeforeUnmount(() => {
  if (import.meta.client) window.removeEventListener('resize', onResize)
  if (resizeTimer) clearTimeout(resizeTimer)
})

// ─── One-time onboarding (newly subscribed → first dashboard load) ──────────
// Authoritative, cross-device: the user's `onboarded` flag comes from /me
// (false for brand-new accounts, set true once the welcome is dismissed). Show
// the modal while it's false; dismissing/starting flips it via the backend AND
// optimistically locally so it never re-opens on navigation.
const { user, fetchMe } = useAuth()
const showOnboarding     = ref(false)
const onboardingResolved = ref(false)   // decided once per session

const firstName = computed(() => {
  const u: any = user.value
  if (!u) return ''
  const fromName = String(u.name || '').trim().split(/\s+/)[0]
  return (u.firstname || u.first_name || fromName || '').trim()
})

function checkOnboarding() {
  if (onboardingResolved.value) return
  const u: any = user.value
  if (!u) return                       // /me not hydrated yet — wait for the watch
  if (u.onboarded === false) showOnboarding.value = true
  // Any concrete value (true/false) is a decision; undefined = backend not
  // deployed yet → leave unresolved so nothing shows.
  if (u.onboarded === true || u.onboarded === false) onboardingResolved.value = true
}
watch(user, checkOnboarding, { immediate: true })

// The intake modal owns the POST /onboarding/complete call (it sends the
// required intake fields). Once it succeeds it emits `done`; we just flip the
// local flag so it never re-opens and close it. The student stays on the
// dashboard (the single "Get started" action — no separate explore/practice).
async function onboardingDone() {
  // Optimistically close, then refresh /me so the freshly-saved intake details
  // (country, school, exam date, etc.) propagate everywhere — Settings reads
  // them from the user object, not just the onboarded flag.
  const u: any = user.value
  if (u) u.onboarded = true
  showOnboarding.value = false
  await fetchMe()
}

// Dashboard stats are all-exams (exam-independent), but the Cohort/Percentile
// card is per active exam — refresh on exam switch so that card stays current.
const { activeExam } = useExam()
watch(() => activeExam.value?.examId, (id, prev) => {
  if (id && id !== prev) loadDashboard()
})

// ─── Stat cards ───────────────────────────────────────────────────────────────
const statCards = computed(() => {
  const s = stats.value
  if (!s) return []
  const weekChange = s.questions_answered_change ?? 0
  const changeStr  = weekChange > 0 ? `↑ ${weekChange} this week`
                   : weekChange < 0 ? `↓ ${Math.abs(weekChange)} this week`
                   : `${weekChange} this week`
  return [
    {
      value: s.questions_answered != null
        ? `${s.questions_answered.toLocaleString()}${s.total_questions ? ' / ' + s.total_questions.toLocaleString() : ''}`
        : '—',
      sub: '',
      label: 'Questions answered',
      change: changeStr,
      trend: weekChange > 0 ? 'up' : weekChange < 0 ? 'down' : 'flat',
      color: 'teal',
      icon: 'book',
    },
    {
      value: s.avg_score != null ? s.avg_score + '%' : '—',
      sub: '',
      label: 'Average score',
      change: s.avg_score != null ? (s.avg_score >= passThreshold.value ? '↑ Above pass mark' : '↓ Below pass mark') : 'No sessions yet',
      trend: s.avg_score != null ? (s.avg_score >= passThreshold.value ? 'up' : 'down') : 'flat',
      color: 'green',
      icon: 'wave',
    },
    {
      value: cohort.value?.percentile != null ? cohort.value.percentile + 'th' : '—',
      sub: cohort.value?.rank != null ? ` · #${cohort.value.rank.toLocaleString()}` : '',
      label: 'Percentile rank',
      change: cohort.value?.percentile != null
        ? (cohort.value.percentile >= 50 ? '↑ Above median' : '↓ Below median')
        : 'Not enough data',
      trend: cohort.value?.percentile != null
        ? (cohort.value.percentile >= 50 ? 'up' : 'down')
        : 'flat',
      color: 'yellow',
      icon: 'star',
    },
    {
      value: String(s.day_streak ?? 0),
      sub: '',
      label: 'Day streak',
      change: s.day_streak > 0 ? `${s.day_streak} day${s.day_streak === 1 ? '' : 's'} in a row!` : 'Start your streak today',
      trend: s.day_streak > 0 ? 'up' : 'flat',
      color: 'rose',
      icon: 'refresh',
    },
  ]
})

// ─── Score trend chart ────────────────────────────────────────────────────────
function renderTrend() {
  // One dated point per completed session (backend now sends per-session rows,
  // not weekly averages) \u2014 so every session is its own marker on the line.
  const pts = scoreTrend.value.filter(d => d.score !== null && d.score !== undefined) as
    { date: string; label?: string; ts?: number; score: number; n?: number }[]
  if (!pts.length) return
  // minS = 0 so scores below 40% stay within the chart (board-prep students
  // often start at 30-50%); minS=40 plotted them off-canvas below the axis.
  // H = chart body height; viewBox is taller (see template) to fit the x labels.
  const H = 130, PAD_L = 28, PAD_R = 20, PAD_B = 10, PAD_T = 10, minS = 0, maxS = 100
  const VBH = 144   // viewBox height: 130 chart body + room for the x-axis labels
  const GAP = 60    // fixed px between consecutive sessions once they overflow
  const n = pts.length

  const svg = document.getElementById('tSvg') as SVGSVGElement | null
  if (!svg) return

  // Size the chart in REAL pixels (1 user unit = 1px, fixed height) so it never
  // zooms/stretches with the container width. If the sessions don't fill the
  // container we spread them across it; once they exceed it we hold a fixed
  // per-session gap and the wrapper scrolls horizontally to reach past sessions.
  const avail    = Math.max(320, Math.round((svg.parentElement?.clientWidth) || 440))
  const naturalW = PAD_L + (n - 1) * GAP + PAD_R
  const contentW = Math.max(naturalW, avail)
  const usableW  = contentW - PAD_L - PAD_R
  svg.setAttribute('viewBox', `0 0 ${contentW} ${VBH}`)
  svg.setAttribute('width', String(contentW))
  svg.setAttribute('height', String(VBH))

  // Full-width grid + pass-mark line; pass label anchored to the right edge.
  // The pass line's Y is derived from the institution pass threshold using the SAME
  // score→y scale as the plotted points, so it sits exactly at that score (was a
  // static y that assumed 65 and didn't align with the points).
  const passY = PAD_T + ((maxS - passThreshold.value) / (maxS - minS)) * (H - PAD_T - PAD_B)
  svg.querySelectorAll('.t-grid').forEach(g => g.setAttribute('x2', String(contentW)))
  const target = svg.querySelector('#tTarget')
  if (target) { target.setAttribute('x2', String(contentW)); target.setAttribute('y1', String(passY)); target.setAttribute('y2', String(passY)) }
  const targetLbl = svg.querySelector('#tTargetLbl')
  if (targetLbl) {
    // Position only — the label TEXT is bound in the template ({{ passThreshold }}%
    // pass) so Vue owns it; setting textContent here would fight that binding.
    targetLbl.setAttribute('x', String(contentW - 6))
    targetLbl.setAttribute('text-anchor', 'end')
    targetLbl.setAttribute('y', String(passY - 4))
  }

  // X position: EQUAL spacing between points. Spread across the usable width so
  // consecutive sessions sit at a constant distance (= GAP once scrolling).
  const xAt = (i: number) => n === 1 ? PAD_L + usableW / 2 : PAD_L + (i / (n - 1)) * usableW

  const plotPts = pts.map((d, i) => ({
    x: xAt(i),
    y: PAD_T + ((maxS - d.score) / (maxS - minS)) * (H - PAD_T - PAD_B),
    date: d.date, label: d.label ?? d.date, score: d.score, n: d.n,
  }))

  const lineD = plotPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  svg.querySelector('#tArea')!.setAttribute('d', `${lineD} L${plotPts[n-1].x},${H} L${plotPts[0].x},${H} Z`)
  svg.querySelector('#tLine')!.setAttribute('d', lineD)
  svg.querySelector('#tDots')!.innerHTML = plotPts.map(p =>
    `<circle class="t-dot" cx="${p.x}" cy="${p.y}" r="4"><title>${p.label} \u00b7 ${p.score}%${p.n ? ' \u00b7 ' + p.n + ' Qs' : ''}</title></circle>`).join('')

  // X-axis date labels \u2014 rendered as SVG <text> at each point's x so each label
  // sits directly under its point (previously a flex <span> row that ignored x,
  // so labels drifted away from their points). Thinned to ~7 to avoid crowding;
  // the first/last anchor inward so they don't clip the chart edges.
  const labels = svg.querySelector('#tLabels')
  if (labels) {
    // Labels now carry the exam time too ("25 June 08:30"), so they're wider —
    // thin to ~5 to avoid overlap. First/last anchor inward so they don't clip.
    const step = Math.max(1, Math.ceil(n / 5))
    const chosen = plotPts.filter((_, i) => i % step === 0 || i === n - 1)
    labels.innerHTML = chosen.map((p, i) => {
      const anchor = i === 0 ? 'start' : i === chosen.length - 1 ? 'end' : 'middle'
      return `<text class="t-axis" x="${p.x}" y="141" text-anchor="${anchor}">${p.label}</text>`
    }).join('')
  }
}

// Inverse standard-normal CDF (Acklam's rational approximation): maps a probability
// p∈(0,1) to its z-score. Lets the bell curve place the "You" marker so the shaded
// area equals the REAL cohort percentile, instead of a fabricated hardcoded SD.
function invNorm(p: number): number {
  p = Math.min(1 - 1e-6, Math.max(1e-6, p))
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924]
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857]
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878]
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742]
  const pl = 0.02425, ph = 1 - pl
  let q: number, r: number
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
  }
  if (p <= ph) {
    q = p - 0.5; r = q*q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)
  }
  q = Math.sqrt(-2 * Math.log(1 - p))
  return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
}

// ─── Bell curve ───────────────────────────────────────────────────────────────
function renderBell() {
  const svg = document.getElementById('bellSvg')
  if (!svg) return
  const W = 700, H = 143, PAD = 40, draw = W - PAD * 2

  const myScore   = cohort.value?.your_avg    ?? stats.value?.avg_score ?? 0
  const medianPct = cohort.value?.cohort_median ?? myScore
  const mean      = medianPct / 100
  // Curve width = the REAL cohort standard deviation (percentage points → 0–1) when
  // the backend has enough peers to compute it; clamped to a sane range so a very
  // tight or very wide cohort doesn't render a degenerate spike/flat curve. Falls
  // back to 0.14 (illustrative) while the cohort is still seeded / too small.
  const realSd    = Number(cohort.value?.cohort_sd)
  const sd        = (isFinite(realSd) && realSd > 0)
    ? Math.min(0.25, Math.max(0.06, realSd / 100))
    : 0.14

  // Place "You" at the x whose LEFT-AREA under the bell equals the REAL backend
  // percentile, so the shading can never contradict cohort.percentile (which the
  // old hardcoded SD applied to the raw score did, away from the median). Falls
  // back to the raw score position when no percentile is available.
  // Guard null explicitly: Number(null) === 0 is finite, which would wrongly place
  // "You" at the far left when the percentile is suppressed (too few peers). Fall
  // back to the raw score position in that case.
  const rawPctl = cohort.value?.percentile
  const pctl    = Number(rawPctl)
  const you  = (rawPctl != null && isFinite(pctl))
    ? Math.min(1, Math.max(0, mean + invNorm(pctl / 100) * sd))
    : myScore / 100

  const bell = (x: number) => Math.exp(-0.5 * ((x - mean) / sd) ** 2)
  const pts  = Array.from({ length: 100 }, (_, i) => {
    const x = i / 99
    return { x: PAD + x * draw, y: H - bell(x) * (H - 20) }
  })
  const lineD = pts.map((p, i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ')

  svg.querySelector('#bFill')!.setAttribute('d', `${lineD} L${pts[pts.length-1].x},${H} L${pts[0].x},${H} Z`)
  svg.querySelector('#bCurve')!.setAttribute('d', lineD)

  const toX   = (v: number) => PAD + v * draw
  const medX  = toX(mean)
  const youX  = toX(you)

  // Keep both marker labels inside the drawing, and when the two markers are
  // close (e.g. a low-percentile student near the left edge) stack them on
  // separate lines so "You …" and "Median …" don't overlap.
  const clampX = (x: number) => Math.min(650, Math.max(6, x))
  const close  = Math.abs(medX - youX) < 90

  const bMed = svg.querySelector('#bMed')!
  bMed.setAttribute('x1', String(medX)); bMed.setAttribute('x2', String(medX))
  const bMedLbl = svg.querySelector('#bMedLbl')!
  bMedLbl.setAttribute('x', String(clampX(medX - 42)))
  bMedLbl.setAttribute('y', close ? '12' : '16')
  bMedLbl.textContent = `Median ${Math.round(medianPct)}%`

  const bYou = svg.querySelector('#bYou')!
  bYou.setAttribute('x1', String(youX)); bYou.setAttribute('x2', String(youX))
  const bYouLbl = svg.querySelector('#bYouLbl')!
  bYouLbl.setAttribute('x', String(clampX(youX - 18)))
  bYouLbl.setAttribute('y', close ? '26' : '14')
  bYouLbl.textContent = `You · ${Math.round(myScore)}%`

  const youPts = pts.filter(p => p.x <= youX)
  svg.querySelector('#bShade')!.setAttribute('d',
    youPts.map((p,i)=>`${i===0?'M':'L'}${p.x},${p.y}`).join(' ') + ` L${youX},${H} L${pts[0].x},${H} Z`)
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────
// ISO week-of-year number for a YYYY-MM-DD date string
function isoWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  const t = new Date(d.valueOf())
  t.setDate(t.getDate() - ((d.getDay() + 6) % 7) + 3)   // shift to nearest Thursday
  const firstThu = t.valueOf()
  t.setMonth(0, 1)
  if (t.getDay() !== 4) t.setMonth(0, 1 + ((4 - t.getDay()) + 7) % 7)
  return 1 + Math.round((firstThu - t.valueOf()) / 604800000)
}

function renderHeatmap() {
  const el = document.getElementById('hmap')
  if (!el) return
  const entries = Object.entries(heatmap.value)
  if (!entries.length) {
    el.innerHTML = Array.from({ length: 14 }, () =>
      `<div class="hmap-col"><div class="hm-wk"></div>${Array.from({ length: 7 }, () =>
        `<div class="hm-cell hm0"></div>`).join('')}</div>`
    ).join('')
    return
  }

  const maxCount = Math.max(...Object.values(heatmap.value), 1)
  // Group by columns of 7 (weeks)
  const days     = Object.entries(heatmap.value)
  const cols: { label: string; cells: string }[] = []
  for (let i = 0; i < days.length; i += 7) {
    const colIdx    = i / 7
    const firstDate = days[i]?.[0]
    // Week-of-year labels every 3rd column — frequent enough to pin a mid-grid
    // streak to a calendar week, but spaced enough (45px pitch) that the "Wk NN"
    // text doesn't overlap the next label on the 12px+3px-gap grid.
    const label = (colIdx % 3 === 0 && firstDate) ? `Wk ${isoWeek(firstDate)}` : ''
    const cells = days.slice(i, i + 7).map(([, cnt]) => {
      const level = cnt === 0 ? 0 : Math.ceil((cnt / maxCount) * 4)
      return `<div class="hm-cell hm${level}" title="${cnt} Qs"></div>`
    }).join('')
    cols.push({ label, cells })
  }
  el.innerHTML = cols.map(c => `<div class="hmap-col"><div class="hm-wk">${c.label}</div>${c.cells}</div>`).join('')
}

// ─── Heatmap total stats ───────────────────────────────────────────────────────
// Dynamic chart-subtitle counts (data is per-session / variable, so the ranges
// can't be hardcoded). trendSessions = plotted score points; heatmapWeeks = actual
// number of week columns the activity grid renders (14 when there's no data yet).
const trendSessions = computed(() =>
  scoreTrend.value.filter(d => d.score !== null && d.score !== undefined).length)
const heatmapWeeks = computed(() => {
  const n = Object.keys(heatmap.value).length
  return n ? Math.ceil(n / 7) : 14
})

const heatmapTotal = computed(() => Object.values(heatmap.value).reduce((a, b) => a + b, 0))
const heatmapThisWeek = computed(() => {
  const now  = new Date()
  const mon  = new Date(now)
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  mon.setHours(0,0,0,0)
  return Object.entries(heatmap.value)
    .filter(([d]) => new Date(d) >= mon)
    .reduce((a, [, v]) => a + v, 0)
})
</script>

<template>
  <!-- Topbar — during initial load swap to a shimmer band so the whole page
       (topbar + content) reads as one unified skeleton (qbank pattern). -->
  <div v-if="loading" class="sk-topbar">
    <div class="sk-pulse" style="width:160px;height:18px;border-radius:4px"></div>
    <div class="sk-pulse" style="width:240px;height:11px;border-radius:4px;margin-top:6px"></div>
  </div>
  <StudentTopbar
    v-else
    title="My Dashboard"
    :show-start-session="true"
  />

  <div class="content">

    <!-- LOADING SKELETON -->
    <template v-if="loading">
      <div class="stat-strip fi d1">
        <div v-for="i in 4" :key="i" class="sc sc-teal" style="gap:10px">
          <div class="sk-pulse" style="width:40px;height:40px;border-radius:10px"></div>
          <div>
            <div class="sk-pulse" style="width:70px;height:20px;border-radius:4px;margin-bottom:6px"></div>
            <div class="sk-pulse" style="width:110px;height:12px;border-radius:3px"></div>
          </div>
        </div>
      </div>
      <div class="g3 mb fi d2">
        <div class="card" style="height:220px"><div class="sk-pulse" style="width:100%;height:100%;border-radius:8px"></div></div>
        <div class="card" style="height:220px"><div class="sk-pulse" style="width:100%;height:100%;border-radius:8px"></div></div>
      </div>
      <!-- Score Distribution section placeholder — keeps the skeleton the same
           height as the loaded page so content doesn't jump in below. -->
      <div class="fi d3">
        <div class="sk-pulse" style="width:150px;height:13px;border-radius:3px;margin:4px 0 12px"></div>
        <div class="card mb">
          <div class="sk-pulse" style="width:200px;height:16px;border-radius:4px;margin-bottom:8px"></div>
          <div class="sk-pulse" style="width:280px;height:11px;border-radius:3px;margin-bottom:16px"></div>
          <div class="sk-pulse" style="width:100%;height:64px;border-radius:10px;margin-bottom:16px"></div>
          <div class="sk-pulse" style="width:100%;height:180px;border-radius:8px"></div>
        </div>
      </div>
    </template>

    <!-- ERROR -->
    <div v-else-if="error" style="padding:40px;text-align:center;color:var(--rose)">
      {{ error }}
    </div>

    <!-- CONTENT -->
    <template v-else>

      <!-- STATS -->
      <div class="stat-strip fi d1">
        <div v-for="s in statCards" :key="s.label" :class="`sc sc-${s.color}`">
          <div class="sc-ico">
            <svg v-if="s.icon==='book'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0891b2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <svg v-else-if="s.icon==='wave'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <svg v-else-if="s.icon==='star'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#d4a800" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <svg v-else-if="s.icon==='refresh'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.18-5.65"/></svg>
          </div>
          <div class="sc-val">{{ s.value }}<span v-if="s.sub" style="font-size:0.72rem;font-weight:500;color:var(--ink-dim)">{{ s.sub }}</span></div>
          <div class="sc-lbl">{{ s.label }}</div>
          <div :class="['sc-chg', s.trend || 'flat']">{{ s.change }}</div>
        </div>
      </div>

      <!-- PERFORMANCE -->
      <div class="sec-lbl fi d2">Performance Analytics</div>
      <div class="g3 mb fi d2">

        <!-- Score Trend -->
        <div class="card">
          <div class="ch">
            <div><div class="ct">Score Trend</div><div class="cs">Score per session<span v-if="trendSessions"> · last {{ trendSessions }} session{{ trendSessions === 1 ? '' : 's' }}</span></div></div>
            <div class="legend">
              <div class="leg-item"><div class="leg-line" style="background:var(--teal)"></div> You</div>
              <div class="leg-item"><div class="leg-line" style="background:var(--rose)"></div> Pass mark</div>
            </div>
          </div>
          <div v-if="scoreTrend.every(d => d.score === null)" style="padding:32px;text-align:center;color:var(--ink-dim);font-size:0.8rem">
            Complete sessions to see your score trend
          </div>
          <template v-else>
            <!-- Horizontal scroll so many sessions hold a fixed spacing and
                 stay scrollable, instead of the SVG stretching to fit width. -->
            <div class="trend-wrap">
              <!-- Width + viewBox are set in real pixels by renderTrend (fixed
                   144px height) so the chart never zooms with the container. -->
              <svg class="trend-svg" viewBox="0 0 440 144" id="tSvg" style="height:144px;display:block"
                   role="img"
                   :aria-label="`Score trend line chart across your last ${trendSessions} timed session${trendSessions === 1 ? '' : 's'}, pass mark ${passThreshold}%`">
                <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#06b6d4" stop-opacity="0.2"/><stop offset="100%" stop-color="#06b6d4" stop-opacity="0"/></linearGradient></defs>
                <line class="t-grid" x1="0" y1="26" x2="440" y2="26"/><line class="t-grid" x1="0" y1="52" x2="440" y2="52"/>
                <line class="t-grid" x1="0" y1="78" x2="440" y2="78"/><line class="t-grid" x1="0" y1="104" x2="440" y2="104"/>
                <text class="t-axis" x="2" y="24">100</text><text class="t-axis" x="5" y="50">75</text>
                <text class="t-axis" x="5" y="76">50</text><text class="t-axis" x="5" y="102">25</text>
                <line id="tTarget" class="t-target" x1="32" y1="61.1" x2="440" y2="61.1"/>
                <text id="tTargetLbl" class="t-axis" x="374" y="57" style="fill:var(--rose)">{{ passThreshold }}% pass</text>
                <path id="tArea" class="t-area"/><path id="tLine" class="t-line"/><g id="tDots"></g>
                <!-- x-axis date labels, positioned at each point's x by renderTrend -->
                <g id="tLabels"></g>
              </svg>
            </div>
          </template>
        </div>

        <!-- By Topic -->
        <div class="card">
          <div class="ch">
            <div><div class="ct">By Topic</div><div class="cs">Current accuracy</div></div>
          </div>
          <div v-if="!topics.length" style="padding:32px;text-align:center;color:var(--ink-dim);font-size:0.8rem">
            Answer questions to see topic breakdown
          </div>
          <div v-else class="topic-list">
            <div v-for="(t, i) in topics" :key="t.name" class="t-row">
              <div class="t-name">{{ t.name }}</div>
              <div class="t-track"><div class="t-fill" :style="{ width: t.pct+'%', background: topicColors[i % topicColors.length] }"></div></div>
              <div class="t-pct" :style="{ color: topicColors[i % topicColors.length] }">{{ t.pct }}%</div>
              <div class="t-delta" :style="{ color: t.pct >= passThreshold ? 'var(--green)' : 'var(--rose)' }">
                {{ t.pct >= passThreshold ? '✓' : '✗' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- BELL CURVE -->
      <template v-if="cohort">
        <div class="sec-lbl fi d3">Score Distribution</div>
        <div class="card mb fi d3">
          <div class="ch">
            <div>
              <div class="ct">Where you stand</div>
              <div class="cs">{{ cohort.total_students?.toLocaleString() }} candidates · {{ examName ?? 'Active exam' }}</div>
            </div>
          </div>
          <div class="pct-banner">
            <!-- Once the student has a score, show their position (percentile). It's
                 estimated from the seeded median until enough real peers exist, then
                 real; the absolute #rank only shows when there's a real cohort. -->
            <template v-if="cohort.percentile != null">
              <div style="display:flex;align-items:center;gap:12px">
                <div class="pct-badge">{{ cohort.percentile }}th</div>
                <div>
                  <div class="pct-t">You're in the {{ cohort.percentile }}th percentile</div>
                  <div class="pct-s">Your score of {{ cohort.your_avg != null ? cohort.your_avg + '%' : '—' }} is higher than {{ cohort.percentile }}% of candidates</div>
                </div>
              </div>
              <div v-if="cohort.rank != null" style="text-align:right">
                <div class="pct-rank">#{{ cohort.rank?.toLocaleString() }} <span style="font-size:0.68rem;color:var(--ink-dim);font-weight:500">of {{ cohort.total_students?.toLocaleString() }} candidates</span></div>
                <div class="pct-rs">In your cohort</div>
              </div>
            </template>
            <!-- No completed session yet → prompt to start, no ranking noise. -->
            <template v-else>
              <div style="display:flex;align-items:center;gap:12px">
                <div class="pct-badge" style="font-size:1rem">—</div>
                <div>
                  <div class="pct-t">See where you stand</div>
                  <div class="pct-s">Complete a session to get your position, then it updates after every session.</div>
                </div>
              </div>
            </template>
          </div>
          <svg class="bell-svg" viewBox="0 0 700 175" id="bellSvg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;max-height:210px;display:block"
               role="img"
               :aria-label="`Cohort score bell curve. Your average ${cohort?.your_avg ?? '—'}%, cohort median ${cohort?.cohort_median ?? '—'}%, you are at the ${cohort?.percentile ?? '—'}th percentile`">
            <defs>
              <linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#94a3b8" stop-opacity="0.35"/><stop offset="100%" stop-color="#94a3b8" stop-opacity="0"/></linearGradient>
              <linearGradient id="bg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#06b6d4" stop-opacity="0.45"/><stop offset="100%" stop-color="#06b6d4" stop-opacity="0"/></linearGradient>
            </defs>
            <line class="b-axis" x1="40" y1="143" x2="672" y2="143"/>
            <path id="bFill" class="b-fill"/><path id="bShade" style="fill:url(#bg2)"/><path id="bCurve" class="b-curve"/>
            <line id="bMed" class="b-median" x1="0" y1="20" x2="0" y2="143"/>
            <text class="b-lbl" id="bMedLbl" x="0" y="16">Median</text>
            <line id="bYou" class="b-you" x1="0" y1="20" x2="0" y2="143"/>
            <text class="b-ylbl" id="bYouLbl" x="0" y="14">You</text>
            <text class="b-lbl" x="38" y="156">0%</text><text class="b-lbl" x="192" y="156">25%</text>
            <text class="b-lbl" x="346" y="156">50%</text><text class="b-lbl" x="497" y="156">75%</text><text class="b-lbl" x="644" y="156">100%</text>
          </svg>
          <div style="display:flex;gap:14px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
            <div class="ps"><div class="ps-val" style="color:var(--teal)">{{ cohort.your_avg != null ? cohort.your_avg + '%' : '—' }}</div><div class="ps-lbl">Your avg score</div></div>
            <div class="ps"><div class="ps-val">{{ cohort.cohort_median != null ? cohort.cohort_median + '%' : '—' }}</div><div class="ps-lbl">Cohort median</div></div>
            <div class="ps" v-if="cohort.above_median != null">
              <div class="ps-val" :style="{ color: (cohort.above_median ?? 0) >= 0 ? 'var(--green)' : 'var(--rose)' }">
                {{ (cohort.above_median ?? 0) >= 0 ? '+' : '' }}{{ cohort.above_median }}pp
              </div>
              <div class="ps-lbl">{{ (cohort.above_median ?? 0) >= 0 ? 'Above' : 'Below' }} median</div>
            </div>
          </div>
        </div>
      </template>

      <!-- WEAK AREAS + HEATMAP -->
      <div class="sec-lbl fi d4">Drill Down</div>
      <div class="g2 fi d4">

        <!-- Weak areas -->
        <div class="card">
          <div class="ch">
            <div><div class="ct">Areas to Improve</div><div class="cs">Topics scoring below {{ passThreshold }}%</div></div>
          </div>
          <div v-if="!weakAreas.length" style="padding:24px;text-align:center;color:var(--ink-dim);font-size:0.8rem">
            🎉 No weak areas — all topics above {{ passThreshold }}%!
          </div>
          <div v-else class="weak-grid">
            <!-- Deep-link into the qbank with this weak topic preselected. Falls back
                 to a plain div (no link) if the backend didn't send a topic_id. -->
            <component
              :is="w.topic_id ? 'NuxtLink' : 'div'"
              v-for="(w, i) in weakAreas"
              :key="w.name"
              class="wc"
              :class="{ 'wc-link': !!w.topic_id }"
              :to="w.topic_id ? { path: '/student/qbank', query: { topic_type: w.topic_type, topic_id: w.topic_id } } : undefined"
              :title="w.topic_id ? 'Practice ' + w.name + ' questions' : undefined">
              <div class="wc-name">{{ w.name }}</div>
              <div class="wc-bar"><div class="wc-fill" :style="{ width: w.pct+'%', background: weakColors[i % weakColors.length] }"></div></div>
              <div class="wc-meta">
                <span class="wc-pct" :style="{ color: weakColors[i % weakColors.length] }">{{ w.pct }}%</span>
                <span class="wc-cnt">{{ w.questions }} Qs</span>
              </div>
            </component>
          </div>
        </div>

        <!-- Study Activity heatmap -->
        <div class="card">
          <div class="ch">
            <div><div class="ct">Study Activity</div><div class="cs">Questions answered · last {{ heatmapWeeks }} week{{ heatmapWeeks === 1 ? '' : 's' }}</div></div>
            <div class="hmap-legend">
              <span style="font-size:0.6rem;color:var(--ink-dim)">Less</span>
              <div class="hm-leg hm0" style="border:1px solid var(--border)"></div>
              <div class="hm-leg hm1"></div><div class="hm-leg hm2"></div><div class="hm-leg hm3"></div><div class="hm-leg hm4"></div>
              <span style="font-size:0.6rem;color:var(--ink-dim)">More</span>
            </div>
          </div>
          <div class="hmap-row">
            <div class="hmap-days">
              <div class="hm-dl" style="height:13px"></div>
              <div class="hm-dl" style="height:12px">M</div><div class="hm-dl" style="height:12px"></div>
              <div class="hm-dl" style="height:12px">W</div><div class="hm-dl" style="height:12px"></div>
              <div class="hm-dl" style="height:12px">F</div><div class="hm-dl" style="height:12px"></div>
              <div class="hm-dl" style="height:12px">S</div>
            </div>
            <div class="hmap-cols" id="hmap"
                 role="img"
                 :aria-label="`Study activity heatmap over the last ${heatmapWeeks} week${heatmapWeeks === 1 ? '' : 's'}. ${heatmapTotal} questions answered, ${heatmapThisWeek} this week`"></div>
          </div>
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:18px">
            <div>
              <span style="font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.85rem;font-weight:700;color:var(--ink)">
                {{ heatmapTotal.toLocaleString() }}
              </span>
              <span style="font-size:0.67rem;color:var(--ink-dim)"> total Qs</span>
            </div>
            <div>
              <span style="font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.85rem;font-weight:700;color:var(--ink)">
                {{ stats?.day_streak ?? 0 }}
              </span>
              <span style="font-size:0.67rem;color:var(--ink-dim)"> day streak</span>
            </div>
            <div>
              <span style="font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.85rem;font-weight:700;color:var(--teal)">
                {{ heatmapThisWeek }}
              </span>
              <span style="font-size:0.67rem;color:var(--ink-dim)"> this week</span>
            </div>
          </div>
        </div>

      </div>
    </template>

  </div>

  <!-- One-time welcome for newly-subscribed students (teleports to body). -->
  <StudentOnboardingModal
    v-if="showOnboarding"
    :name="firstName"
    @done="onboardingDone"
  />
</template>
