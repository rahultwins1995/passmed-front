// Fires GA4 page_view on the initial load AND every SPA route change, so every
// regional deployment reports navigation identically (and with the `region`
// param attached — see useAnalytics).
//
// Why this is needed: gtag('config', ...) is loaded with `send_page_view:false`
// (nuxt.config) so it does NOT auto-fire page_view. We fire them all from here
// instead, which lets every page_view carry the same params (region, etc.) as
// the rest of the funnel. Without this, internal <NuxtLink> navigations (SPA,
// no full page load) would be invisible to GA4.

export default defineNuxtPlugin((nuxtApp) => {
  const { gtagId } = useRuntimeConfig().public

  if (!gtagId) {
    // Dev guard: make a missing Measurement ID obvious instead of silently
    // dropping every event. Production builds set NUXT_PUBLIC_GTAG_ID per region.
    // Routed through logWarn (dev-only chokepoint), so no bare console.* here.
    logWarn(
      '[analytics] NUXT_PUBLIC_GTAG_ID is not set — GA4 is disabled and no ' +
      'events will be sent. Set it per deployment (see docs/analytics.md).',
    )
    return // No-op in dev / unconfigured environments
  }

  const { trackPageView } = useAnalytics()
  const router = useRouter()

  // `primed` guards the initial page_view so it fires exactly once, regardless
  // of whether router.afterEach or app:mounted runs first for the first route.
  let primed = false

  nuxtApp.hook('app:mounted', () => {
    if (primed) return
    primed = true
    trackPageView(router.currentRoute.value.fullPath)
  })

  router.afterEach((to) => {
    if (!primed) {
      // afterEach fired for the initial route before app:mounted — count it
      // as the initial page_view and let app:mounted skip.
      primed = true
    }
    trackPageView(to.fullPath)
  })
})
