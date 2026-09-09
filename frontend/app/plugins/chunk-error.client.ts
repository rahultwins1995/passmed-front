// Recover from stale-chunk errors after a deploy.
//
// A tab left open across a deploy still has the OLD index.html/hashes in
// memory; when it later lazy-loads a route chunk (client-side nav, or a
// dynamic import), the browser requests a file that no longer exists on the
// CDN (the old build's chunks are gone) and throws
// `TypeError: Importing a module script failed` — PASSMED-A, seen on
// /student/past. The fix isn't in app code, it's a hard reload to pick up
// the new build; `persistState: true` carries the current Nuxt payload/state
// across that reload so the user doesn't lose their place.
//
// Guarded to fire once: `app:chunkError` can fire more than once in a single
// broken session (e.g. two lazy chunks fail before the reload completes),
// and a reload loop would be worse than the error it's fixing.
export default defineNuxtPlugin((nuxtApp) => {
  let reloaded = false
  nuxtApp.hook('app:chunkError', () => {
    if (reloaded) return
    reloaded = true
    reloadNuxtApp({ persistState: true })
  })
})
