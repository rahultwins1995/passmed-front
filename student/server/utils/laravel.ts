// Student-layer Laravel helpers (mirrors frontend/server/utils/laravel.ts but
// points at the student API base — `api-student/v1`).
//
// Same auth_token cookie is used so a single login session works across both
// proxies; the cookie is set by frontend/server/api/login.post.ts.

import type { H3Event } from 'h3'

// Must match frontend layer's AUTH_COOKIE name — same login flow sets it.
const AUTH_COOKIE = 'auth_token'

export function studentLaravelBase(): string {
  // DEV-ONLY server override: point this layer at any backend for local testing.
  // Set NUXT_DEV_API_STUDENT to a FULL base URL, e.g.
  //   NUXT_DEV_API_STUDENT=https://api-uk.passmed.com/api-student/v1
  // Leave it unset/commented to fall back to the normal config. Guarded by
  // NODE_ENV so production per-region builds can NEVER pick this up.
  const devOverride = process.env.NUXT_DEV_API_STUDENT
  if (process.env.NODE_ENV !== 'production' && devOverride) {
    return devOverride.replace(/\/$/, '')
  }

  const config = useRuntimeConfig()
  // Strip a trailing slash off the host so a mis-set env (…passmed.com/) can't
  // produce `host//api-student/v1` — a double slash the backend 404s on.
  const base = (config as any).laravelApiStudent
      || process.env.NUXT_LARAVEL_API_STUDENT
      || (process.env.NUXT_PUBLIC_API_BASE_ALL || '').replace(/\/+$/, '') + '/api-student/v1'
  // Final guard: collapse any accidental `//` in the path (never the protocol).
  return String(base).replace(/([^:])\/{2,}/g, '$1/')
}

export async function callStudentLaravel<T = any>(
  path: string,
  options: any = {},
  bearer?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers || {}),
  }
  if (bearer) headers.Authorization = `Bearer ${bearer}`

  return await $fetch<T>(path, {
    baseURL: studentLaravelBase(),
    ...options,
    headers,
  })
}

// Named with a `Student` prefix to avoid colliding with the frontend layer's
// `readAuthCookie`/`clearAuthCookie`. Nuxt auto-imports every `server/utils/**`
// export globally, so identically-named exports across layers silently shadow
// one another — see frontend/server/utils/laravel.ts for the canonical pair.
export function readStudentAuthCookie(event: H3Event): string | undefined {
  return getCookie(event, AUTH_COOKIE)
}

export function clearStudentAuthCookie(event: H3Event): void {
  deleteCookie(event, AUTH_COOKIE, { path: '/' })
}
