<script setup lang="ts">

// Permission matrix (admin panel → Role Matrix). The same rules are enforced
// server-side by the perm: middleware, so hiding a button is UX, not the
// security boundary.
//
//   canEdit   → author, import, update, duplicate a question   (perm:question_bank,edit)
//   canManage → APPROVE / REJECT it into the live bank         (perm:question_bank,full)
//
// Writing a question and deciding it goes live in front of students are separate
// acts. Splitting them is what lets an admin give a Professor a bank they can
// author in without letting them publish unreviewed material.
const { canEdit, canManage, readOnly } = useInstitutePermissions()
const PERM_AREA = 'question_bank' as const

import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import {
  qbSpecialties, qbSubLabel, qbSpecialty,
  diffColor, diffBg, pctColor,
  type Difficulty
} from '../../composables/useQuestionBank'
const { instName } = useInstitution()

definePageMeta({ layout: 'institute' })
useHead({ title: 'Question Bank · Institute' })

// ── Types ────────────────────────────────────────────────────────────────────
type ApiQuestion = {
  id: number
  qid?: number
  question_stem: string
  question_image_ids: string
  explanation: string | null
  difficulty: string
  pct_correct: number | null
  uses: number
  topic_id?: number
  subject_id?: number
  exam_id?: number
  topic?: { id: number; name: string } | null
  subject?: { id: number; name: string } | null
  domain?: { id: number; name: string } | null
  category?: { id: number; name: string } | null
  exam?: { id: number; name: string } | null
  question_options?: { id: number; question_id: number; option_text: string; is_correct: number }[]
  is_flagged?: boolean
  question_owner?: number | null
  visibility?: string | null
  // ISO Y-m-d date the question was last edited/imported (backend-stamped).
  last_updated?: string | null
  // Stamped by the backend: true = this institution's OWN question (Institution
  // badge + exam name + Edit), false = shared-pool question (Shared badge + View).
  owned?: boolean
}

type CountsData = {
  total: number             // questions in the CURRENT filtered view
  accessible_total: number  // whole accessible bank (own + shared), ignores filters
  hard_count: number        // Advanced + Expert, in the current view
  avg_correct: number       // real cohort avg correct across the current view
  flagged_count: number     // flagged in the current view
  needs_review: number      // imported questions awaiting approval (status 4)
  institute_count: number   // this institution's OWN questions (card 1)
  shared_count: number      // shared-pool questions from other institutions (card 2)
}

// ── API ───────────────────────────────────────────────────────────────────────
const api    = useInstituteApi()
const route  = useRoute()

const questions      = ref<ApiQuestion[]>([])
const loading        = ref(true)
const counts         = ref<CountsData>({ total: 0, accessible_total: 0, hard_count: 0, avg_correct: 0, flagged_count: 0, needs_review: 0, institute_count: 0, shared_count: 0 })
const countsLoading  = ref(true)
// "Needs Review" queue mode — when on, the list is filtered to status 4 (imported
// questions awaiting approval) and per-row Approve / Reject actions are shown.
const reviewMode     = ref(false)

// ── Server-side pagination ────────────────────────────────────────────────────
const page       = ref(1)
const pageSize   = ref(20)   // default 20; selectable 20 / 50 / 100 (+200/500/All)
const totalCount = ref(0)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const pageStart  = computed(() => (page.value - 1) * pageSize.value + 1)
const pageEnd    = computed(() => Math.min(page.value * pageSize.value, totalCount.value))

// Row-size options adapt to how many questions match. ≤100: fixed 20/50/100.
// >100: 20/50/100/200/500 (only sizes below the total) + a final "All" = the
// exact total, so everything can be shown on one page.
const pageSizeOptions = computed<number[]>(() => {
  const total = totalCount.value
  if (total <= 100) return [20, 50, 100]
  const opts = [20, 50, 100, 200, 500].filter(n => n < total)
  opts.push(total) // final "All" option
  return opts
})
// Skeleton placeholder rows — capped so a large page size (e.g. 100 / "All")
// still renders a clean, snappy loading state instead of hundreds of rows.
const skeletonRows = computed(() => Math.min(pageSize.value, 12))

// ── Filters ───────────────────────────────────────────────────────────────────
const search           = ref('')
const selectedTopicId  = ref<string | null>(null)   // specialty id from qbSpecialties
const difficulty       = ref<'all' | Difficulty>('all')
// Bank source (backend `source` param): all | mine (this institution) |
// public (the shared pool). Passmed is intentionally NOT an option here — the
// Question Bank page never surfaces Passmed (that lives in the mock builder).
const source           = ref<'all' | 'mine' | 'public'>('all')  // default tab = All Questions
// "Authored by me" — filters the list + counts to questions THIS user created
// (created_by / author_user_id = me). Mutually exclusive with the source cards.
const authoredByMe      = ref(false)
// Exam filter — the institution's own exams (for the Exam dropdown). null = All.
const examOptions      = ref<Array<{ id: number; name: string }>>([])
const selectedExamId   = ref<number | null>(
  route.query.eid ? Number(route.query.eid) : null,
)
// Taxonomy filters (controlled-vocabulary dropdowns). null = any. Options come
// from the /questionbank/facets endpoint (only values present in the current scope).
const subjectId        = ref<number | null>(null)
const categoryId       = ref<number | null>(null)   // Sub-topic (replaced Domain filter)
const disciplineId     = ref<number | null>(null)
const learningOutcomeId = ref<number | null>(null)
const facetSubjects    = ref<Array<{ id: number; name: string }>>([])
const facetCategories  = ref<Array<{ id: number; name: string }>>([])
const facetDisciplines = ref<Array<{ id: number; name: string }>>([])
// Learning Outcome (= the import sheet's Cognitive Task) is a real taxonomy now, so
// it gets a facet-driven filter like the rest.
const facetLearningOutcomes = ref<Array<{ id: number; name: string }>>([])
// Difficulty is the odd one out: questions store its SLUG, not an id — so these carry
// `slug` and the filter binds on that. Curatable now, hence facet-driven rather than
// the hardcoded four levels the pills used to assume.
const facetDifficulties = ref<Array<{ id: number; name: string; slug: string }>>([])
const flaggedOnly      = ref(false)
const subjectDropOpen  = ref(false)
const sortKey          = ref('id')
const sortDir          = ref<'asc' | 'desc'>('asc')

// ── Local flag overrides ──────────────────────────────────────────────────────
const localFlagged = ref<Set<number>>(new Set())
const localUnflagged = ref<Set<number>>(new Set())

function isFlagged(q: ApiQuestion) {
  if (localUnflagged.value.has(q.id)) return false
  if (localFlagged.value.has(q.id))   return true
  return !!q.is_flagged
}

// Imported question content is stored as HTML (the student portal renders it via
// sanitized v-html). This management view shows those fields via {{ }}, so convert
// HTML → plain text for display: paragraph/line-break tags become newlines
// (paired with white-space:pre-line in CSS), other tags are dropped, entities
// decoded. Stored data is untouched — we never write this back. Not v-html, so no
// XSS surface here.
// Format an ISO date (Y-m-d) for the "Last updated" column, e.g. "8 Aug 2026".
// Empty/invalid → an em-dash so the column never shows a broken date.
function fmtDate(input: unknown): string {
  if (!input) return '—'
  const d = new Date(String(input))
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function plain(input: unknown): string {
  const s = input == null ? '' : String(input)
  if (!s) return ''
  let t = s
    .replace(/\s*<\/p\s*>\s*<p[^>]*>\s*/gi, '\n\n') // </p><p> → blank line
    .replace(/<br\s*\/?>/gi, '\n')                   // <br> → newline
    .replace(/<\/p\s*>/gi, '\n\n')                   // trailing </p>
    .replace(/<p[^>]*>/gi, '')                        // opening <p>
    // Lists MUST be handled before the catch-all below, which drops tags without
    // leaving a newline behind — imported "Key Takeaways" bullets were collapsing
    // into one unbroken run of text ("point onepoint twopoint three").
    .replace(/<li[^>]*>/gi, '• ')                     // item marker
    .replace(/<\/li\s*>/gi, '\n')                     // one item per line, kept tight
    .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')             // list sits on its own block
    .replace(/<\/?[^>]+>/g, '')                       // drop any other stray tags
  // Decode HTML entities via the browser (client-only); safe textContent read.
  if (import.meta.client && t.includes('&')) {
    const el = document.createElement('textarea')
    el.innerHTML = t
    t = el.value
  }
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
async function toggleFlag(id: number) {
  const q = questions.value.find(q => q.id === id)
  if (!q) return
  const currently = isFlagged(q)
  const revert = () => {
    if (currently) { localFlagged.value.add(id); localUnflagged.value.delete(id) }
    else           { localUnflagged.value.add(id); localFlagged.value.delete(id) }
  }
  // Optimistic local flip so the button responds instantly.
  if (currently) { localFlagged.value.delete(id); localUnflagged.value.add(id) }
  else           { localUnflagged.value.delete(id); localFlagged.value.add(id) }
  try {
    const res: any = await api(`/questions/${id}/flag`, { method: 'POST' })
    if (res?.status === 'success') {
      // Refresh the Flagged stat card; if we're viewing flagged-only, refresh the list
      // too so an unflagged row drops out.
      fetchCounts()
      if (flaggedOnly.value) fetchQuestions()
    } else {
      revert()
    }
  } catch {
    revert()
  }
}

// ── Fetch questions ───────────────────────────────────────────────────────────
let searchTimer: ReturnType<typeof setTimeout> | null = null

// Shared filter params — used by BOTH the list and the counts call so the four
// stat cards always describe exactly the set the table is showing.
function filterParams(): Record<string, any> {
  const q: Record<string, any> = {}
  if (selectedExamId.value)       q.eid           = selectedExamId.value
  if (search.value.trim())        q.search        = search.value.trim()
  if (selectedTopicId.value)      q.topic_name    = qbSpecialties.find(s => s.id === selectedTopicId.value)?.label ?? selectedTopicId.value
  if (difficulty.value !== 'all') q.difficulty    = difficulty.value
  if (subjectId.value)            q.subject_id    = subjectId.value
  if (categoryId.value)           q.category_id   = categoryId.value
  if (disciplineId.value)         q.discipline_id = disciplineId.value
  if (learningOutcomeId.value)    q.learning_outcome_id = learningOutcomeId.value
  if (source.value !== 'all')     q.source        = source.value
  if (authoredByMe.value)         q.author        = 'me'
  if (flaggedOnly.value)          q.flagged_only  = 1
  if (reviewMode.value)           q.status        = 4   // Needs Review queue
  return q
}

// Taxonomy dropdown options for the current scope (exam + source). Independent
// dropdowns: options reflect the scope, not each other. Refetched when the exam
// or source changes (which changes the available pool).
async function fetchFacets() {
  try {
    const query: Record<string, any> = { include_passmed: 0 }
    if (selectedExamId.value)   query.eid    = selectedExamId.value
    if (source.value !== 'all') query.source = source.value
    const res = await api<any>('/questionbank/facets', { query })
    const d = res?.data ?? res
    facetSubjects.value    = Array.isArray(d?.subjects)    ? d.subjects    : []
    facetCategories.value  = Array.isArray(d?.categories)  ? d.categories  : []
    facetDisciplines.value = Array.isArray(d?.disciplines) ? d.disciplines : []
    facetLearningOutcomes.value = Array.isArray(d?.learning_outcomes) ? d.learning_outcomes : []
    facetDifficulties.value     = Array.isArray(d?.difficulties)      ? d.difficulties      : []
  } catch { /* dropdowns stay empty */ }
}

async function fetchQuestions(silent = false) {
  // silent = true → refresh rows WITHOUT flipping the skeleton loader. Used by the
  // import live-refresh after its first pass so the table updates quietly instead of
  // flashing the skeleton every few seconds.
  if (!silent) loading.value = true
  try {
    const query: Record<string, any> = {
      page:    page.value,
      limit:   pageSize.value,
      orderBy: sortDir.value,
      // Bank page never surfaces Passmed — enforced server-side (query scope),
      // not merely hidden in the UI.
      include_passmed: 0,
      ...filterParams(),
    }

    const res = await api<any>('/questionbanklist', { query })
    // Envelope-tolerant read (mirrors fetchCounts): the payload is normally the
    // body itself ({ status, data, total }), but tolerate a defensive `.data`
    // wrap so a proxy/shape change can't silently blank the table. Accept when
    // status === 'success' OR the data path is an array.
    const body = (res && res.status === undefined && res.data) ? res.data : res
    const rows = Array.isArray(body?.data) ? body.data : []
    if (body?.status === 'success' || Array.isArray(body?.data)) {
      questions.value  = rows
      totalCount.value = Number(body?.total ?? rows.length) || 0
    } else {
      questions.value = []
    }
  } catch (e) {
    // Don't swallow silently — an empty table with no signal was the original
    // "shows 2207 but list is empty" symptom when the list call errored.
    logError('[question-bank] fetchQuestions failed', e)
    questions.value = []
  } finally {
    if (!silent) loading.value = false
  }
}

async function fetchCounts(silent = false) {
  // silent = true → recompute the cards WITHOUT flipping their skeleton loader. Used
  // by the import live-refresh after its first pass so the four cards update quietly.
  if (!silent) countsLoading.value = true
  try {
    // Counts follow the SAME filters as the list, so the four cards recompute to
    // the current view (e.g. flagged shows flagged-in-selection, not a global).
    const res = await api<any>('/questionbankcount', { query: filterParams() })
    // API returns { status, data: { total_questions, accessible_total,
    // hard_questions, flagged_questions, cohort_avg_correct } }
    const d = res?.data ?? res
    counts.value = {
      total:            parseInt(d?.total_questions   ?? d?.total           ?? 0),
      accessible_total: parseInt(d?.accessible_total  ?? d?.total_questions ?? 0),
      hard_count:       parseInt(d?.hard_questions    ?? d?.hard_count      ?? 0),
      flagged_count:    parseInt(d?.flagged_questions ?? d?.flagged_count   ?? 0),
      needs_review:     parseInt(d?.needs_review       ?? 0),
      institute_count:  parseInt(d?.institute_questions ?? 0),
      shared_count:     parseInt(d?.shared_questions    ?? 0),
      avg_correct:      parseFloat(String(d?.cohort_avg_correct ?? d?.avg_correct ?? '0').replace('%', '')),
    }
  } catch {} finally { if (!silent) countsLoading.value = false }
}

// Page change → new list request (stats don't change across pages).
watch(page, fetchQuestions)
// Page size changed → back to page 1 and refetch (limit is already wired).
watch(pageSize, () => {
  if (page.value !== 1) page.value = 1   // triggers watch(page) → fetchQuestions
  else fetchQuestions()
})
// If filtering shrinks the total so the current size is no longer offered
// (e.g. "All"=1325 then a search narrows to 40), fall back to a valid size.
watch(pageSizeOptions, (opts) => {
  if (!opts.includes(pageSize.value)) pageSize.value = opts.includes(20) ? 20 : opts[opts.length - 1]
})

// Any filter change → refetch BOTH the list and the stats so the cards always
// track the current view.
function applyFilters() {
  fetchCounts()
  if (page.value !== 1) page.value = 1   // triggers watch(page) → fetchQuestions
  else fetchQuestions()
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(applyFilters, 350)
}

function setSort(key: string) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = key; sortDir.value = 'asc' }
  applyFilters()
}

