<script setup lang="ts">
// /institute/reports — downloadable institutional reports.
// Generation is REAL: GET /api-institute/v1/reports/generate (Laravel)
// aggregates live institutional data (/dashboard, /testinstitutions,
// /mock-exams, per-student profiles) and streams back a PDF/CSV download.
import { computed, ref, onMounted, watch } from 'vue'
const { instName } = useInstitution()
const api = useInstituteApi()

definePageMeta({ layout: 'institute' })
useHead({ title: 'Reports · Passmed Institute' })

type ReportDef = {
  id: 'cohort' | 'individual' | 'readiness' | 'mockexam' | 'atrisk' | 'engagement'
  icon: string
  title: string
  desc: string
  color: string
  badge: string
  tags: string[]
}

const reports: ReportDef[] = [
  { id: 'cohort',     icon: '📊',  title: 'Cohort Performance Summary',  desc: 'Overall cohort scores, pass rates, at-risk counts, and trend data.',                color: 'var(--teal)',    badge: 'PDF · ~2 pages',       tags: ['Scores','Trends','At-risk'] },
  { id: 'individual', icon: '🧑‍⚕️', title: 'Individual Student Reports',  desc: 'Per-resident score breakdown, topic strengths, engagement and mock exam history.',  color: 'var(--purple)',  badge: 'PDF · 1 per resident', tags: ['Per resident','Topics','Mock exams'] },
  { id: 'readiness',  icon: '🎯',  title: 'Board Readiness Assessment',   desc: 'Predicted readiness score based on question bank performance and trajectory.',      color: 'var(--green)',   badge: 'PDF · ~3 pages',       tags: ['Prediction','Risk bands','Timeline'] },
  { id: 'mockexam',   icon: '📝',  title: 'Mock Exam Analysis',           desc: 'Per-exam breakdown: score distribution, topic performance and student outcomes.',  color: 'var(--amber)',   badge: 'PDF · per exam',       tags: ['Distribution','Topics','Questions'] },
  { id: 'atrisk',     icon: '⚠️',  title: 'At-Risk Residents Report',     desc: 'Residents below pass threshold — scores, engagement, trend and recommended actions.', color: 'var(--rose)',  badge: 'PDF · ~2 pages',       tags: ['At-risk','Engagement','Actions'] },
  { id: 'engagement', icon: '📅',  title: 'Weekly Engagement Export',     desc: 'CSV of question volume, login activity and topic coverage per resident.',           color: 'var(--ink-mid)', badge: 'CSV · raw data',       tags: ['Activity','Volume','CSV'] },
]

// ── Date range ─────────────────────────────────────────────────────────────
const range = ref('This academic year')
const initialLoad = ref(true)
const RANGE_KEYS: Record<string, string> = {
  'Last 30 days': '30d', 'Last 90 days': '90d',
  'This academic year': 'year', 'All time': 'all',
}
const rangeKey = computed(() => RANGE_KEYS[range.value] || 'year')

// ── Recent reports (persisted locally per browser, pruned after 90 days) ───
type RecentEntry = {
  title: string; dateISO: string; period: string; size: string
  type: 'PDF' | 'CSV'; color: string
  params: { type: ReportDef['id']; range: string; exam_id?: string; student_id?: string }
}
const RECENT_KEY = 'inst:recent-reports:v1'
const recentReports = ref<RecentEntry[]>([])

function loadRecent() {
  if (!import.meta.client) return
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000
    recentReports.value = (Array.isArray(raw) ? raw : [])
      .filter((e: any) => e?.title && e?.dateISO && new Date(e.dateISO).getTime() > cutoff)
      .slice(0, 10)
  } catch { recentReports.value = [] }
}
function saveRecent() {
  if (!import.meta.client) return
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentReports.value)) } catch { /* quota */ }
}
function fmtDate(iso: string) {
  try {
    const d = new Date(iso)
    const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    return `${date}, ${time}`
  }
  catch { return iso }
}
function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return Math.max(1, Math.round(bytes / 1024)) + ' KB'
}

// ── Preview modal ───────────────────────────────────────────────────────────
const previewId = ref<ReportDef['id'] | null>(null)
const previewExamId = ref<string | null>(null)
// Individual report: null = All residents, otherwise a specific user_id.
const previewStudentId = ref<string | null>(null)
const studentOptions = ref<Array<{ id: string; name: string }>>([])
const toast = ref<{ text: string; color: string } | null>(null)

const previewReport = computed(() => reports.find(r => r.id === previewId.value) || null)

// Mock exam options for the per-exam report — fetched live.
const mockExamOptions = ref<Array<{ id: string; name: string; date: string }>>([])

onMounted(async () => {
  loadRecent()
  try {
    const res: any = await api('/mock-exams')
    const list: any[] = Array.isArray(res?.data) ? res.data : []
    mockExamOptions.value = list.map(m => ({
      id: String(m.id),
      name: m.name ?? 'Mock exam',
      date: m.date ?? m.created_at ?? '',
    }))
  } catch (e) {
    logError('[reports] /mock-exams fetch failed', e)
  }
  // Load the resident list up-front so the Individual report's student picker
  // (on both the card and the preview) is populated without opening the preview.
  try {
    const res: any = await api('/testinstitutions', { query: { limit: 500 } })
    rosterCache = Array.isArray(res?.data) ? res.data : []
    studentOptions.value = rosterCache
      .filter((r: any) => Number(r.user_id) > 0)
      .map((r: any) => ({ id: String(r.user_id), name: r.name || r.invite_name || 'Resident' }))
  } catch (e) {
    logError('[reports] /testinstitutions fetch failed', e)
  } finally {
    initialLoad.value = false
  }
})

