// ─── useMockBadge ─────────────────────────────────────────────────────────────
// Shared state for the Mock Exams sidebar badge.
// - StudentSidebar fetches on mount (so badge is always visible, even before
//   the user visits /student/mock).
// - mock.vue updates the count after loading exams (no extra API call needed).
// Both share the same useState key so there is no duplication.

export function useMockBadge() {
  const studentApi = useStudentApi()

  // null  = not yet fetched
  // 0     = fetched, nothing new
  // N     = N new/active exams
  const newCount = useState<number | null>('mock:badge:count', () => null)
  // Total mocks available for the active exam (regardless of completion).
  // null = not yet fetched, 0 = exam has no mocks, N = N mocks exist.
  // Drives whether the sidebar shows the Mock Exams nav item at all — distinct
  // from `newCount` (incomplete only), so completing every mock doesn't make
  // the menu item vanish.
  const total    = useState<number | null>('mock:badge:total',  () => null)
  const fetched  = useState<boolean>('mock:badge:fetched',  () => false)

  // Called by StudentSidebar on mount — lightweight, skipped if mock.vue
  // already populated the state.
  async function fetchBadge(force = false) {
    if (fetched.value && !force) return
    try {
      const res = await studentApi<any>('/mock-exams')
      if (res?.status === 'success') {
        _compute(res.data ?? [])
      }
    } catch {}
    fetched.value = true
  }

  // Called by mock.vue after it loads exams — avoids a second API call.
  function updateFromExams(exams: { studentStatus: string; assignmentStatus: string }[]) {
    _compute(exams)
    fetched.value = true
  }

  // Count all exams not yet completed by this student (active + scheduled).
  function _compute(list: any[]) {
    const arr = Array.isArray(list) ? list : []
    total.value = arr.length
    newCount.value = arr.filter(e => {
      const status = e.student_status ?? e.studentStatus ?? 'pending'
      return status !== 'completed'
    }).length
  }

  const pillLabel = computed(() =>
    newCount.value ? `${newCount.value} new` : null
  )

  return { newCount, total, pillLabel, fetchBadge, updateFromExams }
}
