// Single source of truth for "which market is this build serving?"
//
// This one codebase deploys to every market (US, SA, UK, CA, AU, PH) as separate
// Vercel projects. The intended signal is NUXT_PUBLIC_REGION, set per project.
// But if a deploy forgets to set it, everything region-derived (currency symbol,
// country selector, support hours, resources, testimonials, exam pricing tiers)
// silently falls back to US — which is exactly the class of bug we kept hitting.
//
// So this helper resolves region from THREE signals, in order:
//   1. NUXT_PUBLIC_REGION (explicit, preferred)
//   2. the request hostname, via REGION_BY_HOST (the live custom domains)
//   3. the Vercel project hostname pattern pm[-_]frontend-<cc> (the .vercel.app
//      URLs the markets are served on until their custom domains go live)
//
// Crucially it uses useRequestURL(), which returns the real request URL during
// SSR (from the incoming Host header) AND on the client (from window.location),
// so the region is identical on server and client — no hydration mismatch, and
// the correct market renders on first paint.

// Live custom-domain → region. Keep in sync with each market's production domain.
export const REGION_BY_HOST: Record<string, string> = {
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

// Per-market Meta Pixel (Dataset) IDs, keyed by region. Resolved at RUNTIME from
// the host (via useRegion) rather than a build env, because NUXT_PUBLIC_REGION is
// not set on the Vercel projects. Public values (visible once the Pixel loads).
export const REGION_META_PIXEL: Record<string, string> = {
  US: '940300118434217',
  UK: '829870455469270',
  CA: '906316117039765',
  AU: '645272340608205',
  SA: '5186478584791987',
  PH: '989847124086843',
}

// facebook-domain-verification tokens per region — injected into <head> at runtime
// (app/plugins/domain-verify.ts) so Meta can verify each domain. AU (passamc.org)
// is already verified, so it has no token here.
export const REGION_FB_VERIFY: Record<string, string> = {
  US: 'rhuvjishdzwvx5drrbse1cgregtzzu',
  UK: '18hela4uxvnrzv20qe9c55iu6spbkc',
  CA: '5jraizduexn7euyp16jgta45ddrue7',
  SA: '44xjyc1fyvsufu6lu9rcu98slspld7',
  PH: '57qyocjchkxmqd58ww0vrvl0cmbguc',
}

// Google Ads conversion tracking. ONE shared Ads account (783-086-3872) serves every
// market, so one tag ID plus one label per event covers all six — no per-region map needed.
// Hardcoded here, and resolved at RUNTIME, for exactly the reason the Pixel IDs are:
// NUXT_PUBLIC_* is not reliably set on the Vercel projects, so an env-only lookup renders
// empty and the conversion never fires. Both values are public (they ship in the page HTML
// the moment the tag fires), so there is nothing secret to protect here.
// Env still wins when set: NUXT_PUBLIC_GOOGLE_ADS_ID / NUXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL.
export const GOOGLE_ADS_ID = 'AW-11113080805'
export const GOOGLE_ADS_PURCHASE_LABEL = 'CI8OCInV5OEcEOXPkLMp'
export const GOOGLE_ADS_BEGIN_CHECKOUT_LABEL = '_ao0CKmXiOIcEOXPkLMp'
export const GOOGLE_ADS_EXAM_VIEW_LABEL = 'oJh-CKCbheIcEOXPkLMp'

// Two-letter code found in the Vercel project host → region. Handles 'za' (SA).
const REGION_BY_CODE: Record<string, string> = {
  us: 'US', za: 'SA', sa: 'SA', uk: 'UK', gb: 'UK', ca: 'CA', au: 'AU', ph: 'PH',
}

// The markets are hosted as Vercel projects named pm-frontend-<cc> (and served on
// pm-frontend-<cc>.vercel.app, pmfrontend-<cc>.vercel.app, or the git branch alias
// pm-frontend-<cc>-git-<branch>-<team>.vercel.app). Until the custom domains go
// live, users hit these URLs — so derive the region from the <cc> in the host.
// Ephemeral per-deploy URLs (pm-frontend-<hash>...) have a non-code slug here and
// simply don't match, falling through to the US default.
function regionFromVercelHost (host: string): string | null {
  const m = host.match(/pm[-_]?frontend-([a-z]{2})(?=[-.])/)
  return m ? (REGION_BY_CODE[m[1]] || null) : null
}

/** The current deployment's region code (US|SA|UK|CA|AU|PH). Defaults to US. */
export function useRegion (): string {
  const envRegion = String(useRuntimeConfig().public.region || '').toUpperCase()
  if (envRegion) return envRegion

  // Fallback: derive from the request hostname (works on server + client).
  try {
    const host = useRequestURL().hostname.toLowerCase()
    if (REGION_BY_HOST[host]) return REGION_BY_HOST[host]
    const fromVercel = regionFromVercelHost(host)
    if (fromVercel) return fromVercel
  } catch { /* useRequestURL unavailable outside a request scope */ }

  return 'US'
}
