// Canonical public origin for the current market.
//
// This is the ONLY origin that should ever appear in a <link rel="canonical">,
// an og:url, or an absolutised asset URL.
//
// Deliberately NOT env-first. NUXT_PUBLIC_SITE_URL is set per Vercel project and
// has been wrong in production: PH, AU and SA all shipped canonicals pointing at
// their own pm-frontend-*.vercel.app origin, which tells Google the real domain
// is a duplicate of the preview deployment. Region already resolves from the
// request host for exactly this class of bug — see the note at the top of
// useRegion.ts ("if a deploy forgets to set it, everything region-derived
// silently falls back to US") — so the canonical origin now follows the same
// signal and a stale env var can no longer poison it.
//
// Keep in sync with REGION_BY_HOST in useRegion.ts and with SITE_URL_BY_HOST in
// server/routes/robots.txt.ts.
export const SITE_URL_BY_REGION: Record<string, string> = {
  US: 'https://www.passmed.com',
  SA: 'https://www.passmed.co.za',
  UK: 'https://www.passmed.uk',
  CA: 'https://www.passmed.ca',
  AU: 'https://www.passamc.org',
  PH: 'https://www.passmed.ph',
}

/**
 * The canonical origin for the market serving this request, without a trailing
 * slash — e.g. 'https://www.passmed.ph'.
 *
 * Resolution order:
 *   1. SITE_URL_BY_REGION[useRegion()] — host-derived, so it is correct on the
 *      live domain, on the old domain being migrated away from (mccqeprep.com
 *      maps to CA), and on the pm-frontend-<cc>.vercel.app preview origin, which
 *      therefore canonicalises to the real domain instead of competing with it.
 *   2. NUXT_PUBLIC_SITE_URL — only if the region is somehow unmapped.
 *
 * useRegion() falls back to 'US', so this never returns an empty string. That
 * matters: the previous env-only lookup returned '' when the var was unset,
 * which emitted a relative <link rel="canonical" href="/pricing"> instead of an
 * absolute URL.
 */
export function useSiteUrl (): string {
  const fromRegion = SITE_URL_BY_REGION[useRegion()]
  if (fromRegion) return fromRegion

  const fromEnv = String(useRuntimeConfig().public.siteUrl || '')
  return fromEnv.replace(/\/$/, '')
}
