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
  // Graceful degradation: the /opportunities page reads this route and renders
  // `listings ?? []`, so an EMPTY board is a valid, non-broken state. If the board
  // isn't configured on this market (no Airtable token/base), return an empty board
  // (200) instead of throwing — a missing config must NOT 500 the whole page
  // (Sentry PASSMED-D "Upstream error"/"Board not configured"). Short cache so it
  // recovers on its own the moment config is added, without a 1-day empty cache.
  if (!token || !target) {
    setResponseHeader(event, 'Cache-Control', 'public, max-age=0, s-maxage=60')
    return { count: 0, regions: target?.regions ?? [], listings: [] as Listing[], degraded: 'not-configured' }
  }

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
    // Airtable upstream failed (down / rate-limited / transient / bad token). Don't
    // 502 the whole /opportunities page — return an empty board (200) so the page
    // still renders, and use a SHORT cache (not the 1-day success cache) so a
    // transient Airtable blip isn't stuck as an empty board for a day; the next
    // request retries and recovers automatically. Logged for Sentry visibility.
    console.error('listings error', e?.data || e?.message || e)
    setResponseHeader(event, 'Cache-Control', 'public, max-age=0, s-maxage=60')
    return { count: 0, regions: target.regions, listings: [] as Listing[], degraded: 'upstream' }
  }

  // Cache at the CDN. The board only changes at the monthly ingest+approval (a
  // redeploy busts this), but cap fresh-cache at 1 day and serve stale-while-
  // revalidate for a month so a newly-approved listing can never be stuck behind
  // a 30-day cache if a deploy-hook purge is ever missed.
  setResponseHeader(event, 'Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=2592000')
  return { count: listings.length, regions: target.regions, listings }
})
