// Server-side (Nitro) Sentry error monitoring.
//
// Gated on NUXT_PUBLIC_SENTRY_DSN: without it, @sentry/node is never imported,
// so a build with no DSN pays zero cost and captures nothing. Set the DSN per
// Vercel project to activate. Errors are tagged with the market (`region`,
// derived from the request host) so one shared Sentry project covers all six.
// Free-tier friendly: errors only, no performance traces.

// Host → region, mirroring app/composables/useRegion.ts (kept inline because a
// Nitro plugin can't use the Nuxt-app composable).
const REGION_BY_HOST: Record<string, string> = {
  'passmed.com': 'US', 'www.passmed.com': 'US',
  'passmed.co.za': 'SA', 'www.passmed.co.za': 'SA',
  'passmed.uk': 'UK', 'www.passmed.uk': 'UK',
  'passmed.ca': 'CA', 'www.passmed.ca': 'CA', 'mccqeprep.com': 'CA', 'www.mccqeprep.com': 'CA',
  'passamc.org': 'AU', 'www.passamc.org': 'AU',
  'passmed.ph': 'PH', 'www.passmed.ph': 'PH',
}
const REGION_BY_CODE: Record<string, string> = { us: 'US', za: 'SA', sa: 'SA', uk: 'UK', gb: 'UK', ca: 'CA', au: 'AU', ph: 'PH' }
function regionFromHost (host?: string): string {
  if (process.env.NUXT_PUBLIC_REGION) return process.env.NUXT_PUBLIC_REGION.toUpperCase()
  const h = (host || '').toLowerCase()
  if (REGION_BY_HOST[h]) return REGION_BY_HOST[h]
  const m = h.match(/pm[-_]?frontend-([a-z]{2})(?=[-.])/)
  if (m && REGION_BY_CODE[m[1]]) return REGION_BY_CODE[m[1]]
  return 'US'
}

export default defineNitroPlugin(async (nitroApp) => {
  // Read from runtimeConfig so the DSN baked into nuxt.config (public by design)
  // activates the server side too; an explicit env var still overrides it.
  const config = useRuntimeConfig()
  const dsn = process.env.NUXT_PUBLIC_SENTRY_DSN || (config.public.sentryDsn as string)
  if (!dsn) return

  const Sentry = await import('@sentry/node')
  Sentry.init({
    dsn,
    environment: (config.public.sentryEnv as string) || process.env.VERCEL_ENV || 'production',
    tracesSampleRate: 0,
  })

  nitroApp.hooks.hook('error', (error, ctx) => {
    const event = (ctx as { event?: unknown })?.event as { path?: string } | undefined
    let host: string | undefined
    try { if (event) host = getRequestHost(event as never, { xForwardedHost: true }) } catch { /* noop */ }
    Sentry.captureException(error, {
      tags: { region: regionFromHost(host) },
      extra: { url: event?.path },
    })
  })
})
