// API base used during local development ONLY. Note: this points at the
// PRODUCTION Laravel API — in dev the browser calls it directly (there is no
// local proxy), whereas in prod requests go through the Nuxt server proxy at
// '/api'. ⚠️ Dev work therefore reads/writes PRODUCTION data. Point this at a
// local or staging API if you don't want that. (Keep in sync with utils/api.ts.)
// Direct-vs-proxy is controlled by the single `directApi` toggle in nuxt.config
// (public runtimeConfig). Prod ALWAYS uses the proxy (import.meta.dev guard).
export const useApi = () => {
  const config = useRuntimeConfig()
  const useDirect = import.meta.dev && config.public.directApi
  // SSR cookie forwarding only matters in proxy mode.
  const headers = (!useDirect && import.meta.server)
    ? useRequestHeaders(['cookie'])
    : {}

  return $fetch.create({
    baseURL: useDirect ? (config.public.directApiBase as string) : '/api',
    credentials: useDirect ? 'include' : 'same-origin',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...headers,
    },
    onResponseError({ response }) {
      // 401 → cookie is bad; sync the in-memory user.
      if (response?.status === 401) {
        const user = useState<any | null>('auth_user', () => null)
        user.value = null
      }
    },
  })
}
