<script setup lang="ts">
// /institute/assign-exams — 4-step wizard (static data; API wiring per feature)
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { diffBg, diffColor, diffLabel, type Difficulty } from '../../composables/useQuestionBank'
import { useAssignExamsReset } from '~/composables/useAssignExamsReset'
const { instName } = useInstitution()

// Permission matrix (admin panel → Role Matrix). This page had no UI gating at
// all — every action rendered for every role and only failed at the API. Now:
//
//   canEdit   → assign an exam, edit its settings, clone it   (perm:assign_exams,edit)
//   canManage → DELETE an assignment                          (perm:assign_exams,full)
//
// Deleting pulls the exam out from under every student it was given to, so it is
// `full`. The perm: middleware enforces the same split server-side.
const { canEdit, canManage } = useInstitutePermissions()
const PERM_AREA = 'assign_exams' as const

definePageMeta({ layout: 'institute' })
useHead({ title: 'Assign Exam · Institute' })

// Sidebar same-page click → signal increments → reset to default state (no URL change)
const assignExamsReset = useAssignExamsReset()
watch(assignExamsReset, () => { resetWizard() })

// ── Types ────────────────────────────────────────────────────────────────────
type Preset    = 'new-exam' | 'reassign'
type QSelMode  = 'blueprint' | 'topics' | 'questions'

type ApiStudent = {
  id: number
  user_id: number
  name: string
  email?: string
  avatar_url?: string | null
}

type ApiAssignment = {
  id: number
  name: string
  exam_bank_id: number
  exam_bank_name?: string
  q_sel_mode?: string
  question_count: number
  student_count: number
  difficulty: string
  duration_minutes: number
  timed: boolean | number
  marking_method: string
  neg_mark_penalty: number | null
  pass_mark_type: string
  pass_mark_value: number | null
  cohen_percentile?: number | null
  cohen_factor?: number | null
  extra_time_enabled?: boolean
  show_leaderboard?: boolean
  extra_time_mins?: number
  extra_time_student_ids?: number[]
  send_now?: boolean
  send_at?: string | null
  attempt_limit: number
  results_release: string
  can_declare: boolean        // true = manual exam with undeclared completed attempts
  recipient_type: string
  cohort_id: number | null
  cohort_ids?: number[]
  question_ids: number[]
  excluded_question_ids: number[]
  due_date: string | null
  status: string
  created_at: string
}

type ApiCohort = {
  id: number
  name: string
  color: string       // raw string from API e.g. "teal", "purple"
  studentCount: number
}

type ApiQuestion = {
  id: number
  question_stem: string
  difficulty: string
  topic?:      { id: number; name: string } | null
  subject?:    { id: number; name: string } | null
  domain?:     { id: number; name: string } | null
  category?:   { id: number; name: string } | null
  discipline?: { id: number; name: string } | null
  tags?:       { id: number; name: string }[]
}

// Imported question stems are stored as HTML. This wizard shows them via {{ }},
// so strip the tags to plain text (otherwise "<p>…" prints literally). Paragraph
// breaks → newlines, other tags dropped, entities decoded. Never v-html → no XSS.
function plain(input: unknown): string {
  const s = input == null ? '' : String(input)
  if (!s) return ''
  let t = s
    .replace(/\s*<\/p\s*>\s*<p[^>]*>\s*/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/?[^>]+>/g, '')
  if (import.meta.client && t.includes('&')) {
    const el = document.createElement('textarea')
    el.innerHTML = t
    t = el.value
  }
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ── API ───────────────────────────────────────────────────────────────────────
const api = useInstituteApi()

// Submission state
const submitting  = ref(false)
// True while advancing to the next step is doing async work (e.g. fetching the
// Review-step preview). Disables the Continue button so a slow response can't be
// double-clicked into multiple submissions.
const advancing   = ref(false)
const submitError = ref<string | null>(null)

// Synthetic "Shared Pool" picker entry — a UI-only pseudo-bucket (NOT a real exam
// row). Selecting it preselects source = 'public', which the builder already returns
// bucket-independent (scopeForBuilder ignores exam_id for the public branch). Its id
// is a negative sentinel so it never collides with a real exams.id; exam_bank_id has
// no FK, so persisting -1 on an assignment is safe and round-trips on edit.
const SHARED_POOL_ID = -1

// Exam bank list (from API). `shared` marks the synthetic Shared Pool entry.
const exams           = ref<{ id: number; name: string; type?: string; owned?: boolean; shared?: boolean }[]>([])
const selectedExamId  = ref<number | null>(null)

// Questions for selected exam (step 2) — server-side paginated
const examQuestions    = ref<ApiQuestion[]>([])
const questionsLoading = ref(false)
const examQTotal       = ref(0)
const examQPage        = ref(1)
const examQPageSize    = 50
const examQTotalPages  = computed(() => Math.max(1, Math.ceil(examQTotal.value / examQPageSize)))

// Selected IDs + full objects — objects persist across page changes so step 3 always has full data
const selectedQIds     = ref<Set<number>>(new Set())
const selectedQObjects = ref<Map<number, ApiQuestion>>(new Map())

async function fetchExams() {
  try {
    const res = await api<any>('/getexamsofinstitute')
    if (res?.data?.exams) {
      const real = res.data.exams as Array<{ id: number; name: string; type?: string; owned?: boolean }>
      // Append the synthetic Shared Pool entry so it always sits at the end of the
      // picker, holding every other institution's public questions.
      exams.value = [...real, { id: SHARED_POOL_ID, name: 'Shared Pool', owned: false, shared: true }]
      // Auto-select only when there is exactly one REAL exam (ignore the synthetic
      // Shared Pool entry so it never becomes the default selection).
      if (real.length === 1) selectedExamId.value = real[0].id
    }
  } catch { /* fail silently */ }
}

async function fetchExamQuestions() {
  if (!selectedExamId.value) return
  questionsLoading.value = true
  try {
    const query: Record<string, any> = {
      eid:     selectedExamId.value,
      page:    examQPage.value,
      limit:   examQPageSize,
      orderBy: 'asc',
      // Builder rule: exam_id gates Passmed only; My/Shared are exam-independent.
      passmed_exam_gate: 1,
    }
    if (difficulty.value !== 'mixed') query.difficulty = difficulty.value
    if (subjectId.value)     query.subject_id    = subjectId.value
    if (domainId.value)      query.domain_id     = domainId.value
    if (disciplineId.value)  query.discipline_id = disciplineId.value
    if (source.value !== 'all') query.source = source.value
    const res = await api<any>('/questionbanklist', { query })
    if (res?.status === 'success') {
      examQuestions.value = res.data  ?? []
      examQTotal.value    = res.total ?? 0
      // Auto-populate selectedQObjects for any fetched question that is already selected
      // This ensures step 3 always has full data for pre-selected questions
      if (selectedQIds.value.size > 0) {
        const objs = new Map(selectedQObjects.value)
        for (const q of examQuestions.value) {
          if (selectedQIds.value.has(Number(q.id))) objs.set(Number(q.id), q)
        }
        selectedQObjects.value = objs
      }
    } else {
      examQuestions.value = []; examQTotal.value = 0
    }
  } catch { examQuestions.value = []; examQTotal.value = 0 }
  finally { questionsLoading.value = false }
}

function toggleQId(q: ApiQuestion) {
  const id   = Number(q.id)
  const ids  = new Set(selectedQIds.value)
  const objs = new Map(selectedQObjects.value)
  if (ids.has(id)) { ids.delete(id); objs.delete(id) }
  else             { ids.add(id);    objs.set(id, q) }
  selectedQIds.value     = ids
  selectedQObjects.value = objs
}

onMounted(() => {
  step.value              = 1
  preset.value            = null
  reassignId.value        = null
  isEditingExisting.value = false
  isCloningExisting.value = false
  submitted.value         = false
  submitError.value       = null
  selectedQIds.value      = new Set()
  selectedQObjects.value  = new Map()
  removedQs.value         = new Set()
  recipients.value        = 'cohort'
  selectedCohortIds.value = new Set()
  selectedStudents.value  = new Set()

  // Arriving from Students with a selection (?student_ids=1,2,3) → pre-fill the
  // recipients as a custom pick of those users so the wizard opens with them
  // already chosen.
  const sid = useRoute().query.student_ids
  if (sid) {
    const ids = String(sid).split(',').map(n => Number(n)).filter(Boolean)
    if (ids.length) {
      recipients.value = 'custom'
      selectedStudents.value = new Set(ids)
    }
  }

  fetchExams(); fetchStudents(); fetchAssignments(); fetchCohortsForPicker()
})

onBeforeUnmount(() => {
  // Reset step so if Nuxt re-uses this component, mount logic starts clean
  step.value   = 1
  preset.value = null
})

// ── Students (from API) ───────────────────────────────────────────────────────
const apiStudents     = ref<ApiStudent[]>([])
const studentsLoading = ref(false)

// At-risk recipient: the real list is computed by the backend; we fetch the
// same /at-risk list once (lazily) just to show an accurate recipient count.
const atRiskIds      = ref<number[]>([])
const atRiskLoaded   = ref(false)
async function ensureAtRisk() {
  if (atRiskLoaded.value) return
  try {
    const res: any = await api('/at-risk')
    if (res?.status === 'success' && Array.isArray(res.data)) {
      atRiskIds.value = res.data.map((r: any) => Number(r.user_id)).filter(Boolean)
    }
  } catch { /* count falls back to 0 */ }
  finally { atRiskLoaded.value = true }
}

async function fetchStudents() {
  studentsLoading.value = true
  try {
    const res = await api<any>('/testinstitutions', { query: { limit: 500 } })
    if (res?.status === 'success') apiStudents.value = res.data ?? []
  } catch { /* fail silently */ }
  finally { studentsLoading.value = false }
}

// Generate initials from name for avatar display
function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}
// Deterministic pastel bg from user_id
const avatarBgs = [
  'linear-gradient(135deg,#0369a1,#06b6d4)',
  'linear-gradient(135deg,#047857,#059669)',
  'linear-gradient(135deg,#5b21b6,#7c3aed)',
  'linear-gradient(135deg,#be123c,#e11d48)',
  'linear-gradient(135deg,#92400e,#d97706)',
  'linear-gradient(135deg,#0f766e,#0d9488)',
  'linear-gradient(135deg,#1e40af,#3b82f6)',
  'linear-gradient(135deg,#9d174d,#db2777)',
]
function avatarBg(userId: number) { return avatarBgs[userId % avatarBgs.length] }

// ── Cohorts for recipient picker ──────────────────────────────────────────────
const cohortsForPicker       = ref<ApiCohort[]>([])
const cohortsPickerLoading   = ref(false)

const cohortColorMap: Record<string, string> = {
  teal: '#06b6d4', purple: '#8b5cf6', green: '#10b981',
  amber: '#f59e0b', rose: '#f43f5e', blue: '#0ea5e9',
}
function cohortCssColor(name: string) { return cohortColorMap[name] ?? cohortColorMap['teal'] }

async function fetchCohortsForPicker() {
  cohortsPickerLoading.value = true
  try {
    const res = await api<any>('/cohorts')
    cohortsForPicker.value = (res?.data ?? []).map((c: any) => ({
      id:           Number(c.id),
      name:         c.name,
      color:        c.color ?? 'teal',
      studentCount: c.students?.length ?? c.student_count ?? 0,
    }))
  } catch { /* fail silently */ }
  finally { cohortsPickerLoading.value = false }
}

// ── Past assignments (for reassign flow) ─────────────────────────────────────
const assignments        = ref<ApiAssignment[]>([])
const assignmentsLoading = ref(false)

async function fetchAssignments() {
  assignmentsLoading.value = true
  try {
    const res = await api<any>('/assignments')
    if (res?.status === 'success') assignments.value = res.data ?? []
  } catch { /* fail silently */ }
  finally { assignmentsLoading.value = false }
}

// ── Edit existing assignment (walks full wizard, PATCHes on submit) ───────────
const isEditingExisting = ref(false)
const isCloningExisting = ref(false)  // prefilled but POSTs a new record

function startEditAssignment(a: ApiAssignment, e: Event) {
  e.stopPropagation()
  reassignId.value        = a.id
  isEditingExisting.value = true
  isCloningExisting.value = false
  step.value              = 1
  loadReassignData(a)
}

// ── Clone/Reassign — prefills wizard but POSTs a new record ──────────────────
function startCloneAssignment(a: ApiAssignment, e: Event) {
  e.stopPropagation()
  reassignId.value        = null   // no existing ID — we're creating new
  isEditingExisting.value = false
  isCloningExisting.value = true
  step.value              = 1
  loadReassignData(a)
}

// ── Recipients helper — avoids unreliable inline TS casts in templates ────────

// ── Assignment delete ─────────────────────────────────────────────────────────
// Styled confirm modal replaces the native browser confirm() dialog.
const pendingDelete = ref<ApiAssignment | null>(null)
function deleteAssignment(a: ApiAssignment, e: Event) {
  e.stopPropagation()
  pendingDelete.value = a
}
const deletingAssignmentId = ref<number | null>(null)
async function doDeleteAssignment() {
  const a = pendingDelete.value
  pendingDelete.value = null                  // close the dialog immediately
  if (!a || deletingAssignmentId.value) return
  deletingAssignmentId.value = a.id           // busy guard — no double-fire
  const prune = () => {
    assignments.value = assignments.value.filter(x => x.id !== a.id)
    if (reassignId.value === a.id) reassignId.value = null
  }
  try {
    await api(`/assignments/${a.id}`, { method: 'DELETE' })
    prune()
    showToast('Assignment deleted')
  } catch (err: any) {
    const code = err?.response?.status ?? err?.statusCode
    if (code === 403)      showToast("You don't have permission to delete assignments.", 'var(--rose)')
    else if (code === 404) { prune(); showToast('That assignment no longer exists.', 'var(--rose)') }
    else                   showToast(err?.data?.message || 'Failed to delete assignment')
  } finally {
    deletingAssignmentId.value = null
  }
}

// ── Declare Results ───────────────────────────────────────────────────────────
const declaringId = ref<number | null>(null)

async function declareResults(a: ApiAssignment, e: Event) {
  e.stopPropagation()
  if (declaringId.value || !a.can_declare) return
  declaringId.value = a.id
  try {
    const res = await api<any>(`/mock-exams/${a.id}/declare-results`, { method: 'POST' })
    if (res?.status === 'success') {
      // Disable button immediately — no new undeclared attempts right now
      const idx = assignments.value.findIndex(x => x.id === a.id)
      if (idx !== -1) assignments.value[idx] = { ...assignments.value[idx], can_declare: false }
      showToast(`✅ Results declared for ${res.declared_count} student(s)`)
    } else {
      showToast(`⚠️ ${res?.message ?? 'Could not declare results'}`)
    }
  } catch (err: any) {
    showToast(`⚠️ ${err?.data?.message ?? 'Error declaring results'}`)
  } finally {
    declaringId.value = null
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
const toastMsg     = ref('')
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string) {
  toastMsg.value = msg
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 2800)
}