function showToast(text: string, color = 'var(--teal)') {
  toast.value = { text, color }
  setTimeout(() => { toast.value = null }, 2400)
}

function openPreview(id: ReportDef['id']) {
  previewId.value = id
  // Note: previewExamId / previewStudentId are NOT reset here — the Mock Exam
  // and Individual cards have their own pickers, so a selection made on the card
  // carries into the preview.
  fetchPreview(id)
}
function closePreview() { previewId.value = null }

// ── Live preview data (same endpoints the pages use) ────────────────────────
const prevLoading = ref(false)
const prevError   = ref(false)
const prevData    = ref<any | null>(null)
let dashCache: any = null
let rosterCache: any[] | null = null

async function fetchPreview(id: ReportDef['id']) {
  prevLoading.value = true
  prevError.value = false
  prevData.value = null
  try {
    if (id === 'cohort' || id === 'readiness' || id === 'atrisk') {
      if (!dashCache) {
        const res: any = await api('/dashboard')
        if (res?.status !== 'success' || !res?.data) throw new Error('dashboard unavailable')
        dashCache = res.data
      }
      prevData.value = { kind: 'dash', d: dashCache }
    } else if (id === 'mockexam') {
      if (previewExamId.value) {
        const res: any = await api(`/mock-exams/${previewExamId.value}`)
        if (res?.status !== 'success' || !res?.data) throw new Error('exam unavailable')
        prevData.value = { kind: 'exam', e: res.data }
      } else {
        // All exams — overview list
        const res: any = await api('/mock-exams')
        const list: any[] = Array.isArray(res?.data) ? res.data : []
        prevData.value = { kind: 'examlist', list }
      }
    } else {
      if (!rosterCache) {
        const res: any = await api('/testinstitutions', { query: { limit: 500 } })
        rosterCache = Array.isArray(res?.data) ? res.data : []
      }
      // Build the student picker options (enrolled residents only).
      studentOptions.value = rosterCache
        .filter((r: any) => Number(r.user_id) > 0)
        .map((r: any) => ({ id: String(r.user_id), name: r.name || r.invite_name || 'Resident' }))

      if (id === 'individual' && previewStudentId.value) {
        // A specific resident is selected — preview their profile.
        const res: any = await api(`/institution-students/${previewStudentId.value}/profile`)
        if (res?.status === 'success' && res?.data) prevData.value = { kind: 'student', p: res.data }
        else prevData.value = { kind: 'roster', list: rosterCache }
      } else {
        prevData.value = { kind: 'roster', list: rosterCache }
      }
    }
  } catch (e) {
    logError('[reports] preview fetch failed', e)
    prevError.value = true
  } finally {
    prevLoading.value = false
  }
}

// Re-fetch the mock-exam preview when a different exam is picked.
watch(previewExamId, (v, old) => {
  if (previewId.value === 'mockexam' && v !== old) fetchPreview('mockexam')
})

// Re-fetch the individual preview when a different resident is picked.
watch(previewStudentId, (v, old) => {
  if (previewId.value === 'individual' && v !== old) fetchPreview('individual')
})

function scoreColor(s: number) {
  if (s >= 75) return 'var(--green)'
  if (s >= 65) return 'var(--teal)'
  if (s >= 60) return 'var(--amber)'
  return 'var(--rose)'
}
function riskBarColor(r: string) {
  if (r === 'high') return 'var(--rose)'
  if (r === 'medium') return 'var(--amber)'
  if (r === 'strong') return 'var(--green)'
  return 'var(--teal)'
}

const pvStats = computed<Array<{ label: string; value: string; color: string }>>(() => {
  const pd = prevData.value
  if (!pd) return []
  if (pd.kind === 'dash') {
    const d = pd.d, ss = d.stat_strip || {}
    if (previewId.value === 'cohort') {
      return [
        { label: 'Cohort avg', value: `${Math.round(ss.cohort_avg ?? 0)}%`, color: scoreColor(ss.cohort_avg ?? 0) },
        { label: 'Pass rate', value: `${Math.round(ss.pass_rate ?? 0)}%`, color: scoreColor(ss.pass_rate ?? 0) },
        { label: 'At risk', value: String(ss.at_risk_count ?? 0), color: 'var(--rose)' },
        { label: 'Seats used', value: `${ss.seats_used ?? 0}/${ss.seats_total ?? 0}`, color: 'var(--ink-mid)' },
      ]
    }
    if (previewId.value === 'readiness') {
      return [
        { label: 'Predicted ready', value: `${Math.round(d.passing_pct ?? 0)}%`, color: scoreColor(d.passing_pct ?? 0) },
        { label: 'At-risk share', value: `${Math.round(d.at_risk_pct ?? 0)}%`, color: 'var(--rose)' },
        { label: 'Enrolled', value: String(d.header?.enrolled ?? 0), color: 'var(--teal)' },
      ]
    }
    const list = d.at_risk || []
    return [
      { label: 'At-risk residents', value: String(list.length), color: 'var(--rose)' },
      { label: 'High risk', value: String(list.filter((s: any) => s.risk === 'high').length), color: 'var(--rose)' },
      { label: 'Medium risk', value: String(list.filter((s: any) => s.risk === 'medium').length), color: 'var(--amber)' },
    ]
  }
  if (pd.kind === 'exam') {
    const e = pd.e
    return [
      { label: 'Cohort avg', value: `${Math.round(e.cohort_avg ?? 0)}%`, color: scoreColor(e.cohort_avg ?? 0) },
      { label: 'Pass rate', value: `${Math.round(e.pass_rate ?? 0)}%`, color: scoreColor(e.pass_rate ?? 0) },
      { label: 'Completed', value: `${e.completed ?? 0}/${e.total ?? 0}`, color: 'var(--ink-mid)' },
      { label: 'Questions', value: String(e.questions ?? e.question_count ?? 0), color: 'var(--teal)' },
    ]
  }
  if (pd.kind === 'roster') {
    const list = pd.list
    const active = list.filter((r: any) => Number(r.user_id) > 0)
    return [
      { label: 'Residents', value: String(list.length), color: 'var(--teal)' },
      { label: 'Enrolled', value: String(active.length), color: 'var(--green)' },
      { label: 'Invited', value: String(list.length - active.length), color: 'var(--amber)' },
    ]
  }
  if (pd.kind === 'student') {
    const p = pd.p
    return [
      { label: 'Avg score', value: `${Math.round(p.avg_score ?? 0)}%`, color: scoreColor(p.avg_score ?? 0) },
      { label: 'Qs answered', value: String(p.qs_answered ?? 0), color: 'var(--teal)' },
      { label: 'Day streak', value: String(p.streak ?? 0), color: 'var(--ink-mid)' },
      { label: 'Status', value: String(p.status_label ?? '—'), color: scoreColor(p.avg_score ?? 0) },
    ]
  }
  if (pd.kind === 'examlist') {
    const list = pd.list
    const avg = list.length ? Math.round(list.reduce((a: number, e: any) => a + (Number(e.cohort_avg) || 0), 0) / list.length) : 0
    return [
      { label: 'Total exams', value: String(list.length), color: 'var(--amber)' },
      { label: 'Avg cohort score', value: `${avg}%`, color: scoreColor(avg) },
    ]
  }
  return []
})

