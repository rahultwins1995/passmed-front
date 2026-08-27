// Student-layer API client.
//
// Direct hit to Laravel's student API base. Same pattern the frontend layer
// uses in dev (credentials:'include', cookies on api.passmed.com domain).
//
// Why no dev/prod branching here: the previous attempt to swap between a
// direct URL (dev) and a same-origin proxy (prod) using `import.meta.dev`
// produced surprising results in this project — bundled code sometimes had
// the prod branch baked in even while running `npm run dev`, which made
// requests fall into the Nitro devProxy for `/api*` and get redirected to
// the wrong host (passmed.com → www.passmed.com → CORS error). Going with
// a single, predictable base avoids that whole class of bugs.
//
// Requires Laravel CORS to allow `api-student/*` with credentials from the
// dev origin (e.g. http://localhost:3000). The login flow already uses the
// same pattern for `frontend/*` so the setup is parallel.

// Direct-vs-proxy is controlled by the single `directApi` toggle in nuxt.config
// (public runtimeConfig). Prod ALWAYS uses the proxy (import.meta.dev guard).

// Guard flag — prevents multiple simultaneous 401 responses from firing
// navigateTo('/login') several times in parallel (e.g. when the session
// cookie expires mid-session and several in-flight PATCHes all 401 at once).
let redirecting401 = false

export const useStudentApi = (opts?: { silent401?: boolean }) => {
  // silent401 = true → a 401 from THIS client instance does NOT clear auth
  // state or redirect to /login. Use it for non-critical background polls
  // (e.g. the sidebar's notification-count fetch) where a transient 401
  // must not boot the user out mid-session. Critical/user-initiated calls
  // keep the default behaviour so a real expired session still logs out.
  const silent401 = opts?.silent401 === true
  const config = useRuntimeConfig()
  const useDirect = import.meta.dev && config.public.directApi

  return $fetch.create({
    baseURL: useDirect ? (config.public.directStudentApiBase as string) : '/api/student',
    credentials: useDirect ? 'include' : 'same-origin',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    onResponseError({ response }) {
      if (silent401) return
      if (response?.status === 401) {
        // Clear shared auth state so any component reading user.value sees null.
        const user = useState<any | null>('auth_user', () => null)
        user.value = null

        // Distinguish a single-session takeover (logged in on another device)
        // from an ordinary expiry, so the login page can show a clear reason.
        // The backend's EnsureSingleSession middleware returns { superseded:true }.
        const superseded = (response?._data as any)?.superseded === true
        const target = superseded ? '/login?reason=elsewhere' : '/login'

        // Redirect to /login — only client-side (student routes are ssr:false
        // but be defensive). Guard prevents duplicate navigations when multiple
        // in-flight requests all return 401 simultaneously.
        if (import.meta.client && !redirecting401) {
          redirecting401 = true
          // Small delay so any in-progress state cleanup (e.g. session flush)
          // can settle before we unmount the page.
          setTimeout(() => {
            navigateTo(target)
            // Reset after navigation so future sessions can trigger again
            setTimeout(() => { redirecting401 = false }, 3000)
          }, 100)
        }
      }
    },
  })
}
