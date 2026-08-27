export interface Exam {
  id: string                      // Unique key — 'se_<id>' personal, 'inst_<id>' Institution Q Bank
  source: 'personal' | 'institute' | 'institution'  // 'institution' = combined Institution Q Bank
  institutionId?: number | string | null            // set when source === 'institution'
  examId: number | string         // Underlying exams.id (use this for dedupe / API calls)
  name: string                    // exams.name
  targetDate: string              // Formatted "Mon YYYY"  (or 'Assigned' for institute exams without expiry)
  daysLeft: number                // Computed from expiry_date (0 if missing / past)
  expiryRaw: string | null        // Raw expiry_date for any consumer that needs the real date
  plan: string | null             // student_exams.plan (e.g. '1', '3', '12' months) — null for institute
  trialRemaining: number | null   // free-trial questions left in the 50 pool (plan '0'); null otherwise
  institution: { id: number | string; name: string } | null   // null for personal
  isActive: boolean               // true if this is the currently-active selection (from server)
}

// Shape returned by /api-student/v1/exams/my-exams (one item).
// The server now embeds the active-flag right in this response so the sidebar
// doesn't have to make a second round-trip to /active-exam (which caused a
// brief "first exam shown → then actual active exam" flicker on load).
interface ExamApiItem {
  id: string | number
  source?: 'personal' | 'institute' | 'institution'
  exam_id?: number | string | null
  institution_id?: number | string | null
  is_active?: boolean
  expiry_date?: string | null
  plan?: string | null
  trial_remaining?: number | null
  exam?: { id: number | string; name: string } | null
  institution?: { id: number | string; name: string } | null
}

interface ExamApiResponse {
  status: 'success' | 'error'
  msg: string
  data?: ExamApiItem[]
  active_exam_id?: number | string | null   // top-level convenience field
}

