// composables/useSession.ts

// Exam integrity: a question is "answered"/"graded" ONLY when it has a real
// outcome (correct/incorrect). 'skipped' is also stored in the `result` map
// (for the progress dots, backend sync and scoring), but it must NOT count as
// answered — otherwise a skipped question reads as locked/submitted and can't
// be answered on a revisit. Every "is this answered?" check goes through here
// instead of a truthiness test on the result map. Auto-imported app-wide.
export function isGraded(r?: string | null): boolean {
  return r === 'correct' || r === 'incorrect'
}

export interface Question {
  id: number
  topic: string
  diff: string         // raw value from backend (e.g. "foundation", "easy")
  vig: string
  q: string
  img: string          // question_image_ids — image URL shown under the stem (may be '')
  opts: { l: string; t: string }[]
  ans: string
  exp: string
  kp: string
  wr: Record<string, string>
  tags: string[]
  stats: { peers: string; diff: string; n: string }
  // How many times THIS user has attempted this question before (0 = first time).
  user_attempts: number
  // Per-option peer choice % — keyed by letter (A/B/C/D/E), e.g. { A: '12%', B: '45%' }
  optionStats: Record<string, string>
  reviewed: { date: string; reviewers: { initials: string; name: string; cred: string; role: string; expert?: boolean; last?: boolean }[] }
  placeholder?: boolean
}

// ─── API response shape (from /qbank/questions endpoint) ───────────────────
// Matches the JSON the Laravel `Api_student_qbankController` currently
// returns. Update only `mapApiRow` below if the backend evolves.
interface ApiQuestionOption {
  id: number
  question_id: number
  option_text: string
  is_correct: string | boolean       // backend returns "true"/"false" strings
  position: number
}
interface ApiQuestionRow {
  id: number                          // join-table row id (e.g. exam_question.id)
  user_id: number | null
  exam_id: number
  question: {                         // nested question object
    id: number
    question_stem: string
    question_image_ids?: string | null   // image URL shown under the stem
    difficulty?: string | null
    category_id?: number | null
    category?: { id: number; name: string } | null
    // Explanation fields — now included in the backend select
    explanation?:       string | null  // maps to exp
    note?:              string | null  // maps to kp (key point)
    // Per-option peer choice distribution — keyed by letter
    option_stats?:      Record<string, string> | null
  } | null
  question_options: ApiQuestionOption[]
}
interface ApiQuestionsResponse {
  status: string
  msg: string
  total_questions: number             // total available for this exam
  data: ApiQuestionRow[]
}

// Convert one API row to the internal Question shape used by tutor.vue,
// timed.vue, and review pages. Letter (A/B/C/D) comes from array index since
// the response's `position` field is currently uniform (= 1 for every option).
function mapApiRow(row: ApiQuestionRow): Question {
  const rawOpts = row.question_options || []

  const opts = rawOpts.map((o, i) => ({
    l: String.fromCharCode(65 + i),  // 0 → 'A', 1 → 'B', etc.
    t: o.option_text || '',
  }))

  // Find the correct letter. `is_correct` is a string "true"/"false" today;
  // also accept boolean form for forward compatibility.
  const correctIdx = rawOpts.findIndex(o =>
    o.is_correct === true || String(o.is_correct).toLowerCase() === 'true',
  )
  const ans = correctIdx >= 0 ? String.fromCharCode(65 + correctIdx) : ''

  // Topic badge — derived from Category name. The old topic_id field has
  // been deprecated (rolled into category). "General" is the final
  // fallback so the UI never shows blank.
  const topicName = row.question?.category?.name || 'General'

  // Difficulty — pass the raw backend value straight through. The badge
  // label + colour are derived from this value in the runner template
  // (tutor.vue / timed.vue) so whatever the DB stores ("foundation",
  // "intermediate", "advanced", or "easy/medium/hard") shows up verbatim.
  const diff = String(row.question?.difficulty || '').toLowerCase() as any

  return {
    id: row.question?.id ?? row.id,
    topic: topicName,
    diff,
    vig:  row.question?.question_stem  || '',
    q:    '',
    img:  row.question?.question_image_ids || '',
    opts,
    ans,
    // Map explanation fields from backend columns:
    //   explanation      → exp  (shown in explanation panel after submit)
    //   note             → kp   (key point block)
    exp:  row.question?.explanation      || '',
    kp:   row.question?.note             || '',
    wr:   {},   // no per-option wrong-reason column in DB; remains empty
    // Per-option peer % from backend bulk query
    optionStats: (row.question?.option_stats as Record<string, string>) ?? {},
    tags:  [],
    // Aggregate explanation stats from backend (peers-correct %, attempts).
    // Fallback-safe: if the backend hasn't shipped `stats` yet, show '—' and
    // derive difficulty from the question's own difficulty field.
    stats: {
      peers: (row.question as any)?.stats?.peers ?? '—',
      diff:  (row.question as any)?.stats?.diff  ?? (row.question?.difficulty ? String(row.question.difficulty) : 'Medium'),
      n:     (row.question as any)?.stats?.n     ?? '—',
    },
    user_attempts: Number((row.question as any)?.user_attempts ?? 0),
    reviewed: { date: '', reviewers: [] },
  }
}

