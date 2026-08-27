// Loads the advertising tags — Meta Pixel + Google Ads — subject to config + consent.
//
// Consent-first: the Meta Pixel base script is NOT injected until the user grants
// MARKETING consent (useCookieConsent → marketingGranted). Google Ads rides on the
// already-loaded gtag.js and is gated by Consent Mode (ad_storage stays denied
// until marketing consent), so we can `config` it immediately without dropping a
// cookie early. The Pixel is a safe no-op when its ID is unset; the Ads tag now always has
// an ID, because it falls back to the shared GOOGLE_ADS_ID default in useRegion.ts.
//
// The actual events (ViewContent / AddToCart / InitiateCheckout / AddPaymentInfo /
// Purchase, and the Ads conversion) are fired from useAnalytics — this plugin only
// bootstraps the tags.

export default defineNuxtPlugin(() => {
  const cfg = useRuntimeConfig().public as Record<string, string>
  // Pixel ID: env override, else the per-market default keyed off the host region.
  const metaPixelId = cfg.metaPixelId || REGION_META_PIXEL[useRegion()] || ''
  // Ads tag: env override, else the shared account default (see useRegion.ts).
  const googleAdsId = cfg.googleAdsId || GOOGLE_ADS_ID
  const { marketingGranted } = useCookieConsent()

  // ── Google Ads: register the account on the existing gtag.js ──────────────
  // Consent Mode holds ad cookies until marketing consent, so configuring now is
  // safe and lets a later `purchase` conversion resolve against this account.
  if (googleAdsId && typeof window !== 'undefined') {
    const w = window as any
    if (typeof w.gtag === 'function') w.gtag('config', googleAdsId)
  }

  // ── Meta Pixel: inject only once marketing consent is granted ─────────────
  if (!metaPixelId) return

  let loaded = false
  function loadPixel () {
    if (loaded || typeof window === 'undefined') return
    const w = window as any
    /* eslint-disable */
    // Standard Meta Pixel bootstrap (creates window.fbq + loads fbevents.js).
    ;(function (f: any, b: any, e: string, v: string) {
      if (f.fbq) return
      const n: any = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
      }
      if (!f._fbq) f._fbq = n
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []
      const t = b.createElement(e); t.async = true; t.src = v
      const s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
    })(w, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
    /* eslint-enable */
    // We only reach here with consent, so grant + init + record the initial view.
    w.fbq('consent', 'grant')
    w.fbq('init', metaPixelId)
    w.fbq('track', 'PageView')
    loaded = true
  }

  // Load now if consent already stored, and whenever it flips to granted.
  watch(marketingGranted, (granted) => { if (granted) loadPixel() }, { immediate: true })
})
