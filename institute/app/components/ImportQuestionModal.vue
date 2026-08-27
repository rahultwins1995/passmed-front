<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

/**
 * Institute-side "Import Questions" modal.
 * Self-contained: uses useInstituteApi (no Pinia / @vueform/multiselect / global toast).
 * Talks to the institution-scoped /imports/* endpoints. Imported questions are
 * owned by the institution (backend stamps question_owner = institution_id).
 */

const props = defineProps<{
  modelValue: boolean
  /** Optional exam id to preselect (the current Question Bank exam). */
  examId?: number | string | null
  /** When set, the modal opens straight to this stored summary (the reopened
   *  "View last import result") instead of the upload form. */
  previewSummary?: any
}>()

// Format the import timestamp for the "Imported on …" line.
const fmtImportDate = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  // Emits the exam id the questions were imported into (may be a newly created
  // exam) so the page can switch to it and show the imported questions.
  (e: 'imported', examId: string): void
  // Fired on every progress poll WHILE the modal owns the poll (open). Lets the page
  // live-refresh its stat cards + list even before the import is handed to the
  // background tracker (which only happens on close).
  (e: 'progress', createdRow: number): void
}>()

const api = useInstituteApi()
// Large file uploads bypass the /api Vercel proxy (4.5MB serverless cap) and go
// straight to the backend cross-origin. Browsers now block the third-party auth
// cookie on that request, so we authenticate the DIRECT upload with a Bearer token
// (fetched SAME-ORIGIN from /auth-token, where the cookie still works) instead.
const apiDirect = useInstituteApi({ direct: true })
const importTracker = useImportProgress()

// Short-lived, UPLOAD-SCOPED token — fetch a FRESH one for every upload (it expires
// in ~5 min and is rejected everywhere except the /imports/files route), so never
// cache it. Fetched SAME-ORIGIN via the proxy where the HttpOnly cookie still works.
async function ensureUploadToken(): Promise<string> {
  try {
    const res: any = await api('/auth-token')
    return res?.token || ''
  } catch { return '' }
}

// ── UI state ──────────────────────────────────────────────────────────────────
const tab        = ref<'csv' | 'sheets'>('csv')
const errorMsg   = ref('')
const submitting = ref(false)

// shared form
const examId = ref<string>('0')
const status = ref<'0' | '1'>('0')
// Part 3: where imported questions land — private to this institution (default)
// or contributed to the shared pool any institution can draw from (attributed).
const visibility = ref<'private' | 'public'>('private')

// csv
const csvFile     = ref<File | null>(null)
const fileName    = ref('')
const rowCount    = ref<number | null>(null)
const fileInput   = ref<HTMLInputElement | null>(null)
// Only the .xlsx dropdown template is accepted. Legacy .xls is rejected (it parses
// unreliably) and CSV is disabled for institution imports (controlled vocabulary).
const allowed     = ['xlsx']

// Pull the most specific reason out of an ofetch error. Direct cross-origin uploads
// can carry the backend message under different keys (err.data.msg vs
// err.response._data.msg), or none at all (CORS / 413 / a 5xx HTML page). Check
// every shape, and if there's truly no body, at least surface the HTTP status —
// never a bare "failed to start" with no reason.
function importErr(err: any, fallback: string): string {
  const status = err?.statusCode ?? err?.response?.status ?? err?.response?.statusCode
  const msg = err?.data?.msg || err?.data?.message
    || err?.response?._data?.msg || err?.response?._data?.message
  if (msg && String(msg).trim()) return String(msg)
  return status ? `${fallback} (server responded ${status}). Please try again — if it keeps failing, contact support.` : fallback
}
// Optional Excel tab to import. Blank = first/active sheet. Sent as `sheet_name`.
const fileSheetName = ref('')
// Sheet/tab names read from the picked Excel file (client-side, via SheetJS) so
// the user picks the tab from a dropdown instead of typing it.
const sheetNames = ref<string[]>([])

// sheets
const sheetsUrl    = ref('')
const sheetName    = ref('')
const syncSchedule = ref<'one-time' | 'auto-sync-daily' | 'auto-sync-weekly' | 'manual'>('one-time')

// The exam id the active import is writing into (may be a freshly created exam).
// Emitted on completion so the page can switch to it.
const importedExamId = ref<string>('')

// progress
const showProgress = ref(false)
const progress     = ref(0)
const createdRow   = ref(0)
const totalRow     = ref(0)
const importStatus = ref<number>(0)   // 0 processing, 1 done, 2 fail, 3 cancel
let   pollTimer: ReturnType<typeof setInterval> | null = null
const activeImportId = ref<number | null>(null)

// summary
const showSummary = ref(false)
const summary     = ref<any>(null)

// exams dropdown
const exams        = ref<{ id: number; name: string }[]>([])
const examsLoading = ref(false)
// Part 3: '__new__' = create a new institution-owned exam to import into.
const NEW_EXAM = '__new__'
const newExamName  = ref('')
const creatingExam = ref(false)

