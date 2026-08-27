import { callLaravel, readAuthCookie, clearAuthCookie } from '../utils/laravel'
const AUTH_PATHS = new Set(['login', 'googleauth', 'googleauthsignup', 'logout', 'me'])

export default defineEventHandler(async (event) => {
  const raw   = (event.context.params?._ as string) || ''
  const path  = raw.replace(/^\/+/, '')

  // Block ONLY the exact dedicated auth endpoints (they have their own server routes,
  // e.g. login.post.ts for Turnstile). Match the FULL path, not just the first
  // segment — otherwise sub-paths like `login/verify-otp` (2FA step, which has NO
  // dedicated route and must reach Laravel) were wrongly 404'd here.
  if (AUTH_PATHS.has(path)) {
    setResponseStatus(event, 404)
    return { status: 'error', message: 'Not found' }
  }

  const method = getMethod(event)
  const query  = getQuery(event)
  const token  = readAuthCookie(event)
  const body   = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
    ? await readBody(event).catch(() => undefined)
    : undefined

  try {
    return await callLaravel(`/${path}`, { method, body, query }, token)
  } catch (err: any) {
    const status = err?.response?.status || 500
    if (status === 401) clearAuthCookie(event)
    setResponseStatus(event, status)
    return err?.data || { status: 'error', message: err?.message || 'Request failed' }
  }
})
