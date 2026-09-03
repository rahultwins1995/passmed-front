/**
 * Apex → www canonicalization for the live custom domains.
 *
 * Each market's Vercel project has both the apex (e.g. passmed.co.za) and the
 * www subdomain attached (see SITE_URL_BY_REGION-style host lists elsewhere
 * in this codebase), and Vercel serves both directly with no redirect between
 * them unless one is configured. The apex currently answers 200 — its
 * canonical tag already points at the www version (useSiteUrl.ts), so it
 * isn't indexed as a duplicate — but an actual 301 is tidier and matches the
 * host every sitemap, robots.txt `Sitemap:` line, and Search Console property
 * already use.
 *
 * mccqeprep.com and passmed.org are deliberately NOT in this list: neither
 * resolves to this app's Vercel projects (confirmed via DNS — they point at
 * separate, non-Vercel hosting), so whatever redirect they need lives there,
 * not here.
 *
 * Scope matches redirects.ts / trailing-slash.ts: public marketing routes only.
 */
const APEX_HOSTS = new Set([
  'passmed.com',
  'passmed.co.za',
  'passmed.uk',
  'passmed.ca',
  'passamc.org',
  'passmed.ph',
])

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return

  const rawPath = event.path || '/'
  if (
    rawPath.startsWith('/api') ||
    rawPath.startsWith('/_nuxt') ||
    rawPath.startsWith('/__nuxt') ||
    rawPath.startsWith('/_ipx') ||
    rawPath.startsWith('/assets') ||
    rawPath.startsWith('/student') ||
    rawPath.startsWith('/institute')
  ) return

  const host = String(getRequestHeader(event, 'host') || '').toLowerCase().split(':')[0]
  if (!APEX_HOSTS.has(host)) return

  await sendRedirect(event, `https://www.${host}${rawPath}`, 301)
})
