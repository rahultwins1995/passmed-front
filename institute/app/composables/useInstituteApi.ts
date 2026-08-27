// Direct-vs-proxy is controlled by the single `directApi` toggle in nuxt.config
// (public runtimeConfig). Prod ALWAYS uses the proxy (import.meta.dev guard).
// NOTE: opts.direct still forces direct even in prod (used for large uploads).

export const useInstituteApi = (opts: { direct?: boolean } = {}) => {
  // On the server in production, forward the browser's cookie so SSR requests
  // carry the auth token through to the Nuxt proxy.
  const headers = (!import.meta.dev && import.meta.server)
    ? useRequestHeaders(['cookie'])
    : {}

  // `direct: true` skips the /api/institute proxy and hits the Laravel backend
  // straight from the browser. Needed for large file uploads: in production the
  // proxy runs as a Vercel serverless function that caps the request body at
  // ~4.5MB (FUNCTION_PAYLOAD_TOO_LARGE); the backend has no such cap. The shared
  // .passmed.com HttpOnly auth cookie still rides along via credentials:'include'
  // (backend's JwtCookieToBearer turns it into a Bearer), and CORS reflects the
  // origin (supports_credentials) so the credentialed cross-origin call is valid.
  const config = useRuntimeConfig()
  const useDirect = opts.direct || (import.meta.dev && config.public.directApi)

  return $fetch.create({
    baseURL: useDirect ? (config.public.directInstituteApiBase as string) : '/api/institute',
    credentials: useDirect ? 'include' : 'same-origin',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...headers,
    },
    onResponseError({ response }) {
      // 409 `no_institution` → the user is properly authenticated but isn't
      // linked to any institution (no institution_manages row), so the institute
      // API can't scope their data. This used to be a 401, which the handler
      // below read as "session expired" and logged them straight back out ~2s
      // after signing in. It is NOT an auth failure — surface it and stay put.
      if (response?.status === 409 && response?._data?.code === 'no_institution') {
        const state = useInstituteNoInstitution()
        state.value = response?._data?.message || response?._data?.msg
          || 'Your account is not linked to an institution.'
        return
      }

      // 401 → token is stale / session expired; clear the in-memory user and
      // send them to login instead of surfacing a raw API error in the page
      // (e.g. the Assign Exam submit). Client-only; guard against a redirect loop.
      if (response?.status === 401) {
        const user = useState<any | null>('auth_user', () => null)
        user.value = null
        // Let the page surface a friendly "session expired" message first, then
        // redirect to login (short delay). Client-only; guard the redirect loop.
        if (import.meta.client && !window.location.pathname.startsWith('/login')) {
          setTimeout(() => { navigateTo('/login?expired=1') }, 1800)
        }
      }
    },
  })
}
