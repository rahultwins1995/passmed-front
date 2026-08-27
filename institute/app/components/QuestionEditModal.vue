<script setup lang="ts">
import { ref, computed, watch } from 'vue'

/**
 * Institute question edit modal. Only used for the institution's OWN questions
 * (the page gates this). Saves via the institution-scoped /questions/{id}/update
 * endpoint, which re-verifies ownership server-side.
 */
const props = defineProps<{
  modelValue: boolean
  question: any | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const api = useInstituteApi()

const stem        = ref('')
const explanation = ref('')
const reference   = ref('')
const difficulty  = ref('intermediate')
const subject     = ref('')
const categories  = ref('')
const domain      = ref('')
const discipline  = ref('')
const learning    = ref('')
const tags        = ref('')
const options     = ref<{ text: string; correct: boolean }[]>([])

// Stored question image URL (read-only preview under the stem). Not editable
// here — the importer/admin owns image URLs; this just surfaces it so the
// author sees the image the students will see. Rendered only for http(s) URLs.
const questionImage = computed<string>(() => String(props.question?.question_image_ids ?? ''))

// Per-field Edit ⇄ Preview toggle for the HTML long-content fields.
const stemMode = ref<'edit' | 'preview'>('edit')
const explMode = ref<'edit' | 'preview'>('edit')
const qeSwitchStyle = 'display:inline-flex;align-items:center;gap:5px;padding:3px 12px;border:1px solid var(--border, #d5dee7);'
  + 'border-radius:6px;font-size:0.68rem;font-weight:700;cursor:pointer;background:var(--white, #fff);color:var(--teal, #0891b2);'

const saving   = ref(false)
const errorMsg = ref('')

// ── Controlled-vocabulary dropdowns ──────────────────────────────────────────
// subject / category / domain / discipline are bound to the same taxonomy the
// import uses (GET /questionbank/facets), so editing can't reintroduce
// unstandardised values. (Backend resolveTaxonomy is lookup-only too.)
const facetSubjects    = ref<string[]>([])
const facetCategories  = ref<string[]>([])
const facetDomains     = ref<string[]>([])
const facetDisciplines = ref<string[]>([])
// Learning Outcome joins the controlled set — it used to be a free-text <input> here,
// which is the one field an institute user could put anything into.
const facetLearningOutcomes = ref<string[]>([])
// Difficulty carries {name, slug}: the form sends the SLUG (what questions store) but
// shows the NAME. Curatable now, so the four levels are no longer hardcoded.
const facetDifficulties = ref<Array<{ name: string; slug: string }>>([])

async function fetchFacets() {
  try {
    const res = await api<any>('/questionbank/facets')
    const d = res?.data ?? {}
    facetSubjects.value    = (d.subjects ?? []).map((x: any) => x.name).filter(Boolean)
    facetCategories.value  = (d.categories ?? []).map((x: any) => x.name).filter(Boolean)
    facetDomains.value     = (d.domains ?? []).map((x: any) => x.name).filter(Boolean)
    facetDisciplines.value = (d.disciplines ?? []).map((x: any) => x.name).filter(Boolean)
    facetLearningOutcomes.value = (d.learning_outcomes ?? []).map((x: any) => x.name).filter(Boolean)
    facetDifficulties.value = (d.difficulties ?? [])
      .map((x: any) => ({ name: x.name, slug: x.slug }))
      .filter((x: any) => x.slug)
  } catch { /* keep lists empty — selects still show the question's current value */ }
}

// Keep the question's current value selectable even if it isn't in the vocab yet
// (legacy/unstandardised data), so an edit doesn't silently blank it.
function withCurrent(list: string[], current: string): string[] {
  return current && !list.includes(current) ? [current, ...list] : list
}
const subjectOpts    = computed(() => withCurrent(facetSubjects.value, subject.value))
const categoryOpts   = computed(() => withCurrent(facetCategories.value, categories.value))
const domainOpts     = computed(() => withCurrent(facetDomains.value, domain.value))
const disciplineOpts = computed(() => withCurrent(facetDisciplines.value, discipline.value))
const learningOpts   = computed(() => withCurrent(facetLearningOutcomes.value, learning.value))

// ── HTML ⇄ plain text ────────────────────────────────────────────────────────
// Stored long-form content is HTML (the importer wraps paragraphs in <p>), so a
// textarea shows literal tags. Strip to plain for editing; re-wrap paragraph
// content (stem/explanation) on save so the student side (v-html) keeps its
// breaks. Reference is a short citation/URL → stored plain (never re-wrapped).
function htmlToPlain(html: string): string {
  if (!html) return ''
  return String(html)
    // Lists first, and with SINGLE newlines: an imported "Key Takeaways" list is
    // one block, so its items must stay stacked tight. Lumping </li> in with </p>
    // below turned every bullet into its own paragraph, and plainToHtml then wrote
    // them back as <p>s — one edit silently destroyed the list. The "- " marker is
    // what plainToHtml reads to rebuild <ul><li> on save.
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
// Mirror of the importer's wrapParagraphs (QuestionImportService): blank line →
// new <p>, single newline → <br>, and a run of "- " lines → a real <ul><li> list.
// Editing a question in this modal must round-trip to the SAME markup the import
// produces — otherwise one save turns imported bullets back into plain paragraphs.
function plainToHtml(text: string): string {
  const t = (text ?? '').trim()
  if (!t) return ''
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  let html = ''
  for (const block of t.split(/\n{2,}/)) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l !== '')
    if (!lines.length) continue

    let buffer: string[] = []
    let items: string[] = []
    const flushText = () => {
      if (buffer.length) { html += `<p>${buffer.join('<br>')}</p>`; buffer = [] }
    }
    const flushList = () => {
      if (items.length) { html += `<ul><li>${items.join('</li><li>')}</li></ul>`; items = [] }
    }

    for (const line of lines) {
      // Marker must be followed by whitespace so "Co-operative care" stays prose.
      const m = line.match(/^[-–—*•]\s+(.*)$/)
      if (m) { flushText(); items.push(esc(m[1].trim())) }
      else   { flushList(); buffer.push(esc(line)) }
    }
    flushText()
    flushList()
  }
  return html
}