const pvBars = computed(() => {
  const pd = prevData.value
  if (!pd) return []
  let dist: any[] = []
  if (pd.kind === 'dash' && (previewId.value === 'cohort' || previewId.value === 'readiness')) dist = pd.d.score_distribution || []
  if (pd.kind === 'exam') dist = pd.e.score_distribution || []
  const max = Math.max(1, ...dist.map((b: any) => Number(b.count) || 0))
  return dist.map((b: any) => ({
    band: String(b.band ?? ''),
    count: Number(b.count) || 0,
    w: (Number(b.count) || 0) / max * 100,
    color: riskBarColor(String(b.risk ?? '')),
  }))
})

// ── SVG preview charts (mirror the visuals the generated PDF report carries) ────
// Headline gauge: the one % that defines the report. Null for reports that have no
// single headline number (at-risk table, roster, individual, engagement export).
const pvDonut = computed<{ pct: number; label: string; color: string } | null>(() => {
  const pd = prevData.value
  if (!pd) return null
  if (pd.kind === 'dash') {
    if (previewId.value === 'cohort') {
      const p = Math.round(pd.d.stat_strip?.pass_rate ?? 0)
      return { pct: p, label: 'Pass rate', color: scoreColor(p) }
    }
    if (previewId.value === 'readiness') {
      const p = Math.round(pd.d.passing_pct ?? 0)
      return { pct: p, label: 'Predicted ready', color: scoreColor(p) }
    }
  }
  if (pd.kind === 'exam') {
    const p = Math.round(pd.e.pass_rate ?? 0)
    return { pct: p, label: 'Pass rate', color: scoreColor(p) }
  }
  return null
})
// Donut geometry: r=26 → circumference 2πr ≈ 163.36. Dash = pct of that arc.
const DONUT_CIRC = 2 * Math.PI * 26
function donutDash(pct: number) { return `${(Math.min(100, Math.max(0, pct)) / 100) * DONUT_CIRC} ${DONUT_CIRC}` }
// Bar-chart layout (viewBox 0 0 280 110): evenly slot the distribution bands.
const BC = { x0: 12, x1: 268, base: 86, maxH: 62 }
function barSlot() { return (BC.x1 - BC.x0) / Math.max(1, pvBars.value.length) }
function barW() { return barSlot() * 0.58 }
function barX(i: number) { return BC.x0 + barSlot() * i + (barSlot() - barW()) / 2 }
function barH(w: number) { return Math.max(2, (w / 100) * BC.maxH) }

const pvRows = computed(() => {
  const pd = prevData.value
  if (!pd) return []
  if (pd.kind === 'dash' && previewId.value === 'atrisk') {
    return (pd.d.at_risk || []).map((s: any) => ({
      a: s.name ?? '—', b: s.cohort || '—',
      c: `${Math.round(s.score ?? 0)}%`, cColor: scoreColor(s.score ?? 0), d: String(s.risk ?? ''),
    }))
  }
  if (pd.kind === 'roster') {
    return pd.list.slice(0, 5).map((r: any) => {
      // seat_status may arrive as the string 'active' or the numeric 1 (both mean active).
      const active = r.seat_status === 'active' || Number(r.seat_status) === 1
      return {
        a: r.name || r.invite_name || '—', b: r.cohort_name || '—',
        c: active ? 'active' : 'invited',
        cColor: active ? 'var(--green)' : 'var(--amber)', d: '',
      }
    })
  }
  if (pd.kind === 'student') {
    return (pd.p.mock_history ?? []).slice(0, 5).map((m: any) => ({
      a: m.name ?? '—', b: m.date ?? '—',
      c: `${Math.round(m.score ?? 0)}%`, cColor: scoreColor(m.score ?? 0), d: '',
    }))
  }
  if (pd.kind === 'examlist') {
    return pd.list.slice(0, 6).map((e: any) => ({
      a: e.name ?? '—', b: e.date ?? e.created_at ?? '—',
      c: `${Math.round(e.cohort_avg ?? 0)}%`, cColor: scoreColor(e.cohort_avg ?? 0), d: '',
    }))
  }
  return []
})

