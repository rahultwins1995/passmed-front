// Shared, page-independent import-progress tracker.
//
// The Import Questions modal starts a background job and polls /imports/progress.
// If the admin closes the modal mid-import, the modal hands the running import to
// this tracker (adopt) so a banner on the Question Bank page keeps showing progress
// and a Cancel control — the poll loop lives at module scope, so it survives the
// modal (and any component) unmounting.

let pollTimer: ReturnType<typeof setInterval> | null = null
let apiRef: ((url: string, opts?: any) => Promise<any>) | null = null

export function useImportProgress() {
  const active     = useState<boolean>('imp-active', () => false)
  const importId   = useState<number | null>('imp-import-id', () => null)
  const progress   = useState<number>('imp-progress', () => 0)
  const createdRow  = useState<number>('imp-created', () => 0)
  const totalRow   = useState<number>('imp-total', () => 0)
  const examId     = useState<string>('imp-exam', () => '')
  // Set to the target exam id when an import finishes successfully — pages watch
  // this to refresh their list, then clear it.
  const finishedExamId = useState<string | null>('imp-finished', () => null)
  // Completion state — stays true (toast persists) until the user dismisses it.
  const paused          = useState<boolean>('imp-paused', () => false)
  const done            = useState<boolean>('imp-done', () => false)
  const failed          = useState<boolean>('imp-failed', () => false)
  const publishedCount  = useState<number>('imp-published', () => 0)
  // NOTE: dedup itself lives entirely in the BACKEND (QuestionImportService). Nothing
  // in this file, or in ImportQuestionModal.vue, decides what is a duplicate — they
  // only display what the import summary reports. An audit of this layer can never
  // show a dedup change, and none is expected here.
  //
  // The two counters below are DIFFERENT outcomes. They were both reported as
  // "duplicates" for a long time, which is what made an out-of-vocabulary taxonomy
  // problem look like a dedup blocker:
  const duplicateCount  = useState<number>('imp-duplicate', () => 0) // already in this exam → skipped, no action
  const rejectedCount   = useState<number>('imp-rejected', () => 0)  // NOT imported (taxonomy outside the controlled list) → fix the sheet, re-import
  const reviewCount     = useState<number>('imp-review', () => 0)    // imported but failed validation → needs approval
  const skippedCount    = useState<number>('imp-skipped', () => 0)   // rows skipped
  /** @deprecated total of duplicate + rejected. Kept so old callers don't break. */
  const flaggedCount    = useState<number>('imp-flagged', () => 0)
  // The last COMPLETED import's summary, kept so the page can offer a "View last
  // import result" button that reopens the report even after a reload / logout
  // (rehydrate re-reads it from the server). Mirrors the admin portal's button.
  const lastReport      = useState<any>('imp-last-report', () => null)
  // The FULL last-completed summary object (published/draft/to-approve/duplicate/
  // rejected + per-row lists + imported_at) — drives the reopened report MODAL so it
  // matches the admin portal's full popup, not just the one-line toast.
  const lastReportSummary = useState<any>('imp-last-report-summary', () => null)

  const progressText = computed(() =>
    progress.value >= 100 ? 'Import completed'
      : progress.value > 0 ? `Import in progress… ${progress.value}%`
      : 'Preparing import…'
  )

  function startPolling() {
    stopPolling()
    pollTimer = setInterval(poll, 2000)
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  }

  async function poll() {
    if (!apiRef || !active.value) return
    try {
      const query: Record<string, any> = {}
      if (importId.value) query.import_id = importId.value
      const res = await apiRef('/imports/progress', { query })
      const d = res?.data
      if (!d) return
      const st = Number(d.status ?? 0)
      progress.value   = Number(d.progress ?? 0)
      createdRow.value = Number(d.created_row ?? 0)
      totalRow.value   = Number(d.total_row ?? totalRow.value)
      // Complete ONLY on status=1 (backend truly-done + counts settled). NOT on
      // progress >= 100: progress = round(created_row/total_row*100) rounds up to 100
      // at ~99.5%, so capturing the summary then shows a not-yet-final count (the
      // "2198 then 2209 on reopen" glitch). Keep polling until status flips to 1.
      if (st === 1) {
        progress.value = 100
        const s = d.summary ?? {}
        lastReportSummary.value = d.summary ?? null   // full summary for the reopen modal
        publishedCount.value = Number(s.imported_published ?? s.imported ?? createdRow.value ?? 0)
        // The backend now splits the conflict queue by outcome. Fall back to the old
        // lumped `in_review` only if an older backend is still deployed.
        duplicateCount.value = Number(s.duplicate_count ?? 0)   // already in this exam
        rejectedCount.value  = Number(s.rejected_count ?? s.in_review ?? 0) // not imported
        reviewCount.value    = Number(s.to_approve ?? 0)        // imported, needs approval
        skippedCount.value   = Number(s.skipped ?? 0)
        flaggedCount.value   = Number(s.in_review ?? 0)         // deprecated total
        // Stash so the report can be reopened later (survives dismiss + reload).
        lastReport.value = {
          examId:    examId.value,
          published: publishedCount.value,
          duplicate: duplicateCount.value,
          rejected:  rejectedCount.value,
          review:    reviewCount.value,
          skipped:   skippedCount.value,
          inReview:  flaggedCount.value,
        }
        finishOk(examId.value)
      } else if (st === 2) { finishFail() }   // failed
      else if (st === 3)   { enterPaused() }  // paused (stopped, resumable)
    } catch { /* transient — keep polling */ }
  }

  // Success → show a persistent "N published" toast + refresh the list.
  function finishOk(exam: string | null) {
    stopPolling()
    active.value = false; paused.value = false
    failed.value = false
    done.value = true
    if (exam) finishedExamId.value = exam
  }
  function finishFail() {
    stopPolling()
    active.value = false; paused.value = false
    failed.value = true
    done.value = true
  }
  // Paused: stopped at created_row, resumable via /imports/resume.
  function enterPaused() {
    stopPolling()
    active.value = false
    done.value = false
    paused.value = true
  }

  // Clear the completion toast + reopen-report state. Called at the start of
  // rehydrate so a previous session's / another institution's report can't linger.
  function resetReport() {
    lastReport.value = null
    lastReportSummary.value = null
    done.value = false
    failed.value = false
    publishedCount.value = 0; duplicateCount.value = 0; rejectedCount.value = 0
    reviewCount.value = 0; skippedCount.value = 0; flaggedCount.value = 0
  }

  // Restore a running/paused import after a full page reload (or logout→login).
  // The tracker state lives in memory and is wiped on refresh, but the backend
  // job keeps going — so on page load we ask the server for the institution's
  // latest import and re-attach if it's still processing (0) or paused (3). This
  // keeps the toast + disabled Import button alive until the import COMPLETES or
  // the user cancels — nothing else clears it.
  async function rehydrate(api: (url: string, opts?: any) => Promise<any>) {
    // Don't clobber a genuinely running/paused in-session import.
    if (active.value || paused.value) return
    apiRef = api
    // Wipe any stale report/toast FIRST. The backend /imports/progress is
    // institution-scoped, so we re-derive everything from it here — this is what stops
    // ONE institution's "last import result" leaking into ANOTHER institution's session
    // after a logout→login in the same browser (the useState survives the SPA session).
    resetReport()
    try {
      const res = await api('/imports/progress', {})   // no import_id → latest import
      const d = res?.data
      if (!d || !d.import_id) return   // this institution has no import → stays cleared
      const st = Number(d.status ?? 0)

      // Completed while the user was away (reload / logout→login): the live toast is
      // gone, but stash the summary so the page can offer a "View last import result"
      // button to reopen it. We do NOT auto-pop the toast (that would nag on every
      // reload) — the user reopens it on demand.
      if (st === 1) {
        const s = d.summary ?? {}
        lastReportSummary.value = d.summary ?? null   // full summary for the reopen modal
        lastReport.value = {
          examId:    d.exam_id != null ? String(d.exam_id) : '',
          published: Number(s.imported_published ?? s.imported ?? d.created_row ?? 0),
          duplicate: Number(s.duplicate_count ?? 0),
          rejected:  Number(s.rejected_count ?? s.in_review ?? 0),
          review:    Number(s.to_approve ?? 0),
          skipped:   Number(s.skipped ?? 0),
          inReview:  Number(s.in_review ?? 0),
        }
        return
      }

      if (st !== 0 && st !== 3) return                  // 2 fail → nothing to restore
      importId.value   = d.import_id
      examId.value     = d.exam_id != null ? String(d.exam_id) : ''
      progress.value   = Number(d.progress ?? 0)
      createdRow.value = Number(d.created_row ?? 0)
      totalRow.value   = Number(d.total_row ?? 0)
      finishedExamId.value = null
      done.value = false; failed.value = false
      if (st === 0) { paused.value = false; active.value = true; startPolling() }
      else          { active.value = false; paused.value = true }   // st === 3
    } catch { /* offline / transient — leave tracker idle */ }
  }

  // Take over a running import from the modal so it keeps tracking in the banner.
  function adopt(o: {
    importId: number | null; examId: string
    progress: number; createdRow: number; totalRow: number
    api: (url: string, opts?: any) => Promise<any>
  }) {
    apiRef = o.api
    importId.value   = o.importId
    examId.value     = o.examId
    progress.value   = o.progress
    createdRow.value = o.createdRow
    totalRow.value   = o.totalRow
    finishedExamId.value = null
    done.value = false
    failed.value = false
    paused.value = false
    active.value = true
    startPolling()
  }

  // Hand off an already-stopped (paused) import from the modal so the top card
  // shows a "Continue" state. The modal has already called /imports/stop.
  function adoptPaused(o: {
    importId: number | null; examId: string
    progress: number; createdRow: number; totalRow: number
    api: (url: string, opts?: any) => Promise<any>
  }) {
    apiRef = o.api
    importId.value   = o.importId
    examId.value     = o.examId
    progress.value   = o.progress
    createdRow.value = o.createdRow
    totalRow.value   = o.totalRow
    finishedExamId.value = null
    done.value = false; failed.value = false; active.value = false
    paused.value = true
  }

  // Pause a running (background) import from the top card.
  async function pause() {
    try {
      if (apiRef && importId.value) {
        await apiRef('/imports/stop', { method: 'POST', body: { import_id: importId.value } })
      }
    } catch { /* ignore — still show paused so the user can retry */ }
    enterPaused()
  }

  // Resume from where it stopped (backend continues from created_row).
  async function resume() {
    if (!apiRef || !importId.value) return
    try {
      const res = await apiRef('/imports/resume', { method: 'POST', body: { import_id: importId.value } })
      if (res?.status === 'success') {
        paused.value = false
        done.value = false
        active.value = true
        startPolling()
      }
    } catch { /* stay paused so the user can retry */ }
  }

  // Re-expand a running import back INTO the Import modal. Stops the background
  // poll and hands the current snapshot to the modal, which takes over polling in
  // its own progress view. Clearing active/paused/done hides the on-page toast
  // while the modal owns it; if the modal is closed again mid-run, close() calls
  // adopt() and the toast returns. Mirrors the resume()/adopt() hand-off pattern.
  function handToModal() {
    stopPolling()
    const snap = {
      importId: importId.value,
      examId: examId.value,
      progress: progress.value,
      createdRow: createdRow.value,
      totalRow: totalRow.value,
    }
    active.value = false; paused.value = false; done.value = false
    return snap
  }

  // SAVE & EXIT — keep whatever was already imported, cancel the REST. Tells the
  // backend to mark the import terminal (status 4) so the running job aborts and
  // rehydrate() never restores it (otherwise the banner reappears on reload because
  // the server still reports it paused). The partial rows stay in the bank.
  async function saveAndExit() {
    try {
      if (apiRef && importId.value) {
        await apiRef('/imports/discard', { method: 'POST', body: { import_id: importId.value } })
      }
    } catch { /* ignore — still hide locally so the card goes away */ }
    stopPolling()
    active.value = false
    paused.value = false
    done.value = false
    if (examId.value) finishedExamId.value = examId.value
    importId.value = null
  }

  // DISCARD — roll back the WHOLE session: the backend hard-deletes every question
  // this import created (by import_file_id) and marks it cancelled. Destructive, so
  // the caller confirms first ("this will delete all N questions imported in this
  // session"). Unlike saveAndExit(), nothing from this import stays in the bank.
  async function rollback() {
    try {
      if (apiRef && importId.value) {
        await apiRef('/imports/rollback', { method: 'POST', body: { import_id: importId.value } })
      }
    } catch { /* ignore — still hide the card locally */ }
    stopPolling()
    active.value = false
    paused.value = false
    done.value = false
    if (examId.value) finishedExamId.value = examId.value   // refresh list (rows removed)
    importId.value = null
  }

  // Reopen the last completed import's report (opt-in, from the stashed/persisted
  // summary). Mirrors the admin "View last import result" button — survives dismiss
  // and reload because rehydrate re-reads it from the server.
  function openLastReport() {
    const r = lastReport.value
    if (!r) return
    publishedCount.value = Number(r.published ?? 0)
    duplicateCount.value = Number(r.duplicate ?? 0)
    rejectedCount.value  = Number(r.rejected ?? 0)
    reviewCount.value    = Number(r.review ?? 0)
    skippedCount.value   = Number(r.skipped ?? 0)
    flaggedCount.value   = Number(r.inReview ?? 0)
    if (r.examId) examId.value = String(r.examId)
    active.value = false; paused.value = false; failed.value = false
    done.value = true
  }

  function clearFinished() { finishedExamId.value = null }
  // Dismiss the completion toast (the ✕).
  function dismiss() {
    done.value = false; failed.value = false
    publishedCount.value = 0; flaggedCount.value = 0; reviewCount.value = 0; skippedCount.value = 0
    duplicateCount.value = 0; rejectedCount.value = 0
  }

  return {
    active, paused, importId, progress, createdRow, totalRow, examId,
    finishedExamId, done, failed, publishedCount, flaggedCount, reviewCount, skippedCount,
    duplicateCount, rejectedCount, lastReport, lastReportSummary,
    progressText, rehydrate, adopt, adoptPaused, handToModal, pause, resume, saveAndExit, rollback, clearFinished, dismiss, openLastReport,
  }
}
