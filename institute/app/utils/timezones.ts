/**
 * Timezones for the institute portal.
 *
 * The picker used to offer six zones — New York, Chicago, Denver, LA, Phoenix,
 * Honolulu — which is fine if every customer is American and wrong the moment one
 * isn't. A programme in London or Johannesburg had no way to say so, and the field
 * silently defaulted them to US Eastern.
 *
 * ── Why a curated list and not Intl.supportedValuesOf('timeZone') ───────────
 * That call returns ~420 zones, most of which are historical aliases or islands
 * with a population in the hundreds. Scrolling past `America/Indiana/Petersburg`
 * to find London is not an improvement. This list is one zone per country or
 * distinct offset that a medical-education customer plausibly sits in.
 *
 * The obvious hazard of curating is that someone's zone is missing. Two mitigations:
 *   1. zoneOptions() always includes whatever is already SAVED on the institution,
 *      even if it isn't in this list — so we never render a <select> whose current
 *      value has no matching <option>, which would blank the field and then quietly
 *      overwrite their zone on the next save.
 *   2. Adding a zone here is a one-line change.
 */

export type Zone = { tz: string; region: string; city: string }

/**
 * Grouped by IANA region, which is also how the <optgroup>s render.
 * Cities are the IANA city, not a marketing name — `Asia/Kolkata` says Kolkata.
 */
const CURATED: string[] = [
  // ── Africa ────────────────────────────────────────────────────────────────
  'Africa/Abidjan', 'Africa/Accra', 'Africa/Algiers', 'Africa/Cairo',
  'Africa/Casablanca', 'Africa/Harare', 'Africa/Johannesburg', 'Africa/Khartoum',
  'Africa/Lagos', 'Africa/Nairobi', 'Africa/Tunis', 'Africa/Windhoek',

  // ── Americas ──────────────────────────────────────────────────────────────
  'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Bogota',
  'America/Caracas', 'America/Chicago', 'America/Denver', 'America/Edmonton',
  'America/Guatemala', 'America/Halifax', 'America/Havana', 'America/Jamaica',
  'America/La_Paz', 'America/Lima', 'America/Los_Angeles', 'America/Mexico_City',
  'America/Montevideo', 'America/New_York', 'America/Panama', 'America/Phoenix',
  'America/Puerto_Rico', 'America/Santiago', 'America/Sao_Paulo',
  'America/St_Johns', 'America/Tijuana', 'America/Toronto', 'America/Vancouver',
  'America/Winnipeg',

  // ── Asia ──────────────────────────────────────────────────────────────────
  'Asia/Almaty', 'Asia/Baghdad', 'Asia/Baku', 'Asia/Bangkok', 'Asia/Beirut',
  'Asia/Colombo', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Ho_Chi_Minh',
  'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem', 'Asia/Kabul',
  'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Kuala_Lumpur',
  'Asia/Kuwait', 'Asia/Manila', 'Asia/Qatar', 'Asia/Riyadh', 'Asia/Seoul',
  'Asia/Shanghai', 'Asia/Singapore', 'Asia/Taipei', 'Asia/Tashkent',
  'Asia/Tbilisi', 'Asia/Tehran', 'Asia/Tokyo', 'Asia/Yangon',

  // ── Atlantic ──────────────────────────────────────────────────────────────
  'Atlantic/Azores', 'Atlantic/Canary', 'Atlantic/Cape_Verde', 'Atlantic/Reykjavik',

  // ── Australia ─────────────────────────────────────────────────────────────
  'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Darwin',
  'Australia/Hobart', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney',

  // ── Europe ────────────────────────────────────────────────────────────────
  'Europe/Amsterdam', 'Europe/Athens', 'Europe/Belgrade', 'Europe/Berlin',
  'Europe/Brussels', 'Europe/Bucharest', 'Europe/Budapest', 'Europe/Copenhagen',
  'Europe/Dublin', 'Europe/Helsinki', 'Europe/Istanbul', 'Europe/Kyiv',
  'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Europe/Malta',
  'Europe/Moscow', 'Europe/Oslo', 'Europe/Paris', 'Europe/Prague',
  'Europe/Rome', 'Europe/Sofia', 'Europe/Stockholm', 'Europe/Vienna',
  'Europe/Warsaw', 'Europe/Zurich',

  // ── Indian ────────────────────────────────────────────────────────────────
  'Indian/Maldives', 'Indian/Mauritius',

  // ── Pacific ───────────────────────────────────────────────────────────────
  'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Guam', 'Pacific/Honolulu',

  // ── UTC ───────────────────────────────────────────────────────────────────
  'UTC',
]

/** Order the <optgroup>s appear in. Anything unlisted falls to the end. */
const REGION_ORDER = ['Europe', 'Americas', 'Africa', 'Asia', 'Australia', 'Pacific', 'Atlantic', 'Indian', 'Other']

/** IANA calls it `America/*`; humans reading a dropdown expect "Americas". */
function regionOf(tz: string): string {
  const head = tz.split('/')[0] ?? 'Other'
  if (head === 'America') return 'Americas'
  if (head === 'UTC') return 'Other'
  return REGION_ORDER.includes(head) ? head : 'Other'
}

/** `America/Argentina/Buenos_Aires` → `Buenos Aires`. Last segment, underscores out. */
function cityOf(tz: string): string {
  const parts = tz.split('/')
  return (parts[parts.length - 1] ?? tz).replace(/_/g, ' ')
}

export function toZone(tz: string): Zone {
  return { tz, region: regionOf(tz), city: cityOf(tz) }
}

