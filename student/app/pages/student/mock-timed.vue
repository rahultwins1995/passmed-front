<script setup lang="ts">
definePageMeta({ layout: false })
useHead({
  title: 'Mock Exam · Timed Mode · Passmed',
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap' }
  ]
})
// layout:false — inject global student CSS manually (normally done by student.vue layout)
import studentCss from '~/assets/css/student.css?raw'
useHead({ style: [{ innerHTML: studentCss, id: 'student-css' }] })

const { closeMobile, isMobileOpen } = useSidebar()

const {
  current, total, idx, chosen, result, flagged, secs,
  questions, loading, fetchError,
  answered, score, progress, choose, skip, goNext, goPrev, toggleFlag, reset, formatTime,
  // backend session sync
  sessionId, syncQuestion, syncSession, completeSession, loadMockSession, flushPendingSyncs,
} = useMockSession()

const { toggle: toggleDark, init: initDark } = useDarkMode()
// layout:false means the student layout (which normally runs init()) never wraps
// this page — so on a hard refresh / direct Resume link we apply the saved theme here.
onMounted(() => initDark())
const route = useRoute()

const isSingle  = ref(false)
// Mobile-only: collapsible question navigator. On phones the inline dot row is
// hidden and replaced by a compact "Q4 of 40" pill; tapping it opens a dropdown
// grid. navOpen drives that panel (always closed/irrelevant on desktop).
const navOpen   = ref(false)

// Timed vs "Open" (untimed) mock. All mocks now run through this single runner;
// untimed exams simply don't show or enforce a clock. Derived in onMounted from
// the ?timed= query flag (set by mock.vue) with the session payload as a
// fallback. Defaults to true so a missing flag fails safe to exam conditions.
const isTimed   = ref(true)

// A−/A+ font-size control — ported from tutor.vue. Base 0.92rem, min 0.72rem,
// max 1.18rem, step 0.06rem.
const FONT_SIZES = [0.72, 0.78, 0.84, 0.92, 1.00, 1.08, 1.18]
const fontIdx    = ref(3)  // default = index 3 → 0.92rem
const stemFontSize = computed(() => FONT_SIZES[fontIdx.value] + 'rem')
function fontDecrease() { if (fontIdx.value > 0) fontIdx.value-- }
function fontIncrease() { if (fontIdx.value < FONT_SIZES.length - 1) fontIdx.value++ }

const showExit  = ref(false)
const showLabs  = ref(false)
const showCalc  = ref(false)

// ── Question Feedback ────────────────────────────────────────────────────────
// Mirrors the working flow in tutor.vue: same POST /questions/feedback payload,
// same theme list, same comment-required rule.
const showFeedback = ref(false)
const fbThemes     = ['Good item', 'Too easy', 'Too hard', 'Not relevant', 'Out of date', 'Incorrect', 'Typo', 'Poorly worded', 'Other']
const fbSelected   = ref<string[]>([])
const fbComment    = ref('')
const fbSubmitting = ref(false)
const fbDone       = ref(false)

function openFeedback() { showFeedback.value = true; fbSelected.value = []; fbComment.value = ''; fbDone.value = false }
function closeFeedback() { showFeedback.value = false }
function toggleFbTheme(t: string) {
  const i = fbSelected.value.indexOf(t)
  if (i === -1) fbSelected.value.push(t)
  else fbSelected.value.splice(i, 1)
}
async function submitFeedback() {
  // Comment is always required; themes stay optional.
  if (!fbComment.value.trim()) return
  fbSubmitting.value = true
  try {
    const studentApi = useStudentApi()
    await studentApi('/questions/feedback', {
      method: 'POST',
      body: {
        question_id: current.value?.id,
        flag_type:   fbSelected.value.join(', '),
        feedback_text: fbComment.value.trim(),
      },
    })
    fbDone.value = true
    setTimeout(closeFeedback, 1800)
  } catch { /* fail silently */ }
  finally { fbSubmitting.value = false }
}
const resuming    = ref(false)
const resumeError = ref(false)
const saving    = ref(false)
// submitting = true only during the FINAL submit (submitAll). Drives a dedicated
// "Calculating your results…" screen so the submit round-trip doesn't look like
// the exam is reloading (which the generic skeleton implied).
const submitting = ref(false)
const calcExpr  = ref('')
const calcVal   = ref('0')
const calcMem   = ref(0)

// Global countdown: counts DOWN from total exam time.
const totalSecs = ref(0)
const timeLeft  = ref(0)
// Set when the total session time hits 0 → drives the "run out of time" notice
// on the results overlay.
const ranOutOfTime = ref(false)

// Per-question timer — derived from totalSecs / question_count on session load.
// Default 90s until loaded.
const timerPerQ = ref(90)
const qTimer    = ref(90)
const qTimerMap = ref<Record<number, number>>({})

const dotsRef = ref<HTMLElement | null>(null)

function scrollActiveDotIntoView() {
  if (!import.meta.client) return
  // Always CENTRE the active dot. The previous "skip if already visible" check
  // could leave the row parked on a far range (e.g. showing Q12-20 while you're
  // on Q4), so you couldn't see where you were. Centring on every idx change is
  // simple and predictable. nextTick + rAF lets the .d-cur class flip + layout
  // settle before we read offsets; the clientWidth guard avoids computing a
  // garbage scroll position before the row has been laid out.
  nextTick(() => requestAnimationFrame(() => {
    const container = dotsRef.value
    if (!container || !container.clientWidth) return
    const active = container.querySelectorAll<HTMLElement>('.tb-dot')[idx.value]
    if (!active) return
    // Rect-based, not offsetLeft: the row isn't position:relative, so the dots'
    // offsetParent is an ancestor up the topbar and offsetLeft includes the
    // row's own offset — overshooting and parking the tracker far ahead of the
    // current question. Rects are independent of offsetParent.
    const cRect     = container.getBoundingClientRect()
    const aRect     = active.getBoundingClientRect()
    const dotLeft   = (aRect.left - cRect.left) + container.scrollLeft
    const center    = dotLeft + aRect.width / 2 - container.clientWidth / 2
    const maxScroll = container.scrollWidth - container.clientWidth
    const clamped   = Math.max(0, Math.min(maxScroll, center))
    container.scrollTo({ left: clamped, behavior: 'smooth' })
  }))
}

function onDotsWheel(e: WheelEvent) {
  if (!dotsRef.value) return
  if (e.deltaY === 0) return
  e.preventDefault()
  dotsRef.value.scrollLeft += e.deltaY
}

watch(() => idx.value, scrollActiveDotIntoView)
onMounted(() => { setTimeout(scrollActiveDotIntoView, 150) })

// ─── Per-question time tracking ────────────────────────────────────────────
const qTimerStart = ref(0)
const qTimeMap    = ref<Record<number, number>>({})

function captureElapsed(qid: number): number {
  const delta = Math.max(0, secs.value - qTimerStart.value)
  qTimeMap.value[qid] = (qTimeMap.value[qid] || 0) + delta
  qTimerStart.value = secs.value
  return qTimeMap.value[qid]
}

// Swap qTimer when displayed question changes — sync outgoing question's timer + time-spent
watch(() => current.value?.id, (newId, oldId) => {
  if (oldId !== undefined && oldId !== null) {
    qTimerMap.value[oldId] = qTimer.value
    const spent = captureElapsed(oldId)
    syncQuestion(oldId, {
      q_timer_remaining: qTimer.value,
      q_time_spent:      spent,
    })
  } else {
    qTimerStart.value = secs.value
  }
  if (newId !== undefined && newId !== null) {
    qTimer.value = qTimerMap.value[newId] ?? timerPerQ.value
    qTimerStart.value = secs.value
  }
})

