/**
 * Shared server-side helpers for the Opportunities board (Nuxt/Nitro).
 * Files in server/utils are auto-imported into server routes — no import needed.
 *
 * MULTITENANT: which Airtable base + which regions a site shows is decided SERVER-SIDE,
 * from this deployment's runtimeConfig (per Vercel project) with a request-host fallback.
 * A US page can never read/write another market's base.
 */
import type { H3Event } from 'h3'

export const BASES = {
  usCa: 'appKrZZijUD5K6De2',      // US/CA board  (passmed.com, passmed.ca)
  ukSaAu: 'apppdkplqNVBILn58',    // UK/SA/AU board (passmed.co.za, passmed.uk, passamc.org)
  seaPh: 'appaeFMpg1WhOlb4K',     // SEA/PH board (passmed.ph) — single-market
}

// host → { base, region } fallback when runtimeConfig doesn't pin them
export const HOST_MAP: Record<string, { base: string; region: string }> = {
  'passmed.com':   { base: BASES.usCa,   region: 'United States' },
  'passmed.ca':    { base: BASES.usCa,   region: 'Canada' },
  'mccqeprep.com': { base: BASES.usCa,   region: 'Canada' },
  'passmed.co.za': { base: BASES.ukSaAu, region: 'South Africa' },
  'passmed.uk':    { base: BASES.ukSaAu, region: 'United Kingdom' },
  'passamc.org':   { base: BASES.ukSaAu, region: 'Australia' },
  'passmed.ph':    { base: BASES.seaPh,  region: 'Philippines' },
}

// Dedicated single-market boards (one base, ONE site — not shared across sibling
// markets) show EVERY published listing in their base, with no region filter.
// The Philippines/SEA board is deliberately mixed: Philippines roles/courses/exams
// PLUS abroad-pathway listings (International — UK/NHS, International — US), so
// filtering by region would wrongly hide the pathway listings. The shared US/CA
// and UK/SA/AU boards keep their region filter (siblings share one base).
export const SINGLE_MARKET_BASES = new Set<string>([BASES.seaPh])

// a site shows its own region(s) plus anything global/remote (legacy label variants included)
export const REGION_SETS: Record<string, string[]> = {
  'United States':  ['United States'],
  'Canada':         ['Canada'],
  'United Kingdom': ['United Kingdom', 'UK'],
  'South Africa':   ['South Africa'],
  'Australia':      ['Australia', 'New Zealand'],
}
export const GLOBAL_REGIONS = ['Remote / Global', 'Remote']

// Each Airtable base backs a *shared* board across sibling market sites, so a site
// shows every region its base carries (not just its own country) and the UI's
// country filter narrows it down. This is why passmed.com surfaces Canada listings
// too — they live in the same US/CA base. (Legacy label variants included.)
export const BASE_REGIONS: Record<string, string[]> = {
  [BASES.usCa]:   ['United States', 'Canada'],
  [BASES.ukSaAu]: ['United Kingdom', 'UK', 'South Africa', 'Australia', 'New Zealand'],
}

export const TABLE = 'Opportunities'
export const AIRTABLE = (base: string) => `https://api.airtable.com/v0/${base}/${TABLE}`

const stripWww = (h: string) => (h || '').replace(/^www\./, '').split(':')[0].toLowerCase()

// Regions a base serves: the full base set, else the single-region set, plus global/remote.
const regionsForBase = (base: string, region: string) =>
  [...(BASE_REGIONS[base] || REGION_SETS[region] || (region ? [region] : [])), ...GLOBAL_REGIONS]

/** Resolve { base, regions } for this request from runtimeConfig, else the host map. */
export function resolveTarget(event: H3Event) {
  const cfg = useRuntimeConfig()
  if (cfg.opportunitiesBase) {
    const override = String(cfg.opportunitiesRegions || '').split(',').map(s => s.trim()).filter(Boolean)
    const dr = String(cfg.defaultRegion || '')
    const base = String(cfg.opportunitiesBase)
    // Explicit override wins; else a single-market base shows all published
    // (no region filter); else the shared-base region set.
    const regions = override.length ? override
      : SINGLE_MARKET_BASES.has(base) ? []
      : regionsForBase(base, dr)
    return { base, region: dr, regions }
  }
  const hit = HOST_MAP[stripWww(getRequestHost(event))]
  if (!hit) return null
  const regions = SINGLE_MARKET_BASES.has(hit.base) ? [] : regionsForBase(hit.base, hit.region)
  return { base: hit.base, region: hit.region, regions }
}

export type Listing = {
  id: string; title: string; category: string; region: string; org: string; location: string
  format: string; type: string; cost: string; dates: string; closing: string; rolling: boolean
  requiresCV: boolean; requiresCover: boolean; description: string; tags: string[]
  link: string; enquiriesEmail: string; salary: string; logo: string
}

export function shapeRecord(rec: any): Listing {
  const f = rec.fields || {}
  const logo = Array.isArray(f.Logo) && f.Logo[0] ? (f.Logo[0].thumbnails?.large?.url || f.Logo[0].url) : ''
  return {
    id: rec.id,
    title: f.Title || '', category: (f.Category || '').toLowerCase(), region: f.Region || '',
    org: f.Organisation || '', location: f.Location || '', format: f.Format || '', type: f.Type || '',
    cost: f.Cost || '', dates: f.Dates || '', closing: f['Closing date'] || '', rolling: !!f.Rolling,
    requiresCV: !!f['Requires CV'], requiresCover: !!f['Requires cover letter'],
    description: f.Description || '', tags: String(f.Tags || '').split(';').map((s: string) => s.trim()).filter(Boolean),
    link: f['Source URL'] || '', enquiriesEmail: f['Enquiries email'] || '',
    salary: f['Salary / Remuneration'] || '', logo,
  }
}

export const esc = (s: string) => String(s).replace(/'/g, "\\'")
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '')
