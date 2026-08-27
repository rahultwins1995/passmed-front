/**
 * robots.txt, resolved per market.
 *
 * Replaces the static public/robots.txt, which was a single file shared by all
 * six deploys with its Sitemap: line hardcoded to www.passmed.com — so every
 * non-US market pointed Google at the US sitemap.
 *
 * SITE_URL_BY_HOST duplicates the mapping in app/composables/useSiteUrl.ts
 * rather than importing it: that file relies on Nuxt auto-imports
 * (useRegion/useRuntimeConfig) which do not exist inside the Nitro bundle.
 * Keep the two in sync.
 *
 * Note we do NOT Disallow the *.vercel.app preview origins. Blocking them would
 * stop crawlers fetching the page at all, which means they would never see the
 * noindex header from server/middleware/preview-noindex.ts, and any already
 * indexed preview URLs would stay in the index indefinitely. Allow the crawl,
 * serve noindex, let them drop out.
 */

const SITE_URL_BY_HOST: Record<string, string> = {
  'passmed.com':       'https://www.passmed.com',
  'www.passmed.com':   'https://www.passmed.com',
  'passmed.co.za':     'https://www.passmed.co.za',
  'www.passmed.co.za': 'https://www.passmed.co.za',
  'passmed.uk':        'https://www.passmed.uk',
  'www.passmed.uk':    'https://www.passmed.uk',
  'passmed.ca':        'https://www.passmed.ca',
  'www.passmed.ca':    'https://www.passmed.ca',
  'mccqeprep.com':     'https://www.passmed.ca',
  'www.mccqeprep.com': 'https://www.passmed.ca',
  'passamc.org':       'https://www.passamc.org',
  'www.passamc.org':   'https://www.passamc.org',
  'passmed.ph':        'https://www.passmed.ph',
  'www.passmed.ph':    'https://www.passmed.ph',
}

export default defineEventHandler((event) => {
  const host = String(getRequestHeader(event, 'host') || '').toLowerCase().split(':')[0]
  const siteUrl = SITE_URL_BY_HOST[host] || 'https://www.passmed.com'

  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')

  return [
    'User-agent: *',
    'Disallow: /api/',
    'Disallow: /reset-password',
    'Disallow: /login',
    'Allow: /',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n')
})