let sessionInt: ReturnType<typeof setInterval> | null = null
let qInt: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  const sid = Number(route.query.sid)
  if (!sid) {
    resumeError.value = true
    return
  }

  resuming.value    = true
  resumeError.value = false
  try {
    const data = await loadMockSession(sid)
    if (data) {
      // Timed flag: the ?timed= query (set by mock.vue) is authoritative; fall
      // back to the session payload, then to true (exam conditions) if unknown.
      const q = route.query.timed
      isTimed.value = q != null
        ? Number(q) === 1
        : (data.timed ?? data.assignment?.timed ?? true)

      const savedIdx = data.current_index ?? 0
      idx.value = Math.min(Math.max(0, savedIdx), Math.max(0, questions.value.length - 1))

      // Compute total exam time. Use the per-student effective duration
      // (base duration + this student's extra-time accommodation) so
      // accommodated residents get their additional minutes.
      const baseMins  = data.assignment?.duration_minutes ?? 0
      const extraMins = data.extra_time_mins ?? 0
      const totalMins = data.assignment?.effective_duration_minutes ?? (baseMins + extraMins)
      if (totalMins) {
        totalSecs.value = totalMins * 60
      } else {
        totalSecs.value = 300 // fallback: 5 minutes
      }

      // Restore remaining global time from saved elapsed_seconds if available.
      const elapsed = typeof data.elapsed_seconds === 'number' ? data.elapsed_seconds : 0
      timeLeft.value = Math.max(0, totalSecs.value - elapsed)

      // Per-question share = totalSecs / number of questions (minimum 30s).
      const qCount = questions.value.length || 1
      timerPerQ.value = Math.max(30, Math.round(totalSecs.value / qCount))

      // Restore per-question timer state — cap at timerPerQ so stale large values are ignored.
      const rows = data.session_questions ?? []
      for (const row of rows) {
        if (typeof row.q_timer_remaining === 'number' && row.q_timer_remaining > 0) {
          qTimerMap.value[row.question_id] = Math.min(row.q_timer_remaining, timerPerQ.value)
        }
        if (typeof row.q_time_spent === 'number' && row.q_time_spent > 0) {
          qTimeMap.value[row.question_id] = row.q_time_spent
        }
      }
    } else {
      resumeError.value = true
    }
  } finally {
    resuming.value = false
  }

  // Seed Q1's countdown from saved value or full timerPerQ (timed mocks only).
  if (isTimed.value && current.value) {
    qTimerMap.value[current.value.id] = qTimerMap.value[current.value.id] ?? timerPerQ.value
    qTimer.value = qTimerMap.value[current.value.id]
  }

  // Global ticker. secs always increments (drives per-question time tracking via
  // captureElapsed). The countdown + auto-submit only run for TIMED mocks; an
  // "Open" mock has no clock and no time limit.
  sessionInt = setInterval(() => {
    secs.value++        // kept for captureElapsed (per-question time tracking)
    if (isTimed.value) {
      timeLeft.value--
      if (timeLeft.value <= 0) {
        clearInterval(sessionInt!)
        sessionInt = null
        ranOutOfTime.value = true
        submitAll()
      }
    }
  }, 1000)
  // Per-question countdown + autoSkip — timed mocks only.
  if (isTimed.value) {
    qInt = setInterval(() => {
      // Tick only while THIS question still has time left. Once it reaches 0 we
      // autoSkip once; on a later revisit qTimer is 0 so we neither tick nor
      // re-fire autoSkip (no "bounce" off an expired question), and the question
      // stays answerable until final submit. (Previously gated on !result, but
      // mock-timed no longer writes result mid-attempt.)
      if (current.value && qTimer.value > 0) {
        qTimer.value--
        if (qTimer.value <= 0) autoSkip()
      }
    }, 1000)
  }
})

// ─── Backend sync watchers ─────────────────────────────────────────────────
const syncedResults = ref<Record<number, string>>({})

watch(result, (r) => {
  for (const q of questions.value) {
    const res = r[q.id]
    if (res && syncedResults.value[q.id] !== res) {
      const isCurrent = current.value?.id === q.id
      const spent     = isCurrent ? captureElapsed(q.id) : (qTimeMap.value[q.id] || 0)
      syncQuestion(q.id, {
        chosen_answer: chosen.value[q.id] || null,
        result: res,
        q_time_spent: spent,
      })
      syncedResults.value[q.id] = res
    }
  }
}, { deep: true })

watch(idx, (n) => { syncSession({ current_index: n, elapsed_seconds: totalSecs.value - timeLeft.value }) })

onUnmounted(() => {
  if (sessionInt) clearInterval(sessionInt)
  if (qInt) clearInterval(qInt)
  document.body.classList.remove('single')
})

watchEffect(() => { if (import.meta.client) document.body.classList.toggle('single', isSingle.value) })

// ─── Auto-skip when per-question timer hits 0 ─────────────────────────────
// Mock-timed defers ALL grading to submit, so do NOT write result here — once
// result is set, choose() blocks re-selection and the answer locks. Just
// advance; submitAll() grades everything at /complete time.
function autoSkip() {
  if (idx.value < total.value - 1) idx.value++
}

// ─── Next — pure navigation; grading happens at submit ────────────────────
// No grading here. Real exams (USMLE/MRCP/ABA) let candidates change answers
// freely until final submit, so the answer must stay editable after Next.
// submitAll() grades every question (answered → correct/incorrect, untouched →
// skipped) when the exam is submitted.
function handleNext() {
  goNext()
}

// ─── Submit all & complete mock exam ──────────────────────────────────────
async function submitAll() {
  showExit.value = false
  saving.value   = true
  try {
    // Capture current question's timer + time before leaving
    if (current.value) {
      const spent = captureElapsed(current.value.id)
      qTimerMap.value[current.value.id] = qTimer.value
      syncQuestion(current.value.id, {
        q_timer_remaining: qTimer.value,
        q_time_spent:      spent,
      })
    }
    // Grade all unanswered questions
    for (const q of questions.value) {
      if (!result.value[q.id]) {
        const ch = chosen.value[q.id]
        const r = ch ? (ch === q.ans ? 'correct' : 'incorrect') : 'skipped'
        result.value = { ...result.value, [q.id]: r as any }
        const isCurrent = current.value?.id === q.id
        const spent = isCurrent ? captureElapsed(q.id) : (qTimeMap.value[q.id] || 0)
        syncQuestion(q.id, {
          chosen_answer: ch || null,
          result:        r as any,
          q_time_spent:  spent,
        })
      }
    }
    await syncSession({ current_index: idx.value, elapsed_seconds: totalSecs.value - timeLeft.value })
    // completeSession() POSTs /complete and navigates to /student/mock.
    // Flip to the dedicated results screen for the network round-trip — the
    // synchronous grading above all runs before the browser's first paint, so
    // the user goes straight to "Calculating your results…".
    submitting.value = true
    await completeSession()
  } finally {
    saving.value = false
    submitting.value = false
  }
}

// ─── Save & Exit (keep in_progress — resume from mock list) ───────────────
async function saveAndExit() {
  showExit.value = false
  saving.value   = true
  try {
    if (current.value) {
      const spent = captureElapsed(current.value.id)
      syncQuestion(current.value.id, {
        q_time_spent:      spent,
        q_timer_remaining: qTimer.value,
      })
    }
    await syncSession({ current_index: idx.value, elapsed_seconds: totalSecs.value - timeLeft.value })
    await flushPendingSyncs()
    navigateTo('/student/mock')
  } finally {
    saving.value = false
  }
}

// Per-question timer colour
const timerColor = computed(() => {
  const pct = timerPerQ.value > 0 ? qTimer.value / timerPerQ.value : 1
  if (pct > 0.5) return 'var(--green)'
  if (pct > 0.25) return 'var(--amber)'
  return 'var(--rose)'
})

// Global countdown colour (topbar)
const globalTimerColor = computed(() => {
  const pct = totalSecs.value > 0 ? timeLeft.value / totalSecs.value : 1
  if (pct > 0.4) return 'var(--ink-mid)'
  if (pct > 0.2) return 'var(--amber)'
  return 'var(--rose)'
})
const timerPct = computed(() => Math.max(0, (qTimer.value / timerPerQ.value) * 100))

// Keyboard option highlight (ArrowUp/ArrowDown). Cleared whenever the question
// changes so a highlight never bleeds across questions. Ported from tutor.vue;
// mock-timed has no answer lock (grades at submit), so there's no result guard.
const highlightedOpt = ref<string | null>(null)
watch(idx, () => { highlightedOpt.value = null })

function optClass(letter: string): string {
  const ch = chosen.value[current.value.id]
  if (ch === letter) return 'sel'
  if (highlightedOpt.value === letter) return 'kb-focus'
  return ''
}
function pickOption(letter: string) { choose(letter); highlightedOpt.value = null }
function goToQuestion(n: number) { idx.value = n - 1 }
// Skip = advance without recording anything. Result stays empty so the question
// remains answerable until submit (matches the no-lock Next behaviour).
function handleSkip() { goNext() }

// Mock-timed grades only at submit, so `result` is empty during the attempt.
// Derive the "answered" indicators from `chosen` (did the student pick an
// option) instead — this drives the progress dots and the Answered count
// without locking anything. Real correct/incorrect colours appear only in
// mock-review.vue after the exam is graded server-side.
const answeredCount = computed(() => questions.value.filter(q => !!chosen.value[q.id]).length)
const mockProgress  = computed(() => questions.value.map((q, i) => ({
  n: i + 1,
  state: i === idx.value ? 'current' : (chosen.value[q.id] ? 'answered' : ''),
})))

