/**
 * GET /api/listings — the board's read path. Returns this site's PUBLISHED listings as JSON.
 *
 * The board only changes once a month (after the ingest + approval), so the response is
 * hard-cached at the CDN; publish the new month by redeploying (a Vercel deploy hook at the
 * end of the ingest, or the manual refresh workflow, handles this). No per-user Airtable hit.
 *
 * runtimeConfig (env): airtableToken, opportunitiesBase, defaultRegion,
 *                      opportunitiesRegions (optional CSV), listingsStatus (optional; staging preview)
 */
import { resolveTarget, shapeRecord, AIRTABLE, esc, type Listing } from '../utils/opportunities'

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig()
  const token = cfg.airtableToken as string
  const target = resolveTarget(event)
  if (!token || !target) throw createError({ statusCode: 500, statusMessage: 'Board not configured for this site' })

  const status = (cfg.listingsStatus as string) || 'Published'
  const st = `{Status}='${esc(status)}'`
  const ors = target.regions.map(r => `{Region}='${esc(r)}'`).join(',')
  const formula = target.regions.length ? `AND(${st},OR(${ors}))` : st

  const fields = ['Title', 'Category', 'Region', 'Organisation', 'Location', 'Format', 'Type', 'Cost',
    'Dates', 'Closing date', 'Rolling', 'Requires CV', 'Requires cover letter', 'Description', 'Tags',
    'Source URL', 'Enquiries email', 'Salary / Remuneration', 'Logo']

  const listings: Listing[] = []
  let offset: string | undefined
  try {
    do {
      const res: any = await $fetch(AIRTABLE(target.base), {
        headers: { Authorization: `Bearer ${token}` },
        query: { filterByFormula: formula, pageSize: 100, offset, 'fields[]': fields },
      })
      for (const rec of res.records) listings.push(shapeRecord(rec))
      offset = res.offset
    } while (offset)
  } catch (e: any) {
    console.error('listings error', e?.data || e?.message || e)
    throw createError({ statusCode: 502, statusMessage: 'Upstream error' })
  }

  // Cache at the CDN. The board only changes at the monthly ingest+approval (a
  // redeploy busts this), but cap fresh-cache at 1 day and serve stale-while-
  // revalidate for a month so a newly-approved listing can never be stuck behind
  // a 30-day cache if a deploy-hook purge is ever missed.
  setResponseHeader(event, 'Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=2592000')
  return { count: listings.length, regions: target.regions, listings }
})
