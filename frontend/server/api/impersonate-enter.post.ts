import { callLaravel, setAuthCookie } from '../utils/laravel'

/**
 * POST /api/impersonate-enter   (portal-domain "Log as" handoff)
 *
 * The admin panel form-POSTs the short-lived HANDOFF token here (token in the body,
 * never in a URL). We exchange it server-to-server for a full session token — so the
 * browser only ever sees this portal domain, never api.passmed.com — then plant the
 * auth cookie (exactly like a normal login) and redirect into the right dashboard by
 * role. The backend validates the handoff (imp + hof, ~60s) and mints the session.
 */
export default defineEventHandler(async (event) => {
  const body    = await readBody(event).catch(() => ({} as any))
  const handoff = String(body?.token || getQuery(event)?.token || '')

  if (!handoff) return sendRedirect(event, '/login', 302)

  try {
    const res = await callLaravel<any>('/impersonate/exchange', {
      method: 'POST',
      body: { token: handoff },
    })

    if (res?.status === 'success' && res?.token) {
      setAuthCookie(event, res.token)
      const portal = res?.portal === 'institute' ? '/institute' : '/student'
      const name = String(res?.name || 'user').replace(/[<>&"']/g, '')
      // Return a friendly "logging in" interstitial (cookie already set in headers),
      // then redirect via JS — the user sees a message instead of a blank screen.
      setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
      return `<!doctype html><html><head><meta charset="utf-8"><title>Logging in…</title>`
        + `<meta http-equiv="refresh" content="1;url=${portal}">`
        + `<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;min-height:100vh;`
        + `display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0}`
        + `.b{text-align:center}.s{width:34px;height:34px;border:3px solid #334155;border-top-color:#38bdf8;`
        + `border-radius:50%;margin:0 auto 14px;animation:sp .8s linear infinite}`
        + `@keyframes sp{to{transform:rotate(360deg)}}</style></head>`
        + `<body><div class="b"><div class="s"></div>Please wait — logging in as <strong>${name}</strong>…</div>`
        + `<script>location.replace(${JSON.stringify(portal)})</script></body></html>`
    }
  } catch (_err) {
    // fall through to login
  }

  return sendRedirect(event, '/login', 302)
})
