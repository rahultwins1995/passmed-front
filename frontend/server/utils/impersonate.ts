import type { H3Event } from 'h3'
import { callLaravel, setAuthCookie } from './laravel'

/**
 * Shared "Log as" handoff handler for /api/impersonate-enter.
 *
 * The admin panel hands off a short-lived token (in the POST body, or as a ?token=
 * query for GET fallbacks). We exchange it server-to-server for a full session token
 * — so the browser only ever sees this portal domain, never api.passmed.com — plant
 * the auth cookie, and land on the right dashboard by role.
 *
 * Exposed on BOTH GET and POST (see impersonate-enter.get.ts / .post.ts) so an admin
 * deploy that's a version behind, or a proxy/redirect that turns the POST into a GET,
 * still works instead of 404ing. Token is read from body OR query.
 */
export async function handleImpersonateEnter(event: H3Event) {
  // readBody is only meaningful on POST; guard so a GET (no body) doesn't throw.
  const body = event.method === 'POST'
    ? await readBody(event).catch(() => ({} as any))
    : ({} as any)
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
      // Friendly "logging in" interstitial (cookie already set in headers), then a
      // same-site client redirect into the portal — keeps the sameSite=lax cookie
      // valid (the /student request originates from this portal page, not the
      // cross-site POST). meta-refresh is the CSP-safe fallback if inline JS is blocked.
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
}
