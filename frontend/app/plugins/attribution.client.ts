// Captures first-touch ad attribution (utm_*, gclid/gbraid/wbraid + referrer)
// into the pm_attr cookie on every page load — including exam landing pages
// (app/pages/exam/[slug].vue), since that's where ad traffic actually lands,
// not just /signup. useAttribution().persist() is a no-op once pm_attr is
// already set, so this never overwrites the first touch on later page views.
export default defineNuxtPlugin(() => {
  const attr = useAttribution()
  // Immediate capture — unconditional in non-consent markets; a no-op (gated) in the
  // consent-required markets (UK/SA) until marketing consent is granted.
  attr.persist()

  // In consent-required markets the first call is gated. Re-run persist() the moment
  // marketing consent is granted, so the landing URL's first-touch (gclid/utm still in
  // the query on the same page) is captured then rather than lost.
  const { marketingGranted } = useCookieConsent()
  watch(marketingGranted, (granted) => { if (granted) attr.persist() })
})
