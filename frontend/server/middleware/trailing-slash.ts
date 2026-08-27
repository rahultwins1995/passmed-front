/**
 * Trailing-slash normalisation — audit PM-38.
 *
 * `/faq` and `/faq/` both returned 200 with a canonical tag that mirrored
 * whichever URL was requested rather than normalising — genuine duplicate
 * content. `redirects.ts` only handles admin-defined exact-path rules, so it
 * doesn't cover this generic case. 301 any non-root path ending in `/` to its
 * bare form; usePageSeo's canonical (which reads route.path verbatim) then
 * self-corrects once the redirect lands.
 *
 * Scope matches redirects.ts: public marketing routes only. Portal paths,
 * the /api proxy, Nuxt internals and static assets are skipped.
 */
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return

  const rawPath = event.path || '/'
  const qi = rawPath.indexOf('?')
  const pathOnly = qi >= 0 ? rawPath.slice(0, qi) : rawPath

  if (
    pathOnly === '/' ||
    !pathOnly.endsWith('/') ||
    pathOnly.startsWith('/api') ||
    pathOnly.startsWith('/_nuxt') ||
    pathOnly.startsWith('/__nuxt') ||
    pathOnly.startsWith('/_ipx') ||
    pathOnly.startsWith('/assets') ||
    pathOnly.startsWith('/student') ||
    pathOnly.startsWith('/institute')
  ) return

  const query = qi >= 0 ? rawPath.slice(qi) : ''
  await sendRedirect(event, pathOnly.replace(/\/+$/, '') + query, 301)
})
