// Recover from stale-chunk errors after a deploy.
//
// A tab left open across a deploy still has the OLD index.html/hashes in memory; when
// it later lazy-loads a chunk (route nav OR a lazy/async component) the browser requests
// a file that no longer exists on the CDN (the old build's chunks are gone) and throws:
//   • "Failed to fetch dynamically imported module"  (Chrome / desktop)
//   • "Importing a module script failed"             (iOS Safari / iOS Chrome = WebKit)
//   • "error loading dynamically imported module"    (Firefox)
// The fix isn't in app code — it's a hard reload to pick up the new build; `persistState`
// carries the current Nuxt payload/state across the reload so the user keeps their place.
//
// Nuxt's `app:chunkError` only fires for ROUTE-chunk failures during navigation. A
// NON-route lazy import failing during render is caught by Vue's error handler instead
// (Sentry PASSMED-A — `Importing a module script failed` on /student, iPad/iOS) and would
// otherwise NOT be recovered. So we also watch vue:error + window error/unhandledrejection,
// but THERE we reload ONLY when the message is a chunk-import failure — never on unrelated
// app errors (which would turn any error into a reload loop).
//
// Guarded to fire once: the error can surface more than once in a single broken session,
// and a reload loop would be worse than the error it's fixing.
export default defineNuxtPlugin((nuxtApp) => {
  let reloaded = false
  const CHUNK_ERR = /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module|not a valid javascript mime type|unable to preload css/i

  const hardReload = () => {
    if (reloaded) return
    reloaded = true
    reloadNuxtApp({ persistState: true })
  }
  const recoverIfChunk = (msg: unknown) => {
    if (!reloaded && CHUNK_ERR.test(String(msg ?? ''))) hardReload()
  }

  // 1) Route-chunk load failures during client-side navigation — always a chunk error.
  nuxtApp.hook('app:chunkError', () => hardReload())

  // 2) Vue errors — a lazy/async component import failing during render is caught HERE,
  //    not by app:chunkError (the iOS /student case). Reload only for chunk-import msgs.
  nuxtApp.hook('vue:error', (err: any) => recoverIfChunk(err?.message ?? err))

  // 3) Uncaught dynamic-import rejections / errors that never reach Vue.
  if (import.meta.client) {
    window.addEventListener('unhandledrejection', (e: any) => recoverIfChunk(e?.reason?.message ?? e?.reason))
    window.addEventListener('error', (e: any) => recoverIfChunk(e?.message))
  }
})