function ariaSort(key: string): 'ascending' | 'descending' | 'none' {
  if (sortKey.value !== key) return 'none'
  return sortDir.value === 'asc' ? 'ascending' : 'descending'
}

// ── Filters UI ────────────────────────────────────────────────────────────────
function toggleTopic(id: string) {
  selectedTopicId.value = selectedTopicId.value === id ? null : id
  subjectDropOpen.value = false
  applyFilters()
}
function resetFilters() {
  search.value = ''; selectedTopicId.value = null
  difficulty.value = 'all'; flaggedOnly.value = false; reviewMode.value = false
  authoredByMe.value = false
  source.value = 'all'; selectedExamId.value = null   // reset → default All Questions tab
  subjectId.value = null; categoryId.value = null; disciplineId.value = null
  learningOutcomeId.value = null
  applyFilters()
  fetchFacets()   // scope reset → full option set again
}
const isFiltered = computed(() =>
  !!search.value || selectedTopicId.value !== null ||
  difficulty.value !== 'all' || source.value !== 'all' ||
  selectedExamId.value !== null || flaggedOnly.value ||
  subjectId.value !== null || categoryId.value !== null || disciplineId.value !== null ||
  learningOutcomeId.value !== null
)
// Source change: refetch both the list (via applyFilters) and the facet options,
// since a different pool exposes different subjects/domains/disciplines.
function onSourceChange() {
  applyFilters()
  fetchFacets()
}
// Source DROPDOWN change: part of the same single-filter model as the cards, so
// picking a source here also clears the Flagged / Needs-Review states.
function onSourceDropdown() {
  flaggedOnly.value = false
  reviewMode.value  = false
  onSourceChange()
}
// Stat-card click → TAB-STYLE single filter. The four cards map to three underlying
// dimensions (source = mine/public, flaggedOnly, reviewMode). Exactly ONE card is
// always active (default = Institute Qs / 'mine'); there is no "all" state via the
// cards. Clicking the already-active card is a no-op — the tab stays put no matter
// how many times it is clicked (an "all" view is still reachable via the source
// dropdown, which is intentionally left unchanged).
type CardKey = 'all' | 'mine' | 'public' | 'flagged' | 'review'
function selectCard(card: CardKey) {
  const alreadyActive =
    (card === 'all'     && source.value === 'all' && !flaggedOnly.value && !reviewMode.value && !authoredByMe.value) ||
    (card === 'mine'    && source.value === 'mine') ||
    (card === 'public'  && source.value === 'public') ||
    (card === 'flagged' && flaggedOnly.value) ||
    (card === 'review'  && reviewMode.value)
  if (alreadyActive) return   // already on this tab → do nothing (never deselect)

  // Switch tab: clear every dimension, then turn on only the clicked card.
  source.value      = 'all'
  flaggedOnly.value = false
  reviewMode.value  = false
  authoredByMe.value = false   // source cards are mutually exclusive with the chip
  if (card === 'mine' || card === 'public') source.value = card
  else if (card === 'flagged')              flaggedOnly.value = true
  else if (card === 'review')               reviewMode.value  = true
  // 'all' → everything already cleared above (source = 'all', no flag/review/author)

  // Refetch list + stats + facets (source pool may have changed).
  onSourceChange()
}
// The source dropdown carries a 4th "Authored by me" option. `sourceView` maps the
// dropdown value ↔ the underlying source / authoredByMe state, so the dropdown, the
// cards and the filter stay in sync. Selecting "author" turns on the author filter
// (source falls back to 'all'); any other value clears it.
const sourceView = computed<'all' | 'mine' | 'public' | 'author'>({
  get: () => (authoredByMe.value ? 'author' : source.value),
  set: (v) => {
    if (v === 'author') { authoredByMe.value = true; source.value = 'all' }
    else { authoredByMe.value = false; source.value = v }
  },
})
// Taxonomy dropdown change → narrow the list/stats (facets stay put — independent).
function onSubjectChange(v: string)    { subjectId.value    = v ? Number(v) : null; applyFilters() }
function onCategoryChange(v: string)   { categoryId.value   = v ? Number(v) : null; applyFilters() }
function onDisciplineChange(v: string) { disciplineId.value = v ? Number(v) : null; applyFilters() }
function onLearningOutcomeChange(v: string) { learningOutcomeId.value = v ? Number(v) : null; applyFilters() }

// ── Exam filter (institution's OWN exams only) ────────────────────────────────
// owned=1 → only exams the institution created (type=institution). Passmed's
// official exams must never appear in this dropdown — the bank page is scoped to
// the institution + shared pool, and exam is a local container here.
async function fetchExamOptions() {
  try {
    const res = await api<any>('/getexamsofinstitute', { query: { owned: 1 } })
    const list = res?.data?.exams ?? []
    examOptions.value = (Array.isArray(list) ? list : []).map((e: any) => ({ id: Number(e.id), name: e.name }))
  } catch (e) { /* dropdown just stays empty */ }
}
// Exam is a page-level filter now (not a route param). null = All exams.
// `selectedExamId` is declared with the other filters above.
function onExamChange(id: number | null) {
  const next = id ? Number(id) : null
  if (selectedExamId.value === next) return
  selectedExamId.value = next
  applyFilters()   // refetches list + stats for the new exam scope
  fetchFacets()    // new exam scope → different taxonomy options
}

// ── Page buttons ──────────────────────────────────────────────────────────────
const pageButtons = computed(() => {
  const tp = totalPages.value
  const p  = page.value - 1   // 0-indexed
  const n  = Math.min(tp, 7)
  return Array.from({ length: n }, (_, i) => {
    if (tp <= 7)   return i + 1
    if (p < 4)     return i + 1
    if (p > tp - 5) return tp - 7 + i + 1
    return p - 3 + i + 1
  })
})

// ── Question helpers ──────────────────────────────────────────────────────────
function qChoices(q: ApiQuestion): string[] {
  return (q.question_options ?? []).map(o => o.option_text)
}
function qCorrectIndex(q: ApiQuestion): number {
  return (q.question_options ?? []).findIndex(o => Number(o.is_correct) === 1)
}
function topicSpecialty(topicName?: string) {
  if (!topicName) return null
  return qbSpecialties.find(s => s.label.toLowerCase() === topicName.toLowerCase()) ?? null
}

const barColor = (pct: number) =>
  pct < 50 ? 'var(--rose)' : pct < 65 ? 'var(--amber)' : 'var(--teal)'

function diffPillStyle(d: 'all' | Difficulty) {
  const isActive = difficulty.value === d
  let border = 'var(--border)', bg = 'var(--white)', color = 'var(--ink-mid)'
  if (isActive) {
    if (d === 'advanced')        { border = 'var(--rose)';   bg = 'var(--rose-light)';   color = 'var(--rose)'    }
    else if (d === 'intermediate') { border = 'var(--amber)';  bg = 'var(--amber-light)';  color = 'var(--amber)'   }
    else if (d === 'foundation')   { border = 'var(--green)';  bg = 'var(--green-light)';  color = 'var(--green)'   }
    else if (d === 'expert')       { border = 'var(--purple)'; bg = 'var(--purple-light)'; color = 'var(--purple)'  }
    else                     { border = 'var(--teal)';   bg = 'var(--teal-pale)';    color = 'var(--teal-mid)'}
  }
  return { border, bg, color, fw: isActive ? 800 : 600 }
}

// ── Import modal ────────────────────────────────────────────────────────────────
const showImport = ref(false)
// When set, the Import modal opens straight to this stored summary (the reopened
// "View last import result"), matching the admin portal's full popup.
const previewSummary = ref<any>(null)
// Background import tracker — shows a top-of-page banner (progress + Cancel) when
// the Import modal is closed mid-import.
const imp = useImportProgress()
// Guard: block opening the Import modal while an import is active or paused
// (only one import runs at a time). The header button is also :disabled — this is
// defense-in-depth so a second import can never be started mid-run.
function openImport() {
  if (imp.active.value || imp.paused.value) return
  previewSummary.value = null   // fresh import → upload form, not a stored summary
  showImport.value = true
}
// Reopen the last import's FULL report in the modal (like admin), not the toast.
function openLastReportModal() {
  previewSummary.value = imp.lastReportSummary.value
  showImport.value = true
}
// Clear the stored summary once the modal closes so the next open starts clean.
watch(showImport, (open) => { if (!open) previewSummary.value = null })
watch(() => imp.finishedExamId.value, (exam) => {
  if (exam) { onImported(exam); imp.clearFinished() }
})

// Live-refresh the four stat cards AND the question list WHILE an import is running
// so both tick up as questions land, instead of only jumping at completion. Throttled
// to ~3s so the count aggregate + list query aren't hammered. First pass shows the
// skeletons; subsequent live passes update silently.
let lastCardRefresh = 0
let liveListRefreshedOnce = false
function liveRefresh() {
  const now = Date.now()
  if (now - lastCardRefresh > 3000) {
    lastCardRefresh = now
    const silent = liveListRefreshedOnce
    fetchCounts(silent)
    fetchQuestions(silent)
    liveListRefreshedOnce = true
  }
}
// Source 1: the background tracker (modal CLOSED — tracker polls + bumps imp.createdRow).
watch(() => imp.active.value, (a) => { if (a) liveListRefreshedOnce = false })
watch(() => imp.createdRow.value, () => { if (imp.active.value) liveRefresh() })
// Source 2: the Import modal itself, WHILE OPEN it owns the poll and the tracker is
// idle — so it emits @progress and we refresh from that instead.
function onModalProgress() { liveRefresh() }
async function onImported(examId?: string) {
  const newId = Number(examId ?? 0)
  // Refresh the exam dropdown FIRST so a newly-created exam (that wasn't in the
  // list on page load) becomes selectable — otherwise selectedExamId points at
  // an exam with no matching <option> and the filter looks empty.
  await fetchExamOptions()
  // If the import went into a different exam (e.g. a newly created one), point
  // the Exam filter at it so its imported questions are shown; applyFilters()
  // refetches list + stats. Otherwise just refresh the current view in place.
  if (newId && newId !== selectedExamId.value) {
    selectedExamId.value = newId
  }
  fetchCounts()
  fetchQuestions()
}

