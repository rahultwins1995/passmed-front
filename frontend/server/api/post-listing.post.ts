/**
 * POST /api/post-listing — create a Pending-review Airtable record from the "Post a listing"
 * form. Tagged Source = "form:web" so the approval-email Airtable Automation fires on human
 * posts only (not the auto:* ingest rows). Base + Region are decided server-side (per site).
 *
 * runtimeConfig (env): airtableToken, opportunitiesBase, defaultRegion
 */
import { resolveTarget, AIRTABLE, isEmail } from '../utils/opportunities'

const cap = (s: string) => (s || '').charAt(0).toUpperCase() + (s || '').slice(1).toLowerCase()
const clip = (s: any, n: number) => String(s == null ? '' : s).trim().slice(0, n)
const hostOf = (u: string) => { try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '') } catch { return '' } }

// Map a picked country to the canonical Airtable Region value.
const REGION_ALIASES: Record<string, string> = {
  'remote / online': 'Remote / Global', 'remote': 'Remote / Global', 'online': 'Remote / Global', 'uk': 'United Kingdom',
}
const normCountry = (c: string) => { const t = (c || '').trim(); return REGION_ALIASES[t.toLowerCase()] || t }

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig()
  const token = cfg.airtableToken as string
  const target = resolveTarget(event)
  if (!token || !target) throw createError({ statusCode: 500, statusMessage: 'Board not configured for this site' })

  const b = (await readBody(event)) || {}

  // honeypot: real users leave this empty; bots fill every field
  if (clip(b.company_website_hp, 100)) return { ok: true }

  // Anti-spam: verify Cloudflare Turnstile (no-op until NUXT_TURNSTILE_SECRET is set).
  if (!(await verifyTurnstile(b.turnstileToken || '', getRequestIP(event, { xForwardedFor: true })))) {
    throw createError({ statusCode: 400, statusMessage: 'Verification failed. Please try again.' })
  }

  const type = ['course', 'job', 'event'].includes((b.type || '').toLowerCase()) ? b.type.toLowerCase() : 'course'
  const title = clip(b.title, 200)
  const org = clip(b.org, 120)
  const submitter = clip(b.submitterEmail, 150)
  if (!title || !org) throw createError({ statusCode: 400, statusMessage: 'Title and organization are required.' })
  if (!isEmail(submitter)) throw createError({ statusCode: 400, statusMessage: 'A valid confirmation email is required.' })

  // Location + Region come from the country/city pickers (falling back to any free
  // text and the site's default region).
  const country = normCountry(b.country)
  const city = clip(b.city, 80)
  const isRemote = country === 'Remote / Global'
  const namedCity = city && city.toLowerCase() !== 'other' ? city : ''
  let location = clip(b.location, 120)
  if (country) location = isRemote ? (namedCity || 'Online') : (namedCity ? `${namedCity}, ${country}` : country)

  const fields: Record<string, any> = {
    Title: title,
    Category: cap(type),
    Organisation: org,
    Status: 'Pending review',
    Source: 'form:web',
    Format: ['On-site', 'Remote', 'Hybrid'].includes(b.format) ? b.format : 'On-site',
    Location: location,
    Description: clip(b.description, 4000),
    'Enquiries email': isEmail(b.enquiriesEmail) ? clip(b.enquiriesEmail, 150) : '',
    'Source URL': clip(b.link, 500),
    Cost: clip(b.cost, 80),
    Notes: `Submitted via web form by ${submitter}`,
  }
  // Tag Region from the chosen country when this site serves it, else the site default.
  if (country && target.regions.includes(country)) fields.Region = country
  else if (target.region) fields.Region = target.region
  if (type === 'job') {
    fields['Requires CV'] = !!b.requireCV
    fields['Requires cover letter'] = !!b.requireCover
    if (b.rolling) fields['Rolling'] = true
    else if (/^\d{4}-\d{2}-\d{2}$/.test(b.closing || '')) fields['Closing date'] = b.closing
  } else if (clip(b.dates, 200)) {
    fields['Dates'] = clip(b.dates, 200)
  }
  const dom = hostOf(b.website || b.link || '')
  if (dom) fields.Logo = [{ url: `https://www.google.com/s2/favicons?domain=${dom}&sz=128`, filename: dom.replace(/\W+/g, '_') + '.png' }]
  for (const k of Object.keys(fields)) if (fields[k] === '' || fields[k] == null) delete fields[k]

  try {
    await $fetch(AIRTABLE(target.base), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: { records: [{ fields }], typecast: true },
    })
    return { ok: true }
  } catch (e: any) {
    console.error('post-listing error', e?.data || e?.message || e)
    throw createError({ statusCode: 502, statusMessage: 'Could not save the listing. Please try again.' })
  }
})
