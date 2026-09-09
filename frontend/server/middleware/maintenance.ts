/**
 * Maintenance-mode gate — runs on EVERY request, BEFORE the route/SWR cache.
 *
 * app.vue also checks the maintenance flag, but the home route is SWR-cached
 * (`'/': { swr: 600 }`), so a page rendered while maintenance was OFF keeps being
 * served from cache — the normal site "leaks" through for up to the cache window.
 * This Nitro middleware is never cached, so when the admin turns maintenance ON it
 * takes effect immediately on the next request for every route, including `/`.
 *
 * The flag itself is cached in-memory for a few seconds so we don't hit the Laravel
 * API on every single request.
 */

let cached: { at: number; on: boolean; message: string } | null = null
const TTL_MS = 15_000 // re-check the flag at most every 15s

async function getMaintenance(): Promise<{ on: boolean; message: string }> {
  const now = Date.now()
  if (cached && now - cached.at < TTL_MS) return cached
  try {
    const res: any = await callLaravel('/site-status', { method: 'GET', timeout: 2500 })
    cached = { at: now, on: res?.maintenance === true, message: res?.message || '' }
  } catch {
    // Fail open — never lock the whole site out because the flag fetch failed.
    cached = { at: now, on: false, message: '' }
  }
  return cached
}

export default defineEventHandler(async (event) => {
  const path = event.path || '/'

  // Only guard top-level HTML page loads. Let Nuxt internals, the /api proxy,
  // images and any file-with-extension request pass through untouched.
  if (
    event.method !== 'GET' ||
    path.startsWith('/api') ||
    path.startsWith('/_nuxt') ||
    path.startsWith('/__nuxt') ||
    path.startsWith('/_ipx') ||
    path.startsWith('/assets') ||
    /\.[a-z0-9]+($|\?)/i.test(path)
  ) return

  const accept = getHeader(event, 'accept') || ''
  if (!accept.includes('text/html')) return // data/XHR requests, not page navigations

  const m = await getMaintenance()
  if (!m.on) return

  // ── On-call staff bypass ────────────────────────────────────────────────
  // Maintenance is ON. A staff member who visits any portal URL with
  // ?maint_bypass=<token> (matching the MAINTENANCE_BYPASS_TOKEN env secret) is
  // let through and given a cookie so subsequent navigations skip the gate too;
  // everyone else still gets the maintenance page. DISABLED entirely when the env
  // secret is unset (fail closed — no bypass exists), so this can never widen
  // access by accident. Covers /, /student and /institute since they all pass
  // through this one middleware.
  const bypassSecret = useRuntimeConfig(event).maintenanceBypassToken || ''
  if (bypassSecret) {
    // Already carrying a valid bypass cookie → let the real portal through.
    if (getCookie(event, 'maint_bypass') === bypassSecret) return

    // Fresh bypass via the secret query param → set the cookie, then redirect to
    // the same path WITHOUT the token so the secret isn't left in the URL/history.
    const q = getQuery(event)
    const qToken = typeof q.maint_bypass === 'string' ? q.maint_bypass : ''
    if (qToken && qToken === bypassSecret) {
      setCookie(event, 'maint_bypass', bypassSecret, {
        httpOnly: true,
        // https-only in production; off in dev so the cookie is stored over
        // http://localhost while testing the bypass.
        secure: !import.meta.dev,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 4, // 4 hours
      })
      await sendRedirect(event, path.split('?')[0], 302)
      return
    }
  }

  const message =
    m.message || "We are currently conducting maintenance on the site. We'll be back shortly."

  setResponseStatus(event, 200)
  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'no-store, must-revalidate')
  setResponseHeader(event, 'Retry-After', '600')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Under maintenance · Passmed</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
    background:radial-gradient(1200px 600px at 50% -10%, #0e7490 0%, #0b1220 62%);
    color:#e5e7eb;text-align:center;font-family:'Figtree',system-ui,sans-serif;
  }
  .card{max-width:520px}
  .icon{color:#22d3ee;margin-bottom:18px}
  h1{font-size:1.8rem;font-weight:800;margin:0 0 12px;color:#fff}
  p{font-size:1.05rem;line-height:1.6;color:#cbd5e1;margin:0}
</style>
</head>
<body>
  <div class="card">
    <svg class="icon" viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.1-2.1 2.6-2.5z"/>
    </svg>
    <h1>Under maintenance</h1>
    <p>${message.replace(/</g, '&lt;')}</p>
  </div>
</body>
</html>`
})
