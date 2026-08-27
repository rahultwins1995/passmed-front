import type { H3Event } from 'h3'

export const AUTH_COOKIE = 'auth_token'

export function laravelBase(): string {
  const config = useRuntimeConfig()
  return (config as any).laravelApi
      || process.env.NUXT_LARAVEL_API
      || 'http://localhost:8000/api'
}

export async function callLaravel<T = any> (
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
    baseURL: laravelBase(),
    ...options,
    headers,
  })
}

/** Plant the HttpOnly auth cookie on the Nuxt domain. */
export function setAuthCookie (event: H3Event, token: string) {
  setCookie(event, AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', 
    sameSite: 'lax',                               
    path: '/',
    maxAge: 60 * 60 * 24 * 7,                      
  })
}

/** Remove the cookie on logout / 401. */
export function clearAuthCookie (event: H3Event) {
  deleteCookie(event, AUTH_COOKIE, { path: '/' })
}

/** Convenience: read it. */
export function readAuthCookie (event: H3Event): string | undefined {
  return getCookie(event, AUTH_COOKIE)
}