// ── Detail view ───────────────────────────────────────────────────────────────
const view     = ref<'list' | 'detail'>('list')
const detailId = ref<number | null>(null)
const openId   = ref<number | null>(null)

function openDetail(id: number) { detailId.value = id; view.value = 'detail'; openId.value = null }
function closeDetail()          { view.value = 'list'; detailId.value = null  }

// ── Edit modal (own questions only) ───────────────────────────────────────────
const showEdit   = ref(false)
const editTarget = ref<ApiQuestion | null>(null)
function openEdit(q: ApiQuestion) { editTarget.value = q; showEdit.value = true }
function onEditSaved() { showEdit.value = false; fetchQuestions(); fetchCounts() }

// ── Delete (OWN questions only) ───────────────────────────────────────────────
// UI is guarded by q.owned, but the server is the real gate: it enforces
// question_owner === institution_id and 403s any attempt to delete another
// institution's (or a Passmed) question.
const deleteBusyId = ref<number | null>(null)
// Uses the app's own styled ConfirmModal (not the native browser confirm/alert).
const confirmDeleteQ = ref<ApiQuestion | null>(null)
const deleteMsg = ref('')
let deleteMsgTimer: ReturnType<typeof setTimeout> | null = null
function flashDeleteMsg(m: string) {
  deleteMsg.value = m
  if (deleteMsgTimer) clearTimeout(deleteMsgTimer)
  deleteMsgTimer = setTimeout(() => { deleteMsg.value = '' }, 3500)
}

// Mirrors the server gates in Api_institute_questionController. Both require:
//   1. CAN (permission) — hold at least `edit` on the question bank, AND
//   2. own-institution question (q.owned).
// The difference is the ROLE/author test:
const { user: authUser } = useAuth()
const myUserId = () => Number(authUser.value?.id) || 0
function isAuthorOf(q: any): boolean {
  const myId = myUserId()
  return myId > 0 && (Number(q?.created_by) === myId || Number(q?.author_user_id) === myId)
}
function isInstitutionAdmin(): boolean {
  return String(authUser.value?.role || '').toLowerCase() === 'institution-admin'
}
// Who may act on a question (mirrors the server): its AUTHOR, OR ANY institution-admin.
// The old "admin only when the author is a professor" carve-out was removed so a
// departing admin's questions aren't orphaned — any admin can now manage any
// question in their institution (a professor's OR another admin's).
function actorCanActOn(q: any): boolean {
  return isAuthorOf(q) || isInstitutionAdmin()
}
// EDIT — needs `edit` permission. Author edits own; admin edits anyone's.
function canEditQ(q: any): boolean {
  if (!q?.owned || !canEdit(PERM_AREA)) return false
  return actorCanActOn(q)
}
// DELETE — the AUTHOR may delete their OWN question with just `edit` (deleting your
// own upload is an authoring action). Deleting SOMEONE ELSE's question requires an
// institution-admin who holds `full`/manage.
function canDeleteQ(q: any): boolean {
  if (!q?.owned) return false
  if (isAuthorOf(q)) return canEdit(PERM_AREA)
  return isInstitutionAdmin() && canManage(PERM_AREA)
}

// Open the styled confirm dialog.
function deleteQuestion(q: ApiQuestion) {
  if (!Number(q.id) || !canDeleteQ(q) || deleteBusyId.value) return
  confirmDeleteQ.value = q
}

// Runs when the user confirms in the ConfirmModal.
async function doDeleteQuestion() {
  const q = confirmDeleteQ.value
  const id = Number(q?.id)
  confirmDeleteQ.value = null   // close the dialog immediately
  if (!q || !id) return
  deleteBusyId.value = id
  try {
    const res: any = await api(`/questions/${id}`, { method: 'DELETE' })
    if (res?.status === 'success') {
      if (view.value === 'detail' && detailId.value === id) closeDetail()
      fetchQuestions(); fetchCounts()
      flashDeleteMsg('Question deleted.')
    } else {
      flashDeleteMsg(res?.msg || 'Could not delete this question. Please try again.')
    }
  } catch (e: any) {
    const code = e?.response?.status ?? e?.statusCode
    if (code === 403)      flashDeleteMsg('You can only delete your own institution’s questions.')
    else if (code === 404) { fetchQuestions(); fetchCounts(); flashDeleteMsg('That question no longer exists.') }
    else                   flashDeleteMsg(e?.data?.msg || 'Could not delete this question. Please try again.')
  } finally {
    deleteBusyId.value = null
  }
}

// ── Needs-Review queue actions (own questions, status 4) ──────────────────────
const reviewBusyId = ref<number | null>(null)
// Approve/Reject used to swallow every failure into the devtools console. The common
// failure is a 403 from perm:question_bank,full — so to the user the button
// simply did nothing, which is what got reported as "review actions don't work".
// Never fail silently here: a publish decision that didn't happen must say so.
const reviewError = ref('')
// Single-row Approve/Reject now go through the SAME confirmation step as the bulk
// action: the button only opens the dialog; reviewAction (below) is the executor
// that runs once the user confirms.
const reviewConfirm = ref<{ q: ApiQuestion; action: 'approve' | 'reject' } | null>(null)
function askReview(q: ApiQuestion, action: 'approve' | 'reject') {
  if (reviewBusyId.value) return
  reviewConfirm.value = { q, action }
}
function runReviewConfirm() {
  const c = reviewConfirm.value
  reviewConfirm.value = null
  if (c) reviewAction(c.q, c.action)
}
async function reviewAction(q: ApiQuestion, action: 'approve' | 'reject') {
  const id = Number(q.id)
  if (!id || reviewBusyId.value) return
  reviewBusyId.value = id
  reviewError.value = ''
  try {
    const res: any = await api(`/questions/${id}/${action}`, { method: 'POST' })
    if (res?.status === 'success') {
      // Row leaves the queue on either action → refresh list + counts.
      fetchQuestions(); fetchCounts()
    } else {
      reviewError.value = res?.msg || `Could not ${action} this question. Please try again.`
    }
  } catch (e: any) {
    const code = e?.response?.status ?? e?.statusCode
    if (code === 403) {
      reviewError.value = 'You do not have permission to publish or reject questions. Ask your institution admin for "full" access to the Question Bank.'
    } else if (code === 404) {
      reviewError.value = 'That question no longer exists. Refreshing the list.'
      fetchQuestions(); fetchCounts()
    } else {
      reviewError.value = e?.data?.msg || `Could not ${action} this question. Please try again.`
    }
    logError('[question-bank] review action failed', e)
  } finally {
    reviewBusyId.value = null
  }
}

// ── Bulk review — select-all + bulk approve/reject (Needs-Review queue) ───────
const selectedReview = ref<Set<number>>(new Set())
const bulkBusy       = ref(false)
const bulkConfirm    = ref<{ action: 'approve' | 'reject'; count: number } | null>(null)
const bulkResult     = ref<{ action: string; done: number; failed: number; results: any[] } | null>(null)

// Only this institution's OWN status-4 rows are actionable — the ids a checkbox
// may pick. (In review mode the list is already status-4, but keep the guard.)
const reviewableIds = computed(() =>
  questions.value
    .filter(q => (q as any).owned && Number((q as any).status) === 4)
    .map(q => Number(q.id)))

const allReviewSelected = computed(() =>
  reviewableIds.value.length > 0 && reviewableIds.value.every(id => selectedReview.value.has(id)))