// Resolve the target exam id: if the user chose "+ Create new exam", create it
// first and return its id; otherwise return the selected id. Returns '' on error.
async function resolveExamId(): Promise<string> {
  if (examId.value !== NEW_EXAM) return examId.value
  const name = newExamName.value.trim()
  if (!name) { errorMsg.value = 'Enter a name for the new bucket.'; return '' }
  creatingExam.value = true
  try {
    const res: any = await api('/exams/create', { method: 'POST', body: { name } })
    if (res?.status === 'success' && res?.data?.id) {
      exams.value = [{ id: res.data.id, name: res.data.name }, ...exams.value]
      examId.value = String(res.data.id)   // select the new exam
      newExamName.value = ''
      return String(res.data.id)
    }
    errorMsg.value = res?.msg || 'Could not create the new bucket.'
    return ''
  } catch (e: any) {
    errorMsg.value = e?.data?.msg || 'Could not create the new bucket.'
    return ''
  } finally {
    creatingExam.value = false
  }
}

const progressText = computed(() => {
  if (importStatus.value === 1 || progress.value >= 100) return 'Import completed successfully'
  if (progress.value > 0) return `Import in progress... ${progress.value}%`
  return 'Preparing import...'
})

const autoCreatedSummary = computed(() => {
  const ac = summary.value?.auto_created
  if (!ac) return ''
  const parts: string[] = []
  if (ac.subjects?.length)    parts.push(`${ac.subjects.length} new subjects`)
  if (ac.topics?.length)      parts.push(`${ac.topics.length} new topics`)
  if (ac.tags?.length)        parts.push(`${ac.tags.length} new tags`)
  if (ac.domains?.length)     parts.push(`${ac.domains.length} new domains`)
  if (ac.disciplines?.length) parts.push(`${ac.disciplines.length} new disciplines`)
  return parts.join(', ')
})

// ── Exams ───────────────────────────────────────────────────────────────────
async function fetchExams() {
  examsLoading.value = true
  try {
    // owned=1 → only the institution's OWN exams; Passmed's official exams are
    // never offered as an import destination (can't aim questions at the master bank).
    const res = await api<any>('/getexamsofinstitute', { query: { owned: 1 } })
    exams.value = res?.data?.exams ?? []
  } catch {
    exams.value = []
  } finally {
    examsLoading.value = false
  }
}

// ── File handling ───────────────────────────────────────────────────────────
function pickFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) setFile(file)
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).classList.remove('dragover')
  const file = e.dataTransfer?.files?.[0]
  if (file) setFile(file)
}
function setFile(file: File) {
  csvFile.value = file
  fileName.value = file.name
  errorMsg.value = ''
  fileSheetName.value = ''
  sheetNames.value = []
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') {
    const reader = new FileReader()
    reader.onload = (ev: any) => {
      const rows = String(ev.target.result).split('\n').filter(r => r.trim() !== '')
      rowCount.value = Math.max(0, rows.length - 1)
    }
    reader.readAsText(file)
  } else {
    rowCount.value = null
    loadSheetNames(file)
  }
}

// Read only the tab names from the Excel file (fast — bookSheets skips cell data).
// Best-effort: on any failure we just show no dropdown and fall back to the first
// sheet, so a parse error never blocks the import.
async function loadSheetNames(file: File) {
  try {
    const XLSX: any = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', bookSheets: true })
    sheetNames.value = Array.isArray(wb?.SheetNames) ? wb.SheetNames : []
  } catch {
    sheetNames.value = []
  }
}
function onDragOver(e: DragEvent) { (e.currentTarget as HTMLElement).classList.add('dragover') }
function onDragLeave(e: DragEvent) { (e.currentTarget as HTMLElement).classList.remove('dragover') }

// ── Download template ─────────────────────────────────────────────────────────
// Generated SERVER-SIDE from the live controlled vocabulary: an .xlsx whose five
// taxonomy columns — clinical area, sub-topic, knowledge type, cognitive task,
// difficulty — carry BLOCKING data-validation dropdowns, plus "Valid Values" and
// "Sub-topics by Area" reference sheets.
//
// It has no `domain` column. The admin template does, because Passmed's own questions
// take their SUBJECT from an exam blueprint ("Anatomy") which is not a clinical area,
// so DOMAIN carries the real one. Institutions author fresh questions and put the
// clinical area straight into CLINICAL AREA — nothing to reconcile.
//
// This is the front half of the QA gate; QuestionImportService is the back half and
// rejects anything that slips past Excel.
const templateBusy = ref(false)

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

async function downloadTemplate() {
  if (templateBusy.value) return
  errorMsg.value = ''
  templateBusy.value = true
  try {
    const res = await api.raw<Blob>('/imports/template', { responseType: 'blob' })
    saveBlob(res._data as Blob, 'question-import-template.xlsx')
  } catch {
    errorMsg.value = 'Could not download the template — please try again.'
  } finally {
    templateBusy.value = false
  }
}

