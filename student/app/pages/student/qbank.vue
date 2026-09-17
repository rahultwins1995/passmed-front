<script setup lang="ts">
definePageMeta({ layout: 'student' })
useHead({ title: 'Question Bank · Passmed' })

// ─── Composables ─────────────────────────────────────────────────────────────
const { activeExam, examSwitching, fetchExams } = useExam()
const { openAdd: openSubscribe } = useSubscribeModal()
const studentApi = useStudentApi()
// fetchQuestions populates a shared totalQuestions ref via useState — we use
// it here to drive the "X available with current filters" counter and to cap
// the question-count picker. tutor.vue / timed.vue use the same source on
// session start so we never double-fetch.
const { fetchQuestions, fetchQbankInit, fetchQbankCount, fetchCategoryCounts, totalQuestions } = useSession()

// ─── Types ────────────────────────────────────────────────────────────────────
interface Sub { id: string; name: string; count: number; total?: number; unseen?: number; pct?: number }
interface Cat { id: string; name: string; count: number; total?: number; unseen?: number; pct: number; weak: boolean; subs: Sub[] }

// ─── Reactive state — populated from /qbank/init API ─────────────────────────
const taxonomy   = ref<Cat[]>([])
const famChips   = ref<{ id: string; label: string; count: number; color: string; on: boolean }[]>([
  { id:'unattempted', label:'Unattempted', count:0, color:'var(--ink-faint)', on:true },
  { id:'correct',     label:'Correct',     count:0, color:'var(--green)',     on:true },
  { id:'incorrect',   label:'Incorrect',   count:0, color:'var(--rose)',      on:true },
  { id:'flagged',     label:'Flagged',     count:0, color:'var(--amber)',     on:true },
])
const diffChips  = ref<{ id: string; label: string; count: number; color: string; on: boolean }[]>([
  { id:'foundation',   label:'Foundation',   count:0, color:'var(--green)', on:true },
  { id:'intermediate', label:'Intermediate', count:0, color:'var(--amber)', on:true },
  { id:'advanced',   label:'Advanced',   count:0, color:'var(--rose)',  on:true },
])

const sessionMode  = ref<'tutor' | 'timed'>('tutor')
const timerSec     = ref(60)
// qCount starts at 0; once the first /qbank/questions response lands, the
// watcher on totalQuestions seeds it via defaultQCount() so the chosen count
// always matches the active exam's pool.
const qCount       = ref(0)
const taxSearch    = ref('')
const openCats     = ref<Set<string>>(new Set())

// Live "available" count (server-computed when filters change). 0 until first init.
const availableCount = ref(0)

// Loading / error UI state
const loading = ref(false)
const error   = ref('')
const launching = ref(false)

// Taxonomy checked state: catId -> Set of checked subIds (rebuilt after fetch)
const taxState = ref<Record<string, Set<string>>>({})
// One-shot guard: a dashboard "Areas to Improve" tile deep-links here with
// ?topic_type&topic_id — preselect that single topic on the FIRST taxonomy load
// only, never on later exam-switch refetches.
let weakPreselectApplied = false

// ─── Subtitle = active exam name (was hardcoded "ABA Basic Boards") ──────────
const topbarSubtitle = computed(() => {
  const name = activeExam.value?.name && activeExam.value.name !== 'No exam selected'
    ? activeExam.value.name
    : '—'
  return `${name} · Build your session`
})

// NOTE: Future-proof API contract for a richer /qbank/init endpoint (not used
// today — the page currently relies on /qbank/questions via useSession for
// total_questions only). Kept here as documentation of what to expect when
// taxonomy / familiarity / difficulty endpoints are added on the backend:
//
//   GET /qbank/init → {
//     taxonomy:        [{ id, name, count, pct, weak, subs: [...] }],
//     familiarity:     { unattempted, correct, incorrect, flagged },
//     difficulty:      { easy, medium, hard },
//     total_available: <int>,
//     defaults:        { session_type, timer_sec, question_count }
//   }

// ─── Load data from backend (run on mount + when active exam changes) ────────
// Uses the /qbank/questions endpoint via useSession.fetchQuestions(). Its
// `total_questions` value powers the "available with current filters" count
// AND the maximum allowed for the question-count picker.
//
// Taxonomy, familiarity, and difficulty stay empty until those endpoints
// are added on the backend — the UI gracefully handles the empty state.
async function loadQbankData() {
  loading.value = true
  error.value = ''

  try {
    // GET /qbank/init — single call returns total_available, familiarity
    // counts, difficulty buckets, and taxonomy tree (all scoped to active
    // exam server-side via StudentActiveExamPortal).
    const data = await fetchQbankInit()

    if (!data) {
      error.value = 'Failed to load question bank.'
      return
    }

    // Total questions in this exam (drives the picker max + counter).
    availableCount.value      = data.total_available || 0
    totalQuestions.value      = data.total_available || 0

    // Familiarity chips — preserve any existing `on` state by id so user
    // selections don't get wiped on refetch.
    famChips.value = famChips.value.map(c => ({
      ...c,
      count: Number(data.familiarity?.[c.id] || 0),
    }))

    // Difficulty chips — same preserve-on pattern.
    const diffByid: Record<string, number> = {}
    for (const d of (data.difficulty || [])) diffByid[d.id] = Number(d.count || 0)
    diffChips.value = diffChips.value.map(c => ({
      ...c,
      count: diffByid[c.id] ?? 0,
    }))

    // Clear orphan taxState keys from the previous exam BEFORE rebuilding
    // taxonomy. Otherwise selecting categories in Exam B would still send
    // Exam A's category ids in the filter (because old Sets linger in the
    // map keyed by stale cat ids).
    taxState.value = {}

    // Taxonomy tree — map API shape to our local Cat[] shape.
    // `pct` = user's historical accuracy on this category (correct / attempted
    // × 100). `weak` = flag from backend (attempted ≥ 3 AND pct < 60).
    // `total`/`unseen` are the STATIC per-topic figures from init (total questions
    // and how many the student hasn't answered yet). `count` is separate: it's the
    // filter-aware badge that refreshLiveCount() overwrites — so we keep `total`
    // independent for the "unseen / total" display.
    taxonomy.value = (data.taxonomy || []).map((cat: any) => ({
      id:     String(cat.id),
      name:   cat.name || '',
      count:  Number(cat.count || 0),
      total:  Number(cat.count || 0),
      unseen: Number(cat.unseen ?? cat.count ?? 0),
      pct:    Number(cat.pct || 0),
      weak:   !!cat.weak,
      subs:  (cat.subs || []).map((s: any) => ({
        id:     String(s.id),
        name:   s.name || '',
        count:  Number(s.count || 0),
        total:  Number(s.count || 0),
        unseen: Number(s.unseen ?? s.count ?? 0),
        pct:    Number(s.pct || 0),
      })),
    }))

    // Reset taxonomy checked-state per category to "all selected" so the
    // counter on first load matches total_available.
    selectAllTax(true)

    // Deep-link from a dashboard weak-area tile: narrow the selection to just
    // that topic. Only once, on first load — an exam switch clears it back to all.
    if (!weakPreselectApplied && route.query.topic_id) {
      weakPreselectApplied = true
      preselectTopic(String(route.query.topic_type || 'category'), String(route.query.topic_id))
    }
  } catch (e: any) {
    error.value = e?.data?.msg || e?.message || 'Failed to load question bank.'
  } finally {
    loading.value         = false
    examSwitching.value   = false   // clear sidebar-set flag after our fetch
  }
}

