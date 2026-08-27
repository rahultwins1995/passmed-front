/**
 * Idle-session countdown for the institute portal.
 *
 * The server is the authority: SessionTimeoutMiddleware stamps a last-activity time
 * against the token on EVERY authenticated request, and 401s once the gap exceeds the
 * configured limit. This composable's only job is to stop that 401 arriving as a
 * surprise — it mirrors the same clock client-side and warns before the axe falls.
 *
 * ── The trap this is built around ───────────────────────────────────────────
 * Any call to the API counts as activity. So a naive "poll /session/status every
 * 30 seconds to see how long I have left" would keep the session alive for ever and
 * the idle timeout would never fire at all. The countdown therefore runs entirely on
 * a LOCAL clock, and we only touch the network when the user genuinely does
 * something — throttled hard (see PING_THROTTLE_MS).
 *
 * ── Client and server drift ─────────────────────────────────────────────────
 * They can't be perfectly in step, and they don't need to be. The client is
 * deliberately a little PESSIMISTIC: it warns early and gives up at the deadline,
 * while the server keeps a grace period. If the two ever disagree, the 401 handler in
 * useInstituteApi is the backstop and the user lands on /login?expired=1 either way.
 */

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'pointerdown'] as const

/** Don't tell the server "still here" more than once a minute, however much they type. */
const PING_THROTTLE_MS = 60_000

/** How often the local clock re-checks. Cheap; nothing hits the network. */
const TICK_MS = 5_000

export const useIdleTimeout = () => {
  const api  = useInstituteApi()
  const { user } = useAuth()

  // null = 'never' (or not yet known) → the timer stands down entirely.
  const timeoutSeconds = useState<number | null>('idle_timeout_seconds', () => null)
  const warnSeconds    = useState<number>('idle_warn_seconds', () => 120)

  /** Seconds left before the server would sign them out. null while unknown. */
  const secondsLeft = useState<number | null>('idle_seconds_left', () => null)
  /** True once we're inside the warning window — drives the modal. */
  const warning     = useState<boolean>('idle_warning', () => false)

  const lastActivity = ref(Date.now())
  const lastPing     = ref(Date.now())

  let tick: ReturnType<typeof setInterval> | null = null
  let bound = false

  /** Reset the LOCAL clock. Cheap, called on every stray mouse-down. */
  const markActivity = () => {
    lastActivity.value = Date.now()

    // Once the warning is up, a stray scroll shouldn't silently dismiss it — the
    // user has to press "Stay signed in", so they know the session was at risk.
    if (warning.value) return

    // Tell the SERVER the session is alive, but rarely. Every authenticated request
    // already refreshes the stamp, so most of the time real API traffic does this for
    // free; the ping only matters for someone reading a long page without clicking
    // anything that hits the network.
    if (Date.now() - lastPing.value > PING_THROTTLE_MS) {
      lastPing.value = Date.now()
      void ping()
    }
  }

  /** Any authenticated call refreshes the server's stamp; this is the cheapest one. */
  const ping = async () => {
    try {
      const res: any = await api('/session/status')
      const d = res?.data
      if (d) {
        timeoutSeconds.value = d.timeout_seconds ?? null
        warnSeconds.value    = d.warn_seconds ?? 120
      }
    } catch {
      // A failed ping is not worth surfacing — if the session really is dead, the
      // next real request 401s and the api layer redirects.
    }
  }

  /** The user pressed "Stay signed in". */
  const staySignedIn = async () => {
    warning.value = false
    lastActivity.value = Date.now()
    lastPing.value     = Date.now()
    await ping()
  }

  const expire = () => {
    stop()
    warning.value = false
    user.value = null
    if (import.meta.client && !window.location.pathname.startsWith('/login')) {
      navigateTo('/login?expired=1')
    }
  }

  const check = () => {
    const total = timeoutSeconds.value
    if (!total) { secondsLeft.value = null; warning.value = false; return }

    const idle = Math.floor((Date.now() - lastActivity.value) / 1000)
    const left = total - idle
    secondsLeft.value = Math.max(0, left)

    if (left <= 0) { expire(); return }

    warning.value = left <= warnSeconds.value
  }

  const start = async () => {
    if (!import.meta.client || bound) return

    await ping()                       // learn the limit; also stamps activity
    if (!timeoutSeconds.value) return  // 'never' → no timer, no listeners

    for (const e of ACTIVITY_EVENTS) {
      window.addEventListener(e, markActivity, { passive: true })
    }
    // Coming back to a tab that slept through the deadline should log out promptly
    // rather than waiting for the next tick.
    document.addEventListener('visibilitychange', check)

    tick = setInterval(check, TICK_MS)
    bound = true
  }

  const stop = () => {
    if (!import.meta.client) return
    if (tick) { clearInterval(tick); tick = null }
    if (bound) {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, markActivity)
      document.removeEventListener('visibilitychange', check)
      bound = false
    }
  }

  return { start, stop, staySignedIn, warning, secondsLeft, timeoutSeconds }
}