// ── Submit ──────────────────────────────────────────────────────────────────
async function submitCsv() {
  errorMsg.value = ''
  // Never start a second import while one is active/paused.
  if (importTracker.active.value || importTracker.paused.value) return (errorMsg.value = 'An import is already running. Please wait for it to finish.')
  if (!csvFile.value)                return (errorMsg.value = 'Please select an Excel (.xlsx) file.')
  if (!examId.value || examId.value === '0') return (errorMsg.value = 'Please select a bucket.')
  const ext = csvFile.value.name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'xls')                 return (errorMsg.value = 'Legacy Excel (.xls) files are not supported. Please save the file as .xlsx and upload again.')
  if (!allowed.includes(ext))        return (errorMsg.value = `Unsupported file type “.${ext}”. Please upload the .xlsx import template.`)

  submitting.value = true
  // Create the new exam first if requested, then import into it.
  const targetExamId = await resolveExamId()
  if (!targetExamId || targetExamId === '0') { submitting.value = false; return }
  importedExamId.value = targetExamId

  const fd = new FormData()
  fd.append('file', csvFile.value)
  fd.append('exam_id', targetExamId)
  fd.append('status', status.value)
  fd.append('visibility', visibility.value)
  // Optional: which Excel tab to import. Blank → backend uses the first sheet.
  if (fileSheetName.value.trim()) fd.append('sheet_name', fileSheetName.value.trim())

  try {
    // Authenticate the cross-origin upload with a Bearer token (not the blocked
    // third-party cookie). The backend prefers a Bearer over the cookie.
    const token = await ensureUploadToken()
    const res = await apiDirect<any>('/imports/files', {
      method: 'POST',
      body: fd,
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    })
    handleStartResponse(res)
  } catch (err: any) {
    errorMsg.value = importErr(err, 'Import failed to start.')
  } finally {
    submitting.value = false
  }
}

async function submitSheets() {
  errorMsg.value = ''
  // Never start a second import while one is active/paused.
  if (importTracker.active.value || importTracker.paused.value) return (errorMsg.value = 'An import is already running. Please wait for it to finish.')
  if (!sheetsUrl.value)              return (errorMsg.value = 'Please enter a Google Sheets URL.')
  if (!examId.value || examId.value === '0') return (errorMsg.value = 'Please select a bucket.')

  submitting.value = true
  const targetExamId = await resolveExamId()
  if (!targetExamId || targetExamId === '0') { submitting.value = false; return }
  importedExamId.value = targetExamId

  try {
    const res = await api<any>('/imports/sheets', {
      method: 'POST',
      body: {
        url: sheetsUrl.value,
        sheet_name: sheetName.value,
        exam_id: targetExamId,
        sync_schedule: syncSchedule.value,
        status: status.value,
        visibility: visibility.value,
      },
    })
    handleStartResponse(res)
  } catch (err: any) {
    errorMsg.value = importErr(err, 'Google Sheet import failed to start.')
  } finally {
    submitting.value = false
  }
}

function handleStartResponse(res: any) {
  if (res?.status === 'processing') {
    activeImportId.value = res.import_id ?? null
    totalRow.value = Number(res.total_row || rowCount.value || 0)
    progress.value = 0
    createdRow.value = 0
    importStatus.value = 0
    showProgress.value = true
    startPolling()
  } else {
    errorMsg.value = res?.msg || res?.message || 'Import failed to start.'
  }
}

// ── Progress polling ──────────────────────────────────────────────────────────
function startPolling() {
  stopPolling()
  pollTimer = setInterval(pollProgress, 2000)
  pollProgress()
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}
async function pollProgress() {
  try {
    const query: Record<string, any> = {}
    if (activeImportId.value) query.import_id = activeImportId.value
    const res = await api<any>('/imports/progress', { query })
    const d = res?.data
    if (!d) return

    importStatus.value = Number(d.status ?? 0)
    progress.value     = Number(d.progress ?? 0)
    createdRow.value   = Number(d.created_row ?? 0)
    totalRow.value     = Number(d.total_row ?? totalRow.value)

    // Let the page live-refresh its cards + list while this modal owns the poll.
    emit('progress', createdRow.value)

    // Show the completion summary ONLY on status=1 (truly done + counts settled), NOT
    // on progress >= 100 — that rounds up to 100 at ~99.5% and would show a not-yet-
    // final count (the 2198-vs-2209 glitch). Keep polling until status flips to 1.
    if (importStatus.value === 1) {
      progress.value = 100
      stopPolling()
      showProgress.value = false
      summary.value = d.summary ?? null
      showSummary.value = true
      emit('imported', importedExamId.value || examId.value)
    } else if (importStatus.value === 2) {
      stopPolling()
      showProgress.value = false
      errorMsg.value = res?.msg || 'Import failed.'
    } else if (importStatus.value === 3) {
      stopPolling()
      showProgress.value = false
    }
  } catch {
    // transient — keep polling
  }
}

