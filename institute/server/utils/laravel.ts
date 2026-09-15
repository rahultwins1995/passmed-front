import type { H3Event } from 'h3'

// Re-use the same cookie name as the frontend — institute shares the same
// HttpOnly auth cookie since it's served from the same Nuxt process.
const AUTH_COOKIE = 'auth_token'

export function instituteApiBase(): string {
  // DEV-ONLY server override: point this layer at any backend for local testing.
  // Set NUXT_DEV_API_INSTITUTE to a FULL base URL, e.g.
  //   NUXT_DEV_API_INSTITUTE=https://apitest.passmed.com/api-institute/v1
  // Leave it unset/commented to fall back to the normal config. Guarded by
  // NODE_ENV so production per-region builds can NEVER pick this up.
  const devOverride = process.env.NUXT_DEV_API_INSTITUTE
  if (process.env.NODE_ENV !== 'production' && devOverride) {
    return devOverride.replace(/\/$/, '')
  }

  const config = useRuntimeConfig()
  return (config as any).instituteApi
      || process.env.NUXT_INSTITUTE_LARAVEL_API
      || 'http://localhost:8000/api'
}

export async function callInstituteApi<T = any>(
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
    baseURL: instituteApiBase(),
    ...options,
    headers,
  })
}

/** Read the shared HttpOnly auth cookie. */
export function readInstituteAuthCookie(event: H3Event): string | undefined {
  return getCookie(event, AUTH_COOKIE)
}

/** Clear the shared auth cookie on 401. */
export function clearInstituteAuthCookie(event: H3Event) {
  deleteCookie(event, AUTH_COOKIE, { path: '/' })
}