// Auto-grow directive: a <textarea> expands to fit its content so the WHOLE stem /
// explanation is visible at once — no fixed rows, no inner scroll, line breaks intact.
// Fits on mount, on every value update (hydrate), and while typing.
const vAutogrow = {
  mounted(el: HTMLTextAreaElement) {
    const fit = () => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
    el.addEventListener('input', fit)
    requestAnimationFrame(fit)
  },
  updated(el: HTMLTextAreaElement) {
    el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'
  },
}

function isCorrect(v: any) {
  return v === true || v === 1 || v === '1' || v === 'true'
}

function hydrate() {
  const q = props.question || {}
  stemMode.value = 'edit'; explMode.value = 'edit'   // always open in edit mode
  stem.value        = htmlToPlain(q.question_stem ?? '')
  explanation.value = htmlToPlain(q.explanation ?? '')
  reference.value   = htmlToPlain(q.reference ?? '')
  difficulty.value  = q.difficulty ?? ''
  subject.value     = q.subject?.name ?? ''
  categories.value  = q.category?.name ?? ''
  domain.value      = q.domain?.name ?? ''
  discipline.value  = q.discipline?.name ?? ''
  // `learning_outcome` is an eager-loaded RELATION now (Eloquent snake-cases the
  // relation key), so it arrives as { id, name } — not the old free-text string.
  // Guard for both so an unrefreshed payload doesn't render "[object Object]".
  learning.value    = typeof q.learning_outcome === 'string'
    ? q.learning_outcome
    : (q.learning_outcome?.name ?? '')
  tags.value        = (q.tags ?? []).map((t: any) => t.name).join('; ')

  const opts = (q.question_options ?? []).map((o: any) => ({
    text: o.option_text ?? '',
    correct: isCorrect(o.is_correct),
  }))
  // Always show at least 4 option rows for editing
  while (opts.length < 4) opts.push({ text: '', correct: false })
  options.value = opts
}