async function stopImport() {
  try {
    await api('/imports/stop', {
      method: 'POST',
      body: activeImportId.value ? { import_id: activeImportId.value } : {},
    })
  } catch {}
  stopPolling()
  // Pause = stop the job (created_row preserved) and hand off to the top-of-page
  // card in a "paused" state with a Continue button, then close the modal cleanly
  // (don't drop the user back on the import form). Set showProgress=false first so
  // close() won't ALSO adopt it as a running import.
  showProgress.value = false
  importStatus.value = 3
  importTracker.adoptPaused({
    importId: activeImportId.value,
    examId: importedExamId.value || examId.value,
    progress: progress.value,
    createdRow: createdRow.value,
    totalRow: totalRow.value,
    api,
  })
  emit('update:modelValue', false)
}

// ── Close / reset ──────────────────────────────────────────────────────────────
function resetForm() {
  tab.value = 'csv'
  errorMsg.value = ''
  csvFile.value = null
  fileName.value = ''
  fileSheetName.value = ''
  sheetNames.value = []
  rowCount.value = null
  sheetsUrl.value = ''
  sheetName.value = ''
  syncSchedule.value = 'one-time'
  status.value = '0'
  showProgress.value = false
  showSummary.value = false
  summary.value = null
  progress.value = 0
  createdRow.value = 0
  totalRow.value = 0
  importStatus.value = 0
  activeImportId.value = null
  examId.value = props.examId ? String(props.examId) : '0'
  newExamName.value = ''
}

function close() {
  // If an import is still running, hand it to the background tracker so the
  // Question Bank page's banner keeps showing progress + Cancel after we close.
  if (showProgress.value && activeImportId.value && importStatus.value === 0) {
    importTracker.adopt({
      importId: activeImportId.value,
      examId: importedExamId.value || examId.value,
      progress: progress.value,
      createdRow: createdRow.value,
      totalRow: totalRow.value,
      api,
    })
  }
  stopPolling()
  emit('update:modelValue', false)
}
function closeSummary() {
  showSummary.value = false
  summary.value = null
  close()
}

// Re-expand a running background import back into the modal's progress view
// instead of showing a fresh upload form. Returns true if it reattached.
function reattachIfRunning(): boolean {
  if (!importTracker.active.value || !importTracker.importId.value) return false
  const snap = importTracker.handToModal()
  resetForm()
  activeImportId.value = snap.importId
  importedExamId.value = snap.examId
  examId.value    = snap.examId || examId.value
  progress.value  = snap.progress
  createdRow.value = snap.createdRow
  totalRow.value  = snap.totalRow
  importStatus.value = 0
  showProgress.value = true
  startPolling()
  return true
}

function openModal() {
  // Reopened "last import result" → jump straight to the stored summary (like admin),
  // not the upload form.
  if (props.previewSummary) {
    resetForm()
    summary.value = props.previewSummary
    importStatus.value = 1
    showProgress.value = false
    showSummary.value = true
    return
  }
  if (!reattachIfRunning()) resetForm()
  fetchExams()
}

watch(() => props.modelValue, (open) => {
  if (open) openModal()
  else stopPolling()
})

onMounted(() => {
  if (props.modelValue) openModal()
})
onBeforeUnmount(stopPolling)
</script>

