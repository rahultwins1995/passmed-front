// Institute's OWN auth-API path resolver — a deliberate standalone clone, NOT a
// reuse of the frontend layer's getApiPath. The two apps are independent.
//
// Shared auth actions (forgot-password, reset-password) live on the frontend
// auth base (frontend/v1), which is separate from the institute API base
// (api-institute/v1). Direct-vs-proxy follows the single `directApi` toggle in
// nuxt.config (public runtimeConfig); prod ALWAYS uses the '/api' proxy.
export const instituteAuthApiPath = (endpoint?: string): string => {
  const config = useRuntimeConfig()
  const base = (import.meta.dev && config.public.directApi)
    ? (config.public.directAuthApiBase as string)
    : '/api'
  if (!endpoint) return base
  const normalized = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${base}${normalized}`
}