// liveCountLoading = true while /qbank/count is in flight (debounced).
// Drives the skeleton over the counter + chip counts so the user sees that
// the filter change is being applied.
const liveCountLoading = ref(false)

// ─── Live counter — recompute available count when any filter changes ─────
// Posts the current filter state to /qbank/count and updates availableCount.
// Debounced 250ms so rapid chip toggles don't flood the API.
let countDebounce: ReturnType<typeof setTimeout> | null = null
async function refreshLiveCount() {
  if (countDebounce) clearTimeout(countDebounce)
  // Flip skeleton on IMMEDIATELY (before the 250ms debounce) so the UI
  // reflects the in-flight change as soon as the user clicks a chip.
  liveCountLoading.value = true
  countDebounce = setTimeout(async () => {
    try {
      const familiarity = famChips.value.filter(c => c.on).map(c => c.id)
      const difficulty  = diffChips.value.filter(c => c.on).map(c => c.id)

      // Collect selected category ids from taxState. A category counts as
      // "selected" if its set is non-empty (selectAllTax adds cat.id to
      // each set, so the set is empty when the user has unchecked it).
      const selectedCategories = taxonomy.value.filter(cat => {
        const set = taxState.value[cat.id]
        return set && set.size > 0
      })
      // A tree row is either a subject WITH categories (selection carries its
      // category ids) or a childless subject (whose questions have no category at
      // all, so it can only be matched by subject id). Split them — sending a
      // subject id as a category id matched nothing and zeroed the count.
      const categoryIds: number[] = []
      const subjectIds:  number[] = []
      for (const cat of selectedCategories) {
        if (cat.subs.length) {
          for (const c of taxState.value[cat.id]) categoryIds.push(Number(c))
        } else {
          subjectIds.push(Number(cat.id))
        }
      }

      // "All selected" → omit the param entirely so backend returns the
      // unfiltered pool. Otherwise the count would erroneously narrow to
      // only the categories that happen to have category_id populated —
      // making 2,200 questions look like 3 in the counter.
      const allCategoriesSelected = selectedCategories.length === taxonomy.value.length
      const noneSelected = categoryIds.length === 0 && subjectIds.length === 0
      const next = await fetchQbankCount({
        familiarity: familiarity.length === famChips.value.length ? [] : familiarity,
        difficulty:  difficulty.length  === diffChips.value.length ? [] : difficulty,
        categoryIds: (allCategoriesSelected || noneSelected) ? undefined : categoryIds,
        subjectIds:  (allCategoriesSelected || noneSelected) ? undefined : subjectIds,
      })
      availableCount.value = next

      // ── Per-category counts (filter-aware): ONE grouped call returns every
      // topic's count under the current difficulty + familiarity (replaces the
      // old per-category Promise.all — one request per category — that made the
      // badges load slowly). Each row's badge is summed from the returned map:
      // a subject-with-children sums its categories' 'c:' entries; a childless
      // subject reads its 's:' entry.
      const famParam  = familiarity.length === famChips.value.length ? [] : familiarity
      const diffParam = difficulty.length  === diffChips.value.length ? [] : difficulty
      const groupCounts = await fetchCategoryCounts({ familiarity: famParam, difficulty: diffParam })
      for (const cat of taxonomy.value) {
        if (cat.subs.length) {
          // Filter-aware count per sub-category (from the grouped map), parent = sum.
          let sum = 0
          for (const s of cat.subs) {
            const c = Number(groupCounts['c:' + s.id]) || 0
            s.count = c
            sum += c
          }
          cat.count = sum
        } else {
          cat.count = Number(groupCounts['s:' + cat.id]) || 0
        }
      }
    } finally {
      liveCountLoading.value = false
    }
  }, 250)
}

// React to chip / taxonomy toggles.
watch([famChips, diffChips, taxState], refreshLiveCount, { deep: true })

// First load + auto-refetch when active exam changes mid-page.
onMounted(loadQbankData)

// "Practice flagged" entry point (from Flagged Questions → onPracticeFlagged):
// arriving with ?source=flagged narrows the pool to flagged questions only by
// turning every familiarity chip off except 'Flagged'. The existing filter
// pipeline (count + session create) then builds a flagged-only session.
const route = useRoute()
onMounted(() => {
  if (route.query.source === 'flagged') {
    famChips.value = famChips.value.map(c => ({ ...c, on: c.id === 'flagged' }))
  }
  // Pull fresh exam data so the free-trial balance is current when returning to
  // the qbank after finishing a session (which consumed part of the 50 pool).
  try { fetchExams(true) } catch {}
})

// Cancel any pending live-count debounce when the page unmounts —
// otherwise a stale setTimeout would fire a /qbank/count API call on a
// component that's already gone (wasted bytes + console warnings).
onBeforeUnmount(() => {
  if (countDebounce) clearTimeout(countDebounce)
})

// `immediate: false` ensures we don't double-fire alongside onMounted. The
// check uses examId (the real exams.id, an integer) — when the user picks a
// different exam from the sidebar, this value changes and we refetch.
watch(() => activeExam.value?.examId, (newId, oldId) => {
  if (!newId) return
  if (newId === oldId) return
  loadQbankData()
})

// Build a filter snapshot. Used by launchSession() so the chosen filters
// can be passed to the session page in the future (currently only count + mode
// are passed via query string; full filter wiring needs a backend endpoint).
function selectedFilters() {
  return {
    familiarity: famChips.value.filter(c => c.on).map(c => c.id),
    difficulty:  diffChips.value.filter(c => c.on).map(c => c.id),
    categories:  Object.entries(taxState.value)
      .filter(([, subs]) => subs.size > 0)
      .map(([catId, subs]) => ({
        category_id: catId,
        sub_ids: Array.from(subs),
      })),
  }
}

// NOTE: /qbank/count-available endpoint is not implemented yet on the backend.
// The "X available with current filters" number reflects total_questions for
// the active exam only — it does not yet narrow with filter selections.

// ─── Computed ─────────────────────────────────────────────────────────────────
// NOTE: `taxonomy` is now a ref (was a const array before refactor) — every
// access inside script needs `.value`. The Vue template auto-unwraps, but
// computed/methods do not.
const filteredTaxonomy = computed(() => {
  const fl = taxSearch.value.toLowerCase()
  if (!fl) return taxonomy.value
  return taxonomy.value
    .map(cat => ({
      ...cat,
      subs: cat.subs.filter(s => s.name.toLowerCase().includes(fl)),
      matchCat: cat.name.toLowerCase().includes(fl),
    }))
    .filter(cat => cat.matchCat || cat.subs.length > 0)
})

const selectedCatsCount = computed(() =>
  taxonomy.value.filter(cat => (taxState.value[cat.id]?.size ?? 0) > 0).length
)

