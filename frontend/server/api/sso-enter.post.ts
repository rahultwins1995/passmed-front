import { callLaravel, setAuthCookie } from '../utils/laravel'

/**
 * POST /api/sso-enter   (portal-domain SAML SSO handoff)
 *
 * The backend SAML ACS (Api_saml_ssoController@acs) form-POSTs the short-lived SSO
 * HANDOFF token here (token in the body, never in a URL). We exchange it server-to-server
 * for a full session token — so the browser only ever sees this portal domain, never the
 * API domain — then plant the auth cookie (exactly like a normal login) and redirect into
 * the right dashboard by role. Mirrors impersonate-enter, but for a genuine SSO login.
 */
export default defineEventHandler(async (event) => {
  const body    = await readBody(event).catch(() => ({} as any))
  const handoff = String(body?.token || getQuery(event)?.token || '')

  if (!handoff) return sendRedirect(event, '/login', 302)

  try {
    const res = await callLaravel<any>('/sso/exchange', {
      method: 'POST',
      body: { token: handoff },
    })

    if (res?.status === 'success' && res?.token) {
      setAuthCookie(event, res.token)
      const portal = res?.portal === 'institute' ? '/institute' : '/student'
      const name = String(res?.name || 'user').replace(/[<>&"']/g, '')
      // Friendly "signing in" interstitial (cookie already set in headers), then JS
      // redirect — the user sees a message instead of a blank screen.
      setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
      return `<!doctype html><html><head><meta charset="utf-8"><title>Signing in…</title>`
        + `<meta http-equiv="refresh" content="1;url=${portal}">`
        + `<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;min-height:100vh;`
        + `display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0}`
        + `.b{text-align:center}.s{width:34px;height:34px;border:3px solid #334155;border-top-color:#38bdf8;`
        + `border-radius:50%;margin:0 auto 14px;animation:sp .8s linear infinite}`
        + `@keyframes sp{to{transform:rotate(360deg)}}</style></head>`
        + `<body><div class="b"><div class="s"></div>Signing in as <strong>${name}</strong>…</div>`
        + `<script>location.replace(${JSON.stringify(portal)})</script></body></html>`
    }
  } catch (_err) {
    // fall through to login
  }

  return sendRedirect(event, '/login', 302)
})
