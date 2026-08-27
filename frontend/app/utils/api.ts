// API path resolver. In dev the browser can hit Laravel directly (real URL in
// the Network tab) or use the Nuxt '/api' proxy — controlled by the single
// `directApi` toggle in nuxt.config (public runtimeConfig). Production ALWAYS
// uses the proxy (import.meta.dev guard). No hardcoded URLs here.
export const getApiPath = (endpoint?: string): string => {
  const config = useRuntimeConfig()
  const base = (import.meta.dev && config.public.directApi)
    ? (config.public.directApiBase as string)
    : '/api'
  if (!endpoint) return base
  const normalized = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${base}${normalized}`
}
