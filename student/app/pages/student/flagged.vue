<script setup lang="ts">
definePageMeta({ layout: 'student' })
useHead({ title: 'Flagged Questions · Passmed' })

// ─── Live API wiring via composable ──────────────────────────────────────
// Backed by /api-student/v1/flags/* (Api_student_question_flagController).
const {
  list, categories, counts, loading, saving, fetchError,
  search, statusFilter, topicFilter, sortBy,
  fetchFlagged, fetchCounts, fetchCategories,
  unflag, resetAll, saveNote,
  isCorrectOpt, shortStem,
} = useFlagged()

const { activeExam } = useExam()

// ─── Local UI state ──────────────────────────────────────────────────────
const expandedId    = ref<number | null>(null)
const showResetModal = ref(false)

// Inline flash banner — visual confirmation for bulk actions.
const flashMsg  = ref('')
const flashKind = ref<'success' | 'error'>('success')
function flash(msg: string, kind: 'success' | 'error' = 'success') {
  flashMsg.value  = msg
  flashKind.value = kind
  setTimeout(() => { if (flashMsg.value === msg) flashMsg.value = '' }, 2200)
}

// ─── Initial load + reactive refetch ─────────────────────────────────────
const authUser = useState<any | null>('auth_user', () => null)

onMounted(async () => {
  await Promise.all([fetchFlagged(), fetchCounts(), fetchCategories()])
})

// Safety net for keep-alive: when returning to this (cached) page — e.g. after
// flagging a question in tutor/timed — onMounted does NOT re-fire, so the list
// would show stale data and the newly-flagged question wouldn't appear.
// onActivated re-pulls the flags + counts on every re-entry. (Mirrors the same
// fix in mock.vue.)
onActivated(() => {
  fetchFlagged()
  fetchCounts()
})

watch(authUser, async (u, prev) => {
  if (u && !prev) {
    await Promise.all([fetchFlagged(), fetchCounts(), fetchCategories()])
  }
})

// Debounced search.
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => fetchFlagged(), 300)
})

// Refetch when active exam switches.
watch(() => activeExam.value?.examId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    expandedId.value = null
    fetchFlagged()
    fetchCounts()
  }
})

// ─── Click handlers ──────────────────────────────────────────────────────
// Pure UI toggle. No backend call, no count mutation — the status icon,
// counts, and check marks are driven entirely by the data the list returns
// (`result` field from the backend). Clicking just shows/hides details.
function toggleExpand(flagId: number) {
  expandedId.value = expandedId.value === flagId ? null : flagId
}

async function onUnflag(e: Event, questionId: number, flagId: number) {
  e.stopPropagation()
  const ok = await unflag(questionId)
  if (expandedId.value === flagId) expandedId.value = null
  if (ok) fetchCounts()
  flash(ok ? 'Flag removed' : "Couldn't remove flag — try again", ok ? 'success' : 'error')
}

async function onResetAll() {
  showResetModal.value = false
  const ok = await resetAll()
  expandedId.value = null
  search.value = ''
  if (ok) fetchCounts()
  flash(ok ? 'All flags removed' : "Couldn't reset flags — try again", ok ? 'success' : 'error')
}

async function onSaveNote(q: { id: number; notes: string }) {
  const ok = await saveNote(q.id, q.notes ?? '')
  flash(ok ? 'Note saved' : "Couldn't save note — try again", ok ? 'success' : 'error')
}

function onPracticeFlagged() {
  if (counts.value.all_total === 0) {
    flash('Nothing flagged yet', 'error')
    return
  }
  // Carry the flagged question_ids forward as a query string so the
  // qbank page can build a session restricted to this pool.
  const qids = list.value.map(q => q.question_id).join(',')
  navigateTo(`/student/qbank?source=flagged&qids=${qids}`)
}

// ─── Display helpers ─────────────────────────────────────────────────────
function diffTagClass(d: string) {
  const v = String(d || '').toLowerCase()
  if (v === 'foundation' || v === 'easy')   return 'tag tag-diff-easy'
  if (v === 'advanced'   || v === 'hard')   return 'tag tag-diff-hard'
  if (v === 'expert')                       return 'tag tag-diff-expert'
  return 'tag tag-diff-med'   // intermediate / medium / unknown
}

