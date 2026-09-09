<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Tutor Mode · Passmed' })

// layout:false — inject global student CSS manually (normally done by student.vue layout)
import studentCss from '~/assets/css/student.css?raw'
useHead({ style: [{ innerHTML: studentCss, id: 'student-css' }] })

const { closeMobile, isMobileOpen } = useSidebar()

// PERF FIX 1: Load Google Fonts asynchronously so they never block first paint.
// Previously the <link rel="stylesheet"> was injected via useHead() which adds
// a render-blocking element — browser stalls painting until font CSS downloads.
// Programmatic injection via onMounted() fires AFTER first paint so the page
// is immediately interactive while fonts swap in (using font-display:swap in
// the Figtree/JetBrains Mono CSS served by Google).
onMounted(() => {
  // Preconnect hints — establish TCP/TLS to font origin early (no blocking)
  const addLink = (attrs: Record<string, string>) => {
    const el = document.createElement('link')
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
    document.head.appendChild(el)
  }
  addLink({ rel: 'preconnect', href: 'https://fonts.googleapis.com' })
  addLink({ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' })
  // Non-blocking stylesheet — loads after paint, fonts swap in when ready
  addLink({
    rel:  'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap',
  })
})

const {
  current, total, idx, chosen, result, flagged, secs, submitted,
  questions, loading, fetchError,
  answered, score, progress, choose, submit, skip, goNext, goPrev, toggleFlag, reset, formatTime,
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

// Single-column: scroll explanation into view after submit.
// submitted flips true inside useSession.submit() — we can't call scrollIntoView
// from there (no DOM access). Watch here and let nextTick ensure the v-if
// block has mounted before we read its position.
watch(submitted, (val) => {
  if (!val || !isSingle.value) return
  nextTick(() => {
    expSingleEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
})

// A−/A+ font-size control — base 0.92rem, min 0.72rem, max 1.18rem, step 0.06rem
const FONT_SIZES = [0.72, 0.78, 0.84, 0.92, 1.00, 1.08, 1.18]
const fontIdx    = ref(3)  // default = index 3 → 0.92rem
const stemFontSize = computed(() => FONT_SIZES[fontIdx.value] + 'rem')
function fontDecrease() { if (fontIdx.value > 0) fontIdx.value-- }
function fontIncrease() { if (fontIdx.value < FONT_SIZES.length - 1) fontIdx.value++ }
const showLabs = ref(false)
const showCalc = ref(false)

// ── Question Feedback ────────────────────────────────────────────────────────
const showFeedback   = ref(false)
const fbThemes       = ['Good item', 'Too easy', 'Too hard', 'Not relevant', 'Out of date', 'Incorrect', 'Typo', 'Poorly worded', 'Other']
const fbSelected     = ref<string[]>([])
const fbComment      = ref('')
const fbSubmitting   = ref(false)
const fbDone         = ref(false)
const fbError        = ref('')

function openFeedback() { showFeedback.value = true; fbSelected.value = []; fbComment.value = ''; fbDone.value = false; fbError.value = '' }
function closeFeedback() { showFeedback.value = false }
function toggleFbTheme(t: string) {
  const i = fbSelected.value.indexOf(t)
  if (i === -1) fbSelected.value.push(t)
  else fbSelected.value.splice(i, 1)
}
async function submitFeedback() {
  // Comment is always required — a bare theme tag gives the team no actionable
  // detail. Themes themselves stay optional (categorise if you want, but the
  // written comment is what we act on).
  if (!fbComment.value.trim()) return
  fbSubmitting.value = true
  fbError.value = ''
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
  } catch (e: any) {
    // Surface the failure instead of swallowing it — the modal stays open with
    // the comment intact so the user can retry.
    fbError.value = e?.data?.msg || e?.data?.message || 'Couldn’t submit your feedback. Please try again.'
  }
  finally { fbSubmitting.value = false }
}
const paused   = ref(false)         // ← session-timer pause flag (click timer toggles)

// PERF FIX 3: Labs and Calc are large modals most users never open in a given
// session. Defining them as async components tells Vite to split them into
// separate JS chunks that are only downloaded + parsed on first click — they
// are completely absent from the initial tutor.vue bundle.
// calcExpr/calcVal/calcMem/calcAct/calcMemAct have also moved INTO
// SessionCalcModal.vue so the calculator logic no longer runs on boot.
const SessionLabsModal = defineAsyncComponent(() => import('~/components/SessionLabsModal.vue'))
const SessionCalcModal = defineAsyncComponent(() => import('~/components/SessionCalcModal.vue'))

// Ref to the scrollable progress-dots row so we can keep the active dot in
// view when the user navigates (e.g. Q33 → Q34 in a long session — without
// auto-scroll, the active dot can scroll off the visible edge).
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
    // Measure the active dot's position relative to the scroll container via
    // rects, NOT offsetLeft. The row isn't position:relative, so the dots'
    // offsetParent is an ancestor further up the topbar — offsetLeft then
    // includes the row's own ~800px offset (logo/mode/timer/progress before
    // it), overshooting and parking the row around Q16-26 no matter which
    // question is current. Rect math is independent of offsetParent.
    const cRect     = container.getBoundingClientRect()
    const aRect     = active.getBoundingClientRect()
    const dotLeft   = (aRect.left - cRect.left) + container.scrollLeft
    const center    = dotLeft + aRect.width / 2 - container.clientWidth / 2
    const maxScroll = container.scrollWidth - container.clientWidth
    const clamped   = Math.max(0, Math.min(maxScroll, center))
    container.scrollTo({ left: clamped, behavior: 'smooth' })
  }))
}

