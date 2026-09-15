// First-touch marketing attribution, captured client-side and forwarded to
// Laravel on signup (both the email/password path and Google signup) so
// users.utm_source / utm_medium / utm_campaign stop landing null. Laravel
// already derives `traffic_source` server-side from `referrer` — this only
// adds the params ad platforms actually append to the landing URL.
const COOKIE_NAME = 'pm_attr'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90 // 90 days

const ATTR_KEYS = [
  'gclid', 'gbraid', 'wbraid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
] as const

export type AttributionData = Partial<Record<typeof ATTR_KEYS[number], string>> & { referrer?: string }

function readCookie (name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

function writeCookie (name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === 'undefined') return
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`
}

export function useAttribution () {
  /** Pull attribution params off the current query string. */
  function readFromUrl (): AttributionData {
    if (typeof window === 'undefined') return {}
    const params = new URLSearchParams(window.location.search)
    const out: AttributionData = {}
    for (const key of ATTR_KEYS) {
      const v = params.get(key)
      if (v) out[key] = v
    }
    return out
  }

  /**
   * Stash the current landing URL's attribution + referrer, first-touch-wins:
   * if pm_attr is already set (from an earlier visit), never overwrite it —
   * the FIRST ad click a user came from is the one we attribute the signup to.
   */
  function persist () {
    if (typeof window === 'undefined') return
    if (readCookie(COOKIE_NAME)) return

    const fromUrl = readFromUrl()
    if (Object.keys(fromUrl).length === 0) return

    const data: AttributionData = { ...fromUrl, referrer: document.referrer || '' }
    writeCookie(COOKIE_NAME, JSON.stringify(data), COOKIE_MAX_AGE)
  }

  /** Read the stashed attribution back. `{}` when absent or unparseable. */
  function get (): AttributionData {
    const raw = readCookie(COOKIE_NAME)
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  return { readFromUrl, persist, get }
}