// Load a past assignment's settings + question IDs into the wizard
async function loadReassignData(a: ApiAssignment) {
  selectedExamId.value   = a.exam_bank_id
  examName.value         = a.name
  questions.value        = a.question_count
  duration.value         = a.duration_minutes
  timed.value            = Boolean(a.timed)
  markingMethod.value    = a.marking_method as any
  negMarkVal.value       = a.neg_mark_penalty != null ? Number(a.neg_mark_penalty) : 0.25
  passMarkMode.value     = a.pass_mark_type as any
  fixedPassMark.value    = a.pass_mark_value ?? 65
  cohenPercentile.value  = a.cohen_percentile ?? 95
  cohenFactor.value      = a.cohen_factor ?? 60
  extraTimeEnabled.value = Boolean(a.extra_time_enabled)
  showLeaderboard.value  = a.show_leaderboard !== false   // default true when absent
  extraTimeMins.value    = a.extra_time_mins || 25
  extraTimeStudents.value= new Set((a.extra_time_student_ids ?? []).map(Number))
  attemptLimit.value     = a.attempt_limit === null ? 99 : a.attempt_limit  // null = unlimited (∞ = 99)
  resultsRelease.value   = a.results_release as any
  scheduledNow.value     = a.send_now ?? true
  sendDate.value         = a.send_at ? String(a.send_at).replace(' ', 'T').slice(0, 16) : ''
  // Restore the due date (backend sends YYYY-MM-DD, which <input type="date"> wants).
  dueDate.value          = a.due_date ? String(a.due_date).slice(0, 10) : ''
  difficulty.value       = (a.difficulty ?? 'mixed') as any
  recipients.value       = (['cohort','atrisk','custom'].includes(a.recipient_type)
    ? a.recipient_type : 'cohort') as 'cohort' | 'atrisk' | 'custom'
  // Restore the question-selection tab the assignment was built with, so edit
  // opens in the same mode (Blueprint / Topics / Individual) instead of the
  // default. Falls back to Individual — the stored question_ids are the actual
  // resolved selection, which Individual shows directly.
  qSelMode.value = (['blueprint', 'topics', 'questions'].includes(a.q_sel_mode as any)
    ? a.q_sel_mode : 'questions') as QSelMode
  selectedQIds.value     = new Set((a.question_ids ?? []).map(Number))
  removedQs.value        = new Set((a.excluded_question_ids ?? []).map(Number))
  selectedQObjects.value = new Map()
  selectedCohortIds.value = new Set(
    (a.cohort_ids?.length ? a.cohort_ids : (a.cohort_id ? [a.cohort_id] : [])).map(Number)
  )
  selectedStudents.value = new Set()

  // For custom assignments, pre-load the previously selected students
  if (a.recipient_type === 'custom') {
    try {
      const res = await api<any>(`/assignments/${a.id}/students`)
      if (res?.status === 'success' && Array.isArray(res.data)) {
        selectedStudents.value = new Set<number>(res.data)
      }
    } catch { /* fail silently — user can re-select */ }
  }
}

// Fetch full question objects for pre-selected IDs (needs `ids` filter on API)
async function loadSelectedQObjects() {
  if (!selectedQIds.value.size || !selectedExamId.value) return
  try {
    // Fetch all questions (large limit) — filter client-side to populate selectedQObjects
    const res = await api<any>('/questionbanklist', {
      query: { eid: selectedExamId.value, limit: 500, page: 1, orderBy: 'asc', passmed_exam_gate: 1 }
    })
    if (res?.status === 'success') {
      const objs = new Map(selectedQObjects.value)
      for (const q of (res.data ?? [])) {
        if (selectedQIds.value.has(Number(q.id))) objs.set(Number(q.id), q)
      }
      selectedQObjects.value = objs
    }
  } catch { /* fail silently */ }
}

// Part 3 — preview the questions the current selection would assign, so the
// Review step shows them in EVERY mode. For blueprint/topics this runs the same
// server-side sampling as the final submit; the resolved ids then drive submit
// (see payload below) so what you review == what gets assigned, and excluding
// a question actually sticks.
async function loadPreviewQuestions() {
  if (!selectedExamId.value) return
  try {
    const body: Record<string, any> = {
      exam_bank_id:    selectedExamId.value,
      q_sel_mode:      qSelMode.value,
      question_ids:    qSelMode.value === 'questions' ? [...selectedQIds.value] : [],
      blueprint:       qSelMode.value === 'blueprint'
                         ? blueprintSlices.value.map((s, i) => ({ domain: s.domain, subject_id: s.subject_id, count: blueprintLocal.value[i]?.count ?? s.count }))
                         : [],
      selected_topics: qSelMode.value === 'topics' ? [...selectedTopics.value] : [],
      source:          source.value,
      difficulty:      difficulty.value,
    }
    if (qSelMode.value === 'topics') body.question_count = questions.value
    const res = await api<any>('/exams/preview-questions', { method: 'POST', body })
    if (res?.status === 'success') {
      const ids  = new Set<number>()
      const objs = new Map<number, ApiQuestion>()
      for (const q of (res.data ?? [])) {
        const id = Number(q.id)
        ids.add(id); objs.set(id, q)
      }
      selectedQIds.value     = ids
      selectedQObjects.value = objs
      removedQs.value        = new Set()   // fresh preview, nothing excluded yet
    }
  } catch { /* fail silently */ }
}

// ── Wizard state ─────────────────────────────────────────────────────────────
const stepLabels = ['Exam Setup', 'Questions', 'Review Questions', 'Recipients & Settings']
const step       = ref(1)
const preset     = ref<Preset | null>(null)
const reassignId = ref<number | null>(null)

// Watches placed here so step/selectedExamId are already declared
watch(step, async (s) => {
  // Reset scroll to the top on every step change so the wizard always opens
  // at the step header rather than wherever the previous step was scrolled.
  if (import.meta.client) {
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }
  if (s === 2 && selectedExamId.value) {
    fetchExamQuestions()
    fetchBlueprint()
    fetchBuilderFacets()
    fetchTopicTree()
    // For reassign: also load full objects for pre-selected questions (needed for step 3)
    if (preset.value === 'reassign' && selectedQIds.value.size) loadSelectedQObjects()
  }
})
watch(selectedExamId, () => { if (step.value === 2) { fetchExamQuestions(); fetchBlueprint(); fetchBuilderFacets(); fetchTopicTree() } })

// Step 1
const examName  = ref('')
const questions = ref(20)
const duration  = ref(60)
const timed     = ref(true)
const dueDate   = ref('')

// Step 2 — default to Blueprint (Part 3 finding #4)
const qSelMode          = ref<QSelMode>('blueprint')
// Topics picker = Subject (parent) → Category (child) tree. selectedTopics holds
// the selected CATEGORY ids (what the backend samples questions from).
type TopicSubject       = { id: number; name: string; categories: { id: number; name: string }[] }
const topicTree         = ref<TopicSubject[]>([])
const expandedSubject   = ref<number | null>(null)
const selectedTopics    = ref<Set<number>>(new Set())   // real category ids
const difficulty        = ref<'mixed' | Difficulty>('mixed')
// Part 3 source picker — which pool the Topics/Individual lists draw from.
const source            = ref<'all' | 'passmed' | 'mine' | 'public'>('all')
// Taxonomy filters (controlled-vocabulary dropdowns). null = any. Options from
// /questionbank/facets for the current builder scope (exam + source).
const subjectId         = ref<number | null>(null)
const domainId          = ref<number | null>(null)
const disciplineId      = ref<number | null>(null)
const facetSubjects     = ref<Array<{ id: number; name: string }>>([])
const facetDomains      = ref<Array<{ id: number; name: string }>>([])
const facetDisciplines  = ref<Array<{ id: number; name: string }>>([])
// Difficulty is curatable now, so the builder's level filter reads the vocabulary
// instead of assuming foundation/intermediate/advanced/expert. Carries `slug` —
// that is what questions.difficulty stores and what the assign payload validates on.
const facetDifficulties = ref<Array<{ id: number; name: string; slug: string }>>([])

// Facet options for the builder scope. Exam gates Passmed only (passmed_exam_gate=1),
// so My/Shared taxonomy shows regardless of the selected exam.
async function fetchBuilderFacets() {
  if (!selectedExamId.value) { facetSubjects.value = []; facetDomains.value = []; facetDisciplines.value = []; return }
  try {
    const query: Record<string, any> = { eid: selectedExamId.value, passmed_exam_gate: 1 }
    if (source.value !== 'all') query.source = source.value
    const res = await api<any>('/questionbank/facets', { query })
    const d = res?.data ?? res
    facetSubjects.value    = Array.isArray(d?.subjects)    ? d.subjects    : []
    facetDomains.value     = Array.isArray(d?.domains)     ? d.domains     : []
    facetDisciplines.value = Array.isArray(d?.disciplines) ? d.disciplines : []
    facetDifficulties.value = Array.isArray(d?.difficulties) ? d.difficulties : []
  } catch { /* dropdowns stay empty */ }
}

watch(source, () => {
  if (step.value !== 2) return
  fetchBuilderFacets()                              // new pool → new taxonomy options
  fetchTopicTree()                                  // new pool → new subject/category tree
  if (examQPage.value === 1) fetchExamQuestions()
  else examQPage.value = 1
})
// Taxonomy dropdown changes → re-filter the list (facets stay put — independent).
watch([subjectId, domainId, disciplineId], () => {
  if (step.value !== 2) return
  if (examQPage.value === 1) fetchExamQuestions()
  else examQPage.value = 1
})

// When building a mock from the institution's OWN exam there is no Passmed
// content to pull, so the "Passmed" source option is hidden — only My questions
// + Shared pool make sense. For a Passmed exam all four options remain.
const selectedExamOwned = computed(() => {
  const e = exams.value.find(x => Number(x.id) === Number(selectedExamId.value))
  return !!e?.owned
})
// The synthetic Shared Pool entry IS the shared pool, so it only makes sense with
// source = 'public' — lock the source options to that single choice.
const isSharedPool = computed(() => Number(selectedExamId.value) === SHARED_POOL_ID)
const sourceOptions = computed<Array<'all' | 'passmed' | 'mine' | 'public'>>(() =>
  isSharedPool.value      ? ['public']
  : selectedExamOwned.value ? ['all', 'mine', 'public']
  :                           ['all', 'passmed', 'mine', 'public'],
)
// If the exam switches to an owned one while Passmed was selected, fall back to All.
watch(selectedExamOwned, (owned) => {
  if (owned && source.value === 'passmed') source.value = 'all'
})
// Selecting the Shared Pool forces source = 'public' (it IS the public pool). Moving
// back to a real bucket restores the default 'all'. The existing `source` watcher then
// refetches the list/facets/tree for the new scope.
watch(selectedExamId, (id, prev) => {
  if (Number(id) === SHARED_POOL_ID) source.value = 'public'
  else if (Number(prev) === SHARED_POOL_ID) source.value = 'all'
})

// Must be after difficulty + examQPage declarations
watch(examQPage, () => { if (step.value === 2) fetchExamQuestions() })
watch(difficulty, () => {
  if (step.value !== 2) return
  if (examQPage.value === 1) fetchExamQuestions()   // already page 1, page watch won't fire
  else examQPage.value = 1                           // triggers examQPage watch → fetch
})
// Step 3
const removedQs = ref<Set<number>>(new Set())
// Switching assembly mode starts a fresh selection so one mode's ids never leak
// into another (e.g. a blueprint preview's ids showing up as pre-ticked in
// Individual). Skipped during edit/clone, which deliberately prefill a selection.
watch(qSelMode, () => {
  if (isEditingExisting.value || isCloningExisting.value) return
  selectedQIds.value     = new Set()
  selectedQObjects.value = new Map()
  removedQs.value        = new Set()
})

// Step 4
const selectedStudents  = ref<Set<number>>(new Set())
// Multi-cohort recipients: an assignment can target several cohorts at once.
const selectedCohortIds = ref<Set<number>>(new Set())
function toggleCohort(id: number) {
  const next = new Set(selectedCohortIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedCohortIds.value = next
}
const recipients        = ref<'cohort' | 'atrisk' | 'custom'>('cohort')
watch(recipients, (r) => { if (r === 'atrisk') ensureAtRisk() })
const scheduledNow      = ref(true)
const sendDate          = ref('')
const markingMethod     = ref<'standard' | 'negative'>('standard')
const negMarkVal        = ref(0.25)
const passMarkMode      = ref<'fixed' | 'cohen'>('fixed')
const fixedPassMark     = ref(65)
const attemptLimit      = ref(1)
const resultsRelease    = ref<'immediate' | 'manual'>('immediate')
// Extra time accommodations
const extraTimeEnabled  = ref(false)
const showLeaderboard   = ref(true)   // per-exam leaderboard visibility (default on)
const extraTimeMins     = ref(25)
const extraTimeStudents = ref<Set<number>>(new Set())
// Cohen pass mark settings
const cohenPercentile   = ref(95)
const cohenFactor       = ref(60)

const submitted = ref(false)

const presetOptions = [
  { id: 'new-exam' as const, label: 'New Exam',  icon: '✏️', desc: 'Build a fresh exam from scratch — set your own blueprint, question count and time limit' },
  { id: 'reassign' as const, label: 'All Exams', icon: '📋', desc: 'View past assignments — edit settings, delete, or clone and resend to a new group' },
]

// ── Blueprint ────────────────────────────────────────────────────────────────
// Real domain distribution for the selected exam, from GET /exams/{id}/blueprint
// (scoped to questions visible to this institution). Replaces the old hardcoded
// placeholder weights.
interface BpDomain { domain: string; subject_id?: number; subdomains?: string[]; cohort_avg?: number | null; available: number; weight: number; min_pct: number; max_pct: number }
const blueprintData = ref<BpDomain[]>([])
const blueprintTotalAvailable = ref(0)
const blueprintLoading = ref(false)

async function fetchBlueprint() {
  if (!selectedExamId.value) { blueprintData.value = []; return }
  blueprintLoading.value = true
  try {
    const res = await api<any>(`/exams/${selectedExamId.value}/blueprint`)
    if (res?.status === 'success') {
      blueprintData.value = res.data?.domains ?? []
      blueprintTotalAvailable.value = res.data?.total_available ?? 0
      blueprintLocal.value = []          // force re-seed for the new exam
      ensureBlueprintLocal()
    } else {
      blueprintData.value = []
    }
  } catch { blueprintData.value = [] }
  finally { blueprintLoading.value = false }
}

const blueprintSlices = computed(() => {
  const total = questions.value
  return blueprintData.value.map(d => {
    const w = (d.weight || 0) / 100
    return {
      domain:    d.domain,
      subject_id: d.subject_id,          // set only for the subject-fallback blueprint
      subdomains: d.subdomains ?? [],
      cohortAvg: (d.cohort_avg ?? null) as number | null,
      weight:    w,
      targetPct: Math.round(w * 100),
      minPct:    d.min_pct,
      maxPct:    d.max_pct,
      available: d.available,
      pctRange:  `${d.min_pct}–${d.max_pct}%`,
      count:     Math.max(0, Math.round(w * total)),
    }
  })
})

// Per-domain allocation: targetPct (the % the user wants) drives count; count
// can also be nudged with the steppers, which keeps targetPct in sync. The
// Actual % column shows the realised count ÷ total.
const blueprintLocal = ref<{ targetPct: number; count: number }[]>([])
function ensureBlueprintLocal() {
  if (blueprintLocal.value.length !== blueprintSlices.value.length) {
    blueprintLocal.value = blueprintSlices.value.map(s => ({ targetPct: s.targetPct, count: s.count }))
  }
}
const allocated = computed(() => blueprintLocal.value.reduce((a, s) => a + s.count, 0))
const remaining = computed(() => questions.value - allocated.value)

// Percentage entry → derive the count from the exam's total question count.
function setTargetPct(i: number, raw: string | number) {
  ensureBlueprintLocal()
  const total = questions.value
  const avail = blueprintSlices.value[i]?.available ?? total
  const pct = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)))
  blueprintLocal.value[i]!.targetPct = pct
  blueprintLocal.value[i]!.count = Math.min(avail, Math.round(pct / 100 * total))
}
// Stepper nudge → keep targetPct in step with the new count.
function adjustSlice(i: number, delta: number) {
  ensureBlueprintLocal()
  const total = questions.value
  const avail = blueprintSlices.value[i]?.available ?? total
  const c = Math.max(0, Math.min(avail, blueprintLocal.value[i]!.count + delta))
  blueprintLocal.value[i]!.count = c
  blueprintLocal.value[i]!.targetPct = total > 0 ? Math.round(c / total * 100) : 0
}
function resetBlueprint() {
  blueprintLocal.value = blueprintSlices.value.map(s => ({ targetPct: s.targetPct, count: s.count }))
}
// Realised percentage for a row (count ÷ exam total).
function actualPct(i: number): number {
  const total = questions.value
  const c = blueprintLocal.value[i]?.count ?? blueprintSlices.value[i]?.count ?? 0
  return total > 0 ? Math.round(c / total * 100) : 0
}
function actualClass(i: number) {
  const s = blueprintSlices.value[i]; if (!s) return ''
  const a = actualPct(i)
  if (a < s.minPct) return 'bp-actual-under'
  if (a > s.maxPct) return 'bp-actual-over'
  return 'bp-actual-ok'
}
function cohortBarColor(v: number | null): string {
  if (v === null || v === undefined) return 'var(--border)'
  if (v >= 70) return 'var(--teal)'
  if (v >= 60) return 'var(--amber, #d97706)'
  return 'var(--rose, #e11d48)'
}

