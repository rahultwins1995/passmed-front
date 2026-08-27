// ─── useMockSession ────────────────────────────────────────────────────────
// Separate composable for mock exam sessions.
// Uses /mock-exams/session/* endpoints — completely independent of useSession.
// Question format matches useSession's internal shape so the mock-timed runner
// can reuse the same template logic.

interface MQuestion {
  id:     number
  q:      string              // question text
  vig:    string              // vignette / stem context
  img:    string              // question_image_ids — image URL shown under the stem (may be '')
  opts:   { l: string; t: string }[]
  ans:    string              // correct letter (A/B/C/D/E)
  exp:    string              // explanation HTML
  kp:     string              // key point
  topic:  string
  diff:   string
  tags:   string[]
  wr:     Record<string, string>
  stats:  { peers: string; n: string; diff: string }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// A question is "graded" (and therefore locked) only once it has a real verdict
// — 'correct' or 'incorrect'. 'skipped' is NOT graded, so a skipped question
// must stay changeable. Mirrors isGraded() in useSession; useMockSession never
// got this fix, which is why choose()/skip() guarding on a truthy result locked
// skipped mock questions.
function isGraded(r?: string | null): boolean {
  return r === 'correct' || r === 'incorrect'
}

function letterFromIndex(i: number): string {
  return String.fromCharCode(65 + i) // 0→A, 1→B …
}

function mapQuestion(sq: any): MQuestion {
  const q   = sq.question ?? {}
  const opts = (q.question_options ?? []).map((o: any, i: number) => ({
    l: letterFromIndex(i),
    t: o.option_text ?? '',
  }))

  // Correct answer letter — find the option where is_correct is truthy
  const correctIdx = (q.question_options ?? []).findIndex(
    (o: any) => o.is_correct === true || o.is_correct === 1
      || String(o.is_correct).toLowerCase() === 'true'
  )
  const ans = correctIdx >= 0 ? letterFromIndex(correctIdx) : ''

  return {
    id:    q.id,
    q:     q.question_text  ?? q.question_stem ?? '',
    vig:   q.question_stem  ?? '',
    img:   q.question_image_ids ?? '',
    opts,
    ans,
    exp:   q.explanation    ?? '',
    kp:    q.key_point      ?? '',
    topic: q.category?.name ?? q.topic?.name ?? '',
    diff:  q.difficulty     ?? '',
    tags:  q.tags           ?? [],
    wr:    q.wrong_answers  ?? {},
    stats: {
      peers: q.peer_correct_pct != null ? `${q.peer_correct_pct}%` : '—',
      n:     q.attempt_count    != null ? String(q.attempt_count)  : '—',
      diff:  q.difficulty ?? '—',
    },
  }
}

export function useMockSession() {
  const studentApi = useStudentApi()
  const router     = useRouter()

  // ── Shared state (namespaced so it doesn't collide with useSession) ────────
  const questions    = useState<MQuestion[]>('mock:questions',    () => [])
  const idx          = useState<number>('mock:idx',              () => 0)
  const chosen       = useState<Record<number, string>>('mock:chosen',    () => ({}))
  const result       = useState<Record<number, string>>('mock:result',    () => ({}))
  const flagged      = useState<Record<number, boolean>>('mock:flagged',  () => ({}))
  const secs         = useState<number>('mock:secs',             () => 0)
  const submitted    = useState<boolean>('mock:submitted',       () => false)
  const loading      = useState<boolean>('mock:loading',         () => false)
  const fetchError   = useState<string | null>('mock:error',     () => null)
  const sessionId      = useState<number | null>('mock:sessionId',      () => null)
  // Incremented each time an attempt is completed — mock.vue watches this
  // to know it should refetch the exam list (handles keep-alive + normal remount).
  const completionTick = useState<number>('mock:completionTick', () => 0)

  // ── Derived ───────────────────────────────────────────────────────────────
  const total   = computed(() => questions.value.length)
  const current = computed(() => questions.value[idx.value] ?? null)

  const progress = computed(() =>
    questions.value.map((q, i) => {
      const res = result.value[q.id]
      const state = i === idx.value
        ? 'current'
        : res === 'correct'   ? 'correct'
        : res === 'incorrect' ? 'incorrect'
        : res === 'skipped'   ? 'skipped'
        : ''
      return { n: i + 1, state }
    })
  )

  const answered = computed(() =>
    questions.value.filter(q => !!result.value[q.id]).length
  )

  const score = computed(() => {
    const correct = questions.value.filter(q => result.value[q.id] === 'correct').length
    const ans     = answered.value
    return ans > 0 ? Math.round((correct / ans) * 100) : 0
  })

  function formatTime(s: number): string {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function choose(letter: string) {
    const qid = current.value?.id
    // Only a graded (correct/incorrect) answer locks the question — a skipped
    // one stays changeable so the student can come back and answer it.
    if (!qid || isGraded(result.value[qid])) return
    chosen.value = { ...chosen.value, [qid]: letter }
    submitted.value = false
    // Persist in-flight selection (debounced) so refresh / another device
    // restores the chosen option before submit. loadMockSession() reads
    // row.chosen_answer back on mount.
    syncQuestion(qid, { chosen_answer: letter })
  }

  function submit() {
    const q = current.value
    if (!q || !chosen.value[q.id]) return
    const r = chosen.value[q.id] === q.ans ? 'correct' : 'incorrect'
    result.value = { ...result.value, [q.id]: r }
    submitted.value = true
  }

  function skip() {
    const q = current.value
    // Don't overwrite a graded verdict, but a previously-skipped (or unanswered)
    // question can be (re-)skipped — it must not lock.
    if (!q || isGraded(result.value[q.id])) return
    result.value = { ...result.value, [q.id]: 'skipped' }
    submitted.value = true
  }

  function goNext() {
    if (idx.value < questions.value.length - 1) {
      idx.value++
      const q = questions.value[idx.value]
      // Skipped is not "submitted" — only a graded verdict flips the page into
      // its post-answer (locked) state.
      submitted.value = q ? isGraded(result.value[q.id]) : false
    }
  }

  function goPrev() {
    if (idx.value > 0) {
      idx.value--
      const q = questions.value[idx.value]
      submitted.value = q ? isGraded(result.value[q.id]) : false
    }
  }

  function toggleFlag() {
    const q = current.value
    if (!q) return
    flagged.value = { ...flagged.value, [q.id]: !flagged.value[q.id] }
    // Sync flag to backend (fire and forget)
    if (sessionId.value) {
      studentApi(`/mock-exams/session/${sessionId.value}/questions/${q.id}`, {
        method: 'PATCH',
        body:   { flagged: flagged.value[q.id] },
      }).catch(() => {})
    }
  }

  function reset() {
    questions.value  = []
    idx.value        = 0
    chosen.value     = {}
    result.value     = {}
    flagged.value    = {}
    secs.value       = 0
    submitted.value  = false
    sessionId.value  = null
    fetchError.value = null
  }

  // ── Backend sync ───────────────────────────────────────────────────────────

  // Debounced per-question sync (same pattern as useSession)
  const qSyncTimers: Record<number, ReturnType<typeof setTimeout>> = {}
  const qPendingPayload: Record<number, any> = {}
  const pendingPromises: Promise<any>[] = []

  function trackPromise(p: Promise<any>) {
    pendingPromises.push(p)
    p.finally(() => {
      const i = pendingPromises.indexOf(p)
      if (i >= 0) pendingPromises.splice(i, 1)
    })
  }

  function syncQuestion(questionId: number, payload: {
    chosen_answer?:    string | null
    result?:           string | null
    flagged?:          boolean
    q_timer_remaining?: number
    q_time_spent?:     number
  }) {
    if (!sessionId.value) return
    const sid = sessionId.value

    qPendingPayload[questionId] = { ...(qPendingPayload[questionId] || {}), ...payload }
    if (qSyncTimers[questionId]) clearTimeout(qSyncTimers[questionId])
    qSyncTimers[questionId] = setTimeout(() => {
      const body = qPendingPayload[questionId]
      delete qPendingPayload[questionId]
      delete qSyncTimers[questionId]
      if (!sessionId.value) return
      const p = studentApi(`/mock-exams/session/${sid}/questions/${questionId}`, {
        method: 'PATCH',
        body,
      })
      trackPromise(p)
    }, 600)
  }

  let sessionSyncTimer: ReturnType<typeof setTimeout> | null = null
  let sessionPendingPayload: any = null

  async function syncSession(payload: { current_index?: number; elapsed_seconds?: number }) {
    if (!sessionId.value) return
    const sid = sessionId.value
    sessionPendingPayload = { ...(sessionPendingPayload || {}), ...payload }
    if (sessionSyncTimer) clearTimeout(sessionSyncTimer)
    return new Promise<void>(resolve => {
      sessionSyncTimer = setTimeout(async () => {
        const body = sessionPendingPayload
        sessionPendingPayload = null
        sessionSyncTimer = null
        if (!sessionId.value) { resolve(); return }
        try {
          await studentApi(`/mock-exams/session/${sid}`, { method: 'PATCH', body })
        } catch {}
        resolve()
      }, 800)
    })
  }

  async function flushPendingSyncs() {
    // Fire any debounced question PATCHes immediately
    for (const [qidStr, timer] of Object.entries(qSyncTimers)) {
      clearTimeout(timer as any)
      const qid  = Number(qidStr)
      const body = qPendingPayload[qid]
      if (body && sessionId.value) {
        const p = studentApi(`/mock-exams/session/${sessionId.value}/questions/${qid}`, {
          method: 'PATCH', body,
        })
        trackPromise(p)
        delete qPendingPayload[qid]
        delete qSyncTimers[qid]
      }
    }
    if (sessionSyncTimer && sessionPendingPayload && sessionId.value) {
      clearTimeout(sessionSyncTimer)
      const body = sessionPendingPayload
      sessionPendingPayload = null
      sessionSyncTimer = null
      const p = studentApi(`/mock-exams/session/${sessionId.value}`, { method: 'PATCH', body })
      trackPromise(p)
    }
    await Promise.allSettled(pendingPromises)
  }

  // ── Load session from backend (on mount) ──────────────────────────────────
  async function loadMockSession(sid: number): Promise<any | null> {
    loading.value    = true
    fetchError.value = null
    try {
      const res = await studentApi<any>(`/mock-exams/session/${sid}`)
      if (res?.status !== 'success' || !res.data) return null

      const data = res.data
      sessionId.value = data.id

      // Map session_questions → internal MQuestion format
      const sq: any[] = data.session_questions ?? []
      questions.value  = sq.map(mapQuestion)

      // Restore per-question state from saved rows
      const chosenMap:  Record<number, string>  = {}
      const resultMap:  Record<number, string>  = {}
      const flaggedMap: Record<number, boolean> = {}

      for (const row of sq) {
        const qid = row.question_id
        if (row.chosen_answer) chosenMap[qid]  = row.chosen_answer
        if (row.result)        resultMap[qid]  = row.result
        if (row.flagged)       flaggedMap[qid] = !!row.flagged
      }
      chosen.value  = chosenMap
      result.value  = resultMap
      flagged.value = flaggedMap
      secs.value    = data.elapsed_seconds ?? 0

      return data
    } catch (e: any) {
      fetchError.value = e?.data?.msg || 'Failed to load session.'
      return null
    } finally {
      loading.value = false
    }
  }

  // ── Complete session ───────────────────────────────────────────────────────
  async function completeSession(): Promise<void> {
    if (!sessionId.value) {
      // No session loaded — just go back
      navigateTo('/student/mock')
      return
    }
    const sid = sessionId.value
    // Flush all debounced question + session PATCHes BEFORE hitting /complete
    // so the backend scores on fully up-to-date data.
    await flushPendingSyncs()

    // Which attempt just finished — used for the review page URL.
    // Falls back to 1 if the backend call fails (review page will still load).
    let attemptNumber = 1
    try {
      const res = await studentApi<any>(`/mock-exams/session/${sid}/complete`, { method: 'POST' })
      if (res?.current_attempt) attemptNumber = res.current_attempt
    } catch (e: any) {
      // Log so it's visible in the browser console — don't silently swallow.
      log.error('completeSession', 'POST /complete failed', e?.data ?? e?.message ?? e)
      // Still navigate — student shouldn't be stuck.
    }

    // Signal the mock list to refetch when the student eventually returns to it.
    completionTick.value++
    // Navigate to the review page so the student sees their score + breakdown.
    navigateTo(`/student/mock-review?sid=${sid}&attempt=${attemptNumber}`)
  }

  return {
    // State
    questions, idx, chosen, result, flagged, secs, submitted,
    loading, fetchError, sessionId, completionTick,
    // Derived
    total, current, progress, answered, score,
    // Actions
    choose, submit, skip, goNext, goPrev, toggleFlag, reset, formatTime,
    // Backend
    loadMockSession, syncQuestion, syncSession, flushPendingSyncs, completeSession,
  }
}