function dotClass(state: string): string {
  if (state === 'current')   return 'd-cur'
  // Neutral "answered" state (blue) — never leak correct/incorrect mid-attempt.
  if (state === 'answered' || state === 'correct' || state === 'incorrect') return 'd-answered'
  if (state === 'skipped')   return 'd-skip'
  return ''
}
function diffClass(d: string): string {
  const v = String(d || '').toLowerCase()
  if (v === 'easy' || v === 'foundation') return 'qtag-easy'
  if (v === 'hard' || v === 'advanced')   return 'qtag-hard'
  return 'qtag-medium'
}
function diffLabel(d: string): string {
  const v = String(d || '').trim()
  if (!v) return ''
  const map: Record<string, string> = {
    easy: 'Foundation', medium: 'Intermediate', hard: 'Advanced',
    foundation: 'Foundation', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert',
  }
  return map[v.toLowerCase()] ?? (v.charAt(0).toUpperCase() + v.slice(1).toLowerCase())
}

const handleKey = (e: KeyboardEvent) => {
  if (showExit.value || showLabs.value || showCalc.value || showFeedback.value) return

  if (e.key === 'f' || e.key === 'F') { toggleFlag(); return }
  if (e.key === 's' || e.key === 'S') { handleSkip(); return }

  // ArrowUp / ArrowDown: cycle the keyboard highlight through the options.
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    const opts  = current.value?.opts ?? []
    const count = opts.length
    if (!count) return
    const curIdx = highlightedOpt.value
      ? opts.findIndex(o => o.l === highlightedOpt.value)
      : -1
    const next = e.key === 'ArrowDown'
      ? (curIdx + 1) % count
      : (curIdx - 1 + count) % count
    highlightedOpt.value = opts[next].l
    return
  }

  // Enter: select the focused option. Previously this required arrowing first
  // (it only fired when highlightedOpt was set), so a fresh Enter did nothing.
  // Now it falls back to the already-chosen option, then to the first option —
  // so Enter selects without needing ArrowUp/Down first.
  if (e.key === 'Enter') {
    e.preventDefault()
    const letter = highlightedOpt.value
      ?? chosen.value[current.value?.id]
      ?? current.value?.opts?.[0]?.l
    if (letter) pickOption(letter)
    return
  }

  // ArrowRight: commit a pending highlight first, then advance.
  if (e.key === 'ArrowRight') {
    if (highlightedOpt.value) pickOption(highlightedOpt.value)
    else handleNext()
    return
  }
  // ArrowLeft: go to the previous question.
  if (e.key === 'ArrowLeft') { goPrev(); return }

  const letters = ['a','b','c','d','e']
  // No result guard — answers stay changeable until submit (mock-timed defers
  // grading). Matches the option buttons' unguarded @click="pickOption"; choose()
  // is the single place that would ever block a selection.
  if (letters.includes(e.key.toLowerCase())) pickOption(e.key.toUpperCase())
}
onMounted(() => window.addEventListener('keydown', handleKey))
onUnmounted(() => window.removeEventListener('keydown', handleKey))

function calcAct(k: string) {
  if (k === 'AC') { calcExpr.value = ''; calcVal.value = '0'; return }
  if (k === 'DEL') { calcExpr.value = calcExpr.value.slice(0,-1); if (!calcExpr.value) calcVal.value = '0'; return }
  if (k === '+/-') { try { calcVal.value = String(-parseFloat(calcVal.value)); calcExpr.value = calcVal.value } catch{} return }
  if (k === '%') { calcExpr.value += '%'; return }
  if (k === '=') {
    try { calcVal.value = String(Function('"use strict";return (' + calcExpr.value.replace(/%/g,'/100') + ')')())
          calcExpr.value = calcVal.value } catch { calcVal.value = 'Error' }
    return
  }
  calcExpr.value += k
  try { calcVal.value = String(Function('"use strict";return (' + calcExpr.value.replace(/%/g,'/100') + ')')()) } catch {}
}
function calcMemAct(a: string) {
  if (a==='mc') calcMem.value=0
  else if (a==='mr') calcExpr.value += String(calcMem.value)
  else if (a==='m+') { try { calcMem.value += parseFloat(calcVal.value) } catch{} }
  else if (a==='m-') { try { calcMem.value -= parseFloat(calcVal.value) } catch{} }
}
</script>