export const useSession = () => {
  // Start empty — questions arrive from fetchQuestions().
  const questions  = useState<Question[]>('session:questions', () => [])
  const idx        = useState<number>('session:idx', () => 0)
  const chosen     = useState<Record<number,string>>('session:chosen', () => ({}))
  const result     = useState<Record<number,'correct'|'incorrect'|'skipped'>>('session:result', () => ({}))
  const flagged    = useState<Record<number,boolean>>('session:flagged', () => ({}))
  const secs       = useState<number>('session:secs', () => 0)
  const submitted  = useState<boolean>('session:submitted', () => false)
  const timerPerQ      = useState<number>('session:timerPerQ', () => 60)
  const loading        = useState<boolean>('session:loading', () => false)
  const fetchError     = useState<string>('session:error', () => '')
  const totalQuestions = useState<number>('session:total', () => 0)   // from API top-level

  // ─── Backend session lifecycle ─────────────────────────────────────────────
  // sessionId holds the row id from the `student_sessions` table. It's set
  // by createBackendSession() at session start and cleared by completeSession().
  // tutor.vue / timed.vue watchers use it to PATCH per-question + per-session
  // state as the user plays.
  const sessionId = useState<number | null>('session:backend-id', () => null)

  // Mode of the currently-active session ('tutor' | 'timed'), tracked alongside
  // sessionId so the sidebar's "Continue session" link can route back to the
  // correct runner. Set wherever a session is established — createBackendSession
  // (new) and loadSession (resume / redo) — and cleared in completeSession.
  const inProgressMode = useState<'tutor' | 'timed' | null>('session:in-progress-mode', () => null)

  // Free-trial gate result from the last createBackendSession() call (null when
  // the session was created normally). 'resume' → an in-progress trial session
  // must be finished first (sessionId+mode point at it); 'used' → the single
  // trial session is spent → prompt to subscribe. The qbank launch flow reads
  // this right after createBackendSession().
  const trialBlock = useState<{ kind: 'resume' | 'used'; sessionId?: number; mode?: 'tutor' | 'timed'; msg: string } | null>('session:trial-block', () => null)

  /** POST /sessions — create the session row + per-question rows on backend. */
  async function createBackendSession(opts: {
    examId?: number
    institutionId?: number
    scope?: 'exam' | 'institution'
    mode: 'tutor' | 'timed'
    timerPerQ?: number
  }): Promise<number | null> {
    if (!questions.value.length) return null
    trialBlock.value = null
    try {
      const studentApi = useStudentApi()
      const res: any = await studentApi('/sessions', {
        method: 'POST',
        body: {
          // exam_id for a real exam; institution_id + scope='institution' for the
          // Institution Q Bank pool (which has no exam id). Questions are always sent
          // explicitly, so the session carries its own drawn set regardless of source.
          exam_id:        opts.examId,
          institution_id: opts.institutionId,
          scope:          opts.scope,
          mode:           opts.mode,
          timer_per_q:    opts.timerPerQ,
          question_ids:   questions.value.map(q => q.id),
        },
      })
      sessionId.value = res?.session_id ?? null
      if (sessionId.value) inProgressMode.value = opts.mode
      return sessionId.value
    } catch (e: any) {
      // Free-trial gate (backend returns 409): the trial is ONE 50-question
      // session. 'trial_resume' → an in-progress trial session exists; the
      // caller should send the user back to finish it. 'trial_used' → the
      // single trial session is spent; prompt to subscribe. Anything else is a
      // real failure.
      const data = e?.data
      if (data?.status === 'trial_resume') {
        trialBlock.value = { kind: 'resume', sessionId: Number(data.session_id) || undefined, mode: data.mode, msg: data.msg || '' }
      } else if (data?.status === 'trial_used') {
        trialBlock.value = { kind: 'used', msg: data.msg || '' }
      } else {
        log.warn('session', 'createBackendSession failed', e)
      }
      sessionId.value = null
      return null
    }
  }

  // ─── Sync queue ────────────────────────────────────────────────────────────
  // Each PATCH gets its own debounce timer keyed by URL so independent calls
  // (e.g. answering Q1 then immediately clicking Next which bumps the session
  // index) don't cancel each other.
  //
  // pendingPromises tracks in-flight requests so completeSession() can await
  // every queued PATCH before marking the session complete — otherwise the
  // session row could be marked completed while the last answer is still
  // queued (causing NULL chosen_answer / result in DB).
  const questionSyncTimers: Record<number, ReturnType<typeof setTimeout>> = {}
  let sessionSyncTimer: ReturnType<typeof setTimeout> | null = null
  const pendingPromises: Promise<any>[] = []

  // Latest payload per question — merged into a single PATCH when the timer
  // fires. This way rapid flag-toggle + answer-select for the same question
  // collapse into ONE request without losing fields.
  const questionPendingPayload: Record<number, any> = {}
  let   sessionPendingPayload: any = null

  function trackPromise(p: Promise<any>) {
    pendingPromises.push(p)
    p.finally(() => {
      const i = pendingPromises.indexOf(p)
      if (i >= 0) pendingPromises.splice(i, 1)
    })
  }

  /**
   * PATCH /sessions/{id}/questions/{qid}
   *
   * NOTE: `flagged` is intentionally NOT in this payload type. Flag state
   * now lives in the dedicated question_flags table and is mutated via
   * POST /flags/review / POST /flags/unreview (see toggleFlag below).
   * Sending `flagged` here would hit a Postgres datatype mismatch
   * (boolean column receiving integer from JSON false → 0).
   */
  function syncQuestion(questionId: number, payload: {
    chosen_answer?: string | null
    result?: 'correct' | 'incorrect' | 'skipped' | null
    q_timer_remaining?: number
    q_time_spent?: number
  }) {
    if (!sessionId.value) return
    const sid = sessionId.value
    // Belt-and-braces: strip `flagged` if it ever sneaks in (e.g. from a
    // stale HMR'd bundle still carrying the old watcher). Flag state lives
    // in question_flags now — sending it here would 500 on Postgres's
    // boolean/integer mismatch.
    const cleanPayload = { ...payload } as Record<string, any>
    delete cleanPayload.flagged
    // Don't fire an empty PATCH — saves a no-op request when the only
    // field in the payload was the stripped `flagged`.
    if (Object.keys(cleanPayload).length === 0) return
    // Merge into pending payload for this question.
    questionPendingPayload[questionId] = {
      ...(questionPendingPayload[questionId] || {}),
      ...cleanPayload,
    }
    if (questionSyncTimers[questionId]) clearTimeout(questionSyncTimers[questionId])
    questionSyncTimers[questionId] = setTimeout(() => {
      const body = questionPendingPayload[questionId]
      delete questionPendingPayload[questionId]
      delete questionSyncTimers[questionId]
      // Re-check just before sending — defence in depth.
      if (body && 'flagged' in body) delete (body as any).flagged
      if (!body || Object.keys(body).length === 0) return
      const studentApi = useStudentApi()
      const p = studentApi(`/sessions/${sid}/questions/${questionId}`, {
        method: 'PATCH',
        body,
      }).catch(e => log.warn('session', 'syncQuestion failed', e))
      trackPromise(p)
    }, 250)
  }

  /** PATCH /sessions/{id} — current_index / elapsed_seconds / status */
  function syncSession(payload: {
    current_index?: number
    elapsed_seconds?: number
    status?: string
  }) {
    if (!sessionId.value) return
    const sid = sessionId.value
    sessionPendingPayload = { ...(sessionPendingPayload || {}), ...payload }
    if (sessionSyncTimer) clearTimeout(sessionSyncTimer)
    sessionSyncTimer = setTimeout(() => {
      const body = sessionPendingPayload
      sessionPendingPayload = null
      sessionSyncTimer = null
      const studentApi = useStudentApi()
      const p = studentApi(`/sessions/${sid}`, {
        method: 'PATCH',
        body,
      }).catch(e => log.warn('session', 'syncSession failed', e))
      trackPromise(p)
    }, 250)
  }

  /**
   * Force-fire any pending timers immediately and await all in-flight requests.
   * Call this before navigation away from a session (Submit/Exit) to guarantee
   * the DB has every last answer the user clicked.
   */
  async function flushPendingSyncs(): Promise<void> {
    // Trigger any queued question timers immediately.
    for (const qid of Object.keys(questionSyncTimers)) {
      clearTimeout(questionSyncTimers[Number(qid)])
      const body = questionPendingPayload[Number(qid)]
      if (body && sessionId.value) {
        delete questionPendingPayload[Number(qid)]
        delete questionSyncTimers[Number(qid)]
        const studentApi = useStudentApi()
        const p = studentApi(`/sessions/${sessionId.value}/questions/${qid}`, {
          method: 'PATCH', body,
        }).catch(e => log.warn('session', 'flush question failed', e))
        trackPromise(p)
      }
    }
    // Trigger the queued session timer.
    if (sessionSyncTimer && sessionPendingPayload && sessionId.value) {
      clearTimeout(sessionSyncTimer)
      const body = sessionPendingPayload
      sessionPendingPayload = null
      sessionSyncTimer = null
      const studentApi = useStudentApi()
      const p = studentApi(`/sessions/${sessionId.value}`, {
        method: 'PATCH', body,
      }).catch(e => log.warn('session', 'flush session failed', e))
      trackPromise(p)
    }
    // Wait for all in-flight requests (including any we just triggered).
    if (pendingPromises.length) {
      await Promise.all([...pendingPromises])
    }
  }

  /** POST /sessions/{id}/complete → returns the id so the caller can redirect. */
  async function completeSession(): Promise<number | null> {
    if (!sessionId.value) return null
    const id = sessionId.value
    // Critical — flush every queued PATCH before marking complete, otherwise
    // the last answer can race against the complete call and end up as NULL.
    await flushPendingSyncs()
    try {
      const studentApi = useStudentApi()
      await studentApi(`/sessions/${id}/complete`, { method: 'POST' })
    } catch (e) { log.warn('session', 'completeSession failed', e) }
    clearLocal(id)   // session finished — drop its local resume cache
    sessionId.value = null
    inProgressMode.value = null   // hide the "Continue session" link
    return id
  }

  /**
   * GET /sessions/{id} — full session object with `.session_questions[]`
   * joined to `.question` and `.question.question_options`. Used by both
   * Review (read answers + correct + explanation) and Resume.
   *
   * IMPORTANT for Resume: this REBUILDS the local questions/chosen/result/
   * flagged state from the saved session_questions rows, so that resuming
   * an older session doesn't show questions from the most-recent session
   * that's still cached in `useState`. Earlier we only set sessionId and
   * relied on whatever was already in `questions.value` — which broke when
   * the user completed a fresh 10-question session in between resuming
   * an older 200-question one (the runner ended up with the 10 questions
   * from the recent session under the wrong session id).
   */
  async function loadSession(id: number): Promise<any | null> {
    // CRITICAL: clear any cached state from a previous session BEFORE the
    // fetch. Otherwise, if the API errors out (network blip, 5xx, malformed
    // response, etc.) and we early-return, the runner ends up showing the
    // PREVIOUS session's questions/answers — e.g. user resumes a 40-Q
    // session after a 10-Q session and only sees 10 questions.
    questions.value = []
    chosen.value    = {}
    result.value    = {}
    flagged.value   = {}
    totalQuestions.value = 0

    try {
      const studentApi = useStudentApi()
      const res: any = await studentApi(`/sessions/${id}`)
      const data = res?.data ?? null
      if (!data) return null
      sessionId.value = data.id
      // Track mode for the "Continue session" link (resume/redo path).
      inProgressMode.value = data.mode === 'timed' ? 'timed' : 'tutor'

      // Pull the saved per-question rows in their stored order. Backend
      // already orders by position via the show() eager-load constraint.
      const rows: any[] = data.session_questions || data.questions || []

      // Rebuild the questions[] in EXACTLY the order this session was built.
      // Map each saved row into the same `Question` shape qbank/tutor/timed
      // expect (mapApiRow handles letter/correct-index + topic/difficulty).
      //
      // IMPORTANT: pass the FULL question object so difficulty / category /
      // topic flow through to the badge. Earlier this only forwarded `id`
      // and `question_stem`, which left `current.diff` empty → badge fell
      // through to the default "medium" amber colour even when the question
      // was actually "foundation" or "advanced".
      questions.value = rows.map((row: any) => {
        const q = row.question || null
        return mapApiRow({
          id:               row.question_id ?? row.id,
          user_id:          null,
          exam_id:          data.exam_id,
          question:         q,
          question_options: q?.question_options || [],
        } as any)
      })

      // Rehydrate chosen / result / flagged maps so the runner picks up
      // exactly where the user left off (selected options highlighted,
      // already-answered Qs greyed, dots colour-coded correct/wrong/skip).
      const chosenMap : Record<number, string>  = {}
      const resultMap : Record<number, 'correct'|'incorrect'|'skipped'> = {}
      const flaggedMap: Record<number, boolean> = {}
      for (const row of rows) {
        const qid = row.question_id ?? row.id
        if (!qid) continue
        if (row.chosen_answer) chosenMap[qid]  = row.chosen_answer
        if (row.result)        resultMap[qid]  = row.result
        // Legacy: student_session_questions.flagged isn't authoritative
        // anymore (flag state moved to question_flags). Kept as a fallback
        // for older sessions; the /flags fetch below is the real source.
        if (row.flagged)       flaggedMap[qid] = true
      }
      chosen.value  = chosenMap
      result.value  = resultMap

      // Overlay any locally-cached (debounce-window / offline) selections that
      // the backend hadn't received yet, and recover the furthest-reached
      // question index so resume lands where the student actually left off.
      const localIdx = restoreLocal(id)
      if (localIdx != null) {
        data.current_index = Math.max(Number(data.current_index ?? 0), localIdx)
      }

      // Restore `submitted` based on the current question's result.
      // loadSession didn't reset submitted, so it could be stale from a
      // previous session. Set it correctly for the question at current_index
      // so the opt-stat % block shows immediately on answered questions when
      // the user navigates back to them after a resume.
      // `current` computed uses idx which is set by the caller (tutor.vue)
      // AFTER loadSession returns — so we can't use current.value here.
      // Instead we mark `submitted` based on whether ANY answered state was
      // restored; caller will correct per-question submitted when navigating.
      submitted.value = false  // safe default; goToQuestion / goPrev will flip it

      // Paint immediately with the legacy per-row flag values. The
      // authoritative question_flags state is hydrated in the BACKGROUND
      // (below) so the runner doesn't block first paint on the heavy /flags
      // round-trip — this is the progressive-load win for resume.
      flagged.value = flaggedMap

      // totalQuestions reflects what's been loaded (used by progress bar).
      totalQuestions.value = questions.value.length

      // ─── Background flag hydration (NON-blocking) ─────────────────────
      // Pull the authoritative flag state from question_flags WITHOUT awaiting
      // it. Any question_id present in /flags for this user is currently
      // flagged, regardless of which session originally flagged it. We merge
      // onto whatever flag state is live when the request resolves (rather than
      // the stale `flaggedMap`) so a toggle the user makes while it's in flight
      // isn't clobbered. Fire-and-forget: the flag icons fill in a beat after
      // the questions paint, instead of holding up the whole runner.
      studentApi('/flags', { method: 'GET', params: { limit: 1000 } })
        .then((flagsRes: any) => {
          const flagRows = Array.isArray(flagsRes?.data) ? flagsRes.data : []
          const merged: Record<number, boolean> = { ...flagged.value }
          for (const f of flagRows) {
            const qid = Number(f?.question_id ?? 0)
            if (qid) merged[qid] = true
          }
          flagged.value = merged
        })
        .catch((e: any) => {
          log.warn('session', '/flags hydration during loadSession failed', e)
        })

      return data
    } catch (e) {
      log.warn('session', 'loadSession failed', e)
      return null
    }
  }

  /**
   * hydrateFlaggedFromBackend — pull the user's currently-flagged
   * question_ids from /flags and mark them in the local `flagged` map.
   * Use this from tutor/timed onMounted AFTER fetchQuestions resolves so
   * a freshly-started session shows the flag icon as active for any
   * question the user has flagged in a previous attempt.
   *
   * Idempotent + safe to call multiple times — only sets to true, never
   * to false (the runner's toggleFlag is the authority for un-flagging
   * within a session).
   */
  async function hydrateFlaggedFromBackend(): Promise<void> {
    if (!questions.value.length) return
    try {
      const studentApi = useStudentApi()
      const res: any = await studentApi('/flags', {
        method: 'GET',
        params: { limit: 1000 },
      })
      const rows = Array.isArray(res?.data) ? res.data : []
      if (!rows.length) return
      const flaggedQids = new Set<number>(
        rows.map((r: any) => Number(r?.question_id ?? 0)).filter((n: number) => n > 0)
      )
      const next = { ...flagged.value }
      for (const q of questions.value) {
        if (flaggedQids.has(Number(q.id))) next[q.id] = true
      }
      flagged.value = next
    } catch (e) {
      log.warn('session', 'hydrateFlaggedFromBackend failed', e)
    }
  }

  /**
   * Fetch session questions from the backend.
   *
   * @param opts.limit       Cap on questions to show this session. Sent as
   *                         `?limit=N` so the backend can return ONLY that
   *                         many rows instead of the full pool.
   * @param opts.examId      Active exam — sent as `?exam_id=N` so the backend
   *                         scopes the response to one exam.
   * @param opts.resetState  Reset chosen/result/idx/etc. when starting a fresh
   *                         session. qbank.vue calls with resetState:false
   *                         (just wants the count); tutor/timed call with true.
   * @param opts.force       Bypass the in-flight dedup lock. Use this when
   *                         the active exam changes mid-page so a stuck
   *                         `loading=true` from a prior call doesn't suppress
   *                         the refetch.
   *
   * Endpoint: GET /api-student/v1/qbank/questions?exam_id=N&limit=M
   * ════════════════════════════════════════════════════════════════════
   * BACKEND CONTRACT — Api_student_qbankController@index must read:
   *   $request->query('exam_id')  → scope query to that exam
   *   $request->query('limit')    → ->limit((int) $request->limit) on the
   *                                  questions query (NOTE: total_questions
   *                                  in the response should remain the
   *                                  unlimited count so the qbank page can
   *                                  still show "X / 2,211" available).
   * ════════════════════════════════════════════════════════════════════
   */
  async function fetchQuestions(opts: {
    limit?:        number
    examId?:       number
    difficulty?:   string[]
    familiarity?:  string[]
    categoryIds?:  number[]
    // Childless subjects (topics whose questions have no category_id) can only be
    // matched by subject id — OR'd with categoryIds server-side. Mirrors fetchQbankCount.
    subjectIds?:   number[]
    resetState?:   boolean
    force?:        boolean
  } = {}) {
    if (loading.value && !opts.force) return
    loading.value = true
    fetchError.value = ''

    try {
      const studentApi = useStudentApi()
      // Build URL manually with URLSearchParams so array params serialise as
      // `difficulty[]=advanced&difficulty[]=foundation` (Laravel reads that
      // as an array). ofetch's default `params` option would serialise as
      // `difficulty=advanced&difficulty=foundation` — which Laravel reads
      // as just the LAST value (a string), causing the filter to silently
      // include the wrong questions.
      const sp = new URLSearchParams()
      if (opts.examId) sp.set('exam_id', String(opts.examId))
      if (opts.limit)  sp.set('qLimit',  String(opts.limit))
      opts.difficulty?.forEach(d   => sp.append('difficulty[]',   d))
      opts.familiarity?.forEach(f  => sp.append('familiarity[]',  f))
      opts.categoryIds?.forEach(id => sp.append('category_ids[]', String(id)))
      opts.subjectIds?.forEach(id  => sp.append('subject_ids[]',  String(id)))

      const qs  = sp.toString()
      const url = qs ? `/qbank/questions?${qs}` : '/qbank/questions'
      const res = await studentApi<ApiQuestionsResponse>(url)

      const rows = Array.isArray(res?.data) ? res.data : []
      // Backend should already filter by exam_id, but keep a client-side
      // filter as a defensive fallback in case the param is ignored.
      const filtered = opts.examId
        ? rows.filter(r => Number(r.exam_id) === Number(opts.examId))
        : rows

      // totalQuestions drives the "30 / 2,211 for <Exam>" counter on qbank.
      // Backend's top-level `total_questions` counts EVERY exam — so when an
      // exam_id is provided, prefer the client-side filtered length (which
      // reflects just that exam). Once the backend is updated to honor
      // ?exam_id, both numbers will agree and this branch becomes a no-op.
      totalQuestions.value = opts.examId
        ? filtered.length
        : (res?.total_questions || 0)

      // TEMP diagnostic — confirms active-exam switching is filtering rows.
      // Remove once the backend is honoring ?exam_id and you can see the
      // counter update by itself in production.
      // PERF FIX 2: Progressive question loading — show first question fast.
      //
      // Previously the entire `filtered` array was mapped synchronously before
      // loading.value was cleared, so the user saw a blank/skeleton until
      // ALL questions (stems + options) were processed — even though only
      // question #1 needs to render immediately.
      //
      // New approach:
      //   1. Map + expose the FIRST_BATCH (default 5) questions immediately
      //   2. Clear loading state so the UI can paint question #1 right away
      //   3. Map remaining questions in the next microtask — JS is single-
      //      threaded so this doesn't block the render that's already queued
      const FIRST_BATCH = 5
      const firstSlice  = filtered.slice(0, FIRST_BATCH)
      const restSlice   = filtered.slice(FIRST_BATCH)

      const firstMapped = firstSlice.map(mapApiRow)
      // Apply user-requested limit cap to first batch too
      questions.value = opts.limit
        ? firstMapped.slice(0, opts.limit)
        : firstMapped

      // Reset session state only when explicitly starting a new run.
      if (opts.resetState !== false) {
        idx.value = 0
        chosen.value = {}
        result.value = {}
        flagged.value = {}
        secs.value = 0
        submitted.value = false
      }

      // Clear loading NOW so the UI paints question #1 immediately.
      // Remaining questions are appended below in a microtask — they'll be
      // ready by the time the user navigates past question FIRST_BATCH.
      loading.value = false

      // Background: process + append the rest of the questions without
      // blocking the current render frame. Promise.resolve().then() schedules
      // after the current synchronous paint, keeping the UI responsive.
      if (restSlice.length > 0) {
        Promise.resolve().then(() => {
          const restMapped = restSlice.map(mapApiRow)
          // Only append if limit hasn't already been hit
          if (!opts.limit || questions.value.length < opts.limit) {
            const available = opts.limit
              ? opts.limit - questions.value.length
              : restMapped.length
            questions.value = [...questions.value, ...restMapped.slice(0, available)]
          }
        })
      }

    } catch (e: any) {
      fetchError.value = e?.data?.msg || e?.message || 'Failed to load questions.'
      questions.value = []
      totalQuestions.value = 0
    } finally {
      // Ensure loading is always cleared even on error.
      // In the success path it was already cleared above (early clear).
      loading.value = false
    }
  }

  /**
   * GET /qbank/init — single-call metadata for the qbank page's filter UI.
   * Returns familiarity counts, difficulty buckets, taxonomy tree (categories
   * with sub-topics), and total_available — all scoped to the active exam.
   */
  async function fetchQbankInit(): Promise<any | null> {
    try {
      const studentApi = useStudentApi()
      const res: any = await studentApi('/qbank/init')
      return res?.data ?? null
    } catch (e) {
      log.warn('qbank', 'fetchQbankInit failed', e)
      return null
    }
  }

  /**
   * GET /qbank/count — lightweight count for the "X / Y selected" counter.
   * Same filter params as fetchQuestions. Use this when filters change to
   * avoid fetching question rows just to read total_questions.
   */
  async function fetchQbankCount(opts: {
    difficulty?:   string[]
    familiarity?:  string[]
    categoryIds?:  number[]
    // Childless subjects in the taxonomy tree: their questions carry no category,
    // so they can only be selected by subject. OR'd with categoryIds server-side.
    subjectIds?:   number[]
  } = {}): Promise<number> {
    try {
      const studentApi = useStudentApi()
      // Manual URLSearchParams for array brackets (Laravel-compatible).
      const sp = new URLSearchParams()
      opts.difficulty?.forEach(d   => sp.append('difficulty[]',   d))
      opts.familiarity?.forEach(f  => sp.append('familiarity[]',  f))
      opts.categoryIds?.forEach(id => sp.append('category_ids[]', String(id)))
      opts.subjectIds?.forEach(id  => sp.append('subject_ids[]',  String(id)))
      const qs  = sp.toString()
      const url = qs ? `/qbank/count?${qs}` : '/qbank/count'
      const res: any = await studentApi(url)
      return Number(res?.count || 0)
    } catch (e) {
      log.warn('qbank', 'fetchQbankCount failed', e)
      return 0
    }
  }

  /**
   * GET /qbank/category-counts — ALL per-topic counts in ONE grouped call
   * (replaces the old N-requests-per-filter loop). Returns a map keyed by
   * 'c:<categoryId>' | 's:<subjectId>' → count, filtered by difficulty +
   * familiarity only (no category/subject filter).
   */
  async function fetchCategoryCounts(opts: {
    difficulty?:  string[]
    familiarity?: string[]
  } = {}): Promise<Record<string, number>> {
    try {
      const studentApi = useStudentApi()
      const sp = new URLSearchParams()
      opts.difficulty?.forEach(d  => sp.append('difficulty[]',  d))
      opts.familiarity?.forEach(f => sp.append('familiarity[]', f))
      const qs  = sp.toString()
      const url = qs ? `/qbank/category-counts?${qs}` : '/qbank/category-counts'
      const res: any = await studentApi(url)
      return (res?.counts && typeof res.counts === 'object') ? res.counts : {}
    } catch (e) {
      log.warn('qbank', 'fetchCategoryCounts failed', e)
      return {}
    }
  }

  const current    = computed(() => questions.value[idx.value])
  const total      = computed(() => questions.value.length)
  const answered   = computed(() => Object.keys(result.value).length)
  const score      = computed(() => {
    const c = Object.values(result.value).filter(r => r === 'correct').length
    return answered.value > 0 ? Math.round(c / answered.value * 100) : 0
  })

  const progress = computed(() => {
    return questions.value.map((q, i) => ({
      n: i + 1,
      state: result.value[q.id] ?? (i === idx.value ? 'current' : 'unanswered')
    }))
  })

  // ─── Local (per-tab) resume cache ──────────────────────────────────────────
  // choose()/syncQuestion already persist the in-flight selection to the
  // backend, so a normal refresh resumes from /sessions/{id}. But that sync is
  // DEBOUNCED and best-effort: pick an option then hit refresh within the
  // debounce window — or sit on flaky/commute Wi-Fi where the PATCH never lands
  // — and the pick would be lost. sessionStorage is a fast, synchronous,
  // offline-proof safety net written on every pick + navigation. The backend
  // stays the source of truth across devices; this only fills the same-tab gap.
  // Keyed by session id so distinct sessions never cross-contaminate.
  const localResumeKey = (sid: number) => `session:resume:${sid}`

  function persistLocal() {
    if (!import.meta.client) return
    const sid = sessionId.value
    if (!sid) return
    try {
      sessionStorage.setItem(localResumeKey(sid), JSON.stringify({ chosen: chosen.value, idx: idx.value }))
    } catch { /* private mode / quota — non-fatal; backend sync still runs */ }
  }

  // Overlay locally-cached selections on top of what the backend returned (local
  // is at least as fresh — it may hold a pick the debounced PATCH never sent).
  // Never resurrects an already-graded question. Returns the cached idx so the
  // caller can resume at the furthest-reached question.
  function restoreLocal(sid: number): number | null {
    if (!import.meta.client) return null
    try {
      const raw = sessionStorage.getItem(localResumeKey(sid))
      if (!raw) return null
      const saved = JSON.parse(raw)
      if (saved?.chosen && typeof saved.chosen === 'object') {
        const merged: Record<number, string> = { ...chosen.value }
        for (const [qid, letter] of Object.entries(saved.chosen)) {
          const id = Number(qid)
          if (!id || isGraded(result.value[id])) continue   // don't override a graded answer (skipped is not graded)
          if (typeof letter === 'string') merged[id] = letter
        }
        chosen.value = merged
      }
      return typeof saved?.idx === 'number' ? saved.idx : null
    } catch { return null }
  }

  function clearLocal(sid: number | null) {
    if (!import.meta.client || !sid) return
    try { sessionStorage.removeItem(localResumeKey(sid)) } catch { /* non-fatal */ }
  }

  function choose(letter: string) {
    const qid = current.value?.id
    // Allow choosing on a skipped question (skipped is not graded); only a
    // truly graded (correct/incorrect) answer locks the question.
    if (!qid || isGraded(result.value[qid])) return
    chosen.value = { ...chosen.value, [qid]: letter }
    persistLocal()   // instant local snapshot — survives a refresh before the debounced backend sync fires
    // Persist the in-flight selection to the backend (debounced) so an
    // accidental refresh — or logging in on a different device — restores the
    // chosen option even before the student submits. loadSession() reads
    // row.chosen_answer back into `chosen` on mount.
    syncQuestion(qid, { chosen_answer: letter })
  }

  function submit() {
    const q = current.value
    const ch = chosen.value[q.id]
    if (!ch) return
    const r = ch === q.ans ? 'correct' : 'incorrect'
    result.value = { ...result.value, [q.id]: r }
    submitted.value = true
  }

  function skip() {
    result.value = { ...result.value, [current.value.id]: 'skipped' }
    goNext()
  }

  function goNext() {
    if (idx.value < questions.value.length - 1) idx.value++
    // Derive `submitted` from the question we land on — with Left/Right keyboard
    // navigation you can move forward onto a previously-answered question, which
    // must show its post-answer (verdict) state, not a blank one. (goPrev /
    // goToQuestion already do this; skipped is not graded, so it stays open.)
    submitted.value = isGraded(result.value[questions.value[idx.value]?.id])
    persistLocal()   // keep cached idx fresh so resume lands on the right question
  }

  function goPrev() {
    if (idx.value <= 0) return  // FIX: true guard — prevents no-op click at Q1
    idx.value--
    // Skipped is not "submitted" — only a graded answer flips the page into its
    // post-answer (locked/verdict) state.
    submitted.value = isGraded(result.value[questions.value[idx.value].id])
    persistLocal()
  }

  // toggleFlag — flip local state AND sync to the question_flags table via
  // POST /flags/review. The endpoint is an idempotent upsert (creates the
  // row if absent, no-op otherwise). The backend currently has no single
  // unflag endpoint, so an "un-flag" only updates local UI state; the
  // server-side row persists until the user resets all flags from the
  // Flagged Questions page.
  async function toggleFlag() {
    const qid = current.value?.id
    if (!qid) return
    const newVal = !flagged.value[qid]
    const prev   = flagged.value[qid]
    flagged.value = { ...flagged.value, [qid]: newVal }
    try {
      const studentApi = useStudentApi()
      // Add → /flags/review (upsert); remove → /flags/unflag (delete the row).
      await studentApi(newVal ? '/flags/review' : '/flags/unflag', {
        method: 'POST',
        body: { question_id: qid },
      })
    } catch (e) {
      log.warn('session', 'toggleFlag sync failed', e)
      flagged.value = { ...flagged.value, [qid]: prev }   // revert on failure
    }
  }

  function reset() {
    idx.value = 0; chosen.value = {}; result.value = {}; flagged.value = {}
    secs.value = 0; submitted.value = false
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }

  // Hydrate sessionId + inProgressMode from the backend so the sidebar's
  // "Continue session" CTA appears after a fresh login on ANY device (the
  // in-memory state above is lost on reload / new browser). No-ops if a
  // session is already active in memory, or if the user has none in progress.
  async function hydrateActiveSession() {
    if (sessionId.value) return
    try {
      const studentApi = useStudentApi()
      const res: any = await studentApi('/sessions/active', { method: 'GET' })
      const d = res?.data
      // Only restore the "Continue session" CTA for a GENUINELY in-progress
      // session. The endpoint can still hand back a session that has since been
      // completed/abandoned (the backend's active-session pointer isn't always
      // cleared on /complete), and completeSession() having nulled the in-memory
      // state doesn't help if we then blindly re-restore it here — that's the
      // exact reason the CTA kept reappearing after finishing a session.
      const status   = String(d?.status ?? '').toLowerCase().replace(/[\s-]/g, '_')
      const terminal = ['completed', 'complete', 'finished', 'abandoned', 'submitted', 'graded'].includes(status)
      const inProgress =
        d?.in_progress === true ||
        ['in_progress', 'active', 'started', 'paused', 'resumable'].includes(status) ||
        status === ''   // endpoint sends no status → assume it already filtered to active
      if (d?.session_id && inProgress && !terminal) {
        sessionId.value = Number(d.session_id)
        inProgressMode.value = d.mode === 'timed' ? 'timed' : 'tutor'
      }
    } catch (e) {
      // No active session / endpoint not deployed yet → just don't show the CTA.
      log.warn('session', 'hydrateActiveSession failed', e)
    }
  }

  return {
    // state
    questions, idx, chosen, result, flagged, secs, submitted,
    timerPerQ, loading, fetchError, totalQuestions,
    sessionId, inProgressMode, trialBlock,
    // computed
    current, total, answered, score, progress,
    // actions
    choose, submit, skip, goNext, goPrev, toggleFlag, reset, formatTime,
    fetchQuestions, fetchQbankInit, fetchQbankCount, fetchCategoryCounts,
    // backend session sync
    createBackendSession, syncQuestion, syncSession, completeSession, loadSession, flushPendingSyncs,
    hydrateFlaggedFromBackend, hydrateActiveSession,
  }
}
