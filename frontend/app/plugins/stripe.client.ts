export default defineNuxtPlugin(() => {
  // LAZY Stripe loader — nothing runs at boot.
  //
  // Previously this plugin eagerly fetched /stripe/config AND loaded Stripe.js on
  // EVERY page (marketing + portals included), pulling @stripe/stripe-js and the
  // external js.stripe.com script onto pages that never touch payments — a large
  // perf cost (bundle + render/TBT). Now $stripe is a memoized function: the
  // @stripe/stripe-js chunk + Stripe.js load ONLY the first time a checkout path
  // actually calls $stripe().
  //
  // The key here is only the build-time env FALLBACK. Checkout (SignupForm) still
  // re-loads Stripe with the LIVE publishable key from /stripe/config at pay time,
  // so a Test/Live switch after boot is always honoured; $stripe() is just the
  // resilient fallback for the rare case that config fetch fails.
  let cached: any = null
  let inflight: Promise<any> | null = null

  const $stripe = (): Promise<any> => {
    if (cached) return Promise.resolve(cached)
    if (inflight) return inflight
    inflight = (async () => {
      const key = (useRuntimeConfig().public.stripePublishableKey as string) || ''
      if (!key) { inflight = null; return null }
      try {
        const { loadStripe } = await import('@stripe/stripe-js')
        cached = await loadStripe(key)
      } catch (e) {
        console.warn('[stripe] Stripe.js failed to load — checkout will retry on demand:', e)
        cached = null
      }
      inflight = null
      return cached
    })()
    return inflight
  }

  return { provide: { stripe: $stripe } }
})
