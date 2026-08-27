
import { callLaravel, readAuthCookie, clearAuthCookie } from '../utils/laravel'

export default defineEventHandler(async (event) => {
  const token = readAuthCookie(event)

  if (!token) {
    setResponseStatus(event, 401)
    return { status: 'error', message: 'Unauthenticated' }
  }

  try {
    return await callLaravel<any>('/me', { method: 'GET' }, token)
  } catch (err: any) {
    const status = err?.response?.status || 500
    if (status === 401) clearAuthCookie(event)   // stale/invalid → wipe it
    setResponseStatus(event, status)
    return err?.data || { status: 'error', message: 'Unauthenticated' }
  }
})