// Mouse wheel → horizontal scroll on the dots row. Without this, the wheel
// would either do nothing (if no vertical overflow on the row) or bubble up
// to scroll the page, neither of which is helpful here.
function onDotsWheel(e: WheelEvent) {
  if (!dotsRef.value) return
  if (e.deltaY === 0) return
  e.preventDefault()
  dotsRef.value.scrollLeft += e.deltaY
}

watch(() => idx.value, scrollActiveDotIntoView)
onMounted(() => { setTimeout(scrollActiveDotIntoView, 150) })

let timerInterval: ReturnType<typeof setInterval> | null = null
// resuming = true while loadSession() is in flight. Drives the skeleton so
// the "No questions available" message doesn't briefly flash between mount
// and the resume API resolving.
const resuming    = ref(false)
const resumeError = ref(false)   // set when loadSession returns null on resume attempt

// saving = true while the user has triggered Save & Exit / Submit & Review
// and we're waiting for in-flight PATCHes (chosen, result, q_time_spent…)
// to flush + completeSession to finish + navigation to fire. Drives the
// skeleton so the user sees a clear "session is being saved" state instead
// of the runner UI freezing mid-click.
const saving = ref(false)
// submitting = true only during the FINAL submit (finishAndReview). Drives a
// dedicated "Calculating your results…" screen instead of the generic skeleton.
const submitting = ref(false)

onMounted(async () => {
  // Two startup paths:
  //  (a) Resume — URL has ?session=<id>: loadSession() pulls the saved
  //      session AND rebuilds questions[], chosen[], result[], flagged[]
  //      from the backend session_questions rows. So after loadSession
  //      questions.value is already the EXACT set for this session, and
  //      we MUST NOT call fetchQuestions afterwards (it would replace the
  //      session's pinned questions with a fresh qbank fetch).
  //  (b) Fresh — qbank.vue already created the session row and populated
  //      useSession.questions before navigating here. URL has ?session=<id>
  //      and ?count=<n>. We only fall through to fetchQuestions if state
  //      is empty (e.g. hard reload of the runner page).
  const queryId = Number(route.query.session)
  const limit   = Number(route.query.count) || undefined
  const examId  = activeExam.value?.examId

  let resumed = false
  if (queryId) {
    resuming.value = true
    resumeError.value = false
    try {
      const data = await loadSession(queryId)
      if (data) {
        const savedIdx = data.current_index ?? 0
        idx.value  = Math.min(Math.max(0, savedIdx), Math.max(0, questions.value.length - 1))
        secs.value = data.elapsed_seconds ?? 0
        // Restore per-question time-spent so cumulative tracking continues
        // across resumes (otherwise the second resume would overwrite the
        // saved total instead of adding to it — data loss bug).
        const rows = data.session_questions || data.questions || []
        for (const row of rows) {
          if (typeof row.q_time_spent === 'number' && row.q_time_spent > 0) {
            qTimeMap.value[row.question_id] = row.q_time_spent
          }
        }
        resumed = true
      } else {
        // loadSession returned null — network blip, 5xx, or missing session.
        resumeError.value = true
      }
    } finally {
      resuming.value = false
    }
  }


  // Only refetch from qbank when there's NO session id in the URL. If a
  // session was requested (queryId set) — even if loadSession returned 0
  // questions — we must NOT fall back to a generic qbank fetch, because
  // that would replace the session's pinned questions with the wrong pool.
  if (!queryId && !questions.value.length) {
    await fetchQuestions({
      limit,
      examId: examId ? Number(examId) : undefined,
    })
  }

  // Hydrate the flag state for whatever question set we ended up with.
  // On RESUME, loadSession() already kicks off a background /flags hydration,
  // so calling it again here is a redundant (heavy) third round-trip — skip it.
  // Only the fresh-session path (qbank pinned the questions before navigating,
  // no loadSession) needs an explicit hydrate here.
  if (!resumed) hydrateFlaggedFromBackend()

  // Session-elapsed clock — respects `paused` so clicking the timer halts
  // both the elapsed counter and any interaction-sensitive UI in lockstep.
  timerInterval = setInterval(() => { if (!paused.value) secs.value++ }, 1000)
})

// ─── Per-question time tracking ────────────────────────────────────────────
// secs.value (gated by !paused) is the SESSION elapsed clock. qTimerStart
// holds its value at the moment the user entered the current question;
// `secs - qTimerStart` is what they spent on it. Accumulate into qTimeMap
// and send via syncQuestion so the DB has accurate per-Q timings.
const qTimerStart = ref(0)
const qTimeMap    = ref<Record<number, number>>({})

