// composables/useFlagged.ts
//
// State + actions for the Flagged Questions page. Wired to the live
// /api-student/v1/flags/* endpoints (Api_student_question_flagController).
// Backed by the QuestionFlag model / question_flags table — one row per
// (user_id, question_id) with review, views, notes, pin.
//
// Endpoints used (matches deployed routes/api-student.php exactly):
//   GET  /flags                      → index (paginated, search)
//   GET  /flags/count                → counts {all_total, total_view}
//   GET  /flags/previouslyWrongCount → distinct wrong-answer count
//   POST /flags/review               → upsert flag (body: question_id)
//   POST /flags/view                 → upsert view flag (body: question_id)
//   POST /flags/save/{id}            → save notes (URL: flag.id, body: notes)
//   POST /flags/unreview-all         → wipe all flags for user
//
// Single-unflag is supported via POST /flags/unflag {question_id} (deletes the
// row for this user+question). Reset-all (/flags/unreview-all) remains the
// authoritative bulk-clear.

export interface FlagOption {
  id: number
  option_text: string
  is_correct: boolean | number | string
  position: number | null
}

export interface FlaggedQ {
  id: number                // question_flags.id (use for save-note URL)
  question_id: number       // questions.id
  user_id: number
  review: number            // 0 | 1
  views: number             // 0 | 1 — legacy, not used for icon now
  notes: string
  question_stem: string
  question_image_ids: string   // image URL shown under the stem (may be '')
  type: string
  difficulty: string
  category_id: number | null
  category_name: string
  options: FlagOption[]
  result: 'correct' | 'incorrect' | 'skipped' | null   // latest attempt
  created_at: string | null
}

export interface CategoryOption {
  id: number
  name: string
}

