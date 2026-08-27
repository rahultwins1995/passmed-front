<script setup lang="ts">

// Permission matrix (admin panel → Role Matrix). `canEdit` gates every
// mutation on this page; the same rules are enforced server-side by the
// perm: middleware, so hiding a button is UX, not the security boundary.
const { canEdit, readOnly } = useInstitutePermissions()
const PERM_AREA = 'students' as const

// /institute/at-risk — replaces renderAtRisk() + renderARTable() + arSortBy
import { computed, ref, onMounted, reactive } from 'vue'
const { instName } = useInstitution()
const api = useInstituteApi()

// Live at-risk residents come from the dashboard payload (same data the
// dashboard shows). Per-resident detail (score history, weekly activity) is
// fetched lazily from the student-profile endpoint when a row is expanded —
// so we never fire one request per row on load.
type Risk = 'high' | 'medium' | 'low'
type Trend = 'up' | 'down' | 'flat'
type Student = {
  userId: number | null
  name: string
  initials: string
  avatarUrl: string | null
  bg: string
  year: string
  score: number
  lastActive: number          // days since last activity
  risk: Risk
  trend: Trend
}
type Ext = {
  loading?: boolean
  scoreHistory: number[]
  scoreLabels: string[]
  weeklyQs: number[]
  weekTotal: number
  weakTopics: string[]
}

const students = ref<Student[]>([])
const loading  = ref(true)
const loadError = ref(false)
const ext = reactive<Record<number, Ext>>({})

// ── The institution's pass mark ───────────────────────────────────────────────
// Set from /at-risk (`pass_threshold`), which reads the saved Settings value. The
// risk bands themselves are decided by the backend; this is only so the labels
// and score colours on this page agree with them. 65 is the pre-fetch default.
const passMark    = ref(65)
// Borderline band width — mirrors INSTITUTE_MEDIUM_BAND in the backend helper.
const mediumFloor = computed(() => passMark.value - 5)

function riskBg(r: Risk) {
  if (r === 'high')   return 'linear-gradient(135deg,#be123c,#e11d48)'
  if (r === 'medium') return 'linear-gradient(135deg,#92400e,#d97706)'
  return 'linear-gradient(135deg,#1e40af,#3b82f6)'
}
function lastActiveLabel(days: number | null) {
  if (days === null || days === undefined) return '—'
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return days + 'd ago'
}