// ── Question review pool — only questions that are actually selected + not removed ──
const reviewPool = computed(() => {
  let pool = [...selectedQObjects.value.values()]
    .filter(q => selectedQIds.value.has(q.id) && !removedQs.value.has(q.id))
  if (difficulty.value !== 'mixed') pool = pool.filter(q => q.difficulty === difficulty.value)
  return pool
})
function removeQuestion(id: number) {
  const next = new Set(removedQs.value); next.add(id); removedQs.value = next
}

// ── Replace a reviewed question with another from the SAME subject ────────────
// Fetches the subject's questions from the same endpoint the builder uses and
// swaps in the first candidate that isn't already selected/removed — in place,
// so the card keeps its position. Single-subject match only (no cross-subject
// substitution); if the subject has no spare question we tell the user.
const replacingId = ref<number | null>(null)
async function replaceQuestion(q: ApiQuestion) {
  if (replacingId.value) return
  const subjId = q.subject?.id
  if (!subjId) { showToast('This question has no subject to match'); return }

  replacingId.value = q.id
  try {
    const query: Record<string, any> = {
      eid:        selectedExamId.value,
      subject_id: subjId,
      limit:      100,
      orderBy:    'asc',
      passmed_exam_gate: 1,
    }
    // Mirror the builder's active filters so the swapped-in question survives the
    // reviewPool difficulty filter and source scope.
    if (difficulty.value !== 'mixed') query.difficulty = difficulty.value
    if (source.value !== 'all')       query.source     = source.value

    const res = await api<any>('/questionbanklist', { query })
    const candidates: ApiQuestion[] = (res?.status === 'success' ? res.data : []) ?? []

    const swap = candidates.find(c =>
      Number(c.id) !== Number(q.id) &&
      !selectedQIds.value.has(Number(c.id)) &&
      !removedQs.value.has(Number(c.id))
    )
    if (!swap) { showToast(`No other ${q.subject?.name ?? 'subject'} question available to swap in`); return }

    // Rebuild the object map preserving order — replace old slot with the new question.
    const objs = new Map<number, ApiQuestion>()
    for (const [k, v] of selectedQObjects.value) {
      if (Number(k) === Number(q.id)) objs.set(Number(swap.id), swap)
      else                            objs.set(Number(k), v)
    }
    const ids = new Set(selectedQIds.value)
    ids.delete(Number(q.id)); ids.add(Number(swap.id))
    // Make sure the newcomer isn't hidden by a stale removed flag.
    const rem = new Set(removedQs.value); rem.delete(Number(swap.id))

    selectedQObjects.value = objs
    selectedQIds.value     = ids
    removedQs.value        = rem

    showToast(`Swapped in another ${q.subject?.name ?? 'subject'} question`)
  } catch {
    showToast('Failed to replace question')
  } finally {
    replacingId.value = null
  }
}

// ── Topic helpers ────────────────────────────────────────────────────────────
// Topics tree: Subject (parent) → Category (child), from real question data.
async function fetchTopicTree() {
  if (!selectedExamId.value) { topicTree.value = []; return }
  try {
    const query: Record<string, any> = { eid: selectedExamId.value, passmed_exam_gate: 1 }
    if (source.value !== 'all') query.source = source.value
    const res = await api<any>('/questionbank/topic-tree', { query })
    topicTree.value = Array.isArray(res?.data) ? res.data : []
  } catch { topicTree.value = [] }
}
// selectedTopics holds CATEGORY ids (the child). Toggling a category selects it.
function toggleTopic(catId: number) {
  const next = new Set(selectedTopics.value)
  if (next.has(catId)) next.delete(catId); else next.add(catId)
  selectedTopics.value = next
}
function subjectSelCount(sub: TopicSubject) {
  return sub.categories.filter(c => selectedTopics.value.has(c.id)).length
}
function subjectAllSelected(sub: TopicSubject) {
  return sub.categories.length > 0 && sub.categories.every(c => selectedTopics.value.has(c.id))
}
function toggleAllInSubject(sub: TopicSubject) {
  const next = new Set(selectedTopics.value)
  if (subjectAllSelected(sub)) sub.categories.forEach(c => next.delete(c.id))
  else sub.categories.forEach(c => next.add(c.id))
  selectedTopics.value = next
}

// ── Students ─────────────────────────────────────────────────────────────────
function toggleStudent(userId: number) {
  const next = new Set(selectedStudents.value)
  if (next.has(userId)) next.delete(userId); else next.add(userId)
  selectedStudents.value = next
}
function toggleAllStudents() {
  if (selectedStudents.value.size === apiStudents.value.length) {
    selectedStudents.value = new Set()
  } else {
    selectedStudents.value = new Set(apiStudents.value.map(s => s.user_id))
  }
}
function toggleExtraTime(userId: number) {
  const next = new Set(extraTimeStudents.value)
  if (next.has(userId)) next.delete(userId); else next.add(userId)
  extraTimeStudents.value = next
}

// ── Wizard nav ───────────────────────────────────────────────────────────────
function goStep(n: number) { if (n < step.value) step.value = n }

function canContinue() {
  if (step.value === 1) {
    if (isEditingExisting.value || isCloningExisting.value) return !!examName.value.trim()
    if (!preset.value) return false
    if (!selectedExamId.value) return false
    if (preset.value === 'reassign' && !reassignId.value) return false
    if (preset.value === 'new-exam' && !examName.value.trim()) return false
    return true
  }
  if (step.value === 2 && isEditingExisting.value && qSelMode.value === 'questions' && selectedQIds.value.size === 0) return false
  if (step.value === 2) {
    // Edit mode: the assignment already carries a resolved question set, so allow
    // continuing regardless of the (re-derived) blueprint/topics config — the
    // Blueprint/Topics allocations aren't persisted, only the resolved ids are.
    if (isEditingExisting.value && selectedQIds.value.size > 0) return true
    if (qSelMode.value === 'blueprint') return allocated.value > 0
    if (qSelMode.value === 'topics')    return selectedTopics.value.size > 0
    return selectedQIds.value.size > 0
  }
  if (step.value === 4) {
    if (recipients.value === 'cohort'  && !selectedCohortIds.value.size)     return false
    if (recipients.value === 'custom'  && selectedStudents.value.size === 0) return false
    return true
  }
  return true
}

async function nextStep() {
  if (!canContinue()) return
  // Re-entry guard: ignore extra clicks while a step transition / submit is busy.
  if (advancing.value || submitting.value) return
  // Extra guard: only block if it's a plain reassign (not a clone — clone clears reassignId intentionally)
  if (step.value === 1 && preset.value === 'reassign' && !reassignId.value && !isCloningExisting.value) return
  submitError.value = null

  // Ensure the Review step has the actual questions for the current mode.
  // Blueprint/Topics sample server-side (FE has no ids yet) → fetch a preview.
  // Individual already holds the hand-picked objects; only hydrate if missing.
  // Edit mode is special: the assignment already carries a resolved question set,
  // so we hydrate THOSE (never re-sample — that would replace the assignment's
  // questions just by opening the wizard).
  // Guarded by `advancing` so the Continue button is disabled during the fetch
  // (this call can be slow — otherwise users click it repeatedly).
  if (step.value === 2) {
    advancing.value = true
    try {
      if (isEditingExisting.value) {
        if (selectedQIds.value.size > 0 && selectedQObjects.value.size === 0) {
          await loadSelectedQObjects()
        }
      } else if (qSelMode.value === 'blueprint' || qSelMode.value === 'topics') {
        await loadPreviewQuestions()
      } else if (selectedQIds.value.size > 0 && selectedQObjects.value.size === 0) {
        await loadSelectedQObjects()
      }
    } finally {
      advancing.value = false
    }
  }

  if (step.value === stepLabels.length) {
    submitting.value = true
    try {
      const resolvedStudentIds =
        recipients.value === 'cohort'  ? [] :
        recipients.value === 'atrisk'  ? [] :  // backend resolves the at-risk list
        [...selectedStudents.value]

      // The Review step previewed these ids (blueprint/topics included) and the
      // user may have excluded some. Send the reviewed, non-excluded set so the
      // assignment matches exactly what was reviewed. If empty (e.g. preview
      // failed), the backend falls back to sampling from blueprint/topics.
      const resolvedQIds = [...selectedQIds.value].filter(id => !removedQs.value.has(id))

      const payload = {
        exam_bank_id:           selectedExamId.value,
        name:                   examName.value || 'Untitled exam',
        // Part 3 assembly. Individual sends explicit ids; blueprint/topics send
        // empty ids + the config so the backend samples references server-side.
        q_sel_mode:             qSelMode.value,
        question_ids:           resolvedQIds,
        question_count:         resolvedQIds.length || questions.value,
        blueprint:              qSelMode.value === 'blueprint'
                                  ? blueprintSlices.value.map((s, i) => ({ domain: s.domain, subject_id: s.subject_id, count: blueprintLocal.value[i]?.count ?? s.count }))
                                  : [],
        selected_topics:        qSelMode.value === 'topics' ? [...selectedTopics.value] : [],
        source:                 source.value,
        excluded_question_ids:  [...removedQs.value],
        difficulty:             difficulty.value,
        duration_minutes:       duration.value,
        timed:                  timed.value,
        due_date:               dueDate.value || null,
        recipient_type:         recipients.value,
        cohort_ids:             recipients.value === 'cohort' ? [...selectedCohortIds.value] : [],
        student_ids:            resolvedStudentIds,
        send_now:               scheduledNow.value,
        send_at:                scheduledNow.value ? null : sendDate.value || null,
        marking_method:         markingMethod.value,
        neg_mark_penalty:       markingMethod.value === 'negative' ? negMarkVal.value : null,
        pass_mark_type:         passMarkMode.value,
        pass_mark_value:        passMarkMode.value === 'fixed' ? fixedPassMark.value : null,
        cohen_percentile:       passMarkMode.value === 'cohen' ? cohenPercentile.value : null,
        cohen_factor:           passMarkMode.value === 'cohen' ? cohenFactor.value : null,
        attempt_limit:          attemptLimit.value === 99 ? null : attemptLimit.value,
        results_release:        resultsRelease.value,
        show_leaderboard:       showLeaderboard.value,
        extra_time_enabled:     extraTimeEnabled.value,
        extra_time_mins:        extraTimeEnabled.value ? extraTimeMins.value : null,
        extra_time_student_ids: extraTimeEnabled.value ? [...extraTimeStudents.value] : [],
      }

      if (isEditingExisting.value && reassignId.value) {
        // Update the existing assignment via PATCH
        await api(`/assignments/${reassignId.value}`, { method: 'PATCH', body: payload })
      } else {
        // Create a new assignment via POST
        await api('/exams/assign', { method: 'POST', body: payload })
      }
      submitted.value = true
      // Refresh the All Assignments list so the new/updated assignment shows
      // without a page reload (the list is otherwise only fetched on mount).
      fetchAssignments()
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status
      if (status === 401 || err?.data?.expired) {
        // Session expired — show a clean message; useInstituteApi redirects to login.
        submitError.value = 'Your session has expired. Redirecting you to log in…'
      } else {
        submitError.value = err?.data?.message || err?.data?.msg || 'Something went wrong. Please try again.'
      }
    } finally {
      submitting.value = false
    }
    return
  }

  // Reset difficulty filter to 'All' when entering Review Questions (step 3)
  if (step.value === 2) difficulty.value = 'mixed'

  step.value++
}

function backStep() {
  // Reset difficulty filter to 'All' when going back to Questions (step 2)
  if (step.value === 3) difficulty.value = 'mixed'
  if (step.value > 1) step.value--
}

function resetWizard() {
  step.value = 1; preset.value = null; reassignId.value = null; examName.value = ''
  examName.value = ''; questions.value = 20; duration.value = 60; timed.value = true; dueDate.value = ''
  qSelMode.value = 'blueprint'; selectedTopics.value = new Set(); expandedSubject.value = null; difficulty.value = 'mixed'; source.value = 'all'
  subjectId.value = null; domainId.value = null; disciplineId.value = null
  selectedExamId.value = exams.value.length === 1 ? exams.value[0].id : null
  examQuestions.value = []; examQTotal.value = 0; examQPage.value = 1
  selectedQIds.value = new Set(); selectedQObjects.value = new Map()
  removedQs.value = new Set()
  selectedStudents.value = new Set(); selectedCohortIds.value = new Set(); recipients.value = 'cohort'
  scheduledNow.value = true; sendDate.value = ''
  markingMethod.value = 'standard'; negMarkVal.value = 0.25; passMarkMode.value = 'fixed'; fixedPassMark.value = 65
  attemptLimit.value = 1; resultsRelease.value = 'immediate'
  extraTimeEnabled.value = false; extraTimeMins.value = 25; extraTimeStudents.value = new Set()
  showLeaderboard.value = true
  cohenPercentile.value = 95; cohenFactor.value = 60
  submitted.value = false; submitError.value = null; isEditingExisting.value = false; isCloningExisting.value = false
}

// ── Step 4 helpers ───────────────────────────────────────────────────────────
// Multi-cohort: the picked cohorts, their combined student count, and a label.
const selectedCohorts = computed(() => cohortsForPicker.value.filter(c => selectedCohortIds.value.has(c.id)))
const selectedCohortCount = computed(() => selectedCohorts.value.reduce((n, c) => n + (c.studentCount || 0), 0))
const selectedCohortLabel = computed(() => {
  const arr = selectedCohorts.value
  if (!arr.length) return ''
  return arr.length === 1 ? arr[0].name : `${arr.length} cohorts`
})
function clearCohorts() { selectedCohortIds.value = new Set() }

const recipientOptions = computed(() => [
  {
    id: 'cohort' as const, icon: '👥', label: 'Entire cohort',
    sub: selectedCohorts.value.length
      ? `${selectedCohortLabel.value} · ${selectedCohortCount.value} student${selectedCohortCount.value !== 1 ? 's' : ''}`
      : 'Select cohorts below',
  },
  { id: 'atrisk' as const, icon: '⚠️', label: 'At-risk students only', sub: 'Residents below passing threshold' },
  { id: 'custom' as const, icon: '✏️', label: 'Custom selection',       sub: 'Choose specific residents' },
])

const markingOptions: Array<{ id: 'standard' | 'negative'; label: string; desc: string }> = [
  { id: 'standard', label: 'Standard marking', desc: 'Correct = +1, incorrect = 0' },
  { id: 'negative', label: 'Negative marking',  desc: 'Correct = +1, incorrect = −n' },
]

const passMarkOptions = computed<Array<{ id: 'fixed' | 'cohen'; label: string; desc: string }>>(() => [
  { id: 'fixed', label: 'Fixed percentage', desc: `Students must score ≥${fixedPassMark.value}%` },
  { id: 'cohen', label: "Cohen's method",   desc: "Pass mark set by top students' performance" },
])

// Estimated cohen pass mark (p95 score × cohen factor / 100)
const cohenEstimate = computed(() => Math.round(85 * cohenFactor.value / 100))

