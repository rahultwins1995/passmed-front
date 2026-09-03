import { callLaravel, setAuthCookie } from '../utils/laravel'

// Server-side signup: proxies /signup to Laravel and, when the backend returns a
// token (a genuinely NEW account — never attach-to-existing), plants the same
// HttpOnly auth cookie login.post.ts does. This lets a fresh signup be logged in
// WITHOUT a second /login call (that call now hard-fails Turnstile because an
// auto-login after signup carries no widget token). Google signup already works
// this way (googleauthsignup.post.ts). No Turnstile check here — signup was never
// gated by it (the widget token, if any, is consumed by the form's own submit).
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  try {
    const res = await callLaravel<any>('/signup', {
      method: 'POST',
      body,
    })

    if (res?.token) {
      setAuthCookie(event, res.token)
      delete res.token
    }

    return res
  } catch (err: any) {
    setResponseStatus(event, err?.response?.status || err?.statusCode || 400)
    return err?.data || { status: 'error', message: err?.message || 'Signup failed' }
  }
})
