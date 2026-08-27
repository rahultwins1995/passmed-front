// IMG Pathways — "email me this plan" capture.
//
// Thin proxy to the Laravel backend (frontend/v1/img/subscribe), which holds the
// Brevo API key server-side and does the contact upsert + plan email. The frontend
// Vercel projects therefore do NOT need BREVO_API_KEY (the env drift that made this
// 503 on markets where the key wasn't set).
import { callLaravel } from '../utils/laravel'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  try {
    return await callLaravel('/img/subscribe', { method: 'POST', body })
  } catch (err: any) {
    // Propagate the upstream status so the client's $fetch rejects on failure.
    setResponseStatus(event, err?.response?.status || 500)
    return err?.data || { status: 'error', msg: err?.message || 'Request failed' }
  }
})
