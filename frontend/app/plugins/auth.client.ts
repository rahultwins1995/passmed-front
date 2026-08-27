// Client-only auth hydration.
//
// Auth here is an HttpOnly cookie consumed by our own /api proxy. During SSR —
// and especially ISR, where the rendered HTML is cached and shared across all
// users — there is no usable per-user cookie context, so resolving the user on
// the server is both wrong (it would bake a logged-out state into the cache)
// and a needless per-render network call that can fail or stall the Vercel
// function. Our route middleware already defers auth to the client
// (`if (import.meta.server) return`); this plugin does the same by being
// `.client` so it only ever runs in the browser.
//
// IMPORTANT: resolve the user only AFTER hydration (onNuxtReady), never before.
// SSR renders the header logged-out (there is no per-user cookie context during
// SSR). If this plugin `await fetchMe()` before the app mounts, a logged-in
// user's FIRST client render would already be logged-in ("My Portal / Logout")
// while the server HTML is logged-out ("Log In / Sign Up Free") — a hydration
// mismatch ("Hydration completed but contains mismatches"). Deferring to
// onNuxtReady keeps the first client render identical to the server, then flips
// the header to the logged-in state a tick later. The portal route guard
// (utils/portalGuard.ts) resolves auth on its own for /student|/institute, so it
// does not depend on this eager warm-up.
export default defineNuxtPlugin(() => {
  const { user, fetchMe } = useAuth()
  if (user.value) return

  onNuxtReady(() => { fetchMe() })
})
