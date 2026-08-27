
import { callLaravel, setAuthCookie } from '../utils/laravel'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  try {
    const res = await callLaravel<any>('/googleauthsignup', {
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
    return err?.data || { status: 'error', message: err?.message || 'Google signup failed' }
  }
})
