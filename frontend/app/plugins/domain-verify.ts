// Injects the per-market <meta name="facebook-domain-verification"> into <head>,
// resolved at RUNTIME from the request host (useRegion → REGION_FB_VERIFY). This
// is a UNIVERSAL plugin (no .client), so it runs during SSR and the tag lands in
// the server-rendered HTML head — which is what Meta scrapes to verify a domain.
//
// Why not nuxt.config head: that resolves at BUILD time from NUXT_PUBLIC_REGION,
// which isn't set on the Vercel projects, so it rendered empty. useRegion reads
// the host, so the correct token renders for whatever domain is being served.

export default defineNuxtPlugin(() => {
  const token = REGION_FB_VERIFY[useRegion()]
  if (token) {
    useHead({ meta: [{ name: 'facebook-domain-verification', content: token }] })
  }
})
