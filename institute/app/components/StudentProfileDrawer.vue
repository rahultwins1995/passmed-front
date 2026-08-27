<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{ open: boolean; userId: number | null; checkinBusy?: boolean; passMark?: number }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'checkin', id: number, name: string): void
  (e: 'assign'): void
  (e: 'cohort-changed', result: { ok: boolean; message: string }): void
}>()

const api = useInstituteApi()
const profile = ref<any | null>(null)
const loading = ref(false)
const fullView = ref(false)

// Cohort assign/change control.
const cohorts = ref<{ id: number; name: string }[]>([])
const cohortBusy = ref(false)

async function fetchProfile(id: number) {
  loading.value = true
  profile.value = null
  try {
    const res = await api<any>(`/institution-students/${id}/profile`)
    if (res?.status === 'success') profile.value = res.data
  } catch { /* ignore */ }
  finally { loading.value = false }
}

async function fetchCohorts() {
  if (cohorts.value.length) return          // load once per session
  try {
    const res = await api<any>('/cohorts')
    const list = res?.data ?? res ?? []
    cohorts.value = (Array.isArray(list) ? list : []).map((c: any) => ({ id: c.id, name: c.name }))
  } catch { /* ignore */ }
}

// Assign the student to a cohort, or move them between cohorts.
// Uses the seat_id + current cohort_id the profile endpoint now returns.
async function changeCohort(targetId: number) {
  const p = profile.value
  if (!p || !targetId || cohortBusy.value) return
  if (!p.seat_id) return                     // no seat → cannot assign (guarded in UI too)
  if (targetId === p.cohort_id) return       // already there
  cohortBusy.value = true
  const prevName = p.cohort_name              // to patch the header meta line
  try {
    let res: any
    if (p.cohort_id) {
      // Move between cohorts.
      res = await api<any>(`/cohorts/${p.cohort_id}/students/${p.seat_id}/move`, {
        method: 'POST', body: { target_cohort_id: targetId },
      })
    } else {
      // No current cohort → assign existing student (Mode A of the invite endpoint).
      res = await api<any>(`/cohorts/${targetId}/students`, {
        method: 'POST', body: { user_id: p.user_id ?? p.id },
      })
    }
    if (res?.status === 'success') {
      const name = cohorts.value.find(c => c.id === targetId)?.name ?? ''
      // Header shows the cohort via the server-built `meta` string — patch it
      // in place so the top of the drawer reflects the change immediately.
      if (prevName && p.meta && p.meta.includes(prevName)) p.meta = p.meta.replace(prevName, name)
      else if (name) p.meta = p.meta ? `${name} · ${p.meta}` : name
      p.cohort_id = targetId
      p.cohort_name = name
      emit('cohort-changed', { ok: true, message: `Moved to ${name}` })
    } else {
      emit('cohort-changed', { ok: false, message: res?.message || 'Could not update cohort' })
    }
  } catch {
    emit('cohort-changed', { ok: false, message: 'Could not update cohort — try again' })
  } finally { cohortBusy.value = false }
}

watch(() => [props.open, props.userId] as const, ([open, id]) => {
  if (open && id) { fullView.value = false; fetchProfile(id); fetchCohorts() }
}, { immediate: true })

function close() { emit('update:open', false); fullView.value = false }
function openFull() { fullView.value = true }


const engMax = computed(() =>
  Math.max(1, ...((profile.value?.engagement ?? []).map((d: any) => d.count)))
)
function accColor(p: number) {
  if (p >= 80) return 'var(--green)'
  if (p >= 70) return 'var(--teal)'
  if (p >= 60) return 'var(--amber)'
  return 'var(--rose)'
}
function statusPillStyle(risk: string) {
  if (risk === 'high')   return 'background:var(--rose-light);color:var(--rose);border-color:var(--rose-border);'
  if (risk === 'medium') return 'background:var(--amber-light);color:var(--amber);border-color:var(--amber-border);'
  // Not Started — neutral grey, deliberately NOT green, matching the roster's riskBadge().
  if (risk === 'none')   return 'background:var(--surface-hi);color:var(--ink-dim);border-color:var(--border);'
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
  const line = dots.map(d => d.x + ',' + d.y).join(' ')
  const baseY = +(PAD.t + cH).toFixed(1)
  const area = dots.length > 1 ? dots[0].x + ',' + baseY + ' ' + line + ' ' + dots[dots.length - 1].x + ',' + baseY : ''
  // Pass mark drives the bell curve's pass line + mid grid line — the institution's
  // configured threshold (from the parent), not a hardcoded 65.
  const pm = Number(props.passMark) || 65
  const grid = [50, pm, 80].map(v => ({ v, y: +toY(v).toFixed(1) }))
  const passY = +toY(pm).toFixed(1)
  return { W, H, PAD, cW, cH, dots, line, area, grid, passY }
})
</script>

