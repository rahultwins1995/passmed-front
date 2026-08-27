// Catch-all proxy for /api-student/*
//
// Browser hits same-origin /api-student/<anything>; this handler reads the
// auth_token cookie set by frontend/server/api/login.post.ts and forwards the
// request to Laravel's student API base with Authorization: Bearer.
//
// Network tab on the client will only ever show /api-student/... — the
// underlying https://api.passmed.com/api-student/v1/... URL stays server-side.

import { callStudentLaravel, readStudentAuthCookie, clearStudentAuthCookie } from '../../utils/laravel'

export default defineEventHandler(async (event) => {
  const raw  = (event.context.params?._ as string) || ''
  const path = raw.replace(/^\/+/, '')

  const method = getMethod(event)
  const query  = getQuery(event)
  const token  = readStudentAuthCookie(event)

  // Multipart (file uploads, e.g. profile avatar) must be forwarded as RAW
  // bytes with the original Content-Type (which carries the boundary). Using
  // readBody() here parses the request and DROPS the uploaded file, so Laravel
  // would receive no `avatar` field and reject it as "required". readRawBody
  // keeps the payload byte-for-byte; non-multipart bodies stay JSON as before.
  const contentType = getRequestHeader(event, 'content-type') || ''
  const isMultipart = contentType.startsWith('multipart/form-data')

  let body: any
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    body = isMultipart
      ? await readRawBody(event, false).catch(() => undefined)   // Buffer
      : await readBody(event).catch(() => undefined)
  }

  if (!token) {
    setResponseStatus(event, 401)
    return { status: 'error', msg: 'Unauthenticated' }
  }

  try {
    return await callStudentLaravel(
      `/${path}`,
      {
        method,
        body,
        query,
        // Forward the original multipart Content-Type (with its boundary) so
        // the upstream can parse the file fields. For JSON requests we let
        // ofetch set application/json itself.
        ...(isMultipart ? { headers: { 'content-type': contentType } } : {}),
      },
      token,
    )
  } catch (err: any) {
    const status = err?.response?.status || 500
    if (status === 401) clearStudentAuthCookie(event)
    setResponseStatus(event, status)
    return err?.data || { status: 'error', msg: err?.message || 'Request failed' }
  }
})
