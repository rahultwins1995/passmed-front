
import { callLaravel, readAuthCookie, clearAuthCookie } from '../utils/laravel'

export default defineEventHandler(async (event) => {
  const token = readAuthCookie(event)

  if (token) {
    try {
      await callLaravel('/logout', { method: 'POST' }, token)
    } catch (_) {
      // ignore — we still want to clear the local cookie
    }
  }

  clearAuthCookie(event)
  return { status: 'success' }
})
