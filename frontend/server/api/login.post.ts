
import { callLaravel, setAuthCookie } from '../utils/laravel'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Anti-bot: verify Cloudflare Turnstile BEFORE hitting Laravel. verifyTurnstile is a
  // no-op until NUXT_TURNSTILE_SECRET is set — so login is unchanged until Turnstile is
  // configured; once configured, a missing/invalid token HARD-FAILS here (no soft-pass).
  if (!(await verifyTurnstile(body?.turnstileToken || '', getRequestIP(event, { xForwardedFor: true })))) {
    setResponseStatus(event, 400)
    return { status: 'error', message: 'Verification failed. Please try again.' }
  }
  if (body && 'turnstileToken' in body) delete body.turnstileToken

  try {
    const res = await callLaravel<any>('/login', {
      method: 'POST',
      body,
    })

    if (res?.token) {
      setAuthCookie(event, res.token)
      delete res.token     
    }

    return res
  } catch (err: any) {
    setResponseStatus(event, err?.response?.status || err?.statusCode || 401)
    return err?.data || { status: 'error', message: err?.message || 'Login failed' }
  }
})
