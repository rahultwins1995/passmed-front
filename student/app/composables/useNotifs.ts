// composables/useNotifs.ts
//
// Notifications state + backend wiring. All persistence happens via
// /api-student/v1/notifications/*. The frontend keeps a useState-shared
// `notifs` list + a `counts` object so the sidebar badge and the notifs
// page stay in lock-step.

// Backend type values (note: `new_content` not `content`)
type ApiNotifType = 'milestone' | 'reminder' | 'new_content' | 'account' | 'default'
// Frontend type values
type NotifType = 'milestone' | 'reminder' | 'content' | 'account' | 'default'

export interface Notif {
  id: number
  type: NotifType
  read: boolean
  time: string                     // human-readable (created_at from API)
  title: string
  desc: string
  // `link` is not in the backend response yet. Kept as null so the existing
  // UI's `n.link ? ...` checks still work. Wire it later if the API grows.
  link: { label: string; page: string } | null
}

export interface NotifCounts {
  total_unread: number
  total_read:   number
  all_total:    number
}

// ─── Backend ↔ frontend type mapping ─────────────────────────────────────
function toFeType(t: string): NotifType {
  if (t === 'new_content') return 'content'
  if (t === 'milestone' || t === 'reminder' || t === 'account' || t === 'default') return t
  return 'default'
}
function toApiType(t: NotifType | 'all'): string {
  if (t === 'content') return 'new_content'
  return t   // 'all' | 'milestone' | 'reminder' | 'account' | 'default'
}

function mapApiRow(row: any): Notif {
  return {
    id:    Number(row.id),
    type:  toFeType(String(row.type || '')),
    read:  Number(row.is_read) === 1,
    time:  String(row.created_at || ''),
    title: String(row.title || ''),
    desc:  String(row.message || row.desc || ''),
    link:  null,
  }
}