const summaryRows = computed(() => {
  const recipLabel =
    recipients.value === 'cohort'  ? (selectedCohorts.value.length ? selectedCohortLabel.value : 'No cohort selected') :
    recipients.value === 'atrisk'  ? 'At-risk students' :
    `${selectedStudents.value.size} selected`
  return [
    ['Exam',       finalExamName.value],
    ['Questions',  `${reviewPool.value.length} · ${timed.value ? duration.value + 'min timed' : 'Untimed'}`],
    ['Marking',    markingMethod.value === 'negative' ? `Negative (−${negMarkVal.value}/wrong)` : 'Standard'],
    ['Pass mark',  passMarkMode.value === 'cohen' ? `~${cohenEstimate.value}% (Cohen)` : fixedPassMark.value + '%'],
    ['Recipients', recipLabel],
    ['Attempts',   (attemptLimit.value === 99 || attemptLimit.value === null) ? '∞' : `${attemptLimit.value}× max`],
    ['Results',    resultsRelease.value === 'immediate' ? 'Released immediately' : 'Released manually'],
    ['Extra time', extraTimeEnabled.value ? `${extraTimeStudents.value.size} student${extraTimeStudents.value.size !== 1 ? 's' : ''} +${extraTimeMins.value}min` : 'None'],
    ['Delivery',   scheduledNow.value ? 'Send immediately' : sendDate.value || 'Date not set'],
  ] as [string, string][]
})

// Resolved exam name for success screen
const finalExamName = computed(() => {
  if (preset.value === 'reassign' && reassignId.value) {
    return assignments.value.find(a => a.id === reassignId.value)?.name || examName.value || 'Exam'
  }
  return examName.value || 'Untitled exam'
})
const finalRecipientCount = computed(() =>
  recipients.value === 'cohort'  ? selectedCohortCount.value :
  recipients.value === 'atrisk'  ? atRiskIds.value.length :
  selectedStudents.value.size
)
</script>