export interface FlagCounts {
  all_total: number         // /flags/count → all_total
  total_view: number        // /flags/count → total_view
  previously_wrong: number  // /flags/previouslyWrongCount → count
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function mapRow(r: any): FlaggedQ {
  const opts = Array.isArray(r?.options) ? r.options : []
  const rawResult = r?.result
  const result: 'correct' | 'incorrect' | 'skipped' | null =
    rawResult === 'correct' || rawResult === 'incorrect' || rawResult === 'skipped'
      ? rawResult
      : null
  return {
    id:            Number(r?.id ?? 0),
    question_id:   Number(r?.question_id ?? 0),
    user_id:       Number(r?.user_id ?? 0),
    review:        Number(r?.review ?? 0),
    views:         Number(r?.views ?? 0),
    notes:         String(r?.notes ?? ''),
    question_stem: String(r?.question_stem ?? ''),
    question_image_ids: String(r?.question_image_ids ?? ''),
    type:          String(r?.type ?? ''),
    difficulty:    String(r?.difficulty ?? 'intermediate').toLowerCase(),
    category_id:   r?.category_id != null ? Number(r.category_id) : null,
    category_name: String(r?.category_name ?? ''),
    options: opts.map((o: any) => ({
      id:          Number(o?.id ?? 0),
      option_text: String(o?.option_text ?? ''),
      is_correct:  o?.is_correct ?? false,
      position:    o?.position != null ? Number(o.position) : null,
    })),
    result,
    created_at:    r?.created_at ? String(r.created_at) : null,
  }
}

export function isCorrectOpt(v: any): boolean {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true'
}

export function shortStem(stem: string, max = 130): string {
  if (!stem) return ''
  // Strip ALL HTML tags for the collapsed preview so the card text is clean,
  // single-line plain text (imported questions are stored wrapped in <p>…</p>
  // and lists, which otherwise show up as a literal "<p>"). Full HTML stays for
  // the expanded body via v-html + sanitizeHtml.
  const plain = stem.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return plain.length > max ? plain.slice(0, max) + '…' : plain
}

export const useFlagged = () => {
  // ─── Shared reactive state ──────────────────────────────────────────
  const list       = useState<FlaggedQ[]>('flagged:list', () => [])
  const categories = useState<CategoryOption[]>('flagged:categories', () => [])
  const counts     = useState<FlagCounts>('flagged:counts', () => ({
    all_total: 0, total_view: 0, previously_wrong: 0,
  }))
  const loading    = useState<boolean>('flagged:loading', () => false)
  const saving     = useState<boolean>('flagged:saving', () => false)
  const fetchError = useState<string>('flagged:error', () => '')

  // Filter state — persisted across navigation via useState.
  const search       = useState<string>('flagged:search', () => '')
  const statusFilter = useState<'all' | 'correct' | 'wrong' | 'unseen'>('flagged:status', () => 'all')
  // topicFilter is a category id (number) or 'all'. Stored as string in
  // useState so the <select v-model> binding stays simple — we coerce to
  // number where needed.
  const topicFilter  = useState<string>('flagged:topic',  () => 'all')
  const sortBy       = useState<'newest' | 'topic' | 'wrong_first'>('flagged:sort', () => 'newest')

  // ─── List ────────────────────────────────────────────────────────────
  async function fetchFlagged(opts: { limit?: number; page?: number } = {}) {
    // Auth gate — bail silently before auth_user hydrates so we don't
    // 401-cascade and log the user out.
    const user = useState<any | null>('auth_user', () => null)
    if (!user.value) {
      loading.value = false
      return
    }
    loading.value = true
    fetchError.value = ''
    try {
      const studentApi = useStudentApi()
      const params: Record<string, any> = {
        limit: opts.limit ?? 100,
      }
      if (opts.page) params.page = opts.page
      if (search.value.trim()) params.search = search.value.trim()

      const res: any = await studentApi('/flags', { method: 'GET', params })
      const rows = Array.isArray(res?.data) ? res.data : []
      // Every row returned by /flags is treated as currently flagged —
      // the controller's review() upsert keeps the row present whenever
      // a flag exists, and rows are removed via /flags/unreview-all only.
      // (Filtering by review===1 here used to hide everything because the
      // controller creates rows with review=0 by default.)
      list.value = rows.map(mapRow)
    } catch (e: any) {
      fetchError.value = e?.data?.msg || e?.message || 'Failed to load flagged questions.'
      list.value = []
    } finally {
      loading.value = false
    }
  }

  // ─── Categories ──────────────────────────────────────────────────────
  // Pull the full list of categories for the dropdown so the user can
  // pick from every option, not just the ones already in their flagged
  // set. Cached in useState so we don't re-fetch on every page mount.
  async function fetchCategories(force = false) {
    const user = useState<any | null>('auth_user', () => null)
    if (!user.value) return
    if (!force && categories.value.length > 0) return
    try {
      const studentApi = useStudentApi()
      const res: any = await studentApi('/flags/categories', { method: 'GET' })
      const rows = Array.isArray(res?.data) ? res.data : []
      categories.value = rows
        .map((c: any) => ({ id: Number(c?.id ?? 0), name: String(c?.name ?? '') }))
        .filter((c: CategoryOption) => c.id > 0 && c.name.trim().length > 0)
    } catch (e) {
      log.warn('flagged', 'fetchCategories failed', e)
    }
  }

  // ─── Counts ─────────────────────────────────────────────────────────
  // Two parallel requests — /flags/count gives total + viewed, and
  // /flags/previouslyWrongCount gives the distinct wrong-attempt count.
  async function fetchCounts() {
    const user = useState<any | null>('auth_user', () => null)
    if (!user.value) return
    try {
      const studentApi = useStudentApi()
      const [countRes, wrongRes]: any[] = await Promise.all([
        studentApi('/flags/count'),
        studentApi('/flags/previouslyWrongCount'),
      ])
      counts.value = {
        all_total:        Number(countRes?.all_total  ?? 0),
        total_view:       Number(countRes?.total_view ?? 0),
        previously_wrong: Number(wrongRes?.count      ?? 0),
      }
    } catch (e) {
      log.warn('flagged', 'fetchCounts failed', e)
    }
  }

  // ─── Flag a question — used by session pages (tutor/timed/review) ───
  // POST /flags/review {question_id}. The controller does an upsert; if
  // the row doesn't exist it's created, if it does the call is idempotent.
  async function flagQuestion(questionId: number): Promise<boolean> {
    try {
      const studentApi = useStudentApi()
      await studentApi('/flags/review', {
        method: 'POST',
        body: { question_id: questionId },
      })
      return true
    } catch (e) {
      log.warn('flagged', 'flagQuestion failed', e)
      return false
    }
  }

  // ─── Unflag single — optimistic remove + real backend delete ─────────
  // POST /flags/unflag {question_id} deletes the QuestionFlag row for this
  // user+question, so the removal persists across refreshes. Optimistically
  // splice locally first; on failure, refetch to resync rather than guess.
  async function unflag(questionId: number): Promise<boolean> {
    const idx = list.value.findIndex(q => q.question_id === questionId)
    if (idx === -1) return false
    const removed = list.value[idx]
    list.value.splice(idx, 1)
    counts.value.all_total = Math.max(0, counts.value.all_total - 1)
    try {
      const studentApi = useStudentApi()
      await studentApi('/flags/unflag', {
        method: 'POST',
        body: { question_id: questionId },
      })
      return true
    } catch (e) {
      // Roll the optimistic removal back so the UI reflects reality.
      log.warn('flagged', 'unflag failed', e)
      list.value.splice(idx, 0, removed)
      counts.value.all_total += 1
      return false
    }
  }

  // ─── Reset all flags ─────────────────────────────────────────────────
  async function resetAll(): Promise<boolean> {
    const prev = list.value.slice()
    const prevCounts = { ...counts.value }
    list.value = []
    counts.value = { ...counts.value, all_total: 0, total_view: 0 }
    saving.value = true
    try {
      const studentApi = useStudentApi()
      await studentApi('/flags/unreview-all', { method: 'POST' })
      return true
    } catch (e) {
      log.warn('flagged', 'resetAll failed', e)
      list.value = prev
      counts.value = prevCounts
      return false
    } finally {
      saving.value = false
    }
  }

  // ─── Save notes ──────────────────────────────────────────────────────
  // Backend takes flag.id in the URL (not question_id) and notes in body.
  async function saveNote(flagId: number, notes: string): Promise<boolean> {
    const item = list.value.find(q => q.id === flagId)
    const prev = item?.notes ?? ''
    if (item) item.notes = notes
    saving.value = true
    try {
      const studentApi = useStudentApi()
      await studentApi(`/flags/save/${flagId}`, {
        method: 'POST',
        body: { notes },
      })
      return true
    } catch (e) {
      log.warn('flagged', 'saveNote failed', e)
      if (item) item.notes = prev
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    // state
    list, categories, counts, loading, saving, fetchError,
    // filter state
    search, statusFilter, topicFilter, sortBy,
    // actions
    fetchFlagged, fetchCounts, fetchCategories,
    flagQuestion, unflag, resetAll, saveNote,
    // helpers
    isCorrectOpt, shortStem,
  }
}
