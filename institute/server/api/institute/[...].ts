import { callInstituteApi, readInstituteAuthCookie, clearInstituteAuthCookie } from '../../utils/laravel'

export default defineEventHandler(async (event) => {
  const raw   = (event.context.params?._ as string) || ''
  const path  = raw.replace(/^\/+/, '')

  const method = getMethod(event)
  const query  = getQuery(event)
  const token  = readInstituteAuthCookie(event)
  const contentType = getHeader(event, 'content-type') || ''

  let body: any = undefined
  let extraHeaders: Record<string, string> = {}

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (contentType.includes('multipart/form-data')) {
      // File upload (question import) — forward the raw body and preserve the
      // multipart boundary so Laravel can parse the uploaded file.
      body = await readRawBody(event, false).catch(() => undefined)
      extraHeaders['Content-Type'] = contentType
    } else {
      body = await readBody(event).catch(() => undefined)
    }
  }

  try {
    return await callInstituteApi(`/${path}`, { method, body, query, headers: extraHeaders }, token)
  } catch (err: any) {
    const status = err?.response?.status || 500
    if (status === 401) clearInstituteAuthCookie(event)
    setResponseStatus(event, status)
    return err?.data || { status: 'error', message: err?.message || 'Request failed' }
  }
})