<template>
  <div v-if="modelValue" class="iq-overlay" @click.self="close">
    <div class="iq-drawer">
      <!-- Header -->
      <div class="iq-header">
        <div>
          <div class="iq-title">Import Questions</div>
          <div class="iq-subtitle">Add your institution's questions to the bank</div>
        </div>
        <button class="iq-close" type="button" @click="close" aria-label="Close">✕</button>
      </div>

      <!-- Progress -->
      <div v-if="showProgress" class="iq-body">
        <div class="iq-prog-title">Import Progress <span class="iq-spinner"></span></div>
        <div class="iq-prog-sub">{{ progressText }}</div>
        <div class="iq-prog-track">
          <div v-if="progress > 0" class="iq-prog-bar" :style="{ width: progress + '%' }"></div>
          <div v-else class="iq-prog-indet"></div>
        </div>
        <div class="iq-prog-meta">
          <span>{{ progress }}%</span>
          <span>{{ createdRow }} / {{ totalRow || '...' }} rows</span>
        </div>
        <button class="iq-btn iq-btn-outline" style="width:100%;margin-top:14px" type="button" @click="stopImport">
          Stop Processing
        </button>
      </div>

      <!-- Summary -->
      <div v-else-if="showSummary && summary" class="iq-body">
        <div class="iq-title" style="margin-bottom:4px">Import Complete</div>
        <div v-if="summary.imported_at" style="font-size:.78rem;color:var(--ink-dim);margin-bottom:14px">
          Imported on {{ fmtImportDate(summary.imported_at) }}
        </div>
        <div class="iq-sum-row iq-sum-green">
          <span>✓ {{ summary.imported_published }} questions published</span>
        </div>
        <div v-if="summary.imported_draft > 0" class="iq-sum-row">
          <span>✓ {{ summary.imported_draft }} questions saved as draft</span>
        </div>
        <div v-if="summary.to_approve > 0" class="iq-sum-row iq-sum-amber">
          <span>⚠ {{ summary.to_approve }} questions need review</span>
        </div>
        <!-- `in_review` used to cover BOTH of these and every surface called them all
             "duplicates" — which is what made a taxonomy problem look like a dedup
             blocker. They are different outcomes and need different actions. -->

        <!-- Already in this exam. Nothing to do — a re-import skips them again. -->
        <div v-if="summary.duplicate_count > 0" class="iq-sum-row">
          <span>↷ {{ summary.duplicate_count }} duplicate{{ summary.duplicate_count === 1 ? '' : 's' }} skipped — already in your institution's questions</span>
        </div>

        <!-- Never entered the bank. The sheet has to be corrected. -->
        <div v-if="summary.rejected_count > 0" class="iq-sum-row iq-sum-red">
          <span>✕ {{ summary.rejected_count }} question{{ summary.rejected_count === 1 ? '' : 's' }} rejected — not imported</span>
        </div>
        <div v-if="summary.skipped > 0" class="iq-sum-row iq-sum-red">
          <span>⚠ {{ summary.skipped }} rows skipped</span>
        </div>

        <!-- Per-row reasons: the author needs to know EXACTLY which rows and why, so
             they can fix the sheet. Rejected = must fix; flagged = imported but needs
             a review; duplicates = informational. -->
        <div v-if="(summary.rejected_rows && summary.rejected_rows.length) || (summary.flagged_rows && summary.flagged_rows.length)"
             class="iq-reasonbox">
          <div v-if="summary.rejected_rows && summary.rejected_rows.length" class="iq-reason-group">
            <div class="iq-reason-head">Rejected — not imported. Fix these and re-import:</div>
            <div v-for="(r, i) in summary.rejected_rows" :key="'rej' + i" class="iq-reason-row">
              <span class="iq-reason-rn">Row {{ r.row_number }}</span>
              <span class="iq-reason-txt">{{ r.reason }}</span>
            </div>
          </div>
          <div v-if="summary.flagged_rows && summary.flagged_rows.length" class="iq-reason-group">
            <div class="iq-reason-head">Imported but need review:</div>
            <div v-for="(r, i) in summary.flagged_rows" :key="'flg' + i" class="iq-reason-row">
              <span class="iq-reason-rn">Row {{ r.row_number }}</span>
              <span class="iq-reason-txt">{{ r.reason }}</span>
            </div>
          </div>
          <div class="iq-reason-hint">
            The <strong>Valid Values</strong> tab of the template lists every allowed
            clinical area / sub-topic / knowledge type / cognitive task / difficulty.
          </div>
        </div>

        <!-- Duplicates — informational, which rows were already in the exam. -->
        <div v-if="summary.duplicate_rows && summary.duplicate_rows.length" class="iq-reasonbox iq-reasonbox-muted">
          <div class="iq-reason-head">Skipped as duplicates (already in your institution's questions):</div>
          <div v-for="(r, i) in summary.duplicate_rows" :key="'dup' + i" class="iq-reason-row">
            <span class="iq-reason-rn">Row {{ r.row_number }}</span>
            <span class="iq-reason-txt">{{ r.reason }}</span>
          </div>
        </div>
        <div v-if="autoCreatedSummary" class="iq-sum-row iq-sum-teal">
          <span>+ {{ autoCreatedSummary }}</span>
        </div>
        <div class="iq-prog-meta" style="justify-content:flex-end;margin-top:6px">
          Total rows processed: {{ summary.total_rows }}
        </div>
        <button class="iq-btn iq-btn-primary" style="width:100%;margin-top:16px" type="button" @click="closeSummary">
          Done
        </button>
      </div>

      <!-- Form -->
      <div v-else class="iq-body">
        <div class="iq-tabs">
          <button class="iq-tab" :class="{ active: tab === 'csv' }" type="button" @click="tab = 'csv'">Excel file</button>
          <button class="iq-tab" :class="{ active: tab === 'sheets' }" type="button" @click="tab = 'sheets'">Google Sheets</button>
        </div>

        <div v-if="errorMsg" class="iq-error">{{ errorMsg }}</div>

        <!-- Excel file pane -->
        <div v-if="tab === 'csv'">
          <div class="iq-drop" @click="fileInput?.click()" @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
            <div class="iq-drop-title">Drop your file here</div>
            <div class="iq-drop-sub">or click to browse — .xlsx only</div>
            <input ref="fileInput" type="file" accept=".xlsx" hidden @change="pickFile" />
          </div>
          <div v-if="fileName" class="iq-file">
            ✓ {{ fileName }}<span v-if="rowCount !== null"> · {{ rowCount }} rows</span>
          </div>

          <!-- Which Excel tab to import. Only shown when the file has >1 sheet;
               the tab names are read from the file itself. -->
          <template v-if="fileName && sheetNames.length > 1">
            <label class="iq-label">Sheet to import <span style="font-weight:400;opacity:.7;">(this file has {{ sheetNames.length }} tabs)</span></label>
            <select v-model="fileSheetName" class="iq-input">
              <option value="">First sheet ({{ sheetNames[0] }}) — default</option>
              <option v-for="s in sheetNames" :key="s" :value="s">{{ s }}</option>
            </select>
          </template>

          <label class="iq-label">Bucket</label>
          <select v-model="examId" class="iq-input">
            <option value="0">— Select bucket —</option>
            <option v-for="e in exams" :key="e.id" :value="String(e.id)">{{ e.name }}</option>
            <option :value="NEW_EXAM">+ Create new bucket…</option>
          </select>
          <input
            v-if="examId === NEW_EXAM"
            v-model="newExamName"
            type="text"
            class="iq-input"
            style="margin-top:8px"
            placeholder="New bucket name (e.g. Year 4 Anatomy)"
            maxlength="255"
          />
          <div v-if="examId === NEW_EXAM" class="iq-note" style="margin-top:8px">
            A new exam owned by your institution will be created and your questions imported into it. It'll appear in your Question Bank.
          </div>

          <label class="iq-label">Source</label>
          <div class="iq-vis">
            <label class="iq-vis-opt" :class="{ on: visibility === 'private' }">
              <input type="radio" value="private" v-model="visibility" />
              <span><strong>Keep private to my institution</strong><small>Only your institution can see and use these questions.</small></span>
            </label>
            <label class="iq-vis-opt" :class="{ on: visibility === 'public' }">
              <input type="radio" value="public" v-model="visibility" />
              <span><strong>Contribute to the shared pool</strong><small>Shown with your institution as the author. Any institution — including competitors — can then use them.</small></span>
            </label>
          </div>


          <!-- These are the INSTITUTION sheet's labels. There is no `domain` column:
               that one exists on the admin sheet only, to record the real clinical area
               when Passmed's blueprint subject isn't one. Here, Clinical Area IS the
               clinical area. -->
          <div class="iq-cols">
            <div class="iq-cols-title">Expected columns</div>
            EXAM, <strong>CLINICAL AREA</strong>, <strong>COGNITIVE TASK</strong>,
            <strong>SUB-TOPIC</strong>, <strong>KNOWLEDGE TYPE</strong>,
            <strong>DIFFICULTY</strong>, QUESTION, OPTION A, OPTION B, OPTION C,
            OPTION D, OPTION E, CORRECT ANSWER (A-E), EXPLANATION
            <span style="color:var(--ink-faint, #94a3b8);"> · optional: REFERENCE</span>
            <div style="margin-top:5px;color:var(--ink-dim);font-size:0.72rem;">
              The <strong>bold</strong> columns are controlled — pick from the dropdowns in
              the template. Anything else is rejected.
            </div>
            <div style="margin-top:6px;">
              <a href="#" @click.prevent="downloadTemplate" style="color:var(--teal, #0891b2);font-weight:600;text-decoration:underline;">Download Excel template</a>
              <span style="color:var(--ink-faint, #94a3b8);"> — the <code>exam</code> column must match the bucket selected above.</span>
            </div>
          </div>

          <div class="iq-actions">
            <button class="iq-btn iq-btn-primary" type="button" :disabled="submitting" @click="submitCsv">
              <span v-if="submitting" class="iq-spinner-btn"></span>{{ submitting ? 'Starting…' : 'Import Questions' }}
            </button>
            <button class="iq-btn iq-btn-outline" type="button" @click="close">Cancel</button>
          </div>
        </div>

        <!-- Sheets pane -->
        <div v-else>
          <div class="iq-note">
            Paste a shareable Google Sheets link (Anyone with the link can view). The first row must be the header.
          </div>

          <label class="iq-label">Google Sheets URL</label>
          <input v-model="sheetsUrl" class="iq-input" type="url" placeholder="https://docs.google.com/spreadsheets/d/..." />

          <label class="iq-label">Sheet / Tab name <span class="iq-hint">(blank = first sheet)</span></label>
          <input v-model="sheetName" class="iq-input" type="text" placeholder="e.g. Questions" />

          <label class="iq-label">Bucket</label>
          <select v-model="examId" class="iq-input">
            <option value="0">— Select bucket —</option>
            <option v-for="e in exams" :key="e.id" :value="String(e.id)">{{ e.name }}</option>
            <option :value="NEW_EXAM">+ Create new bucket…</option>
          </select>
          <input
            v-if="examId === NEW_EXAM"
            v-model="newExamName"
            type="text"
            class="iq-input"
            style="margin-top:8px"
            placeholder="New bucket name (e.g. Year 4 Anatomy)"
            maxlength="255"
          />
          <div v-if="examId === NEW_EXAM" class="iq-note" style="margin-top:8px">
            A new exam owned by your institution will be created and your questions imported into it. It'll appear in your Question Bank.
          </div>

          <label class="iq-label">Sync schedule</label>
          <select v-model="syncSchedule" class="iq-input">
            <option value="one-time">One-time import</option>
            <option value="auto-sync-daily">Auto-sync daily</option>
            <option value="auto-sync-weekly">Auto-sync weekly</option>
            <option value="manual">Manual re-sync only</option>
          </select>

          <label class="iq-label">Source</label>
          <div class="iq-vis">
            <label class="iq-vis-opt" :class="{ on: visibility === 'private' }">
              <input type="radio" value="private" v-model="visibility" />
              <span><strong>Keep private to my institution</strong><small>Only your institution can see and use these questions.</small></span>
            </label>
            <label class="iq-vis-opt" :class="{ on: visibility === 'public' }">
              <input type="radio" value="public" v-model="visibility" />
              <span><strong>Contribute to the shared pool</strong><small>Shown with your institution as the author. Any institution — including competitors — can then use them.</small></span>
            </label>
          </div>


          <div class="iq-actions">
            <button class="iq-btn iq-btn-primary" type="button" :disabled="submitting" @click="submitSheets">
              <span v-if="submitting" class="iq-spinner-btn"></span>{{ submitting ? 'Starting…' : 'Connect & Import' }}
            </button>
            <button class="iq-btn iq-btn-outline" type="button" @click="close">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.iq-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 48px 16px; overflow-y: auto;
}
.iq-drawer {
  width: 600px; max-width: 100%;
  background: var(--white, #fff);
  display: flex; flex-direction: column;
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.28);
  max-height: calc(100dvh - 96px);
  overflow-y: auto;
  margin: auto;
}
.iq-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 20px 22px; border-bottom: 1px solid var(--border, #e5e7eb);
}
.iq-title { font-size: 1.05rem; font-weight: 800; color: var(--ink, #0f172a); }
.iq-subtitle { font-size: 0.8rem; color: var(--ink-dim, #64748b); margin-top: 3px; }
.iq-close {
  background: transparent; border: 0; cursor: pointer;
  font-size: 1rem; color: var(--ink-dim, #64748b); line-height: 1;
}
.iq-body { padding: 20px 22px; }
.iq-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.iq-tab {
  flex: 1; padding: 9px 0; border: 1.5px solid var(--border, #e5e7eb);
  background: var(--white, #fff); border-radius: 8px; cursor: pointer;
  font-weight: 600; font-size: 0.85rem; color: var(--ink-mid, #475569);
}
.iq-tab.active { border-color: var(--teal, #06b6d4); background: var(--teal-pale, #ecfeff); color: var(--teal-mid, #0e7490); }
.iq-error {
  background: rgba(220,38,38,0.06); border: 1.5px solid rgba(220,38,38,0.2);
  color: #b91c1c; padding: 9px 12px; border-radius: 8px; font-size: 0.82rem; margin-bottom: 14px;
}
.iq-drop {
  border: 2px dashed var(--border, #cbd5e1); border-radius: 10px;
  padding: 26px 14px; text-align: center; cursor: pointer; transition: 0.15s;
}
.iq-drop.dragover { border-color: var(--teal, #06b6d4); background: var(--teal-pale, #ecfeff); }
.iq-drop-title { font-weight: 700; color: var(--ink, #0f172a); }
.iq-drop-sub { font-size: 0.78rem; color: var(--ink-dim, #64748b); margin-top: 4px; }
.iq-file {
  margin-top: 10px; font-size: 0.82rem; color: var(--green, #059669); font-weight: 600;
}
.iq-label {
  display: block; margin: 16px 0 6px; font-size: 0.74rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-dim, #64748b);
}
.iq-hint { font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--ink-dim, #94a3b8); }
.iq-input {
  width: 100%; padding: 10px 12px; border: 1.5px solid var(--border, #e5e7eb);
  border-radius: 8px; font-size: 0.85rem; color: var(--ink, #0f172a); background: var(--white, #fff);
}
.iq-note, .iq-cols {
  background: rgba(6,182,212,0.06); border: 1.5px solid rgba(6,182,212,0.18);
  border-radius: 8px; padding: 11px 13px; font-size: 0.78rem; color: var(--ink-mid, #475569);
  line-height: 1.5; margin: 14px 0 4px;
}
/* Part 3 — import visibility control */
.iq-vis { display: flex; flex-direction: column; gap: 8px; }
.iq-vis-opt {
  display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px;
  border: 1.5px solid var(--border, #e5e7eb); border-radius: 8px; cursor: pointer;
  transition: border-color .14s, background .14s;
}
.iq-vis-opt.on { border-color: var(--teal, #06b6d4); background: rgba(6,182,212,0.06); }
.iq-vis-opt input { margin-top: 3px; flex-shrink: 0; accent-color: var(--teal, #06b6d4); }
.iq-vis-opt span { display: flex; flex-direction: column; gap: 2px; }
.iq-vis-opt strong { font-size: 0.82rem; color: var(--ink, #0f172a); font-weight: 700; }
.iq-vis-opt small { font-size: 0.72rem; color: var(--ink-dim, #64748b); line-height: 1.45; }
.iq-cols-title { font-weight: 700; margin-bottom: 4px; color: var(--ink-dim, #475569); }
.iq-actions { display: flex; gap: 8px; margin-top: 18px; }
.iq-btn {
  padding: 10px 16px; border-radius: 8px; font-weight: 700; font-size: 0.85rem;
  cursor: pointer; border: 1.5px solid transparent;
}
.iq-btn-primary { flex: 1; background: var(--teal, #06b6d4); color: #fff; }
.iq-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.iq-btn-outline { background: var(--white, #fff); border-color: var(--border, #e5e7eb); color: var(--ink-mid, #475569); }
/* progress */
.iq-prog-title { font-size: 0.92rem; font-weight: 700; color: var(--ink, #111827); }
.iq-prog-sub { font-size: 0.78rem; color: var(--ink-dim, #6b7280); margin: 4px 0 12px; }
.iq-prog-track { position: relative; height: 10px; background: #e5e7eb; border-radius: 999px; overflow: hidden; }
.iq-prog-bar { height: 100%; background: linear-gradient(90deg, #06b6d4, #10b981); border-radius: 999px; transition: width 0.4s ease; }
.iq-prog-indet { position: absolute; top: 0; height: 100%; width: 40%; background: linear-gradient(90deg, #06b6d4, #10b981); border-radius: 999px; animation: iqSlide 1.2s ease-in-out infinite; }
@keyframes iqSlide { 0% { left: -40%; } 100% { left: 100%; } }
.iq-prog-meta { display: flex; justify-content: space-between; margin-top: 10px; font-size: 0.78rem; color: var(--ink-mid, #4b5563); }
.iq-spinner { display: inline-block; width: 12px; height: 12px; margin-left: 6px; border: 2px solid rgba(6,182,212,0.3); border-top-color: #06b6d4; border-radius: 50%; vertical-align: middle; animation: iqSpin 0.7s linear infinite; }
/* White spinner shown on the primary submit button during the /imports POST. */
.iq-spinner-btn { display: inline-block; width: 12px; height: 12px; margin-right: 8px; border: 2px solid rgba(255,255,255,0.45); border-top-color: #fff; border-radius: 50%; vertical-align: middle; animation: iqSpin 0.7s linear infinite; }
@keyframes iqSpin { to { transform: rotate(360deg); } }
/* summary */
.iq-sum-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 13px; border-radius: 7px; font-size: 0.84rem; margin-bottom: 8px; background: var(--surface, #f8fafc); border: 1.5px solid var(--border, #e5e7eb); color: var(--ink, #0f172a); }
.iq-sum-green { background: rgba(16,185,129,0.07); border-color: rgba(16,185,129,0.22); }
.iq-sum-amber { background: rgba(245,158,11,0.07); border-color: rgba(245,158,11,0.22); }
.iq-sum-red { background: rgba(220,38,38,0.06); border-color: rgba(220,38,38,0.18); }
.iq-sum-teal { background: rgba(6,182,212,0.07); border-color: rgba(6,182,212,0.22); }
/* Rejected — one explanation for the whole batch. Per-row reasons are recorded
   server-side but not dumped here: they all share one cause and one fix, and the
   list only made the popup look broken. */
.iq-rejectbox { background: rgba(220,38,38,0.04); border: 1.5px solid rgba(220,38,38,0.18); border-radius: 7px; padding: 11px 13px; font-size: 0.78rem; margin-top: 4px; color: var(--ink-mid, #475569); line-height: 1.55; }

/* Per-row reasons (rejected / flagged / duplicate). */
.iq-reasonbox { background: rgba(220,38,38,0.04); border: 1.5px solid rgba(220,38,38,0.18); border-radius: 7px; padding: 10px 12px; margin-top: 4px; margin-bottom: 8px; }
.iq-reasonbox-muted { background: var(--surface, #f8fafc); border-color: var(--border, #e5e7eb); }
.iq-reason-group { margin-bottom: 8px; }
.iq-reason-head { font-size: 0.74rem; font-weight: 700; color: var(--ink, #0f172a); margin-bottom: 5px; }
.iq-reason-row { display: flex; gap: 8px; align-items: baseline; padding: 3px 0; font-size: 0.76rem; color: var(--ink-mid, #475569); line-height: 1.4; }
.iq-reason-rn { flex: none; font-weight: 600; color: var(--ink, #0f172a); min-width: 54px; }
.iq-reason-txt { flex: 1 1 auto; }
.iq-reason-hint { font-size: 0.72rem; color: var(--ink-dim, #94a3b8); margin-top: 6px; line-height: 1.5; }
</style>
