<script setup lang="ts">
definePageMeta({ layout: false })
useHead({
  title: 'Timed Mode · Passmed',
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
  questions, loading, fetchError, timerPerQ: sharedTimerPerQ,
  answered, score, progress, choose, skip, goNext, goPrev, toggleFlag, reset, formatTime,
  fetchQuestions,
  // backend session sync
  sessionId, syncQuestion, syncSession, completeSession, loadSession, flushPendingSyncs,
  hydrateFlaggedFromBackend,
} = useSession()

const { toggle: toggleDark, init: initDark } = useDarkMode()
// layout:false means the student layout (which normally runs init()) never wraps
// this page — so on a hard refresh / direct Resume link we apply the saved theme here.
onMounted(() => initDark())
const { activeExam } = useExam()
const route = useRoute()

const isSingle    = ref(false)
// Mobile-only: collapsible question navigator. On phones the inline dot row is
// hidden and replaced by a compact "Q4 of 40" pill; tapping it opens a dropdown
// grid. navOpen drives that panel (always closed/irrelevant on desktop).
const navOpen     = ref(false)
const showExit    = ref(false)
const expSingleEl = ref<HTMLElement | null>(null)

// Single-column: scroll explanation into view after grading.
// In timed mode, result[id] is set by handleNext() — watch it directly
// (unlike tutor.vue which watches `submitted`).
watch(() => result.value[current.value?.id], (val) => {
  if (!val || !isSingle.value) return
  nextTick(() => {
    expSingleEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
})
const showLabs  = ref(false)
const showCalc  = ref(false)
const paused    = ref(false)
// resuming = true while loadSession() is in flight (Resume from Past Sessions).
const resuming    = ref(false)
const resumeError = ref(false)   // true when loadSession() returned null on resume
// saving = true while Save & Exit / Submit submitted — flushing PATCHes +
// complete + navigation. The skeleton is shown during this window.
const saving    = ref(false)
// submitting = true only during the FINAL submit (submitAll). Drives a dedicated
// "Calculating your results…" screen instead of the generic skeleton.
const submitting = ref(false)
const calcExpr  = ref('')
const calcVal   = ref('0')
const calcMem   = ref(0)

// Ref to the scrollable dots row so we can keep the active dot in view
// when the user navigates between questions (e.g. 33 → 34 → 35 in a
// 120-question session — without auto-scroll, the active dot can disappear
// off the right edge of the topbar).
// ── Question Feedback ────────────────────────────────────────────────────────
// Ported from tutor.vue. Previously the feedback button in timed (test) mode
// had NO click handler, state, or modal — so it did nothing. Students should be
// able to flag a typo / unclear wording DURING a timed attempt while it's fresh,
// regardless of submit state, so the button + modal live in the stem footer and
// are available throughout the attempt.
const showFeedback   = ref(false)
const fbThemes       = ['Good item', 'Too easy', 'Too hard', 'Not relevant', 'Out of date', 'Incorrect', 'Typo', 'Poorly worded', 'Other']
const fbSelected     = ref<string[]>([])
const fbComment      = ref('')
const fbSubmitting   = ref(false)
const fbDone         = ref(false)

function openFeedback() { showFeedback.value = true; fbSelected.value = []; fbComment.value = ''; fbDone.value = false }
function closeFeedback() { showFeedback.value = false }
function toggleFbTheme(t: string) {
  const i = fbSelected.value.indexOf(t)
  if (i === -1) fbSelected.value.push(t)
  else fbSelected.value.splice(i, 1)
}
async function submitFeedback() {
  // Comment is always required (matches tutor.vue) — themes stay optional.
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

// Mouse wheel → horizontal scroll on the dots row.
function onDotsWheel(e: WheelEvent) {
  if (!dotsRef.value) return
  if (e.deltaY === 0) return
  e.preventDefault()
  dotsRef.value.scrollLeft += e.deltaY
}

watch(() => idx.value, scrollActiveDotIntoView)
onMounted(() => { setTimeout(scrollActiveDotIntoView, 150) })

// Per-question timer — pulled from useSession (set by qbank.vue).
// Falls back to 90s if the session state didn't carry a value.
const timerPerQ = computed(() => sharedTimerPerQ.value || 90)
const qTimer    = ref(timerPerQ.value)
// Set when the final question's countdown hits 0 → drives the auto-submit and
// the "run out of time" notice on the results overlay.
const ranOutOfTime = ref(false)

// Per-question timer state map. Each question gets its OWN countdown — when
// the user switches questions (via Next/Prev or by clicking a top dot), the
// outgoing question's remaining seconds are saved here and the incoming
// question either resumes from its saved value or starts fresh from
// `timerPerQ.value` (if it's the first visit).
const qTimerMap = ref<Record<number, number>>({})

// ─── Per-question time tracking ────────────────────────────────────────────
// secs.value (gated by !paused) is the SESSION elapsed clock. qTimerStart
// holds it at the moment the user entered the current question; the delta
// on switch is accumulated into qTimeMap and PATCHed.
const qTimerStart = ref(0)
const qTimeMap    = ref<Record<number, number>>({})

function captureElapsed(qid: number): number {
  const delta = Math.max(0, secs.value - qTimerStart.value)
  qTimeMap.value[qid] = (qTimeMap.value[qid] || 0) + delta
  qTimerStart.value = secs.value
  return qTimeMap.value[qid]
}

// Swap qTimer when the displayed question changes — and sync BOTH the
// outgoing question's remaining countdown AND its accumulated time-spent.
watch(() => current.value?.id, (newId, oldId) => {
  // Clear the countdown announcements so the next question's warning is a fresh
  // change even if the wording repeats.
  timerAnnounce.value = ''
  timerAnnounceUrgent.value = ''
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
    // Re-anchor the wall-clock deadline for the newly shown question.
    qDeadlineTs = Date.now() + qTimer.value * 1000
  }
})

let sessionInt: ReturnType<typeof setInterval> | null = null
let qInt: ReturnType<typeof setInterval> | null = null
// Wall-clock deadline (ms epoch) for the CURRENT question's countdown. qTimer is
// DERIVED from this (deadline - now), so a throttled/backgrounded tab can't gain
// time and the tick can't drift. Re-anchored on question switch and on resume.
let qDeadlineTs = 0

onMounted(async () => {
  // Resume path: route has ?session=<id>. loadSession() now also rebuilds
  // questions[]/chosen[]/result[]/flagged[] from the saved session_questions
  // rows — so we MUST NOT call fetchQuestions afterwards (that would replace
  // the session's pinned questions with a generic qbank fetch). Earlier we
  // didn't guard against this, which caused resuming an older session to
  // sometimes show questions from a *newer* completed session that was
  // still cached in useState.
  const queryId = Number(route.query.session)
  const limit   = Number(route.query.count) || undefined
  const examId  = activeExam.value?.examId

  let resumed = false
  if (queryId) {
    resuming.value    = true
    resumeError.value = false
    try {
      const data = await loadSession(queryId)
      if (data) {
        const savedIdx = data.current_index ?? 0
        idx.value  = Math.min(Math.max(0, savedIdx), Math.max(0, questions.value.length - 1))
        secs.value = data.elapsed_seconds ?? 0
        // Restore per-question timers AND time-spent so cumulative tracking
        // continues correctly across multiple Save & Resume cycles.
        const rows = data.session_questions || data.questions || []
        for (const row of rows) {
          if (typeof row.q_timer_remaining === 'number') {
            qTimerMap.value[row.question_id] = row.q_timer_remaining
          }
          if (typeof row.q_time_spent === 'number' && row.q_time_spent > 0) {
            qTimeMap.value[row.question_id] = row.q_time_spent
          }
        }
        resumed = true
      } else {
        resumeError.value = true
      }
    } finally {
      resuming.value = false
    }
  }

  // Only refetch from qbank when there's NO session id in the URL. If a
  // session was requested — even with 0 questions returned — don't fall
  // back to a generic qbank fetch (that would replace the session's pinned
  // questions with the wrong pool).
  if (!queryId && !questions.value.length) {
    await fetchQuestions({
      limit,
      examId: examId ? Number(examId) : undefined,
    })
  }

  // Hydrate the flag state from question_flags. On RESUME, loadSession()
  // already kicks off a background /flags hydration, so calling it again here
  // is a redundant (heavy) third round-trip — skip it. Only the fresh-session
  // path (qbank pinned questions before navigating) needs an explicit hydrate.
  if (!resumed) hydrateFlaggedFromBackend()

  // Seed Q1's timer (other questions auto-init on first visit via the watch).
  if (current.value) {
    qTimerMap.value[current.value.id] = qTimerMap.value[current.value.id] ?? timerPerQ.value
    qTimer.value = qTimerMap.value[current.value.id]
  }
  // Anchor the current question's wall-clock deadline before the tick starts.
  qDeadlineTs = Date.now() + qTimer.value * 1000
  sessionInt = setInterval(() => { if (!paused.value) secs.value++ }, 1000)
  qInt = setInterval(() => {
    if (!paused.value && current.value && !result.value[current.value.id]) {
      // Derive remaining from wall-clock — resilient to tab throttling / drift.
      qTimer.value = Math.max(0, Math.round((qDeadlineTs - Date.now()) / 1000))
      if (qTimer.value <= 0) autoSkip()
    }
  }, 500)
})

// On RESUME (paused → false, from Space, the timer button, the overlay, or an
// option/dot click), re-anchor the deadline to now + whatever remained, so the
// paused stretch isn't counted against the question. Pausing needs no handling —
// the tick is gated on !paused, so qTimer simply holds until resume.
watch(paused, (isPaused) => {
  if (!isPaused && current.value) {
    qDeadlineTs = Date.now() + qTimer.value * 1000
  }
})

// ─── Backend sync watchers ─────────────────────────────────────────────────
const syncedResults = ref<Record<number, string>>({})

// Each new answer/skip → PATCH that question's row (with q_time_spent so
// DB has actual seconds spent, not 0).
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

// Flag toggle sync removed — useSession.toggleFlag() now POSTs directly to
// /flags/review or /flags/unreview (question_flags table is the source of
// truth, not student_session_questions.flagged). Keeping a watcher here
// caused a duplicate sync + Postgres datatype mismatch (boolean column
// receiving integer 0 from JSON `false`).

// Session-level position + elapsed sync (on question switch).
watch(idx, (n) => { syncSession({ current_index: n, elapsed_seconds: secs.value }) })
onUnmounted(() => {
  if (sessionInt) clearInterval(sessionInt)
  if (qInt) clearInterval(qInt)
  document.body.classList.remove('single')
})

watchEffect(() => { if (import.meta.client) document.body.classList.toggle('single', isSingle.value) })

function autoSkip() {
  // Per-question timer hit 0. If the user picked an option (chosen) but
  // didn't click Next in time, grade with their selection instead of
  // discarding it as 'skipped'. Earlier this was always marking as skipped
  // — which is why timed-mode sessions often showed 0% even when the user
  // had answered correctly.
  const q = current.value
  // !isGraded → a previously-skipped question whose answer the student has now
  // selected still gets graded (skipped is not a final grade).
  if (q && !isGraded(result.value[q.id])) {
    const ch = chosen.value[q.id]
    const r  = ch
      ? (ch === q.ans ? 'correct' : 'incorrect')
      : 'skipped'
    result.value = { ...result.value, [q.id]: r as any }
  }
  // qTimer swap is handled by the watch on current.value?.id.
  if (idx.value < total.value - 1) {
    idx.value++
  } else if (!ranOutOfTime.value && !saving.value && !submitting.value) {
    // Last question's timer hit 0 → the whole session is out of time. Auto-submit
    // (Option A: per-question model — the session ends when the final question's
    // countdown expires). Guarded so the 1s ticker can't fire submit twice.
    ranOutOfTime.value = true
    submitAll()
  }
}

function handleNext() {
  const q = current.value
  // Grade by the selected option when one exists (even if the question was
  // previously marked 'skipped'); skipped is not a final grade.
  if (chosen.value[q.id] && !isGraded(result.value[q.id])) {
    result.value = { ...result.value, [q.id]: chosen.value[q.id] === q.ans ? 'correct' : 'incorrect' }
  } else if (!isGraded(result.value[q.id])) {
    result.value = { ...result.value, [q.id]: 'skipped' }
  }
  // qTimer swap is handled by the watch on current.value?.id.
  goNext()
}

async function submitAll() {
  // Close modal + show saving skeleton immediately so user gets feedback.
  showExit.value = false
  saving.value   = true
  try {
    // Capture the CURRENT question's remaining timer + time spent before
    // we leave the page. Without this, the question the user was on when
    // they clicked submit ends up with stale q_timer_remaining in the DB
    // (only the question-switch watcher writes this field, and that
    // never fires for the last visited question).
    if (current.value) {
      const spent = captureElapsed(current.value.id)
      qTimerMap.value[current.value.id] = qTimer.value
      syncQuestion(current.value.id, {
        q_timer_remaining: qTimer.value,
        q_time_spent:      spent,
      })
    }
    // Mark every unanswered question (auto-grade chosen ones; skip the rest)
    // and sync each to backend (with q_time_spent) before completing.
    for (const q of progress.value) {
      const question = questions.value[q.n - 1]
      if (!question) continue
      if (!isGraded(result.value[question.id])) {
        const ch = chosen.value[question.id]
        const r = ch ? (ch === question.ans ? 'correct' : 'incorrect') : 'skipped'
        result.value = { ...result.value, [question.id]: r as any }
        const isCurrent = current.value?.id === question.id
        const spent = isCurrent ? captureElapsed(question.id) : (qTimeMap.value[question.id] || 0)
        syncQuestion(question.id, {
          chosen_answer: ch || null,
          result:        r as any,
          q_time_spent:  spent,
        })
      }
    }
    // Final session-level state push.
    await syncSession({ current_index: idx.value, elapsed_seconds: secs.value })
    // Dedicated results screen for the completeSession round-trip.
    submitting.value = true
    const id = await completeSession()
    if (id) navigateTo(`/student/review/${id}`)
    else    navigateTo('/student/past')
  } finally {
    saving.value = false
    submitting.value = false
  }
}

// ─── Save & Exit (resume later) ────────────────────────────────────────────
// Keeps the session as `in_progress` so it shows up under Past Sessions with
// a Resume button. Does NOT mark unanswered as skipped, does NOT call
// /complete. Just persists position/elapsed and flushes any debounced
// answer PATCHes so nothing is lost.
async function saveAndExit() {
  // Close modal + skeleton up immediately so user sees "saving…" state.
  showExit.value = false
  saving.value   = true
  try {
    // Capture time-spent on the CURRENT question — would otherwise be lost.
    if (current.value) {
      const spent = captureElapsed(current.value.id)
      syncQuestion(current.value.id, {
        q_time_spent:      spent,
        q_timer_remaining: qTimer.value,
      })
    }
    await syncSession({ current_index: idx.value, elapsed_seconds: secs.value })
    await flushPendingSyncs()
    navigateTo('/student/past')
  } finally {
    saving.value = false
  }
}

const timerColor = computed(() => {
  const pct = qTimer.value / timerPerQ.value
  if (pct > 0.5) return 'var(--green)'
  if (pct > 0.25) return 'var(--amber)'
  return 'var(--rose)'
})
const timerPct = computed(() => (qTimer.value / timerPerQ.value) * 100)

// Screen-reader countdown warnings (a11y / WCAG 4.1.2). The visible timer ticks
// every second; announcing each tick would spam, so we only push a message as
// the countdown crosses key thresholds. The message carries the question number
// so each threshold-crossing is a UNIQUE string (reliably re-announced on every
// question, not swallowed as a no-change). 30s/10s are polite; the final 5s
// uses an ASSERTIVE region so it interrupts and is heard immediately.
const timerAnnounce = ref('')        // polite: 30s / 10s
const timerAnnounceUrgent = ref('')  // assertive: 5s
watch(qTimer, (v, prev) => {
  const qn = idx.value + 1
  if (prev > 30 && v <= 30)      timerAnnounce.value = `30 seconds remaining for question ${qn}`
  else if (prev > 10 && v <= 10) timerAnnounce.value = `10 seconds remaining for question ${qn}`
  else if (prev > 5  && v <= 5)  timerAnnounceUrgent.value = `5 seconds remaining for question ${qn}`
})

// ── Keyboard option highlight (ArrowUp / ArrowDown) ───────────────────────
const highlightedOpt = ref<string | null>(null)
watch(idx, () => { highlightedOpt.value = null })

// Skip wrapper — clear the keyboard/hover highlight BEFORE skipping. skip()
// itself is correct, but on the last question goNext() doesn't change idx, so
// the watch(idx) clearer above never fires and the highlighted option would
// keep reading as "selected". Clearing here covers every skip path.
function handleSkip() {
  highlightedOpt.value = null
  skip()
}

function optClass(letter: string): string {
  const ch = chosen.value[current.value.id]
  if (ch === letter) return 'sel'
  if (highlightedOpt.value === letter && !isGraded(result.value[current.value.id])) return 'kb-focus'
  return ''
}

// Wrapper: any user action that implies "engaging with a question" should
// auto-resume the timer if it was paused. Used by option clicks and dot
// clicks below.
function autoResume() {
  if (paused.value) paused.value = false
}

// Option click — resume timer (if paused), then forward to useSession.choose.
function pickOption(letter: string) {
  autoResume()
  choose(letter)
}

// Dot click — resume timer (if paused), then jump to that question.
function goToQuestion(n: number) {
  autoResume()
  idx.value = n - 1
}
function dotClass(state: string): string {
  if (state === 'current')   return 'd-cur'
  if (state === 'correct')   return 'd-ok'
  if (state === 'incorrect') return 'd-bad'
  if (state === 'skipped')   return 'd-skip'
  return ''
}

// Difficulty helpers — colour class + display label come from the raw
// backend value (foundation/intermediate/advanced OR easy/medium/hard).
function diffClass(d: string): string {
  const v = String(d || '').toLowerCase()
  if (v === 'easy' || v === 'foundation') return 'qtag-easy'
  if (v === 'hard' || v === 'advanced')   return 'qtag-hard'
  if (v === 'expert')                     return 'qtag-expert'
  return 'qtag-medium'   // intermediate / medium / anything unknown
}
function diffLabel(d: string): string {
  const v = String(d || '').trim()
  if (!v) return ''
  const map: Record<string, string> = {
    easy: 'Foundation', medium: 'Intermediate', hard: 'Advanced',
    foundation: 'Foundation', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert',
  }
  if (map[v.toLowerCase()]) return map[v.toLowerCase()]
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()
}

// Keyboard
const handleKey = (e: KeyboardEvent) => {
  if (showExit.value || showLabs.value || showCalc.value || showFeedback.value) return
  if (e.key === ' ') { e.preventDefault(); paused.value = !paused.value }
  if (e.key === 'ArrowRight') handleNext()
  if (e.key === 'f' || e.key === 'F') toggleFlag()
  // No hint shortcut in timed mode — timed is exam-like (hints live in tutor mode only).
  if (e.key === 's' || e.key === 'S') { if (!isGraded(result.value[current.value.id])) handleSkip() }

  // ArrowUp / ArrowDown: cycle highlight through options (only before answering;
  // a skipped question is not graded, so it still accepts input on revisit)
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isGraded(result.value[current.value?.id])) {
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

  // Enter: commit highlighted option
  if (e.key === 'Enter' && highlightedOpt.value && !isGraded(result.value[current.value.id])) {
    const letter = highlightedOpt.value
    highlightedOpt.value = null
    pickOption(letter)
    return
  }

  const letters = ['a','b','c','d','e']
  if (letters.includes(e.key.toLowerCase()) && !isGraded(result.value[current.value.id])) {
    highlightedOpt.value = null
    pickOption(e.key.toUpperCase())
  }
}
onMounted(() => window.addEventListener('keydown', handleKey))
onUnmounted(() => window.removeEventListener('keydown', handleKey))

// Calculator
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
  <!-- Loading skeleton — covers:
       • `loading`  (fresh fetchQuestions)
       • `resuming` (loadSession in flight on Resume)
       • `saving`   (Save & Exit / Submit & Exit submitted — flushing
                     PATCHes + complete + navigation) -->
  <!-- Bypass Blocks (WCAG 2.4.1): skip the runner topbar/progress to the question. -->
  <a href="#main-content" class="skip-link">Skip to content</a>
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
    <div style="font-size:1rem;font-weight:700;color:var(--rose)">Couldn't load this session</div>
    <div style="font-size:0.82rem;color:var(--ink-dim);max-width:420px">The session may have been removed, or the network request failed. Try again from Past Sessions.</div>
    <NuxtLink to="/student/past" style="margin-top:8px;color:var(--teal);text-decoration:underline">← Back to Past Sessions</NuxtLink>
  </div>

  <div v-else-if="fetchError" style="display:flex;align-items:center;justify-content:center;min-height:100dvh;flex-direction:column;gap:14px;font-family:'Figtree',sans-serif;padding:30px;text-align:center">
    <div style="font-size:1rem;font-weight:700;color:var(--rose)">Couldn't load questions</div>
    <div style="font-size:0.82rem;color:var(--ink-dim);max-width:420px">{{ fetchError }}</div>
    <NuxtLink to="/student/qbank" style="margin-top:8px;color:var(--teal);text-decoration:underline">← Back to Question Bank</NuxtLink>
  </div>
  <div v-else-if="!current" style="display:flex;align-items:center;justify-content:center;min-height:100dvh;flex-direction:column;gap:14px;font-family:'Figtree',sans-serif;padding:30px;text-align:center">
    <div style="font-size:1rem;font-weight:700;color:var(--ink)">No questions available</div>
    <div style="font-size:0.82rem;color:var(--ink-dim);max-width:420px">There are no questions in this exam yet. Try a different exam or adjust your filters.</div>
    <NuxtLink to="/student/qbank" style="margin-top:8px;color:var(--teal);text-decoration:underline">← Back to Question Bank</NuxtLink>
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
    <!-- Timed Mode tag — teal (different from tutor's purple) -->
    <div class="tb-tag" style="color:var(--teal-mid);background:var(--teal-pale);border-color:var(--teal-border)">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Timed Mode
    </div>
    <!-- Session timer (click to pause/resume — pauses BOTH the session
         timer and the per-question timer; click again to resume from the
         exact paused value). -->
    <button type="button" class="tb-timer" :class="{ paused }" @click="paused = !paused" :title="paused ? 'Click to resume' : 'Click to pause'" :aria-label="paused ? 'Resume timer' : 'Pause timer'">
      <!-- Clock icon when running, play icon when paused -->
      <svg v-if="!paused" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      {{ formatTime(secs) }}
    </button>
    <!-- Progress -->
    <div class="tb-prog">
      <span class="tb-count">{{ idx + 1 }} / {{ total }}</span>
      <div class="tb-track"><div class="tb-fill" :style="{ width: ((idx+1)/total*100)+'%' }"></div></div>
    </div>
    <!-- Dots -->
    <div class="tb-dots" ref="dotsRef" @wheel="onDotsWheel">
      <button type="button" v-for="p in progress" :key="p.n" class="tb-dot" :class="dotClass(p.state)" :aria-current="p.state === 'current' ? 'true' : undefined" :title="`Q${p.n}`" @click="goToQuestion(p.n)" :aria-label="`Question ${p.n}`">{{ p.n }}</button>
    </div>
    <!-- Mobile-only collapse control: compact pill that toggles the question
         grid (the inline .tb-dots row is hidden on phones). -->
    <button type="button" class="tb-navtoggle" :aria-expanded="navOpen" @click="navOpen = !navOpen">
      <span>Q{{ idx + 1 }} <span class="tb-navtoggle-of">of</span> {{ total }}</span>
      <svg class="tb-navchev" :class="{ open: navOpen }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <!-- Right controls -->
    <div class="tb-right">
      <!-- Layout toggle -->
      <button type="button" class="layout-btn" :class="{ 'single-active': isSingle }" @click="isSingle = !isSingle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <template v-if="!isSingle"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/></template>
          <template v-else><rect x="3" y="3" width="18" height="18" rx="1"/></template>
        </svg>
        {{ isSingle ? 'Single' : 'Split' }}
      </button>
      <div class="tb-sep"></div>
      <!-- Labs: flask icon + label -->
      <button type="button" class="ib" title="Reference lab values" @click="showLabs = true">
        <SessionIconLabs />
        <span class="ib-label">Labs</span>
      </button>
      <!-- Calculator -->
      <button type="button" class="ib ib-sq" title="Calculator" @click="showCalc = true" aria-label="Calculator">
        <SessionIconCalc />
      </button>
      <!-- Flag -->
      <button type="button" class="ib ib-sq" :class="{ on: flagged[current.id] }" title="Flag (F)" @click="toggleFlag()" :aria-label="flagged[current.id] ? 'Unflag question' : 'Flag question'">
        <SessionIconFlag />
      </button>
      <!-- Dark mode -->
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
      <button type="button" v-for="p in progress" :key="p.n" class="tb-dot" :class="dotClass(p.state)" :aria-current="p.state === 'current' ? 'true' : undefined" @click="goToQuestion(p.n); navOpen = false" :aria-label="`Question ${p.n}`">{{ p.n }}</button>
    </div>
  </div>

  <!-- ══ SESSION BODY ══ -->
  <div class="s-body" id="main-content" tabindex="-1">

    <!-- ── PAUSE OVERLAY ────────────────────────────────────────────────────
         Added back — the "overlay removed" comment referred to an older
         approach. Both the session timer and the per-question countdown are
         paused when this shows. Clicking anywhere or pressing Space resumes.
    ──────────────────────────────────────────────────────────────────────── -->
    <Transition name="pause-fade">
      <div v-if="paused" class="pause-overlay" @click="paused = false">
        <div class="pause-card">
          <div class="pause-icon-ring">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1"/>
              <rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
          </div>
          <div class="pause-title">Session Paused</div>
          <div class="pause-sub">Timer stopped · Question hidden</div>
          <button type="button" class="pause-resume-btn" @click.stop="paused = false">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Resume Session
          </button>
          <div class="pause-hint">or press <kbd>Space</kbd></div>
        </div>
      </div>
    </Transition>

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
              <!-- Difficulty badge — shows the raw backend value verbatim. -->
              <span class="qtag" :class="diffClass(current.diff)">
                {{ diffLabel(current.diff) }}
              </span>
            </div>
            <!-- Per-question countdown -->
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              <div style="display:flex;align-items:center;gap:4px;font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.72rem;font-weight:700;" :style="{ color: timerColor }"
                   role="timer" :aria-label="`${qTimer} seconds remaining for this question`">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" :stroke="timerColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {{ qTimer }}s
              </div>
              <div style="width:60px;height:4px;background:var(--border);border-radius:2px;overflow:hidden"
                   role="progressbar" :aria-valuenow="qTimer" aria-valuemin="0" :aria-valuemax="timerPerQ" :aria-label="`Time remaining ${qTimer} of ${timerPerQ} seconds`">
                <div style="height:100%;border-radius:2px;transition:width 1s linear" :style="{ width: timerPct+'%', background: timerColor }"></div>
              </div>
              <!-- Screen-reader-only countdown warnings, announced at thresholds
                   (30/10/5s) so the per-second timer doesn't spam the reader.
                   Two regions: polite for 30/10s, assertive for the final 5s. -->
              <span aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap">{{ timerAnnounce }}</span>
              <span aria-live="assertive" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap">{{ timerAnnounceUrgent }}</span>
            </div>
          </div>
          <div v-if="current.vig && current.vig !== current.q" class="stem-text" v-html="sanitizeHtml(current.vig)"></div>
          <div class="stem-question" v-html="sanitizeHtml(current.q)"></div>

          <!-- Question image (only when a real http(s) URL is present) -->
          <div v-if="isImageUrl(current.img)" class="qc-question-image qc-question-image--student-timed">
            <img :src="current.img" alt="Question image" loading="lazy" />
          </div>

          <!-- No hint in timed mode — exam-like, hints are tutor-mode only. -->

          <!-- Single mode: options inside -->
          <template v-if="isSingle">
            <div style="padding:14px 18px;border-top:1px solid var(--border)">
              <div class="opts-label">Select your answer</div>
              <button type="button" v-for="opt in current.opts" :key="opt.l" class="opt" :class="optClass(opt.l)" @click="pickOption(opt.l)" :aria-pressed="chosen[current.id] === opt.l">
                <div class="opt-fill"></div>
                <div class="opt-content">
                  <div class="oltr">{{ opt.l }}</div>
                  <span>{{ opt.t }}</span>
                </div>
                <template v-if="isGraded(result[current.id])">
                  <div class="opt-stat">
                    <div class="opt-pct">{{ current.optionStats?.[opt.id] ?? '—' }}</div>
                    <div class="opt-n">peers</div>
                  </div>
                </template>
              </button>
            </div>

            <!-- Single-col explanation — shown after answer is graded. Skipped
                 is NOT graded, so a revisited skipped question stays blank
                 (no verdict, no answer reveal) until it's actually answered. -->
            <div v-if="isGraded(result[current.id])" class="exp-single" ref="expSingleEl">
              <div class="exp-box">
                <div class="exp-inner">
                  <div class="exp-verdict" :class="result[current.id] === 'correct' ? 'ok' : 'bad'">
                    <div class="v-icon">
                      <svg v-if="result[current.id]==='correct'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </div>
                    <div>
                      <div class="v-label">{{ result[current.id] === 'correct' ? 'Correct' : result[current.id] === 'skipped' ? 'Skipped' : 'Incorrect' }}</div>
                      <div v-if="result[current.id] === 'incorrect'" class="v-sub">Correct answer: {{ current.ans }}</div>
                    </div>
                  </div>
                  <div class="sec-lbl">Explanation</div>
                  <div class="exp-body" v-html="sanitizeHtml(current.exp)"></div>
                  <div v-if="current.kp" class="key-pt">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    {{ current.kp }}
                  </div>
                </div>
              </div>
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
        <button type="button" v-for="opt in current.opts" :key="opt.l" class="opt anim-o" :class="optClass(opt.l)" @click="pickOption(opt.l)" :aria-pressed="chosen[current.id] === opt.l">
          <div class="opt-fill"></div>
          <div class="opt-content">
            <div class="oltr">{{ opt.l }}</div>
            <span>{{ opt.t }}</span>
          </div>
          <template v-if="isGraded(result[current.id])">
            <div class="opt-stat">
              <div class="opt-pct">{{ current.optionStats?.[opt.id] ?? '—' }}</div>
              <div class="opt-n">peers</div>
            </div>
          </template>
        </button>
      </div>
    </div>
  </div>

  <!-- ══ ACTION BAR ══ -->
  <div class="q-actions">
    <!-- FIX: truly disabled at Q1 — not just opacity trick -->
    <button type="button" class="btn" :disabled="idx === 0" @click="goPrev">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      Previous
    </button>
    <div class="sp"></div>
    <!-- Skip is hidden once the question is GRADED (prevents overwriting a real
         correct/incorrect answer with 'skipped'). A skipped question is not
         graded, so Skip stays available on a revisit. -->
    <button type="button" v-if="!isGraded(result[current.id])" class="btn" @click="handleSkip">Skip <span class="kbd">S</span></button>
    <!-- Next is always enabled in timed mode: clicking without a chosen option
         behaves like Skip (matches the tutor flow). handleNext() auto-grades
         the answer if one was selected, or marks skipped otherwise. -->
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
          <div class="m-title">Save &amp; Exit Session</div>
          <button type="button" class="m-close" @click="showExit=false" aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="m-body">
          <div class="m-stats">
            <div class="m-stat"><div class="m-sv">{{ answered }}</div><div class="m-sl">Answered</div></div>
            <div class="m-stat"><div class="m-sv">{{ total - answered }}</div><div class="m-sl">Remaining</div></div>
            <div class="m-stat"><div class="m-sv" style="color:var(--teal)">{{ answered > 0 ? score+'%' : '—' }}</div><div class="m-sl">Score so far</div></div>
          </div>

          <div class="exit-options">
            <!-- Option 1: Save & resume later -->
            <div class="exit-opt">
              <div class="exit-opt-icon" style="background:color-mix(in srgb,var(--teal) 10%,transparent);color:var(--teal)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              </div>
              <div class="exit-opt-body">
                <div class="exit-opt-title">Save for Later</div>
                <div class="exit-opt-desc">Keeps session open. Resume anytime from Past Sessions — remaining questions stay unanswered.</div>
              </div>
              <button type="button" class="btn exit-opt-btn" @click="saveAndExit">Save</button>
            </div>

            <!-- Option 2: Submit partial session and view score now -->
            <div class="exit-opt exit-opt-submit">
              <div class="exit-opt-icon" style="background:color-mix(in srgb,var(--purple,#7c3aed) 10%,transparent);color:var(--purple,#7c3aed)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              </div>
              <div class="exit-opt-body">
                <div class="exit-opt-title">Submit &amp; Score</div>
                <div class="exit-opt-desc">Marks remaining {{ total - answered }} question{{ total - answered === 1 ? '' : 's' }} as skipped and shows your partial score with full explanations.</div>
              </div>
              <button type="button" class="btn btn-primary exit-opt-btn" @click="submitAll">Submit</button>
            </div>
          </div>

          <div class="m-btns" style="border-top:1px solid var(--border);padding-top:12px;margin-top:0">
            <button type="button" class="btn" style="width:100%;justify-content:center" @click="showExit=false">Keep going</button>
          </div>
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
          <div class="labs-note">ℹ These are standard reference ranges. Patient-specific results may be adjusted based on local laboratory calibration, age, sex, and clinical context.</div>
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

  </template><!-- /v-else (questions loaded successfully) -->

  <!-- ══ QUESTION FEEDBACK MODAL (ported from tutor.vue) ══ -->
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
</template>

<style>
/* ── Skeleton (loading) ───────────────────────────────────────────────── */
.sk-runner{display:flex;flex-direction:column;height:100dvh;background:var(--bg, #f7f8fa);font-family:'Figtree',sans-serif}
.sk-bar{display:flex;align-items:center;padding:10px 18px;border-bottom:1px solid var(--border, #e5e7eb);background:var(--white, #fff);gap:8px;min-height:48px}
.sk-body{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:24px;overflow:hidden}
.sk-q-panel,.sk-a-panel{background:var(--white, #fff);border:1px solid var(--border, #e5e7eb);border-radius:10px;padding:20px;overflow:hidden}
.sk-pulse{background:var(--surface-2, #e5e7eb);animation:skPulse 1.2s ease-in-out infinite;display:block}
@keyframes skPulse{0%,100%{opacity:0.85}50%{opacity:0.5}}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root {
  /* Navy palette (admin-aligned) */
  --navy:        #0f1f2e;
  --navy-mid:    #1a3548;
  --navy-light:  #233d54;
  /* Ink */
  --ink:         #0f1f2e;
  --ink-mid:     #374f65;
  --ink-dim:     #7a95ad;
  --ink-faint:   #b8cdd9;
  /* Teal */
  --teal:        #06b6d4;
  --teal-mid:    #0891b2;
  --teal-dark:   #0369a1;
  --teal-light:  #e0f9fd;
  --teal-pale:   #f0feff;
  --teal-border: #67e8f9;
  /* Yellow / Amber */
  --yellow:      #f5c400;
  --yellow-mid:  #d4a800;
  --yellow-pale: #fefce8;
  --amber:       #d97706;
  --amber-pale:  #fffbeb;
  --amber-light: #fef9c3;
  /* Green */
  --green:       #16a34a;
  --green-light: #dcfce7;
  /* Rose / Red */
  --rose:        #e11d48;
  --rose-light:  #fff1f2;
  --red:         #dc2626;
  --red-light:   #fee2e2;
  /* Surfaces */
  --surface:     #f7fbfd;
  --surface-hi:  #eef6fa;
  --border:      #e2edf4;
  --border-hi:   #c8dce8;
  --white:       #ffffff;
  --bg:          #ffffff;
  /* Shadows (teal-tinted, admin-aligned) */
  --shadow-sm:   0 1px 4px rgba(6,182,212,0.1),0 2px 14px rgba(0,0,0,0.06);
  --shadow:      0 4px 22px rgba(6,182,212,0.13),0 10px 36px rgba(0,0,0,0.07);
  --shadow-lg:   0 14px 52px rgba(6,182,212,0.16),0 28px 72px rgba(0,0,0,0.09);
  --shadow-teal: 0 8px 32px rgba(6,182,212,0.38);
  /* Radii (admin-aligned) */
  --r-sm:        8px;
  --r:           14px;
  --r-lg:        22px;
  --r-xl:        32px;
  /* Layout */
  --sidebar-w:   260px;
  /* Dark mode vars */
  --dm-bg:       #090f1a;
  --dm-surface:  #0c1825;
  --dm-card:     #0f1f2e;
  --dm-border:   #1a3045;
  --dm-ink:      #e2edf4;
  --dm-ink-mid:  #8aafc8;
  --dm-ink-dim:  #506a82;
  /* Purple accent (mock exams, sponsored content) */
  --purple:        #7c3aed;
  --purple-light:  #f5f3ff;
  --purple-border: #ddd6fe;
}
body.dark {
  --surface:     var(--dm-bg);
  --surface-hi:  var(--dm-surface);
  --white:       var(--dm-card);
  --bg:          var(--dm-bg);
  --border:      var(--dm-border);
  --border-hi:   #1a3045;
  --ink:         var(--dm-ink);
  --ink-mid:     var(--dm-ink-mid);
  --ink-dim:     var(--dm-ink-mid);
  --ink-faint:   var(--dm-ink-dim);
  --teal-pale:   rgba(6,182,212,0.08);
  --teal-border: rgba(6,182,212,0.25);
  --green-light: rgba(22,163,74,0.15);
  --rose-light:  rgba(225,29,72,0.15);
  --red-light:   rgba(220,38,38,0.15);
  --yellow-pale: rgba(245,196,0,0.12);
  --amber-pale:  rgba(217,119,6,0.12);
  --amber-light: rgba(217,119,6,0.15);
  --purple-light:  rgba(124,58,237,0.12);
  --purple-border: rgba(124,58,237,0.25);
}
html,body{height:100%;width:100%;font-family:'Figtree',sans-serif;background:var(--surface);color:var(--ink);overflow:hidden;transition:background 0.3s,color 0.3s}
/* === tutor === */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
/* vars: see global :root above */
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
.topbar h1{font-family:'Figtree',sans-serif !important;font-size:1rem;font-weight:700;color:var(--ink)}
.tb-logo{display:flex;align-items:center;flex-shrink:0;color:var(--ink)}
.tb-sep{width:1px;height:20px;background:var(--border);flex-shrink:0}
.tb-tag{display:flex;align-items:center;gap:5px;font-size:0.63rem;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--purple);padding:3px 9px;border-radius:20px;background:var(--purple-light);border:1px solid var(--purple-border);flex-shrink:0}
.tb-timer{display:flex;align-items:center;gap:5px;font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.79rem;font-weight:700;color:var(--ink-mid);padding:4px 10px;border-radius:7px;border:1.5px solid var(--border);background:var(--white);cursor:pointer;transition:all 0.14s;flex-shrink:0}
.tb-timer:hover{border-color:var(--teal-border);color:var(--teal)}
.tb-timer.paused{opacity:0.5}

/* ── PAUSE OVERLAY (same as tutor.vue) ── */
.s-body{position:relative}
.pause-overlay{position:absolute;inset:0;z-index:50;background:rgba(15,31,46,0.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;cursor:pointer}
.pause-card{display:flex;flex-direction:column;align-items:center;gap:10px;background:var(--white);border-radius:18px;padding:36px 44px 30px;box-shadow:0 24px 60px rgba(0,0,0,0.28);pointer-events:none}
.pause-icon-ring{width:60px;height:60px;border-radius:50%;background:color-mix(in srgb,var(--purple,#7c3aed) 12%,transparent);border:2px solid color-mix(in srgb,var(--purple,#7c3aed) 30%,transparent);display:flex;align-items:center;justify-content:center;color:var(--purple,#7c3aed);margin-bottom:4px}
.pause-title{font-size:1.1rem;font-weight:800;color:var(--ink)}
.pause-sub{font-size:0.75rem;color:var(--ink-dim);margin-bottom:6px}
.pause-resume-btn{pointer-events:all;display:inline-flex;align-items:center;gap:8px;background:var(--purple,#7c3aed);color:#fff;border:none;padding:10px 24px;border-radius:10px;font-family:'Figtree',sans-serif;font-size:0.82rem;font-weight:700;cursor:pointer;transition:background 0.14s;margin-top:4px}
.pause-resume-btn:hover{filter:brightness(1.1)}
.pause-hint{font-size:0.65rem;color:var(--ink-faint);margin-top:2px}
.pause-hint kbd{font-family:'JetBrains Mono',monospace;font-size:0.62rem;border:1px solid var(--border);border-radius:4px;padding:1px 5px;color:var(--ink-dim);background:var(--surface)}
.pause-fade-enter-active,.pause-fade-leave-active{transition:opacity 0.18s ease}
.pause-fade-enter-from,.pause-fade-leave-to{opacity:0}
.tb-prog{display:flex;align-items:center;gap:8px;flex-shrink:0}
.tb-count{font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.69rem;font-weight:700;color:var(--ink-dim);white-space:nowrap}
.tb-track{width:120px;height:5px;background:var(--border);border-radius:3px;overflow:hidden}
.tb-fill{height:100%;background:linear-gradient(90deg,var(--teal-dark),var(--teal));border-radius:3px;transition:width 0.5s cubic-bezier(0.16,1,0.3,1)}
.tb-dots{
  display:flex;gap:3px;overflow-x:auto;flex:1;min-width:0;padding:2px 0 6px;
  /* Soft fade on left + right edges to indicate scrollability when the row
     overflows (e.g. 120-question sessions). */
  mask-image: linear-gradient(to right, transparent 0, black 14px, black calc(100% - 14px), transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0, black 14px, black calc(100% - 14px), transparent 100%);
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: rgba(100, 116, 139, 0.35) transparent;
}
.tb-dots::-webkit-scrollbar { height: 6px; }
.tb-dots::-webkit-scrollbar-track { background: transparent; }
.tb-dots::-webkit-scrollbar-thumb {
  background: rgba(100, 116, 139, 0.35);
  border-radius: 3px;
}
.tb-dots::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.6); }
/* Mobile question-navigator collapse control — hidden on desktop (the inline
   .tb-dots row is shown instead); enabled in the max-width:768px block. */
.tb-navtoggle{display:none}
.tb-navbackdrop{display:none}
.tb-navpanel{display:none}
.tb-dot{width:26px;height:26px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.6rem;font-weight:700;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-faint);cursor:pointer;transition:all 0.12s}
.tb-dot:hover{border-color:var(--teal-border);color:var(--teal-mid);background:var(--teal-pale)}
.tb-dot.d-cur{background:var(--teal);border-color:var(--teal);color:#fff;box-shadow:0 2px 7px rgba(6,182,212,0.3)}
.tb-dot.d-ok{background:var(--green-light);border-color:var(--green);color:var(--green)}
.tb-dot.d-bad{background:var(--rose-light);border-color:var(--rose);color:var(--rose)}
.tb-dot.d-skip{background:var(--amber-light);border-color:var(--amber);color:var(--amber)}
.tb-dot.d-flag{position:relative;background:var(--amber-light);border-color:var(--amber);color:var(--amber)}
.tb-right{display:flex;align-items:center;gap:6px;flex-shrink:0}
.ib{width:32px;height:32px;border-radius:7px;border:1.5px solid var(--border);background:var(--white);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink-dim);transition:all 0.14s;flex-shrink:0;font-family:'Figtree',sans-serif;font-size:0.64rem;font-weight:800;gap:4px;padding:0 8px;width:auto}
/* Dark mode: --border (#1a3045) blends into the .ib background (#0f1f2e), making
   the Labs / Calc buttons nearly invisible. Use a lighter border so they read. */
body.dark .ib{border-color:rgba(255,255,255,0.22)}
.ib:hover{border-color:var(--teal-border);color:var(--teal);background:var(--teal-pale)}
.ib.on{border-color:var(--amber);color:var(--amber);background:var(--amber-light)}
.ib-sq{width:32px;height:32px;padding:0;flex-shrink:0}
.dm-btn{width:32px;height:32px;border-radius:7px;border:1.5px solid var(--border);background:var(--white);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink-dim);position:relative;overflow:hidden;transition:all 0.2s}
.dm-btn svg{position:absolute;transition:opacity 0.2s,transform 0.3s cubic-bezier(0.34,1.56,0.64,1)}
.dm-btn .i-sun{opacity:1;transform:rotate(0deg) scale(1)}
.dm-btn .i-moon{opacity:0;transform:rotate(-90deg) scale(0.6)}
body.dark .dm-btn .i-sun{opacity:0;transform:rotate(90deg) scale(0.6)}
body.dark .dm-btn .i-moon{opacity:1;transform:rotate(0deg) scale(1)}
/* --ink flips to cream in dark mode → white text unreadable.
   --navy-mid (#1a3548) is not overridden in body.dark so it stays dark always. */
.btn-exit{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;font-family:'Figtree',sans-serif;font-size:0.72rem;font-weight:800;background:var(--navy-mid,#1a3548);color:#fff;border:none;cursor:pointer;transition:all 0.14s;white-space:nowrap}
.btn-exit:hover{background:var(--teal-dark,#0369a1);transform:translateY(-1px)}

/* ── BODY ── */
.s-body{display:flex;height:calc(100dvh - 52px);height:calc(100dvh - 52px);overflow:hidden}

/* ── SPLIT LAYOUT: true 50/50 ── */
.q-panel{flex:1;display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--border);min-width:0}
.a-panel{flex:1;display:flex;flex-direction:column;overflow:hidden;background:var(--surface);transition:background 0.3s}
/* ── SINGLE COLUMN LAYOUT ── */
body.single .s-body{flex-direction:column;overflow-y:auto}
body.single .s-body::-webkit-scrollbar{width:4px}
body.single .s-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
body.single .q-panel{border-right:none;flex:0 0 auto;overflow:visible}
body.single .q-panel .q-scroll{overflow:visible;padding-bottom:90px}
body.single .a-panel{flex:0 0 auto;background:transparent;border-top:1px solid var(--border)}
body.single .a-panel .a-scroll{overflow:visible;padding-top:20px;padding-bottom:100px}

/* ── FIXED ACTION BAR ── */
.q-actions{position:fixed;bottom:0;left:0;right:0;z-index:30;height:54px;padding:0 36px;background:var(--white);border-top:1px solid var(--border);display:flex;align-items:center;gap:9px;transition:background 0.3s,border-color 0.3s}

/* ── SCROLL AREAS ── */
.q-scroll{flex:1;overflow-y:auto;padding:28px 36px 80px}
.q-scroll::-webkit-scrollbar{width:4px}
.q-scroll::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
.a-scroll{flex:1;overflow-y:auto;padding:20px 36px 80px}
.a-scroll::-webkit-scrollbar{width:3px}
.a-scroll::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}

/* ── SINGLE COL: constrain width with padding ── */
body.single .q-scroll{padding-left:max(40px,calc(50vw - 380px));padding-right:max(40px,calc(50vw - 380px))}
body.single .a-scroll{padding-left:max(40px,calc(50vw - 380px));padding-right:max(40px,calc(50vw - 380px))}

/* ── TOPIC TAGS ── */
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
.q-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.stem-text{font-size:0.88rem;color:var(--ink-mid);line-height:1.76;padding:16px 18px 14px}
.stem-question{font-size:0.88rem;font-weight:800;color:var(--ink);padding:13px 18px 14px;line-height:1.5}
.stem-font-row{display:flex;gap:4px;flex-shrink:0}
.fnt-btn{width:22px;height:22px;border-radius:5px;border:1.5px solid var(--border);background:var(--white);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink-dim);font-size:0.68rem;font-weight:800;font-family:'Figtree',sans-serif;transition:all 0.12s}
.fnt-btn:hover{border-color:var(--teal-border);color:var(--teal)}
.sd-cell{display:flex;gap:5px;align-items:baseline;padding:4px 14px;border-right:1px solid var(--border)}
.sd-cell:first-child{padding-left:0}
.sd-cell:last-child{border-right:none}
.sd-k{color:var(--ink-faint);font-size:0.71rem;font-weight:600;white-space:nowrap}
.sd-v{color:var(--ink);font-size:0.71rem;font-weight:700;font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}

/* ── STEM FOOTER (feedback button) ── */
.stem-footer{display:flex;justify-content:flex-end;padding:8px 14px 10px;border-top:1px solid var(--border)}
.feedback-btn{display:inline-flex;align-items:center;gap:5px;font-size:0.62rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--ink-faint);background:none;border:1.5px solid var(--border);border-radius:20px;padding:3px 11px;cursor:pointer;transition:all 0.14s;font-family:'Figtree',sans-serif}
.feedback-btn:hover{border-color:var(--teal-border);color:var(--teal);background:var(--teal-pale)}

/* ── FEEDBACK MODAL ── */
#feedbackOverlay .modal-box{width:540px;max-width:94vw}
.fb-body{padding:0 22px 22px;display:flex;gap:24px}
.fb-left{width:110px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;padding-top:4px}
.fb-bulb{font-size:2.8rem;line-height:1;margin-bottom:8px}
.fb-left-title{font-family:'Figtree',sans-serif;font-size:0.88rem;font-weight:700;color:var(--ink);text-align:center;line-height:1.4}
.fb-right{flex:1;min-width:0}
.fb-section-lbl{font-size:0.58rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--ink-faint);margin-bottom:8px;margin-top:16px}
.fb-section-lbl:first-child{margin-top:0}
.fb-themes{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px}
.fb-theme{font-size:0.72rem;font-weight:700;padding:5px 12px;border-radius:20px;border:1.5px solid var(--border);background:var(--surface);color:var(--ink-mid);cursor:pointer;transition:all 0.13s;font-family:'Figtree',sans-serif}
.fb-theme:hover{border-color:var(--teal-border);color:var(--teal);background:var(--teal-pale)}
.fb-theme.sel{border-color:var(--teal);background:var(--teal);color:#fff}
.fb-textarea{width:100%;border:1.5px solid var(--border);border-radius:var(--r);background:var(--surface);color:var(--ink);font-family:'Figtree',sans-serif;font-size:0.79rem;padding:10px 12px;resize:vertical;min-height:90px;outline:none;transition:border-color 0.14s;line-height:1.55}
.fb-textarea:focus{border-color:var(--teal-border)}
.fb-textarea::placeholder{color:var(--ink-faint)}
.fb-actions{display:flex;justify-content:flex-end;gap:9px;padding:14px 22px 18px;border-top:1px solid var(--border)}
.fb-intro{font-size:0.78rem;color:var(--ink-mid);line-height:1.6;margin-top:6px}
/* Ported alongside the feedback modal (tutor.vue parity) */
.fb-left-desc{font-size:0.68rem;color:var(--ink-dim);line-height:1.55;text-align:center;margin-top:6px}
.fb-cancel-btn{padding:8px 20px;border-radius:8px;border:1.5px solid var(--border);background:var(--white);color:var(--ink-mid);font-family:'Figtree',sans-serif;font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.13s}
.fb-cancel-btn:hover{border-color:var(--ink-dim);color:var(--ink)}
.fb-submit-btn{padding:8px 22px;border-radius:8px;border:none;background:var(--teal);color:#fff;font-family:'Figtree',sans-serif;font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.13s}
.fb-submit-btn:hover:not(:disabled){background:var(--teal-mid)}
.fb-submit-btn:disabled{opacity:0.45;cursor:not-allowed}
@keyframes fadeSlide{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}

/* ── ACTION BAR (fixed, handled above) ── */
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
/* kb-focus: ArrowUp/Down keyboard highlight — distinct from mouse hover */
.opt.kb-focus{border-color:var(--teal-border);background:var(--teal-pale);color:var(--ink);outline:2px solid var(--teal);outline-offset:1px}
.opt.kb-focus .oltr{border-color:var(--teal);color:var(--teal)}
.opt.ok{border-color:var(--green);background:var(--white);color:var(--ink);cursor:default}
.opt.ok .oltr{background:var(--green);color:#fff;border-color:var(--green)}
.opt.bad{border-color:var(--rose);background:var(--white);color:var(--ink);cursor:default}
.opt.bad .oltr{background:var(--rose);color:#fff;border-color:var(--rose)}
.opt.neutral-ans{border-color:var(--border);background:var(--white);color:var(--ink-mid);cursor:default}
.opt.neutral-ans .oltr{color:var(--ink-dim)}
/* stat fill bar — sits at z-index 0 behind text */
.opt-fill{position:absolute;left:0;top:0;bottom:0;z-index:0;border-radius:calc(var(--r) - 2px);opacity:0.18;transition:width 0.6s cubic-bezier(0.16,1,0.3,1)}
.opt.ok .opt-fill{background:var(--green)}
.opt.bad .opt-fill{background:var(--rose)}
.opt.neutral-ans .opt-fill{background:#93c5fd}
/* text content above fill */
.opt-content{position:relative;z-index:1;display:flex;align-items:center;gap:11px;flex:1;min-width:0;font-size:0.88rem}
/* stat badge: % + attempts */
.opt-stat{position:relative;z-index:1;display:flex;flex-direction:column;align-items:flex-end;gap:1px;flex-shrink:0;margin-top:1px}
.opt-pct{font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.68rem;font-weight:700}
.opt.ok .opt-pct{color:var(--green)}
.opt.bad .opt-pct{color:var(--rose)}
.opt.neutral-ans .opt-pct{color:#3b82f6}
.opt-n{font-size:0.56rem;font-weight:600;color:var(--ink-faint);white-space:nowrap}
.oltr{width:27px;height:27px;border-radius:7px;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.68rem;font-weight:700;color:var(--ink-dim);background:var(--surface);transition:all 0.13s;margin-top:1px}
.o-icon{width:17px;height:17px;flex-shrink:0;margin-top:3px;margin-left:auto;display:none}
.opt.ok .o-icon,.opt.bad .o-icon{display:block}

/* ── EXPLANATION CARD ── */
.exp-card{display:none;background:var(--white);border:1px solid var(--border);border-radius:var(--r-lg);border-left:3px solid var(--teal);overflow:hidden;margin-top:16px;animation:fadeSlide 0.3s ease;transition:background 0.3s,border-color 0.3s}
.exp-card.open{display:block}
.exp-card .exp-inner{padding:20px 22px 22px}
/* Single column: hide split card, show inline card after options */
body.single .exp-card{display:none !important}
.exp-single{margin-top:14px;display:none}
body.single .exp-single{display:block}
.exp-box{background:var(--white);border:1px solid var(--border);border-radius:var(--r-lg);border-left:3px solid var(--teal);overflow:hidden;animation:fadeSlide 0.3s ease;transition:background 0.3s,border-color 0.3s}
.exp-box .exp-inner{padding:20px 22px 22px}
.exp-verdict{display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:var(--r);margin-bottom:12px}
.exp-verdict.ok{background:var(--green-light);border:1px solid var(--green-border)}
.exp-verdict.bad{background:var(--rose-light);border:1px solid var(--rose-border)}
.v-icon{width:29px;height:29px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.exp-verdict.ok .v-icon{background:var(--green)}
.exp-verdict.bad .v-icon{background:var(--rose)}
.v-label{font-size:0.79rem;font-weight:800}
.exp-verdict.ok .v-label{color:var(--green)}
.exp-verdict.bad .v-label{color:var(--rose)}
.v-sub{font-size:0.66rem;color:var(--ink-dim);margin-top:1px}
.exp-stats{display:flex;gap:6px;margin-bottom:12px}
.e-stat{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:8px;text-align:center}
.e-sv{font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.96rem;font-weight:700;color:var(--ink)}
.e-sl{font-size:0.56rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--ink-faint);margin-top:1px}
.sec-lbl{font-size:0.56rem;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--ink-faint);margin-bottom:7px;display:flex;align-items:center;gap:6px}
.sec-lbl::after{content:'';flex:1;height:1px;background:var(--border)}
.exp-body{font-size:0.88rem;color:var(--ink-mid);line-height:1.7;margin-bottom:12px}
.exp-body strong{color:var(--ink);font-weight:700}
.exp-body em{color:var(--teal-mid);font-style:normal;font-weight:700}
.key-pt{display:flex;gap:8px;align-items:flex-start;background:var(--teal-pale);border:1px solid var(--teal-border);border-radius:var(--r);padding:10px 12px;margin-bottom:12px;font-size:0.76rem;color:var(--ink-mid);line-height:1.55}
.key-pt svg{flex-shrink:0;color:var(--teal-mid);margin-top:2px}
.wrong-note{background:var(--rose-light);border:1px solid var(--rose-border);border-radius:var(--r);padding:9px 12px;margin-bottom:11px;font-size:0.76rem;color:var(--ink-mid);line-height:1.55}
.exp-tags{display:flex;flex-wrap:wrap;gap:5px}
.exp-tag{font-size:0.6rem;font-weight:700;padding:2px 7px;border-radius:7px;background:var(--teal-pale);color:var(--teal-mid);border:1px solid var(--teal-border)}

/* ── REVIEWER SECTION ── */
.rev-section{margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
.rev-list{display:flex;flex-direction:column;gap:9px;margin-top:8px}
.rev-row{display:flex;align-items:center;gap:10px}
.rev-avatar{width:32px;height:32px;border-radius:50%;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.62rem;font-weight:800;flex-shrink:0;font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;letter-spacing:0.5px}
.rev-avatar img{width:100%;height:100%;border-radius:50%;object-fit:cover}
.rev-name{font-size:0.76rem;font-weight:700;color:var(--ink)}
.rev-cred{font-size:0.63rem;font-weight:600;color:var(--teal-mid);margin-left:4px}
.rev-role{font-size:0.66rem;color:var(--ink-dim);margin-top:1px}
.rev-expert{display:inline-flex;align-items:center;gap:3px;font-size:0.6rem;font-weight:700;color:var(--teal-mid);background:var(--teal-pale);border:1px solid var(--teal-border);border-radius:20px;padding:1px 6px;margin-right:4px}
.rev-date{font-size:0.63rem;color:var(--ink-faint);margin-left:auto;flex-shrink:0}

/* ── MODAL OVERLAY ── */
.overlay{display:none;position:fixed;inset:0;background:rgba(15,31,46,0.52);z-index:200;align-items:center;justify-content:center;backdrop-filter:blur(3px)}
.overlay.open{display:flex}
.modal-box{background:var(--white);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:0 24px 64px rgba(15,31,46,0.18);overflow:hidden;transition:background 0.3s,border-color 0.3s}
/* Dark mode: lighter edge so the modal is clearly framed against the dark scrim. */
body.dark .modal-box{border-color:rgba(255,255,255,0.14)}

/* ── EXIT MODAL ── */
#exitOverlay .modal-box{width:400px;max-width:92vw}
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
.btn-warn{background:var(--amber);color:#0f1f2e;border-color:var(--amber)}
.btn-warn:hover:not(:disabled){background:#d97706;border-color:#d97706;color:#fff;transform:translateY(-1px)}
.m-btns-stacked{flex-direction:column;gap:8px}
.m-btns-stacked .btn{width:100%;justify-content:center}

/* ── Exit-modal two-option layout ── */
.exit-options{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
.exit-opt{display:flex;align-items:center;gap:12px;padding:12px 13px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface)}
.exit-opt-submit{border-color:color-mix(in srgb,var(--purple,#7c3aed) 30%,transparent);background:color-mix(in srgb,var(--purple,#7c3aed) 5%,transparent)}
.exit-opt-icon{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.exit-opt-body{flex:1;min-width:0}
.exit-opt-title{font-size:0.8rem;font-weight:700;color:var(--ink);margin-bottom:2px}
.exit-opt-desc{font-size:0.68rem;color:var(--ink-dim);line-height:1.45}
.exit-opt-btn{flex-shrink:0;padding:6px 14px;font-size:0.72rem}

/* ── LABS MODAL ── */
#labsOverlay .modal-box{width:560px;max-width:95vw;max-height:80dvh;display:flex;flex-direction:column;margin:auto}
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
.labs-table td.abnormal-high{color:var(--rose);font-weight:700}
.labs-table td.abnormal-low{color:var(--teal-mid);font-weight:700}
.labs-table tr:last-child td{border-bottom:none}
.labs-note{font-size:0.72rem;color:var(--ink-faint);margin-top:12px;padding:8px 12px;background:var(--surface);border-radius:var(--r);line-height:1.5}

/* ── CALCULATOR MODAL ── */
#calcOverlay .modal-box{width:300px;max-width:95vw}
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
.calc-btn.span2{grid-column:span 2}
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

/* ── TOAST ── */
.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(10px);background:var(--ink);color:#fff;padding:8px 18px;border-radius:22px;font-size:0.74rem;font-weight:700;opacity:0;pointer-events:none;z-index:999;transition:all 0.26s cubic-bezier(0.16,1,0.3,1);white-space:nowrap}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}

/* ── TIMED SPECIFIC ── */
.q-countdown{display:flex;align-items:center;gap:5px;font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.72rem;font-weight:700;flex-shrink:0}
.q-countdown-track{width:60px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;flex-shrink:0}
.q-countdown-fill{height:100%;border-radius:2px;transition:width 1s linear}


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
  /* Action bar (Previous/Skip/Next): the fixed bottom:0 bar tucked behind
     the mobile browser toolbar / home indicator, and its 36px side padding +
     keyboard-hint glyphs overflowed the narrow width, pushing Next/Submit off
     screen. Add the safe-area inset, trim padding, drop the touch-irrelevant
     keyboard hints, and let it grow so every button stays tappable. */
  .q-actions{
    height:auto;
    padding:8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
    gap:6px;
  }
  .q-actions .btn{padding-left:13px;padding-right:13px}
  .q-actions .kbd{display:none}
}
</style>