<template>
  <div v-if="submitting" class="sk-runner" style="align-items:center;justify-content:center">
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;padding:24px;font-family:'Figtree',sans-serif">
      <div style="display:flex;gap:7px">
        <span class="sk-pulse" style="width:11px;height:11px;border-radius:50%"></span>
        <span class="sk-pulse" style="width:11px;height:11px;border-radius:50%;animation-delay:0.15s"></span>
        <span class="sk-pulse" style="width:11px;height:11px;border-radius:50%;animation-delay:0.3s"></span>
      </div>
      <div v-if="ranOutOfTime" style="font-size:0.95rem;font-weight:800;color:var(--rose,#dc2626)">⏱ You have run out of time</div>
      <div style="font-size:1rem;font-weight:800;color:var(--ink)">Calculating your results…</div>
      <div style="font-size:0.82rem;color:var(--ink-dim)">Grading your answers and preparing your review.</div>
    </div>
  </div>

  <div v-else-if="loading || resuming || saving" class="sk-runner">
    <div class="sk-bar">
      <div class="sk-pulse" style="width:74px;height:16px;border-radius:4px"></div>
      <div class="sk-pulse" style="width:84px;height:22px;border-radius:8px;margin-left:14px"></div>
      <div class="sk-pulse" style="width:72px;height:22px;border-radius:8px;margin-left:8px"></div>
      <div class="sk-pulse" style="flex:1;height:22px;border-radius:8px;margin:0 14px;max-width:520px"></div>
      <div class="sk-pulse" style="width:120px;height:22px;border-radius:8px;margin-left:auto"></div>
    </div>
    <div class="sk-body">
      <div class="sk-q-panel">
        <div class="sk-pulse" style="width:60%;height:14px;border-radius:4px;margin-bottom:10px"></div>
        <div class="sk-pulse" style="width:100%;height:11px;border-radius:4px;margin-bottom:6px"></div>
        <div class="sk-pulse" style="width:96%;height:11px;border-radius:4px;margin-bottom:6px"></div>
        <div class="sk-pulse" style="width:88%;height:11px;border-radius:4px;margin-bottom:6px"></div>
        <div class="sk-pulse" style="width:70%;height:14px;border-radius:4px;margin:18px 0 8px 0"></div>
        <div class="sk-pulse" style="width:80%;height:11px;border-radius:4px"></div>
      </div>
      <div class="sk-a-panel">
        <div class="sk-pulse" style="width:120px;height:12px;border-radius:4px;margin-bottom:14px"></div>
        <div v-for="i in 5" :key="i" class="sk-pulse" style="height:46px;border-radius:8px;margin-bottom:8px"></div>
      </div>
    </div>
  </div>

  <div v-else-if="resumeError" style="display:flex;align-items:center;justify-content:center;min-height:100dvh;flex-direction:column;gap:14px;font-family:'Figtree',sans-serif;padding:30px;text-align:center">
    <div style="font-size:1rem;font-weight:700;color:var(--rose)">Couldn't load this exam session</div>
    <div style="font-size:0.82rem;color:var(--ink-dim);max-width:420px">The session may not exist or the link is invalid. Return to Mock Exams and try starting again.</div>
    <NuxtLink to="/student/mock" style="margin-top:8px;color:var(--teal);text-decoration:underline">← Back to Mock Exams</NuxtLink>
  </div>

  <div v-else-if="fetchError" style="display:flex;align-items:center;justify-content:center;min-height:100dvh;flex-direction:column;gap:14px;font-family:'Figtree',sans-serif;padding:30px;text-align:center">
    <div style="font-size:1rem;font-weight:700;color:var(--rose)">Couldn't load questions</div>
    <div style="font-size:0.82rem;color:var(--ink-dim);max-width:420px">{{ fetchError }}</div>
    <NuxtLink to="/student/mock" style="margin-top:8px;color:var(--teal);text-decoration:underline">← Back to Mock Exams</NuxtLink>
  </div>

  <div v-else-if="!current" style="display:flex;align-items:center;justify-content:center;min-height:100dvh;flex-direction:column;gap:14px;font-family:'Figtree',sans-serif;padding:30px;text-align:center">
    <div style="font-size:1rem;font-weight:700;color:var(--ink)">No questions available</div>
    <div style="font-size:0.82rem;color:var(--ink-dim);max-width:420px">This exam has no questions yet. Contact your institution if you think this is a mistake.</div>
    <NuxtLink to="/student/mock" style="margin-top:8px;color:var(--teal);text-decoration:underline">← Back to Mock Exams</NuxtLink>
  </div>

  <template v-else>

  <!-- Sidebar + backdrop (layout:false so not provided by layout wrapper) -->
  <div class="session-sidebar-host"><StudentSidebar /></div>
  <div v-if="isMobileOpen" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:40;backdrop-filter:blur(2px);" @click="closeMobile" />

  <!-- ══ TOPBAR ══ -->
  <div class="topbar">
    <!-- No mobile hamburger in session runners: opening the sidebar mid-session
         let students navigate away without submitting. Save & Exit / Submit are
         the only ways out. The sidebar/openMobile stays on non-session pages. -->
    <div class="tb-logo">
      <SessionWordmark />
    </div>
    <div class="tb-sep"></div>
    <!-- Mock Exam badge — "Timed" runs under exam conditions with a clock;
         "Open" is the same exam without a time limit. -->
    <div class="tb-tag" style="color:var(--teal-mid);background:var(--teal-pale);border-color:var(--teal-border)">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Mock Exam · {{ isTimed ? 'Timed' : 'Open' }}
    </div>
    <!-- Display-only global timer — timed mocks only (no pause; exam conditions). -->
    <div v-if="isTimed" class="tb-timer" :style="{ color: globalTimerColor, borderColor: timeLeft < totalSecs * 0.2 ? 'var(--rose-border)' : undefined }" :aria-label="'Time remaining ' + formatTime(timeLeft)">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" :stroke="globalTimerColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      {{ formatTime(timeLeft) }}
    </div>
    <div class="tb-prog">
      <span class="tb-count">{{ idx + 1 }} / {{ total }}</span>
      <div class="tb-track"><div class="tb-fill" :style="{ width: ((idx+1)/total*100)+'%' }"></div></div>
    </div>
    <div class="tb-dots" ref="dotsRef" @wheel="onDotsWheel">
      <button type="button" v-for="p in mockProgress" :key="p.n" class="tb-dot" :class="dotClass(p.state)" :title="`Q${p.n}`" @click="goToQuestion(p.n)" :aria-label="`Question ${p.n}`">{{ p.n }}</button>
    </div>
    <!-- Mobile-only collapse control: compact pill that toggles the question
         grid (the inline .tb-dots row is hidden on phones). -->
    <button type="button" class="tb-navtoggle" :aria-expanded="navOpen" @click="navOpen = !navOpen">
      <span>Q{{ idx + 1 }} <span class="tb-navtoggle-of">of</span> {{ total }}</span>
      <svg class="tb-navchev" :class="{ open: navOpen }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="tb-right">
      <button type="button" class="layout-btn" :class="{ 'single-active': isSingle }" @click="isSingle = !isSingle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <template v-if="!isSingle"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/></template>
          <template v-else><rect x="3" y="3" width="18" height="18" rx="1"/></template>
        </svg>
        {{ isSingle ? 'Single' : 'Split' }}
      </button>
      <div class="tb-sep"></div>
      <button type="button" class="ib" title="Reference lab values" @click="showLabs = true">
        <SessionIconLabs />
        <span class="ib-label">Labs</span>
      </button>
      <button type="button" class="ib ib-sq" title="Calculator" @click="showCalc = true" aria-label="Calculator">
        <SessionIconCalc />
      </button>
      <button type="button" class="ib ib-sq" :class="{ on: flagged[current.id] }" title="Flag (F)" @click="toggleFlag()" :aria-label="flagged[current.id] ? 'Unflag question' : 'Flag question'">
        <SessionIconFlag />
      </button>
      <button type="button" class="dm-btn" @click="toggleDark()" aria-label="Toggle dark mode">
        <svg class="i-sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        <svg class="i-moon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
      <div class="tb-sep"></div>
      <button type="button" class="btn-exit" @click="showExit = true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span class="exit-label">Save &amp; Exit</span>
      </button>
    </div>
  </div>

  <!-- Mobile question-navigator dropdown (toggled by the .tb-navtoggle pill).
       Rendered as a top-level sibling so it isn't trapped in the topbar's
       stacking context. Tapping a question navigates AND auto-collapses. -->
  <div v-if="navOpen" class="tb-navbackdrop" @click="navOpen = false"></div>
  <div v-if="navOpen" class="tb-navpanel" role="dialog" aria-label="Question navigator">
    <div class="tb-navgrid">
      <button type="button" v-for="p in mockProgress" :key="p.n" class="tb-dot" :class="dotClass(p.state)" @click="goToQuestion(p.n); navOpen = false" :aria-label="`Question ${p.n}`">{{ p.n }}</button>
    </div>
  </div>

  <!-- ══ SESSION BODY ══ -->
  <div class="s-body">
    <!-- LEFT: Question -->
    <div class="q-panel">
      <div class="q-scroll">
        <div class="stem-box">
          <div class="stem-header">
            <div class="q-tags">
              <span class="qtag qtag-num">Q{{ idx + 1 }}</span>
              <span class="qtag qtag-topic" title="Question topic">
                <svg aria-hidden="true" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                {{ current.topic }}
              </span>
              <span class="qtag" :class="diffClass(current.diff)">
                {{ diffLabel(current.diff) }}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
              <div class="stem-font-row">
                <button type="button" class="fnt-btn" :class="{ disabled: fontIdx === 0 }" @click="fontDecrease">A−</button>
                <button type="button" class="fnt-btn" :class="{ disabled: fontIdx === FONT_SIZES.length - 1 }" @click="fontIncrease">A+</button>
              </div>
              <!-- Per-question countdown — timed mocks only -->
              <div v-if="isTimed" style="display:flex;align-items:center;gap:6px">
                <div style="display:flex;align-items:center;gap:4px;font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.72rem;font-weight:700;" :style="{ color: timerColor }">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" :stroke="timerColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {{ qTimer }}s
                </div>
                <div style="width:60px;height:4px;background:var(--border);border-radius:2px;overflow:hidden">
                  <div style="height:100%;border-radius:2px;transition:width 1s linear" :style="{ width: timerPct+'%', background: timerColor }"></div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="current.vig && current.vig !== current.q" class="stem-text" :style="{ fontSize: stemFontSize }" v-html="sanitizeHtml(current.vig)"></div>
          <div class="stem-question" :style="{ fontSize: `calc(${stemFontSize} - 0.04rem)` }" v-html="sanitizeHtml(current.q)"></div>

          <!-- Question image (only when a real http(s) URL is present) -->
          <div v-if="isImageUrl(current.img)" class="qc-question-image qc-question-image--student-mock">
            <img :src="current.img" alt="Question image" loading="lazy" />
          </div>

          <!-- Single mode: options inside -->
          <template v-if="isSingle">
            <div style="padding:14px 18px;border-top:1px solid var(--border)">
              <div class="opts-label">Select your answer</div>
              <button type="button" v-for="opt in current.opts" :key="opt.l" class="opt" :class="optClass(opt.l)" @click="pickOption(opt.l)">
                <div class="opt-fill"></div>
                <div class="opt-content" :style="{ fontSize: `calc(${stemFontSize} - 0.09rem)` }">
                  <div class="oltr">{{ opt.l }}</div>
                  <span>{{ opt.t }}</span>
                </div>
              </button>
            </div>
          </template>

          <div class="stem-footer">
            <button type="button" class="feedback-btn" @click="openFeedback">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Question feedback
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT: Options (split) -->
    <div v-if="!isSingle" class="a-panel">
      <div class="a-scroll">
        <div class="opts-label">Select your answer</div>
        <button type="button" v-for="opt in current.opts" :key="opt.l" class="opt anim-o" :class="optClass(opt.l)" @click="pickOption(opt.l)">
          <div class="opt-fill"></div>
          <div class="opt-content" :style="{ fontSize: `calc(${stemFontSize} - 0.09rem)` }">
            <div class="oltr">{{ opt.l }}</div>
            <span>{{ opt.t }}</span>
          </div>
        </button>
      </div>
    </div>
  </div>

  <!-- ══ ACTION BAR ══ -->
  <div class="q-actions">
    <button type="button" class="btn" :style="{ opacity: idx===0 ? 0.4:1 }" :disabled="idx === 0" @click="goPrev">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      Previous
    </button>
    <div class="sp"></div>
    <button type="button" v-if="idx < total - 1" class="btn" @click="handleSkip">Skip <span class="kbd">S</span></button>
    <button type="button" v-if="idx < total-1" class="btn btn-primary" @click="handleNext">
      Next <span class="kbd">→</span>
    </button>
    <button type="button" v-else class="btn btn-primary" @click="submitAll">Submit all &amp; finish</button>
  </div>

  <!-- ══ EXIT MODAL ══ -->
  <Teleport to="body">
    <div v-if="showExit" class="overlay open" @click.self="showExit=false">
      <div class="modal-box" style="width:420px;max-width:94vw">
        <div class="m-head">
          <div class="m-title">Save &amp; Exit</div>
          <button type="button" class="m-close" @click="showExit=false" aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="m-body">
          <div class="m-stats">
            <div class="m-stat"><div class="m-sv">{{ answeredCount }}</div><div class="m-sl">Answered</div></div>
            <div class="m-stat"><div class="m-sv">{{ total - answeredCount }}</div><div class="m-sl">Remaining</div></div>
            <div class="m-stat"><div class="m-sv" style="color:var(--teal)">—</div><div class="m-sl">Score</div></div>
          </div>
          <div class="m-note">Your progress is saved. You can resume this exam anytime from the Mock Exams page — results are only recorded when you submit the full exam.</div>
          <div class="m-btns">
            <button type="button" class="btn" style="flex:1;justify-content:center" @click="showExit=false">Keep going</button>
            <button type="button" class="btn btn-danger" style="flex:1;justify-content:center" :disabled="saving" @click="saveAndExit">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              {{ saving ? 'Saving…' : 'Save & Exit' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ══ QUESTION FEEDBACK MODAL ══ -->
  <Teleport to="body">
    <div v-if="showFeedback" id="feedbackOverlay" class="overlay open" @click.self="closeFeedback">
      <div class="modal-box">
        <div class="m-head">
          <div class="m-title">Question Feedback</div>
          <button type="button" class="m-close" @click="closeFeedback" aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Success state -->
        <div v-if="fbDone" style="padding:32px;text-align:center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 10px"><polyline points="20 6 9 17 4 12"/></svg>
          <div style="font-weight:700;color:var(--ink);margin-bottom:4px">Thanks for your feedback!</div>
          <div style="font-size:0.8rem;color:var(--ink-dim)">Our team will review this question shortly.</div>
        </div>

        <!-- Form -->
        <div v-else class="fb-body">
          <div class="fb-left">
            <div class="fb-bulb">💡</div>
            <div class="fb-left-title">Question<br>Feedback</div>
            <div class="fb-left-desc">We value your feedback. If there's anything you believe we can improve on this question, please submit the form and our team will get back to you shortly.</div>
          </div>
          <div class="fb-right">
            <div class="fb-section-lbl">Feedback Theme</div>
            <div class="fb-themes">
              <button type="button" v-for="t in fbThemes" :key="t"
                class="fb-theme" :class="{ sel: fbSelected.includes(t) }"
                @click="toggleFbTheme(t)">{{ t }}</button>
            </div>
            <div class="fb-section-lbl">Tell us more <span style="color:var(--rose,#e11d48)" aria-hidden="true">*</span></div>
            <textarea class="fb-textarea" v-model="fbComment" aria-required="true" placeholder="Your comment here… (required)"></textarea>
          </div>
        </div>

        <div v-if="!fbDone" class="fb-actions">
          <button type="button" class="fb-cancel-btn" @click="closeFeedback">Cancel</button>
          <button type="button" class="fb-submit-btn"
            :disabled="fbSubmitting || !fbComment.trim()"
            @click="submitFeedback">
            {{ fbSubmitting ? 'Submitting…' : 'Submit Feedback' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ══ LABS MODAL ══ -->
  <Teleport to="body">
    <div v-if="showLabs" class="overlay open" @click.self="showLabs=false">
      <div class="modal-box" style="width:560px;max-width:95vw;max-height:82dvh;display:flex;flex-direction:column">
        <div class="m-head">
          <div class="m-title">Reference Lab Values</div>
          <button type="button" class="m-close" @click="showLabs=false" aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="labs-body">
          <div class="labs-section-title">Haematology</div>
          <table class="labs-table">
            <tr><th>Test</th><th>Reference Range</th><th>Units</th></tr>
            <tr><td>Haemoglobin (male)</td><td>135–175</td><td>g/L</td></tr>
            <tr><td>Haemoglobin (female)</td><td>120–155</td><td>g/L</td></tr>
            <tr><td>White cell count</td><td>4.0–11.0</td><td>×10⁹/L</td></tr>
            <tr><td>Neutrophils</td><td>1.8–7.5</td><td>×10⁹/L</td></tr>
            <tr><td>Lymphocytes</td><td>1.0–4.5</td><td>×10⁹/L</td></tr>
            <tr><td>Platelets</td><td>150–400</td><td>×10⁹/L</td></tr>
            <tr><td>MCV</td><td>80–100</td><td>fL</td></tr>
            <tr><td>PT / INR</td><td>11–14 s / 0.9–1.1</td><td></td></tr>
            <tr><td>APTT</td><td>25–35</td><td>s</td></tr>
          </table>
          <div class="labs-section-title">Biochemistry</div>
          <table class="labs-table">
            <tr><th>Test</th><th>Reference Range</th><th>Units</th></tr>
            <tr><td>Sodium (Na⁺)</td><td>135–145</td><td>mmol/L</td></tr>
            <tr><td>Potassium (K⁺)</td><td>3.5–5.0</td><td>mmol/L</td></tr>
            <tr><td>Chloride (Cl⁻)</td><td>95–107</td><td>mmol/L</td></tr>
            <tr><td>Bicarbonate (HCO₃⁻)</td><td>22–29</td><td>mmol/L</td></tr>
            <tr><td>Urea</td><td>2.5–7.8</td><td>mmol/L</td></tr>
            <tr><td>Creatinine</td><td>60–110</td><td>μmol/L</td></tr>
            <tr><td>eGFR</td><td>&gt;90</td><td>mL/min/1.73m²</td></tr>
            <tr><td>Glucose (fasting)</td><td>3.9–5.6</td><td>mmol/L</td></tr>
            <tr><td>HbA1c</td><td>&lt;48</td><td>mmol/mol</td></tr>
            <tr><td>CRP</td><td>&lt;5</td><td>mg/L</td></tr>
            <tr><td>ALT</td><td>7–56</td><td>U/L</td></tr>
            <tr><td>AST</td><td>10–40</td><td>U/L</td></tr>
            <tr><td>Bilirubin (total)</td><td>3–21</td><td>μmol/L</td></tr>
            <tr><td>ALP</td><td>40–130</td><td>U/L</td></tr>
            <tr><td>Albumin</td><td>35–50</td><td>g/L</td></tr>
            <tr><td>Total protein</td><td>60–80</td><td>g/L</td></tr>
            <tr><td>Calcium (corrected)</td><td>2.2–2.6</td><td>mmol/L</td></tr>
            <tr><td>Phosphate</td><td>0.8–1.4</td><td>mmol/L</td></tr>
            <tr><td>Magnesium</td><td>0.7–1.0</td><td>mmol/L</td></tr>
            <tr><td>TSH</td><td>0.4–4.0</td><td>mU/L</td></tr>
            <tr><td>Free T4</td><td>10–22</td><td>pmol/L</td></tr>
          </table>
          <div class="labs-section-title">Arterial Blood Gas</div>
          <table class="labs-table">
            <tr><th>Parameter</th><th>Reference Range</th><th>Units</th></tr>
            <tr><td>pH</td><td>7.35–7.45</td><td></td></tr>
            <tr><td>PaO₂</td><td>10.6–13.3</td><td>kPa</td></tr>
            <tr><td>PaCO₂</td><td>4.7–6.0</td><td>kPa</td></tr>
            <tr><td>HCO₃⁻</td><td>22–26</td><td>mmol/L</td></tr>
            <tr><td>Base excess</td><td>−2 to +2</td><td>mmol/L</td></tr>
            <tr><td>Lactate</td><td>&lt;2.0</td><td>mmol/L</td></tr>
          </table>
          <div class="labs-section-title">Cardiac &amp; Other</div>
          <table class="labs-table">
            <tr><th>Test</th><th>Reference Range</th><th>Units</th></tr>
            <tr><td>Troponin I (hs)</td><td>&lt;52 (male), &lt;16 (female)</td><td>ng/L</td></tr>
            <tr><td>BNP</td><td>&lt;100</td><td>pg/mL</td></tr>
            <tr><td>NT-proBNP</td><td>&lt;125 (age &lt;75)</td><td>pg/mL</td></tr>
            <tr><td>CK (total)</td><td>25–200 (male), 25–170 (female)</td><td>U/L</td></tr>
            <tr><td>D-dimer</td><td>&lt;0.5</td><td>mg/L FEU</td></tr>
            <tr><td>Lipase</td><td>10–140</td><td>U/L</td></tr>
            <tr><td>PSA</td><td>&lt;4.0</td><td>ng/mL</td></tr>
          </table>
          <div class="labs-note">ℹ These are standard reference ranges. Adjust based on local laboratory calibration and clinical context.</div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ══ CALCULATOR MODAL ══ -->
  <Teleport to="body">
    <div v-if="showCalc" class="overlay open" @click.self="showCalc=false">
      <div class="modal-box" style="width:300px;max-width:95vw">
        <div class="m-head">
          <div class="m-title">Calculator</div>
          <button type="button" class="m-close" @click="showCalc=false" aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="calc-body">
          <div class="calc-display">
            <div class="calc-expr">{{ calcExpr }}</div>
            <div class="calc-val">{{ calcVal }}</div>
          </div>
          <div class="calc-memory">
            <button type="button" class="calc-btn" @click="calcMemAct('mc')">MC</button>
            <button type="button" class="calc-btn" @click="calcMemAct('mr')">MR</button>
            <button type="button" class="calc-btn" @click="calcMemAct('m+')">M+</button>
            <button type="button" class="calc-btn" @click="calcMemAct('m-')">M−</button>
          </div>
          <div class="calc-grid">
            <button type="button" class="calc-btn clr" @click="calcAct('AC')">AC</button>
            <button type="button" class="calc-btn clr" @click="calcAct('DEL')">⌫</button>
            <button type="button" class="calc-btn op"  @click="calcAct('%')">%</button>
            <button type="button" class="calc-btn op"  @click="calcAct('/')">÷</button>
            <button type="button" class="calc-btn"     @click="calcAct('7')">7</button>
            <button type="button" class="calc-btn"     @click="calcAct('8')">8</button>
            <button type="button" class="calc-btn"     @click="calcAct('9')">9</button>
            <button type="button" class="calc-btn op"  @click="calcAct('*')">×</button>
            <button type="button" class="calc-btn"     @click="calcAct('4')">4</button>
            <button type="button" class="calc-btn"     @click="calcAct('5')">5</button>
            <button type="button" class="calc-btn"     @click="calcAct('6')">6</button>
            <button type="button" class="calc-btn op"  @click="calcAct('-')">−</button>
            <button type="button" class="calc-btn"     @click="calcAct('1')">1</button>
            <button type="button" class="calc-btn"     @click="calcAct('2')">2</button>
            <button type="button" class="calc-btn"     @click="calcAct('3')">3</button>
            <button type="button" class="calc-btn op"  @click="calcAct('+')">+</button>
            <button type="button" class="calc-btn"     @click="calcAct('+/-')">+/−</button>
            <button type="button" class="calc-btn"     @click="calcAct('0')">0</button>
            <button type="button" class="calc-btn"     @click="calcAct('.')">.</button>
            <button type="button" class="calc-btn eq"  @click="calcAct('=')">=</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  </template>
</template>

<style>
/* ── Skeleton ── */
.sk-runner{display:flex;flex-direction:column;height:100dvh;background:var(--bg,#f7f8fa);font-family:'Figtree',sans-serif}
.sk-bar{display:flex;align-items:center;padding:10px 18px;border-bottom:1px solid var(--border,#e5e7eb);background:var(--white,#fff);gap:8px;min-height:48px}
.sk-body{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:24px;overflow:hidden}
.sk-q-panel,.sk-a-panel{background:var(--white,#fff);border:1px solid var(--border,#e5e7eb);border-radius:10px;padding:20px;overflow:hidden}
.sk-pulse{background:var(--surface-2,#e5e7eb);animation:skPulse 1.2s ease-in-out infinite;display:block}
@keyframes skPulse{0%,100%{opacity:0.85}50%{opacity:0.5}}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#0f1f2e;--navy-mid:#1a3548;--navy-light:#233d54;
  --ink:#0f1f2e;--ink-mid:#374f65;--ink-dim:#7a95ad;--ink-faint:#b8cdd9;
  --teal:#06b6d4;--teal-mid:#0891b2;--teal-dark:#0369a1;--teal-light:#e0f9fd;--teal-pale:#f0feff;--teal-border:#67e8f9;
  --yellow:#f5c400;--amber:#d97706;--amber-pale:#fffbeb;--amber-light:#fef9c3;
  --green:#16a34a;--green-light:#dcfce7;--green-border:rgba(22,163,74,0.3);
  --rose:#e11d48;--rose-light:#fff1f2;--rose-border:rgba(225,29,72,0.3);--red:#dc2626;--red-light:#fee2e2;
  --surface:#f7fbfd;--surface-hi:#eef6fa;--border:#e2edf4;--border-hi:#c8dce8;--white:#ffffff;--bg:#ffffff;
  --r-sm:8px;--r:14px;--r-lg:22px;--r-xl:32px;
  --sidebar-w:260px;
  --dm-bg:#090f1a;--dm-surface:#0c1825;--dm-card:#0f1f2e;--dm-border:#1a3045;
  --dm-ink:#e2edf4;--dm-ink-mid:#8aafc8;--dm-ink-dim:#506a82;
  --purple:#7c3aed;--purple-light:#f5f3ff;--purple-border:#ddd6fe;
}
body.dark{
  --surface:#090f1a;--white:#0f1f2e;--border:#1a3045;
  --ink:#e2edf4;--ink-mid:#8aafc8;--ink-dim:#8aafc8;--ink-faint:#506a82;
  --teal-pale:rgba(6,182,212,0.08);--teal-border:rgba(6,182,212,0.25);
  --green-light:rgba(5,150,105,0.12);--green-border:rgba(110,231,183,0.2);
  --rose-light:rgba(225,29,72,0.12);--rose-border:rgba(253,164,175,0.2);
  --amber-light:rgba(217,119,6,0.12);
  --purple-light:rgba(124,58,237,0.1);--purple-border:rgba(124,58,237,0.25);
}
html,body{height:100%;width:100%;font-family:'Figtree',sans-serif;background:var(--surface);color:var(--ink);overflow:hidden;transition:background 0.3s,color 0.3s}
/* ── TOPBAR ── */
.topbar{height:52px;background:var(--white);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 36px;gap:10px;flex-shrink:0;z-index:20;transition:background 0.3s,border-color 0.3s}
.tb-logo{display:flex;align-items:center;flex-shrink:0;color:var(--ink)}
.tb-sep{width:1px;height:20px;background:var(--border);flex-shrink:0}
.tb-tag{display:flex;align-items:center;gap:5px;font-size:0.63rem;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--purple);padding:3px 9px;border-radius:20px;background:var(--purple-light);border:1px solid var(--purple-border);flex-shrink:0}
.tb-timer{display:flex;align-items:center;gap:5px;font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.79rem;font-weight:700;color:var(--ink-mid);padding:4px 10px;border-radius:7px;border:1.5px solid var(--border);background:var(--white);transition:all 0.14s;flex-shrink:0}
.tb-prog{display:flex;align-items:center;gap:8px;flex-shrink:0}
.tb-count{font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.69rem;font-weight:700;color:var(--ink-dim);white-space:nowrap}
.tb-track{width:120px;height:5px;background:var(--border);border-radius:3px;overflow:hidden}
.tb-fill{height:100%;background:linear-gradient(90deg,var(--teal-dark),var(--teal));border-radius:3px;transition:width 0.5s cubic-bezier(0.16,1,0.3,1)}
.tb-dots{display:flex;gap:3px;overflow-x:auto;flex:1;min-width:0;padding:2px 0 6px;mask-image:linear-gradient(to right,transparent 0,black 14px,black calc(100% - 14px),transparent 100%);-webkit-mask-image:linear-gradient(to right,transparent 0,black 14px,black calc(100% - 14px),transparent 100%);scroll-behavior:smooth}
.tb-dots::-webkit-scrollbar{height:6px}
.tb-dots::-webkit-scrollbar-track{background:transparent}
.tb-dots::-webkit-scrollbar-thumb{background:rgba(100,116,139,0.35);border-radius:3px}
.tb-dots::-webkit-scrollbar-thumb:hover{background:rgba(100,116,139,0.6)}
/* Mobile question-navigator collapse control — hidden on desktop (the inline
   .tb-dots row is shown instead); enabled in the max-width:768px block. */
.tb-navtoggle{display:none}
.tb-navbackdrop{display:none}
.tb-navpanel{display:none}
.tb-dot{width:26px;height:26px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.6rem;font-weight:700;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-faint);cursor:pointer;transition:all 0.12s}
.tb-dot:hover{border-color:var(--teal-border);color:var(--teal-mid);background:var(--teal-pale)}
.tb-dot.d-cur{background:var(--teal);border-color:var(--teal);color:#fff;box-shadow:0 2px 7px rgba(6,182,212,0.3)}
.tb-dot.d-skip{background:var(--amber-light);border-color:var(--amber);color:var(--amber)}
.tb-dot.d-answered{background:#dbeafe;border-color:#60a5fa;color:#2563eb}
.tb-right{display:flex;align-items:center;gap:6px;flex-shrink:0}
.ib{width:32px;height:32px;border-radius:7px;border:1.5px solid var(--border);background:var(--white);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink-dim);transition:all 0.14s;flex-shrink:0;font-family:'Figtree',sans-serif;font-size:0.64rem;font-weight:800;gap:4px;padding:0 8px;width:auto}
.ib:hover{border-color:var(--teal-border);color:var(--teal);background:var(--teal-pale)}
.ib.on{border-color:var(--amber);color:var(--amber);background:var(--amber-light)}
.ib-sq{width:32px;height:32px;padding:0;flex-shrink:0}
.dm-btn{width:32px;height:32px;border-radius:7px;border:1.5px solid var(--border);background:var(--white);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink-dim);position:relative;overflow:hidden;transition:all 0.2s}
.dm-btn svg{position:absolute;transition:opacity 0.2s,transform 0.3s cubic-bezier(0.34,1.56,0.64,1)}
.dm-btn .i-sun{opacity:1;transform:rotate(0deg) scale(1)}
.dm-btn .i-moon{opacity:0;transform:rotate(-90deg) scale(0.6)}
body.dark .dm-btn .i-sun{opacity:0;transform:rotate(90deg) scale(0.6)}
body.dark .dm-btn .i-moon{opacity:1;transform:rotate(0deg) scale(1)}
.btn-exit{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;font-family:'Figtree',sans-serif;font-size:0.72rem;font-weight:800;background:var(--navy-mid,#1a3548);color:#fff;border:none;cursor:pointer;transition:all 0.14s;white-space:nowrap}
.btn-exit:hover{background:var(--teal-dark);transform:translateY(-1px)}
/* ── BODY ── */
.s-body{display:flex;height:calc(100dvh - 52px);height:calc(100dvh - 52px);overflow:hidden}
.q-panel{flex:1;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--border);min-width:0}
.a-panel{flex:1;display:flex;flex-direction:column;overflow:hidden;background:var(--surface);transition:background 0.3s}
body.single .s-body{flex-direction:column;overflow-y:auto}
body.single .s-body::-webkit-scrollbar{width:4px}
body.single .s-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
body.single .q-panel{border-right:none;flex:0 0 auto;overflow:visible}
body.single .q-panel .q-scroll{overflow:visible;padding-bottom:90px}
body.single .a-panel{flex:0 0 auto;background:transparent;border-top:1px solid var(--border)}
body.single .a-panel .a-scroll{overflow:visible;padding-top:20px;padding-bottom:100px}
.q-actions{position:fixed;bottom:0;left:0;right:0;z-index:30;height:54px;padding:0 36px;background:var(--white);border-top:1px solid var(--border);display:flex;align-items:center;gap:9px;transition:background 0.3s,border-color 0.3s}
.q-scroll{flex:1;overflow-y:auto;padding:28px 36px 80px}
.q-scroll::-webkit-scrollbar{width:4px}
.q-scroll::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
.a-scroll{flex:1;overflow-y:auto;padding:20px 36px 80px}
.a-scroll::-webkit-scrollbar{width:3px}
.a-scroll::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
body.single .q-scroll{padding-left:max(40px,calc(50vw - 380px));padding-right:max(40px,calc(50vw - 380px))}
body.single .a-scroll{padding-left:max(40px,calc(50vw - 380px));padding-right:max(40px,calc(50vw - 380px))}
/* ── TAGS ── */
.qtag{display:inline-flex;align-items:center;gap:4px;font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;padding:3px 9px;border-radius:20px;border:1px solid}
.qtag-topic{color:var(--teal-mid);background:var(--teal-pale);border-color:var(--teal-border)}
.qtag-easy{color:var(--green);background:var(--green-light);border-color:var(--green-border)}
.qtag-medium{color:var(--amber);background:var(--amber-light);border-color:rgba(217,119,6,0.3)}
.qtag-hard{color:var(--rose);background:var(--rose-light);border-color:var(--rose-border)}
.qtag-expert{color:var(--purple);background:var(--purple-light);border-color:var(--purple-border)}
.qtag-num{color:var(--ink-faint);background:var(--surface);border-color:var(--border);font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums}
/* ── STEM BOX ── */
.stem-box{background:var(--white);border:1px solid var(--border);border-radius:var(--r-lg);border-left:3px solid var(--teal);padding:0;margin-bottom:16px;transition:background 0.3s,border-color 0.3s;overflow:hidden}
.stem-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px 10px;border-bottom:1px solid var(--border)}
.stem-font-row{display:flex;gap:4px;flex-shrink:0}
.fnt-btn{width:22px;height:22px;border-radius:5px;border:1.5px solid var(--border);background:var(--white);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink-dim);font-size:0.68rem;font-weight:800;font-family:'Figtree',sans-serif;transition:all 0.12s}
.fnt-btn:hover:not(.disabled){border-color:var(--teal-border);color:var(--teal)}
.fnt-btn.disabled{opacity:0.35;cursor:not-allowed;pointer-events:none}
.q-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.stem-text{font-size:0.92rem;color:var(--ink-mid);line-height:1.76;padding:16px 18px 14px}
.stem-question{font-size:0.88rem;font-weight:400;color:var(--ink);padding:13px 18px 14px;line-height:1.5}
.stem-footer{display:flex;justify-content:flex-end;padding:8px 14px 10px;border-top:1px solid var(--border)}
.feedback-btn{display:inline-flex;align-items:center;gap:5px;font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--ink-faint);background:none;border:1.5px solid var(--border);border-radius:20px;padding:3px 11px;cursor:pointer;transition:all 0.14s;font-family:'Figtree',sans-serif}
.feedback-btn:hover{border-color:var(--teal-border);color:var(--teal);background:var(--teal-pale)}

/* ── FEEDBACK MODAL ── */
#feedbackOverlay .modal-box{width:700px;max-width:96vw}
.fb-body{padding:20px 24px 20px;display:flex;gap:28px}
.fb-left{width:130px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:2px}
.fb-bulb{font-size:2.6rem;line-height:1;margin-bottom:10px}
.fb-left-title{font-family:'Figtree',sans-serif;font-size:0.88rem;font-weight:700;color:var(--ink);line-height:1.35;margin-bottom:8px}
.fb-left-desc{font-size:0.68rem;color:var(--ink-dim);line-height:1.55}
.fb-right{flex:1;min-width:0}
.fb-section-lbl{font-size:0.58rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--ink-faint);margin-bottom:8px;margin-top:16px}
.fb-section-lbl:first-child{margin-top:0}
.fb-themes{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px}
.fb-theme{font-size:0.72rem;font-weight:600;padding:5px 13px;border-radius:20px;border:1.5px solid var(--border);background:var(--white);color:var(--ink-mid);cursor:pointer;transition:all 0.13s;font-family:'Figtree',sans-serif}
.fb-theme:hover{border-color:var(--teal-border);color:var(--teal);background:var(--teal-pale)}
.fb-theme.sel{border-color:var(--teal);background:var(--teal);color:#fff}
.fb-textarea{width:100%;border:1.5px solid var(--border);border-radius:var(--r);background:var(--white);color:var(--ink);font-family:'Figtree',sans-serif;font-size:0.79rem;padding:10px 12px;resize:vertical;min-height:90px;outline:none;transition:border-color 0.14s;line-height:1.55}
.fb-textarea:focus{border-color:var(--teal-border)}
.fb-textarea::placeholder{color:var(--ink-faint)}
.fb-actions{display:flex;justify-content:flex-end;gap:9px;padding:14px 24px 18px;border-top:1px solid var(--border)}
.fb-cancel-btn{padding:8px 20px;border-radius:8px;border:1.5px solid var(--border);background:var(--white);color:var(--ink-mid);font-family:'Figtree',sans-serif;font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.13s}
.fb-cancel-btn:hover{border-color:var(--ink-dim);color:var(--ink)}
.fb-submit-btn{padding:8px 22px;border-radius:8px;border:none;background:var(--teal);color:#fff;font-family:'Figtree',sans-serif;font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.13s}
.fb-submit-btn:hover:not(:disabled){background:var(--teal-mid)}
.fb-submit-btn:disabled{opacity:0.45;cursor:not-allowed}
@keyframes fadeSlide{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
/* ── ACTION BAR ── */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 15px;border-radius:8px;font-family:'Figtree',sans-serif;font-size:0.76rem;font-weight:700;cursor:pointer;transition:all 0.14s;border:1.5px solid var(--border);background:var(--white);color:var(--ink-mid)}
.btn:hover:not(:disabled){border-color:var(--teal-border);color:var(--teal);background:var(--teal-pale)}
.btn:disabled{opacity:0.35;cursor:not-allowed}
.btn-primary{background:var(--teal);color:#fff;border-color:var(--teal);box-shadow:0 2px 0 rgba(8,145,178,0.4)}
.btn-primary:hover:not(:disabled){background:var(--teal-mid);border-color:var(--teal-mid);color:#fff;transform:translateY(-1px)}
.sp{flex:1}
.kbd{display:inline-block;background:var(--surface);border:1px solid var(--border);border-bottom-width:2px;border-radius:4px;padding:0 4px;font-family:'JetBrains Mono',monospace;font-size:0.57rem;font-weight:600;color:var(--ink-faint)}
/* ── OPTIONS ── */
.opts-label{font-size:0.57rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--ink-faint);margin-bottom:10px}
.opt{display:flex;align-items:flex-start;gap:11px;padding:12px 14px;margin-bottom:7px;border-radius:var(--r);border:1.5px solid var(--border);background:var(--white);cursor:pointer;transition:all 0.13s;font-size:0.83rem;color:var(--ink-mid);font-weight:700;line-height:1.45;position:relative;overflow:hidden}
.opt:hover{border-color:var(--teal-border);background:var(--teal-pale);color:var(--ink);transform:translateX(2px)}
.opt:hover .oltr{border-color:var(--teal);color:var(--teal)}
.opt.sel{border-color:var(--teal);background:var(--teal-pale);color:var(--ink)}
.opt.sel .oltr{background:var(--teal);color:#fff;border-color:var(--teal)}
.opt.kb-focus{border-color:var(--teal-border);background:var(--teal-pale);color:var(--ink);outline:2px solid var(--teal);outline-offset:1px}
.opt.kb-focus .oltr{border-color:var(--teal);color:var(--teal)}
.opt-fill{position:absolute;left:0;top:0;bottom:0;z-index:0;border-radius:calc(var(--r) - 2px);opacity:0.18}
.opt-content{position:relative;z-index:1;display:flex;align-items:center;gap:11px;flex:1;min-width:0}
.oltr{width:27px;height:27px;border-radius:7px;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.68rem;font-weight:700;color:var(--ink-dim);background:var(--surface);transition:all 0.13s;margin-top:1px}
/* ── MODAL ── */
.overlay{display:none;position:fixed;inset:0;background:rgba(15,31,46,0.52);z-index:200;align-items:center;justify-content:center;backdrop-filter:blur(3px)}
.overlay.open{display:flex}
.modal-box{background:var(--white);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:0 24px 64px rgba(15,31,46,0.18);overflow:hidden;transition:background 0.3s,border-color 0.3s}
/* Dark mode: --border (#1a3045) barely separates the dark modal from the dark
   scrim, so use a lighter edge to keep the Calc / Labs popups clearly framed. */
body.dark .modal-box{border-color:rgba(255,255,255,0.14)}
.m-head{padding:17px 20px 13px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.m-title{font-family:'Figtree',sans-serif;font-size:0.97rem;font-weight:700;color:var(--ink)}
.m-close{width:27px;height:27px;border-radius:6px;border:1.5px solid var(--border);background:var(--white);cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--ink-dim);transition:all 0.12s}
.m-close:hover{border-color:var(--rose);color:var(--rose);background:var(--rose-light)}
.m-body{padding:16px 20px 20px}
.m-stats{display:flex;gap:9px;margin-bottom:15px}
.m-stat{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:11px;text-align:center}
.m-sv{font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:1.05rem;font-weight:700;color:var(--ink)}
.m-sl{font-size:0.58rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--ink-faint);margin-top:2px}
.m-note{font-size:0.76rem;color:var(--ink-dim);line-height:1.55;margin-bottom:15px}
.m-btns{display:flex;gap:8px}
.m-btns .btn{flex:1;justify-content:center}
.btn-danger{background:var(--rose);color:#fff;border-color:var(--rose)}
.btn-danger:hover:not(:disabled){background:#c41535;border-color:#c41535;color:#fff;transform:translateY(-1px)}
/* ── LABS ── */
.labs-body{padding:16px 20px 20px;overflow-y:auto;flex:1}
.labs-body::-webkit-scrollbar{width:3px}
.labs-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
.labs-section-title{font-size:0.58rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--ink-faint);margin:14px 0 8px;display:flex;align-items:center;gap:6px}
.labs-section-title::after{content:'';flex:1;height:1px;background:var(--border)}
.labs-section-title:first-child{margin-top:0}
.labs-table{width:100%;border-collapse:collapse}
.labs-table th{font-size:0.6rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--ink-faint);padding:4px 10px;text-align:left;border-bottom:1px solid var(--border)}
.labs-table td{font-size:0.78rem;padding:6px 10px;border-bottom:1px solid var(--border);color:var(--ink-mid)}
.labs-table td:first-child{color:var(--ink);font-weight:600}
.labs-table td:nth-child(2){font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.74rem;font-weight:700;color:var(--ink)}
.labs-table tr:last-child td{border-bottom:none}
.labs-note{font-size:0.72rem;color:var(--ink-faint);margin-top:12px;padding:8px 12px;background:var(--surface);border-radius:var(--r);line-height:1.5}
/* ── CALCULATOR ── */
.calc-body{padding:16px}
.calc-display{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px;margin-bottom:12px;min-height:54px;text-align:right}
.calc-expr{font-size:0.7rem;color:var(--ink-faint);font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;min-height:16px;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.calc-val{font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:1.5rem;font-weight:700;color:var(--ink);line-height:1}
.calc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.calc-btn{padding:0;aspect-ratio:1;border-radius:8px;border:1.5px solid var(--border);background:var(--white);font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.88rem;font-weight:700;color:var(--ink);cursor:pointer;transition:all 0.12s;display:flex;align-items:center;justify-content:center}
.calc-btn:hover{border-color:var(--teal-border);background:var(--teal-pale);color:var(--teal)}
.calc-btn.op{background:var(--surface);color:var(--teal-mid);border-color:var(--teal-border)}
.calc-btn.op:hover{background:var(--teal-pale);color:var(--teal)}
.calc-btn.eq{background:var(--teal);color:#fff;border-color:var(--teal)}
.calc-btn.eq:hover{background:var(--teal-mid);border-color:var(--teal-mid)}
.calc-btn.clr{color:var(--rose);border-color:var(--rose-border);background:var(--rose-light)}
.calc-btn.clr:hover{background:var(--rose-light);border-color:var(--rose)}
.calc-memory{display:flex;gap:5px;margin-bottom:8px}
.calc-memory .calc-btn{flex:1;height:32px;font-size:0.65rem;color:var(--ink-dim)}
/* ── LAYOUT TOGGLE ── */
.layout-btn{display:flex;align-items:center;gap:4px;font-size:0.62rem;font-weight:700;color:var(--ink-dim);padding:4px 9px;border-radius:7px;border:1.5px solid var(--border);background:var(--white);cursor:pointer;transition:all 0.14s}
.layout-btn:hover{border-color:var(--teal-border);color:var(--teal);background:var(--teal-pale)}
.layout-btn.single-active{border-color:var(--purple-border);color:var(--purple);background:var(--purple-light)}
/* ── ANIMATIONS ── */
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes slideR{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
.anim-q{animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both}
.anim-o{animation:slideR 0.25s cubic-bezier(0.16,1,0.3,1) both}
.anim-o:nth-child(1){animation-delay:0.04s}
.anim-o:nth-child(2){animation-delay:0.09s}
.anim-o:nth-child(3){animation-delay:0.13s}
.anim-o:nth-child(4){animation-delay:0.17s}
.anim-o:nth-child(5){animation-delay:0.21s}

/* ── Mobile: collapse session topbar so Save & Exit never clips ── */
@media (max-width:768px){
  .topbar{padding:0 10px;gap:5px}
  /* Hide .tb-prog (the redundant "4 / 200" count + track) — the new pill below
     already shows position, and the count crowds the narrow topbar. */
  .tb-logo,.tb-tag,.layout-btn,.tb-prog,.tb-sep{display:none}
  /* Replace the always-on inline dot row with a compact collapse pill that
     toggles a dropdown grid — keeps the navigator from dominating the screen
     in long (100+ Q) sessions. */
  .tb-dots{display:none}
  .tb-navtoggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:2;min-width:0;padding:6px 10px;border-radius:7px;border:1.5px solid var(--border);background:var(--white);color:var(--ink-mid);font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.72rem;font-weight:700;cursor:pointer;transition:border-color 0.14s}
  .tb-navtoggle:hover{border-color:var(--teal-border)}
  .tb-navtoggle-of{color:var(--ink-faint);font-weight:600}
  .tb-navchev{flex-shrink:0;transition:transform 0.18s}
  .tb-navchev.open{transform:rotate(180deg)}
  .tb-navbackdrop{display:block;position:fixed;inset:52px 0 0 0;background:rgba(0,0,0,0.4);z-index:45}
  .tb-navpanel{display:block;position:fixed;top:52px;left:0;right:0;z-index:46;background:var(--white);border-bottom:1px solid var(--border);box-shadow:0 10px 24px rgba(0,0,0,0.14);max-height:55vh;overflow-y:auto;padding:12px;animation:fadeSlide 0.18s ease}
  .tb-navgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(36px,1fr));gap:7px}
  .tb-navgrid .tb-dot{width:100%;height:36px}
  .ib-label,.exit-label{display:none}
  .ib{padding:6px 8px}
  .btn-exit{padding:7px 9px}
  .tb-right{gap:5px}
  /* Stack the split question/answer panes vertically on phones */
  .s-body{flex-direction:column;overflow-y:auto}
  .q-panel{border-right:none;flex:0 0 auto;overflow:visible}
  .a-panel{flex:0 0 auto;background:transparent;border-top:1px solid var(--border)}
  .q-scroll{overflow:visible;padding:16px}
  .a-scroll{overflow:visible;padding:16px 16px calc(100px + env(safe-area-inset-bottom, 0px))}
  /* Action bar: lift above the mobile browser chrome / home indicator and trim
     padding + keyboard hints so every button stays on-screen and tappable. */
  .q-actions{
    height:auto;
    padding:8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
    gap:6px;
  }
  .q-actions .btn{padding-left:13px;padding-right:13px}
  .q-actions .kbd{display:none}
}
</style>