const taxLabel = computed(() => {
  if (selectedCatsCount.value === taxonomy.value.length) return 'All categories'
  if (selectedCatsCount.value === 0) return 'None'
  return `${selectedCatsCount.value} / ${taxonomy.value.length} categories`
})

const taxSelectedLabel = computed(() => {
  if (selectedCatsCount.value === taxonomy.value.length) return 'All categories selected'
  if (selectedCatsCount.value === 0) return 'No categories selected'
  return `${selectedCatsCount.value} of ${taxonomy.value.length} categories selected`
})

const lsMode = computed(() => {
  if (sessionMode.value === 'timed') return `Timed · ${timerSec.value}s/Q`
  return 'Tutor'
})

const lsFam = computed(() => {
  const on = famChips.value.filter(c => c.on).map(c => c.label)
  if (on.length === 4) return 'All'
  if (on.length === 0) return 'None'
  return on.join(', ')
})

const lsDiff = computed(() => {
  const on = diffChips.value.filter(c => c.on).map(c => c.label)
  if (on.length === 3) return 'All levels'
  if (on.length === 0) return 'None'
  return on.join(', ')
})

const timerTotalLabel = computed(() => {
  const mins = Math.round(qCount.value * timerSec.value / 60)
  return `${qCount.value} Q × ${timerSec.value}s = ${mins} min total`
})

// ─── Methods ─────────────────────────────────────────────────────────────────
function toggleCatOpen(catId: string) {
  if (openCats.value.has(catId)) openCats.value.delete(catId)
  else openCats.value.add(catId)
  openCats.value = new Set(openCats.value) // trigger reactivity
}

// Row click: categories with sub-topics drill in (expand); leaf categories
// toggle their own selection. (Mirrors the +/− vs checkbox affordance.)
function onCatRowClick(cat: Cat) {
  if (cat.subs.length) toggleCatOpen(cat.id)
  else toggleCat(cat.id)
}

function getCatCheckState(cat: Cat): 'checked' | 'partial' | '' {
  const set  = taxState.value[cat.id]
  const size = set?.size ?? 0
  if (size === 0) return ''

  // Category-as-leaf (no subs): checked when the cat's own id is in its set.
  if (cat.subs.length === 0) {
    return set!.has(cat.id) ? 'checked' : ''
  }
  // Legacy sub-topic mode (kept for forward-compat if subs come back).
  if (size === cat.subs.length) return 'checked'
  return 'partial'
}

function toggleCat(catId: string) {
  const cat = taxonomy.value.find(c => c.id === catId)
  if (!cat) return
  if (!taxState.value[catId]) taxState.value[catId] = new Set()
  const state = taxState.value[catId]

  if (cat.subs.length === 0) {
    // Category-as-leaf: flip its own id in/out of the set.
    if (state.has(cat.id)) state.delete(cat.id)
    else state.add(cat.id)
  } else {
    // Legacy: toggle all subs in/out.
    if (state.size === cat.subs.length) state.clear()
    else cat.subs.forEach(s => state.add(s.id))
  }
  taxState.value = { ...taxState.value }
}

function toggleSub(catId: string, subId: string) {
  const state = taxState.value[catId]
  if (!state) return
  if (state.has(subId)) state.delete(subId)
  else state.add(subId)
  taxState.value = { ...taxState.value }
}

function selectAllTax(val: boolean) {
  taxonomy.value.forEach(cat => {
    if (!taxState.value[cat.id]) taxState.value[cat.id] = new Set()
    if (val) {
      // Categories are now leaf nodes (no sub-topics) — represent "category
      // selected" by adding its own id to its set. Sub-topics, if ever
      // present, are still added too for forward-compat.
      taxState.value[cat.id].add(cat.id)
      cat.subs.forEach(s => taxState.value[cat.id].add(s.id))
    } else {
      taxState.value[cat.id].clear()
    }
  })
  taxState.value = { ...taxState.value }
}

// Narrow the taxonomy selection to a single weak topic (deep-linked from the
// dashboard). `type` is 'category' | 'subject', `id` the numeric topic id.
// Handles both shapes: a category that lives as a SUB under a parent row, and a
// flat top-level row (categories are currently leaf nodes). If the topic isn't
// in this exam's taxonomy, falls back to all-selected so the user still lands on
// a usable qbank rather than an empty selection.
function preselectTopic(type: string, id: string) {
  const target = String(id)
  taxonomy.value.forEach(cat => { taxState.value[cat.id] = new Set() })

  let matched = false
  if (type === 'subject') {
    for (const cat of taxonomy.value) {
      if (String(cat.id) === target) {
        const set = new Set<string>([String(cat.id)])
        cat.subs.forEach(s => set.add(String(s.id)))
        taxState.value[cat.id] = set
        matched = true
        break
      }
    }
  } else { // 'category'
    for (const cat of taxonomy.value) {
      if (cat.subs.some(s => String(s.id) === target)) {
        taxState.value[cat.id] = new Set([target])
        matched = true
        break
      }
      if (String(cat.id) === target) {
        taxState.value[cat.id] = new Set([target])
        matched = true
        break
      }
    }
  }

  if (!matched) { selectAllTax(true); return }
  taxState.value = { ...taxState.value }
}