<template>
  <!-- Topbar breadcrumb — same structure as every other institute page -->

  <div class="content ae-page">

    <!-- ── Success ─────────────────────────────────────────────────────────── -->
    <div v-if="submitted" class="fade-in success-card">
      <div class="success-tick">✓</div>
      <div class="success-title">{{ isEditingExisting ? 'Assignment updated' : isCloningExisting ? 'Exam reassigned' : 'Exam assigned' }}</div>
      <div class="success-sub">
        <strong>{{ finalExamName }}</strong>
        {{ isEditingExisting ? 'has been updated for' : 'has been queued for' }}
        <strong>{{ finalRecipientCount }} resident{{ finalRecipientCount !== 1 ? 's' : '' }}</strong>.
      </div>
      <div class="success-meta">
        {{ reviewPool.length }} questions ·
        {{ timed ? duration + ' min' : 'open time' }} ·
        {{ scheduledNow ? 'sending now' : 'scheduled ' + sendDate }}
      </div>
      <div class="success-actions">
        <button type="button" class="btn-secondary" @click="resetWizard">{{ isEditingExisting ? 'Back to list' : isCloningExisting ? 'Reassign another' : 'Assign another' }}</button>
        <NuxtLink to="/institute/mock-exams" class="btn-primary">View mock exams →</NuxtLink>
      </div>
    </div>

    <!-- ── Wizard ─────────────────────────────────────────────────────────── -->
    <div v-else class="fade-in">

      <div class="page-header">
        <div>
          <div class="page-title">{{ isEditingExisting ? 'Edit Assignment' : isCloningExisting ? 'Reassign Exam' : 'Assign Exam' }}</div>
          <div class="page-sub">
            <span v-if="isEditingExisting">
              Editing <strong>{{ examName }}</strong> — walk through the steps and click Update to save
            </span>
            <span v-else-if="isCloningExisting">
              Cloning <strong>{{ examName }}</strong> — adjust any settings, then assign as a new exam
            </span>
            <span v-else>Build and schedule a targeted assessment for your cohort</span>
          </div>
        </div>
      </div>

      <!-- Stepper -->
      <div class="stepper">
        <template v-for="(l, i) in stepLabels" :key="i">
          <div v-if="i > 0" class="step-line" :class="{ done: i + 1 <= step }"></div>
          <div class="step-item" :class="{ clickable: i + 1 < step }" @click="goStep(i + 1)" :tabindex="i + 1 < step ? 0 : -1" role="button" :aria-label="`Step ${i + 1} of ${stepLabels.length}: ${l}${i + 1 < step ? ' (completed, go back to edit)' : i + 1 === step ? ' (current)' : ''}`" :aria-current="i + 1 === step ? 'step' : undefined" @keydown.enter="goStep(i + 1)" @keydown.space.prevent="goStep(i + 1)">
            <div class="step-num" :class="{ done: i + 1 < step, active: i + 1 === step }">
              <span v-if="i + 1 < step">✓</span>
              <span v-else>{{ i + 1 }}</span>
            </div>
            <span class="step-label" :class="{ active: i + 1 === step, done: i + 1 < step }">{{ l }}</span>
          </div>
        </template>
      </div>

      <!-- ── STEP 1 — Exam Setup ─────────────────────────────────────────── -->
      <div v-if="step === 1" class="step-body">

        <!-- ── EDIT / CLONE MODE: prefilled form, no list ─────────────── -->
        <template v-if="isEditingExisting || isCloningExisting">
          <!-- TO SHOW EXAM BANK IN EDIT MODE: change v-if="false" to v-if="true" below -->
          <div v-if="false" class="card">
            <div class="card-label">Bucket</div>
            <div class="exam-list">
              <label
                v-for="e in exams" :key="e.id"
                class="exam-row" :class="{ on: selectedExamId === e.id }"
              >
                <input type="radio" class="sr-only" name="exam-bank" :value="e.id" v-model="selectedExamId" />
                <div class="exam-icon" style="font-size:1rem;">📚</div>
                <div class="exam-meta">
                  <div class="exam-name">
                    {{ e.name }}
                    <span class="exam-badge" :class="e.shared ? 'eb-shared' : (e.owned ? 'eb-inst' : 'eb-passmed')">{{ e.shared ? 'Shared Pool' : (e.owned ? (instName || 'Institution') : 'Passmed') }}</span>
                  </div>
                </div>
                <div v-if="selectedExamId === e.id" class="exam-tick">✓</div>
              </label>
            </div>
          </div>

          <!-- Assignment details -->
          <div class="card">
            <div class="card-label">Assignment Details</div>
            <div class="form-stack">
              <div>
                <label>Assignment name <span style="color:var(--rose)">*</span></label>
                <input type="text" v-model="examName" maxlength="255" placeholder="Assignment name" />
                <div v-if="!examName.trim() || examName.length >= 230" style="font-size:0.68rem;margin-top:4px;" :style="{ color: !examName.trim() ? 'var(--amber)' : 'var(--ink-dim)' }">
                  <template v-if="!examName.trim()">Name is required to continue</template>
                  <template v-else-if="examName.length >= 255">Limit reached — names can be up to 255 characters</template>
                  <template v-else>{{ examName.length }}/255 characters</template>
                </div>
              </div>
              <div class="form-grid-3">
                <div>
                  <label>Questions</label>
                  <input type="number" :value="selectedQIds.size || questions" disabled style="opacity:.7;cursor:not-allowed;" />
                </div>
                <div>
                  <label>Time limit (min)</label>
                  <input type="number" min="10" max="360" v-model.number="duration" :disabled="!timed" />
                </div>
                <div>
                  <label>Mode</label>
                  <div class="mode-toggle">
                    <button type="button" :class="{ on: timed }" @click="timed = true">⏱ Timed</button>
                    <button type="button" :class="{ on: !timed }" @click="timed = false">∞ Open</button>
                  </div>
                </div>
              </div>
              <div class="due-wrap">
                <label>Due date</label>
                <input type="date" v-model="dueDate" />
              </div>
            </div>
          </div>
        </template>

        <!-- ── NORMAL MODE: preset picker + exam/assignment lists ───────── -->
        <template v-else>
          <div class="card">
            <div class="card-label">Exam Type</div>
            <div class="preset-grid">
              <label v-for="p in presetOptions" :key="p.id" class="preset-card" :class="{ on: preset === p.id }">
                <input type="radio" class="sr-only" name="assign-preset" :value="p.id" v-model="preset" />
                <div v-if="preset === p.id" class="preset-tick">✓</div>
                <div class="preset-icon">{{ p.icon }}</div>
                <div class="preset-label">{{ p.label }}</div>
                <div class="preset-desc">{{ p.desc }}</div>
              </label>
            </div>
          </div>

          <!-- Bucket selector — only for new-exam -->
          <div v-if="preset === 'new-exam'" class="card">
            <div class="card-label">Bucket</div>
            <div v-if="!exams.length" style="font-size:.78rem;color:var(--ink-dim);">Loading buckets…</div>
            <div v-else class="exam-list">
              <label
                v-for="e in exams" :key="e.id"
                class="exam-row" :class="{ on: selectedExamId === e.id }"
              >
                <input type="radio" class="sr-only" name="exam-bank" :value="e.id" v-model="selectedExamId" />
                <div class="exam-icon" style="font-size:1rem;">📚</div>
                <div class="exam-meta">
                  <div class="exam-name">
                    {{ e.name }}
                    <span class="exam-badge" :class="e.shared ? 'eb-shared' : (e.owned ? 'eb-inst' : 'eb-passmed')">{{ e.shared ? 'Shared Pool' : (e.owned ? (instName || 'Institution') : 'Passmed') }}</span>
                  </div>
                </div>
                <div v-if="selectedExamId === e.id" class="exam-tick">✓</div>
              </label>
            </div>
          </div>

          <!-- All Assignments — click a card to open it in the wizard (edit
               questions/settings or keep them). -->
          <div v-if="preset === 'reassign'" class="card">
            <div class="card-label">All Assignments</div>
            <div v-if="assignmentsLoading" class="q-loading"><div class="page-spinner"></div></div>
            <div v-else-if="!assignments.length" style="padding:20px;text-align:center;font-size:0.78rem;color:var(--ink-dim);">No past assignments found.</div>
            <div v-else class="exam-list">
              <div
                v-for="a in assignments" :key="a.id"
                class="exam-row"
                role="button" tabindex="0"
                :aria-label="`Open assignment ${a.name}`"
                @click="startEditAssignment(a, $event)"
                @keydown.enter="startEditAssignment(a, $event)"
                @keydown.space.prevent="startEditAssignment(a, $event)"
              >
                <div class="exam-icon">📄</div>
                <div class="exam-meta">
                  <div class="exam-name">{{ a.name }}</div>
                  <div class="exam-sub">
                    {{ a.question_count }} questions · {{ a.student_count }} students · {{ a.created_at }}
                  </div>
                </div>
                <!-- Declare Results stays (manual-release exams); stop the click
                     so it doesn't also open the card for editing. -->
                <button type="button"
                  v-if="a.results_release === 'manual'"
                  class="assign-act-btn assign-act-declare"
                  :class="a.can_declare ? 'assign-act-declare--active' : 'assign-act-declare--done'"
                  :disabled="!a.can_declare || declaringId === a.id"
                  :title="a.can_declare ? 'Declare Results' : 'Results already declared'"
                  @click.stop="declareResults(a, $event)"
                >
                  <span v-if="declaringId === a.id" class="declare-spinner"></span>
                  <span v-else>{{ a.can_declare ? '📢 Declare Results' : '✅ Declared' }}</span>
                </button>

                <!-- Row actions — stop the click so they don't also open the
                     card for editing. Glyph colour is themed (--ink) so they
                     stay visible in dark mode. -->
                <div class="assign-row-actions">
                  <!-- Edit + clone are `edit`; delete removes the exam from every
                       student it was assigned to, so it needs `full`. -->
                  <button v-if="canEdit(PERM_AREA)" type="button" class="assign-act-btn assign-act-edit" title="Edit settings"
                    aria-label="Edit assignment" @click.stop="startEditAssignment(a, $event)">✏️</button>
                  <button v-if="canEdit(PERM_AREA)" type="button" class="assign-act-btn assign-act-clone" title="Reassign / clone to a new group"
                    aria-label="Reassign assignment" @click.stop="startCloneAssignment(a, $event)">🔁</button>
                  <button v-if="canManage(PERM_AREA)" type="button" class="assign-act-btn assign-act-del" title="Delete"
                    :disabled="deletingAssignmentId === a.id"
                    aria-label="Delete assignment" @click.stop="deleteAssignment(a, $event)">🗑</button>
                </div>

                <svg class="exam-row-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>
              </div>
            </div>
          </div>

          <!-- New exam details -->
          <div v-if="preset === 'new-exam'" class="card">
            <div class="card-label">Exam Details</div>
            <div class="form-stack">
              <div>
                <label>Exam name <span style="color:var(--rose)">*</span></label>
                <input type="text" v-model="examName" maxlength="255" placeholder="e.g. Cardiology Focus — March 2026" />
                <div v-if="!examName.trim() || examName.length >= 230" style="font-size:0.68rem;margin-top:4px;" :style="{ color: !examName.trim() ? 'var(--amber)' : 'var(--ink-dim)' }">
                  <template v-if="!examName.trim()">Name is required to continue</template>
                  <template v-else-if="examName.length >= 255">Limit reached — names can be up to 255 characters</template>
                  <template v-else>{{ examName.length }}/255 characters</template>
                </div>
              </div>
              <div class="form-grid-3">
                <div>
                  <label>Questions</label>
                  <input type="number" min="5" max="200" v-model.number="questions" />
                </div>
                <div>
                  <label>Time limit (min)</label>
                  <input type="number" min="10" max="360" v-model.number="duration" :disabled="!timed" />
                </div>
                <div>
                  <label>Mode</label>
                  <div class="mode-toggle">
                    <button type="button" :class="{ on: timed }" @click="timed = true">⏱ Timed</button>
                    <button type="button" :class="{ on: !timed }" @click="timed = false">∞ Open</button>
                  </div>
                </div>
              </div>
              <div class="due-wrap">
                <label>Due date</label>
                <input type="date" v-model="dueDate" />
              </div>
            </div>
          </div>
        </template>

      </div>

      <!-- ── STEP 2 — Questions ──────────────────────────────────────────── -->
      <div v-else-if="step === 2" class="step-body">

        <!-- Mode tabs + source picker (Part 3) -->
        <div class="card qsel-bar">
          <div class="qsel-tabs">
            <button type="button" :class="{ on: qSelMode === 'blueprint' }" @click="qSelMode = 'blueprint'">Blueprint</button>
            <button type="button" :class="{ on: qSelMode === 'topics' }" @click="qSelMode = 'topics'">Topics</button>
            <button type="button" :class="{ on: qSelMode === 'questions' }" @click="qSelMode = 'questions'">Individual</button>
          </div>
          <div v-if="qSelMode !== 'blueprint'" class="qsel-source">
            <span class="qsel-source-label">Source</span>
            <button type="button" v-for="s in sourceOptions" :key="s" :class="{ on: source === s }" @click="source = s">
              {{ s === 'all' ? 'All' : s === 'passmed' ? 'Passmed' : s === 'mine' ? 'My questions' : 'Shared pool' }}
            </button>
          </div>
        </div>

        <!-- BLUEPRINT mode — per-domain allocation -->
        <div v-if="qSelMode === 'blueprint'" class="card">
          <div v-if="blueprintLoading" class="q-loading"><div class="page-spinner"></div></div>
          <template v-else>
            <div class="q-browser-head">
              <div>
                <div class="q-browser-count">Exam Blueprint</div>
                <div class="bp-subhint">Enter a target % per subject — questions are derived from your exam's total. {{ blueprintTotalAvailable }} questions available.</div>
              </div>
              <span class="q-alloc-counter" :class="allocated < questions ? 'q-alloc--under' : allocated === questions ? 'q-alloc--exact' : 'q-alloc--over'">
                {{ allocated }}/{{ questions }} allocated<template v-if="remaining !== 0"> · {{ Math.abs(remaining) }} {{ remaining > 0 ? 'unallocated' : 'over' }}</template>
              </span>
              <button type="button" class="reset-btn" @click="resetBlueprint">Reset</button>
            </div>
            <div v-if="!blueprintSlices.length" class="rev-empty">No subject breakdown available for this exam yet.</div>
            <div v-else class="bp-table-wrap">
              <table class="bp-table">
                <thead>
                  <tr>
                    <th>Subject / Category</th>
                    <th class="ctr">Cohort Avg</th>
                    <th class="ctr">Target %</th>
                    <th class="ctr">Questions</th>
                    <th class="ctr">Actual %</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(s, i) in blueprintSlices" :key="s.domain">
                    <td>
                      <div class="bp-domain-name">{{ s.domain }}</div>
                      <div class="bp-domain-sub">{{ s.subdomains.length ? s.subdomains.join(', ') : (s.available + ' available') }}</div>
                    </td>
                    <td class="ctr">
                      <div class="bp-cohort">
                        <div class="bp-cohort-bar"><div class="bp-cohort-fill" :style="{ width: (s.cohortAvg ?? 0) + '%', background: cohortBarColor(s.cohortAvg) }"></div></div>
                        <span class="bp-cohort-val" :style="{ color: cohortBarColor(s.cohortAvg) }">{{ s.cohortAvg === null ? '—' : s.cohortAvg + '%' }}</span>
                      </div>
                    </td>
                    <td class="ctr">
                      <div class="bp-pct-cell">
                        <input type="number" min="0" max="100" class="bp-pct-input"
                          :value="blueprintLocal[i]?.targetPct ?? s.targetPct"
                          @input="setTargetPct(i, ($event.target as HTMLInputElement).value)" />
                        <span class="bp-pct-pct">%</span>
                        <div class="bp-pct-range">target {{ s.pctRange }}</div>
                      </div>
                    </td>
                    <td class="ctr">
                      <div class="bp-count">
                        <button type="button" @click="adjustSlice(i, -1)" :disabled="(blueprintLocal[i]?.count ?? s.count) <= 0">−</button>
                        <span>{{ blueprintLocal[i]?.count ?? s.count }}</span>
                        <button type="button" @click="adjustSlice(i, 1)" :disabled="(blueprintLocal[i]?.count ?? s.count) >= s.available">+</button>
                      </div>
                    </td>
                    <td class="ctr bp-actual" :class="actualClass(i)">{{ actualPct(i) }}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>

        <!-- TOPICS mode — specialty/subject accordion (backend samples) -->
        <div v-else-if="qSelMode === 'topics'" class="card">
          <div class="q-browser-head">
            <div class="q-browser-count">
              Pick subjects &amp; categories — the system samples questions for you
              <span v-if="selectedTopics.size" class="q-sel-badge">{{ selectedTopics.size }} selected</span>
            </div>
          </div>
          <div class="topics-list">
            <div v-for="sub in topicTree" :key="sub.id" class="topic-group">
              <button type="button" class="topic-head" @click="expandedSubject = expandedSubject === sub.id ? null : sub.id">
                <span class="topic-head-name">{{ sub.name }}</span>
                <span class="topic-head-state">
                  <span v-if="subjectSelCount(sub)" class="topic-count">{{ subjectSelCount(sub) }} selected</span>
                  <span class="topic-chev" :class="{ open: expandedSubject === sub.id }">⌄</span>
                </span>
              </button>
              <div v-if="expandedSubject === sub.id" class="topic-subs">
                <button type="button" class="topic-all" @click="toggleAllInSubject(sub)">
                  {{ subjectAllSelected(sub) ? 'Clear all' : 'Select all' }}
                </button>
                <label v-for="cat in sub.categories" :key="cat.id" class="topic-sub" :class="{ on: selectedTopics.has(cat.id) }">
                  <input type="checkbox" class="sr-only" :checked="selectedTopics.has(cat.id)" @change="toggleTopic(cat.id)" />
                  <span class="chk" :class="{ on: selectedTopics.has(cat.id) }"><span v-if="selectedTopics.has(cat.id)">✓</span></span>
                  {{ cat.name }}
                </label>
              </div>
            </div>
            <div v-if="!topicTree.length" class="rev-empty" style="padding:16px;">No subjects / categories available for this exam / source.</div>
          </div>
        </div>

        <!-- INDIVIDUAL mode — hand-pick (existing picker) -->
        <div v-else class="card">
            <div class="q-browser-head">
              <div class="q-browser-count">
                {{ examQTotal }} question{{ examQTotal !== 1 ? 's' : '' }}
                <span v-if="selectedQIds.size" class="q-sel-badge">{{ selectedQIds.size }} selected</span>
              </div>
              <div class="q-tax-filters">
                <!-- Was a hardcoded four-level list. The backend validates this value
                     against the difficulties table, so a level added in the admin used
                     to be authorable but not assignable. Both read the same vocabulary
                     now. 'mixed' is the "don't filter" option, not a level. -->
                <select class="qb-tax-select" :class="{ on: difficulty !== 'mixed' }" v-model="difficulty">
                  <option value="mixed">All levels</option>
                  <option v-for="d in facetDifficulties" :key="d.id" :value="d.slug">{{ d.name }}</option>
                </select>
                <select class="qb-tax-select" :class="{ on: subjectId !== null }" :value="subjectId ?? ''"
                  @change="subjectId = Number(($event.target as HTMLSelectElement).value) || null">
                  <option value="">All subjects</option>
                  <option v-for="s in facetSubjects" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
                <select class="qb-tax-select" :class="{ on: domainId !== null }" :value="domainId ?? ''"
                  @change="domainId = Number(($event.target as HTMLSelectElement).value) || null">
                  <option value="">All domains</option>
                  <option v-for="d in facetDomains" :key="d.id" :value="d.id">{{ d.name }}</option>
                </select>
                <select class="qb-tax-select" :class="{ on: disciplineId !== null }" :value="disciplineId ?? ''"
                  @change="disciplineId = Number(($event.target as HTMLSelectElement).value) || null">
                  <option value="">All disciplines</option>
                  <option v-for="d in facetDisciplines" :key="d.id" :value="d.id">{{ d.name }}</option>
                </select>
              </div>
              <div class="q-alloc-actions">
                <span
                  v-if="selectedQIds.size > 0"
                  class="q-alloc-counter"
                  :class="selectedQIds.size < questions ? 'q-alloc--under' : selectedQIds.size === questions ? 'q-alloc--exact' : 'q-alloc--over'"
                >
                  <template v-if="selectedQIds.size < questions">{{ selectedQIds.size }}/{{ questions }} allocated · {{ questions - selectedQIds.size }} unallocated</template>
                  <template v-else-if="selectedQIds.size === questions">{{ selectedQIds.size }}/{{ questions }} allocated</template>
                  <template v-else>{{ selectedQIds.size }}/{{ questions }} allocated · {{ selectedQIds.size - questions }} over</template>
                </span>
                <button type="button" v-if="selectedQIds.size" class="reset-btn" @click="selectedQIds = new Set()">Reset</button>
              </div>
            </div>
            <div class="q-pick-list">
              <!-- Filters (head) stay put; only the ROWS swap to a skeleton while
                   fetching, so a filter change reloads records without the whole
                   card blanking. -->
              <template v-if="questionsLoading">
                <div v-for="i in 8" :key="'q-sk-' + i" class="rev-row q-sk-row">
                  <span class="q-sk-bar" :style="{ width: (55 + (i * 7) % 35) + '%' }"></span>
                </div>
              </template>
              <template v-else>
              <label
                v-for="(q, idx) in examQuestions" :key="q.id"
                class="rev-row q-sel-row"
                :class="{ on: selectedQIds.has(q.id) }"
              >
                <input type="checkbox" class="sr-only" :checked="selectedQIds.has(q.id)" @change="toggleQId(q)" />
                <div class="chk" :class="{ on: selectedQIds.has(q.id) }">
                  <span v-if="selectedQIds.has(q.id)">✓</span>
                </div>
                <span class="rev-id">Q{{ (examQPage - 1) * examQPageSize + idx + 1 }}</span>
                <span class="rev-stem">{{ plain(q.question_stem) }}</span>
                <span class="diff-pill" :style="{ background: diffBg(q.difficulty as Difficulty), color: diffColor(q.difficulty as Difficulty) }">
                  {{ diffLabel(q.difficulty) }}
                </span>
              </label>
              <div v-if="!examQuestions.length" class="rev-empty">No questions match the filter.</div>
              </template>
            </div>
            <!-- Pagination -->
            <div v-if="examQTotalPages > 1" class="q-pagination">
              <button type="button" :disabled="examQPage === 1" @click="examQPage--">‹ Prev</button>
              <span class="q-page-info">Page {{ examQPage }} / {{ examQTotalPages }}</span>
              <button type="button" :disabled="examQPage === examQTotalPages" @click="examQPage++">Next ›</button>
            </div>
        </div>
      </div>

      <!-- ── STEP 3 — Review questions ───────────────────────────────────── -->
      <div v-else-if="step === 3" class="step-body">
        <div class="card">
          <div class="rev-head">
            <div>
              <div class="card-label">Review Questions</div>
              <div class="rev-sub">{{ reviewPool.length }} questions selected · remove any you'd like to exclude</div>
            </div>
            <!-- Same vocabulary as the builder's filter above — these pills used to
                 hardcode the four levels, so a level added in the admin was invisible
                 here even though questions could carry it. -->
            <div class="rev-diff">
              <button type="button" :class="{ on: difficulty === 'mixed' }" @click="difficulty = 'mixed'">
                All
              </button>
              <button type="button" v-for="d in facetDifficulties" :key="d.id"
                :class="{ on: difficulty === d.slug }" @click="difficulty = d.slug as any">
                {{ d.name }}
              </button>
            </div>
          </div>
          <!-- Table header -->
          <div class="rev-tbl-head">
            <div class="rev-th rev-th-num">#</div>
            <div class="rev-th rev-th-q">Question</div>
            <div class="rev-th rev-th-level">Level</div>
            <div class="rev-th rev-th-topic">Topic</div>
            <div class="rev-th rev-th-act"></div>
          </div>
          <div class="rev-list">
            <div v-for="(q, idx) in reviewPool" :key="q.id" class="rev-card">
              <div class="rev-card-num">Q{{ idx + 1 }}</div>
              <div class="rev-card-body">
                <div class="rev-card-stem">{{ plain(q.question_stem) }}</div>
                <div v-if="q.subject || q.domain || q.discipline || q.tags?.length" class="rev-card-opts">
                  <span v-if="q.subject"    class="rev-opt-badge rev-opt-badge--subject">{{ q.subject.name }}</span>
                  <span v-if="q.domain"     class="rev-opt-badge rev-opt-badge--subject">{{ q.domain.name }}</span>
                  <span v-if="q.discipline" class="rev-opt-badge rev-opt-badge--subject">{{ q.discipline.name }}</span>
                  <span v-for="tag in q.tags" :key="tag.id" class="rev-opt-badge">{{ tag.name }}</span>
                </div>
              </div>
              <div class="rev-card-level">
                <span class="diff-pill" :style="{ background: diffBg(q.difficulty as Difficulty), color: diffColor(q.difficulty as Difficulty) }">
                  {{ diffLabel(q.difficulty) }}
                </span>
              </div>
              <div class="rev-card-topic">{{ q.category?.name || '—' }}</div>
              <div class="rev-card-act">
                <button type="button" class="rev-card-rep" :disabled="replacingId === q.id" @click="replaceQuestion(q)">
                  {{ replacingId === q.id ? 'Replacing…' : 'Replace' }}
                </button>
                <button type="button" class="rev-card-rm" @click="removeQuestion(q.id)">Remove</button>
              </div>
            </div>
            <div v-if="!reviewPool.length" class="rev-empty">No questions match the current selection.</div>
          </div>
        </div>
      </div>

      <!-- ── STEP 4 — Recipients & Settings ─────────────────────────────── -->
      <div v-else class="step-body">

        <!-- Recipients card -->
        <div class="card">
          <div class="card-label">Recipients</div>
          <div class="recip-opts">
            <!-- Cohort -->
            <label
              class="recip-opt-card"
              :class="{ on: recipients === 'cohort' }"
            >
              <input type="radio" class="sr-only" name="assign-recipients" value="cohort" v-model="recipients" />
              <div class="recip-opt-icon">👥</div>
              <div class="recip-opt-label">Entire cohort</div>
              <div class="recip-opt-sub">
                {{ selectedCohorts.length ? `${selectedCohortLabel} · ${selectedCohortCount} student${selectedCohortCount !== 1 ? 's' : ''}` : 'Select cohorts below' }}
              </div>
            </label>
            <!-- At-risk -->
            <label
              class="recip-opt-card atrisk"
              :class="{ on: recipients === 'atrisk' }"
            >
              <input type="radio" class="sr-only" name="assign-recipients" value="atrisk" v-model="recipients" />
              <div class="recip-opt-icon">⚠️</div>
              <div class="recip-opt-label">At-risk students only</div>
              <div class="recip-opt-sub">Residents below passing threshold</div>
            </label>
            <!-- Custom -->
            <label
              class="recip-opt-card"
              :class="{ on: recipients === 'custom' }"
            >
              <input type="radio" class="sr-only" name="assign-recipients" value="custom" v-model="recipients" />
              <div class="recip-opt-icon">✏️</div>
              <div class="recip-opt-label">Custom selection</div>
              <div class="recip-opt-sub">Choose specific residents</div>
              <div v-if="recipients === 'custom' && selectedStudents.size" class="recip-opt-count">{{ selectedStudents.size }} selected</div>
            </label>
          </div>
          <!-- Cohort picker -->
          <div v-if="recipients === 'cohort'" class="custom-picker">
            <div class="custom-picker-head">
              <span>
                Select cohorts
                <span v-if="selectedCohorts.length" class="recip-count-badge">
                  {{ selectedCohortCount }} student{{ selectedCohortCount !== 1 ? 's' : '' }}
                </span>
              </span>
              <button v-if="selectedCohorts.length" type="button" class="link-btn link-btn-dim" @click="clearCohorts">Clear</button>
            </div>
            <div v-if="cohortsPickerLoading" class="q-loading"><div class="page-spinner"></div></div>
            <div v-else-if="!cohortsForPicker.length" class="rev-empty">
              No cohorts found — create one in
              <NuxtLink to="/institute/seats-billing" style="color:var(--teal);">Seats &amp; Cohorts</NuxtLink>.
            </div>
            <div v-else class="custom-picker-list">
              <label
                v-for="c in cohortsForPicker" :key="c.id"
                class="custom-picker-row cohort-pick-row" :class="{ on: selectedCohortIds.has(c.id) }"
              >
                <input type="checkbox" class="sr-only" :checked="selectedCohortIds.has(c.id)" @change="toggleCohort(c.id)" />
                <div class="cohort-pick-dot" :style="{ background: cohortCssColor(c.color) }"></div>
                <div style="flex:1;">
                  <div class="student-name">{{ c.name }}</div>
                  <div class="student-email">{{ c.studentCount }} student{{ c.studentCount !== 1 ? 's' : '' }}</div>
                </div>
                <div v-if="selectedCohortIds.has(c.id)" class="exam-tick">✓</div>
              </label>
            </div>
          </div>

          <!-- Custom student picker -->
          <div v-if="recipients === 'custom'" class="custom-picker">
            <div class="custom-picker-head">
              <span>Select recipients <span class="recip-count-badge">{{ selectedStudents.size }} selected</span></span>
              <div style="display:flex;gap:8px;">
                <button type="button" class="link-btn" @click="toggleAllStudents">All</button>
                <button type="button" class="link-btn link-btn-dim" @click="selectedStudents = new Set()">Clear</button>
              </div>
            </div>
            <div v-if="studentsLoading" class="q-loading"><div class="page-spinner"></div></div>
            <div v-else-if="!apiStudents.length" class="rev-empty">No students found.</div>
            <div v-else class="custom-picker-list">
              <label
                v-for="s in apiStudents" :key="s.user_id"
                class="custom-picker-row" :class="{ on: selectedStudents.has(s.user_id) }"
              >
                <input type="checkbox" :checked="selectedStudents.has(s.user_id)" @change="toggleStudent(s.user_id)" style="accent-color:var(--teal);cursor:pointer;flex-shrink:0;">
                <div class="ava" :style="{ background: avatarBg(s.user_id) }">
                  <img v-if="s.avatar_url" :src="s.avatar_url" :alt="s.name" class="ava-img" />
                  <template v-else>{{ initials(s.name) }}</template>
                </div>
                <div style="flex:1;">
                  <div class="student-name">{{ s.name }}</div>
                  <div class="student-email">{{ s.email }}</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        <!-- Extra time accommodations card -->
        <div class="card">
          <div class="extra-time-head">
            <div>
              <div class="card-label" style="margin-bottom:0">Extra Time Accommodations</div>
              <div class="extra-time-sub">Grant additional time to specific students</div>
            </div>
            <button type="button" class="toggle-sw" :class="{ on: extraTimeEnabled }" @click="extraTimeEnabled = !extraTimeEnabled" role="switch" :aria-checked="extraTimeEnabled" aria-label="Allow extra time">
              <div class="toggle-knob"></div>
            </button>
          </div>
          <div v-if="extraTimeEnabled" class="extra-time-body">
            <div class="extra-time-row">
              <label>Extra time (minutes):</label>
              <input type="number" min="5" max="180" v-model.number="extraTimeMins" style="width:70px;" />
              <span class="extra-time-note">added on top of standard time · {{ extraTimeStudents.size }} student{{ extraTimeStudents.size !== 1 ? 's' : '' }} selected</span>
            </div>
            <div class="card-label" style="margin-bottom:8px;margin-top:12px;">Select students for extra time</div>
            <div class="custom-picker-list">
              <label
                v-for="s in apiStudents" :key="s.user_id"
                class="custom-picker-row" :class="{ on: extraTimeStudents.has(s.user_id) }"
              >
                <input type="checkbox" :checked="extraTimeStudents.has(s.user_id)" @change="toggleExtraTime(s.user_id)" style="accent-color:var(--teal);cursor:pointer;flex-shrink:0;">
                <div class="ava" :style="{ background: avatarBg(s.user_id) }">
                  <img v-if="s.avatar_url" :src="s.avatar_url" :alt="s.name" class="ava-img" />
                  <template v-else>{{ initials(s.name) }}</template>
                </div>
                <div style="flex:1;"><div class="student-name">{{ s.name }}</div></div>
                <span v-if="extraTimeStudents.has(s.user_id)" class="extra-time-badge">+{{ extraTimeMins }}min</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Show leaderboard card -->
        <div class="card">
          <div class="extra-time-head">
            <div>
              <div class="card-label" style="margin-bottom:0">Leaderboard</div>
              <div class="extra-time-sub">Let students see how they rank against peers on this exam</div>
            </div>
            <button type="button" class="toggle-sw" :class="{ on: showLeaderboard }" @click="showLeaderboard = !showLeaderboard" role="switch" :aria-checked="showLeaderboard" aria-label="Show leaderboard to students">
              <div class="toggle-knob"></div>
            </button>
          </div>
        </div>

        <!-- Marking methodology card -->
        <div class="card">
          <div class="card-label">Marking Methodology</div>
          <div class="form-grid-2" style="margin-bottom:0">

            <!-- Scoring method -->
            <div>
              <div class="field-label">Scoring method</div>
              <div class="radio-stack">
                <label
                  v-for="m in markingOptions" :key="m.id"
                  class="radio-card" :class="{ on: markingMethod === m.id }"
                >
                  <input type="radio" class="sr-only" name="assign-marking" :value="m.id" v-model="markingMethod" />
                  <div class="radio-dot" :class="{ on: markingMethod === m.id }">
                    <div v-if="markingMethod === m.id" class="radio-dot-inner"></div>
                  </div>
                  <div>
                    <div class="radio-label">{{ m.label }}</div>
                    <div class="radio-sub">{{ m.desc }}</div>
                  </div>
                </label>
              </div>
              <div v-if="markingMethod === 'negative'" class="field-inline">
                <label>Deduction per wrong answer:</label>
                <select v-model.number="negMarkVal" style="width:auto;">
                  <option v-for="v in [0.1, 0.25, 0.33, 0.5, 1]" :key="v" :value="v">−{{ v }}</option>
                </select>
              </div>
            </div>

            <!-- Pass mark -->
            <div>
              <div class="field-label">Pass mark</div>
              <div class="radio-stack">
                <label
                  v-for="p in passMarkOptions" :key="p.id"
                  class="radio-card" :class="{ on: passMarkMode === p.id }"
                >
                  <input type="radio" class="sr-only" name="assign-passmark" :value="p.id" v-model="passMarkMode" />
                  <div class="radio-dot" :class="{ on: passMarkMode === p.id }">
                    <div v-if="passMarkMode === p.id" class="radio-dot-inner"></div>
                  </div>
                  <div>
                    <div class="radio-label">{{ p.label }}</div>
                    <div class="radio-sub">{{ p.desc }}</div>
                  </div>
                </label>
              </div>
              <!-- Fixed pass mark input -->
              <div v-if="passMarkMode === 'fixed'" class="field-inline">
                <label>Pass mark %:</label>
                <input type="number" min="1" max="100" v-model.number="fixedPassMark" style="width:65px;text-align:center;" />
                <span style="font-size:.74rem;color:var(--ink-dim);">%</span>
              </div>
              <!-- Cohen settings -->
              <div v-else-if="passMarkMode === 'cohen'" class="cohen-box">
                <div class="card-label" style="margin-bottom:8px">Cohen settings</div>
                <div class="cohen-row">
                  <label>Percentile threshold:</label>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <input type="number" min="50" max="99" v-model.number="cohenPercentile" style="width:100px;text-align:center;" />
                    <span style="width:100px;font-size:.7rem;color:var(--ink-dim);">th percentile</span>
                  </div>
                </div>
                <div class="cohen-row">
                  <label>Cohen factor:</label>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <input type="number" min="40" max="90" v-model.number="cohenFactor" style="width:100px;text-align:center;" />
                    <span style="width:100px;font-size:.7rem;color:var(--ink-dim);">% of p{{ cohenPercentile }} score</span>
                  </div>
                </div>
                <div class="cohen-est">
                  Based on latest exam data: p{{ cohenPercentile }} score →
                  <strong>Estimated pass mark: ~{{ cohenEstimate }}%</strong>
                  <div style="font-size:.62rem;color:var(--teal-mid);margin-top:3px;">Cohen's method: pass mark = Cohen factor × score of student at chosen percentile</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Attempt limit + Results release -->
          <div class="marking-bottom">
            <div>
              <div class="field-label">Attempt limit</div>
              <div style="display:flex;gap:6px;">
                <button type="button" v-for="n in [1, 2, 3]" :key="n" class="seg-pill" :class="{ on: attemptLimit === n }" @click="attemptLimit = n">{{ n }}×</button>
                <button type="button" class="seg-pill" :class="{ on: attemptLimit === 99 }" @click="attemptLimit = 99" aria-label="Unlimited attempts">∞</button>
              </div>
            </div>
            <div>
              <div class="field-label">Results release</div>
              <div style="display:flex;gap:6px;">
                <button type="button" class="seg-pill" :class="{ on: resultsRelease === 'immediate' }" @click="resultsRelease = 'immediate'">🚀 Immediate</button>
                <button type="button" class="seg-pill" :class="{ on: resultsRelease === 'manual' }" @click="resultsRelease = 'manual'">🔒 Manual release</button>
              </div>
              <div v-if="resultsRelease === 'manual'" class="results-note">You will manually release results from the Mock Exams dashboard once marking is complete.</div>
            </div>
          </div>
        </div>

        <!-- Delivery card -->
        <div class="card">
          <div class="card-label">Delivery</div>
          <div class="delivery-opts">
            <label class="delivery-card" :class="{ on: scheduledNow }">
              <input type="radio" class="sr-only" name="assign-delivery" :value="true" v-model="scheduledNow" />
              <div class="delivery-label">🚀 Send immediately</div>
              <div class="delivery-sub">Residents gain access as soon as you confirm</div>
            </label>
            <label class="delivery-card" :class="{ on: !scheduledNow }">
              <input type="radio" class="sr-only" name="assign-delivery" :value="false" v-model="scheduledNow" />
              <div class="delivery-label">📅 Schedule for later</div>
              <div class="delivery-sub">Pick a date and time for automatic release</div>
            </label>
          </div>
          <div v-if="!scheduledNow" class="sched-date">
            <label>Send date &amp; time</label>
            <input type="datetime-local" v-model="sendDate" />
          </div>
        </div>

        <!-- Review & confirm summary -->
        <div class="summary-panel">
          <div class="card-label">Review &amp; confirm</div>
          <div class="summary-grid">
            <div v-for="[k, v] in summaryRows" :key="k">
              <div class="summary-key">{{ k }}</div>
              <div class="summary-val">{{ v }}</div>
            </div>
          </div>
        </div>

      </div>

      <!-- Error banner -->
      <div v-if="submitError" style="padding:12px 16px;background:#fff1f2;border:1.5px solid #fecdd3;border-radius:10px;margin-top:14px;font-size:0.78rem;color:var(--rose);font-weight:600;">
        ⚠ {{ submitError }}
      </div>

      <!-- Footer nav -->
      <div class="wiz-foot">
        <button type="button" v-if="step > 1" class="btn-back" @click="backStep">← Back</button>
        <div class="wiz-foot-right">
          <NuxtLink to="/institute/mock-exams" class="btn-cancel">Cancel</NuxtLink>
          <button type="button" class="btn-primary" :disabled="!canContinue() || submitting || advancing" @click="nextStep">
            <span v-if="submitting || advancing" class="btn-spinner"></span>
            <span v-else>{{ step === stepLabels.length ? (isEditingExisting ? 'Update Exam →' : isCloningExisting ? 'Reassign Exam →' : 'Assign Exam →') : 'Continue →' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ── Toast ─────────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="toast-fade">
        <div v-if="toastVisible" class="ae-toast">{{ toastMsg }}</div>
      </Transition>
    </Teleport>
  </div>

  <ConfirmModal
    :open="pendingDelete !== null"
    title="Delete assignment"
    :message="`Delete “${pendingDelete?.name}”? This cannot be undone.`"
    confirm-label="Delete"
    danger
    @confirm="doDeleteAssignment"
    @cancel="pendingDelete = null"
  />
</template>

<style scoped>
.ae-page {
   padding: 20px 22px; /*max-width: 1000px;*/
   @media (max-width: 767px) {
    padding-left: 10px;
    padding-right: 10px;
   }
  }
.fade-in { animation: fadeUp .3s cubic-bezier(.16,1,.3,1) both; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

.page-header { margin-bottom: 20px; }
.page-title { font-size: 1.5rem; font-weight: 800; color: var(--ink); }
.page-sub { font-size: .82rem; color: var(--ink-dim); margin-top: 2px; }

.page-loader { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
.page-spinner {
  width: 22px; height: 22px; border-radius: 50%;
  border: 3px solid var(--border); border-top-color: var(--teal);
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Stepper */
.stepper {
  display: flex; align-items: center; background: var(--white); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 14px 20px; margin-bottom: 22px;
  @media (max-width: 600px) {
    gap: 12px;
    flex-direction: column;
    align-items: flex-start;
  }
}
.step-line {
  flex: 1; height: 2px; background: var(--border); margin: 0 8px; border-radius: 1px; transition: background .3s;
  @media (max-width: 600px) {
    height: 10px;
    width: 2px;
    flex: initial;
    margin: 0 17px;
  }
}
.step-line.done { background: var(--teal); }
.step-item { display: flex; align-items: center; gap: 7px; white-space: nowrap; padding: 4px 6px; border-radius: 8px; transition: background .13s; }
.step-item.clickable { cursor: pointer; }
.step-item.clickable:hover { background: var(--surface); }
.step-num { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: .68rem; font-weight: 800; flex-shrink: 0; background: var(--surface); color: var(--ink-dim); border: 2px solid var(--border); transition: all .2s; margin-bottom: 0px; }
.step-num.done { background: var(--teal); color: #fff; border: none; }
.step-num.active { background: var(--teal); color: #fff; border: none; }
.step-label { font-size: .74rem; font-weight: 600; color: var(--ink-dim); }
.step-label.active { font-weight: 800; color: var(--ink); }
.step-label.done { color: var(--teal-mid); }

/* Cards */
.step-body { display: flex; flex-direction: column; gap: 16px; }
.card { padding: 18px; border-radius: var(--r-lg); background: var(--white); border: 1px solid var(--border); }
.card-label { font-size: .65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: var(--ink-dim); margin-bottom: 14px; }

/* Preset grid */
.preset-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}
.preset-card { padding: 18px; border: 2px solid var(--border); border-radius: var(--r-lg); background: var(--white); cursor: pointer; position: relative; transition: all .15s; }
.preset-card:hover { border-color: var(--teal-border); background: var(--surface); }
.preset-card.on { border-color: var(--teal); background: var(--teal-pale); }

/* ── Accessible radio-group cards ──────────────────────────────────────────
   The Exam-Type / Recipients / Delivery / Scoring / Pass-mark cards are now
   real radio groups: each card is a <label> wrapping a visually-hidden native
   <input type="radio">. This gives proper radiogroup semantics, native arrow-
   key + Space behaviour, and label association — replacing the old
   div@click+role="button" controls. Notes:
   - .sr-only hides the input visually while keeping it focusable for AT/keyboard.
   - display:block restores the block layout these cards had as <div>s (a bare
     <label> defaults to display:inline). .radio-card stays flex (set below).
   - :focus-within paints a visible focus ring on the card when its hidden
     radio is focused, so keyboard users can see where they are. */
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
.preset-card, .recip-opt-card, .delivery-card { display: block; }
.preset-card:focus-within,
.recip-opt-card:focus-within,
.delivery-card:focus-within,
.radio-card:focus-within,
/* Exam-bank, cohort and student picker rows are now <label>s wrapping a hidden
   native radio/checkbox — paint a focus ring when their control is focused. */
.exam-row:focus-within,
.custom-picker-row:focus-within,
.q-sel-row:focus-within {
/* outline: 2px solid var(--teal); outline-offset: 2px; */
}
.preset-tick { position: absolute; top: 10px; right: 10px; width: 18px; height: 18px; border-radius: 50%; background: var(--teal); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 9px; }
.preset-icon { font-size: 1.5rem; margin-bottom: 10px; }
.preset-label { font-size: .84rem; font-weight: 800; color: var(--ink); margin-bottom: 5px; }
.preset-desc { font-size: .7rem; color: var(--ink-dim); line-height: 1.5; }

/* Exam list */
.exam-list:has(.assign-row-actions) {
  gap: 6px;
  display: flex;
  flex-direction: column;
}
.exam-list {
   display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 6px; 
}
.exam-row {
  display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: var(--r); border: 1.5px solid var(--border); background: var(--white); cursor: pointer; transition: all .14s;
  @media (max-width: 767px) {
    gap: 10px; padding: 10px 12px;flex-wrap: wrap;
  }
}
.exam-row:hover { border-color: var(--teal-border); background: var(--surface); }
.exam-row:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
.exam-row.on { border-color: var(--teal); background: var(--teal-pale); }
/* Chevron hint that the assignment card is clickable (opens the wizard). */
.exam-row-chev { color: var(--ink-faint, var(--ink-dim)); flex-shrink: 0; margin-left: 4px; }
.exam-row:hover .exam-row-chev { color: var(--teal); }
.exam-icon { width: 34px; height: 34px; border-radius: 9px; background: var(--surface); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.exam-row.on .exam-icon { background: var(--teal); }
.exam-meta { flex: 1; }
.exam-name { font-size: .81rem; font-weight: 700; color: var(--ink); display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.exam-sub { font-size: .65rem; color: var(--ink-dim); margin-top: 2px; }

/* Source badge on each exam — own institution exam vs Passmed official */
.exam-badge {
  font-size: .58rem; font-weight: 800; letter-spacing: .4px; text-transform: uppercase;
  padding: 2px 8px; border-radius: 20px; border: 1px solid transparent;
}
.exam-badge.eb-inst    { color: var(--teal-mid); background: var(--teal-pale); border-color: var(--teal-border); }
.exam-badge.eb-passmed { color: #7c3aed; background: #f3ecfe; border-color: #e2d3fb; }
.exam-badge.eb-shared  { color: #b45309; background: #fef3c7; border-color: #fcd9a0; }
.exam-tick { width: 18px; height: 18px; border-radius: 50%; background: var(--teal); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 9px; flex-shrink: 0; }

/* Form */
.form-stack { display: flex; flex-direction: column; gap: 14px; }
.form-grid-2 {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}
.form-grid-3 {
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px;
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}
label { font-size: .74rem; font-weight: 700; color: var(--ink-mid); display: block; margin-bottom: 6px; }
label .opt { font-weight: 400; color: var(--ink-faint); }
input[type=text], input[type=number], input[type=date], input[type=datetime-local], select {
  width: 100%; padding: 10px 13px; box-sizing: border-box;
  border: 1.5px solid var(--border); border-radius: 9px;
  font-family: Figtree, sans-serif; font-size: .83rem; color: var(--ink); outline: none;
  /* Explicit background so dark mode doesn't fall back to UA-white (which left a
     white field with light --ink text). --white flips to the dark card under
     body.dark — same fix family as the institute .fld dark-mode background. */
  background: var(--white);
}
input[type=number] { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .88rem; }
input:focus, select:focus { border-color: var(--teal); }
input:disabled { opacity: .45; }
.due-wrap { max-width: 260px; }
.mode-toggle { display: flex; gap: 6px; }
.mode-toggle button { flex: 1; padding: 9px 4px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--white); color: var(--ink-dim); font-family: Figtree, sans-serif; font-size: .72rem; font-weight: 700; cursor: pointer; }
.mode-toggle button.on { border-color: var(--teal); background: var(--teal-pale); color: var(--teal-mid); }

/* Tabs */
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tabs button { padding: 7px 14px; border-radius: 9px; border: 1.5px solid var(--border); background: var(--white); font-family: Figtree, sans-serif; font-size: .76rem; font-weight: 700; color: var(--ink-dim); cursor: pointer; }
.tabs button.on { border-color: var(--teal); background: var(--teal-pale); color: var(--teal-mid); }

/* Blueprint */
.bp-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 14px; gap: 10px; flex-wrap: wrap; }
.bp-hint { font-size: .7rem; color: var(--ink-dim); margin-top: 3px; }
.bp-actions { display: flex; align-items: center; gap: 10px; }
.bp-counter { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .72rem; font-weight: 700; }
.q-alloc-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.q-alloc-counter { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .7rem; font-weight: 700; white-space: nowrap; }
.q-alloc--under { color: #d97706; }
.q-alloc--exact { color: #16a34a; }
.q-alloc--over  { color: #e11d48; }
.reset-btn { padding: 5px 10px; border-radius: 7px; background: var(--surface); border: 1px solid var(--border); font-size: .68rem; font-weight: 700; color: var(--ink-dim); cursor: pointer; }
.bp-table-wrap { overflow: hidden; border: 1px solid var(--border); border-radius: var(--r-lg); }
.bp-table { width: 100%; border-collapse: collapse; }
.bp-table thead tr { background: var(--surface); border-bottom: 1px solid var(--border); }
.bp-table th { font-size: .58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--ink-dim); padding: 8px 14px; text-align: left; }
.bp-table th.ctr { text-align: center; }
.bp-table tbody tr { border-bottom: 1px solid var(--border); }
.bp-table td { padding: 10px 14px; }
.bp-table td.ctr { text-align: center; }
.bp-table td.small { font-size: .68rem; color: var(--ink-dim); }
.bp-table td.mono { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .72rem; font-weight: 700; color: var(--teal-mid); }
.dom-name { font-size: .77rem; font-weight: 700; color: var(--ink); }
.dom-sub { font-size: .63rem; color: var(--ink-dim); margin-top: 1px; }
.bar-row { display: flex; align-items: center; gap: 6px; justify-content: center; }
.mini-bar { width: 50px; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.mini-fill { height: 100%; border-radius: 2px; }
.mono { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .68rem; font-weight: 700; }
.qty-row { display: flex; align-items: center; gap: 5px; justify-content: center; }
.qty-row button { width: 22px; height: 22px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); cursor: pointer; font-size: .8rem; line-height: 1; color: var(--ink-mid); }
.qty-row button:disabled { opacity: .4; cursor: not-allowed; }
.qty-val { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .82rem; font-weight: 700; color: var(--ink); width: 20px; text-align: center; }

/* Topics */
/* Part 3 — Step 2 mode switcher (blueprint / topics / individual) */
.qsel-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.qsel-tabs { display: inline-flex; gap: 4px; background: var(--surface); border-radius: 9px; padding: 3px; }
.qsel-tabs button { padding: 7px 14px; border: none; background: transparent; border-radius: 7px; font-family: 'Figtree', sans-serif; font-size: .76rem; font-weight: 700; color: var(--ink-dim); cursor: pointer; transition: all .14s; }
.qsel-tabs button.on { background: var(--white); color: var(--teal); box-shadow: 0 1px 3px rgba(15,31,46,.1); }
.qsel-source { display: inline-flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.qsel-source-label { font-size: .6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; color: var(--ink-dim); margin-right: 2px; }
.qsel-source button { padding: 5px 11px; border-radius: 7px; border: 1.5px solid var(--border); background: var(--white); font-size: .72rem; font-weight: 700; color: var(--ink-mid); cursor: pointer; transition: all .14s; }
.qsel-source button.on { border-color: var(--teal); color: var(--teal); background: var(--teal-pale); }

/* Blueprint per-domain allocation list */
.bp-list { display: flex; flex-direction: column; gap: 6px; }
.bp-row { display: flex; align-items: center; gap: 14px; padding: 11px 14px; border: 1px solid var(--border); border-radius: var(--r); background: var(--white); }
.bp-domain { flex: 1; min-width: 0; }
.bp-domain-name { font-size: .82rem; font-weight: 700; color: var(--ink); }
.bp-domain-sub { font-size: .68rem; color: var(--ink-dim); margin-top: 2px; }
.bp-count { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }
.bp-count button { width: 26px; height: 26px; border-radius: 7px; border: 1.5px solid var(--border); background: var(--white); font-size: 1rem; font-weight: 700; color: var(--ink-mid); cursor: pointer; line-height: 1; }
.bp-count button:hover:not(:disabled) { border-color: var(--teal-border); color: var(--teal); }
.bp-count button:disabled { opacity: .4; cursor: not-allowed; }
.bp-count span { min-width: 30px; text-align: center; font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .82rem; font-weight: 700; color: var(--ink); }

/* Blueprint table (percentage-driven) — cohort bar, % input, actual % */
.bp-subhint { font-size: .68rem; color: var(--ink-dim); margin-top: 3px; max-width: 520px; }
.bp-cohort { display: inline-flex; align-items: center; gap: 7px; }
.bp-cohort-bar { width: 46px; height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
.bp-cohort-fill { height: 100%; border-radius: 3px; transition: width .3s ease; }
.bp-cohort-val { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .72rem; font-weight: 700; }
.bp-pct-cell { display: inline-flex; align-items: center; gap: 2px; flex-wrap: wrap; justify-content: center; }
.bp-pct-input { width: 48px; padding: 5px 6px; border: 1.5px solid var(--border); border-radius: 7px; font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .78rem; font-weight: 700; color: var(--ink); text-align: center; background: var(--white); }
.bp-pct-input:focus { outline: none; border-color: var(--teal); }
.bp-pct-pct { font-size: .72rem; font-weight: 700; color: var(--ink-dim); }
.bp-pct-range { flex-basis: 100%; font-size: .6rem; color: var(--ink-faint, var(--ink-dim)); margin-top: 2px; }
.bp-table td.bp-actual { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .78rem; font-weight: 700; }
.bp-table td.bp-actual.bp-actual-ok    { color: #16a34a; }
.bp-table td.bp-actual.bp-actual-under { color: #d97706; }
.bp-table td.bp-actual.bp-actual-over  { color: #e11d48; }

/* Topics accordion */
.topic-group { border: 1.5px solid var(--border); border-radius: var(--r); overflow: hidden; }
.topic-head { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 14px; background: var(--white); border: none; cursor: pointer; }
.topic-head-name { font-size: .82rem; font-weight: 700; color: var(--ink); }
.topic-head-state { display: inline-flex; align-items: center; gap: 8px; }
.topic-count { font-size: .68rem; font-weight: 700; color: var(--teal); }
.topic-chev { font-size: .9rem; color: var(--ink-dim); transition: transform .18s; }
.topic-chev.open { transform: rotate(180deg); }
.topic-subs { display: flex; flex-direction: column; gap: 2px; padding: 6px 10px 10px; border-top: 1px solid var(--border); background: var(--surface); }
.topic-all { align-self: flex-start; margin: 4px 0 6px; padding: 4px 9px; border-radius: 6px; border: 1px solid var(--border); background: var(--white); font-size: .66rem; font-weight: 700; color: var(--ink-dim); cursor: pointer; }
.topic-sub { display: flex; align-items: center; gap: 9px; padding: 7px 8px; border-radius: 7px; font-size: .78rem; color: var(--ink); cursor: pointer; }
.topic-sub:hover { background: var(--white); }
.topic-sub.on { background: var(--teal-pale); }
.topics-list { display: flex; flex-direction: column; gap: 8px; }
.spec-card { border: 1.5px solid var(--border); border-radius: var(--r-lg); overflow: hidden; transition: border-color .15s; }
.spec-card.on { border-color: var(--teal); }
.spec-head { display: flex; align-items: center; background: var(--white); }
.spec-card.on .spec-head { background: rgba(6,182,212,.05); }
.spec-info { display: flex; align-items: center; gap: 10px; flex: 1; padding: 12px 14px; cursor: pointer; }
.spec-icon { font-size: 1.1rem; }
.spec-meta { flex: 1; }
.spec-name { font-size: .77rem; font-weight: 800; color: var(--ink); }
.spec-sub { font-size: .62rem; color: var(--ink-dim); }
.spec-stats { display: flex; align-items: center; gap: 6px; }
.spec-count { font-size: .62rem; font-weight: 800; color: var(--teal-mid); background: var(--teal-pale); padding: 2px 8px; border-radius: 20px; border: 1px solid var(--teal-border); }
.spec-avg { font-size: .6rem; font-weight: 800; color: var(--ink-dim); }
.spec-all { padding: 12px 14px; border-left: 1px solid var(--border); display: flex; align-items: center; gap: 5px; color: var(--ink-dim); font-size: .68rem; font-weight: 700; cursor: pointer; transition: background .1s; }
.spec-all:hover { background: var(--surface); }
.chk { width: 16px; height: 16px; border-radius: 4px; border: 2px solid var(--border); background: var(--white); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 10px; }
.chk.on { background: var(--teal); border-color: var(--teal); }
.chk.some { border-color: var(--teal); }
.chk .dash { color: var(--teal); }
.spec-toggle { padding: 12px; border-left: 1px solid var(--border); display: flex; align-items: center; cursor: pointer; color: var(--ink-dim); transition: background .13s; }
.spec-toggle:hover { background: var(--surface); }
.spec-toggle span { display: inline-block; transition: transform .2s; }
.spec-toggle span.open { transform: rotate(180deg); }
.sub-grid { border-top: 1px solid var(--border); display: grid; grid-template-columns: 1fr 1fr; }
.sub-row { display: flex; align-items: center; gap: 9px; padding: 9px 14px; cursor: pointer; background: var(--white); border-bottom: 1px solid var(--border); transition: background .1s; }
.sub-row:hover { background: var(--surface); }
.sub-row.on { background: var(--teal-pale); }
.sub-row .chk { width: 14px; height: 14px; }
.sub-meta { flex: 1; min-width: 0; }
.sub-label { font-size: .73rem; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub-row.on .sub-label { font-weight: 700; }
.sub-stats { font-size: .6rem; color: var(--ink-dim); }

/* Review */
.rev-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 14px; gap: 10px; flex-wrap: wrap; }
.rev-sub { font-size: .7rem; color: var(--ink-dim); }

/* Taxonomy filter dropdowns (Difficulty / Subject / Domain / Discipline) */
.q-tax-filters {flex: 1; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.qb-tax-select {
  border: 1.5px solid var(--border); border-radius: 8px; padding: 7px 10px;
  font-family: Figtree, sans-serif; font-size: .71rem; font-weight: 600;
  color: var(--ink-mid); background: var(--white); cursor: pointer; max-width: 170px;
}
.qb-tax-select.on { border-color: var(--teal); color: var(--teal-mid); background: var(--teal-pale); }

.rev-diff {
  display: flex; gap: 5px;
  @media (max-width: 500px) {
    flex-wrap: wrap;
  }
}
.rev-diff button { padding: 6px 12px; border-radius: 20px; border: 1.5px solid var(--border); background: var(--white); font-family: Figtree, sans-serif; font-size: .71rem; font-weight: 600; color: var(--ink-mid); cursor: pointer; }
.rev-diff button.on { border-color: var(--teal); background: var(--teal-pale); color: var(--teal-mid); font-weight: 800; }
/* Individual question picker list — its own class (was sharing .rev-list with the
   Review step, whose border/rounded-corner styles fought this layout and made the
   scroll look broken). Now decoupled, so it gets its OWN clean inner scroll: the
   list scrolls independently while the wizard header/tabs stay put. */
.q-pick-list { display: flex; flex-direction: column; gap: 6px; max-height: 60vh; overflow-y: auto; padding: 2px 6px 2px 2px; }
/* Skeleton rows shown while fetching (filters stay visible above). */
.q-sk-row { pointer-events: none; }
.q-sk-bar { display: inline-block; height: 12px; border-radius: 6px; background: var(--border); animation: qskpulse 1.1s ease-in-out infinite; }
@keyframes qskpulse { 0%, 100% { opacity: .35; } 50% { opacity: .75; } }
.rev-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--white); }
.rev-id { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .65rem; font-weight: 700; color: var(--ink-dim); flex-shrink: 0; width: 32px; }
.rev-stem { font-size: .74rem; color: var(--ink); flex: 1; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diff-pill { font-size: .62rem; font-weight: 800; padding: 2px 8px; border-radius: 20px; text-transform: lowercase; }
.rev-rm { width: 24px; height: 24px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); font-size: 1rem; line-height: 1; cursor: pointer; color: var(--ink-dim); }
.rev-rm:hover { background: var(--rose-light); color: var(--rose); border-color: var(--rose); }
.rev-empty { padding: 32px; text-align: center; font-size: .8rem; color: var(--ink-faint); }

/* Step 3 — table layout */
.rev-tbl-head { display: flex; align-items: center; gap: 0; padding: 7px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px 10px 0 0; border-bottom: none; }
.rev-th { font-size: .58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-dim); }
.rev-th-num   { width: 36px; flex-shrink: 0; }
.rev-th-q     { flex: 1; }
.rev-th-level { width: 100px; flex-shrink: 0; text-align: center; }
.rev-th-topic { width: 110px; flex-shrink: 0; }
.rev-th-act   { width: 168px; flex-shrink: 0; }

.rev-list { display: flex; flex-direction: column; max-height: 540px; overflow-y: auto; border: 1px solid var(--border); border-radius: 0 0 10px 10px; }
.rev-card {
  display: flex; align-items: flex-start; gap: 0; padding: 12px 16px; background: var(--white); border-bottom: 1px solid var(--border);
  @media (max-width: 767px) {
    flex-wrap: wrap; gap: 10px; padding: 10px 12px;
  }
}
.rev-card:last-child { border-bottom: none; }
.rev-card-num { font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .66rem; font-weight: 800; color: var(--ink-dim); flex-shrink: 0; width: 36px; padding-top: 3px; }
.rev-card-body { flex: 1; min-width: 0; }
.rev-card-stem { font-size: .77rem; font-weight: 600; color: var(--ink); line-height: 1.5; }
.rev-card-opts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.rev-opt-badge { display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 20px; font-size: .65rem; font-weight: 600; border: 1.5px solid var(--border); background: var(--white); color: var(--ink-dim); white-space: nowrap; }
.rev-opt-badge--subject { border-color: var(--teal-border); background: var(--teal-pale); color: var(--teal-mid); }
.rev-card-level { width: 100px; flex-shrink: 0; display: flex; justify-content: center; padding-top: 2px; }
.rev-card-topic { width: 110px; flex-shrink: 0; font-size: .72rem; color: var(--ink-mid); padding-top: 3px; }
.rev-card-act   { width: 168px; flex-shrink: 0; display: flex; gap: 8px; justify-content: flex-end; padding-top: 1px; }
.rev-card-rm { padding: 4px 11px; border-radius: 6px; border: 1.5px solid #fca5a5; background: #fff1f2; color: #e11d48; font-size: .68rem; font-weight: 700; cursor: pointer; transition: all .13s; white-space: nowrap; }
.rev-card-rm:hover { background: #ffe4e6; border-color: #e11d48; }
.rev-card-rep { padding: 4px 11px; border-radius: 6px; border: 1.5px solid var(--teal-border); background: var(--teal-light); color: var(--teal-mid); font-size: .68rem; font-weight: 700; cursor: pointer; transition: all .13s; white-space: nowrap; }
.rev-card-rep:hover:not(:disabled) { background: var(--teal-pale); border-color: var(--teal-mid); }
.rev-card-rep:disabled { opacity: .55; cursor: default; }

/* Step 4 — Recipients */
.recip-opts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}
.recip-opt-card { padding: 14px 16px; border: 2px solid var(--border); border-radius: var(--r-lg); cursor: pointer; background: var(--white); transition: all .15s; }
.recip-opt-card:hover { border-color: #22d3ee; background: #f0fdff; }
.recip-opt-card.on { border: 2px solid #06b6d4 !important; background: #ecfeff !important; box-shadow: 0 0 0 1px #06b6d4; }
/* Dark mode: the hover/selected tints above are hardcoded light cyans which
   rendered as white blocks. Swap for translucent teal so the card stays dark.
   (Base resting state already uses var(--white), which flips.) */
body.dark .recip-opt-card:hover { background: rgba(34, 211, 238, 0.10); }
body.dark .recip-opt-card.on    { background: rgba(6, 182, 212, 0.16) !important; }
.recip-opt-icon { font-size: 1.2rem; margin-bottom: 6px; }
.recip-opt-label { font-size: .78rem; font-weight: 800; color: var(--ink); margin-bottom: 3px; }
.recip-opt-sub { font-size: .66rem; color: var(--ink-dim); }
.recip-opt-count { margin-top: 5px; font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; font-size: .7rem; font-weight: 700; color: var(--teal-mid); }
.recip-count-badge { background: var(--teal); color: #fff; border-radius: 20px; padding: 2px 8px; font-size: .65rem; font-weight: 700; margin-left: 4px; }
/* Custom picker */
.custom-picker { margin-top: 12px; border: 1.5px solid var(--border); border-radius: var(--r-lg); overflow: hidden; }
.custom-picker-head { padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--surface); display: flex; align-items: center; justify-content: space-between; font-size: .74rem; font-weight: 700; color: var(--ink); }
.custom-picker-list { max-height: 220px; overflow-y: auto; background: var(--white); }
.custom-picker-row { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background .1s; }
.custom-picker-row:last-child { border-bottom: none; }
.custom-picker-row:hover { background: var(--surface); }
.custom-picker-row.on { background: var(--teal-pale); }
.link-btn { font-size: .68rem; font-weight: 700; color: var(--teal-mid); background: none; border: none; cursor: pointer; font-family: Figtree, sans-serif; padding: 2px 4px; }
.link-btn-dim { color: var(--ink-dim); }
/* Student meta */
.student-name { font-size: .74rem; font-weight: 700; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.student-email { font-size: .62rem; color: var(--ink-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ava { width: 30px; height: 30px; border-radius: 50%; color: #fff; font-size: .62rem; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
.ava-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }

/* Extra time */
.extra-time-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.extra-time-sub { font-size: .7rem; color: var(--ink-dim); margin-top: 3px; }
.toggle-sw {border: none; width: 38px; height: 22px; border-radius: 11px; background: var(--border); cursor: pointer; position: relative; transition: background .2s; flex-shrink: 0; }
.toggle-sw.on { background: var(--teal); }
.toggle-knob { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); transition: left .2s; }
.toggle-sw.on .toggle-knob { left: 19px; }
.extra-time-body { margin-top: 14px; }
.extra-time-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.extra-time-row label { font-size: .72rem; font-weight: 700; color: var(--ink-mid); display: inline; margin-bottom: 0; }
.extra-time-note { font-size: .7rem; color: var(--ink-dim); }
.extra-time-badge { font-size: .62rem; font-weight: 700; color: var(--teal-mid); background: var(--teal-pale); padding: 1px 7px; border-radius: 20px; flex-shrink: 0; }

/* Marking — radio cards */
.field-label { font-size: .7rem; font-weight: 700; color: var(--ink-mid); margin-bottom: 8px; }
.radio-stack { display: flex; flex-direction: column; gap: 7px; }
.radio-card { display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px; border-radius: 9px; border: 1.5px solid var(--border); background: var(--white); cursor: pointer; transition: all .13s; }
.radio-card:hover { border-color: var(--teal-border); background: var(--surface); }
.radio-card.on { border-color: var(--teal); background: var(--teal-pale); }
.radio-dot { width: 15px; height: 15px; border-radius: 50%; border: 2px solid var(--border); background: var(--white); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; transition: all .13s; }
.radio-dot.on { border-color: var(--teal); background: var(--teal); }
.radio-dot-inner { width: 5px; height: 5px; border-radius: 50%; background: #fff; }
.radio-label { font-size: .74rem; font-weight: 700; color: var(--ink); }
.radio-sub { font-size: .62rem; color: var(--ink-dim); margin-top: 1px; }
.field-inline { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.field-inline label { font-size: .72rem; color: var(--ink-mid); display: inline; margin-bottom: 0; }

/* Cohen box */
.cohen-box { margin-top: 10px; padding: 12px 14px; background: var(--surface); border-radius: 9px; border: 1px solid var(--border); }
.cohen-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.cohen-row label { font-size: .72rem; color: var(--ink-mid); display: inline; margin-bottom: 0; }
.cohen-est { margin-top: 6px; padding: 8px 10px; background: var(--teal-pale); border-radius: 7px; border: 1px solid var(--teal-border); font-size: .68rem; color: var(--teal-dark); }

/* Attempt + results */
.marking-bottom {
  border-top: 1px solid var(--border); padding-top: 16px; margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}
.seg-pill { flex: 1; padding: 8px 8px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--white); font-family: Figtree, sans-serif; font-size: .73rem; font-weight: 700; color: var(--ink-dim); cursor: pointer; white-space: nowrap; }
.seg-pill:hover { border-color: var(--teal-border); color: var(--teal-mid); }
.seg-pill.on { border-color: var(--teal); background: var(--teal-pale); color: var(--teal-mid); }
.results-note { margin-top: 6px; font-size: .67rem; color: var(--ink-dim); }

/* Delivery */
.delivery-opts {
  display: flex; gap: 10px; margin-bottom: 14px;
  @media (max-width: 500px) {
    flex-direction: column;
  }
}
.delivery-card { flex: 1; padding: 14px 16px; border: 2px solid var(--border); border-radius: var(--r-lg); cursor: pointer; background: var(--white); transition: all .15s; }
.delivery-card:hover { border-color: var(--teal-border); background: var(--surface); }
.delivery-card.on { border-color: var(--teal); background: var(--teal-pale); }
.delivery-label { font-size: .78rem; font-weight: 800; color: var(--ink); margin-bottom: 3px; }
.delivery-sub { font-size: .66rem; color: var(--ink-dim); }
.sched-date { max-width: 280px; }

/* Summary panel */
.summary-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 20px 22px; }
.summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.summary-key { font-size: .59rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-dim); margin-bottom: 2px; }
.summary-val { font-size: .78rem; font-weight: 700; color: var(--ink); }

/* Wizard footer */
.wiz-foot {
  display: flex; align-items: center; justify-content: space-between; margin-top: 22px; gap: 10px;
}
.wiz-foot-right { display: flex; gap: 8px; margin-left: auto; }
.btn-back, .btn-cancel, .btn-primary, .btn-secondary { padding: 9px 18px; border-radius: 9px; font-family: Figtree, sans-serif; font-size: .8rem; font-weight: 700; cursor: pointer; text-decoration: none; }
.btn-back, .btn-cancel { background: var(--white); border: 1.5px solid var(--border); color: var(--ink-mid); }
.btn-back:hover, .btn-cancel:hover { border-color: var(--teal-border); color: var(--teal); }
.btn-primary { padding: 9px 24px; background: var(--teal); border: none; color: #fff; font-weight: 800; display: inline-flex; align-items: center; gap: 8px; }
.btn-primary:hover { background: var(--teal-dark); }
.btn-primary:disabled { opacity: .4; cursor: not-allowed; background: var(--teal); }
.btn-secondary { background: var(--surface); border: 1.5px solid var(--border); color: var(--ink-mid); }
.btn-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; animation: spin 0.6s linear infinite; }

/* Question browser (step 2) */
.q-loading { display: flex; align-items: center; gap: 10px; padding: 32px; justify-content: center; font-size: .8rem; color: var(--ink-dim); }
.q-browser-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.q-browser-count { font-size: .74rem; font-weight: 700; color: var(--ink-mid); }
.q-sel-badge { background: var(--teal); color: #fff; border-radius: 20px; padding: 2px 8px; font-size: .65rem; margin-left: 4px; }
.q-sel-row { cursor: pointer; }
.q-sel-row:hover { background: var(--surface); }
.q-sel-row.on { background: var(--teal-pale); border-color: var(--teal); }
.q-sel-row .chk { flex-shrink: 0; width: 15px; height: 15px; border-radius: 4px; }
.q-sel-row--maxed { opacity: .4; cursor: not-allowed; pointer-events: none; }

/* Pagination */
.q-pagination { display: flex; align-items: center; justify-content: center; gap: 10px; padding-top: 14px; border-top: 1px solid var(--border); margin-top: 10px; }
.q-pagination button { padding: 6px 14px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--white); font-family: Figtree, sans-serif; font-size: .75rem; font-weight: 700; color: var(--ink-mid); cursor: pointer; }
.q-pagination button:hover:not(:disabled) { border-color: var(--teal); color: var(--teal); }
.q-pagination button:disabled { opacity: .35; cursor: not-allowed; }
.q-page-info { font-size: .73rem; font-weight: 600; color: var(--ink-dim); font-family:'Figtree',sans-serif;font-variant-numeric:tabular-nums; }

/* Cohort pick row */
.cohort-pick-row { align-items: center; }
.cohort-pick-dot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }

/* Assignment row actions */
.assign-row-actions {
  display: flex; gap: 6px; margin-left: auto; align-items: center; flex-shrink: 0; 
  @media (max-width: 500px) {
    gap: 4px;
    flex-wrap: wrap;
            flex-shrink: inherit;

  }
}
.assign-act-btn {
  height: 28px; padding: 0 10px; border-radius: 7px; border: 1.5px solid var(--border);
  background: var(--white); cursor: pointer; font-size: .75rem; font-weight: 600; line-height: 1;
  /* Explicit themed colour — without it the button fell back to the UA default
     (black) text/glyph, which was invisible on the dark card in dark mode.
     --ink flips light under body.dark. */
  color: var(--ink);
  display: flex; align-items: center; gap: 4px;
  transition: all .13s; flex-shrink: 0; white-space: nowrap;
}
.assign-act-btn:hover    { border-color: var(--teal-border); background: var(--surface); }
.assign-row-actions      { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.assign-act-edit,
.assign-act-clone,
.assign-act-del          { width: 28px; padding: 0; justify-content: center; }
.assign-act-del:hover    { border-color: #f43f5e; background: #fff1f2; }
.assign-act-declare--active { border-color: #16a34a; color: #16a34a; background: #f0fdf4; }
.assign-act-declare--active:hover { background: #dcfce7; border-color: #15803d; }
.assign-act-declare--done { border-color: var(--border); color: var(--ink-dim); background: var(--surface); cursor: default; opacity: .7; }
.assign-act-declare:disabled { cursor: default; }
.declare-spinner {
  display: inline-block; width: 12px; height: 12px;
  border: 2px solid #16a34a; border-top-color: transparent;
  border-radius: 50%; animation: spin .6s linear infinite;
}
.assign-act-clone:hover  { border-color: #8b5cf6; background: #f5f3ff; }
.assign-act-edit:hover   { border-color: var(--teal-border); background: #ecfeff; }
/* Dark mode: the variant hover backgrounds above are hardcoded light tints —
   swap them for translucent accents so the (now light) text/glyph stays
   readable on hover. Resting state is handled by .assign-act-btn { color }. */
body.dark .assign-act-clone:hover    { background: rgba(139, 92, 246, 0.18); }
body.dark .assign-act-edit:hover     { background: rgba(6, 182, 212, 0.14); }
body.dark .assign-act-del:hover      { background: rgba(244, 63, 94, 0.16); }
body.dark .assign-act-declare--active      { background: rgba(22, 163, 74, 0.16); }
body.dark .assign-act-declare--active:hover { background: rgba(22, 163, 74, 0.26); }
body.dark .assign-act-declare--done  { background: var(--surface); }

/* Edit mode banner */
.edit-mode-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; background: var(--teal-pale); border-radius: 9px;
  border: 1.5px solid var(--teal-border); font-size: .74rem; font-weight: 700; color: var(--teal-dark);
}

/* Toast */
.ae-toast {
  position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
  /* Fixed dark pill — NOT var(--ink), which flips light in dark mode and made
     the white text invisible. Border + shadow separate it from a dark page. */
  background: #111827; color: #fff; font-size: .78rem; font-weight: 700;
  padding: 10px 20px; border-radius: 20px; z-index: 2000;
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow: 0 6px 20px rgba(0,0,0,.45); white-space: nowrap;
}
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity .25s, transform .25s; }
.toast-fade-enter-from { opacity: 0; transform: translateX(-50%) translateY(8px); }
.toast-fade-leave-to   { opacity: 0; transform: translateX(-50%) translateY(8px); }

/* Success */
.success-card { max-width: 540px; margin: 60px auto; padding: 40px; text-align: center; background: var(--white); border: 1px solid var(--border); border-radius: var(--r-xl); box-shadow: 0 10px 30px rgba(15,31,46,.06); }
.success-tick { width: 64px; height: 64px; border-radius: 50%; background: var(--teal); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 2rem; margin: 0 auto 18px; }
.success-title { font-size: 1.4rem; font-weight: 800; color: var(--ink); margin-bottom: 8px; }
.success-sub { font-size: .9rem; color: var(--ink-mid); line-height: 1.5; }
.success-meta { font-size: .76rem; color: var(--ink-dim); margin-top: 14px; }
.success-actions { display: flex; justify-content: center; gap: 8px; margin-top: 24px; }
/* at-risk recipient card is shown — backend assigns to below-threshold residents */
</style>
