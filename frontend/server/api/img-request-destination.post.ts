// IMG Pathways — "request a destination country".
//
// Thin proxy to the Laravel backend (frontend/v1/img/request-destination), which
// holds the Brevo API key server-side. The frontend Vercel projects therefore do
// NOT need BREVO_API_KEY — that env drift is exactly what used to make this route
// 503 ("Requests are not configured") on markets where the key wasn't set.
import { callLaravel } from '../utils/laravel'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  try {
    return await callLaravel('/img/request-destination', { method: 'POST', body })
  } catch (err: any) {
    // Propagate the upstream status so the client's $fetch rejects on failure.
    setResponseStatus(event, err?.response?.status || 500)
    return err?.data || { status: 'error', msg: err?.message || 'Request failed' }
  }
})