function slug(s: string) {
  return s.replace(/[^a-z0-9]/gi, '-')
}

// Filename timestamp: DD-MM-YYYY-HH-MM-SS (used for the download fallback name
// when the cross-origin Content-Disposition header isn't readable in dev).
function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

// ── Generate & download ─────────────────────────────────────────────────────
const generating = ref<string | null>(null)

async function downloadReport(
  params: RecentEntry['params'],
  title: string,
  color: string,
  busyKey: string,
) {
  if (generating.value) return
  generating.value = busyKey
  try {
    // Same path as every other institute API call (dev: direct Laravel with
    // the browser's auth; prod: via the Nuxt proxy) — Laravel endpoint:
    // GET /api-institute/v1/reports/generate
    const res = await api.raw<Blob>('/reports/generate', {
      query: params,
      responseType: 'blob',
    })
    const blob = res._data as Blob
    if (!blob || (blob.type || '').includes('application/json')) {
      throw new Error('Report generation failed')
    }
    const cd = res.headers.get('content-disposition') || ''
    const m = cd.match(/filename="([^"]+)"/)
    const ext = params.type === 'engagement' ? 'csv' : 'pdf'
    // Keep the backend's base name (slug, exam name) but always stamp with the
    // user's LOCAL time — the server header carries UTC, which looked wrong.
    let base = (m?.[1] || `${slug(title).toLowerCase()}.${ext}`).replace(/\.[a-z0-9]+$/i, '')
    base = base.replace(/-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}-\d{2}$/, '')
    const filename = `${base}-${stamp()}.${ext}`

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)

    const entry: RecentEntry = {
      title,
      dateISO: new Date().toISOString(),
      period: range.value,
      size: fmtSize(blob.size),
      type: ext === 'csv' ? 'CSV' : 'PDF',
      color,
      params: { ...params },
    }
    recentReports.value = [entry, ...recentReports.value].slice(0, 10)
    saveRecent()
    showToast(`${filename} downloaded`)
  } catch (e: any) {
    logError('[reports] generate failed', e)
    let msg = 'Report generation failed — try again'
    try {
      const data = e?.data
      if (data instanceof Blob) {
        const j = JSON.parse(await data.text())
        if (j?.msg || j?.message) msg = j.msg || j.message
      } else if (data?.msg || data?.message) {
        msg = data.msg || data.message
      }
    } catch { /* keep generic */ }
    showToast(msg, 'var(--rose)')
  } finally {
    generating.value = null
  }
}

function generate(r: ReportDef) {
  const params: RecentEntry['params'] = { type: r.id, range: rangeKey.value }
  if (r.id === 'mockexam' && previewExamId.value) {
    // A specific exam is selected — otherwise generate ALL exams.
    params.exam_id = previewExamId.value
  }
  if (r.id === 'individual' && previewStudentId.value) {
    // A specific resident is selected — otherwise generate ALL residents.
    params.student_id = previewStudentId.value
  }
  downloadReport(params, r.title, r.color, r.id)
}

function downloadRecent(entry: RecentEntry, i: number) {
  downloadReport(entry.params, entry.title, entry.color, 'recent-' + i)
}
</script>