function captureElapsed(qid: number): number {
  const delta = Math.max(0, secs.value - qTimerStart.value)
  qTimeMap.value[qid] = (qTimeMap.value[qid] || 0) + delta
  qTimerStart.value = secs.value
  return qTimeMap.value[qid]
}

// ─── Backend sync watchers ─────────────────────────────────────────────────
// Sync each answer/skip the moment it's marked. Debounced inside useSession.
watch(result, (r) => {
  for (const q of questions.value) {
    const res = r[q.id]
    if (res && !syncedResults.value[q.id]) {
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

// Local cache to avoid re-syncing the same (qid → result) repeatedly.
const syncedResults = ref<Record<number, string>>({})

// Flag toggle sync removed — useSession.toggleFlag() now POSTs directly to
// /flags/review or /flags/unreview (question_flags table is the source of
// truth, not student_session_questions.flagged). Keeping a watcher here
// caused a duplicate sync + Postgres datatype mismatch (boolean column
// receiving integer 0 from JSON `false`).

// When the user navigates between questions, capture the time spent on the
// OUTGOING question and PATCH it. Reset the timer for the incoming Q.
watch(() => current.value?.id, (newId, oldId) => {
  if (oldId !== undefined && oldId !== null) {
    const spent = captureElapsed(oldId)
    syncQuestion(oldId, { q_time_spent: spent })
  } else {
    qTimerStart.value = secs.value
  }
  if (newId !== undefined && newId !== null) {
    qTimerStart.value = secs.value
  }
})

// Sync session-level position + elapsed when navigating questions.
watch(idx, (n) => { syncSession({ current_index: n, elapsed_seconds: secs.value }) })

// ─── Finish & navigate to Review ───────────────────────────────────────────
async function finishAndReview() {
  // Close the modal and immediately show the saving skeleton so the user
  // gets feedback that the session is being finalised (network can take a
  // second on slow connections).
  showExit.value = false
  saving.value   = true
  try {
    // Mark unanswered as skipped (client + backend) for accurate scoring.
    // Include q_time_spent so the breakdown shows non-zero time.
    for (const q of questions.value) {
      if (!result.value[q.id]) {
        result.value = { ...result.value, [q.id]: 'skipped' }
        const isCurrent = current.value?.id === q.id
        const spent = isCurrent ? captureElapsed(q.id) : (qTimeMap.value[q.id] || 0)
        syncQuestion(q.id, { result: 'skipped', q_time_spent: spent })
      }
    }
    // Final session-level sync (elapsed_seconds) before completing.
    await syncSession({ current_index: idx.value, elapsed_seconds: secs.value })
    // Dedicated results screen for the completeSession round-trip.
    submitting.value = true
    const id = await completeSession()
    if (id) navigateTo(`/student/review/${id}`)
    else    navigateTo('/student/past')
  } finally {
    // Keep `saving`/`submitting` true on navigation success too — the page
    // unmounts before this resets, which is fine. If we somehow stay on the
    // page (navigation error), allow further interaction.
    saving.value = false
    submitting.value = false
  }
}

// ─── Save & Exit (resume later) ────────────────────────────────────────────
// Leaves the session as `in_progress` so it shows up under Past Sessions
// with a Resume button. Does NOT auto-skip unanswered questions and does
// NOT call /complete. Only persists the latest position + any in-flight
// PATCHes (chosen answers, flags, q_timer).
async function saveAndExit() {
  // Close the modal and flip into saving mode immediately so the runner UI
  // swaps to the skeleton — user gets a clear "saving…" cue while the
  // backend PATCHes flush.
  showExit.value = false
  saving.value   = true
  try {
    // Capture time-spent on the CURRENT question — otherwise the seconds
    // accumulated since the last question switch are lost on exit.
    if (current.value) {
      const spent = captureElapsed(current.value.id)
      syncQuestion(current.value.id, { q_time_spent: spent })
    }
    // Persist current position + elapsed time. flushPendingSyncs awaits all
    // queued question PATCHes so no answer is lost in the debounce timer.
    await syncSession({ current_index: idx.value, elapsed_seconds: secs.value })
    await flushPendingSyncs()
    navigateTo('/student/past')
  } finally {
    saving.value = false
  }
}
onUnmounted(() => { if (timerInterval) clearInterval(timerInterval); document.body.classList.remove('single') })
watchEffect(() => { if (import.meta.client) document.body.classList.toggle('single', isSingle.value) })

// ── Keyboard option highlight (ArrowUp / ArrowDown) ───────────────────────
// Tracks which option letter is keyboard-focused before the user commits.
// Resets whenever the question changes so highlight never bleeds across Qs.
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

const handleKey = (e: KeyboardEvent) => {
  if (showExit.value || showLabs.value || showCalc.value || showFeedback.value) return
  if (e.key === ' ') { e.preventDefault(); paused.value = !paused.value }
  if (e.key === 's' || e.key === 'S') { if (!isGraded(result.value[current.value.id])) handleSkip() }

  // ArrowUp / ArrowDown: cycle highlight through options (only before answering;
  // skipped is not answered, so a revisited skipped question still accepts input)
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isGraded(result.value[current.value?.id])) {
    e.preventDefault()
    const opts  = current.value?.opts ?? []
    const count = opts.length
    if (!count) return
    // Seed from the current highlight, or — after a MOUSE pick with no active
    // highlight — from the chosen option, so Up/Down continues from the picked
    // answer and lets the student re-highlight to change it.
    const curIdx = highlightedOpt.value
      ? opts.findIndex(o => o.l === highlightedOpt.value)
      : opts.findIndex(o => o.l === chosen.value[current.value.id])
    const next = e.key === 'ArrowDown'
      ? (curIdx + 1) % count
      : (curIdx - 1 + count) % count
    highlightedOpt.value = opts[next].l
    return
  }

  // Enter: commit highlighted option OR go next if already submitted
  if (e.key === 'Enter') {
    if (!submitted.value && highlightedOpt.value) {
      pickOption(highlightedOpt.value)   // commit keyboard-highlighted option
    } else if (!submitted.value && chosen.value[current.value.id]) {
      submit()
    } else if (submitted.value) {
      goNext()
    }
    return
  }

  // Left / Right = pure navigation between questions (prev/next). Selecting an
  // answer is Up/Down (highlight) + Enter (commit/submit), so Right always
  // reliably advances and the top-bar dot-tracker (bound to idx) follows every
  // keyboard move. goPrev/goNext self-guard at the first/last question.
  if (e.key === 'ArrowRight') { goNext(); return }
  if (e.key === 'ArrowLeft')  { goPrev(); return }
  const letters = ['a','b','c','d','e']
  if (letters.includes(e.key.toLowerCase()) && !isGraded(result.value[current.value.id])) {
    // Letter key: directly select — also clear arrow highlight
    highlightedOpt.value = null
    pickOption(e.key.toUpperCase())
  }
}

// Wrappers (same pattern as timed.vue) — any user "engagement" action auto-resumes the timer.
function autoResume() { if (paused.value) paused.value = false }
function pickOption(letter: string) { autoResume(); choose(letter); highlightedOpt.value = null }
function goToQuestion(n: number) {
  autoResume()
  idx.value = n - 1
  // Mirror goPrev's behaviour: `submitted` must reflect whether the NEW
  // question already has a result. Otherwise dot-clicking from an answered
  // question to a fresh one leaves submitted=true → action bar wrongly
  // shows Next/Finish instead of Skip/Submit.
  const q = questions.value[idx.value]
  submitted.value = q ? isGraded(result.value[q.id]) : false
}
onMounted(() => window.addEventListener('keydown', handleKey))
onUnmounted(() => window.removeEventListener('keydown', handleKey))

function optClass(letter: string): string {
  const q = current.value; const ch = chosen.value[q.id]; const res = result.value[q.id]
  if (!isGraded(res)) {   // skipped counts as not-yet-graded → still selectable
    if (ch === letter) return 'sel'
    // kb-focus: ArrowUp/Down keyboard highlight (before committing)
    if (highlightedOpt.value === letter) return 'kb-focus'
    return ''
  }
  if (letter === q.ans) return 'ok'
  if (letter === ch && ch !== q.ans) return 'bad'
  return 'neutral-ans'
}
function dotClass(state: string): string {
  if (state === 'current')   return 'd-cur'
  if (state === 'correct')   return 'd-ok'
  if (state === 'incorrect') return 'd-bad'
  if (state === 'skipped')   return 'd-skip'
  return ''
}

// Difficulty helpers — colour class + display label derived from whatever
// the backend stored (foundation/intermediate/advanced OR easy/medium/hard).
// Two recognised "tiers" (low/mid/high) keep the green/amber/rose scheme
// consistent regardless of which vocabulary the catalogue uses.
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
  // Title-case the raw value so "foundation" → "Foundation",
  // "intermediate" → "Intermediate", "advanced" → "Advanced".
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()
}
// calcAct / calcMemAct removed — moved into SessionCalcModal.vue (async chunk)
</script>

<template>
  <!-- Loading skeleton — covers:
       • `loading`  (fresh fetchQuestions path)
       • `resuming` (loadSession in flight on Resume)
       • `saving`   (Save & Exit / Finish & Review submitted — flushing
                     PATCHes + complete + navigation)
       Without these flags, "No questions available" would briefly flash, or
       the runner UI would appear frozen during the save/exit pause. -->
  <!-- Bypass Blocks (WCAG 2.4.1): skip the runner topbar/progress to the question. -->
  <a href="#main-content" class="skip-link">Skip to content</a>
  <div v-if="submitting" class="sk-runner" style="align-items:center;justify-content:center">
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;padding:24px;font-family:'Figtree',sans-serif">
      <div style="display:flex;gap:7px">
        <span class="sk-pulse" style="width:11px;height:11px;border-radius:50%"></span>
        <span class="sk-pulse" style="width:11px;height:11px;border-radius:50%;animation-delay:0.15s"></span>
        <span class="sk-pulse" style="width:11px;height:11px;border-radius:50%;animation-delay:0.3s"></span>
      </div>
      <div style="font-size:1rem;font-weight:800;color:var(--ink)">Calculating your results…</div>
      <div style="font-size:0.82rem;color:var(--ink-dim)">Grading your answers and preparing your review.</div>
    </div>
  </div>

  <div v-else-if="loading || resuming || saving" class="sk-runner">
    <!-- topbar -->
    <div class="sk-bar">
      <div class="sk-pulse" style="width:74px;height:16px;border-radius:4px"></div>
      <div class="sk-pulse" style="width:84px;height:22px;border-radius:8px;margin-left:14px"></div>
      <div class="sk-pulse" style="width:54px;height:22px;border-radius:8px;margin-left:8px"></div>
      <div class="sk-pulse" style="flex:1;height:22px;border-radius:8px;margin:0 14px;max-width:520px"></div>
      <div class="sk-pulse" style="width:120px;height:22px;border-radius:8px;margin-left:auto"></div>
    </div>
    <!-- body: left question + right options -->
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
    <div class="tb-tag">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      Tutor Mode
    </div>
    <!-- Session timer — click to pause/resume (no popup; clicking any dot
         or option auto-resumes). -->
    <button type="button" class="tb-timer" :class="{ paused }" @click="paused = !paused" :title="paused ? 'Click to resume' : 'Click to pause'" :aria-label="paused ? 'Resume timer' : 'Pause timer'">
      <svg v-if="!paused" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      {{ formatTime(secs) }}
    </button>
    <div class="tb-prog">
      <span class="tb-count">{{ idx + 1 }} / {{ total }}</span>
      <div class="tb-track"><div class="tb-fill" :style="{ width: ((idx+1)/total*100)+'%' }"></div></div>
    </div>
    <div class="tb-dots" ref="dotsRef" @wheel="onDotsWheel">
      <button type="button" v-for="p in progress" :key="p.n" class="tb-dot" :class="[dotClass(p.state), { 'd-here': idx === p.n - 1 }]" :aria-current="idx === p.n - 1 ? 'true' : undefined" :title="`Q${p.n}`" @click="goToQuestion(p.n)" :aria-label="`Question ${p.n}`">{{ p.n }}</button>
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
      <!-- Flask icon + "Labs" label — replaces abstract shape that required hover to understand -->
      <button type="button" class="ib" title="Reference lab values" @click="showLabs = true">
        <SessionIconLabs />
        <span class="ib-label">Labs</span>
      </button>
      <button type="button" class="ib ib-sq" title="Calculator" @click="showCalc = true" aria-label="Calculator">
        <SessionIconCalc /> 
      </button>
      <button type="button" class="ib ib-sq" :class="{ on: flagged[current.id] }" title="Flag" @click="toggleFlag()" :aria-label="flagged[current.id] ? 'Unflag question' : 'Flag question'">
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
      <button type="button" v-for="p in progress" :key="p.n" class="tb-dot" :class="[dotClass(p.state), { 'd-here': idx === p.n - 1 }]" :aria-current="idx === p.n - 1 ? 'true' : undefined" @click="goToQuestion(p.n); navOpen = false" :aria-label="`Question ${p.n}`">{{ p.n }}</button>
    </div>
  </div>

  <!-- ══ SESSION BODY ══ -->
  <div class="s-body" id="main-content" tabindex="-1">

    <!-- ── PAUSE OVERLAY ────────────────────────────────────────────────────
         Covers the entire session area when paused=true.
         Question content stays in the DOM but is hidden by the overlay so
         students cannot read ahead. Clicking anywhere or pressing Space resumes.
         Comment from original: "no popup" — this replaces that with a proper
         full-body pause screen as requested.
    ──────────────────────────────────────────────────────────────────────── -->
    <Transition name="pause-fade">
      <div v-if="paused" class="pause-overlay" @click="paused = false">
        <div class="pause-card">
          <!-- Pause icon -->
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
              <!-- Difficulty badge — shows whatever the backend stored
                   (foundation / intermediate / advanced / easy / medium /
                   hard). Colour class is derived from the value so the
                   green/amber/rose scheme still makes sense. -->
              <span class="qtag" :class="diffClass(current.diff)">
                {{ diffLabel(current.diff) }}
              </span>
            </div>
            <div class="stem-font-row">
              <button type="button" class="fnt-btn" :class="{ disabled: fontIdx === 0 }" @click="fontDecrease">A−</button>
              <button type="button" class="fnt-btn" :class="{ disabled: fontIdx === FONT_SIZES.length - 1 }" @click="fontIncrease">A+</button>
            </div>
          </div>
          <div v-if="current.vig && current.vig !== current.q" class="stem-text" :style="{ fontSize: `calc(${stemFontSize} - 0.04rem)` }" v-html="sanitizeHtml(current.vig)"></div>
          <div class="stem-question" :style="{ fontSize: `calc(${stemFontSize} - 0.04rem)` }" v-html="sanitizeHtml(current.q)"></div>

          <!-- Question image (only when a real http(s) URL is present) -->
          <div v-if="isImageUrl(current.img)" class="qc-question-image qc-question-image--student-tutor">
            <img :src="current.img" alt="Question image" loading="lazy" />
          </div> 
          <!-- Single mode: options inside stem -->
          <template v-if="isSingle">
            <div style="padding:14px 18px;border-top:1px solid var(--border)">
              <div class="opts-label">Select your answer</div>
              <button type="button" v-for="opt in current.opts" :key="opt.l" class="opt" :class="optClass(opt.l)" @click="pickOption(opt.l)" :aria-pressed="chosen[current.id] === opt.l">
                <div class="opt-fill"  :style="{ width: (parseFloat(current.optionStats?.[opt.id]) || 0) + '%' }"></div>
                <div class="opt-content" :style="{ fontSize: `calc(${stemFontSize} - 0.04rem)` }">
                  <div class="oltr">{{ opt.l }}</div>
                  <span>{{ opt.t }}</span>
                </div>
                <!-- Show peer % when answered (either just submitted OR resumed from a prior session) -->
                <svg v-if="result[current.id] && optClass(opt.l) === 'ok'" class="opt-mark ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else-if="result[current.id] && optClass(opt.l) === 'bad'" class="opt-mark bad" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <template v-if="isGraded(result[current.id])">
                  <div class="opt-stat">
                    <div class="opt-pct">{{ current.optionStats?.[opt.id] ?? '—' }}</div>
                    <div class="opt-n">peers</div>
                  </div>
                </template>
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

        <!-- Explanation card -->
        <div class="exp-card" :class="{ open: submitted && !isSingle }">
          <div class="exp-inner">
            <!-- Verdict -->
            <div v-if="result[current.id]" class="exp-verdict" :class="result[current.id] === 'correct' ? 'ok' : 'bad'">
              <div class="v-icon">
                <svg v-if="result[current.id]==='correct'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </div>
              <div>
                <div class="v-label">{{ result[current.id] === 'correct' ? 'Correct' : 'Incorrect' }}</div>
                <div v-if="result[current.id] === 'incorrect'" class="v-sub">Correct answer: {{ current.ans }}</div>
              </div>
            </div>
            <!-- Stats -->
            <div class="exp-stats">
              <div class="e-stat"><div class="e-sv">{{ current.stats?.peers }}</div><div class="e-sl">Peers correct</div></div>
              <div class="e-stat"><div class="e-sv">{{ current.stats?.n }}</div><div class="e-sl">Attempts</div></div>
              <div class="e-stat"><div class="e-sv">{{ current.stats?.diff }}</div><div class="e-sl">Difficulty</div></div>
              <div v-if="current.user_attempts" class="e-stat"><div class="e-sv">{{ current.user_attempts }}</div><div class="e-sl">Your attempts</div></div>
            </div>
            <!-- Explanation -->
            <div class="sec-lbl">Explanation</div>
            <div class="exp-body" v-html="sanitizeHtml(current.exp)" :style="{ fontSize: `calc(${stemFontSize} - 0.04rem)` }"></div>
            <!-- Key point -->
            <div v-if="current.kp" class="key-pt">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              {{ current.kp }}
            </div>
            <!-- Wrong answers — only show if wr text exists for chosen option -->
            <template v-if="result[current.id] === 'incorrect' && chosen[current.id] && current.wr[chosen[current.id]]">
              <div class="sec-lbl">Why not {{ chosen[current.id] }}?</div>
              <div class="wrong-note">{{ current.wr[chosen[current.id]] }}</div>
            </template>
            <!-- Tags -->
            <div class="exp-tags">
              <span v-for="tag in current.tags" :key="tag" class="exp-tag">{{ tag }}</span>
            </div>
          </div>
        </div>

        <!-- Single col explanation -->
        <div v-if="isSingle && submitted" class="exp-single" ref="expSingleEl">
          <div class="exp-box">
            <div class="exp-inner">
              <div v-if="result[current.id]" class="exp-verdict" :class="result[current.id]==='correct'?'ok':'bad'">
                <div class="v-icon">
                  <svg v-if="result[current.id]==='correct'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </div>
                <div>
                  <div class="v-label">{{ result[current.id]==='correct'?'Correct':'Incorrect' }}</div>
                  <div v-if="result[current.id]==='incorrect'" class="v-sub">Correct answer: {{ current.ans }}</div>
                </div>
              </div>
              <div class="sec-lbl">Explanation</div>
              <div class="exp-body" v-html="sanitizeHtml(current.exp)" :style="{ fontSize: `calc(${stemFontSize} - 0.04rem)` }"></div>
              <div class="key-pt">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                {{ current.kp }}
              </div>
              <div class="exp-tags"><span v-for="tag in current.tags" :key="tag" class="exp-tag">{{ tag }}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT: Options (split only) -->
    <div v-if="!isSingle" class="a-panel">
      <div class="a-scroll">
        <div class="opts-label">Select your answer</div>
        <button type="button" v-for="opt in current.opts" :key="opt.l" class="opt anim-o" :class="optClass(opt.l)" @click="pickOption(opt.l)" :aria-pressed="chosen[current.id] === opt.l">
          <div class="opt-fill" :style="{ width: (parseFloat(current.optionStats?.[opt.id]) || 0) + '%' }"></div>
          <div class="opt-content" :style="{ fontSize: `calc(${stemFontSize} - 0.04rem)` }">
            <div class="oltr">{{ opt.l }}</div>
            <span>{{ opt.t }}</span>
          </div>
          <svg v-if="submitted && result[current.id] && optClass(opt.l) === 'ok'" class="opt-mark ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <svg v-else-if="submitted && result[current.id] && optClass(opt.l) === 'bad'" class="opt-mark bad" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          <template v-if="submitted && result[current.id]">
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
    <!-- FIX: disabled at idx===0 so the button is truly inert (not just faded).
         The opacity was a visual-only hint that didn't prevent click events.
         Browser-native disabled blocks all pointer events and keyboard focus. -->
    <button type="button" class="btn" :disabled="idx === 0" @click="goPrev">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      Previous
    </button>
    <div class="sp"></div>
    <!-- Show navigation (Next / Finish) whenever the current question has
         a result — either submitted OR skipped. Earlier this only checked
         `submitted`, so skipping the last question left the user stuck on
         Skip/Submit buttons with no way to reach Finish & Review. -->
    <!-- Ungraded (never answered OR skipped) → can still answer. `submitted` is
         now true only for a GRADED question, so a revisited skipped question
         shows Skip/Submit again instead of locking into Next/Finish. The
         last-question Finish escape stays so a skipped final question isn't a
         dead end. -->
    <template v-if="!submitted">
      <button type="button" v-if="idx < total - 1" class="btn" @click="handleSkip">Skip <span class="kbd">S</span></button>
      <button type="button" class="btn btn-primary" :disabled="!chosen[current.id]" @click="submit">
        Submit answer <span class="kbd">↵</span>
      </button>
      <button type="button" v-if="idx === total - 1" class="btn" @click="finishAndReview">Finish &amp; Review</button>
    </template>
    <template v-else>
      <button type="button" v-if="idx < total-1" class="btn btn-primary" @click="goNext">Next <span class="kbd">→</span></button>
      <button type="button" v-else class="btn btn-primary" @click="finishAndReview">Finish &amp; Review</button>
    </template>
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

          <!-- Two exit paths with clear descriptions -->
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
              <button type="button" class="btn btn-primary exit-opt-btn" @click="finishAndReview">Submit</button>
            </div>
          </div>

          <div class="m-btns" style="border-top:1px solid var(--border);padding-top:12px;margin-top:0">
            <button type="button" class="btn" style="width:100%;justify-content:center" @click="showExit=false">Keep going</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ══ LABS MODAL (async chunk — loads only on first click) ══ -->
  <!-- PERF FIX 3: SessionLabsModal is a defineAsyncComponent — Vite splits it
       into a separate JS file that is not downloaded until showLabs goes true. -->
  <SessionLabsModal :show="showLabs" @close="showLabs = false" />

  <!-- ══ CALCULATOR MODAL (async chunk — loads only on first click) ══ -->
  <!-- PERF FIX 3: SessionCalcModal is a defineAsyncComponent — same as above.
       Calculator state + logic are fully contained inside that chunk. -->
  <SessionCalcModal :show="showCalc" @close="showCalc = false" />

  </template><!-- /v-else (questions loaded successfully) -->

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

        <div v-if="!fbDone && fbError" class="fb-error" role="alert"
          style="color:var(--rose,#e11d48);font-size:0.72rem;font-weight:600;padding:0 2px 8px;text-align:right">
          {{ fbError }}
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
.tb-prog{display:flex;align-items:center;gap:8px;flex-shrink:0}
.tb-count{font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.69rem;font-weight:700;color:var(--ink-dim);white-space:nowrap}
.tb-track{width:120px;height:5px;background:var(--border);border-radius:3px;overflow:hidden}
.tb-fill{height:100%;background:linear-gradient(90deg,var(--teal-dark),var(--teal));border-radius:3px;transition:width 0.5s cubic-bezier(0.16,1,0.3,1)}
.tb-dots{
  display:flex;gap:3px;overflow-x:auto;flex:1;min-width:0;padding:2px 0 6px;
  /* Fade left/right edges to indicate the row is scrollable when it
     overflows (long sessions of 80 / 120 / 500 questions). */
  mask-image: linear-gradient(to right, transparent 0, black 14px, black calc(100% - 14px), transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0, black 14px, black calc(100% - 14px), transparent 100%);
  scroll-behavior: smooth;
}
/* Thin visible scrollbar gives the user a clear affordance for manual
   horizontal scroll (e.g. dragging back to see early questions they skipped). */
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
/* "You are here" ring — bound to idx, so the current question is always marked
   even when its dot is already coloured by a result (answered/skipped). */
/* "You are here" ring for the current question. A double box-shadow (white gap
   + teal ring) instead of a plain teal outline, so it stays clearly visible even
   when the dot is also d-cur (teal-filled) or a result colour (green/red/amber). */
.tb-dot.d-here{outline:none;box-shadow:0 0 0 2px #fff,0 0 0 4px var(--teal)}
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
.s-body{display:flex;height:calc(100dvh - 52px);height:calc(100dvh - 52px);overflow:hidden;position:relative}

/* ── PAUSE OVERLAY ── */
.pause-overlay{
  position:absolute;inset:0;z-index:50;
  background:rgba(15,31,46,0.72);
  backdrop-filter:blur(6px);
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;
}
.pause-card{
  display:flex;flex-direction:column;align-items:center;gap:10px;
  background:var(--white);border-radius:18px;
  padding:36px 44px 30px;
  box-shadow:0 24px 60px rgba(0,0,0,0.28);
  pointer-events:none; /* clicks fall through to overlay for resume */
}
.pause-icon-ring{
  width:60px;height:60px;border-radius:50%;
  background:color-mix(in srgb,var(--teal) 12%,transparent);
  border:2px solid color-mix(in srgb,var(--teal) 30%,transparent);
  display:flex;align-items:center;justify-content:center;
  color:var(--teal);margin-bottom:4px;
}
.pause-title{font-size:1.1rem;font-weight:800;color:var(--ink)}
.pause-sub{font-size:0.75rem;color:var(--ink-dim);margin-bottom:6px}
.pause-resume-btn{
  pointer-events:all;
  display:inline-flex;align-items:center;gap:8px;
  background:var(--teal);color:#fff;border:none;
  padding:10px 24px;border-radius:10px;
  font-family:'Figtree',sans-serif;font-size:0.82rem;font-weight:700;
  cursor:pointer;transition:background 0.14s;margin-top:4px;
}
.pause-resume-btn:hover{background:var(--teal-mid)}
.pause-hint{font-size:0.65rem;color:var(--ink-faint);margin-top:2px}
.pause-hint kbd{
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;font-size:0.62rem;
  border:1px solid var(--border);border-radius:4px;
  padding:1px 5px;color:var(--ink-dim);background:var(--surface);
}
/* Fade transition */
.pause-fade-enter-active,.pause-fade-leave-active{transition:opacity 0.18s ease}
.pause-fade-enter-from,.pause-fade-leave-to{opacity:0}

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
.fnt-btn:hover:not(.disabled){border-color:var(--teal-border);color:var(--teal)}
.fnt-btn.disabled{opacity:0.35;cursor:not-allowed;pointer-events:none}
.sd-cell{display:flex;gap:5px;align-items:baseline;padding:4px 14px;border-right:1px solid var(--border)}
.sd-cell:first-child{padding-left:0}
.sd-cell:last-child{border-right:none}
.sd-k{color:var(--ink-faint);font-size:0.71rem;font-weight:600;white-space:nowrap}
.sd-v{color:var(--ink);font-size:0.71rem;font-weight:700;font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}

/* ── STEM FOOTER (feedback button) ── */
.stem-footer{display:flex;justify-content:flex-end;padding:8px 14px 10px}
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
.fb-intro{font-size:0.78rem;color:var(--ink-mid);line-height:1.6;margin-top:6px}
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
.opt-content{position:relative;z-index:1;display:flex;align-items:center;gap:11px;flex:1;min-width:0}
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
.exp-card{display:none;background:var(--teal-pale);border:1px solid var(--border);border-radius:var(--r-lg);border-left:3px solid var(--teal);overflow:hidden;margin-top:16px;animation:fadeSlide 0.3s ease;transition:background 0.3s,border-color 0.3s}
.exp-card.open{display:block}
.exp-card .exp-inner{padding:20px 22px 22px}
/* Single column: hide split card, show inline card after options */
body.single .exp-card{display:none !important}
.exp-single{margin-top:14px;display:none}
body.single .exp-single{display:block}
.exp-box{background:var(--teal-pale);border:1px solid var(--border);border-radius:var(--r-lg);border-left:3px solid var(--teal);overflow:hidden;animation:fadeSlide 0.3s ease;transition:background 0.3s,border-color 0.3s}
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
  /* overflow:visible (not auto) so the stacked panes flow into the SINGLE .s-body
     scroll on mobile — nested inner scrolls (q/a-scroll) captured touch and blocked
     scrolling down to the explanation. Matches timed.vue / mock-timed.vue. */
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
.opt-mark{width:18px;height:18px;flex-shrink:0;position:relative;z-index:1;align-self:center;margin-left:2px}
.opt-mark.ok{color:var(--green)}
.opt-mark.bad{color:var(--rose)}
.exp-body ul {
    padding-left: revert-layer;
}

.exp-body p {
    margin-bottom: 24px;
}

.exp-body ul li {
    margin-bottom: 24px;
}
</style>