<template>
  <Transition name="drawer">
    <div v-if="open && !fullView" class="sd-overlay" @click.self="close">
      <aside class="sd-panel">
        <button type="button" class="sd-close" @click="close" aria-label="Close">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div v-if="loading" class="sd-body"><div class="sd-empty">Loading profile...</div></div>
        <template v-else-if="profile">
          <div class="sd-head">
            <div class="sd-avatar">
              <img v-if="profile.avatar_url" :src="profile.avatar_url" :alt="profile.name" class="sd-avatar-img" />
              <template v-else>{{ profile.initials }}</template>
            </div>
            <div>
              <div class="sd-name">{{ profile.name }}</div>
              <div class="sd-meta">{{ profile.meta || '-' }}</div>
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
                <div><div class="sd-mock-name">{{ m.name }}</div><div class="sd-mock-date">{{ m.date }}<template v-if="m.timed"> &middot; Timed</template></div></div>
              </div>
            </div>
            <div v-else class="sd-empty">No mock exams completed yet.</div>
            <div class="sd-section-label">Engagement (last 7 days)</div>
            <div class="sd-eng">
              <div v-for="(d, di) in profile.engagement" :key="di" class="sd-eng-col">
                <div class="sd-eng-bar" :style="{ height: (d.count ? Math.max(4, Math.round(d.count / engMax * 40)) : 3) + 'px', background: d.count ? 'var(--teal)' : 'var(--border)' }"></div>
                <div class="sd-eng-lbl">{{ d.label }}</div>
              </div>
            </div>
            <div class="sd-eng-note">{{ profile.week_qs }} questions this week</div>
            <button type="button" class="sd-action-primary" :disabled="checkinBusy" @click="emit('checkin', props.userId as number, profile.name)">{{ checkinBusy ? 'Sending…' : 'Send Check-In Email' }}</button>
            <div v-if="profile.seat_id" class="sd-cohort">
              <label class="sd-cohort-lbl">{{ profile.cohort_id ? 'Cohort' : 'Assign cohort' }}</label>
              <select class="sd-cohort-select" :value="profile.cohort_id ?? ''" :disabled="cohortBusy"
                @change="changeCohort(+($event.target as HTMLSelectElement).value)">
                <option value="" disabled>{{ profile.cohort_id ? 'Change cohort…' : 'Select a cohort…' }}</option>
                <option v-for="c in cohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>
            <div class="sd-action-row">
              <button type="button" class="sd-action" @click="emit('assign')">Assign targeted exam</button>
              <button type="button" class="sd-action" @click="openFull">View full profile</button>
            </div>
          </div>
        </template>
        <div v-else class="sd-body"><div class="sd-empty">Couldn't load this student's profile.</div></div>
      </aside>
    </div>
  </Transition>

  <Transition name="fade">
    <div v-if="open && fullView && profile" class="fp-screen">
      <div class="fp-inner">
        <div class="back-row">
          <button type="button" class="back-btn" @click="close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <span class="back-sep">&rsaquo;</span>
          <span class="back-name">{{ profile.name }}</span>
          <button type="button" class="fp-close" @click="close" aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="hero-card">
          <div class="hero-left">
            <div class="fp-avatar">
              <img v-if="profile.avatar_url" :src="profile.avatar_url" :alt="profile.name" class="fp-avatar-img" />
              <template v-else>{{ profile.initials }}</template>
            </div>
            <div>
              <div class="hero-title">{{ profile.name }}</div>
              <div class="hero-meta">{{ profile.meta || '-' }}</div>
              <span class="sd-status" :style="statusPillStyle(profile.risk)" style="margin-top:6px;"><span class="status-dot"></span>{{ profile.status_label }}</span>
            </div>
          </div>
          <div class="hero-stats">
            <div class="hero-stat"><div class="hero-stat-label">Avg Score</div><div class="hero-stat-val">{{ profile.avg_score }}%</div></div>
            <div class="hero-stat"><div class="hero-stat-label">Qs Done</div><div class="hero-stat-val">{{ profile.qs_answered.toLocaleString() }}</div></div>
            <div class="hero-stat"><div class="hero-stat-label">Streak</div><div class="hero-stat-val">{{ profile.streak }}</div></div>
          </div>
        </div>
        <div class="fp-grid">
          <div class="card">
            <div class="card-title">Score Trend</div>
            <div class="card-sub" style="margin-bottom:10px;">Monthly average &middot; pass mark {{ props.passMark || 65 }}%</div>
            <svg v-if="profileTrend.dots.length" width="100%" :viewBox="'0 0 ' + profileTrend.W + ' ' + profileTrend.H" preserveAspectRatio="xMidYMid meet" style="display:block;max-height:130px;overflow:visible;">
              <line v-for="g in profileTrend.grid" :key="'g'+g.v" :x1="profileTrend.PAD.l" :y1="g.y" :x2="profileTrend.PAD.l + profileTrend.cW" :y2="g.y" stroke="var(--border)" stroke-width="1"/>
              <line :x1="profileTrend.PAD.l" :y1="profileTrend.passY" :x2="profileTrend.PAD.l + profileTrend.cW" :y2="profileTrend.passY" stroke="var(--amber)" stroke-width="1.5" stroke-dasharray="4,3"/>
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
            <div class="card-sub" style="margin-bottom:14px;">Questions answered &middot; last 7 days</div>
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
        <div class="fp-grid" style="margin-top:16px;">
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
                <div><div class="sd-mock-name">{{ m.name }}</div><div class="sd-mock-date">{{ m.date }}<template v-if="m.timed"> &middot; Timed</template></div></div>
              </div>
            </div>
            <div v-else class="sd-empty">No mock exams completed yet.</div>
          </div>
        </div>
        <div class="card" style="margin-top:16px;">
          <div class="card-title" style="margin-bottom:12px;">Actions</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <button type="button" class="sd-action-primary" style="width:auto;margin:0;padding:9px 16px;" :disabled="checkinBusy" @click="emit('checkin', props.userId as number, profile.name)">{{ checkinBusy ? 'Sending…' : 'Send check-in email' }}</button>
            <button type="button" class="sd-action" style="flex:0 0 auto;padding:9px 16px;" @click="emit('assign')">Assign targeted exam</button>
            <select v-if="profile.seat_id" class="sd-cohort-select" style="flex:0 0 auto;margin:0;" :value="profile.cohort_id ?? ''" :disabled="cohortBusy"
              @change="changeCohort(+($event.target as HTMLSelectElement).value)">
              <option value="" disabled>{{ profile.cohort_id ? 'Change cohort…' : 'Assign cohort…' }}</option>
              <option v-for="c in cohorts" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
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
.fp-screen {
  position: fixed;
  top: var(--topbar-h, 60px);      /* topbar (breadcrumb bar) visible rahe */
  right: 0; bottom: 0;
  left: var(--sidebar-w, 260px);   /* sidebar visible rahe */
  z-index: 650;
  background: var(--surface, #f7fbfd);
  overflow-y: auto;
}
/* stay aligned even with the collapsed sidebar (56px icon rail) */
body:has(#sidebar.collapsed) .fp-screen { left: 56px; }
/* mobile: sidebar is off-canvas, so go full width */
@media (max-width: 767px) { .fp-screen { left: 0; } }
.fp-inner { max-width: 1100px; margin: 0 auto; padding: 24px 28px 48px; }
.back-row { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.back-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 8px; background: var(--white); border: 1.5px solid var(--border); font-family: Figtree, sans-serif; font-size: 0.74rem; font-weight: 700; color: var(--ink-mid); cursor: pointer; }
.back-btn:hover { border-color: var(--teal-border); color: var(--teal); }
.back-sep { color: var(--ink-faint); }
.back-name { font-size: 0.78rem; font-weight: 700; color: var(--ink); }
.fp-close { margin-left: auto; width: 30px; height: 30px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--white); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--ink-dim); }
.fp-close:hover { border-color: var(--rose-border); color: var(--rose); }
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
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
