// Captures first-touch ad attribution (utm_*, gclid/gbraid/wbraid + referrer)
// into the pm_attr cookie on every page load — including exam landing pages
// (app/pages/exam/[slug].vue), since that's where ad traffic actually lands,
// not just /signup. useAttribution().persist() is a no-op once pm_attr is
// already set, so this never overwrites the first touch on later page views.
export default defineNuxtPlugin(() => {
  useAttribution().persist()
})
