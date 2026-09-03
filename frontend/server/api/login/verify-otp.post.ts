import { callLaravel, setAuthCookie } from '../../utils/laravel'

// 2FA OTP verification. The generic catch-all proxy (server/api/[...].ts) forwards
// this to Laravel but NEVER sets the auth cookie, so a correct code still bounced to
// login. This dedicated route mirrors login.post.ts: on success Laravel returns the
// JWT as `token`, which we set as the HttpOnly auth cookie — completing the login.
// (No Turnstile here — the OTP itself is the second factor; Turnstile ran on step 1.)
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  try {
    const res = await callLaravel<any>('/login/verify-otp', {
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
    return err?.data || { status: 'error', message: err?.message || 'Verification failed' }
  }
})
