import { fileURLToPath } from 'node:url'

// Resource/blog article slugs per market — mirrors frontend/app/data/resources*.
// Keep in sync when adding guides so each region's sitemap lists its own posts.
//
// Audit PM-31: UK was missing here entirely, so its sitemap silently fell back
// to RESOURCE_SLUGS.US — 3 dead US article slugs, and none of the UK's 11 real
// guides. Better fix: generate this list from frontend/app/data/resources-uk.ts
// (etc.) directly instead of hand-duplicating slugs a second time; keeping the
// explicit list for now to match how CA/AU/PH are already done here.
const RESOURCE_SLUGS: Record<string, string[]> = {
  US: ['abim-boards-study-plan', 'shelf-exam-study-timeline', 'img-us-residency-pathway'],
  SA: ['fcp-part-1-sa-complete-guide', 'fcog-part-1-sa-complete-guide', 'surgical-primaries-sa-complete-guide', 'diploma-hiv-management-sa-complete-guide', 'fcem-part-1-sa-complete-guide'],
  UK: ['mrcp-part-2-complete-guide', 'mrcs-part-a-complete-guide', 'frca-primary-complete-guide', 'mrcem-sba-complete-guide', 'mrcgp-akt-complete-guide', 'msra-complete-guide', 'mrcpch-fop-tas-complete-guide', 'mrcpsych-paper-a-complete-guide', 'mrcog-part-1-complete-guide', 'ukmla-akt-complete-guide', 'plab-1-complete-guide'],
}
const REGION = (process.env.NUXT_PUBLIC_REGION || 'US').toUpperCase()
const RESOURCE_URLS = (RESOURCE_SLUGS[REGION] || RESOURCE_SLUGS.US)
  .map(s => ({ loc: `/resources/${s}`, changefreq: 'monthly' as const, priority: 0.6 }))

// Mirrors SITE_URL_BY_REGION in frontend/app/composables/useSiteUrl.ts and
// SITE_URL_BY_HOST in frontend/server/routes/robots.txt.ts. Audit PM-30: this
// sitemap config previously trusted NUXT_PUBLIC_SITE_URL alone, which has
// shipped wrong (pointing at a pm-frontend-*.vercel.app preview origin) on
// several markets before — the two files above were already fixed the same
// way canonicals/robots.txt were. site.url is resolved once at boot (not
// per-request, unlike useSiteUrl()), so NUXT_PUBLIC_REGION being set per
// Vercel project is still the real fix — this is the belt-and-braces half.
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
      ...RESOURCE_URLS,
      { loc: '/about-us',     changefreq: 'monthly', priority: 0.6 },
      { loc: '/faq',          changefreq: 'monthly', priority: 0.6 },
      { loc: '/contact',      changefreq: 'monthly', priority: 0.5 },
      { loc: '/terms',        changefreq: 'yearly',  priority: 0.3 },
      { loc: '/privacy',      changefreq: 'yearly',  priority: 0.3 },
    ],

    // Dynamic exam detail pages (/exam/{slug}) — fetched at runtime from Laravel
    // so newly published exams appear automatically. See the endpoint in
    // frontend/server/api/__sitemap__/urls.ts.
    sources: ['/api/__sitemap__/urls'],
  },
})
