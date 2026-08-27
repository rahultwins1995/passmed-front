/**
 * Keep the Vercel preview origins out of the search index.
 *
 * Each market is also reachable on pm-frontend-<cc>.vercel.app (and the per-deploy
 * and git-branch aliases), serving a byte-identical copy of the real site on a
 * publicly crawlable host. That is duplicate content competing with the real
 * domain for its own keywords.
 *
 * Paired with useSiteUrl(), which makes those origins canonicalise to the real
 * domain, and with server/routes/robots.txt.ts, which deliberately still allows
 * crawling so this header actually gets read.
 */
export default defineEventHandler((event) => {
  const host = String(getRequestHeader(event, 'host') || '').toLowerCase()
  if (host.endsWith('.vercel.app')) {
    setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  }
})