export const useNotifs = () => {
  // Shared state (sidebar badge + notifs page read these).
  const notifs       = useState<Notif[]>('notifs:list',   () => [])
  const counts       = useState<NotifCounts>('notifs:counts', () => ({
    total_unread: 0, total_read: 0, all_total: 0,
  }))
  const loading      = useState<boolean>('notifs:loading', () => false)
  const fetchError   = useState<string>('notifs:error',   () => '')

  // `unreadCount` keeps the API surface backward-compatible — pages/sidebar
  // that already read `unreadCount` keep working without code changes.
  const unreadCount  = computed(() => counts.value.total_unread)

  // ─── List ────────────────────────────────────────────────────────────
  // GET /notifications?type=<all|milestone|reminder|new_content|account|default>
  async function fetchNotifs(type: NotifType | 'all' = 'all') {
    loading.value    = true
    fetchError.value = ''
    try {
      const studentApi = useStudentApi()
      const res: any = await studentApi('/notifications', {
        method: 'GET',
        params: { type: toApiType(type) },
      })
      const rows = Array.isArray(res?.data) ? res.data : []
      notifs.value = rows.map(mapApiRow)
    } catch (e: any) {
      fetchError.value = e?.data?.msg || e?.message || 'Failed to load notifications.'
      notifs.value = []
    } finally {
      loading.value = false
    }
  }

  // ─── Counts ──────────────────────────────────────────────────────────
  async function fetchCounts() {
    // Only poll when we believe the user is logged in.
    const user = useState<any | null>('auth_user', () => null)
    if (!user.value) return
    try {
      // silent401: this is a background poll — a transient 401 must NOT boot
      // the user to /login. So this client instance skips the global
      // auth-clear/redirect on 401 (unlike user-initiated calls).
      const studentApi = useStudentApi({ silent401: true })
      const res: any = await studentApi('/notifications/counts')
      counts.value = {
        total_unread: Number(res?.total_unread || 0),
        total_read:   Number(res?.total_read   || 0),
        all_total:    Number(res?.all_total    || 0),
      }
    } catch (e) {
      log.warn('notifs', 'fetchCounts failed', e)
    }
  }

  // ─── Single mark read ────────────────────────────────────────────────
  // PATCH /notifications/mark-read/{id}
  async function markRead(id: number) {
    // Optimistic flip — UI feels instant; on error we revert.
    const n = notifs.value.find(x => x.id === id)
    if (!n) return
    const prev = n.read
    if (n.read) return         // already read — no-op
    n.read = true
    counts.value.total_unread = Math.max(0, counts.value.total_unread - 1)
    counts.value.total_read   = counts.value.total_read + 1
    try {
      const studentApi = useStudentApi()
      await studentApi(`/notifications/mark-read/${id}`, { method: 'PATCH' })
    } catch (e) {
      log.warn('notifs', 'markRead failed', e)
      n.read = prev   // rollback
      counts.value.total_unread = counts.value.total_unread + 1
      counts.value.total_read   = Math.max(0, counts.value.total_read - 1)
    }
  }

  // Toggle wrapper for legacy callsites — backend only supports
  // mark-as-read (not unread). If a notification is already read, we
  // silently no-op the "toggle"; otherwise we mark-read via API.
  async function toggleRead(id: number) {
    const n = notifs.value.find(x => x.id === id)
    if (!n || n.read) return
    await markRead(id)
  }

  // ─── Mark all read ───────────────────────────────────────────────────
  // PATCH /notifications/all-mark-read
  // Returns true on success, false on failure (so the caller can show
  // a user-visible error instead of silently swallowing).
  async function markAllRead(): Promise<boolean> {
    const snapshot   = notifs.value.map(n => n.read)
    const prevCounts = { ...counts.value }
    // Optimistic UI update first
    notifs.value.forEach(n => { n.read = true })
    counts.value = {
      ...counts.value,
      total_read:   counts.value.all_total,
      total_unread: 0,
    }
    try {
      const studentApi = useStudentApi()
      const res: any = await studentApi('/notifications/all-mark-read', {
        method: 'PATCH',
      })
      // eslint-disable-next-line no-console
      return true
    } catch (e) {
      log.warn('notifs', 'markAllRead failed', e)
      // Rollback
      notifs.value.forEach((n, i) => { n.read = snapshot[i] })
      counts.value = prevCounts
      return false
    }
  }

  // ─── Delete single ───────────────────────────────────────────────────
  // DELETE /notifications/delete/{id}
  async function dismiss(id: number) {
    const idx = notifs.value.findIndex(n => n.id === id)
    if (idx === -1) return
    const removed = notifs.value[idx]
    notifs.value.splice(idx, 1)   // optimistic
    // Adjust counts (defensive — server is source of truth, but we
    // approximate so the badge stays in sync without a /counts roundtrip).
    counts.value.all_total = Math.max(0, counts.value.all_total - 1)
    if (removed.read) counts.value.total_read = Math.max(0, counts.value.total_read - 1)
    else              counts.value.total_unread = Math.max(0, counts.value.total_unread - 1)
    try {
      const studentApi = useStudentApi()
      await studentApi(`/notifications/delete/${id}`, { method: 'DELETE' })
    } catch (e) {
      log.warn('notifs', 'dismiss failed', e)
      // Rollback (re-insert at original position).
      notifs.value.splice(idx, 0, removed)
      counts.value.all_total = counts.value.all_total + 1
      if (removed.read) counts.value.total_read = counts.value.total_read + 1
      else              counts.value.total_unread = counts.value.total_unread + 1
    }
  }

  // ─── Clear all read ──────────────────────────────────────────────────
  // DELETE /notifications/clear-read
  // Returns true on success so the caller can show error feedback.
  async function clearRead(): Promise<boolean> {
    const removed = notifs.value.filter(n => n.read)
    // Even if nothing read locally, still POST so backend can clean its own
    // state (in case of drift between local and server view).
    const prev          = notifs.value.slice()
    const prevReadCount = counts.value.total_read
    notifs.value = notifs.value.filter(n => !n.read)
    counts.value.all_total  = Math.max(0, counts.value.all_total - removed.length)
    counts.value.total_read = 0
    try {
      const studentApi = useStudentApi()
      const res: any = await studentApi('/notifications/clear-read', {
        method: 'DELETE',
      })
      // eslint-disable-next-line no-console
      return true
    } catch (e) {
      log.warn('notifs', 'clearRead failed', e)
      notifs.value = prev
      counts.value.all_total  = counts.value.all_total + removed.length
      counts.value.total_read = prevReadCount
      return false
    }
  }

  // ─── Single detail (rarely used — list already has full row) ─────────
  async function fetchOne(id: number): Promise<Notif | null> {
    try {
      const studentApi = useStudentApi()
      const res: any = await studentApi(`/notifications/show/${id}`)
      const row = res?.data ?? res
      return row ? mapApiRow(row) : null
    } catch (e) {
      log.warn('notifs', 'fetchOne failed', e)
      return null
    }
  }

  return {
    // state
    notifs, counts, unreadCount, loading, fetchError,
    // actions (API-backed)
    fetchNotifs, fetchCounts,
    markRead, toggleRead, markAllRead,
    dismiss, clearRead,
    fetchOne,
  }
}