function optionLetter(i: number) {
  return String.fromCharCode(65 + i)
}

// Resolve the visible category label for a row.
//
// The backend's `category_name` field can come back empty (eg. when the
// eager-loaded `question.category` relation didn't resolve, even though
// `category_id` is set on the question). Fall back to a lookup in the
// canonical categories list (fetched once on mount from /flags/categories)
// so the badge still renders correctly.
function displayCategory(q: { category_id: number | null; category_name: string }): string {
  const fromRow = (q.category_name || '').trim()
  if (fromRow) return fromRow
  if (q.category_id == null) return ''
  const match = categories.value.find(c => c.id === q.category_id)
  return match?.name || ''
}

// ─── Two-stage filter pipeline ───────────────────────────────────────────
// 1. `categoryScopedList` — list with only the category filter applied.
//    Drives the stat cards and chip counts so they reflect the user's
//    current category context (e.g. "All 8 / Wrong 3" become the counts
//    WITHIN Anesthesiology when that category is selected).
// 2. `filteredList`        — `categoryScopedList` + status chip + search +
//    sort. This is what the q-list template iterates over.
//
// Matching by category is fault-tolerant: we accept EITHER a category_id
// match (preferred — works once backend deploys the new field) OR a
// category_name string match (fallback — works with the older API too).
const categoryScopedList = computed(() => {
  const filter = topicFilter.value
  if (!filter || filter === 'all') return list.value

  if (filter === 'none') {
    return list.value.filter(q => q.category_id == null && (!q.category_name || !q.category_name.trim()))
  }

  const cid = Number(filter)
  const selectedName = categories.value.find(c => c.id === cid)?.name || ''
  return list.value.filter(q =>
    Number(q.category_id) === cid ||
    (selectedName && (q.category_name || '').trim() === selectedName)
  )
})

// Stat cards (top 4) — ALWAYS show the unfiltered totals so the user can
// see their full flagged-question summary at a glance, regardless of
// which category / status chip is currently active.
const totalFlagged    = computed(() => list.value.length)
const previouslyWrong = computed(() => list.value.filter(q => q.result === 'incorrect').length)
const gotCorrect      = computed(() => list.value.filter(q => q.result === 'correct').length)
const notYetAttempted = computed(() => list.value.filter(q => q.result == null || q.result === 'skipped').length)

// Chip counts (All / Wrong / Correct / Unseen below the search bar) DO
// react to the category dropdown — they show the breakdown WITHIN the
// currently selected category so the user can pick a status chip with
// accurate counts.
const chipAll     = computed(() => categoryScopedList.value.length)
const chipWrong   = computed(() => categoryScopedList.value.filter(q => q.result === 'incorrect').length)
const chipCorrect = computed(() => categoryScopedList.value.filter(q => q.result === 'correct').length)
const chipUnseen  = computed(() => categoryScopedList.value.filter(q => q.result == null || q.result === 'skipped').length)

const filteredList = computed(() => {
  let out = categoryScopedList.value.slice()

  // 1. Status chip — match against the `result` field.
  if (statusFilter.value === 'correct')  out = out.filter(q => q.result === 'correct')
  else if (statusFilter.value === 'wrong')   out = out.filter(q => q.result === 'incorrect')
  else if (statusFilter.value === 'unseen')  out = out.filter(q => q.result == null || q.result === 'skipped')

  // 3. Search — already debounced in the watcher → /flags refetch path,
  // BUT we also do a client-side narrow so the user sees instant feedback
  // even before the network round-trip resolves.
  const s = search.value.trim().toLowerCase()
  if (s) {
    out = out.filter(q =>
      q.question_stem.toLowerCase().includes(s) ||
      (q.category_name || '').toLowerCase().includes(s)
    )
  }

  // 4. Sort.
  if (sortBy.value === 'topic') {
    out.sort((a, b) => (a.category_name || '').localeCompare(b.category_name || ''))
  } else if (sortBy.value === 'wrong_first') {
    const rank = (r: any) => (r === 'incorrect' ? 0 : r == null || r === 'skipped' ? 1 : 2)
    out.sort((a, b) => rank(a.result) - rank(b.result))
  } else {
    // newest first — fall back to id desc when created_at is missing/equal.
    out.sort((a, b) => {
      const da = a.created_at ? Date.parse(a.created_at) || 0 : 0
      const db = b.created_at ? Date.parse(b.created_at) || 0 : 0
      if (db !== da) return db - da
      return (b.id || 0) - (a.id || 0)
    })
  }

  return out
})