function formatMonthYear(raw: string): string {
  // DB stores values like "2026-04-30 00:00:00" — replace the space with T so
  // Safari/iOS parse it correctly as well.
  const d = new Date(raw.replace(' ', 'T'))
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function computeDaysLeft(raw: string): number {
  const d = new Date(raw.replace(' ', 'T'))
  if (isNaN(d.getTime())) return 0
  const ms = d.getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

function mapApiItem(item: ExamApiItem): Exam {
  const source = item.source === 'institution' ? 'institution'
    : item.source === 'institute' ? 'institute' : 'personal'
  const expiry = item.expiry_date || null
  return {
    id: String(item.id),
    source,
    institutionId: source === 'institution'
      ? (item.institution_id ?? item.institution?.id ?? null)
      : null,
    examId: item.exam_id ?? '',
    name: item.exam?.name || (source === 'institution' ? 'Institution Q Bank' : 'Untitled exam'),
    targetDate: expiry
      ? formatMonthYear(expiry)
      : source === 'institution' ? (item.institution?.name || 'Institution')
      : source === 'institute' ? 'Institute-assigned' : '—',
    daysLeft: expiry ? computeDaysLeft(expiry) : 0,
    expiryRaw: expiry,
    plan: item.plan ?? null,
    trialRemaining: item.trial_remaining ?? null,
    institution: item.institution ?? null,
    isActive: !!item.is_active,
  }
}

export const useExam = () => {
  const exams        = useState<Exam[]>('exams', () => [])
  const activeExamId = useState<string>('exam:active', () => '')
  const loading      = useState<boolean>('exam:loading', () => false)
  const error        = useState<string | null>('exam:error', () => null)
  const loaded       = useState<boolean>('exam:loaded', () => false)
  // examSwitching = true the INSTANT the user picks a new exam in the
  // sidebar (before the POST /active-exam/set completes). Pages like
  // qbank.vue / past.vue read this and flip into skeleton mode so the user
  // sees an immediate "loading" cue instead of waiting for the network
  // round-trip to finish before any UI feedback. Cleared by the consuming
  // page once its own data fetch resolves.
  const examSwitching = useState<boolean>('exam:switching', () => false)

  const activeExam = computed<Exam>(() =>
    exams.value.find(e => e.id === activeExamId.value)
      ?? exams.value[0]
      ?? {
        id: '', source: 'personal', examId: '', name: 'No exam selected',
        targetDate: '—', daysLeft: 0, expiryRaw: null, plan: null, institution: null,
        isActive: false,
      }
  )

  // ─── Persistence: student_active_exam_portal ────────────────────────────────
  // setActive() POSTs the user's selection to /active-exam/set. The Laravel
  // controller updateOrCreates a single row per user (one row per user_id,
  // exam_id is overwritten on each switch — no duplicates, no history).
  // The next time /exams/my-exams is fetched, the active row's is_active
  // flag reflects the change.

  async function persistActiveExam(exam: Exam): Promise<void> {
    const studentApi = useStudentApi()
    // Institution Q Bank → institution scope; everything else → exam scope.
    const body = exam.source === 'institution'
      ? { scope: 'institution', institution_id: Number(exam.institutionId) }
      : { scope: 'exam', exam_id: typeof exam.examId === 'string' ? Number(exam.examId) : exam.examId }
    await studentApi('/active-exam/set', { method: 'POST', body })
  }

  // setActive: persist the change BEFORE flipping the local reactive state.
  // Reason — qbank.vue and past.vue watch `activeExam.examId` and trigger
  // their respective `/qbank/init` and `/sessions` calls the moment it
  // changes. The backend resolves the active exam from
  // `student_active_exam_portal` for the logged-in user, so those follow-up
  // GETs MUST see the updated row. If we flipped local state first (the old
  // "optimistic" order), the GETs would race against the POST and hit the
  // OLD exam — which is exactly what made "the qbank API call not firing on
  // active-exam change" feel broken.
  async function setActive(id: string): Promise<void> {
    examSwitching.value = true

    // Safety timeout — if no consuming page (qbank/past) mounts to clear
    // the flag within 8s, self-clear so a stale flag from one navigation
    // doesn't haunt subsequent ones (e.g. user switches exam while sitting
    // on Settings → never lands on qbank → flag would otherwise stick).
    const safety = setTimeout(() => {
      if (examSwitching.value) examSwitching.value = false
    }, 8000)

    const exam = exams.value.find(e => e.id === id)
    // Institution Q Bank scopes by institutionId and has NO examId (examId is
    // '' for it), so only a missing exam — or a personal/institute exam that
    // genuinely lacks an examId — should skip the persist. Without this
    // exemption the institution entry flipped the local UI to "active" but
    // never POSTed /active-exam/set, leaving the DB on the old exam_id.
    const persistable = exam && (exam.source === 'institution' ? !!exam.institutionId : !!exam.examId)
    if (!persistable) {
      activeExamId.value = id
      examSwitching.value = false
      clearTimeout(safety)
      return
    }
    try {
      await persistActiveExam(exam)
    } catch (e) {
      log.warn('useExam', 'failed to persist active exam', e)
    }
    activeExamId.value = id
    // examSwitching stays true; consuming pages clear it in their finally
    // block. The 8s safety above guarantees no permanent stuck state.
  }

  async function fetchExams(force = false) {
    if (loading.value) return
    if (loaded.value && !force) return

    loading.value = true
    error.value = null
    try {
      const studentApi = useStudentApi()
      const res = await studentApi<ExamApiResponse>('/exams/my-exams')
      const list = (res.data || []).map(mapApiItem)
      exams.value = list

      // Use the is_active flag returned by the server in the SAME response —
      // no second API call, no flicker.
      const active = list.find(e => e.isActive)
      if (active) {
        activeExamId.value = active.id
      } else if (list.length && !list.find(e => e.id === activeExamId.value)) {
        // No server-side selection yet — default to the first exam in the list.
        activeExamId.value = list[0]!.id
      }
      loaded.value = true
    } catch (e: any) {
      if (e?.response?.status === 404) {
        exams.value = []
        loaded.value = true
      } else {
        error.value = e?.data?.msg || e?.message || 'Failed to load exams'
      }
    } finally {
      loading.value = false
    }
  }

  return { exams, activeExam, activeExamId, setActive, fetchExams, loading, error, loaded, examSwitching }
}