function isReviewable(q: ApiQuestion): boolean {
  return !!(q as any).owned && Number((q as any).status) === 4
}
function toggleReviewRow(id: number) {
  const s = new Set(selectedReview.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedReview.value = s
}
function toggleReviewAll() {
  selectedReview.value = allReviewSelected.value ? new Set() : new Set(reviewableIds.value)
}
function clearReviewSelection() { selectedReview.value = new Set() }

// Any list change (filter / page / refresh / leaving review mode) drops the
// selection so stale ids are never submitted.
watch([questions, reviewMode], () => { selectedReview.value = new Set() })

// Confirm → run. The confirmation names the action + count; the result modal
// afterwards shows the per-row outcome the backend returns.
function askBulk(action: 'approve' | 'reject') {
  if (!canManage(PERM_AREA) || selectedReview.value.size === 0) return
  bulkConfirm.value = { action, count: selectedReview.value.size }
}
async function runBulk() {
  const c = bulkConfirm.value
  if (!c) return
  bulkConfirm.value = null
  bulkBusy.value = true
  reviewError.value = ''
  try {
    const ids = Array.from(selectedReview.value)
    const res: any = await api('/questions/bulk-review', { method: 'POST', body: { ids, action: c.action } })
    if (res?.status === 'success') {
      bulkResult.value = { action: c.action, done: res.done ?? 0, failed: res.failed ?? 0, results: res.results ?? [] }
      clearReviewSelection()
      fetchQuestions(); fetchCounts()
    } else {
      reviewError.value = res?.msg || 'Bulk action could not be completed. Please try again.'
    }
  } catch (e: any) {
    const code = e?.response?.status ?? e?.statusCode
    reviewError.value = code === 403
      ? 'You do not have permission to publish or reject questions. Ask your institution admin for "full" access to the Question Bank.'
      : (e?.data?.msg || 'Bulk action could not be completed. Please try again.')
  } finally {
    bulkBusy.value = false
  }
}

// ── Generalised selection — same checkbox/select-all pattern for BOTH the
// Needs-Review queue (approve/reject) and the normal list (delete). Which rows are
// selectable depends on the mode:
//   • review mode  → own status-4 rows (isReviewable)
//   • normal list  → rows the user may delete (canDeleteQ — their own, or anything
//                    for an institution admin). So a user can only tick what they
//                    are allowed to act on.
const selectableIds = computed(() =>
  reviewMode.value
    ? reviewableIds.value
    : questions.value.filter(q => canDeleteQ(q as any)).map(q => Number(q.id)))
const allSelected = computed(() =>
  selectableIds.value.length > 0 && selectableIds.value.every(id => selectedReview.value.has(id)))
function isSelectable(q: ApiQuestion): boolean {
  return reviewMode.value ? isReviewable(q) : canDeleteQ(q as any)
}
function toggleSelectAll() {
  selectedReview.value = allSelected.value ? new Set() : new Set(selectableIds.value)
}

// ── Bulk delete (normal list) — mirrors the review confirm→run→result flow, but
// hits the real bulk endpoint (one request for the whole page, not N sequential
// deletes). Server re-checks every id, so gating is enforced there too.
const bulkDeleteConfirm = ref<{ count: number } | null>(null)
function askBulkDelete() {
  if (selectedReview.value.size === 0) return
  bulkDeleteConfirm.value = { count: selectedReview.value.size }
}
async function runBulkDelete() {
  if (!bulkDeleteConfirm.value) return
  bulkDeleteConfirm.value = null
  bulkBusy.value = true
  reviewError.value = ''
  try {
    const ids = Array.from(selectedReview.value)
    const res: any = await api('/questions/bulk-delete', { method: 'POST', body: { ids } })
    if (res?.status === 'success') {
      bulkResult.value = { action: 'delete', done: res.done ?? 0, failed: res.failed ?? 0, results: res.results ?? [] }
      clearReviewSelection()
      fetchQuestions(); fetchCounts()
    } else {
      reviewError.value = res?.msg || 'Bulk delete could not be completed. Please try again.'
    }
  } catch (e: any) {
    const code = e?.response?.status ?? e?.statusCode
    reviewError.value = code === 403
      ? 'You do not have permission to delete some of these questions.'
      : (e?.data?.msg || 'Bulk delete could not be completed. Please try again.')
  } finally {
    bulkBusy.value = false
  }
}

// ── Import "Discard" = roll back the whole session (hard-delete this import's rows).
// Distinct from "Save & Exit" (imp.saveAndExit), which keeps what was imported.
// Confirmed first because it is destructive; the message names the count.
const rollbackConfirm = ref<{ count: number } | null>(null)
function askRollback() {
  rollbackConfirm.value = { count: imp.createdRow.value || 0 }
}
async function runRollback() {
  rollbackConfirm.value = null
  await imp.rollback()          // backend hard-deletes; composable clears the banner
  fetchQuestions(); fetchCounts()
}

// Map API difficulty values → display labels
function diffLabel(d: string): string {
  if (d === 'foundation')   return 'Foundation'
  if (d === 'intermediate') return 'Intermediate'
  if (d === 'advanced')     return 'Advanced'
  if (d === 'expert')       return 'Expert'
  return d.charAt(0).toUpperCase() + d.slice(1)
}
function diffFilterLabel(d: string): string {
  if (d === 'all')    return 'All levels'
  return diffLabel(d)
}

const currentDetail = computed<ApiQuestion | undefined>(() =>
  detailId.value == null ? undefined : questions.value.find(q => q.id === detailId.value)
)
const similar = computed<ApiQuestion[]>(() => {
  const q = currentDetail.value
  if (!q) return []
  return questions.value.filter(s =>
    s.id !== q.id && (
      (q.topic_id && s.topic_id === q.topic_id) ||
      (q.exam_id  && s.exam_id  === q.exam_id)
    )
  ).slice(0, 4)
})

// ── Click outside dropdown ────────────────────────────────────────────────────
function onDocClick(e: MouseEvent) {
  if (!subjectDropOpen.value) return
  const wrap = document.getElementById('qb-subj-wrap')
  if (wrap && !wrap.contains(e.target as Node)) subjectDropOpen.value = false
}

onMounted(() => {
  fetchCounts()
  fetchQuestions()
  fetchExamOptions()
  fetchFacets()
  // Restore a running/paused import after refresh or logout→login: the tracker
  // state is wiped on reload but the backend job keeps going. This re-shows the
  // progress toast + keeps the Import button disabled until it completes/cancels.
  if (import.meta.client) imp.rehydrate(api)
  if (import.meta.client) document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => { if (import.meta.client) document.removeEventListener('click', onDocClick) })
</script>

<template>
  <!-- Topbar breadcrumb — same structure as every other institute page -->

  <div class="content qbank">

    <!-- Background import toast — appears when the Import modal is closed mid-import.
         Shows live progress + Cancel, then a persistent "N published" completion
         message that stays until the user dismisses it (✕). -->
    <div
      v-if="imp.active.value || imp.paused.value || imp.done.value"
      class="imp-toast"
      :class="{ 'is-paused': imp.paused.value, 'is-done': imp.done.value, 'is-fail': imp.failed.value }">
      <!-- Running — click the body to re-expand the live progress modal -->
      <template v-if="imp.active.value">
        <span class="imp-spinner"></span>
        <div class="imp-toast-body imp-clickable" role="button" tabindex="0"
          title="Click to re-open the live import progress"
          @click="showImport = true" @keydown.enter="showImport = true">
          <strong>{{ imp.progressText.value }}</strong>
          <div class="imp-bar"><div class="imp-bar-fill" :style="{ width: imp.progress.value + '%' }"></div></div>
          <span v-if="imp.totalRow.value" class="imp-toast-sub">{{ imp.createdRow.value }} / {{ imp.totalRow.value }} rows imported</span>
        </div>
        <button type="button" class="imp-cancel" @click.stop="imp.pause()">Pause</button>
      </template>
      <!-- Paused → Continue / Discard -->
      <template v-else-if="imp.paused.value">
        <span class="imp-badge is-pause">❚❚</span>
        <div class="imp-toast-body">
          <strong>Import paused</strong>
          <div class="imp-bar"><div class="imp-bar-fill" :style="{ width: imp.progress.value + '%' }"></div></div>
          <span class="imp-toast-sub">{{ imp.createdRow.value }} / {{ imp.totalRow.value || '…' }} rows so far — continue from here</span>
        </div>
        <div class="imp-btns">
          <button type="button" class="imp-continue" @click="imp.resume()">Continue</button>
          <button type="button" class="imp-saveexit" @click="imp.saveAndExit()">Save &amp; Exit</button>
          <button type="button" class="imp-discard" @click="askRollback()">Discard</button>
        </div>
      </template>
      <!-- Completed / failed -->
      <template v-else>
        <span class="imp-badge">{{ imp.failed.value ? '!' : '✓' }}</span>
        <div class="imp-toast-body">
          <strong>{{ imp.failed.value ? 'Import failed' : 'Import complete' }}</strong>
          <span v-if="imp.failed.value" class="imp-toast-sub">Please try again.</span>
          <span v-else class="imp-toast-sub">
            {{ imp.publishedCount.value }} question{{ imp.publishedCount.value === 1 ? '' : 's' }} published<template v-if="imp.rejectedCount.value"> · {{ imp.rejectedCount.value }} rejected — not imported</template><template v-if="imp.duplicateCount.value"> · {{ imp.duplicateCount.value }} duplicate{{ imp.duplicateCount.value === 1 ? '' : 's' }} skipped</template><template v-if="imp.reviewCount.value"> · {{ imp.reviewCount.value }} need review</template><template v-if="imp.skippedCount.value"> · {{ imp.skippedCount.value }} skipped</template>
          </span>
        </div>
        <button type="button" class="imp-x" @click="imp.dismiss()" aria-label="Dismiss">✕</button>
      </template>
    </div>

    <!-- ───── LIST VIEW ───── -->
    <div v-if="view === 'list'" class="fade-in">

      <!-- Header -->
      <!-- `view` level: page is visible but every mutation is hidden. -->
      <ReadOnlyBanner :area="PERM_AREA" />

      <!-- Approve/Reject failure. Previously this went to console only, so a 403
           looked like a dead button. -->
      <div v-if="reviewError" class="review-error">
        <span>{{ reviewError }}</span>
        <button type="button" class="review-error-x" aria-label="Dismiss" @click="reviewError = ''">✕</button>
      </div>

      <div class="page-header">
        <div>
          <div class="page-title">Question Bank</div>
          <div class="page-sub">
            <template v-if="!countsLoading">Your institution’s questions and the shared pool · {{ counts.accessible_total.toLocaleString() }} accessible · browse, filter &amp; preview</template>
          </div>
        </div>
        <div class="page-header-right">
          <!-- 🚩 Flagged only / 🕵️ Needs review pills removed — the stat cards below
               are the filter entry points now (Flagged + Needs Review cards). -->
          <button v-if="canEdit(PERM_AREA)" type="button" class="hdr-btn"
            :disabled="imp.active.value || imp.paused.value"
            :title="(imp.active.value || imp.paused.value) ? 'An import is already running' : ''"
            @click="openImport">⬆️ Import Questions</button>
          <button v-if="canEdit(PERM_AREA) && imp.lastReportSummary.value && !imp.active.value && !imp.paused.value"
            type="button" class="hdr-btn"
            title="View the result of your last import"
            @click="openLastReportModal()">📄 View last import result</button>
          <NuxtLink to="/institute/assign-exams" class="hdr-btn primary">+ Assign exam</NuxtLink>
        </div>
      </div>

      <!-- Stat strip -->
      <div class="stat-grid">
        <!-- Skeleton -->
        <template v-if="countsLoading">
          <div v-for="i in 5" :key="i" class="stat-card sk-stat-card">
            <span class="sk" style="width:60%;height:10px;margin-bottom:8px;"></span>
            <span class="sk" style="width:40%;height:26px;margin-bottom:6px;"></span>
            <span class="sk" style="width:80%;height:9px;"></span>
          </div>
        </template>
        <template v-else>
          <!-- 0 · All Questions → the whole accessible bank (own + shared pool) -->
          <div class="stat-card c-slate" :class="{ 'stat-active': source === 'all' && !flaggedOnly && !reviewMode && !authoredByMe }" style="cursor:pointer;"
            @click="selectCard('all')">
            <div class="stat-label">All Questions</div>
            <div class="stat-val">{{ counts.accessible_total.toLocaleString() }}</div>
            <div class="stat-sub">own + shared pool</div>
          </div>
          <!-- 1 · Institute Qs → filter to this institution's own questions -->
          <div class="stat-card c-teal" :class="{ 'stat-active': source === 'mine' }" style="cursor:pointer;"
            @click="selectCard('mine')">
            <div class="stat-label">Institute Qs</div>
            <div class="stat-val">{{ counts.institute_count.toLocaleString() }}</div>
            <div class="stat-sub">your institution's own</div>
          </div>
          <!-- 2 · Shared Pool Qs → filter to shared-pool questions -->
          <div class="stat-card c-purple" :class="{ 'stat-active': source === 'public' }" style="cursor:pointer;"
            @click="selectCard('public')">
            <div class="stat-label">Shared Pool Qs</div>
            <div class="stat-val">{{ counts.shared_count.toLocaleString() }}</div>
            <div class="stat-sub">public — all contributors</div>
          </div>
          <!-- 3 · Flagged → filter to student-flagged questions -->
          <div class="stat-card c-rose" :class="{ 'stat-active': flaggedOnly }" style="cursor:pointer;"
            @click="selectCard('flagged')">
            <div class="stat-label">Flagged</div>
            <div class="stat-val">{{ counts.flagged_count.toLocaleString() }}</div>
            <div class="stat-sub">flagged for review</div>
          </div>
          <!-- 4 · Needs Review → status-4 review queue -->
          <div class="stat-card c-amber" :class="{ 'stat-active': reviewMode }" style="cursor:pointer;"
            @click="selectCard('review')">
            <div class="stat-label">Needs Review</div>
            <div class="stat-val" style="color:var(--amber);">{{ counts.needs_review }}</div>
            <div class="stat-sub">click to review &amp; approve</div>
          </div>
        </template>
      </div>

      <!-- Filters row -->
      <div class="card filters-card">
        <div class="filters-row">
          <div class="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-dim)" stroke-width="2" class="search-icon">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text" v-model="search" placeholder="Search question stems…"
              @input="onSearchInput">
          </div>

          <!-- Subjects dropdown -->
          <!--div id="qb-subj-wrap" class="subj-wrap">
            <button type="button"
              class="subj-btn"
              :class="{ on: selectedTopicId !== null }"
              @click="subjectDropOpen = !subjectDropOpen">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              Subjects
              <span v-if="selectedTopicId !== null" class="subj-count">1</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <div v-if="subjectDropOpen" class="subj-menu">
              <div class="subj-row" :class="{ on: selectedTopicId === null }" @click="toggleTopic('')" tabindex="0" role="button" @keydown.enter="toggleTopic('')" @keydown.space.prevent="toggleTopic('')">
                <span class="check">{{ selectedTopicId === null ? '✓' : '' }}</span>
                All subjects
              </div>
              <div class="subj-sep"></div>
              <div
                v-for="s in qbSpecialties" :key="s.id"
                class="subj-row"
                :class="{ on: selectedTopicId === s.id }"
                @click="toggleTopic(s.id)"
                tabindex="0" role="button"
                @keydown.enter="toggleTopic(s.id)" @keydown.space.prevent="toggleTopic(s.id)">
                <span class="check">{{ selectedTopicId === s.id ? '✓' : '' }}</span>
                {{ s.icon }} {{ s.label }}
              </div>
            </div>
          </div-->

          <!-- Exam filter — All exams (default) + the institution's own exams -->
          <select
            class="qb-filter-select"
            :class="{ on: selectedExamId !== null }"
            :value="selectedExamId ?? ''"
            @change="onExamChange(Number(($event.target as HTMLSelectElement).value))">
            <option value="">All buckets</option>
            <option v-for="e in examOptions" :key="e.id" :value="e.id">{{ e.name }}</option>
          </select>

          <!-- Bank source — Institution vs Shared pool (no Passmed here) -->
          <select
            class="qb-filter-select"
            :class="{ on: source !== 'all' || authoredByMe }"
            v-model="sourceView"
            @change="onSourceDropdown()">
            <option value="all">All Questions</option>
            <option value="mine">Institution</option>
            <option value="public">Shared pool</option>
            <option value="author">Authored by me</option>
          </select>

          <!-- Taxonomy filters — Subject / Domain / Discipline (controlled vocab) -->
          <select
            class="qb-filter-select"
            :class="{ on: subjectId !== null }"
            :value="subjectId ?? ''"
            @change="onSubjectChange(($event.target as HTMLSelectElement).value)">
            <option value="">All subjects</option>
            <option v-for="s in facetSubjects" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <select
            class="qb-filter-select"
            :class="{ on: categoryId !== null }"
            :value="categoryId ?? ''"
            @change="onCategoryChange(($event.target as HTMLSelectElement).value)">
            <option value="">All sub-topics</option>
            <option v-for="c in facetCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <select
            class="qb-filter-select"
            :class="{ on: disciplineId !== null }"
            :value="disciplineId ?? ''"
            @change="onDisciplineChange(($event.target as HTMLSelectElement).value)">
            <option value="">All knowledge types</option>
            <option v-for="d in facetDisciplines" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>

          <!-- Learning Outcome (the import sheet's "Cognitive Task"). -->
          <select
            class="qb-filter-select"
            :class="{ on: learningOutcomeId !== null }"
            :value="learningOutcomeId ?? ''"
            @change="onLearningOutcomeChange(($event.target as HTMLSelectElement).value)">
            <option value="">All cognitive tasks</option>
            <option v-for="lo in facetLearningOutcomes" :key="lo.id" :value="lo.id">{{ lo.name }}</option>
          </select>

          <!-- Difficulty (Level) filter.
               Was a hardcoded ['all','foundation','intermediate','advanced','expert'].
               Difficulty is curatable now — retire "Expert" in the admin and it stops
               being offered here, with no deploy. Bound on `slug`, which is what
               questions.difficulty stores. -->
          <select
            class="qb-filter-select"
            :class="{ on: difficulty !== 'all' }"
            v-model="difficulty"
            @change="applyFilters()">
            <option value="all">All levels</option>
            <option v-for="d in facetDifficulties" :key="d.id" :value="d.slug">{{ d.name }}</option>
          </select>

          <button type="button" v-if="isFiltered" class="reset-btn" @click="resetFilters">Reset</button>
        </div>
      </div>

      <!-- Table -->
      <div class="card table-card">
        <div class="table-head">
          <div class="table-count">
            <template v-if="!loading">
              {{ totalCount.toLocaleString() }} question<span v-if="totalCount !== 1">s</span>
              <span v-if="isFiltered" class="filtered-tag">— filtered</span>
            </template>
          </div>
          <div class="table-hint">Click row to preview · click View for full detail</div>
        </div>

        <!-- Bulk review bar — Needs-Review queue only, and only for holders of
             `full` on the Question Bank (same gate as single approve/reject). -->
        <!-- Review-queue bulk bar (approve/reject) -->
        <div v-if="reviewMode && canManage(PERM_AREA) && selectedReview.size" class="bulk-bar">
          <span class="bulk-count">{{ selectedReview.size }} selected</span>
          <button type="button" class="bulk-approve" :disabled="bulkBusy" @click="askBulk('approve')">✓ Approve selected</button>
          <button type="button" class="bulk-reject" :disabled="bulkBusy" @click="askBulk('reject')">✕ Reject selected</button>
          <button type="button" class="bulk-clear" :disabled="bulkBusy" @click="clearReviewSelection">Clear</button>
        </div>

        <!-- Normal-list bulk bar (delete) — same pattern, gated by canDeleteQ per row -->
        <div v-if="!reviewMode && selectedReview.size" class="bulk-bar">
          <span class="bulk-count">{{ selectedReview.size }} selected</span>
          <button type="button" class="bulk-reject" :disabled="bulkBusy" @click="askBulkDelete">
            <span v-if="bulkBusy" class="bulk-spinner"></span>{{ bulkBusy ? 'Deleting…' : '🗑 Delete selected' }}
          </button>
          <button type="button" class="bulk-clear" :disabled="bulkBusy" @click="clearReviewSelection">Clear</button>
        </div>

        <div class="qb-scroll">
        <table class="qb-table">
          <thead>
            <tr>
              <th class="th-check">
                <input type="checkbox" :checked="allSelected" :disabled="!selectableIds.length"
                       @change="toggleSelectAll"
                       :title="reviewMode ? 'Select all in this queue' : 'Select all you can delete'" />
              </th>
              <th class="th-center">Last updated</th>
              <th class="th-id" :class="{ active: sortKey === 'id' }" @click="setSort('id')" :aria-sort="ariaSort('id')">
                # <span v-if="sortKey === 'id'">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </th>
              <th :class="{ active: sortKey === 'stem' }" @click="setSort('stem')" :aria-sort="ariaSort('stem')">
                Question <span v-if="sortKey === 'stem'">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </th>
              <th :class="{ active: sortKey === 'topic' }" @click="setSort('topic')" :aria-sort="ariaSort('topic')">
                Subject <span v-if="sortKey === 'topic'">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </th>
              <th class="th-center" :class="{ active: sortKey === 'difficulty' }" @click="setSort('difficulty')" :aria-sort="ariaSort('difficulty')">
                Level <span v-if="sortKey === 'difficulty'">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </th>
              <th class="th-center">Sub-topic</th>
              <th class="th-center" :class="{ active: sortKey === 'uses' }" @click="setSort('uses')" :aria-sort="ariaSort('uses')">
                 Knowledge Type <span v-if="sortKey === 'uses'">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </th>
              <th class="th-center">Bucket</th>

              <th class="th-center">Author</th>

              <th class="th-center" :class="{ active: sortKey === 'source' }" @click="setSort('source')" :aria-sort="ariaSort('source')">
                 Source <span v-if="sortKey === 'source'">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </th>

              

              <th class="th-center">Flag</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            <!-- Skeleton rows -->
            <template v-if="loading">
              <tr v-for="i in skeletonRows" :key="'sk-' + i" class="sk-row" :style="{ opacity: 1 - (i - 1) * 0.07 }">
                <td><span class="sk" style="width:16px;height:16px;border-radius:3px;display:inline-block;"></span></td>
                <td class="td-center"><span class="sk" style="width:64px;height:11px;display:inline-block;"></span></td>
                <td><span class="sk" style="width:36px;height:12px;"></span></td>
                <td>
                  <span class="sk" style="width:85%;height:11px;display:block;margin-bottom:5px;"></span>
                  <span class="sk" style="width:55%;height:9px;"></span>
                </td>
                <td>
                  <span class="sk" style="width:80px;height:11px;display:block;margin-bottom:4px;"></span>
                  <span class="sk" style="width:60px;height:9px;"></span>
                </td>
                <td class="td-center"><span class="sk" style="width:52px;height:18px;border-radius:20px;display:inline-block;"></span></td>
                <td class="td-center">
                  <div style="display:flex;align-items:center;gap:6px;justify-content:center;">
                    <span class="sk" style="width:44px;height:4px;"></span>
                    <span class="sk" style="width:28px;height:11px;"></span>
                  </div>
                </td>
                <td class="td-center"><span class="sk" style="width:28px;height:11px;display:inline-block;"></span></td>
                <td class="td-center"><span class="sk" style="width:44px;height:11px;display:inline-block;"></span></td>
                <td class="td-center"><span class="sk" style="width:56px;height:11px;display:inline-block;"></span></td>
                <td class="td-center"><span class="sk" style="width:64px;height:22px;border-radius:6px;display:inline-block;"></span></td>
                <td class="td-right"><span class="sk" style="width:52px;height:22px;border-radius:7px;display:inline-block;"></span></td>
              </tr>
            </template>

            <!-- Data rows -->
            <template v-else-if="questions.length">
              <template v-for="(q, idx) in questions" :key="q.id">
                <tr class="q-row" :class="{ open: openId === q.id }" @click="openId = openId === q.id ? null : q.id">

                  <td class="td-check" @click.stop>
                    <input v-if="isSelectable(q)" type="checkbox" :checked="selectedReview.has(Number(q.id))"
                           @change="toggleReviewRow(Number(q.id))"
                           :title="reviewMode ? 'Select this question' : 'Select to delete'" />
                  </td>

                  <td class="td-center td-updated">{{ fmtDate(q.last_updated) }}</td>

                  <td class="td-id">
                    <span class="q-stableid">Q#{{ q.qid ?? q.id }}</span>
                    <span v-if="(q as any).source_row" class="q-srcrow">sheet row {{ (q as any).source_row }}</span>
                  </td>

                  <td class="td-stem">
                    <div class="stem-clip">{{ plain(q.question_stem) }} </div>
                    <!-- Why this question is in the Needs-Review queue (import flag reason). -->
                    <div v-if="reviewMode && (q as any).review_reasons && (q as any).review_reasons.length" class="review-reason">
                      ⚠ {{ (q as any).review_reasons.join(' · ') }}
                    </div>
                  </td>
                  <td class="td-topic"><div class="topic-row"><span class="topic-label">{{ q.subject?.name || '—' }}</span></div></td>
                  
                  <td class="td-center">
                    <span class="diff-pill capitalize-first" :style="{ background: diffBg(q.difficulty as Difficulty), color: diffColor(q.difficulty as Difficulty) }">
                    {{ diffLabel(q.difficulty) }}</span>
                  </td>

                  <td class="td-center"> <div class="stem-clip">{{ q.category?.name || ''  }}</div></td>
                  <td class="td-center"> <div class="stem-clip">{{ q.discipline?.name || ''  }}</div></td>
                  <td class="td-center"> <div class="stem-clip">{{ q.exam?.name || '—'  }}</div></td>
                  <td class="td-center"> <div class="stem-clip">{{ (q as any).author_name || '—'  }}</div></td>

                  <!-- Source: split on VISIBILITY, not ownership. A public question is
                       "Shared Pool" even when THIS institution contributed it; only own
                       PRIVATE questions read "Institution" + exam name. (Edit/Delete below
                       still key on q.owned — you can only act on what you own.) -->
                  <td class="td-center">
                    <span class="src-badge" :class="(q as any).visibility === 'public' ? 'src-shared' : 'src-inst'">
                      <span class="src-name"><span class="src-dot"></span>{{ (q as any).visibility === 'public' ? 'Shared Pool' : 'Institution' }}</span>
                      <!-- Public → which institution contributed it; private → exam name. -->
                      <small class="src-sub">
                        <template v-if="(q as any).visibility === 'public'">{{ (q as any).contributor_name || 'another institution' }}</template>
                        <template v-else>{{ q.exam?.name || '(unassigned)' }}</template>
                      </small>
                    </span>
                  </td>

                  <td class="td-center">
                    <button type="button"
                      class="flag-btn" :class="{ on: isFlagged(q) }"
                      @click.stop="toggleFlag(q.id)">
                      {{ isFlagged(q) ? '🚩 Flagged' : '⚑ Flag' }}
                    </button>
                  </td>
                  <td class="td-right">
                    <!-- Own questions are editable; shared-pool questions are view-only -->
                    <!-- Needs-review queue: inline Approve / Edit / Reject (own questions, status 4). -->
                    <template v-if="q.owned && Number((q as any).status) === 4">
                      <!-- Approve/Reject publish into the live bank → `full`. Edit is `edit`. -->
                      <button v-if="canManage(PERM_AREA)" type="button" class="review-approve" :disabled="reviewBusyId === Number(q.id)" @click.stop="askReview(q, 'approve')">✓ Approve</button>
                      <button v-if="canEditQ(q)" type="button" class="edit-btn" @click.stop="openEdit(q)" title="Edit question">✏️</button>
                      <button v-if="canManage(PERM_AREA)" type="button" class="review-reject" :disabled="reviewBusyId === Number(q.id)" @click.stop="askReview(q, 'reject')">✕ Reject</button>
                      <!-- Own question → delete. Gated on canEdit too: delete is an
                           authoring action (server route = perm:question_bank,edit), so a
                           view-only professor must not even see the button. -->
                      <button v-if="canDeleteQ(q)" type="button" class="del-btn" :disabled="deleteBusyId === Number(q.id)" @click.stop="deleteQuestion(q)">🗑</button>
                    </template>
                    <template v-else>
                      <!-- Edit & Delete = author OR ANY institution-admin (canEditQ /
                           canDeleteQ). An admin can manage a professor's AND another
                           admin's questions. Anyone who can't act — a shared-pool question
                           from another institution, or (for a professor) a colleague's
                           question — sees "View →"; the server would 403. -->
                      <button v-if="canEditQ(q)" type="button" class="edit-btn" @click.stop="openEdit(q)" title="Edit question">✏️</button>
                      <button v-if="canDeleteQ(q)" type="button" class="del-btn" :disabled="deleteBusyId === Number(q.id)" @click.stop="deleteQuestion(q)" title="Delete question">🗑</button>
                      <!-- View is always available — even for your own editable questions,
                           so you can open the full preview alongside Edit/Delete. -->
                      <button type="button" class="view-btn" @click.stop="openDetail(q.id)">View →</button>
                    </template>
                  </td>
                </tr>

                <!-- Inline expand -->
                <tr v-if="openId === q.id" class="q-row-expanded">
                  <td :colspan="13">
                    <div class="expanded">
                      <div class="expanded-main">
                        <div class="exp-stem">{{ plain(q.question_stem) }} </div>
                        <div class="choices">
                          <div
                            v-for="(opt, i) in (q.question_options || [])" :key="opt.id"
                            class="choice"
                            :class="{ correct: opt.is_correct === 'true' || opt.is_correct === true || opt.is_correct === 1 }">
                            <span class="choice-letter">{{ String.fromCharCode(65 + i) }}</span>
                            <span class="choice-text">{{ plain(opt.option_text) }}</span>
                            <span v-if="opt.is_correct === 'true' || opt.is_correct === true || opt.is_correct === 1" class="correct-tag">✓ CORRECT</span>
                          </div>
                        </div> 
                         <div v-if="isImageUrl(q.question_image_ids)" class="qc-question-image qc-question-image--institute-detail">
                          <img :src="q.question_image_ids" alt="Question image" loading="lazy" />
                        </div>
                      </div>
                      <div class="expanded-side">
                        <div class="exp-label">Explanation</div>
                        <div class="exp-text">{{ plain(q.explanation) || 'No explanation provided.' }}</div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </template>

            <!-- Empty -->
            <tr v-else>
              <td :colspan="13" class="empty-state">No questions match your filters</td>
            </tr>
          </tbody>
        </table>
        </div>

        <!-- Pagination -->
        <div v-if="!loading && totalCount > 0" class="pagination">
          <div class="pag-info">
            Showing {{ pageStart }}–{{ pageEnd }} of {{ totalCount.toLocaleString() }}
            <label class="pag-size">
              Rows
              <select v-model.number="pageSize" class="pag-size-select">
                <option v-for="n in pageSizeOptions" :key="n" :value="n">
                  {{ totalCount > 100 && n === totalCount ? 'All (' + n.toLocaleString() + ')' : n }}
                </option>
              </select>
            </label>
          </div>
          <div v-if="totalPages > 1" class="pag-btns">
            <button type="button"
              class="pag-arrow"
              :disabled="page === 1"
              @click="page > 1 && page--">
              ← Prev
            </button>
            <button type="button"
              v-for="p in pageButtons" :key="p"
              class="pag-num"
              :class="{ active: p === page }"
              @click="page = p">
              {{ p }}
            </button>
            <button type="button"
              class="pag-arrow"
              :disabled="page >= totalPages"
              @click="page < totalPages && page++">
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ───── DETAIL VIEW ───── -->
    <div v-else-if="currentDetail" class="fade-in detail-view">

      <!-- Breadcrumb -->
      <div class="bread">
        <button type="button" class="back-btn" @click="closeDetail">← Question Bank</button>
        <span class="bread-sep">›</span>
        <span class="bread-topic">
          {{ topicSpecialty(currentDetail.topic?.name)?.icon || '' }}
          {{ currentDetail.topic?.name || currentDetail.exam?.name || '—' }}
        </span>
        <span class="bread-sep">›</span>
        <span class="bread-q">Q#{{ currentDetail.qid ?? currentDetail.id }}</span>
      </div>

      <div class="detail-grid">
        <div class="detail-main">
          <!-- Question card -->
          <div class="card">
            <div class="qhead">
              <span class="qhead-id">Q#{{ currentDetail.qid ?? currentDetail.id }}</span>
              <span class="diff-pill big capitalize-first" :style="{ background: diffBg(currentDetail.difficulty as Difficulty), color: diffColor(currentDetail.difficulty as Difficulty) }">
                {{ diffLabel(currentDetail.difficulty) }}
              </span>
              <span class="qhead-tag">{{ topicSpecialty(currentDetail.topic?.name)?.icon || '' }} {{ currentDetail.topic?.name || currentDetail.exam?.name || '—' }}</span>
              <span v-if="currentDetail.subject?.name || currentDetail.domain?.name" class="qhead-tag">{{ currentDetail.subject?.name || currentDetail.domain?.name }}</span>
              <button type="button" class="flag-btn ml-auto" :class="{ on: isFlagged(currentDetail) }" @click="toggleFlag(currentDetail.id)">
                {{ isFlagged(currentDetail) ? '🚩 Flagged' : '⚑ Flag for review' }}
              </button>
            </div>

            <div class="qstem">{{ plain(currentDetail.question_stem) }}  </div>
             
            <!-- Question image (only when a real http(s) URL is present) -->
            <div v-if="isImageUrl(currentDetail.question_image_ids)" class="qc-question-image qc-question-image--institute-detail">
              <img :src="currentDetail.question_image_ids" alt="Question image" loading="lazy" />
            </div>

            <div class="qchoices">
              <div
                v-for="(opt, i) in (currentDetail.question_options || [])" :key="opt.id"
                class="qchoice"
                :class="{ correct: opt.is_correct === 'true' || opt.is_correct === true || opt.is_correct === 1 }">
                <div class="qchoice-letter">{{ String.fromCharCode(65 + i) }}</div>
                <span class="qchoice-text">{{ plain(opt.option_text) }}</span>
                <span v-if="opt.is_correct === 'true' || opt.is_correct === true || opt.is_correct === 1" class="qchoice-tag">✓ Correct</span>
              </div>
            </div>
          </div>


          <!-- Explanation -->
          <div class="card expl-card">
            <div class="expl-label">Explanation</div>
            <div class="expl-text">{{ plain(currentDetail.explanation) || 'No explanation provided.' }}</div>
          </div>

          <!-- Similar -->
          <div v-if="similar.length" class="card">
            <div class="sim-label">Related questions — {{ currentDetail.topic?.name || currentDetail.exam?.name || 'Same exam' }}</div>
            <div class="sim-list">
              <div v-for="s in similar" :key="s.id" class="sim-row" @click="detailId = s.id" tabindex="0" role="button" @keydown.enter="detailId = s.id" @keydown.space.prevent="detailId = s.id">
                <span class="sim-id">Q{{ s.id }}</span>
                <span class="sim-stem">{{ s.question_stem.slice(0, 90) }}…</span>
                <span class="diff-pill" :style="{ background: diffBg(s.difficulty as Difficulty), color: diffColor(s.difficulty as Difficulty) }">{{ diffLabel(s.difficulty) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right sidebar -->
        <div class="detail-side">
          <div class="card">
            <div class="side-label">Performance</div>
            <div class="side-pct" :style="{ color: pctColor(currentDetail.pct_correct ?? 0) }">
              {{ currentDetail.pct_correct ?? '—' }}{{ currentDetail.pct_correct != null ? '%' : '' }}
            </div>
            <div class="side-sub">cohort got this right</div>
            <div class="side-bar">
              <div class="side-fill" :style="{ width: (currentDetail.pct_correct ?? 0) + '%', background: pctColor(currentDetail.pct_correct ?? 0) }"></div>
            </div>
            <div class="side-stats">
              <div class="side-stat">
                <div class="side-stat-label">Used in exams</div>
                <div class="side-stat-val">{{ currentDetail.uses }}×</div>
              </div>
              <div class="side-stat">
                <div class="side-stat-label">Difficulty</div>
                <div class="side-stat-val" :style="{ color: diffColor(currentDetail.difficulty as Difficulty) }">{{ diffLabel(currentDetail.difficulty) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Import Questions modal -->
  <ImportQuestionModal
    v-model="showImport"
    :exam-id="selectedExamId"
    :preview-summary="previewSummary"
    @imported="onImported"
    @progress="onModalProgress"
  />

  <!-- Edit modal — own questions only (shared/Passmed never editable here) -->
  <QuestionEditModal
    v-model="showEdit"
    :question="editTarget"
    @saved="onEditSaved"
  />

  <!-- Delete confirmation — app's own styled dialog (not the browser's confirm). -->
  <ConfirmModal
    :open="!!confirmDeleteQ"
    title="Delete question?"
    :message="`This question${(confirmDeleteQ as any)?.source_row ? ' (sheet row ' + (confirmDeleteQ as any).source_row + ')' : ''} will be permanently deleted, including any student attempts. This cannot be undone.`"
    confirm-label="Delete"
    :danger="true"
    @confirm="doDeleteQuestion"
    @cancel="confirmDeleteQ = null"
  />

  <!-- Import "Discard" = roll back the whole session (destructive). -->
  <ConfirmModal
    :open="!!rollbackConfirm"
    title="Discard this import?"
    :message="`This will delete all ${rollbackConfirm?.count ?? 0} question${(rollbackConfirm?.count ?? 0) === 1 ? '' : 's'} imported in this session. This cannot be undone. To keep what's imported and cancel only the rest, use Save & Exit instead.`"
    confirm-label="Discard all"
    :danger="true"
    @confirm="runRollback"
    @cancel="rollbackConfirm = null"
  />

  <!-- Lightweight result toast for delete (success / permission / error). -->
  <Transition name="cfm">
    <div v-if="deleteMsg" class="qb-toast">{{ deleteMsg }}</div>
  </Transition>

  <!-- Single-row review confirmation — same dialog style as the bulk action. -->
  <ConfirmModal
    :open="!!reviewConfirm"
    :title="reviewConfirm?.action === 'approve' ? 'Approve this question?' : 'Reject this question?'"
    :message="reviewConfirm?.action === 'approve'
        ? 'This question will be published into the live question bank.'
        : 'This question will be archived out of the bank. This is reversible.'"
    :confirm-label="reviewConfirm?.action === 'approve' ? 'Approve' : 'Reject'"
    :danger="reviewConfirm?.action === 'reject'"
    @confirm="runReviewConfirm"
    @cancel="reviewConfirm = null"
  />

  <!-- Bulk review confirmation -->
  <ConfirmModal
    :open="!!bulkConfirm"
    :title="bulkConfirm?.action === 'approve' ? 'Approve selected questions?' : 'Reject selected questions?'"
    :message="bulkConfirm ? (bulkConfirm.action === 'approve'
        ? `${bulkConfirm.count} question${bulkConfirm.count === 1 ? '' : 's'} will be published into the live question bank.`
        : `${bulkConfirm.count} question${bulkConfirm.count === 1 ? '' : 's'} will be archived out of the bank. This is reversible.`) : ''"
    :confirm-label="bulkConfirm?.action === 'approve' ? 'Approve all' : 'Reject all'"
    :danger="bulkConfirm?.action === 'reject'"
    @confirm="runBulk"
    @cancel="bulkConfirm = null"
  />

  <!-- Bulk DELETE confirm (normal list). Permanent + destructive. -->
  <ConfirmModal
    :open="!!bulkDeleteConfirm"
    title="Delete selected questions?"
    :message="bulkDeleteConfirm ? `${bulkDeleteConfirm.count} question${bulkDeleteConfirm.count === 1 ? '' : 's'} will be permanently deleted, including any student attempts. This cannot be undone.` : ''"
    confirm-label="Delete all"
    :danger="true"
    @confirm="runBulkDelete"
    @cancel="bulkDeleteConfirm = null"
  />

  <!-- Bulk review result — per-row summary of what happened. -->
  <div v-if="bulkResult" class="bulk-result-overlay" @click.self="bulkResult = null">
    <div class="bulk-result-box">
      <div class="bulk-result-head">
        {{ bulkResult.action === 'approve' ? 'Approved' : bulkResult.action === 'delete' ? 'Deleted' : 'Rejected' }} {{ bulkResult.done }}<template v-if="bulkResult.failed"> · Skipped {{ bulkResult.failed }}</template>
      </div>
      <div v-if="bulkResult.failed" class="bulk-result-list">
        <div class="bulk-result-sub">These were skipped:</div>
        <div v-for="r in bulkResult.results.filter((x: any) => !x.ok)" :key="r.id" class="bulk-result-row">
          <span class="brr-id">Q#{{ r.id }}</span>
          <span class="brr-msg">{{ r.msg }}</span>
        </div>
      </div>
      <div v-else class="bulk-result-ok">All selected questions were {{ bulkResult.action === 'approve' ? 'approved &amp; published' : bulkResult.action === 'delete' ? 'deleted' : 'rejected &amp; archived' }}.</div>
      <button type="button" class="bulk-result-close" @click="bulkResult = null">Done</button>
    </div>
  </div>

</template>

<style scoped>
.qbank { padding: 18px 22px; }

/* ── Bulk review (Needs-Review queue) ───────────────────────────── */
.bulk-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin: 6px 0 18px;
  padding: 10px 14px;
  background: var(--white);
  border: 1px solid var(--border);
  border-left: 4px solid var(--teal);
  border-radius: 12px;
}
.bulk-count { font-weight: 700; font-size: 13px; margin-right: 4px; }
.bulk-bar button {
  font-size: 13px; font-weight: 600;
  padding: 7px 14px; border-radius: 8px;
  border: 1px solid transparent; cursor: pointer;
}
.bulk-bar button:disabled { opacity: .55; cursor: default; }
/* Inline spinner shown on the Delete button while a bulk delete is in flight. */
.bulk-spinner {
  display: inline-block; width: 12px; height: 12px; margin-right: 6px;
  vertical-align: -1px; border-radius: 50%;
  border: 2px solid currentColor; border-top-color: transparent;
  animation: bulk-spin .6s linear infinite;
}
@keyframes bulk-spin { to { transform: rotate(360deg); } }
.bulk-approve { background: var(--teal, #0d9488); color: #fff; }
.bulk-reject  { background: #fff; color: #b42318; border-color: #f3c6c0 !important; }
.bulk-clear   { background: transparent; color: var(--muted, #667085); border-color: var(--border) !important; }

.th-check, .td-check { width: 34px; text-align: center; padding-left: 8px; padding-right: 0; }
.th-check input, .td-check input { cursor: pointer; width: 15px; height: 15px; }

/* Bulk result summary modal */
.bulk-result-overlay {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: center; justify-content: center;
  background: rgba(16, 24, 40, .45); padding: 20px;
}
.bulk-result-box {
  background: var(--white, #fff); border-radius: 14px;
  width: 100%; max-width: 440px; padding: 20px 22px;
  box-shadow: 0 18px 48px rgba(16, 24, 40, .28);
}
.bulk-result-head { font-size: 16px; font-weight: 700; margin-bottom: 10px; }
.bulk-result-sub { font-size: 12px; color: var(--muted, #667085); margin-bottom: 6px; }
.bulk-result-ok { font-size: 13px; color: var(--muted, #667085); margin-bottom: 4px; }
.bulk-result-list { max-height: 240px; overflow: auto; margin-bottom: 8px; }
.bulk-result-row {
  display: flex; gap: 8px; align-items: baseline;
  font-size: 12.5px; padding: 5px 0; border-bottom: 1px solid var(--border);
}
.brr-id { font-weight: 700; white-space: nowrap; }
.brr-msg { color: #b42318; }
.bulk-result-close {
  margin-top: 12px; width: 100%;
  padding: 9px 0; border-radius: 9px; border: none; cursor: pointer;
  background: var(--teal, #0d9488); color: #fff; font-weight: 600; font-size: 13px;
}

/* Background import card — inline at the top of the page */
.imp-toast {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 14px;
  padding: 12px 16px;
  background: var(--white);
  border: 1px solid var(--border);
  border-left: 4px solid var(--teal);
  border-radius: 12px;
  box-shadow: 0 4px 18px rgba(11,25,41,0.07);
  animation: imp-rise 0.3s cubic-bezier(0.16,1,0.3,1) both;
}
.imp-toast.is-paused { border-left-color: var(--amber); }
.imp-toast.is-done { border-left-color: var(--green); }
.imp-toast.is-fail { border-left-color: var(--rose); }
.imp-spinner {
  width: 18px; height: 18px; flex-shrink: 0;
  border: 2.5px solid var(--teal-border); border-top-color: var(--teal);
  border-radius: 50%; animation: imp-spin 0.7s linear infinite;
}
.imp-badge {
  width: 24px; height: 24px; flex-shrink: 0; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--green-light); color: var(--green);
  font-size: 0.8rem; font-weight: 900;
}
.imp-toast.is-fail .imp-badge { background: var(--rose-light); color: var(--rose); }
.imp-badge.is-pause { background: var(--amber-light); color: var(--amber); font-size: 0.6rem; letter-spacing: -1px; }
.imp-btns { display: flex; gap: 6px; flex-shrink: 0; }
.imp-continue {
  padding: 6px 14px; border-radius: 8px; border: none;
  background: var(--teal); color: #fff;
  font-family: Figtree, sans-serif; font-size: 0.72rem; font-weight: 700; cursor: pointer;
}
.imp-continue:hover { background: var(--teal-dark); }
.imp-discard {
  padding: 6px 12px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.72rem; font-weight: 700; color: var(--ink-mid); cursor: pointer;
}
.imp-discard:hover { border-color: var(--rose-border); color: var(--rose); }
.imp-saveexit {
  padding: 6px 12px; border-radius: 8px;
  border: 1.5px solid var(--border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.72rem; font-weight: 700; color: var(--ink-mid); cursor: pointer;
}
.imp-saveexit:hover { border-color: var(--teal); color: var(--teal); }
.imp-toast-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.imp-toast-body.imp-clickable { cursor: pointer; border-radius: 8px; }
.imp-toast-body.imp-clickable:hover strong { color: var(--teal); }
.imp-toast-body strong { font-size: 0.78rem; color: var(--ink); }
.imp-toast-sub { font-size: 0.66rem; color: var(--ink-dim); }
.imp-bar { height: 6px; background: var(--surface); border-radius: 4px; overflow: hidden; }
.imp-bar-fill { height: 100%; background: var(--teal); border-radius: 4px; transition: width 0.4s ease; }
.imp-cancel {
  flex-shrink: 0; padding: 6px 13px; border-radius: 8px;
  border: 1.5px solid var(--rose-border); background: var(--white);
  font-family: Figtree, sans-serif; font-size: 0.7rem; font-weight: 700;
  color: var(--rose); cursor: pointer;
}
.imp-cancel:hover { background: var(--rose-light); }
.imp-x {
  flex-shrink: 0; width: 24px; height: 24px; border-radius: 7px;
  border: none; background: transparent; color: var(--ink-dim);
  font-size: 0.85rem; cursor: pointer;
}
.imp-x:hover { background: var(--surface); color: var(--ink); }
@keyframes imp-spin { to { transform: rotate(360deg); } }
@keyframes imp-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.fade-in { animation: fadeUp .3s cubic-bezier(.16,1,.3,1) both; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* ── Skeleton loader ─────────────────────────────────────────────────────── */
@keyframes shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position:  400px 0; }
}
.sk {
  background: linear-gradient(90deg, var(--surface) 0%, #e2e8ef 40%, var(--surface) 80%);
  background-size: 400px 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 4px;
  display: block;
}
.sk-stat-card {
  padding: 13px 16px; border-radius: var(--r-lg);
  background: var(--white); border: 1px solid var(--border);
  border-top: 3px solid var(--border);
}
.sk-row td { padding: 13px 14px; }

/* Header */
.page-header {
  display: flex; align-items: flex-end; justify-content: space-between;
  margin-bottom: 18px; flex-wrap: wrap; gap: 12px;
  @media (max-width: 500px) {
    flex-direction: column; align-items: flex-start;
  }
}
.page-title { font-size: 1.5rem; font-weight: 800; color: var(--ink); }
.page-sub { font-size: .82rem; color: var(--ink-dim); margin-top: 2px; }
.page-header-right {
  display: flex; gap: 8px; align-items: center;
  @media (max-width: 500px) {
    width: 100%; justify-content: flex-start;
    flex-wrap: wrap;
  }
}

.hdr-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 8px;
  background: var(--white); border: 1.5px solid var(--border);
  font-family: Figtree, sans-serif; font-size: .75rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer; text-decoration: none;
  transition: all .13s;
}
.hdr-btn:hover { border-color: var(--teal-border); color: var(--teal); background: var(--teal-pale); }
.hdr-btn:disabled { opacity: .5; cursor: not-allowed; }
.hdr-btn:disabled:hover { border-color: var(--border); color: var(--ink-mid); background: var(--white); }
.hdr-btn.on { background: var(--amber-light); border-color: var(--amber-border); color: var(--amber); }
.hdr-btn.primary { background: var(--teal); color: #fff; border-color: var(--teal); }
.hdr-btn.primary:hover { background: var(--teal-dark); color: #fff; }

.pill {
  background: var(--amber); color: #fff; border-radius: 20px;
  padding: 1px 6px; font-size: .62rem;
}

/* Stat strip */
.stat-grid {
  display: grid; grid-template-columns: repeat(5, 1fr);
  gap: 12px; margin-bottom: 18px;
  @media (max-width: 1200px) {
    grid-template-columns: repeat(3, 1fr);
  }
  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 320px) {
    grid-template-columns: 1fr;
  }
}
.stat-card {
  padding: 13px 16px; border-radius: var(--r-lg);
  background: var(--white); border: 1px solid var(--border);
  border-top: 3px solid var(--teal);
}
.stat-card.c-rose   { border-top-color: var(--rose); }
.stat-card.c-amber  { border-top-color: var(--amber); }
.stat-card.c-purple { border-top-color: #8b5cf6; }
.stat-card.c-teal   { border-top-color: var(--teal); }
.stat-card.c-slate  { border-top-color: #64748b; }
.stat-card { transition: box-shadow .12s, border-color .12s; }
.stat-card:hover { border-color: var(--ink-dim); }
.stat-card.stat-active { border-color: var(--teal); box-shadow: 0 0 0 2px var(--teal) inset; }
.stat-label { font-size: .62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--ink-dim); }
.stat-val { font-size: 1.3rem; font-weight: 800; color: var(--ink); margin: 4px 0 2px; }
.stat-sub { font-size: .68rem; color: var(--ink-dim); }

/* Filters */
.filters-card { padding: 14px 18px; margin-bottom: 14px; }
.filters-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

.search-wrap { position: relative; flex: 1; min-width: 200px; }
.search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; }
.search-wrap input {
  width: 100%; padding: 8px 10px 8px 32px;
  border: 1.5px solid var(--border); border-radius: 9px;
  font-family: Figtree, sans-serif; font-size: .78rem; color: var(--ink);
  outline: none; box-sizing: border-box;
}
.search-wrap input:focus { border-color: var(--teal); }

body.dark .search-wrap input {
  background: var(--white);
}
.subj-wrap { position: relative; }
.subj-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 6px 13px; border-radius: 20px;
  border: 1.5px solid var(--border); background: var(--white);
  color: var(--ink-mid);
  font-family: Figtree, sans-serif; font-size: .73rem; font-weight: 700;
  cursor: pointer;
}
.subj-btn.on { border-color: var(--teal); background: var(--teal-pale); color: var(--teal-mid); }
.subj-count {
  background: var(--teal); color: #fff; border-radius: 20px;
  padding: 0 5px; font-size: .6rem;
}
.subj-menu {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 200;
  background: var(--white); border: 1.5px solid var(--border);
  border-radius: var(--r-lg); box-shadow: 0 8px 32px rgba(15,31,46,.12);
  min-width: 220px; padding: 6px;
}
.subj-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 7px; cursor: pointer;
  font-size: .76rem; font-weight: 600; color: var(--ink-mid);
}
.subj-row:hover { background: var(--surface); }
.subj-row.on { background: var(--teal-pale); color: var(--teal-mid); font-weight: 800; }
.subj-row .check { width: 14px; display: inline-flex; align-items: center; justify-content: center; }
.subj-sep { border-top: 1px solid var(--border); margin: 4px 0; }

.qb-filter-select {
  padding: 6px 10px; border: 1.5px solid var(--border); border-radius: 9px;
  font-family: Figtree, sans-serif; font-size: .72rem; font-weight: 600;
  color: var(--ink-mid); background: var(--white);
  outline: none; cursor: pointer; max-width: 200px;
}
.qb-filter-select:focus { border-color: var(--teal-border); }
.qb-filter-select.on { border-color: var(--teal-border); color: var(--teal-dark); }
.diff-pills {
  display: flex; gap: 5px;
  @media (max-width: 500px) {
    flex-wrap: wrap;
  }
}
.diff-pills button {
  padding: 6px 12px; border-radius: 20px;
  font-family: Figtree, sans-serif; font-size: .71rem; cursor: pointer;
}

.reset-btn {
  padding: 6px 12px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--border);
  font-size: .72rem; color: var(--ink-dim); cursor: pointer;
}

/* Table */
.table-card { padding: 0; overflow: hidden; }
/* The rows scroll inside this container (table-head stays above, pagination
   below). Height adapts to the viewport; the sticky thead keeps column labels
   in view. Short pages (e.g. 10 rows) simply don't reach the cap, so no scroll. */
.qb-scroll { overflow: auto; max-height: calc(100vh - 340px); min-height: 200px; }
.table-head {
  padding: 14px 18px 10px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}
.table-count { font-size: .78rem; font-weight: 700; color: var(--ink); }
.filtered-tag { font-size: .68rem; color: var(--ink-dim); font-weight: 400; margin-left: 4px; }
.table-hint { font-size: .65rem; color: var(--ink-dim); }

.qb-table { width: 100%; border-collapse: collapse; }
.qb-table thead tr { border-bottom: 1px solid var(--border); background: var(--surface); }
.qb-table thead th { position: sticky; top: 0; z-index: 2; background: var(--surface); }
.qb-table th {
  font-size: .58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px;
  color: var(--ink-dim); padding: 9px 14px; text-align: left; cursor: pointer; user-select: none; white-space: nowrap;
}
.qb-table th.th-center { text-align: center; }
.qb-table th.active { color: var(--teal-mid); }
.qb-table th.th-id { width: 60px; }

.q-row { cursor: pointer; border-bottom: 1px solid var(--border); background: var(--white); transition: background .1s; }
.q-row:hover { background: var(--surface); }
.q-row.open { background: var(--surface); border-bottom: none; }
.q-row-expanded { background: var(--surface); border-bottom: 1px solid var(--border); }
.qb-table td { padding: 11px 14px; vertical-align: middle; }

.td-id { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .68rem; color: var(--ink-dim); width: 78px; white-space: nowrap; }
.q-stableid { display: block; color: var(--ink, #0f172a); font-weight: 600; }
.q-srcrow { display: block; margin-top: 2px; font-size: .62rem; color: var(--ink-dim, #94a3b8); }
.td-stem { max-width: 340px; }
.stem-clip {
  font-size: .77rem; color: var(--ink); line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.td-topic { white-space: nowrap; }
.topic-row { display: flex; align-items: center; gap: 5px; }
.topic-icon { font-size: .8rem; }
.topic-label { font-size: .68rem; color: var(--ink-dim); }
.sub-label { font-size: .62rem; color: var(--ink-faint); margin-top: 1px; }

.td-center { text-align: center; }
.td-updated { font-size: .7rem; color: var(--ink-dim); white-space: nowrap; }
.diff-pill {
  font-size: .65rem; font-weight: 800; padding: 2px 9px; border-radius: 20px;
  text-transform: lowercase;
}
.diff-pill.big { font-size: .66rem; padding: 3px 10px; }

.pct-row { display: flex; align-items: center; gap: 6px; justify-content: center; }
.pct-bar { width: 44px; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.pct-fill { height: 100%; border-radius: 2px; }
.pct-num { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .7rem; font-weight: 700; }

.td-uses {
  text-align: center; font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums;
  font-size: .68rem; color: var(--ink-dim);
}

.flag-btn {
  padding: 4px 9px; border-radius: 6px;
  background: var(--surface); border: 1px solid var(--border);
  font-size: .7rem; cursor: pointer; color: var(--ink-dim);
}
.flag-btn.on { background: var(--amber-light); border-color: var(--amber-border); color: var(--amber); }
.flag-btn.ml-auto { margin-left: auto; }

.td-right { text-align: right; }
.view-btn {
  padding: 5px 11px; border-radius: 7px;
  background: var(--teal-pale); color: var(--teal-mid);
  border: 1px solid var(--teal-border);
  font-family: Figtree, sans-serif; font-size: .68rem; font-weight: 700; cursor: pointer;
}
.view-btn:hover { background: var(--teal); color: #fff; }

/* Edit button — own questions (slightly stronger affordance than View) */
.edit-btn {
  padding: 5px 11px; border-radius: 7px;
  background: var(--teal); color: #fff;
  border: 1px solid var(--teal);
  font-family: Figtree, sans-serif; font-size: .68rem; font-weight: 700; cursor: pointer;
}
.edit-btn:hover { filter: brightness(1.06); }

/* Why-in-review reason, shown under the stem in the Needs-Review queue. */
.review-reason {
  margin-top: 4px;
  font-size: 0.68rem;
  line-height: 1.4;
  color: var(--amber, #b45309);
  font-weight: 600;
}

/* Needs-review inline actions */
/* Approve/Reject failure bar — the 403 case has to be visible, not console-only. */
.review-error {
  display: flex; align-items: flex-start; gap: 10px;
  background: rgba(220,38,38,0.05);
  border: 1px solid rgba(220,38,38,0.2);
  border-left: 3px solid var(--rose, #e11d48);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 14px;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--ink-mid, #475569);
}
.review-error-x {
  margin-left: auto; flex: none;
  background: none; border: none; cursor: pointer;
  color: var(--ink-dim, #94a3b8); font-size: 0.8rem; line-height: 1;
}
.review-error-x:hover { color: var(--ink, #0f172a); }

.review-approve, .review-reject {
  padding: 5px 10px; border-radius: 7px;
  font-family: Figtree, sans-serif; font-size: .68rem; font-weight: 700; cursor: pointer;
  margin-right: 4px;
}
.review-approve { background: var(--green, #16a34a); color: #fff; border: 1px solid var(--green, #16a34a); }
.review-reject  { background: #fff; color: var(--rose, #e11d48); border: 1px solid var(--rose-border, #fecdd3); }
.review-approve:hover, .review-reject:hover { filter: brightness(1.04); }
.review-approve:disabled, .review-reject:disabled { opacity: .5; cursor: not-allowed; }

/* Delete — own questions only (destructive; server also enforces ownership) */
.del-btn {
  padding: 5px 10px; border-radius: 7px; margin-left: 4px;
  font-family: Figtree, sans-serif; font-size: .68rem; font-weight: 700; cursor: pointer;
  background: #fff; color: var(--rose, #e11d48); border: 1px solid var(--rose-border, #fecdd3);
}
.del-btn:hover { background: var(--rose, #e11d48); color: #fff; }
.del-btn:disabled { opacity: .5; cursor: not-allowed; }

/* Delete result toast */
.qb-toast {
  position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); z-index: 500;
  background: var(--ink, #0f1f2e); color: #fff; padding: 10px 18px; border-radius: 9px;
  font-family: Figtree, sans-serif; font-size: .8rem; font-weight: 600;
  box-shadow: 0 14px 40px rgba(15,31,46,.34);
}

/* Source badge — Institution (own) vs Shared pool */
.src-badge {
  display: inline-flex; flex-direction: column; align-items: flex-start;
  line-height: 1.2; font-size: .74rem; font-weight: 700;
}
.src-badge .src-name { display: inline-flex; align-items: center; gap: 5px; }
.src-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.src-badge .src-sub { font-size: .62rem; font-weight: 500; color: var(--ink-faint, #95a0ad); }
.src-inst   { color: var(--teal-mid); }
.src-inst   .src-dot { background: var(--teal); }
.src-shared { color: #7c3aed; }
.src-shared .src-dot { background: #8b5cf6; }

.expanded {
  padding: 14px 20px 16px 56px;
  display: grid; grid-template-columns: 1fr auto; gap: 20px;
  border-top: 1px dashed var(--border);
}
.exp-stem { font-size: .73rem; color: var(--ink); line-height: 1.6; margin-bottom: 10px; white-space: pre-line; }
.choices { display: flex; flex-direction: column; gap: 5px; }
.choice {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-radius: 7px;
  background: var(--white); border: 1px solid var(--border);
}
.choice.correct { background: var(--teal-pale); border-color: var(--teal-border); }
.choice-letter {
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .68rem; font-weight: 700;
  color: var(--ink-dim); flex-shrink: 0;
}
.choice.correct .choice-letter { color: var(--teal-mid); }
.choice-text { font-size: .73rem; color: var(--ink); }
.choice.correct .choice-text { color: var(--teal-dark); }
.correct-tag { margin-left: auto; font-size: .6rem; font-weight: 800; color: var(--teal-mid); }

.expanded-side { min-width: 200px; max-width: 240px; }
.exp-label {
  font-size: .6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px;
  color: var(--ink-dim); margin-bottom: 8px;
}
.exp-text { font-size: .71rem; color: var(--ink-mid); line-height: 1.6; white-space: pre-line; }

.empty-state {
  padding: 48px; text-align: center;
  color: var(--ink-faint); font-size: .8rem;
}

/* Pagination */
.pagination {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
  gap: 10px;
  padding: 12px 18px; border-top: 1px solid var(--border);
}
.pag-info { font-size: .71rem; color: var(--ink-dim); display: inline-flex; align-items: center; gap: 14px; }
.pag-size { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.pag-size-select {
  padding: 3px 6px; border: 1.5px solid var(--border); border-radius: 7px;
  font-family: Figtree, sans-serif; font-size: .71rem; color: var(--ink);
  background: var(--white); outline: none; cursor: pointer;
}
.pag-size-select:focus { border-color: var(--teal-border); }
.pag-btns { display: flex; flex-wrap: wrap; gap: 4px; }
.pag-arrow, .pag-num {
  padding: 5px 10px; border-radius: 7px;
  background: var(--surface); border: 1px solid var(--border);
  font-family: Figtree, sans-serif; font-size: .72rem; font-weight: 700;
  cursor: pointer; color: var(--ink-mid);
}
.pag-num { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; }
.pag-num.active { background: var(--teal); border-color: var(--teal); color: #fff; }
.pag-arrow:disabled { opacity: .4; cursor: not-allowed; }

/* Detail view */
.detail-view { max-width: 1100px; }
.bread { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
.back-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: 8px;
  background: var(--surface); border: 1.5px solid var(--border);
  font-family: Figtree, sans-serif; font-size: .74rem; font-weight: 700;
  color: var(--ink-mid); cursor: pointer;
}
.back-btn:hover { border-color: var(--teal-border); color: var(--teal); }
.bread-sep { color: var(--ink-faint); }
.bread-topic { font-size: .75rem; color: var(--ink-dim); }
.bread-q { font-size: .75rem; font-weight: 700; color: var(--ink); }

.detail-grid {
  display: grid; grid-template-columns: 1fr 320px;
  gap: 20px; align-items: start;
}
.detail-main { display: flex; flex-direction: column; gap: 16px; }
.detail-side { display: flex; flex-direction: column; gap: 14px; position: sticky; top: 20px; }

.card {
  padding: 18px; border-radius: var(--r-lg);
  background: var(--white); border: 1px solid var(--border);
}

.qhead { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.qhead-id { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .72rem; font-weight: 700; color: var(--ink-dim); }
.qhead-tag {
  font-size: .66rem; padding: 3px 10px; border-radius: 20px;
  background: var(--surface); color: var(--ink-dim); border: 1px solid var(--border);
}
.qstem { font-size: .86rem; font-weight: 500; color: var(--ink); line-height: 1.65; margin-bottom: 20px; white-space: pre-line; }

.qchoices { display: flex; flex-direction: column; gap: 7px; }
.qchoice {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 9px;
  background: var(--white); border: 1.5px solid var(--border);
}
.qchoice.correct { background: var(--teal-pale); border-color: var(--teal); }
.qchoice-letter {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--surface); border: 2px solid var(--border);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .68rem; font-weight: 700; color: var(--ink-dim);
}
.qchoice.correct .qchoice-letter { background: var(--teal); border-color: var(--teal); color: #fff; }
.qchoice-text { font-size: .8rem; color: var(--ink); }
.qchoice.correct .qchoice-text { color: var(--teal-dark); }
.qchoice-tag { margin-left: auto; font-size: .65rem; font-weight: 800; color: var(--teal-mid); }

/*.expl-card { background: linear-gradient(135deg, var(--teal-pale), rgba(240,254,255,.5)); }*/
.expl-label { font-size: .65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: var(--teal-mid); margin-bottom: 10px; }
.expl-text { font-size: .8rem; color: var(--ink); line-height: 1.7; white-space: pre-line; }

.sim-label { font-size: .65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: var(--ink-dim); margin-bottom: 12px; }
.sim-list { display: flex; flex-direction: column; }
.sim-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 0; border-bottom: 1px solid var(--border);
  cursor: pointer; transition: opacity .13s;
}
.sim-row:hover { opacity: .7; }
.sim-row:last-child { border-bottom: none; }
.sim-id {
  font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .65rem; font-weight: 700;
  color: var(--ink-dim); flex-shrink: 0; width: 28px;
}
.sim-stem { font-size: .75rem; color: var(--ink); flex: 1; line-height: 1.4; }

/* Side card */
.side-label {
  font-size: .6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 2px;
  color: var(--ink-dim); margin-bottom: 8px;
}
.side-pct { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: 2rem; font-weight: 800; }
.side-sub { font-size: .7rem; color: var(--ink-dim); margin-bottom: 12px; }
.side-bar { height: 6px; background: var(--surface); border-radius: 3px; overflow: hidden; }
.side-fill { height: 100%; border-radius: 3px; transition: width .3s ease; }
.side-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
.side-stat-label { font-size: .58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--ink-dim); }
.side-stat-val { font-size: .9rem; font-weight: 700; color: var(--ink); text-transform: capitalize; margin-top: 3px; }

.capitalize-first { text-transform: capitalize;}
td.td-right {
    min-width: 180px;
}

button.view-btn {
    margin-left: 4px;
}
</style>