// The dropdown is populated from `categories` (fetched from
// /flags/categories — the full categories table). We additionally expose
// an "Uncategorised" option iff any flagged row lacks both an id AND a
// name, so the user can drill into truly uncategorised questions.
const hasUncategorisedFlags = computed(() =>
  list.value.some(q =>
    q.category_id == null && (!q.category_name || !q.category_name.trim())
  )
)

// Per-row icon: ✓ for correct, ✗ for wrong, – for unseen/skipped.
function statusIcon(r: 'correct' | 'incorrect' | 'skipped' | null) {
  if (r === 'correct')   return '✓'
  if (r === 'incorrect') return '✗'
  return '–'
}
function statusClass(r: 'correct' | 'incorrect' | 'skipped' | null) {
  if (r === 'correct')   return 'qs-correct'
  if (r === 'incorrect') return 'qs-wrong'
  return 'qs-unseen'
}
</script>

<template>
  <!-- Topbar — shimmer band during initial load (unified full-page skeleton) -->
  <div v-if="loading" class="sk-topbar" style="display:flex;align-items:center;justify-content:space-between">
    <div>
      <div class="sk-pulse" style="width:170px;height:18px;border-radius:4px"></div>
      <div class="sk-pulse" style="width:230px;height:11px;border-radius:4px;margin-top:6px"></div>
    </div>
    <div style="display:flex;gap:8px">
      <div class="sk-pulse" style="width:92px;height:34px;border-radius:9px"></div>
      <div class="sk-pulse" style="width:130px;height:34px;border-radius:9px"></div>
    </div>
  </div>
  <StudentTopbar v-else title="Flagged Questions">
    <button type="button" class="btn-ghost" :disabled="loading || saving || totalFlagged === 0" @click="showResetModal = true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 .49-4.44"/></svg>
      Reset all
    </button>
    <button type="button" class="btn-primary" :disabled="loading || saving || totalFlagged === 0" @click="onPracticeFlagged">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Practice flagged
    </button>
  </StudentTopbar>

  <div class="content">
    <transition name="flash-fade">
      <div v-if="flashMsg" :class="['flash-banner', flashKind]">
        <svg v-if="flashKind === 'success'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {{ flashMsg }}
      </div>
    </transition>

    <!-- Full-page skeleton — summary + filter shapes while flags load -->
    <template v-if="loading">
      <div class="summary-strip fi d1">
        <div v-for="i in 4" :key="`ss-sk-${i}`" class="ss">
          <div class="sk-pulse" style="width:38px;height:38px;border-radius:10px;flex-shrink:0"></div>
          <div style="flex:1">
            <div class="sk-pulse" style="width:46px;height:18px;border-radius:4px;margin-bottom:6px"></div>
            <div class="sk-pulse" style="width:90px;height:10px;border-radius:3px"></div>
          </div>
        </div>
      </div>
      <div class="filter-bar fi d2">
        <div v-for="i in 3" :key="`fb-sk-${i}`" class="sk-pulse" style="width:110px;height:30px;border-radius:8px"></div>
        <div class="sk-pulse" style="margin-left:auto;width:170px;height:30px;border-radius:8px"></div>
      </div>
    </template>

    <template v-else>
    <!-- SUMMARY STRIP -->
    <div class="summary-strip fi d1">
      <div class="ss">
        <div class="ss-icon" style="background:var(--yellow-pale)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        </div>
        <div>
          <div class="ss-val">{{ totalFlagged }}</div>
          <div class="ss-lbl">Total flagged</div>
        </div>
      </div>
      <div class="ss">
        <div class="ss-icon" style="background:var(--rose-light)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        </div>
        <div>
          <div class="ss-val" style="color:var(--rose)">{{ previouslyWrong }}</div>
          <div class="ss-lbl">Previously wrong</div>
        </div>
      </div>
      <div class="ss">
        <div class="ss-icon" style="background:var(--green-light)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div>
          <div class="ss-val" style="color:var(--green)">{{ gotCorrect }}</div>
          <div class="ss-lbl">Got correct</div>
        </div>
      </div>
      <div class="ss">
        <div class="ss-icon" style="background:var(--surface)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-dim)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div>
          <div class="ss-val" style="color:var(--ink-dim)">{{ notYetAttempted }}</div>
          <div class="ss-lbl">Not yet attempted</div>
        </div>
      </div>
    </div>

    <!-- FILTER BAR — status chips, topic dropdown, sort. All client-side
         filters operating on the already-loaded list. The chip counts
         reflect the FULL list (not the current filter) so the user can
         see all category totals at a glance. -->
    <div class="filter-bar fi d2" :class="{ 'filter-bar-busy': loading }">
      <div class="search-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" type="text" placeholder="Search questions…" v-model="search" :disabled="loading" />
      </div>

      <div class="filter-group">
        <button type="button" class="chip" :class="{ active: statusFilter === 'all' }" @click="statusFilter = 'all'">
          All {{ chipAll }}
        </button>
        <button type="button" class="chip c-wrong" :class="{ active: statusFilter === 'wrong' }" @click="statusFilter = 'wrong'">
          Wrong {{ chipWrong }}
        </button>
        <button type="button" class="chip c-correct" :class="{ active: statusFilter === 'correct' }" @click="statusFilter = 'correct'">
          Correct {{ chipCorrect }}
        </button>
        <button type="button" class="chip" :class="{ active: statusFilter === 'unseen' }" @click="statusFilter = 'unseen'">
          Unseen {{ chipUnseen }}
        </button>
      </div>

      <div class="filter-sep"></div>

      <!-- Category dropdown — full list from /flags/categories so users
           see every option, not just those already in their flagged set.
           (Variable still named topicFilter for useState key compatibility.) -->
      <select class="sort-select" v-model="topicFilter">
        <option value="all">All categories</option>
        <option v-for="c in categories" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
        <option v-if="hasUncategorisedFlags" value="none">Uncategorised</option>
      </select>

      <select class="sort-select" v-model="sortBy">
        <option value="newest">Newest first</option>
        <option value="topic">By category</option>
        <option value="wrong_first">Wrong first</option>
      </select>
    </div>

    <!-- LOADING -->
    </template>

    <div v-if="loading" class="q-list fi d3">
      <div v-for="i in 4" :key="`sk-${i}`" class="q-item">
        <div class="q-header" style="cursor:default">
          <div class="q-status fq-sk-pulse" style="background:var(--surface-2);border:none"></div>
          <div class="q-meta" style="flex:1">
            <div class="fq-sk-pulse" style="width:80%;height:13px;border-radius:4px"></div>
            <div style="display:flex;gap:8px;margin-top:10px">
              <div class="fq-sk-pulse" style="width:80px;height:18px;border-radius:6px"></div>
              <div class="fq-sk-pulse" style="width:60px;height:18px;border-radius:6px"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ERROR -->
    <div v-else-if="fetchError" class="empty fi d3" style="color:var(--rose)">
      <div class="empty-icon">⚠️</div>
      <div class="empty-title">Couldn't load flagged questions</div>
      <div class="empty-sub">{{ fetchError }}</div>
    </div>

    <!-- EMPTY -->
    <div v-else-if="filteredList.length === 0" class="empty fi d3">
      <div class="empty-icon">🏳️</div>
      <div class="empty-title">{{ totalFlagged === 0 ? 'No flagged questions yet' : 'No questions match' }}</div>
      <div class="empty-sub">
        {{ totalFlagged === 0
          ? 'Flag questions during a session to see them here for later review.'
          : 'Try adjusting your filters or search term.' }}
      </div>
    </div>

    <!-- LIST -->
    <div v-else class="q-list fi d3">
      <div
        v-for="q in filteredList"
        :key="q.id"
        class="q-item"
        :class="{ expanded: expandedId === q.id }"
      >
        <!-- HEADER -->
        <button type="button" class="q-header" @click="toggleExpand(q.id)" :aria-expanded="expandedId === q.id">
          <div class="q-status" :class="statusClass(q.result)">{{ statusIcon(q.result) }}</div>
          <div class="q-meta">
            <div class="q-text">{{ shortStem(q.question_stem) }}</div>
            <div class="q-tags">
              <!-- Category tag — first chip in the row (order matches the
                   Student Portal mockup: category → difficulty → note). -->
              <span v-if="displayCategory(q)" class="tag tag-topic">{{ displayCategory(q) }}</span>
              <span v-if="q.difficulty" :class="diffTagClass(q.difficulty)">
                {{ q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1) }}
              </span>
              <span v-if="q.notes && q.notes.trim()" class="tag tag-note">📝 Note</span>
            </div>
          </div>
          <div v-if="q.created_at" class="q-date">{{ q.created_at }}</div>
          <!-- Flag button always rendered as ACTIVE (amber) — every row in
               this list is by definition flagged. Click unflags it. -->
          <button type="button" class="q-flag-btn flagged-on" title="Unflag question" @click="onUnflag($event, q.question_id, q.id)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--amber)" stroke="var(--amber)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          </button>
          <svg class="q-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        <!-- BODY -->
        <div class="q-body">
          <div class="q-question-full" v-html="sanitizeHtml(q.question_stem)"></div>

          <!-- Question image (only when a real http(s) URL is present) -->
          <div v-if="isImageUrl(q.question_image_ids)" class="qc-question-image qc-question-image--student-flagged">
            <img :src="q.question_image_ids" alt="Question image" loading="lazy" />
          </div>

          <div class="q-options">
            <div
              v-for="(o, i) in q.options"
              :key="o.id"
              class="opt"
              :class="{ correct: isCorrectOpt(o.is_correct) }"
            >
              <div class="opt-letter">{{ optionLetter(i) }}</div>
              <div class="opt-text">
                {{ o.option_text }}
                <span v-if="isCorrectOpt(o.is_correct)" style="font-size:0.7rem;color:var(--green);font-weight:700"> ✓ Correct answer</span>
              </div>
            </div>
          </div>

          <!-- Notes + Save (tightly grouped so button is always next to textarea) -->
          <div class="q-notes">
            <div class="notes-label">My notes</div>
            <textarea class="notes-ta" placeholder="Add a personal note, memory aid, or key point…" v-model="q.notes" rows="3" :disabled="saving"></textarea>
            <div class="notes-foot">
              <button type="button" class="act-btn success" :disabled="saving" @click.stop="onSaveNote(q)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Save Note
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>

  <!-- ── RESET CONFIRM MODAL ── -->
  <Teleport to="body">
    <div v-if="showResetModal" class="overlay open" @click.self="showResetModal = false">
      <div class="modal-box" style="max-width:380px;width:94vw">
        <div class="m-head">
          <div class="m-title">Remove all flagged questions?</div>
          <button type="button" class="m-close" @click="showResetModal = false" aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="m-body">
          <div class="m-note" style="margin-bottom:0">
            This will remove all <strong>{{ totalFlagged }} flagged questions</strong>. This action cannot be undone.
          </div>
          <div class="m-btns" style="margin-top:16px">
            <button type="button" class="btn" :disabled="saving" style="flex:1;justify-content:center" @click="showResetModal = false">Cancel</button>
            <button type="button" class="btn btn-danger" :disabled="saving" style="flex:1;justify-content:center" @click="onResetAll">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 .49-4.44"/></svg>
              Reset all
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fq-sk-pulse {
  background: var(--surface-2, #e5e7eb);
  animation: fqSkPulse 1.2s ease-in-out infinite;
  display: block;
}
@keyframes fqSkPulse {
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 0.5;  }
}

.filter-bar-busy { pointer-events: none; }
.chip[disabled], .btn-ghost[disabled], .btn-primary[disabled], .act-btn[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
.search-input[disabled], .notes-ta[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

.flash-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-radius: 8px;
  font-size: 0.85rem; font-weight: 600;
  margin-bottom: 14px;
}
.flash-banner.success { background: var(--green-light, #d1fae5); color: var(--green, #047857); }
.flash-banner.error   { background: var(--rose-light, #fee2e2); color: var(--rose, #b91c1c); }
.flash-fade-enter-active, .flash-fade-leave-active { transition: opacity 0.25s, transform 0.25s; }
.flash-fade-enter-from, .flash-fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
