import { loadStripe } from '@stripe/stripe-js'

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()

  // Single source of truth: the publishable key + mode come from the backend,
  // which reads them from admin → Payments (Integration record, mode-aware). This
  // is why the key isn't configured here — switch mode / rotate keys in admin and
  // the site follows, with no redeploy. The build-time env key is only a fallback
  // for the rare case the config request fails, so checkout still loads.
  let publishableKey = ''
  try {
    const res: any = await $fetch(getApiPath('stripe/config'))
    if (res?.status === 'success' && res?.publishable_key) {
      publishableKey = res.publishable_key as string
    }
  } catch {
    // ignore — fall back to the env key below
  }
  if (!publishableKey) {
    publishableKey = (config.public.stripePublishableKey as string) || ''
  }

  // loadStripe() fetches the external https://js.stripe.com/v3 script. If that load
  // fails (ad blocker, offline, CSP, CDN hiccup) it REJECTS — and because this plugin
  // runs at boot on EVERY page, an unhandled rejection here crashes the whole app with
  // a 500 "Failed to load Stripe.js", even on pages that never touch Stripe. Swallow it:
  // leave stripe = null and let the checkout page (SignupForm) re-load Stripe on demand.
  let stripe = null
  if (publishableKey) {
    try {
      stripe = await loadStripe(publishableKey)
    } catch (e) {
      console.warn('[stripe] Stripe.js failed to load — checkout will retry on demand:', e)
    }
  }
  return { provide: { stripe } }
})
