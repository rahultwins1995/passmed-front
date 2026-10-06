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
  // The key comes from /stripe/config (the backend's live key) on first use, with
  // the build-time env key as a fallback. SignupForm additionally re-checks the
  // key at pay time so a Test/Live switch after boot is honoured.
  let cached: any = null
  let inflight: Promise<any> | null = null

  const $stripe = (): Promise<any> => {
    if (cached) return Promise.resolve(cached)
    if (inflight) return inflight
    inflight = (async () => {
      // Prefer the LIVE publishable key from the backend (admin → Payments is the
      // single source of truth — the same account that creates the PaymentIntent).
      // The build-time env key is only a fallback: when it drifted from the
      // backend's account, every portal checkout failed with "No such
      // payment_intent" while the signup form (which already did this) worked.
      // Read config synchronously, before any await (Nuxt context is lost after one).
      const configUrl = getApiPath('stripe/config')
      const envKey = (useRuntimeConfig().public.stripePublishableKey as string) || ''
      let key = ''
      try {
        const res: any = await $fetch(configUrl)
        if (res?.status === 'success' && res?.publishable_key) key = res.publishable_key
      } catch { /* fall back to the build-time key below */ }
      if (!key) key = envKey
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