function setCorrect(i: number) {
  options.value = options.value.map((o, idx) => ({ ...o, correct: idx === i }))
}

async function save(publish = false) {
  errorMsg.value = ''
  if (stem.value.trim().length < 10) return (errorMsg.value = 'Question stem is too short.')
  const filled = options.value.filter(o => o.text.trim() !== '')
  if (filled.length < 2) return (errorMsg.value = 'At least 2 options are required.')
  if (!filled.some(o => o.correct)) return (errorMsg.value = 'Please mark the correct option.')

  saving.value = true
  try {
    const res = await api<any>(`/questions/${props.question.id}/update`, {
      method: 'POST',
      body: {
        question_stem: plainToHtml(stem.value),
        explanation: plainToHtml(explanation.value),
        reference: reference.value.trim(),
        difficulty: difficulty.value,
        subject: subject.value,
        categories: categories.value,
        domain: domain.value,
        discipline: discipline.value,
        learning_outcome: learning.value,
        tags: tags.value,
        options: options.value
          .filter(o => o.text.trim() !== '')
          .map(o => ({ text: o.text, correct: o.correct })),
      },
    })
    if (res?.status === 'success') {
      // Publish → flip status 4 → 1 via the existing full-gated approve endpoint, so
      // the edited question leaves Needs Review and shows up under All Questions.
      // Save draft skips this and keeps the current status (stays in review).
      if (publish) {
        const pr = await api<any>(`/questions/${props.question.id}/approve`, { method: 'POST' })
        if (pr?.status !== 'success') {
          errorMsg.value = pr?.msg || 'Saved, but could not publish.'
          saving.value = false
          return
        }
      }
      emit('saved')
      close()
    } else {
      errorMsg.value = res?.msg || 'Failed to save.'
    }
  } catch (err: any) {
    const code = err?.response?.status ?? err?.statusCode
    if (code === 403) errorMsg.value = 'You do not have permission to publish. Ask an admin for full access to the Question Bank.'
    else errorMsg.value = err?.data?.msg || 'Failed to save question.'
  } finally {
    saving.value = false
  }
}

function close() { emit('update:modelValue', false) }

// ── Change-audit trail (timeline) ────────────────────────────────────────────
const history = ref<{ created_at: string | null; created_by: string | null; revisions: any[] }>({ created_at: null, created_by: null, revisions: [] })
const historyLoading = ref(false)

