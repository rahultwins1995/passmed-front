import { defineSitemapEventHandler } from '#imports'
import { callLaravel } from '../../utils/laravel'

// Dynamic sitemap source: lists every published exam detail page (/exam/{slug})
// so newly added exams surface in the sitemap automatically. Registered in the
// root nuxt.config.ts under `sitemap.sources`. This route is more specific than
// the `/api/[...]` proxy, so Nitro matches it here (not the Laravel proxy).
export default defineSitemapEventHandler(async () => {
  try {
    const res = await callLaravel<{ status?: string; data?: any[] }>('/exams')
    const exams = res?.data || []

    return exams
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
  } catch {
    // If Laravel is unreachable when the sitemap is generated, emit no exam
    // URLs rather than failing the whole sitemap.
    return []
  }
})
