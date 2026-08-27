// composables/useInstituteNotifs.ts
//
// Institute notifications state + backend wiring — mirror of the student
// layer's useNotifs, pointed at /api-institute/v1/messages/*. A useState-
// shared list + counts keep the sidebar badge and the notifications page
// in lock-step.
//
// Backend endpoints (Route::any, so plain GET/POST both work):
//   GET  /messages/?type=all&limit=50     → paginated list
//   GET  /messages/counts                 → { total_unread, total_read, all_total }
//   POST /messages/all-mark               → mark everything read
//   POST /messages/mark-as-read/{id}
//   POST /messages/clear-read             → remove read notifications
//   POST /messages/delete/{id}
//   GET  /messages/show/{id}

// Backend type values: milestone | new_content | account | reminder | default | message
export type InstNotifType = 'milestone' | 'new_content' | 'account' | 'reminder' | 'default' | 'message'

export interface InstNotif {
  id: number
  type: InstNotifType
  read: boolean
  time: string          // human-readable created_at from the API
  title: string
  desc: string
  from: string
}

export interface InstNotifCounts {
  total_unread: number
  total_read: number
  all_total: number
}

const KNOWN_TYPES: InstNotifType[] = ['milestone', 'new_content', 'account', 'reminder', 'default', 'message']

function mapApiRow(row: any): InstNotif {
  const t = String(row.type || 'default') as InstNotifType
  return {
    id:    Number(row.id),
    type:  KNOWN_TYPES.includes(t) ? t : 'default',
    read:  Number(row.is_read) === 1,
    time:  String(row.created_at || ''),
    title: String(row.title || ''),
    desc:  String(row.message || ''),
    from:  String(row.from_user || ''),
  }
}

export const useInstituteNotifs = () => {
  const notifs     = useState<InstNotif[]>('inotifs:list', () => [])
  const counts     = useState<InstNotifCounts>('inotifs:counts', () => ({
    total_unread: 0, total_read: 0, all_total: 0,
  }))
  const loading    = useState<boolean>('inotifs:loading', () => false)
  const fetchError = useState<string>('inotifs:error', () => '')

  const unreadCount = computed(() => counts.value.total_unread)

  // ─── List ────────────────────────────────────────────────────────────────
  async function fetchNotifs(type: InstNotifType | 'all' = 'all', limit = 50) {
    loading.value    = true
    fetchError.value = ''
    try {
      const api = useInstituteApi()
      const res: any = await api('/messages/', { params: { type, limit } })
      const rows = Array.isArray(res?.data) ? res.data : []
      notifs.value = rows.map(mapApiRow)
    } catch (e: any) {
      fetchError.value = e?.data?.msg || e?.message || 'Failed to load notifications.'
      notifs.value = []
      logError('[inotifs] fetchNotifs failed', e)
    } finally {
      loading.value = false
    }
  }

  // ─── Counts (background poll — drives the sidebar badge) ─────────────────
  async function fetchCounts() {
    try {
      const api = useInstituteApi()
      const res: any = await api('/messages/counts')
      counts.value = {
        total_unread: Number(res?.total_unread || 0),
        total_read:   Number(res?.total_read   || 0),
        all_total:    Number(res?.all_total    || 0),
      }
    } catch (e) {
      logWarn('[inotifs] fetchCounts failed', e)
    }
  }

  // ─── Single mark read (optimistic, rollback on error) ────────────────────
  async function markRead(id: number) {
    const n = notifs.value.find(x => x.id === id)
    if (!n || n.read) return
    n.read = true
    counts.value.total_unread = Math.max(0, counts.value.total_unread - 1)
    counts.value.total_read  += 1
    try {
      const api = useInstituteApi()
      await api(`/messages/mark-as-read/${id}`, { method: 'POST' })
    } catch (e) {
      logWarn('[inotifs] markRead failed', e)
      n.read = false
      counts.value.total_unread += 1
      counts.value.total_read    = Math.max(0, counts.value.total_read - 1)
    }
  }

  // ─── Mark all read ────────────────────────────────────────────────────────
  async function markAllRead(): Promise<boolean> {
    const snapshot   = notifs.value.map(n => n.read)
    const prevCounts = { ...counts.value }
    notifs.value.forEach(n => { n.read = true })
    counts.value = { ...counts.value, total_read: counts.value.all_total, total_unread: 0 }
    try {
      const api = useInstituteApi()
      await api('/messages/all-mark', { method: 'POST' })
      return true
    } catch (e) {
      logWarn('[inotifs] markAllRead failed', e)
      notifs.value.forEach((n, i) => { n.read = snapshot[i] })
      counts.value = prevCounts
      return false
    }
  }

  // ─── Delete single ────────────────────────────────────────────────────────
  async function dismiss(id: number) {
    const idx = notifs.value.findIndex(n => n.id === id)
    if (idx === -1) return
    const removed = notifs.value[idx]
    notifs.value.splice(idx, 1)
    counts.value.all_total = Math.max(0, counts.value.all_total - 1)
    if (removed.read) counts.value.total_read   = Math.max(0, counts.value.total_read - 1)
    else              counts.value.total_unread = Math.max(0, counts.value.total_unread - 1)
    try {
      const api = useInstituteApi()
      await api(`/messages/delete/${id}`, { method: 'POST' })
    } catch (e) {
      logWarn('[inotifs] dismiss failed', e)
      notifs.value.splice(idx, 0, removed)
      counts.value.all_total += 1
      if (removed.read) counts.value.total_read   += 1
      else              counts.value.total_unread += 1
    }
  }

  // ─── Clear all read ───────────────────────────────────────────────────────
  async function clearRead(): Promise<boolean> {
    const prev          = notifs.value.slice()
    const removed       = notifs.value.filter(n => n.read)
    const prevReadCount = counts.value.total_read
    notifs.value = notifs.value.filter(n => !n.read)
    counts.value.all_total  = Math.max(0, counts.value.all_total - removed.length)
    counts.value.total_read = 0
    try {
      const api = useInstituteApi()
      await api('/messages/clear-read', { method: 'POST' })
      return true
    } catch (e) {
      logWarn('[inotifs] clearRead failed', e)
      notifs.value = prev
      counts.value.all_total  += removed.length
      counts.value.total_read  = prevReadCount
      return false
    }
  }

  return {
    notifs, counts, unreadCount, loading, fetchError,
    fetchNotifs, fetchCounts,
    markRead, markAllRead, dismiss, clearRead,
  }
}