async function fetchAtRisk() {
  loading.value = true
  loadError.value = false
  try {
    // ONE call — the backend returns every at-risk resident WITH detail
    // (score history, last-7-day activity, weakest topics) in a single
    // batched response, so there is no per-student request.
    const res: any = await api('/at-risk')
    if (res?.status !== 'success' || !Array.isArray(res?.data)) { loadError.value = true; return }
    // The institution's saved pass mark — the header, the stat cards and the score
    // colours below all label themselves from it rather than hardcoding 60/65.
    if (res?.pass_threshold != null) passMark.value = Number(res.pass_threshold)
    students.value = res.data.map((r: any) => {
      const sh: number[] = (r.score_history || []).map((t: any) => Math.round(Number(t.value) || 0))
      const uid = Number(r.user_id) || null
      if (uid) {
        ext[uid] = {
          loading: false,
          scoreHistory: sh,
          scoreLabels:  (r.score_history || []).map((t: any) => String(t.label ?? '')),
          weeklyQs:     (r.weekly_qs || []).map((n: any) => Number(n) || 0),
          weekTotal:    Number(r.week_total) || 0,
          weakTopics:   Array.isArray(r.weak_topics) ? r.weak_topics : [],
        }
      }
      return {
        userId: uid,
        name: r.name ?? 'Unknown',
        initials: r.initials ?? (String(r.name ?? '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('') || '?'),
        avatarUrl: r.avatar_url ?? null,
        bg: riskBg((r.risk as Risk) || 'medium'),
        year: r.cohort || '—',
        score: Math.round(Number(r.score) || 0),
        lastActive: r.last_active_days ?? null,
        risk: (r.risk as Risk) || 'medium',
        trend: (sh.length >= 2 ? (sh[sh.length - 1] > sh[0] ? 'up' : sh[sh.length - 1] < sh[0] ? 'down' : 'flat') : 'flat') as Trend,
      }
    })
  } catch (e) {
    logError('[at-risk] fetch failed', e)
    loadError.value = true
  } finally {
    loading.value = false
  }
}

definePageMeta({ layout: 'institute' })
useHead({ title: 'At-Risk Students · Passmed Institute' })

type SortKey = 'name' | 'year' | 'score' | 'trend' | 'lastActive' | 'risk' | 'contacts' | 'scoreTrajectory' | 'engagement'

const high = computed(() => students.value.filter(s => s.risk === 'high'))
const medium = computed(() => students.value.filter(s => s.risk === 'medium'))

const sortKey = ref<SortKey>('risk')
const sortDir = ref<'asc' | 'desc'>('asc')
const expandedRow = ref<string | null>(null)

const cols: Array<{ key: SortKey | ''; label: string; align: 'left' | 'center' | 'right' }> = [
  { key: 'name',            label: 'Resident',      align: 'left'   },
  { key: 'year',            label: 'Cohort',        align: 'left'   },
  { key: 'score',           label: 'Score',         align: 'center' },
  { key: 'trend',           label: 'Trend',         align: 'center' },
  { key: 'lastActive',      label: 'Last Active',   align: 'center' },
  { key: 'risk',            label: 'Risk',          align: 'center' },
  { key: 'contacts',        label: 'Weak Topic',    align: 'left'   },
  { key: 'scoreTrajectory', label: 'Score History', align: 'center' },
  { key: 'engagement',      label: 'This Week',     align: 'center' },
  { key: '',                label: '',              align: 'right'  },
]

const riskRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
const trendRank: Record<string, number> = { down: 0, flat: 1, up: 2 }

const sorted = computed(() => {
  const list = [...students.value]
  const k = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  list.sort((a, b) => {
    let av: any, bv: any
    switch (k) {
      case 'name':       av = a.name; bv = b.name; break
      case 'year':       av = a.year; bv = b.year; break
      case 'score':      av = a.score; bv = b.score; break
      case 'trend':      av = trendRank[a.trend]; bv = trendRank[b.trend]; break
      case 'lastActive': av = a.lastActive; bv = b.lastActive; break
      case 'risk':       av = riskRank[a.risk]; bv = riskRank[b.risk]; break
      case 'contacts':
      case 'scoreTrajectory':
      case 'engagement': {
        const ae = a.userId ? ext[a.userId] : undefined
        const be = b.userId ? ext[b.userId] : undefined
        av = ae?.weekTotal ?? 0; bv = be?.weekTotal ?? 0; break
      }
      default: av = 0; bv = 0
    }
    if (typeof av === 'string') return av.localeCompare(bv as string) * dir
    return (av - bv) * dir
  })
  return list
})

function sortBy(k: SortKey | '') {
  if (!k) return
  if (sortKey.value === k) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = k
    sortDir.value = k === 'name' ? 'asc' : 'desc'
  }
}

function toggleExpand(s: Student) {
  expandedRow.value = expandedRow.value === s.name ? null : s.name
}

onMounted(fetchAtRisk)

// ── Sparkline helpers ──
function sparkPoints(values: number[], W = 60, H = 18): string {
  if (!values.length) return ''
  const mn = Math.min(...values) - 3
  const mx = Math.max(...values) + 3
  const range = Math.max(1, mx - mn)
  return values.map((v, i) => {
    const x = (4 + (i / (values.length - 1)) * (W - 8)).toFixed(0)
    const y = ((H - 4) - ((v - mn) / range) * (H - 8)).toFixed(0)
    return `${x},${y}`
  }).join(' ')
}
function sparkColor(values: number[]): string {
  if (values.length < 2) return 'var(--ink-faint)'
  const first = values[0]
  const last = values[values.length - 1]
  if (last < first) return 'var(--rose)'
  if (last > first) return 'var(--green)'
  return 'var(--ink-faint)'
}

function riskColors(risk: Student['risk']) {
  if (risk === 'high') return { bg: 'var(--rose-light)', color: 'var(--rose)', border: 'var(--rose-border)' }
  if (risk === 'medium') return { bg: 'var(--amber-light)', color: 'var(--amber)', border: 'var(--amber-border)' }
  return { bg: 'var(--green-light)', color: 'var(--green)', border: 'var(--green-border)' }
}

// Same bands as the risk rule, derived from the institution's pass mark — a score
// that clears the threshold is never painted as a warning.
function scoreColor(s: number) {
  if (s < mediumFloor.value) return 'var(--rose)'
  if (s < passMark.value)    return 'var(--amber)'
  return 'var(--teal-mid)'
}

// ── Toast ──
const toast = ref<{ text: string; color: string } | null>(null)
function showToast(text: string, color = 'var(--rose)') {
  toast.value = { text, color }
  setTimeout(() => { toast.value = null }, 2400)
}

const avgAtRiskScore = computed(() => {
  if (!students.value.length) return 0
  return Math.round(students.value.reduce((a, s) => a + s.score, 0) / students.value.length)
})

const sending = ref(false)
async function emailAll() {
  if (!students.value.length || sending.value) return
  sending.value = true
  try {
    const res: any = await api('/students/checkin-all', { method: 'POST' })
    if (res?.status === 'success') {
      const n = Number(res.sent ?? 0)
      showToast(res.message || `Check-in emails sent to ${n} at-risk resident${n === 1 ? '' : 's'}`, 'var(--teal)')
    } else {
      showToast(res?.message || 'Could not send check-in emails.', 'var(--rose)')
    }
  } catch {
    showToast('Could not send check-in emails.', 'var(--rose)')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="main">
    <!-- `view` level: page is visible but every mutation is hidden. -->
    <ReadOnlyBanner :area="PERM_AREA" />

    <div class="content">

      <!-- Full-page skeleton (topbar stays) -->
      <div v-if="loading">
        <div class="page-header" style="margin-bottom:18px;">
          <div>
            <div class="sk-pulse" style="width:200px;height:22px;border-radius:6px;margin-bottom:10px;"></div>
            <div class="sk-pulse" style="width:340px;height:12px;border-radius:5px;"></div>
          </div>
          <div class="sk-pulse" style="width:150px;height:34px;border-radius:9px;"></div>
        </div>
        <div class="grid-3" style="gap:12px;margin-bottom:20px;">
          <div v-for="n in 3" :key="'sksc' + n" class="stat-card" style="padding:14px 16px;">
            <div class="sk-pulse" style="width:60%;height:10px;border-radius:5px;margin-bottom:10px;"></div>
            <div class="sk-pulse" style="width:40%;height:20px;border-radius:6px;margin-bottom:8px;"></div>
            <div class="sk-pulse" style="width:70%;height:9px;border-radius:5px;"></div>
          </div>
        </div>
        <div class="card" style="padding:0;overflow:hidden;">
          <div class="ar-tbl-head"><div class="sk-pulse" style="width:170px;height:13px;border-radius:5px;"></div></div>
          <div v-for="n in 7" :key="'sktr' + n" style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-top:1px solid var(--border);">
            <div class="sk-pulse" style="width:30px;height:30px;border-radius:50%;flex-shrink:0;"></div>
            <div class="sk-pulse" :style="{ width: (62 - n * 4) + '%', height: '12px', borderRadius: '5px' }"></div>
            <div class="sk-pulse" style="width:46px;height:18px;border-radius:20px;margin-left:auto;"></div>
          </div>
        </div>
      </div>

      <div v-else style="animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both;">

        <div class="page-header" style="margin-bottom:18px;">
          <div>
            <div class="page-title">At-Risk Students</div>
            <div class="page-sub">{{ students.length }} residents below or near the {{ passMark }}% pass threshold</div>
          </div>
          <div class="page-header-right" style="gap:8px;">
            <button type="button" v-if="canEdit(PERM_AREA)" class="email-all-btn" @click="emailAll"
              :disabled="!students.length || sending"
              :style="(!students.length || sending) ? 'opacity:.5;cursor:not-allowed;' : ''">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              {{ sending ? 'Sending…' : 'Email All At-Risk' }}
            </button>
          </div>
        </div>

        <!-- Summary strip -->
        <div class="grid-3" style="gap:12px;margin-bottom:20px;">
          <div class="stat-card c-rose" style="padding:14px 16px;">
            <div class="stat-label">High Risk</div>
            <div class="stat-val" style="font-size:1.4rem;color:var(--rose);">{{ high.length }}</div>
            <div class="stat-sub">Below {{ mediumFloor }}% avg score</div>
          </div>
          <div class="stat-card c-amber" style="padding:14px 16px;">
            <div class="stat-label">Medium Risk</div>
            <div class="stat-val" style="font-size:1.4rem;color:var(--amber);">{{ medium.length }}</div>
            <div class="stat-sub">{{ mediumFloor }}–{{ passMark - 1 }}% avg score</div>
          </div>
          <!-- <div class="stat-card c-teal" style="padding:14px 16px;">
            <div class="stat-label">Days to Boards</div>
            <div class="stat-val" style="font-size:1.4rem;">87</div>
            <div class="stat-sub">ABA Basic Boards</div>
          </div> -->
          <div class="stat-card c-purple" style="padding:14px 16px;">
            <div class="stat-label">Avg Score (at-risk)</div>
            <div class="stat-val" style="font-size:1.4rem;color:var(--purple);">{{ avgAtRiskScore }}%</div>
            <div class="stat-sub">Across flagged residents</div>
          </div>
        </div>

        <!-- Error -->
        <div v-if="loadError" class="card" style="padding:28px;text-align:center;color:var(--rose);font-size:0.82rem;">
          Couldn't load at-risk residents. <button type="button" class="send-outreach" style="margin-left:8px;" @click="fetchAtRisk">Retry</button>
        </div>

        <!-- Empty -->
        <div v-else-if="!students.length" class="card" style="padding:32px;text-align:center;color:var(--ink-dim);font-size:0.82rem;">
          No residents are currently at risk. 🎉
        </div>

        <!-- Main table -->
        <div v-else class="card" style="padding:0;overflow:hidden;">
          <div class="ar-tbl-head">
            <div style="font-size:0.84rem;font-weight:800;color:var(--ink);display:flex;align-items:center;gap:7px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Intervention Tracker
            </div>
            <div style="font-size:0.65rem;color:var(--ink-dim);">Click any row to expand · click name to open full profile</div>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid var(--border);">
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
              <template v-for="s in sorted" :key="s.name">
                <tr class="ar-row" @click="toggleExpand(s)">
                  <td class="td">
                    <div style="display:flex;align-items:center;gap:9px;">
                      <div class="avatar-sm" :style="{ background: s.bg }">
                        <img v-if="s.avatarUrl" :src="s.avatarUrl" :alt="s.name" class="avatar-img" />
                        <template v-else>{{ s.initials }}</template>
                      </div>
                      <NuxtLink
                        :to="`/institute/students?student=${encodeURIComponent(s.name)}`"
                        @click.stop
                        class="ar-name"
                      >{{ s.name }}</NuxtLink>
                    </div>
                  </td>
                  <td class="td" style="font-size:0.7rem;color:var(--ink-dim);">{{ s.year }}</td>
                  <td class="td" style="text-align:center;">
                    <span class="mono" :style="{ color: scoreColor(s.score), fontWeight: 700 }">{{ s.score }}%</span>
                  </td>
                  <td class="td" style="text-align:center;font-size:1rem;">
                    <span :style="{ color: s.trend === 'up' ? 'var(--green)' : s.trend === 'down' ? 'var(--rose)' : 'var(--ink-faint)' }">
                      {{ s.trend === 'up' ? '↑' : s.trend === 'down' ? '↓' : '→' }}
                    </span>
                  </td>
                  <td class="td" style="text-align:center;font-size:0.7rem;color:var(--ink-dim);">{{ lastActiveLabel(s.lastActive) }}</td>
                  <td class="td" style="text-align:center;">
                    <span
                      class="risk-pill"
                      :style="{ background: riskColors(s.risk).bg, color: riskColors(s.risk).color, borderColor: riskColors(s.risk).border }"
                    >
                      <span class="risk-dot" :style="{ background: riskColors(s.risk).color }"></span>
                      {{ s.risk === 'high' ? 'High' : s.risk === 'medium' ? 'Med' : 'Low' }}
                    </span>
                  </td>
                  <td class="td" style="font-size:0.7rem;color:var(--ink-mid);font-weight:600;">
                    {{ s.userId && ext[s.userId]?.weakTopics?.length ? ext[s.userId].weakTopics[0] : '—' }}
                  </td>
                  <td class="td" style="text-align:center;">
                    <svg v-if="s.userId && ext[s.userId]?.scoreHistory?.length" width="60" height="18" viewBox="0 0 60 18">
                      <polyline
                        :points="sparkPoints(ext[s.userId].scoreHistory, 60, 18)"
                        fill="none"
                        :stroke="sparkColor(ext[s.userId].scoreHistory)"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                    <span v-else style="font-size:0.7rem;color:var(--ink-faint);">—</span>
                  </td>
                  <td class="td" style="text-align:center;">
                    <span class="mono" style="font-size:0.7rem;font-weight:700;color:var(--ink-mid);">
                      {{ s.userId && ext[s.userId] ? ext[s.userId].weekTotal + ' Qs' : '—' }}
                    </span>
                  </td>
                  <td class="td" style="text-align:right;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-dim)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" :style="{ transition: 'transform 0.2s', transform: expandedRow === s.name ? 'rotate(180deg)' : '' }"><polyline points="6 9 12 15 18 9"/></svg>
                  </td>
                </tr>
                <tr v-if="expandedRow === s.name" class="ar-expand">
                  <td colspan="10" style="padding:0;background:var(--surface);">
                    <div class="exp-body">
                      <div v-if="s.userId && ext[s.userId]?.loading" style="font-size:0.72rem;color:var(--ink-dim);">Loading detail…</div>
                      <div v-else class="exp-grid">
                        <div>
                          <div class="exp-eyebrow">Score history</div>
                          <div class="exp-line" v-if="s.userId && ext[s.userId]?.scoreHistory?.length">
                            <span v-for="(v, i) in ext[s.userId].scoreHistory" :key="i">
                              <strong>{{ ext[s.userId].scoreLabels[i] }}</strong> {{ v }}%
                              <span v-if="i < ext[s.userId].scoreHistory.length - 1" style="color:var(--ink-faint);"> · </span>
                            </span>
                          </div>
                          <div v-else style="font-size:0.7rem;color:var(--ink-faint);font-style:italic;">No score history yet</div>
                        </div>
                        <div>
                          <div class="exp-eyebrow">This week ({{ s.userId && ext[s.userId] ? ext[s.userId].weekTotal : 0 }} Qs)</div>
                          <div style="display:flex;gap:3px;align-items:flex-end;height:30px;">
                            <div
                              v-for="(v, i) in (s.userId && ext[s.userId]?.weeklyQs) || []"
                              :key="i"
                              :title="(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i] ?? ('Day ' + (i + 1))) + ': ' + v"
                              :style="{
                                width: '14px',
                                height: (v === 0 ? 3 : Math.min(28, Math.max(3, (v / 50) * 28))) + 'px',
                                background: v === 0 ? 'var(--surface-hi)' : v < 20 ? 'var(--amber)' : 'var(--teal)',
                                border: v === 0 ? '1px solid var(--border)' : 'none',
                                borderRadius: '2px',
                              }"
                            ></div>
                          </div>
                        </div>
                        <div>
                          <div class="exp-eyebrow">Weakest topics</div>
                          <div v-if="s.userId && ext[s.userId]?.weakTopics?.length">
                            <div v-for="(t, i) in ext[s.userId].weakTopics" :key="i" class="exp-int">{{ t }}</div>
                          </div>
                          <div v-else style="font-size:0.7rem;color:var(--ink-faint);font-style:italic;">No topic data yet</div>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

      </div>
    </div>

    <Transition name="toast">
      <div v-if="toast" class="ar-toast" :style="{ background: toast.color }">{{ toast.text }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.email-all-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 9px;
  background: var(--rose); color: #fff;
  border: 1.5px solid #be123c;
  font-family: Figtree, sans-serif; font-size: 0.76rem; font-weight: 800;
  cursor: pointer;
}

.urgent-callout {
  background: linear-gradient(135deg, #fff1f2, #ffe4e6);
  border: 1.5px solid var(--rose-border);
  border-radius: var(--r-lg);
  padding: 14px 20px; margin-bottom: 20px;
  display: flex; align-items: center; gap: 14px;
}
.urg-icon {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--rose);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.send-outreach {
  padding: 7px 14px; border-radius: 8px;
  background: var(--rose); color: #fff; border: none;
  font-family: Figtree, sans-serif; font-size: 0.74rem; font-weight: 800;
  cursor: pointer; white-space: nowrap; flex-shrink: 0;
}

.ar-tbl-head {
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}

.th {
  font-size: 0.59rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 1.5px; color: var(--ink-dim);
  padding: 10px 14px; user-select: none; white-space: nowrap;
}

.td { padding: 11px 14px; font-size: 0.73rem; color: var(--ink); }

.ar-row {
  border-bottom: 1px solid var(--border);
  cursor: pointer; transition: background 0.1s;
}
.ar-row:hover { background: var(--surface); }

.ar-name {
  font-size: 0.78rem; font-weight: 700; color: var(--ink);
  text-decoration: none;
}
.ar-name:hover { color: var(--teal); }

.avatar-sm {
  width: 26px; height: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.55rem; font-weight: 800; color: #fff;
  flex-shrink: 0;
  overflow: hidden;
}
.avatar-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }

.mono { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: 0.78rem; }

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

.ar-expand { background: var(--surface); }
.exp-body { padding: 14px 20px 18px; }
.exp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 18px;
}
.exp-eyebrow {
  font-size: 0.6rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 1.5px; color: var(--ink-dim);
  margin-bottom: 8px;
}
.exp-line {
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;
  font-size: 0.7rem; color: var(--ink-mid);
}
.exp-line strong { color: var(--ink-faint); font-weight: 700; margin-right: 2px; }
.exp-int {
  font-size: 0.7rem; color: var(--teal-mid); margin-bottom: 3px;
}
.exp-notes {
  margin-top: 8px; font-size: 0.7rem; color: var(--ink-mid);
  line-height: 1.5;
  background: var(--white); border: 1px solid var(--border);
  padding: 8px 10px; border-radius: var(--r-sm);
}

.ar-toast {
  position: fixed; bottom: 32px; right: 32px;
  padding: 11px 18px; border-radius: 9px;
  color: #fff; font-family: Figtree, sans-serif;
  font-size: 0.78rem; font-weight: 700;
  box-shadow: 0 8px 32px rgba(0,0,0,0.16);
  z-index: 9999;
}
.toast-enter-active, .toast-leave-active { transition: opacity .2s, transform .2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
.sk-pulse {
  background: var(--surface-2, #e5e7eb);
  animation: arSkPulse 1.2s ease-in-out infinite;
}
@keyframes arSkPulse { 0%, 100% { opacity: 0.85; } 50% { opacity: 0.5; } }
</style>