async function fetchHistory() {
  const id = props.question?.id
  if (!id) { history.value = { created_at: null, created_by: null, revisions: [] }; return }
  historyLoading.value = true
  try {
    const res = await api<any>(`/questions/${id}/history`)
    const d = res?.data ?? res
    history.value = {
      created_at: d?.created_at ?? null,
      created_by: d?.created_by ?? null,
      revisions:  Array.isArray(d?.revisions) ? d.revisions : [],
    }
  } catch { history.value = { created_at: null, created_by: null, revisions: [] } }
  finally { historyLoading.value = false }
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  // Parse safely across browsers: a space-separated SQL datetime ("2026-07-27 10:23:14")
  // is turned into ISO so Safari/iOS don't return Invalid Date.
  const d = new Date(String(iso).replace(' ', 'T'))
  if (isNaN(d.getTime())) return ''
  // Date + time (to the minute) so each history event carries its exact moment.
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
function changeText(c: any): string {
  if (c?.from !== undefined || c?.to !== undefined) return `${c.field}: ${c.from ?? '—'} → ${c.to ?? '—'}`
  return `${c.field} ${c.note ?? 'updated'}`
}

watch(() => props.modelValue, (open) => { if (open) { hydrate(); fetchHistory(); fetchFacets() } })
</script>

<template>
  <div v-if="modelValue" class="qe-overlay" @click.self="close">
    <div class="qe-card">
      <div class="qe-header">
        <div class="qe-title">Edit question</div>
        <button class="qe-close" type="button" @click="close" aria-label="Close">✕</button>
      </div>

      <div class="qe-body">
        <div v-if="errorMsg" class="qe-error">{{ errorMsg }}</div>

        <label class="qe-label">Question stem</label>
        <!-- One full-height, auto-growing editable view: whole text + line breaks
             intact, no Preview/Edit toggle. -->
        <textarea v-model="stem" v-autogrow class="qe-input"
          style="min-height:120px;overflow:hidden;resize:vertical;line-height:1.55;white-space:pre-wrap;"></textarea>

        <!-- Question image preview (read-only; only when a real http(s) URL is present) -->
        <div v-if="isImageUrl(questionImage)" class="qc-question-image qc-question-image--institute-edit">
          <img :src="questionImage" alt="Question image" loading="lazy" />
        </div>

        <label class="qe-label">Options <span class="qe-hint">(select the correct one)</span></label>
        <div v-for="(o, i) in options" :key="i" class="qe-opt">
          <input type="radio" :checked="o.correct" @change="setCorrect(i)" :name="'correct'" />
          <input v-model="o.text" class="qe-input qe-opt-text" :placeholder="'Option ' + String.fromCharCode(65 + i)" />
        </div>

        <label class="qe-label">Explanation</label>
        <textarea v-model="explanation" v-autogrow class="qe-input"
          style="min-height:120px;overflow:hidden;resize:vertical;line-height:1.55;white-space:pre-wrap;"></textarea>

        <div class="qe-grid">
          <div>
            <label class="qe-label">Difficulty</label>
            <!-- Was a hardcoded four-level list. Reads the live vocabulary now — the
                 value sent is the SLUG, which is what questions.difficulty stores. -->
            <select v-model="difficulty" class="qe-input">
              <option v-for="d in facetDifficulties" :key="d.slug" :value="d.slug">{{ d.name }}</option>
            </select>
          </div>
          <div>
            <label class="qe-label">Subject</label>
            <select v-model="subject" class="qe-input">
              <option value="">—</option>
              <option v-for="o in subjectOpts" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>
          <div>
            <label class="qe-label">Sub-topic</label>
            <select v-model="categories" class="qe-input">
              <option value="">—</option>
              <option v-for="o in categoryOpts" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>
          <div>
            <label class="qe-label">Knowledge Type</label>
            <select v-model="discipline" class="qe-input">
              <option value="">—</option>
              <option v-for="o in disciplineOpts" :key="o" :value="o">{{ o }}</option>
            </select>
          </div>
          <div>
            <label class="qe-label">Tags <span class="qe-hint">(; separated)</span></label>
            <input v-model="tags" class="qe-input" />
          </div>
        </div>

        <label class="qe-label">Reference</label>
        <input v-model="reference" class="qe-input" />

        <!-- Was a free-text <input> — the one taxonomy field an institute user could
             type anything into, straight past the controlled vocabulary every other
             axis is held to. It is a real taxonomy now, so it is a picker. -->
        <label class="qe-label">Cognitive task</label>
        <select v-model="learning" class="qe-input">
          <option value="">— None —</option>
          <option v-for="lo in learningOpts" :key="lo" :value="lo">{{ lo }}</option>
        </select>

        <!-- ── Change history (audit trail) ─────────────────────────────────── -->
        <label class="qe-label" style="margin-top:20px;">Change history</label>
        <div v-if="historyLoading" class="qe-hist-empty">Loading…</div>
        <ul v-else class="qe-timeline">
          <li v-for="(rev, i) in history.revisions" :key="'rev-' + i" class="qe-tl-item">
            <span class="qe-tl-dot"></span>
            <div class="qe-tl-body">
              <div class="qe-tl-head"><strong>{{ fmtDate(rev.when) }}</strong> — updated by {{ rev.user }}</div>
              <ul v-if="rev.changes && rev.changes.length" class="qe-tl-changes">
                <li v-for="(c, ci) in rev.changes" :key="ci">{{ changeText(c) }}</li>
              </ul>
            </div>
          </li>
          <li v-if="history.created_at" class="qe-tl-item">
            <span class="qe-tl-dot qe-tl-dot--created"></span>
            <div class="qe-tl-body">
              <div class="qe-tl-head"><strong>{{ fmtDate(history.created_at) }}</strong> — created{{ history.created_by ? ' by ' + history.created_by : '' }}</div>
            </div>
          </li>
          <li v-if="!history.created_at && !history.revisions.length" class="qe-hist-empty">No history yet.</li>
        </ul>

        <div class="qe-actions">
          <button class="qe-btn qe-btn-primary" type="button" :disabled="saving" @click="save(true)">
            {{ saving ? 'Saving…' : 'Publish' }}
          </button>
          <button class="qe-btn qe-btn-outline" type="button" :disabled="saving" @click="save(false)">
            {{ saving ? 'Saving…' : 'Save draft' }}
          </button>
          <button class="qe-btn qe-btn-outline" type="button" @click="close">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qe-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 40px 16px; overflow-y: auto;
}
.qe-card {
  width: 640px; max-width: 100%;
  background: var(--white, #fff); border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.28);
  max-height: calc(100dvh - 80px); overflow-y: auto; margin: auto;
}
.qe-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 22px; border-bottom: 1px solid var(--border, #e5e7eb);
}
.qe-title { font-size: 1.05rem; font-weight: 800; color: var(--ink, #0f172a); }
.qe-close { background: transparent; border: 0; cursor: pointer; font-size: 1rem; color: var(--ink-dim, #64748b); }
.qe-body { padding: 20px 22px; }
.qe-error { background: rgba(220,38,38,0.06); border: 1.5px solid rgba(220,38,38,0.2); color: #b91c1c; padding: 9px 12px; border-radius: 8px; font-size: 0.82rem; margin-bottom: 14px; }
.qe-label { display: block; margin: 14px 0 6px; font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-dim, #64748b); }

/* Change-history timeline */
.qe-hist-empty { font-size: 0.78rem; color: var(--ink-dim, #94a3b8); padding: 4px 0; }
.qe-timeline { list-style: none; margin: 4px 0 0; padding: 0; }
.qe-tl-item { position: relative; padding: 0 0 14px 20px; }
.qe-tl-item:not(:last-child)::before { content: ''; position: absolute; left: 4px; top: 12px; bottom: 0; width: 2px; background: var(--border, #e5e7eb); }
.qe-tl-dot { position: absolute; left: 0; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: var(--teal, #0891b2); border: 2px solid var(--white, #fff); box-shadow: 0 0 0 1px var(--teal, #0891b2); }
.qe-tl-dot--created { background: var(--ink-dim, #94a3b8); box-shadow: 0 0 0 1px var(--ink-dim, #94a3b8); }
.qe-tl-head { font-size: 0.8rem; color: var(--ink, #0f172a); }
.qe-tl-changes { list-style: disc; margin: 4px 0 0; padding-left: 18px; }
.qe-tl-changes li { font-size: 0.75rem; color: var(--ink-dim, #64748b); line-height: 1.5; }
.qe-hint { font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--ink-dim, #94a3b8); }
.qe-input { width: 100%; padding: 9px 12px; border: 1.5px solid var(--border, #e5e7eb); border-radius: 8px; font-size: 0.85rem; color: var(--ink, #0f172a); background: var(--white, #fff); font-family: inherit; }
.qe-opt { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.qe-opt-text { flex: 1; }
.qe-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
.qe-actions { display: flex; gap: 8px; margin-top: 20px; }
.qe-btn { padding: 10px 16px; border-radius: 8px; font-weight: 700; font-size: 0.85rem; cursor: pointer; border: 1.5px solid transparent; }
.qe-btn-primary { flex: 1; background: var(--teal, #06b6d4); color: #fff; }
.qe-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.qe-btn-outline { background: var(--white, #fff); border-color: var(--border, #e5e7eb); color: var(--ink-mid, #475569); }
</style>
