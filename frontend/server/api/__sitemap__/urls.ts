import { defineSitemapEventHandler } from '#imports'
import { callLaravel } from '../../utils/laravel'
import { BY_REGION } from '../../../app/data/resources'

// Host → region, resolved per request. Duplicates the mapping in
// app/composables/useRegion.ts / server/routes/robots.txt.ts / server/plugins/
// site-config.ts rather than importing it: useRegion() relies on Nuxt-app
// auto-imports that don't exist inside the Nitro bundle. Keep these in sync.
const REGION_BY_HOST: Record<string, string> = {
  'passmed.com':       'US',
  'www.passmed.com':   'US',
  'passmed.co.za':     'SA',
  'www.passmed.co.za': 'SA',
  'passmed.uk':        'UK',
  'www.passmed.uk':    'UK',
  'passmed.ca':        'CA',
  'www.passmed.ca':    'CA',
  'mccqeprep.com':     'CA',
  'www.mccqeprep.com': 'CA',
  'passamc.org':       'AU',
  'www.passamc.org':   'AU',
  'passmed.ph':        'PH',
  'www.passmed.ph':    'PH',
}

// Dynamic sitemap source: lists every published exam detail page (/exam/{slug})
// plus the current market's resource/guide articles (/resources/{slug}), so
// both surface in the sitemap automatically. Registered in the root
// nuxt.config.ts under `sitemap.sources`. This route is more specific than
// the `/api/[...]` proxy, so Nitro matches it here (not the Laravel proxy).
//
// The resource slugs used to be a hand-duplicated, build-time list in the root
// nuxt.config.ts (RESOURCE_SLUGS), keyed on NUXT_PUBLIC_REGION — which drifted
// (UK was missing entirely, per audit PM-31) and never had CA/AU/PH at all, so
// those three markets silently emitted US article URLs. Resolving the region
// from the request Host here (same pattern as robots.txt.ts) and sourcing the
// slugs straight from app/data/resources*.ts fixes both: every market always
// lists its own, current resource URLs, with no second list to keep in sync.
export default defineSitemapEventHandler(async (event) => {
  const host = String(getRequestHeader(event, 'host') || '').toLowerCase().split(':')[0]
  const region = REGION_BY_HOST[host] || 'US'
  const resourceUrls = (BY_REGION[region] || BY_REGION.US).map(a => ({
    loc: `/resources/${a.slug}`,
    changefreq: 'monthly' as const,
    priority: 0.6,
  }))

  try {
    const res = await callLaravel<{ status?: string; data?: any[] }>('/exams')
    const exams = res?.data || []

    const examUrls = exams
      // `page` is the exam slug (see Api_front_examsController::index).
      // Exclude is_external stub records (e.g. amc, mccqe, usmle-step-2) —
      // they carry no pricing/content of their own and the detail page now
      // 404s them (audit PM-24/PM-31); including them here just re-creates
      // the exam-not-found crawl spam this fix was meant to stop.
      .filter((e: any) => e?.page && !e?.is_external)
      .map((e: any) => ({
        loc: `/exam/${e.page}`,
        changefreq: 'weekly',
        priority: 0.8,
      }))

    return [...resourceUrls, ...examUrls]
  } catch {
    // If Laravel is unreachable when the sitemap is generated, still emit the
    // resource URLs rather than failing the whole sitemap.
    return resourceUrls
  }
})
