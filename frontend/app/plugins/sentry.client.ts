// Client-side Sentry error monitoring.
//
// Fully gated on NUXT_PUBLIC_SENTRY_DSN (runtimeConfig.public.sentryDsn): when
// it's unset the SDK is never even imported, so a build without a DSN pays zero
// runtime cost and captures nothing. Set the DSN per Vercel project to activate.
//
// One shared Sentry project works for all six markets — the current market is
// attached as a `region` tag (from useRegion(), host-derived), so you can filter
// and alert per region. Sampling is tuned for the free tier: errors only, no
// performance traces or session replay.
export default defineNuxtPlugin(async (nuxtApp) => {
  const config = useRuntimeConfig()
  const dsn = config.public.sentryDsn as string
  if (!dsn) return

  const Sentry = await import('@sentry/vue')

  Sentry.init({
    app: nuxtApp.vueApp,
    dsn,
    environment: (config.public.sentryEnv as string) || 'production',
    // Free tier: capture errors, skip performance + replay quota.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Don't send events for benign network blips / cancelled navigations.
    ignoreErrors: [
      'Navigation cancelled',
      'AbortError',
      /Load failed/i,
      /NetworkError/i,
      /Failed to fetch/i,
    ],
  })

  try {
    Sentry.setTag('region', useRegion())
  } catch { /* useRegion needs a request scope; safe to skip if unavailable */ }
})