// ── Toast feedback (lightweight, bottom-center, auto-dismiss) ────────────────
const toast = ref<{ msg: string; kind: 'ok' | 'err' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(msg: string, kind: 'ok' | 'err' = 'ok') {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { msg, kind }
  toastTimer = setTimeout(() => { toast.value = null }, 2800)
}

function selectWeakOnly() {
  let weakCount = 0
  taxonomy.value.forEach(cat => {
    if (!taxState.value[cat.id]) taxState.value[cat.id] = new Set()
    taxState.value[cat.id].clear()
    if (cat.weak) {
      taxState.value[cat.id].add(cat.id)   // mark category selected (matches selectAllTax)
      cat.subs.forEach(s => taxState.value[cat.id].add(s.id))
      weakCount++
    }
  })
  taxState.value = { ...taxState.value }
  if (weakCount > 0) showToast(`Selected ${weakCount} weak topic${weakCount === 1 ? '' : 's'}`, 'ok')
  else showToast('No weak topics yet — keep practicing!', 'err')
}

// Hard cap on questions per session. Sessions larger than this loaded too
// slowly (and the navigator/scoring got unwieldy), so 200 is the ceiling
// regardless of how many the exam has available. Enforced server-side too.
const SESSION_CAP = 200

// Free-trial accounts are limited to 50 questions per session. A trial is
// student_exams.plan === '0' (see backend register flow); paid plans are
// 1/3/6/12 months and institute exams have a null plan. Enforced server-side
// too — this is just the UX ceiling + upsell.
const TRIAL_CAP   = 50
const isFreeTrial = computed(() => activeExam.value?.plan === '0')

// Free-trial is a POOL of 50 questions per exam, spent across any number of
// sessions/modes. trialLeft is what remains (from the server); the session
// ceiling for a trial user is that remaining balance (never more than 50).
const trialLeft = computed<number | null>(() =>
  isFreeTrial.value ? Math.max(0, activeExam.value?.trialRemaining ?? TRIAL_CAP) : null
)

// The active ceiling: remaining trial balance for trial users, 200 otherwise.
const effectiveCap = computed(() =>
  isFreeTrial.value ? Math.min(TRIAL_CAP, trialLeft.value ?? TRIAL_CAP) : SESSION_CAP
)

// Effective max — the smaller of the active cap and what the exam actually has
// (e.g. 2211). Falls back to the cap while totalQuestions loads.
function maxQCount() {
  const poolMax = totalQuestions.value > 0 ? totalQuestions.value : effectiveCap.value
  return Math.min(effectiveCap.value, poolMax)
}

// Available pool clamped to the active cap — used for the presets and the
// "use everything" button so they never offer more than a session can hold.
const cappedAvailable = computed(() => Math.min(availableCount.value, effectiveCap.value))

// Dynamic preset list. Base steps are sane "round" numbers for session length;
// each one only shows up if it fits the current exam's available pool. So a
// 30-question exam shows [10, 20], a 250-question exam shows [10, 20, 40,
// 80, 120, 200], and so on.
// Steps above SESSION_CAP (500, 1000) are kept in the list but filtered out
// below by the cap, so the presets never exceed 200.
const PRESET_STEPS = [10, 20, 40, 80, 120, 200, 500, 1000]
const presetCounts = computed(() => {
  const max = cappedAvailable.value
  if (max <= 0) return []
  return PRESET_STEPS.filter(n => n <= max)
})

// Smart default — picks a "starting bunch" based on what's actually
// available, instead of always landing on 40. Triggered by the watcher on
// totalQuestions below whenever the active exam changes.
function defaultQCount(available: number): number {
  let picked: number
  if (available <= 0)        picked = 0
  else if (available < 10)   picked = available     // tiny pool — take everything
  else if (available < 20)   picked = 10
  else if (available < 40)   picked = 20
  else if (available < 120)  picked = 40
  else if (available < 500)  picked = 80
  else if (available < 1000) picked = 120
  else                       picked = 200           // big pool — sensible starter
  // Never default above the active ceiling (50 on free trial, 200 otherwise).
  return Math.min(effectiveCap.value, picked)
}

// Briefly highlight the trial note when a trial user tries to pick > 50, so the
// clamp doesn't feel silent. Auto-clears after ~1.2s.
const trialNudge = ref(false)
let trialNudgeTimer: ReturnType<typeof setTimeout> | null = null
function flashTrialNote() {
  if (!isFreeTrial.value) return
  trialNudge.value = true
  if (trialNudgeTimer) clearTimeout(trialNudgeTimer)
  trialNudgeTimer = setTimeout(() => { trialNudge.value = false }, 1200)
}

function adjustCount(delta: number) {
  if (maxQCount() <= 0) return
  if (isFreeTrial.value && qCount.value + delta > effectiveCap.value) flashTrialNote()
  qCount.value = Math.max(1, Math.min(maxQCount(), qCount.value + delta))
}

function setCount(n: number) {
  if (maxQCount() <= 0) return
  if (isFreeTrial.value && n > effectiveCap.value) flashTrialNote()
  qCount.value = Math.max(1, Math.min(maxQCount(), n))
}

// Re-pick a sensible default each time the active-exam's total changes.
// Without this, qCount sticks at whatever was set for the previous exam
// (e.g. 200 from ABA Basic carries over to a 30-question Neurology Shelf).
watch(() => totalQuestions.value, (newTotal) => {
  qCount.value = defaultQCount(newTotal)
}, { immediate: false })

// Availability change strategy:
//   • EXAM switch  → re-pick default via the totalQuestions watcher above.
//   • Filter toggle → only clamp DOWN if qCount exceeds new pool. This
//     preserves the user's manual selection across filter tweaks and avoids
//     the "transient 0 → user gets stuck at 0" bug where a quick chip
//     double-tap briefly drops availableCount to 0 and pins qCount there.
watch(() => availableCount.value, (avail) => {
  if (avail === 0) return                          // transient/empty — don't clobber
  if (qCount.value === 0) qCount.value = defaultQCount(avail)
  else if (qCount.value > avail) qCount.value = defaultQCount(avail)
}, { immediate: false })

// Safety: when the ceiling shrinks (e.g. switching from a paid exam to a
// free-trial one), clamp an existing higher selection straight down to the cap.
watch(effectiveCap, (cap) => {
  if (qCount.value > cap) qCount.value = Math.max(1, Math.min(maxQCount(), cap))
})

function adjustTimer(delta: number) {
  timerSec.value = Math.max(10, Math.min(300, timerSec.value + delta))
}

function setTimer(s: number) { timerSec.value = s }

function getPctColor(pct: number) {
  if (pct >= 70) return 'var(--green)'
  if (pct >= 60) return 'var(--amber)'
  return 'var(--rose)'
}

function resetAll() {
  sessionMode.value = 'tutor'
  timerSec.value = 60
  // Reset to a sensible default for the *current* exam's pool — not a
  // hardcoded 40 (which could exceed a small exam's available count).
  qCount.value = defaultQCount(availableCount.value)
  famChips.value.forEach(c => c.on = true)
  diffChips.value.forEach(c => c.on = true)
  selectAllTax(true)
  taxSearch.value = ''
}

async function launchSession() {
  if (launching.value) return
  if (availableCount.value === 0) {
    error.value = 'No questions match the current filters. Adjust filters and try again.'
    return
  }

  launching.value = true
  error.value = ''

  try {
    // 1) Persist chosen per-question timer in shared session state.
    const session = useSession()
    session.timerPerQ.value = sessionMode.value === 'timed' ? timerSec.value : 90

    // 2) Resolve active exam id with strict numeric validation. `examId`
    //    can be '' (empty string from mapApiItem fallback) which would
    //    coerce to 0 via Number(''), passing a falsy check but causing
    //    backend to receive exam_id=0 → wrong session attribution.
    const rawExamId = activeExam.value?.examId
    const examIdNum = typeof rawExamId === 'number' ? rawExamId : Number(rawExamId)
    const examId    = Number.isFinite(examIdNum) && examIdNum > 0 ? examIdNum : undefined

    // Institution Q Bank (pool) has no numeric exam id — it's a source, not an exam.
    // Launch against the pool via its institutionId + scope instead of requiring examId.
    const isPool = activeExam.value?.source === 'institution'
    const institutionId = isPool ? (Number(activeExam.value?.institutionId) || undefined) : undefined

    if (!examId && !(isPool && institutionId)) {
      error.value = 'No active exam selected. Please pick an exam from the sidebar.'
      launching.value = false
      return
    }
    const familiarity = famChips.value.filter(c => c.on).map(c => c.id)
    const difficulty  = diffChips.value.filter(c => c.on).map(c => c.id)
    const selectedCategories = taxonomy.value.filter(cat => {
      const set = taxState.value[cat.id]
      return set && set.size > 0
    })
    // Split EXACTLY like refreshLiveCount(): a row with sub-categories contributes
    // its category ids; a CHILDLESS subject (questions have no category_id) can only
    // be matched by its subject id. Previously launch pushed the subject id into
    // categoryIds and sent no subjectIds — so the backend filtered category_id IN
    // (subjectId), matched nothing, and returned 0 → "Could not load any questions."
    const categoryIds: number[] = []
    const subjectIds:  number[] = []
    for (const cat of selectedCategories) {
      if (cat.subs.length) {
        for (const c of taxState.value[cat.id]) categoryIds.push(Number(c))
      } else {
        subjectIds.push(Number(cat.id))
      }
    }
    const allCategoriesSelected = selectedCategories.length === taxonomy.value.length
    const noneSelected = categoryIds.length === 0 && subjectIds.length === 0

    await session.fetchQuestions({
      limit:       qCount.value,
      examId,
      // Send arrays only when partial selection — if user picked "all" we
      // omit the param so backend treats it as no-filter (matches counter).
      familiarity: familiarity.length === famChips.value.length ? undefined : familiarity,
      difficulty:  difficulty.length  === diffChips.value.length ? undefined : difficulty,
      categoryIds: (allCategoriesSelected || noneSelected) ? undefined : categoryIds,
      subjectIds:  (allCategoriesSelected || noneSelected) ? undefined : subjectIds,
      resetState:  true,
    })

    if (!session.questions.value.length) {
      error.value = 'Could not load any questions for this exam. Try again.'
      launching.value = false
      return
    }

    // 3) Create the backend session row + per-question rows.
    const sid = await session.createBackendSession({
      examId,
      institutionId: isPool ? institutionId : undefined,
      scope: isPool ? 'institution' : 'exam',
      mode:   sessionMode.value as 'tutor' | 'timed',
      timerPerQ: sessionMode.value === 'timed' ? timerSec.value : undefined,
    })

    // Free-trial gate — the 50-question pool is spent (server returns trial_used).
    const block = session.trialBlock.value
    if (block) {
      launching.value = false
      if (block.kind === 'resume' && block.sessionId) {
        // Legacy path: resume an in-progress session if the server points to one.
        const p = block.mode === 'timed' ? '/student/timed' : '/student/tutor'
        navigateTo({ path: p, query: { session: String(block.sessionId), mode: block.mode || 'tutor' } })
        return
      }
      // trial_used → the whole 50-question pool is spent; explain and open checkout.
      error.value = block.msg || 'You’ve used all your free trial questions. Subscribe to unlock the full question bank.'
      openSubscribe()
      return
    }

    // Refresh the exam list so the trial balance (trialRemaining) updates in the
    // UI after this session consumed part of the pool.
    if (isFreeTrial.value) { try { await fetchExams(true) } catch {} }

    // 4) Navigate to the runner. session id rides in the URL so tutor/timed
    //    know which session to PATCH on every change.
    const path = sessionMode.value === 'timed' ? '/student/timed' : '/student/tutor'
    navigateTo({
      path,
      query: {
        session: sid ? String(sid) : undefined,
        count:   String(qCount.value),
        mode:    sessionMode.value,
      },
    })
  } catch (e: any) {
    error.value = e?.data?.msg || e?.message || 'Failed to start the session.'
    launching.value = false
  }
}
</script>

<template>
  <!-- Topbar — during initial load swap to a shimmer band so the whole page
       (topbar + content) reads as one unified skeleton. -->
  <div v-if="loading || examSwitching" class="qb-sk-topbar">
    <div class="qb-sk-pulse" style="width:160px;height:18px;border-radius:4px"></div>
    <div class="qb-sk-pulse" style="width:240px;height:11px;border-radius:4px;margin-top:6px"></div>
  </div>
  <StudentTopbar v-else title="Question Bank" />

  <div class="qb-builder-wrap">
    <div class="content">

      <!-- Inline error banner — shows API errors or "no questions match filters" -->
      <div v-if="error" class="qbank-error">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {{ error }}
      </div>

      <!-- Loading skeleton — full page coverage: header, builder rows
           (Session Type/Timer + Familiarity/Difficulty + Topics + Count).
           Only shows on the initial fetch; later refetches keep prior data. -->
      <template v-if="loading || examSwitching">
        <!-- Page header (title + counter badge) -->
        <div class="qb-sk-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px">
          <div>
            <div class="qb-sk-pulse" style="width:200px;height:22px;border-radius:6px"></div>
            <div class="qb-sk-pulse" style="width:340px;height:11px;border-radius:4px;margin-top:8px"></div>
          </div>
          <div class="qb-sk-pulse" style="width:200px;height:64px;border-radius:10px"></div>
        </div>
        <!-- Row 1: Session Type + Timer cards -->
        <div class="qb-sk-builder">
          <div v-for="i in 2" :key="`qb-sk-r1-${i}`" class="qb-sk-card">
            <div class="qb-sk-pulse" style="width:140px;height:14px;border-radius:4px"></div>
            <div class="qb-sk-pulse" style="width:200px;height:10px;border-radius:4px;margin-top:8px"></div>
            <div style="display:flex;gap:10px;margin-top:18px">
              <div class="qb-sk-pulse" style="flex:1;height:64px;border-radius:8px"></div>
              <div class="qb-sk-pulse" style="flex:1;height:64px;border-radius:8px"></div>
            </div>
          </div>
        </div>
        <!-- Row 2: Familiarity + Difficulty cards -->
        <div class="qb-sk-builder">
          <div v-for="i in 2" :key="`qb-sk-r2-${i}`" class="qb-sk-card">
            <div class="qb-sk-pulse" style="width:140px;height:14px;border-radius:4px"></div>
            <div class="qb-sk-pulse" style="width:240px;height:10px;border-radius:4px;margin-top:8px"></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
              <div v-for="c in 4" :key="c" class="qb-sk-pulse" style="width:110px;height:32px;border-radius:14px"></div>
            </div>
          </div>
        </div>
        <!-- Row 3: Topics (big card) -->
        <div class="qb-sk-card">
          <div class="qb-sk-pulse" style="width:140px;height:14px;border-radius:4px"></div>
          <div class="qb-sk-pulse" style="width:280px;height:10px;border-radius:4px;margin-top:8px"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
            <div v-for="t in 12" :key="t" class="qb-sk-pulse" style="width:140px;height:28px;border-radius:6px"></div>
          </div>
        </div>
        <!-- Row 4: Question count card -->
        <div class="qb-sk-card">
          <div class="qb-sk-pulse" style="width:160px;height:14px;border-radius:4px"></div>
          <div class="qb-sk-pulse" style="width:100%;height:46px;border-radius:8px;margin-top:14px"></div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <div v-for="p in 5" :key="p" class="qb-sk-pulse" style="width:64px;height:28px;border-radius:6px"></div>
          </div>
        </div>
      </template>

      <!-- Real page content — hidden while the skeleton above is showing. -->
      <template v-else>

      <!-- PAGE HEADER -->
      <div class="page-header fi d1">
        <div>
          <div class="page-title">Build a Session</div>
          <div class="page-sub">Configure your filters, then launch. Questions will be drawn from your selection.</div>
        </div>
        <div class="q-counter" :class="{ 'q-counter-busy': liveCountLoading }">
          <span class="q-counter-num">
            <!-- During liveCountLoading, both the qCount AND the total
                 swap to shimmer placeholders — because the count will be
                 re-picked once availableCount updates, so the previously
                 shown value is stale. -->
            <template v-if="liveCountLoading">
              <span class="qb-sk-pulse" style="width:42px;height:0.85em;display:inline-block;vertical-align:middle;border-radius:4px"></span>
            </template>
            <template v-else>{{ qCount }}</template>
            <span class="q-counter-divider" v-if="availableCount > 0 || liveCountLoading"> /
              <template v-if="liveCountLoading">
                <span class="q-counter-sk qb-sk-pulse" style="width:60px;height:0.85em;display:inline-block;vertical-align:middle;border-radius:4px"></span>
              </template>
              <template v-else>{{ availableCount.toLocaleString() }}</template>
            </span>
          </span>
          <div>
            <div class="q-counter-lbl">questions selected</div>
            <div class="q-counter-total">
              out of
              <template v-if="liveCountLoading">
                <span class="qb-sk-pulse" style="width:50px;height:0.7em;display:inline-block;vertical-align:middle;border-radius:3px;margin:0 4px"></span>
              </template>
              <template v-else>{{ availableCount.toLocaleString() }}</template>
              total for {{ activeExam.name }}
            </div>
          </div>
        </div>
      </div>

      <!-- ROW 1: Session Type + Timer -->
      <div class="builder fi d1">

        <!-- SESSION TYPE -->
        <div class="sec-card">
          <div class="sec-head">
            <div class="sec-icon sec-icon-teal">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div>
              <div class="sec-title">Session Type</div>
              <div class="sec-sub">How questions are paced</div>
            </div>
          </div>
          <div class="mode-grid">
            <button type="button" class="mode-card tutor" :class="{ selected: sessionMode === 'tutor' }" @click="sessionMode = 'tutor'" :aria-pressed="sessionMode === 'tutor'">
              <div class="mode-name">Tutor Mode</div>
              <div class="mode-desc">Work through questions at your own pace with no time pressure</div>
              <div class="mode-badge badge-teal">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Self-paced
              </div>
            </button>
            <button type="button" class="mode-card timed" :class="{ selected: sessionMode === 'timed' }" @click="sessionMode = 'timed'" :aria-pressed="sessionMode === 'timed'">
              <div class="mode-name">Timed Mode</div>
              <div class="mode-desc">Countdown timer per question — matches real exam pressure</div>
              <div class="mode-badge badge-amber">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {{ timerSec }}s / Q
              </div>
            </button>
          </div>
        </div>

        <!-- TIME PER QUESTION -->
        <div class="sec-card">
          <div class="sec-head">
            <div class="sec-icon" style="background:var(--yellow-pale);color:var(--yellow-mid)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div>
              <div class="sec-title">Time per Question</div>
              <div class="sec-sub">Only applies in Timed Mode</div>
            </div>
          </div>
          <div class="timer-panel" :class="sessionMode === 'timed' ? 'active' : 'inactive'">
            <div class="timer-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--yellow-mid)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span class="timer-label-txt">Countdown timer</span>
              <span class="timer-label-sub">{{ timerTotalLabel }}</span>
            </div>
            <div class="timer-display">
              <button type="button" class="timer-btn" @click="adjustTimer(-10)">−</button>
              <div class="timer-val-wrap">
                <div class="timer-val">{{ timerSec }}</div>
                <div class="timer-unit">seconds per question</div>
              </div>
              <button type="button" class="timer-btn" @click="adjustTimer(10)">+</button>
            </div>
            <div class="timer-presets">
              <div v-for="s in [30,40,50,60,90,120]" :key="s"
                class="timer-preset" :class="{ on: timerSec === s }"
                @click="setTimer(s)">
                {{ s >= 60 ? s/60 + ' min' : s + 's' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ROW 2: Familiarity + Difficulty -->
      <div class="builder fi d2">

        <!-- FAMILIARITY -->
        <div class="sec-card">
          <div class="sec-head">
            <div class="sec-icon sec-icon-amber">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div>
              <div class="sec-title">Familiarity</div>
              <div class="sec-sub">Filter by your history with these questions</div>
            </div>
          </div>
          <div class="chip-row">
            <div v-for="chip in famChips" :key="chip.id"
              class="chip" :class="{ on: chip.on }"
              @click="chip.on = !chip.on">
              <div class="chip-dot" :style="{ background: chip.color }"></div>
              {{ chip.label }}
              <span class="chip-count">{{ chip.count.toLocaleString() }}</span>
            </div>
          </div>
        </div>

        <!-- DIFFICULTY -->
        <div class="sec-card">
          <div class="sec-head">
            <div class="sec-icon sec-icon-rose">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </div>
            <div>
              <div class="sec-title">Difficulty</div>
              <div class="sec-sub">Based on peer performance data</div>
            </div>
          </div>
          <div class="chip-row">
            <div v-for="chip in diffChips" :key="chip.id"
              class="chip" :class="{ on: chip.on }"
              @click="chip.on = !chip.on">
              <div class="chip-dot" :style="{ background: chip.color }"></div>
              {{ chip.label }}
              <span class="chip-count">{{ chip.count.toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ROW 3: Taxonomy -->
      <div class="builder-full fi d3">
        <div class="sec-card">
          <div class="sec-head">
            <div class="sec-icon sec-icon-ink">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            </div>
            <div style="flex:1">
              <div class="sec-title">Taxonomy — Categories &amp; Specialties</div>
              <div class="sec-sub">Select topics to include in this session</div>
            </div>
            <span style="font-size:0.68rem;color:var(--ink-faint);font-weight:500">{{ taxSelectedLabel }}</span>
          </div>

          <input class="tax-search" type="text" placeholder="Search topics, specialties…"
            v-model="taxSearch" />

          <div class="tax-actions">
            <span class="tax-link" role="button" tabindex="0" @click="selectAllTax(true)" @keydown.enter="selectAllTax(true)" @keydown.space.prevent="selectAllTax(true)">Select all</span>
            <span class="tax-divider" aria-hidden="true">·</span>
            <span class="tax-link" role="button" tabindex="0" @click="selectAllTax(false)" @keydown.enter="selectAllTax(false)" @keydown.space.prevent="selectAllTax(false)">Deselect all</span>
            <span class="tax-divider" aria-hidden="true">·</span>
            <span class="tax-link" role="button" tabindex="0" @click="selectWeakOnly" @keydown.enter="selectWeakOnly" @keydown.space.prevent="selectWeakOnly">Select my weak topics</span>
          </div>

          <div class="tax-tree">
            <div v-for="cat in filteredTaxonomy" :key="cat.id">
              <div class="cat-row" role="button" tabindex="0" @click="onCatRowClick(cat)" @keydown.enter="onCatRowClick(cat)" @keydown.space.prevent="onCatRowClick(cat)" :aria-expanded="cat.subs.length ? openCats.has(cat.id) : undefined">
                <!-- Categories WITH sub-topics drill in via a +/− affordance
                     (their selection is driven by the sub-rows). Leaf categories
                     keep a select-state checkbox. -->
                <button v-if="cat.subs.length" type="button" class="cat-expand"
                  :class="{ open: openCats.has(cat.id) }"
                  :aria-label="(openCats.has(cat.id) ? 'Collapse ' : 'Expand ') + cat.name"
                  @click.stop="toggleCatOpen(cat.id)">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <line v-if="!openCats.has(cat.id)" x1="12" y1="5" x2="12" y2="19"/>
                  </svg>
                </button>
                <div v-else class="cb" :class="getCatCheckState(cat)"
                  @click.stop="toggleCat(cat.id)"></div>
                <span class="cat-name">{{ cat.name }}</span>
                <span class="cat-pct"
                  :style="{ background: getPctColor(cat.pct) + '22', color: getPctColor(cat.pct) }">
                  {{ cat.pct }}%
                </span>
                <span class="cat-unseen" :title="(cat.unseen ?? cat.total) + ' unseen of ' + cat.total">{{ cat.unseen ?? cat.total }}/{{ cat.total }}</span>
                <span class="cat-count" title="Questions matching the current filters">{{ cat.count }}q</span>
              </div>
              <div class="sub-list" :class="{ open: openCats.has(cat.id) }">
                <div v-for="sub in cat.subs" :key="sub.id"
                  class="sub-row" @click="toggleSub(cat.id, sub.id)">
                  <div style="width:10px;flex-shrink:0"></div>
                  <div class="cb" :class="taxState[cat.id]?.has(sub.id) ? 'checked' : ''"></div>
                  <span class="sub-name">{{ sub.name }}</span>
                  <span v-if="sub.pct !== undefined" class="cat-pct"
                    :style="{ background: getPctColor(sub.pct) + '22', color: getPctColor(sub.pct) }">{{ sub.pct }}%</span>
                  <span class="cat-unseen" :title="(sub.unseen ?? sub.total) + ' unseen of ' + sub.total">{{ sub.unseen ?? sub.total }}/{{ sub.total }}</span>
                  <span class="sub-count">{{ sub.count }}q</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ROW 4: Question Count -->
      <div class="builder-full fi d4">
        <div class="sec-card">
          <div class="sec-head">
            <div class="sec-icon sec-icon-teal">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </div>
            <div>
              <div class="sec-title">Question Count</div>
              <div class="sec-sub">How many questions in this session</div>
            </div>
          </div>
          <div class="count-row">
            <div class="count-input-wrap" :class="{ disabled: availableCount === 0 }">
              <button type="button" class="count-btn" :disabled="availableCount === 0" @click="adjustCount(-5)">−</button>
              <!-- Editable input so the user can jump directly to e.g. 850
                   instead of clicking + thirty times. Clamped to maxQCount()
                   on blur via setCount. -->
              <input
                type="number"
                class="count-val count-val-input"
                :min="availableCount === 0 ? 0 : 1"
                :max="maxQCount()"
                :value="qCount"
                :disabled="availableCount === 0"
                @change="setCount(parseInt(($event.target as HTMLInputElement).value) || 1)"
              />
              <button type="button" class="count-btn" :disabled="availableCount === 0" @click="adjustCount(5)">+</button>
            </div>
            <!-- Presets are computed (presetCounts) from the live available
                 count — they appear and disappear as the active exam changes.
                 When the exam has 0 questions, no presets render and a
                 dedicated "0 questions available" hint takes their place. -->
            <div class="count-presets" v-if="availableCount > 0">
              <div
                v-for="n in presetCounts"
                :key="n"
                class="count-preset" :class="{ on: qCount === n }"
                @click="setCount(n)"
              >{{ n.toLocaleString() }}</div>
              <!-- "All"/"Max" preset = take as many as a session allows. When
                   the pool fits under the cap it reads "All (N)"; when the pool
                   is larger than the 200 cap it reads "Max (200)". Hidden when a
                   numbered preset already matches the capped value. -->
              <div
                v-if="!presetCounts.includes(cappedAvailable)"
                class="count-preset" :class="{ on: qCount === cappedAvailable }"
                @click="setCount(cappedAvailable)"
              >{{ availableCount > effectiveCap ? `Max (${effectiveCap})` : `All (${cappedAvailable.toLocaleString()})` }}</div>
            </div>
            <div v-else class="count-presets count-presets-empty">
              <span class="count-empty-msg">0 questions available for this exam</span>
            </div>
            <div class="count-max" :class="{ 'count-max-zero': !liveCountLoading && availableCount === 0 }">
              Max:
              <template v-if="liveCountLoading">
                <span class="qb-sk-pulse" style="width:42px;height:0.7em;display:inline-block;vertical-align:middle;border-radius:3px;margin:0 4px"></span>
              </template>
              <template v-else>{{ availableCount.toLocaleString() }}</template>
              available
            </div>
            <!-- Free-trial ceiling notice + upsell. Only for plan === '0'. -->
            <div v-if="isFreeTrial" class="trial-note" :class="{ 'trial-note-nudge': trialNudge }">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span v-if="(trialLeft ?? 0) > 0">{{ trialLeft }} of {{ TRIAL_CAP }} free trial question{{ trialLeft === 1 ? '' : 's' }} left. Subscribe for full access to the qbank.</span>
              <span v-else>You've used all {{ TRIAL_CAP }} free trial questions. Subscribe for full access to the qbank.</span>
              <button type="button" class="trial-sub-btn" @click="openSubscribe">Subscribe</button>
            </div>
          </div>
        </div>
      </div>

      </template><!-- /real-content v-else -->
    </div><!-- /content -->

    <!-- LAUNCH BAR — hidden while the page-level skeleton renders so the
         entire viewport reads as a unified placeholder. -->
    <div v-if="!loading && !examSwitching" class="launch-bar">
      <div class="launch-summary">
        <div class="ls-item">
          <div class="ls-dot" style="background:var(--teal)"></div>
          <span class="ls-lbl">Mode:</span>
          <span class="ls-val">{{ lsMode }}</span>
        </div>
        <div class="ls-item">
          <div class="ls-dot" style="background:var(--amber)"></div>
          <span class="ls-lbl">Familiarity:</span>
          <span class="ls-val">{{ lsFam }}</span>
        </div>
        <div class="ls-item">
          <div class="ls-dot" style="background:var(--green)"></div>
          <span class="ls-lbl">Difficulty:</span>
          <span class="ls-val">{{ lsDiff }}</span>
        </div>
        <div class="ls-item">
          <div class="ls-dot" style="background:var(--ink-mid)"></div>
          <span class="ls-lbl">Topics:</span>
          <span class="ls-val">{{ taxLabel }}</span>
        </div>
      </div>
      <div class="launch-actions">
        <button type="button" class="btn-reset" @click="resetAll" :disabled="launching">Reset all</button>
        <button type="button" class="btn-launch" @click="launchSession" :disabled="launching || loading || availableCount === 0">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          {{ launching ? 'Starting…' : `Start Session · ${qCount} Questions` }}
        </button>
      </div>
    </div>

  </div><!-- /flex wrapper -->

  <!-- Bottom-center toast feedback. Auto-dismisses. -->
  <Transition name="qbtoast">
    <div v-if="toast" class="qb-toast" :class="`qb-toast--${toast.kind}`">
      <svg v-if="toast.kind === 'ok'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>{{ toast.msg }}</span>
    </div>
  </Transition>

  <!-- Full-page overlay shown from launch click until the session page takes
       over — prevents the "click did nothing" feeling during the fetch+create. -->
  <Teleport to="body">
    <div v-if="launching" class="qb-launch-overlay">
      <div class="qb-launch-card">
        <div class="qb-launch-spinner"></div>
        <div class="qb-launch-msg">Loading your session…</div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Inline error/loading banners for the qbank initial fetch + launch errors. */
.qbank-error {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  margin: 10px 0 16px;
  background: rgba(225, 29, 72, 0.08);
  border: 1px solid rgba(225, 29, 72, 0.30);
  color: #be123c;
  border-radius: 8px;
  font-size: 0.78rem; font-weight: 600;
}
.qbank-loading {
  padding: 14px 16px;
  margin: 10px 0 16px;
  background: rgba(6, 182, 212, 0.06);
  border: 1px dashed rgba(6, 182, 212, 0.30);
  color: var(--ink-mid);
  border-radius: 8px;
  font-size: 0.82rem;
}
.qbank-loading strong { color: var(--ink); }

/* ── Disabled state for question-count picker (0 available) ─────────── */
.count-input-wrap.disabled { opacity: 0.4; pointer-events: none; }
.count-btn[disabled],
.count-val-input[disabled] {
  cursor: not-allowed; opacity: 0.5;
}
.count-presets-empty {
  padding: 10px 0;
}
.count-empty-msg {
  font-size: 0.78rem;
  color: var(--ink-faint);
  font-style: italic;
}
.count-max-zero { color: var(--rose); font-weight: 600; }

/* ── Free-trial ceiling notice + upsell ──────────────────────────────── */
.trial-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 11px;
  border: 1px solid var(--amber-border, rgba(217, 119, 6, 0.3));
  background: var(--amber-light, rgba(217, 119, 6, 0.08));
  border-radius: var(--r, 8px);
  font-size: 0.76rem;
  line-height: 1.4;
  color: var(--ink-mid);
  transition: box-shadow 0.18s, border-color 0.18s;
}
.trial-note svg { color: var(--amber, #d97706); }
.trial-note span { flex: 1; min-width: 0; }
.trial-sub-btn {
  flex-shrink: 0;
  border: none;
  background: var(--amber, #d97706);
  color: #fff;
  font-family: 'Figtree', sans-serif;
  font-size: 0.73rem;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: filter 0.14s;
}
.trial-sub-btn:hover { filter: brightness(1.06); }
/* Pulse when a trial user tries to exceed the cap. */
.trial-note-nudge {
  border-color: var(--amber, #d97706);
  box-shadow: 0 0 0 3px var(--amber-light, rgba(217, 119, 6, 0.18));
}

/* ── Skeleton (qbank initial load) ───────────────────────────────────── */
.qb-sk-topbar {
  padding: 18px 24px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  background: var(--white, #fff);
}
.qb-sk-header  { margin: 8px 0 18px; }
.qb-sk-builder { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.qb-sk-card    { border: 1px solid var(--border); border-radius: 10px; padding: 18px; background: var(--white); }
.qb-sk-pulse   {
  background: var(--surface-2, #e5e7eb);
  animation: qbSkPulse 1.2s ease-in-out infinite;
  display: block;
}
@keyframes qbSkPulse {
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 0.5;  }
}
/* Builder panel wrapper (was an inline style). Desktop: fixed-height column —
   the .content scrolls internally and the launch bar pins to the bottom. */
.qb-builder-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

@media (max-width: 900px) {
  .qb-sk-builder { grid-template-columns: 1fr; }

  /* Mobile: the launch bar used position:sticky inside .qb-builder-wrap, which
     only pins correctly when that wrapper is a height-bounded scroll container.
     On mobile it isn't reliably bounded, so the bar dropped below the fold and
     the Start/Reset buttons became unreachable. Pin the bar to the VIEWPORT with
     position:fixed instead (independent of the scroll container), and pad the
     scrolled content so nothing hides behind it. The summary just recaps choices
     already shown in the builder above, so it's hidden here to keep the bar
     compact and guarantee the Start button is always tappable. */
  .qb-builder-wrap {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .qb-builder-wrap .content {
    overflow: visible;
    flex: 0 0 auto;
    padding-bottom: 92px;   /* clearance for the fixed launch bar */
  }
  .qb-builder-wrap .launch-bar {
    position: sticky;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    padding: 12px 14px calc(12px + env(safe-area-inset-bottom, 0px));
    box-shadow: 0 -4px 16px rgba(15, 23, 42, 0.12);
  }
  .qb-builder-wrap .launch-summary { display: none; }
  .qb-builder-wrap .launch-actions { width: 100%; gap: 10px; }
  .qb-builder-wrap .launch-actions .btn-launch {
    flex: 1;                /* Start fills the row — easy tap target */
    justify-content: center;
  }
}
.btn-launch[disabled],
.btn-reset[disabled] {
  opacity: 0.55;
  cursor: not-allowed;
}
/* Editable Question Count input — strip the default number-input chrome so it
   blends with the surrounding +/- count UI. */
.count-val-input {
  background: transparent;
  border: none;
  outline: none;
  text-align: center;
  font: inherit;
  width: 100%;
  min-width: 60px;
  /* hide the spinner controls — we already have +/- buttons */
  appearance: textfield;
  -moz-appearance: textfield;
}
.count-val-input::-webkit-outer-spin-button,
.count-val-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.count-val-input:focus {
  background: var(--bg-soft);
  border-radius: 6px;
}
/* "30 / 2,211" — the slash + total is smaller and dimmer than the picked count */
.q-counter-divider {
  font-size: 0.55em;
  font-weight: 600;
  color: var(--ink-dim);
  margin-left: 2px;
}
/* Toast feedback */
.qb-toast {
  position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: 10px;
  padding: 12px 22px; border-radius: 999px;
  font-size: 0.85rem; font-weight: 600; letter-spacing: 0.2px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25);
  z-index: 9999; pointer-events: none; max-width: 90vw;
}
.qb-toast--ok  { background: #0f172a; color: #fff; }
.qb-toast--ok svg { color: #22d3ee; }
.qb-toast--err { background: #0f172a; color: #fff; }
.qb-toast--err svg { color: #fbbf24; }
.qbtoast-enter-active, .qbtoast-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.qbtoast-enter-from, .qbtoast-leave-to { opacity: 0; transform: translate(-50%, 12px); }
/* Full-page launch overlay */
.qb-launch-overlay {
  position: fixed; inset: 0; z-index: 99999;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center;
}
.qb-launch-card {
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  background: var(--white, #fff);
  padding: 28px 42px; border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
.qb-launch-spinner {
  width: 44px; height: 44px;
  border: 4px solid rgba(6, 182, 212, 0.25);
  border-top-color: var(--teal, #06b6d4);
  border-radius: 50%;
  animation: qb-launch-spin 0.7s linear infinite;
}
@keyframes qb-launch-spin { to { transform: rotate(360deg); } }
.qb-launch-msg {
  font-size: 0.9rem; font-weight: 600;
  color: var(--ink, #0f172a); letter-spacing: 0.2px;
}
</style>
