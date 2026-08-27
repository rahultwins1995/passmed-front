/**
 * Admin-managed URL redirects — runs on every request BEFORE the route/SWR cache,
 * so a real server-side 301/302 is issued (good for SEO, unlike a client navigateTo).
 *
 * Rules come from the Laravel backend (`/redirects/active`), matched by EXACT path.
 * The original query string is carried onto the target. The rule list is cached
 * in-memory for a short TTL so we don't hit the API on every request.
 *
 * Scope: the public MARKETING site only. Portal paths (/student, /institute), the
 * /api proxy, Nuxt internals and static assets are skipped — and in any case only
 * paths an admin explicitly added a rule for are ever redirected.
 */

type Rule = { from_path: string; to_path: string; type: number }

let cached: { at: number; rules: Rule[] } | null = null
const TTL_MS = 15_000 // re-fetch the rule list at most every 15s (so pause/edit propagates fast)

async function getRules(): Promise<Rule[]> {
  const now = Date.now()
  if (cached && now - cached.at < TTL_MS) return cached.rules
  try {
    const res: any = await callLaravel('/redirects/active', { method: 'GET', timeout: 2500 })
    const rules: Rule[] = Array.isArray(res?.data) ? res.data : []
    cached = { at: now, rules }
  } catch {
    // Never break the site if the fetch fails — keep the last good list (or empty).
    cached = { at: now, rules: cached?.rules || [] }
  }
  return cached.rules
}

// Mirror the backend's normFrom(): strip query/hash, force one leading slash, drop a
// trailing slash (except root), lowercase.
function normPath(p: string): string {
  p = (p || '/').split('?')[0].split('#')[0]
  p = '/' + p.replace(/^\/+/, '')
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p.toLowerCase()
}

export default defineEventHandler(async (event) => {
  const rawPath = event.path || '/'

  if (
    event.method !== 'GET' ||
    rawPath.startsWith('/api') ||
    rawPath.startsWith('/_nuxt') ||
    rawPath.startsWith('/__nuxt') ||
    rawPath.startsWith('/_ipx') ||
    rawPath.startsWith('/assets') ||
    rawPath.startsWith('/student') ||   // login-gated SPA portals — never redirect
    rawPath.startsWith('/institute') ||
    /\.[a-z0-9]+($|\?)/i.test(rawPath)  // any file-with-extension request
  ) return

  const rules = await getRules()
  if (!rules.length) return

  const path = normPath(rawPath)
  const rule = rules.find((r) => r.from_path === path)
  if (!rule || !rule.to_path) return

  // Carry the original query string onto the target.
  const qi = rawPath.indexOf('?')
  const query = qi >= 0 ? rawPath.slice(qi + 1) : ''
  let target = rule.to_path
  if (query) {
    target += (target.includes('?') ? '&' : '?') + query
  }

  // Guard against a trivial self-loop.
  if (normPath(target) === path && !/^https?:\/\//i.test(target)) return

  // Redirects are admin-managed and can be paused/changed, so tell the browser NOT to
  // cache them — otherwise a 301 sticks client-side and keeps redirecting even after the
  // rule is paused (browsers cache 301s aggressively).
  setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate')
  await sendRedirect(event, target, rule.type === 302 ? 302 : 301)
})