<template>
  <div class="main">

    <div class="content">

      <!-- Full-page skeleton (topbar stays) -->
      <div v-if="initialLoad">
        <div class="page-header" style="margin-bottom:20px;">
          <div>
            <div class="rpt-sk" style="width:140px;height:22px;margin-bottom:10px;"></div>
            <div class="rpt-sk" style="width:260px;height:12px;"></div>
          </div>
          <div class="rpt-sk" style="width:150px;height:34px;border-radius:9px;"></div>
        </div>
        <div class="grid-2" style="gap:14px;margin-bottom:20px;">
          <div v-for="n in 6" :key="'rsk' + n" class="card" style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:flex-start;gap:12px;">
              <div class="rpt-sk" style="width:38px;height:38px;border-radius:10px;flex-shrink:0;"></div>
              <div style="flex:1;">
                <div class="rpt-sk" style="width:70%;height:13px;margin-bottom:8px;"></div>
                <div class="rpt-sk" style="width:90px;height:16px;border-radius:20px;"></div>
              </div>
            </div>
            <div class="rpt-sk" style="width:100%;height:10px;"></div>
            <div class="rpt-sk" style="width:80%;height:10px;"></div>
            <div style="display:flex;gap:7px;margin-top:auto;">
              <div class="rpt-sk" style="flex:1;height:32px;border-radius:9px;"></div>
              <div class="rpt-sk" style="flex:1;height:32px;border-radius:9px;"></div>
            </div>
          </div>
        </div>
        <div class="card" style="padding:0;">
          <div style="padding:14px 20px 10px;border-bottom:1px solid var(--border);">
            <div class="rpt-sk" style="width:120px;height:12px;"></div>
          </div>
          <div v-for="n in 4" :key="'rrsk' + n" style="display:flex;align-items:center;gap:14px;padding:11px 20px;" :style="{ borderTop: n > 1 ? '1px solid var(--border)' : 'none' }">
            <div class="rpt-sk" style="width:34px;height:34px;border-radius:9px;flex-shrink:0;"></div>
            <div style="flex:1;">
              <div class="rpt-sk" style="width:200px;height:11px;margin-bottom:6px;"></div>
              <div class="rpt-sk" style="width:140px;height:9px;"></div>
            </div>
            <div class="rpt-sk" style="width:80px;height:28px;border-radius:8px;"></div>
          </div>
        </div>
      </div>

      <div v-else style="animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;">

        <!-- Header -->
        <div class="page-header" style="margin-bottom:20px;">
          <div>
            <div class="page-title">Reports</div>
            <div class="page-sub">{{ instName || 'Institute' }}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <select v-model="range" class="rpt-range">
              <option>Last 30 days</option>
              <option>Last 90 days</option>
              <option>This academic year</option>
              <option>All time</option>
            </select>
          </div>
        </div>

        <!-- Report cards -->
        <div class="grid-2" style="gap:14px;margin-bottom:20px;">
          <div v-for="r in reports" :key="r.id" class="card report-card">
            <div style="display:flex;align-items:flex-start;gap:12px;">
              <div class="rpt-icon" :style="{ background: r.color + '18' }">{{ r.icon }}</div>
              <div style="flex:1;">
                <div style="font-size:0.84rem;font-weight:800;color:var(--ink);margin-bottom:3px;">{{ r.title }}</div>
                <div
                  class="rpt-badge"
                  :style="{ color: r.color, background: r.color + '14', borderColor: r.color + '30' }"
                >{{ r.badge }}</div>
              </div>
            </div>
            <div style="font-size:0.73rem;color:var(--ink-mid);line-height:1.6;">{{ r.desc }}</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;">
              <span v-for="t in r.tags" :key="t" class="rpt-tag">{{ t }}</span>
            </div>

            <!-- Card-level student picker (Individual report) — scopes a direct
                 Generate (All / one resident) without opening the preview. -->
            <div v-if="r.id === 'individual'" class="card-picker">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-dim)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <label>Student</label>
              <select v-model="previewStudentId" class="exam-select" style="flex:1;">
                <option :value="null">All residents ({{ studentOptions.length }})</option>
                <option v-for="s in studentOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>

            <!-- Card-level exam picker (Mock Exam Analysis) — scopes a direct
                 Generate (All exams / one exam) without opening the preview. -->
            <div v-if="r.id === 'mockexam'" class="card-picker">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-dim)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <label>Exam</label>
              <select v-model="previewExamId" class="exam-select" style="flex:1;">
                <option :value="null">All exams ({{ mockExamOptions.length }})</option>
                <option v-for="e in mockExamOptions" :key="e.id" :value="e.id">{{ e.name }} · {{ e.date }}</option>
              </select>
            </div>

            <div style="display:flex;gap:7px;margin-top:auto;">
              <button type="button" class="rpt-preview-btn" @click="openPreview(r.id)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-1px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Preview
              </button>
              <button type="button"
                class="rpt-gen-btn"
                :style="{ background: r.color, opacity: generating && generating !== r.id ? 0.55 : 1 }"
                :disabled="!!generating"
                @click="generate(r)"
              >
                <span v-if="generating === r.id" class="gen-spinner"></span>
                {{ generating === r.id ? 'Generating…' : '↓ Generate' }}
              </button>
            </div>

            <!-- Reassurance while the report builds (generation + download is async). -->
            <div v-if="generating === r.id" class="gen-note">
              <span class="gen-spinner gen-spinner-ink"></span>
              Your report will download automatically when ready.
            </div>
          </div>
        </div>

        <!-- Recent reports -->
        <div class="card" style="padding:0;">
          <div style="padding:14px 20px 10px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
            <div class="card-title">Recent Reports</div>
            <div style="font-size:0.65rem;color:var(--ink-dim);">Auto-deleted after 90 days</div>
          </div>
          <div
            v-for="(r, i) in recentReports"
            :key="r.dateISO + r.title"
            class="recent-row"
            :style="{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }"
          >
            <div class="recent-icon" :style="{ background: r.color + '14' }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="r.color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div style="flex:1;">
              <div style="font-size:0.78rem;font-weight:700;color:var(--ink);">{{ r.title }}</div>
              <div style="font-size:0.64rem;color:var(--ink-dim);margin-top:1px;">{{ fmtDate(r.dateISO) }} · {{ r.period }} · {{ r.size }}</div>
            </div>
            <span
              class="rpt-type"
              :style="{ background: r.color + '14', color: r.color, borderColor: r.color + '30' }"
            >{{ r.type }}</span>
            <button type="button" class="rpt-dl" :disabled="!!generating" @click="downloadRecent(r, i)">{{ generating === 'recent-' + i ? 'Generating…' : '↓ Download' }}</button>
          </div>

          <!-- Empty state -->
          <div v-if="!recentReports.length" style="padding:26px 20px;text-align:center;font-size:0.72rem;color:var(--ink-dim);">
            No reports generated yet — your downloads will appear here.
          </div>
        </div>

      </div>
    </div>

    <!-- Preview modal -->
    <Transition name="rpt-modal">
      <div v-if="previewReport" class="rpt-overlay" @click.self="closePreview">
        <div class="rpt-modal">
          <div class="rpt-head">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="rpt-icon" :style="{ background: previewReport.color + '18' }">{{ previewReport.icon }}</div>
              <div>
                <div style="font-size:0.9rem;font-weight:800;color:var(--ink);">{{ previewReport.title }}</div>
                <div style="font-size:0.67rem;font-weight:700;" :style="{ color: previewReport.color }">{{ previewReport.badge }} · Preview</div>
              </div>
            </div>
            <button type="button" @click="closePreview" class="rpt-close" aria-label="Close">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="rpt-body">
            <!-- Per-exam selector -->
            <div v-if="previewReport.id === 'mockexam'" class="exam-picker">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--teal-mid)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <label style="font-size:0.73rem;font-weight:700;color:var(--teal-dark);flex-shrink:0;">Exam:</label>
              <select v-model="previewExamId" class="exam-select">
                <option :value="null">All exams ({{ mockExamOptions.length }})</option>
                <option v-for="e in mockExamOptions" :key="e.id" :value="e.id">{{ e.name }} · {{ e.date }}</option>
              </select>
            </div>

            <!-- Per-student selector (Individual report) -->
            <div v-if="previewReport.id === 'individual'" class="exam-picker">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--teal-mid)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <label style="font-size:0.73rem;font-weight:700;color:var(--teal-dark);flex-shrink:0;">Student:</label>
              <select v-model="previewStudentId" class="exam-select">
                <option :value="null">All residents ({{ studentOptions.length }})</option>
                <option v-for="s in studentOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>

            <!-- Full popup skeleton while live preview data loads -->
            <div v-if="prevLoading">
              <div class="pv-sk" style="width:100%;height:72px;border-radius:var(--r-sm);margin-bottom:16px;"></div>
              <div style="margin-bottom:16px;">
                <div class="pv-sk" style="width:80px;height:9px;margin-bottom:10px;"></div>
                <div class="pv-sk" style="width:100%;height:11px;margin-bottom:6px;"></div>
                <div class="pv-sk" style="width:85%;height:11px;"></div>
              </div>
              <div style="margin-bottom:16px;">
                <div class="pv-sk" style="width:80px;height:9px;margin-bottom:10px;"></div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <div v-for="n in 3" :key="'pcsk' + n" class="pv-sk" :style="{ width: (60 + n * 10) + 'px', height: '22px', borderRadius: '20px' }"></div>
                </div>
              </div>
              <div>
                <div class="pv-sk" style="width:120px;height:9px;margin-bottom:10px;"></div>
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                  <div v-for="n in 4" :key="'pssk' + n" class="pv-sk" style="flex:1;height:48px;border-radius:10px;"></div>
                </div>
                <div v-for="n in 4" :key="'pbsk' + n" class="pv-sk" :style="{ width: (90 - n * 8) + '%', height: '10px', marginBottom: '6px' }"></div>
              </div>
            </div>

            <template v-else>
            <!-- Preview body — high-level summary; full SVG previews stub'd for follow-up -->
            <div class="preview-header" :style="{ background: previewReport.id === 'atrisk' ? 'linear-gradient(135deg,#3f0a14,#7f1d1d)' : 'linear-gradient(135deg,var(--navy),var(--navy-mid))' }">
              <div style="font-size:0.58rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.3);margin-bottom:2px;">Passmed Institutional Report</div>
              <div style="font-family:'Figtree',sans-serif;font-size:1rem;font-weight:800;color:#fff;">{{ previewReport.title }}</div>
              <div style="font-size:0.63rem;color:rgba(255,255,255,0.4);margin-top:3px;">{{ instName || 'Institute' }} · {{ range }}</div>
            </div>

            <div style="margin-bottom:16px;">
              <div class="prev-eyebrow">Summary</div>
              <div style="font-size:0.78rem;color:var(--ink-mid);line-height:1.7;">{{ previewReport.desc }}</div>
            </div>

            <div style="margin-bottom:16px;">
              <div class="prev-eyebrow">Contents</div>
              <ul class="prev-tags">
                <li v-for="t in previewReport.tags" :key="t">{{ t }}</li>
              </ul>
            </div>

            <!-- Live data preview -->
            <div style="margin-bottom:16px;">
              <div class="prev-eyebrow">Live preview · {{ range }}</div>

              <div v-if="prevError" style="font-size:0.72rem;color:var(--rose);">
                Couldn't load preview data — the full report may still generate fine.
              </div>

              <template v-else-if="prevData">
                <div v-if="pvStats.length" class="pv-stats">
                  <div v-for="st in pvStats" :key="st.label" class="pv-stat">
                    <div class="pv-stat-val" :style="{ color: st.color }">{{ st.value }}</div>
                    <div class="pv-stat-lbl">{{ st.label }}</div>
                  </div>
                </div>
                <!-- SVG chart previews — mirror the generated report's visuals -->
                <div v-if="pvDonut || pvBars.length" class="pv-charts">
                  <div v-if="pvDonut" class="pv-donut-wrap">
                    <svg viewBox="0 0 64 64" class="pv-donut">
                      <circle cx="32" cy="32" r="26" fill="none" stroke="var(--surface-hi)" stroke-width="8" />
                      <circle cx="32" cy="32" r="26" fill="none" :stroke="pvDonut.color" stroke-width="8"
                        stroke-linecap="round" :stroke-dasharray="donutDash(pvDonut.pct)" transform="rotate(-90 32 32)" />
                      <text x="32" y="36" text-anchor="middle" class="pv-donut-val" :fill="pvDonut.color">{{ pvDonut.pct }}%</text>
                    </svg>
                    <div class="pv-donut-lbl">{{ pvDonut.label }}</div>
                  </div>
                  <div v-if="pvBars.length" class="pv-barchart-wrap">
                    <div class="pv-chart-title">Score distribution</div>
                    <svg viewBox="0 0 280 110" class="pv-barchart" preserveAspectRatio="xMidYMid meet">
                      <line x1="12" y1="86" x2="268" y2="86" stroke="var(--border)" stroke-width="1" />
                      <g v-for="(b, i) in pvBars" :key="'svb' + i">
                        <rect :x="barX(i)" :y="86 - barH(b.w)" :width="barW()" :height="barH(b.w)" :fill="b.color" rx="2" />
                        <text :x="barX(i) + barW() / 2" :y="86 - barH(b.w) - 3" text-anchor="middle" class="pv-bc-count">{{ b.count }}</text>
                        <text :x="barX(i) + barW() / 2" y="100" text-anchor="middle" class="pv-bc-band">{{ b.band }}</text>
                      </g>
                    </svg>
                  </div>
                </div>
                <div v-if="pvRows.length" style="margin-top:10px;display:flex;flex-direction:column;">
                  <div v-for="(r, ri) in pvRows" :key="ri" class="pv-row">
                    <span style="flex:1;font-weight:700;color:var(--ink);">{{ r.a }}</span>
                    <span style="flex:1;color:var(--ink-dim);">{{ r.b }}</span>
                    <span style="font-weight:800;" :style="{ color: r.cColor }">{{ r.c }}</span>
                    <span v-if="r.d" class="pv-risk" :class="r.d === 'high' ? 'pv-risk-high' : 'pv-risk-med'">{{ r.d }}</span>
                  </div>
                  <div v-if="previewId === 'individual' || previewId === 'engagement'" style="font-size:0.65rem;color:var(--ink-dim);margin-top:6px;">
                    Full report covers every resident — this is just the first few.
                  </div>
                </div>
                <div v-if="!pvStats.length && !pvBars.length && !pvRows.length" style="font-size:0.72rem;color:var(--ink-dim);">
                  No data yet for this report.
                </div>
              </template>
            </div>

            <div class="prev-note">
              Full report includes charts, tables and per-resident breakdowns. Click "Generate report" below to download the {{ previewReport.id === 'engagement' ? 'CSV' : 'PDF' }}.
            </div>
            </template>
          </div>

          <div class="rpt-foot">
            <button type="button" @click="closePreview" class="foot-close">Close</button>
            <button type="button"
              class="foot-gen"
              :style="{ background: previewReport.color }"
              @click="generate(previewReport); closePreview()"
            >↓ Generate report</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="toast">
      <div v-if="toast" class="rpt-toast" :style="{ background: toast.color }">{{ toast.text }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.rpt-range {
  padding: 7px 12px; border-radius: 9px;
  border: 1.5px solid var(--border);
  font-family: Figtree, sans-serif; font-size: 0.75rem;
  color: var(--ink-mid); background: var(--white);
  outline: none; cursor: pointer;
}

.report-card { display: flex; flex-direction: column; gap: 10px; }

.rpt-icon {
  width: 38px; height: 38px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.2rem; flex-shrink: 0;
}

.rpt-badge {
  font-size: 0.67rem; font-weight: 700;
  padding: 2px 8px; border-radius: 20px;
  display: inline-block; border: 1px solid;
}

.rpt-tag {
  font-size: 0.62rem; font-weight: 700;
  padding: 2px 8px; border-radius: 20px;
  background: var(--surface); color: var(--ink-dim);
  border: 1px solid var(--border);
}

.rpt-preview-btn {
  flex: 1; padding: 8px; border-radius: 9px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.73rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer;
  transition: all 0.14s;
}
.rpt-preview-btn:hover {
  border-color: var(--teal-border); color: var(--teal); background: var(--teal-pale);
}

.rpt-gen-btn {
  flex: 1; padding: 8px; border-radius: 9px;
  border: none; color: #fff;
  font-family: Figtree, sans-serif; font-size: 0.73rem; font-weight: 800;
  cursor: pointer;
}

.recent-row {
  display: flex; align-items: center; gap: 14px;
  padding: 11px 20px; transition: background 0.1s;
}
.recent-row:hover { background: var(--surface); }
.recent-icon {
  width: 34px; height: 34px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.rpt-type {
  font-size: 0.6rem; font-weight: 800;
  padding: 2px 7px; border-radius: 20px; border: 1px solid;
}
.rpt-dl {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.7rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer;
}
.rpt-dl:hover { border-color: var(--teal-border); color: var(--teal); }

/* Modal */
.rpt-overlay {
  position: fixed; inset: 0; z-index: 600;
  background: rgba(11, 25, 41, 0.5);
  backdrop-filter: blur(3px);
  display: flex; align-items: flex-start; justify-content: center;
  overflow-y: auto; padding: 40px 20px;
}
.rpt-modal {
  background: var(--white); border-radius: var(--r-xl);
  width: 100%; max-width: 680px; margin: 0 auto;
  box-shadow: 0 24px 64px rgba(6,182,212,0.14), 0 8px 32px rgba(0,0,0,0.12);
  overflow: hidden;
}
.rpt-modal-enter-active, .rpt-modal-leave-active { transition: all 0.25s cubic-bezier(0.16,1,0.3,1); }
.rpt-modal-enter-from, .rpt-modal-leave-to { opacity: 0; }
.rpt-modal-enter-from .rpt-modal,
.rpt-modal-leave-to .rpt-modal { transform: translateY(16px) scale(0.97); opacity: 0; }

.rpt-head {
  padding: 18px 22px 16px; border-bottom: 1px solid var(--border);
  display: flex; align-items: flex-start; justify-content: space-between;
  flex-shrink: 0;
}
.rpt-close {
  width: 28px; height: 28px; border-radius: 7px;
  border: 1.5px solid var(--border); background: var(--white);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--ink-dim); flex-shrink: 0;
}
.rpt-close:hover { border-color: var(--rose-border); color: var(--rose); }

.rpt-body { padding: 22px 24px 28px; max-height: 72dvh; overflow-y: auto; }

.exam-picker {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 16px;
  background: var(--teal-pale);
  border: 1px solid var(--teal-border);
  border-radius: var(--r-sm);
  margin-bottom: 18px;
}
.exam-select {
  flex: 1; min-width: 0; max-width: 100%; padding: 6px 10px;
  border: 1.5px solid var(--teal-border); border-radius: 8px;
  font-family: Figtree, sans-serif; font-size: 0.76rem;
  color: var(--ink); background: var(--white);
  outline: none; cursor: pointer;
}
.card-picker {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.card-picker label {
  font-size: 0.68rem; font-weight: 700; color: var(--ink-dim);
  text-transform: uppercase; letter-spacing: 0.04em; flex-shrink: 0;
}
.gen-spinner {
  display: inline-block; width: 12px; height: 12px;
  margin-right: 6px; vertical-align: -1px;
  border: 2px solid rgba(255,255,255,0.45);
  border-top-color: #fff; border-radius: 50%;
  animation: gen-spin 0.7s linear infinite;
}
.gen-spinner-ink {
  width: 11px; height: 11px; margin-right: 7px;
  border-color: var(--teal-border); border-top-color: var(--teal);
}
.gen-note {
  display: flex; align-items: center;
  margin-top: 8px; padding: 8px 10px;
  background: var(--teal-pale); border: 1px solid var(--teal-border);
  border-radius: var(--r-sm);
  font-size: 0.7rem; font-weight: 600; color: var(--teal-dark);
}
@keyframes gen-spin { to { transform: rotate(360deg); } }

.preview-header { border-radius: var(--r-sm); padding: 16px 18px; margin-bottom: 16px; }

.prev-eyebrow {
  font-size: 0.6rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 1.5px; color: var(--ink-dim); margin-bottom: 8px;
}
.prev-tags {
  display: flex; flex-wrap: wrap; gap: 6px;
  list-style: none; padding: 0; margin: 0;
}
.prev-tags li {
  font-size: 0.7rem; font-weight: 700;
  padding: 4px 10px; border-radius: 20px;
  background: var(--surface); color: var(--ink-mid);
  border: 1px solid var(--border);
}
.prev-note {
  font-size: 0.7rem; color: var(--ink-dim);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--r-sm); padding: 10px 12px;
  line-height: 1.55;
}

.rpt-foot {
  padding: 14px 22px; border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  background: var(--surface);
  border-radius: 0 0 var(--r-xl) var(--r-xl);
}
.foot-close {
  padding: 8px 16px; border-radius: 9px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.76rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer;
}
.foot-gen {
  padding: 8px 20px; border-radius: 9px; border: none;
  color: #fff;
  font-family: Figtree, sans-serif; font-size: 0.76rem; font-weight: 800;
  cursor: pointer;
}

.rpt-toast {
  position: fixed; bottom: 32px; right: 32px;
  padding: 11px 18px; border-radius: 9px;
  color: #fff; font-family: Figtree, sans-serif;
  font-size: 0.78rem; font-weight: 700;
  box-shadow: 0 8px 32px rgba(0,0,0,0.16);
  z-index: 9999;
}
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }

.rpt-sk { background: var(--surface-2, #e5e7eb); border-radius: 6px; animation: rptPulse 1.2s ease-in-out infinite; }
@keyframes rptPulse { 0%, 100% { opacity: 0.85; } 50% { opacity: 0.5; } }

/* Live preview (report modal) */
.pv-stats { display: flex; gap: 8px; flex-wrap: wrap; }
.pv-stat {
  flex: 1; min-width: 90px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 9px 12px;
}
.pv-stat-val { font-size: 1.05rem; font-weight: 800; }
.pv-stat-lbl { font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-dim); margin-top: 2px; }
.pv-bar-row { display: flex; align-items: center; gap: 10px; }
.pv-bar-label { width: 64px; font-size: 0.68rem; color: var(--ink-mid); flex-shrink: 0; }
.pv-bar-track { flex: 1; height: 7px; border-radius: 4px; background: var(--surface); overflow: hidden; }
.pv-bar-track > div { height: 100%; border-radius: 4px; }
.pv-bar-count { width: 26px; text-align: right; font-size: 0.68rem; font-weight: 800; color: var(--ink-mid); flex-shrink: 0; }

/* ── SVG chart previews ── */
.pv-charts { margin-top: 12px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
.pv-donut-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
.pv-donut { width: 72px; height: 72px; }
.pv-donut-val { font-size: 15px; font-weight: 800; }
.pv-donut-lbl { font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-dim); }
.pv-barchart-wrap { flex: 1; min-width: 180px; }
.pv-chart-title { font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-dim); margin-bottom: 4px; }
.pv-barchart { width: 100%; height: auto; display: block; }
.pv-bc-count { font-size: 8px; font-weight: 800; fill: var(--ink-mid); }
.pv-bc-band { font-size: 7.5px; font-weight: 700; fill: var(--ink-dim); }
.pv-row { display: flex; align-items: center; gap: 10px; padding: 7px 2px; border-bottom: 1px solid var(--border); font-size: 0.72rem; }
.pv-row:last-of-type { border-bottom: none; }
.pv-risk {
  font-size: 0.58rem; font-weight: 800; text-transform: uppercase;
  padding: 2px 8px; border-radius: 20px; border: 1px solid;
}
.pv-risk-high { color: var(--rose); background: var(--rose-light, rgba(225,29,72,0.08)); border-color: var(--rose-border, rgba(225,29,72,0.3)); }
.pv-risk-med { color: var(--amber); background: var(--amber-light, rgba(217,119,6,0.08)); border-color: var(--amber-border, rgba(217,119,6,0.3)); }
.pv-sk { background: var(--surface-2, #e5e7eb); border-radius: 8px; animation: pvPulse 1.2s ease-in-out infinite; }
@keyframes pvPulse { 0%, 100% { opacity: 0.85; } 50% { opacity: 0.5; } }
</style>