/**
 * Every zone we offer, with `saved` folded in if it isn't already there.
 *
 * Passing the institution's saved zone is what stops a curated list from being a
 * trap: an institution sitting on `Pacific/Chatham` keeps it, sees it, and can save
 * the form without silently losing it.
 */
export function zoneOptions(saved?: string): Zone[] {
  const all = new Set(CURATED)
  if (saved && isValidZone(saved)) all.add(saved)

  return [...all]
    .map(toZone)
    .sort((a, b) => {
      const ra = REGION_ORDER.indexOf(a.region)
      const rb = REGION_ORDER.indexOf(b.region)
      if (ra !== rb) return ra - rb
      return a.city.localeCompare(b.city)
    })
}

/** Regions present in a given option set, in display order. */
export function regionsOf(zones: Zone[]): string[] {
  return REGION_ORDER.filter(r => zones.some(z => z.region === r))
}

/** Does the runtime actually know this zone? Guards against junk in the DB. */
export function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/*
 * Intl.DateTimeFormat construction is the expensive part, not formatting. With ~110
 * zones re-rendered every 30s that's thousands of throwaway objects a minute, so the
 * formatters are built once and reused.
 */
const timeFmts   = new Map<string, Intl.DateTimeFormat>()
const offsetFmts = new Map<string, Intl.DateTimeFormat>()

function timeFmt(tz: string): Intl.DateTimeFormat {
  let f = timeFmts.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    })
    timeFmts.set(tz, f)
  }
  return f
}

function offsetFmt(tz: string): Intl.DateTimeFormat {
  let f = offsetFmts.get(tz)
  if (!f) {
    // `shortOffset` gives "GMT+2"; it's the one that's consistent across zones.
    // `short` would give "EST" for New York but still "GMT+2" for Johannesburg,
    // so it reads as inconsistent rather than helpful.
    try {
      f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' })
    } catch {
      f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' })
    }
    offsetFmts.set(tz, f)
  }
  return f
}

/** Wall-clock time in that zone right now, e.g. `14:32`. */
export function timeIn(tz: string, at: Date = new Date()): string {
  try { return timeFmt(tz).format(at) } catch { return '' }
}

/** UTC offset right now, e.g. `GMT+2`. DST-aware, because Intl resolves it per instant. */
export function offsetIn(tz: string, at: Date = new Date()): string {
  try {
    const part = offsetFmt(tz).formatToParts(at).find(p => p.type === 'timeZoneName')
    return part?.value ?? ''
  } catch {
    return ''
  }
}

/** `London · 14:32 · GMT+1` — what the <option> reads. */
export function zoneLabel(z: Zone, at: Date = new Date()): string {
  const t = timeIn(z.tz, at)
  const o = offsetIn(z.tz, at)
  return [z.city, t, o].filter(Boolean).join('  ·  ')
}

/*
 * ── Country default ─────────────────────────────────────────────────────────
 *
 * Keyed off the portal's own hostname, so passmed.uk lands a UK programme on
 * Europe/London instead of asking them to hunt for it. This is only a DEFAULT: it
 * applies when the institution has never saved a zone, and never overrides one that
 * has been saved.
 *
 * Longest suffix wins — `.co.za` is checked before `.za`.
 */
const TLD_DEFAULTS: Array<[string, string]> = [
  ['.co.za', 'Africa/Johannesburg'],
  ['.co.uk', 'Europe/London'],
  ['.co.nz', 'Pacific/Auckland'],
  ['.co.in', 'Asia/Kolkata'],
  ['.com.au', 'Australia/Sydney'],
  ['.uk',  'Europe/London'],
  ['.za',  'Africa/Johannesburg'],
  ['.ie',  'Europe/Dublin'],
  ['.au',  'Australia/Sydney'],
  ['.nz',  'Pacific/Auckland'],
  ['.ca',  'America/Toronto'],
  ['.in',  'Asia/Kolkata'],
  ['.ae',  'Asia/Dubai'],
  ['.sg',  'Asia/Singapore'],
  ['.ng',  'Africa/Lagos'],
  ['.ke',  'Africa/Nairobi'],
  ['.de',  'Europe/Berlin'],
  ['.fr',  'Europe/Paris'],
  ['.es',  'Europe/Madrid'],
  ['.it',  'Europe/Rome'],
  ['.nl',  'Europe/Amsterdam'],
  // .com / .us / .net / .org are the US estate.
  ['.com', 'America/New_York'],
  ['.us',  'America/New_York'],
  ['.net', 'America/New_York'],
  ['.org', 'America/New_York'],
]

/** The browser's own zone. Not available during SSR, hence the try. */
export function browserZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz && isValidZone(tz) ? tz : null
  } catch {
    return null
  }
}

/**
 * Default zone for a hostname.
 *
 * Falls back to the BROWSER's zone rather than to New York — if we can't tell the
 * country from the domain, the machine in front of us is a better guess than
 * assuming America. New York is only the last resort.
 */
export function defaultZoneForHost(hostname: string, fallbackToBrowser = true): string {
  const host = String(hostname || '').toLowerCase().replace(/:\d+$/, '')

  // localhost / IPs / previews have no meaningful TLD — skip straight to the browser.
  const looksLikeDomain = host.includes('.') && !/^\d+(\.\d+)*$/.test(host)

  if (looksLikeDomain) {
    for (const [suffix, tz] of TLD_DEFAULTS) {
      if (host.endsWith(suffix)) return tz
    }
  }

  return (fallbackToBrowser ? browserZone() : null) ?? 'America/New_York'
}
