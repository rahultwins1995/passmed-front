import { fileURLToPath } from 'node:url'

const REGION = (process.env.NUXT_PUBLIC_REGION || 'US').toUpperCase()

// Mirrors SITE_URL_BY_REGION in frontend/app/composables/useSiteUrl.ts and
// SITE_URL_BY_HOST in frontend/server/routes/robots.txt.ts. Audit PM-30: this
// sitemap config previously trusted NUXT_PUBLIC_SITE_URL alone, which has
// shipped wrong (pointing at a pm-frontend-*.vercel.app preview origin) on
// several markets before — the two files above were already fixed the same
// way canonicals/robots.txt were. This value is only the boot-time fallback:
// server/plugins/site-config.ts overrides it per request from the Host
// header (same allowlist as useSiteUrl()/robots.txt), so sitemap.xml is
// correct even when NUXT_PUBLIC_REGION is missing or wrong on a Vercel
// project — which is exactly what happened on UK. Getting NUXT_PUBLIC_REGION
// set correctly per project is still worth doing (it drives currency,
// support hours, pricing, etc., none of which this middleware touches).
const SITE_URL_BY_REGION: Record<string, string> = {
  US: 'https://www.passmed.com',
  SA: 'https://www.passmed.co.za',
  UK: 'https://www.passmed.uk',
  CA: 'https://www.passmed.ca',
  AU: 'https://www.passamc.org',
  PH: 'https://www.passmed.ph',
}
const SITE_URL = SITE_URL_BY_REGION[REGION] || process.env.NUXT_PUBLIC_SITE_URL || 'https://www.passmed.com'

export default defineNuxtConfig({
  compatibilityDate: '2026-04-17',

  // Loading screen for client-only (ssr:false) routes — /institute and /student —
  // shown from the HTML shell until Vue mounts and the auth guard (/me) resolves.
  // Fixes the blank screen after a "Log as" handoff. Marketing pages are SSR.
  spaLoadingTemplate: fileURLToPath(new URL('./frontend/app/spa-loading-template.html', import.meta.url)),

  // NOTE: previously had a Nitro devProxy mapping `/api` → https://passmed.com.
  // It was unused (the frontend layer's useApi.ts goes direct to Laravel in
  // dev) and actively harmful — Nitro's prefix matching meant `/api-student/*`
  // and `/api-institute/*` requests were also caught and forwarded to the
  // wrong host. Removed.

  extends: [
    './frontend',
    './institute',
    './student',
  ],

  modules: ['@nuxtjs/sitemap'],

  // NOTE: the home ('/') used to be SWR-cached (swr: 600). But region is resolved
  // per-request from the Host header (useRegion → useRequestURL) whenever
  // NUXT_PUBLIC_REGION isn't set, and the SWR cache is NOT keyed by host — so a
  // cache entry warmed by a non-market host (e.g. Vercel's internal deployment
  // URL) would serve the wrong region (US) to every visitor: wrong currency,
  // country selector, reviews. Until NUXT_PUBLIC_REGION is set per project (which
  // makes region deterministic and the cache safe again), render the home
  // per-request so the region is always correct.
  // routeRules: { '/': { swr: 600 } },

  // Canonical site origin used to build absolute sitemap URLs. Region-derived
  // first (see SITE_URL_BY_REGION above — audit PM-30), NUXT_PUBLIC_SITE_URL
  // only as a fallback for an unmapped region, then the US default.
  site: {
    url: SITE_URL,
  },

  sitemap: {
    // WHITELIST: the student & institute layers ship private dashboard/session
    // pages. excludeAppSources turns OFF auto route-discovery so none of those
    // private routes can leak into the public sitemap — only the URLs we list
    // below (static marketing pages + the dynamic exam source) are included.
    excludeAppSources: true,

    // Static, build-time marketing pages.
    urls: [
      { loc: '/',             changefreq: 'weekly',  priority: 1.0 },
      { loc: '/exams',        changefreq: 'weekly',  priority: 0.9 },
      { loc: '/pricing',      changefreq: 'weekly',  priority: 0.8 },
      { loc: '/institutions', changefreq: 'monthly', priority: 0.8 },
      { loc: '/opportunities', changefreq: 'weekly', priority: 0.8 },
      { loc: '/img-pathways', changefreq: 'monthly', priority: 0.7 },
      { loc: '/resources',    changefreq: 'weekly',  priority: 0.7 },
      { loc: '/about-us',     changefreq: 'monthly', priority: 0.6 },
      { loc: '/faq',          changefreq: 'monthly', priority: 0.6 },
      { loc: '/contact',      changefreq: 'monthly', priority: 0.5 },
      { loc: '/terms',        changefreq: 'yearly',  priority: 0.3 },
      { loc: '/privacy',      changefreq: 'yearly',  priority: 0.3 },
    ],

    // Dynamic exam detail pages (/exam/{slug}) AND each market's resource/guide
    // articles (/resources/{slug}) — both resolved per-request from the Host
    // header so every market gets its own correct URLs (see the handler for
    // why this replaced a static, build-time resource-slug list here).
    sources: ['/api/__sitemap__/urls'],
  },

  // Modern build target — emit modern JS instead of transpiling down to ES5 and
  // shipping legacy polyfills (addresses Lighthouse "Legacy JavaScript" → smaller
  // bundle, less main-thread work). es2020 is supported by every browser since
  // ~2020; only truly ancient browsers (IE11) drop off, which this audience does
  // not use. Config-only — no app logic changes.
  vite: {
    build: {
      target: 'es2020',
    },
  },
})
